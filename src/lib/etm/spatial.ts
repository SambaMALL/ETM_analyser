export interface SPoint {
  station: string;
  lat: number;
  lon: number;
  value: number;
}
interface KP {
  x: number;
  y: number;
  v: number;
}
export type VModel = "spherical" | "exponential" | "gaussian";
export interface VParams {
  nugget: number;
  sill: number;
  range: number;
}
type XY = { x: number; y: number };

/**
 * Plan local en km centré sur les points (degrés → km avec les formules WGS84
 * évaluées à la latitude moyenne). Erreur < 0,1 % pour une zone de moins de ~100 km.
 */
export function projector(pts: SPoint[]) {
  const lat0 = pts.reduce((a, p) => a + p.lat, 0) / pts.length;
  const lon0 = pts.reduce((a, p) => a + p.lon, 0) / pts.length;
  const phi = (lat0 * Math.PI) / 180;
  const kmLat = 111.132954 - 0.559822 * Math.cos(2 * phi) + 0.001175 * Math.cos(4 * phi);
  const kmLon = 111.41284 * Math.cos(phi) - 0.0935 * Math.cos(3 * phi) + 0.000118 * Math.cos(5 * phi);
  return (lat: number, lon: number): XY => ({ x: (lon - lon0) * kmLon, y: (lat - lat0) * kmLat });
}
const toKP = (pts: SPoint[]): KP[] => {
  const p = projector(pts);
  return pts.map((s) => ({ ...p(s.lat, s.lon), v: s.value }));
};
const dist = (a: XY, b: XY) => Math.hypot(a.x - b.x, a.y - b.y);

/** Fusionne les stations quasi confondues (< 1 m) : sinon la matrice de krigeage est singulière. */
export function mergeDuplicates(pts: SPoint[]): SPoint[] {
  const out: { p: SPoint; n: number; names: string[] }[] = [];
  const proj = pts.length ? projector(pts) : null;
  for (const p of pts) {
    const q = proj!(p.lat, p.lon);
    const hit = out.find((o) => dist(proj!(o.p.lat, o.p.lon), q) < 1e-3);
    if (hit) {
      hit.p = { ...hit.p, value: (hit.p.value * hit.n + p.value) / (hit.n + 1) };
      hit.n++;
      hit.names.push(p.station);
    } else out.push({ p, n: 1, names: [p.station] });
  }
  return out.map((o) => (o.n > 1 ? { ...o.p, station: o.names.join(" + ") } : o.p));
}

/* ---------- Validation croisée (leave-one-out) ---------- */
export interface CVRow {
  station: string;
  observed: number;
  predicted: number;
  error: number;
  std?: number;
}
export interface CVResult {
  rows: CVRow[];
  mae: number;
  rmse: number;
  bias: number;
  /** Gain de l'interpolation par rapport à la simple moyenne des autres stations (1 = parfait, ≤ 0 = inutile). */
  skill: number;
  /** Krigeage : moyenne de (erreur/σ)², proche de 1 si la variance de krigeage est bien calibrée. */
  msdr?: number;
}
function summarizeCV(rows: CVRow[], pts: SPoint[]): CVResult {
  const n = rows.length;
  const total = pts.reduce((a, p) => a + p.value, 0);
  const mseMean = pts.reduce((a, p) => a + (p.value - (total - p.value) / (n - 1)) ** 2, 0) / n;
  const mse = rows.reduce((a, r) => a + r.error ** 2, 0) / n;
  const withStd = rows.filter((r) => r.std != null && r.std > 1e-9);
  const res: CVResult = {
    rows,
    mae: rows.reduce((a, r) => a + Math.abs(r.error), 0) / n,
    rmse: Math.sqrt(mse),
    bias: rows.reduce((a, r) => a + r.error, 0) / n,
    skill: mseMean > 0 ? 1 - mse / mseMean : 0,
  };
  if (withStd.length) res.msdr = withStd.reduce((a, r) => a + (r.error / r.std!) ** 2, 0) / withStd.length;
  return res;
}

/* ---------- IDW ---------- */
export function idwPredictor(pts: SPoint[], power: number) {
  const kp = toKP(pts);
  const proj = projector(pts);
  return (lat: number, lon: number) => {
    const q = proj(lat, lon);
    let num = 0;
    let den = 0;
    for (const p of kp) {
      const d = dist(p, q);
      if (d < 1e-9) return p.v;
      const w = 1 / d ** power;
      num += w * p.v;
      den += w;
    }
    return num / den;
  };
}
export function idwCrossValidate(pts: SPoint[], power: number): CVResult {
  const rows = pts.map((p, i) => {
    const pred = idwPredictor(pts.filter((_, j) => j !== i), power)(p.lat, p.lon);
    return { station: p.station, observed: p.value, predicted: pred, error: pred - p.value };
  });
  return summarizeCV(rows, pts);
}
/** Puissance (0,5 → 5 par pas de 0,5, comme le curseur) qui minimise le RMSE de validation croisée. */
export function bestIdwPower(pts: SPoint[]) {
  let best = { power: 2, rmse: Infinity };
  for (let k = 1; k <= 10; k++) {
    const rmse = idwCrossValidate(pts, k / 2).rmse;
    if (rmse < best.rmse - 1e-12) best = { power: k / 2, rmse };
  }
  return best;
}

/* ---------- Variogramme ---------- */
export function gamma(h: number, m: VModel, { nugget, sill, range }: VParams) {
  if (h === 0) return 0;
  const r = h / range;
  const f = m === "spherical" ? (r >= 1 ? 1 : 1.5 * r - 0.5 * r ** 3) : m === "exponential" ? 1 - Math.exp(-3 * r) : 1 - Math.exp(-3 * r * r);
  return nugget + (sill - nugget) * f;
}

/**
 * Variogramme expérimental. Les paires sont limitées à la moitié de la plus grande distance
 * (au-delà, très peu de paires et des valeurs peu fiables) ; h est la distance moyenne réelle du lag.
 */
export function empiricalVariogram(pts: SPoint[], nLags?: number) {
  const kp = toKP(pts);
  const pairs: { h: number; g: number }[] = [];
  for (let i = 0; i < kp.length; i++)
    for (let j = i + 1; j < kp.length; j++) pairs.push({ h: dist(kp[i]!, kp[j]!), g: 0.5 * (kp[i]!.v - kp[j]!.v) ** 2 });
  const maxd = Math.max(...pairs.map((p) => p.h), 1e-6);
  const cutoff = maxd / 2;
  const inside = pairs.filter((p) => p.h <= cutoff);
  const L = nLags ?? Math.max(4, Math.min(12, Math.round(Math.sqrt(inside.length))));
  const lag = cutoff / L;
  const bins = Array.from({ length: L }, () => ({ hs: 0, g: 0, n: 0 }));
  for (const p of inside) {
    const b = bins[Math.min(L - 1, Math.floor(p.h / lag))]!;
    b.hs += p.h;
    b.g += p.g;
    b.n++;
  }
  return { bins: bins.filter((b) => b.n > 0).map((b) => ({ h: b.hs / b.n, g: b.g / b.n, n: b.n })), maxd, cutoff };
}

export type Structure = "forte" | "modérée" | "faible" | "aucune" | "indéterminée";

/**
 * Ajustement par moindres carrés pondérés (poids de Cressie : n / γ²) sur une grille
 * pépite × palier × portée. La portée est cherchée de maxd/40 à maxd (échelle logarithmique).
 */
export function fitVariogram(pts: SPoint[], m: VModel) {
  const { bins, maxd, cutoff } = empiricalVariogram(pts);
  const mean = pts.reduce((a, p) => a + p.value, 0) / pts.length;
  const variance = Math.max(pts.reduce((a, p) => a + (p.value - mean) ** 2, 0) / pts.length, 1e-12);
  const rMin = maxd / 40;
  let best: VParams = { nugget: 0, sill: variance, range: maxd / 2 };
  if (bins.length < 2) return { params: best, bins, maxd, cutoff, structure: "indéterminée" as Structure, nugRatio: 0 };
  let bestErr = Infinity;
  for (let a = 0; a <= 12; a++) {
    const nf = a / 12;
    for (const sf of [0.5, 0.65, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2]) {
      const sill = sf * variance;
      // Gaussien : pépite minimale pour garder une matrice de krigeage bien conditionnée
      const nugget = m === "gaussian" ? Math.max(nf * sill, 0.01 * sill) : nf * sill;
      for (let k = 0; k < 40; k++) {
        const range = rMin * (maxd / rMin) ** (k / 39);
        const p = { nugget, sill, range };
        const err = bins.reduce((acc, b) => {
          const gm = Math.max(gamma(b.h, m, p), 1e-9 * variance);
          return acc + b.n * ((gm - b.g) / gm) ** 2;
        }, 0);
        if (err < bestErr) {
          bestErr = err;
          best = p;
        }
      }
    }
  }
  const nugRatio = best.nugget / best.sill;
  // Classes de Cambardella : < 25 % forte, 25–75 % modérée, > 75 % faible
  const structure: Structure = best.range <= rMin * 1.001 || nugRatio >= 0.9 ? "aucune" : nugRatio < 0.25 ? "forte" : nugRatio < 0.75 ? "modérée" : "faible";
  return { params: best, bins, maxd, cutoff, structure, nugRatio };
}

/* ---------- Krigeage ordinaire ---------- */
function invert(A: number[][]): number[][] {
  const n = A.length;
  const M: number[][] = A.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[piv]![c]!)) piv = r;
    [M[c], M[piv]] = [M[piv]!, M[c]!];
    const Mc = M[c]!;
    const d = Mc[c] || 1e-12;
    for (let j = 0; j < 2 * n; j++) Mc[j] = Mc[j]! / d;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const Mr = M[r]!;
      const f = Mr[c]!;
      if (f) for (let j = 0; j < 2 * n; j++) Mr[j] = Mr[j]! - f * Mc[j]!;
    }
  }
  return M.map((r) => r.slice(n));
}

/** Retourne la prédiction z et la variance de krigeage σ² = Σ λᵢ γ(hᵢ₀) + μ. */
function krigeKP(kp: KP[], m: VModel, params: VParams) {
  const n = kp.length;
  const jitter = 1e-9 * params.sill;
  const A = Array.from({ length: n + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => {
      if (i === n && j === n) return 0;
      if (i === n || j === n) return 1;
      return gamma(dist(kp[i]!, kp[j]!), m, params) + (i === j ? jitter : 0);
    }),
  );
  const Ai = invert(A);
  return (q: XY) => {
    const b = kp.map((p) => gamma(dist(p, q), m, params));
    b.push(1);
    let z = 0;
    let variance = 0;
    for (let i = 0; i <= n; i++) {
      let w = 0;
      for (let j = 0; j <= n; j++) w += Ai[i]![j]! * b[j]!;
      if (i < n) z += w * kp[i]!.v;
      variance += w * b[i]!;
    }
    return { z, variance: Math.max(0, variance) };
  };
}

export function krigingPredictor(pts: SPoint[], m: VModel, params: VParams) {
  const f = krigeKP(toKP(pts), m, params);
  const proj = projector(pts);
  return (lat: number, lon: number) => f(proj(lat, lon)).z;
}
/** Écart-type de krigeage (incertitude de la prédiction), dans l'unité de la variable. */
export function krigingStdPredictor(pts: SPoint[], m: VModel, params: VParams) {
  const f = krigeKP(toKP(pts), m, params);
  const proj = projector(pts);
  return (lat: number, lon: number) => Math.sqrt(f(proj(lat, lon)).variance);
}

export function crossValidate(pts: SPoint[], m: VModel, params: VParams): CVResult {
  const kp = toKP(pts);
  const rows = pts.map((p, i) => {
    const r = krigeKP(kp.filter((_, j) => j !== i), m, params)(kp[i]!);
    return { station: p.station, observed: p.value, predicted: r.z, error: r.z - p.value, std: Math.sqrt(r.variance) };
  });
  return summarizeCV(rows, pts);
}

export interface Grid {
  bbox: { minLat: number; maxLat: number; minLon: number; maxLon: number };
  nx: number;
  ny: number;
  values: number[];
  min: number;
  max: number;
  mean: number;
}
export function bboxOf(pts: SPoint[], pad = 0.12) {
  let minLat = Math.min(...pts.map((p) => p.lat));
  let maxLat = Math.max(...pts.map((p) => p.lat));
  let minLon = Math.min(...pts.map((p) => p.lon));
  let maxLon = Math.max(...pts.map((p) => p.lon));
  const dl = Math.max(maxLat - minLat, 0.01) * pad;
  const dn = Math.max(maxLon - minLon, 0.01) * pad;
  minLat -= dl; maxLat += dl; minLon -= dn; maxLon += dn;
  return { minLat, maxLat, minLon, maxLon };
}

/* ---------- Emprise de validité (enveloppe convexe + marge) ---------- */
const cross = (o: XY, a: XY, b: XY) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
function convexHull(P: XY[]): XY[] {
  const s = [...P].sort((a, b) => a.x - b.x || a.y - b.y);
  if (s.length < 3) return s;
  const lower: XY[] = [];
  for (const p of s) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: XY[] = [];
  for (const p of [...s].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}
function distToSegment(q: XY, a: XY, b: XY) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / l2)) : 0;
  return Math.hypot(q.x - (a.x + t * dx), q.y - (a.y + t * dy));
}
/**
 * Vrai si (lat, lon) est dans l'enveloppe convexe des stations, ou à moins de
 * 0,75 × (distance moyenne au plus proche voisin) de celle-ci : au-delà on extrapole trop.
 */
function validityMask(pts: SPoint[]) {
  const proj = projector(pts);
  const P = pts.map((p) => proj(p.lat, p.lon));
  const nn = P.map((a, i) => Math.min(...P.filter((_, j) => j !== i).map((b) => dist(a, b))));
  const buffer = Math.max(0.5, 0.75 * (nn.reduce((x, y) => x + y, 0) / nn.length || 1));
  const hull = convexHull(P);
  return (lat: number, lon: number) => {
    const q = proj(lat, lon);
    if (hull.length >= 3 && hull.every((a, i) => cross(a, hull[(i + 1) % hull.length]!, q) >= 0)) return true;
    let d = Infinity;
    for (let i = 0; i < hull.length; i++) d = Math.min(d, distToSegment(q, hull[i]!, hull[(i + 1) % hull.length]!));
    return d <= buffer;
  };
}

/**
 * Évalue f sur une grille régulière. Les cellules hors de l'emprise des stations valent NaN
 * (non colorées) ; `floor` borne les valeurs par le bas (ex. 0 pour une concentration).
 */
export function computeGrid(pts: SPoint[], f: (lat: number, lon: number) => number, nx = 80, opts: { mask?: boolean; floor?: number } = {}): Grid {
  const bbox = bboxOf(pts);
  const kLat = Math.cos((((bbox.minLat + bbox.maxLat) / 2) * Math.PI) / 180);
  const ny = Math.max(10, Math.round((nx * (bbox.maxLat - bbox.minLat)) / ((bbox.maxLon - bbox.minLon) * kLat)));
  const inside = opts.mask === false ? () => true : validityMask(pts);
  const values: number[] = [];
  for (let j = 0; j < ny; j++) {
    const lat = bbox.maxLat - ((j + 0.5) / ny) * (bbox.maxLat - bbox.minLat);
    for (let i = 0; i < nx; i++) {
      const lon = bbox.minLon + ((i + 0.5) / nx) * (bbox.maxLon - bbox.minLon);
      let v = inside(lat, lon) ? f(lat, lon) : NaN;
      if (opts.floor != null && Number.isFinite(v)) v = Math.max(opts.floor, v);
      values.push(v);
    }
  }
  const fin = values.filter(Number.isFinite);
  return { bbox, nx, ny, values, min: Math.min(...fin), max: Math.max(...fin), mean: fin.reduce((a, b) => a + b, 0) / fin.length };
}

const STOPS: [number, number, number][] = [
  [22, 78, 140], [31, 138, 160], [46, 170, 120], [180, 200, 80], [240, 170, 50], [220, 70, 45],
];
export function colorAt(t: number): [number, number, number] {
  const x = Math.max(0, Math.min(1, t)) * (STOPS.length - 1);
  const i = Math.min(STOPS.length - 2, Math.floor(x));
  const f = x - i;
  return STOPS[i]!.map((c, k) => Math.round(c + (STOPS[i + 1]![k]! - c) * f)) as [number, number, number];
}
export const cssColor = (t: number) => `rgb(${colorAt(t).join(",")})`;
