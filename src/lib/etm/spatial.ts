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

export function projector(pts: SPoint[]) {
  const lat0 = pts.reduce((a, p) => a + p.lat, 0) / pts.length;
  const lon0 = pts.reduce((a, p) => a + p.lon, 0) / pts.length;
  const k = Math.cos((lat0 * Math.PI) / 180);
  return (lat: number, lon: number) => ({ x: (lon - lon0) * 111.32 * k, y: (lat - lat0) * 110.57 });
}
const toKP = (pts: SPoint[]): KP[] => {
  const p = projector(pts);
  return pts.map((s) => ({ ...p(s.lat, s.lon), v: s.value }));
};
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

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

export function gamma(h: number, m: VModel, { nugget, sill, range }: VParams) {
  if (h === 0) return 0;
  const r = h / range;
  const f = m === "spherical" ? (r >= 1 ? 1 : 1.5 * r - 0.5 * r ** 3) : m === "exponential" ? 1 - Math.exp(-3 * r) : 1 - Math.exp(-3 * r * r);
  return nugget + (sill - nugget) * f;
}

export function empiricalVariogram(pts: SPoint[], nLags = 8) {
  const kp = toKP(pts);
  const pairs: { h: number; g: number }[] = [];
  for (let i = 0; i < kp.length; i++)
    for (let j = i + 1; j < kp.length; j++) pairs.push({ h: dist(kp[i]!, kp[j]!), g: 0.5 * (kp[i]!.v - kp[j]!.v) ** 2 });
  const maxd = Math.max(...pairs.map((p) => p.h), 1e-6);
  const lag = maxd / nLags;
  const bins = Array.from({ length: nLags }, (_, i) => ({ h: (i + 0.5) * lag, g: 0, n: 0 }));
  for (const p of pairs) {
    const b = bins[Math.min(nLags - 1, Math.floor(p.h / lag))]!;
    b.g += p.g;
    b.n++;
  }
  return { bins: bins.filter((b) => b.n > 0).map((b) => ({ h: b.h, g: b.g / b.n, n: b.n })), maxd };
}

export function fitVariogram(pts: SPoint[], m: VModel) {
  const { bins, maxd } = empiricalVariogram(pts);
  const mean = pts.reduce((a, p) => a + p.value, 0) / pts.length;
  const variance = Math.max(pts.reduce((a, p) => a + (p.value - mean) ** 2, 0) / pts.length, 1e-12);
  let best: VParams = { nugget: 0, sill: variance, range: maxd / 2 };
  let bestErr = Infinity;
  for (const nf of [0, 0.05, 0.1, 0.2, 0.3])
    for (const sf of [0.6, 0.8, 1, 1.2, 1.4, 1.7])
      for (let k = 1; k <= 20; k++) {
        const p = { nugget: nf * variance * sf, sill: sf * variance, range: (maxd * k) / 15 };
        const err = bins.reduce((a, b) => a + b.n * (gamma(b.h, m, p) - b.g) ** 2, 0);
        if (err < bestErr) {
          bestErr = err;
          best = p;
        }
      }
  return { params: best, bins };
}

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

function krigeKP(kp: KP[], m: VModel, params: VParams) {
  const n = kp.length;
  const A = Array.from({ length: n + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => {
      if (i === n && j === n) return 0;
      if (i === n || j === n) return 1;
      return gamma(dist(kp[i]!, kp[j]!), m, params) + (i === j ? 1e-10 : 0);
    }),
  );
  const Ai = invert(A);
  return (q: { x: number; y: number }) => {
    const b = kp.map((p) => gamma(dist(p, q), m, params));
    b.push(1);
    let z = 0;
    for (let i = 0; i < n; i++) {
      let w = 0;
      for (let j = 0; j <= n; j++) w += Ai[i]![j]! * b[j]!;
      z += w * kp[i]!.v;
    }
    return z;
  };
}

export function krigingPredictor(pts: SPoint[], m: VModel, params: VParams) {
  const f = krigeKP(toKP(pts), m, params);
  const proj = projector(pts);
  return (lat: number, lon: number) => f(proj(lat, lon));
}

export function crossValidate(pts: SPoint[], m: VModel, params: VParams) {
  const kp = toKP(pts);
  const res = pts.map((p, i) => {
    const others = kp.filter((_, j) => j !== i);
    const pred = krigeKP(others, m, params)(kp[i]!);
    return { station: p.station, observed: p.value, predicted: pred, error: pred - p.value };
  });
  const n = res.length;
  return {
    rows: res,
    mae: res.reduce((a, r) => a + Math.abs(r.error), 0) / n,
    rmse: Math.sqrt(res.reduce((a, r) => a + r.error ** 2, 0) / n),
    bias: res.reduce((a, r) => a + r.error, 0) / n,
  };
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
export function computeGrid(pts: SPoint[], f: (lat: number, lon: number) => number, nx = 80): Grid {
  const bbox = bboxOf(pts);
  const kLat = Math.cos((((bbox.minLat + bbox.maxLat) / 2) * Math.PI) / 180);
  const ny = Math.max(10, Math.round((nx * (bbox.maxLat - bbox.minLat)) / ((bbox.maxLon - bbox.minLon) * kLat)));
  const values: number[] = [];
  for (let j = 0; j < ny; j++) {
    const lat = bbox.maxLat - ((j + 0.5) / ny) * (bbox.maxLat - bbox.minLat);
    for (let i = 0; i < nx; i++) {
      const lon = bbox.minLon + ((i + 0.5) / nx) * (bbox.maxLon - bbox.minLon);
      values.push(f(lat, lon));
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
