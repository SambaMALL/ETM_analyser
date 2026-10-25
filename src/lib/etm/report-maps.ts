import { bboxOf, colorAt, cssColor, gamma, type fitVariogram, type Grid, type SPoint, type VModel } from "./spatial";
import { fmt } from "./analysis";

/** Un jeu de données à cartographier dans le rapport (un élément, ou une variable par station). */
export interface MapSet {
  title: string;
  label: string;
  unit?: string | undefined;
  points: SPoint[];
  /** Limite réglementaire (même unité que les valeurs) : les stations qui la dépassent sont cerclées de rouge. */
  limit?: number | null | undefined;
  limitLabel?: string | undefined;
  /** Borne inférieure des valeurs interpolées (0 pour une concentration). */
  floor?: number | undefined;
}
export interface MapOptions {
  stations: boolean;
  idw: boolean;
  krig: boolean;
  std: boolean;
  variogram: boolean;
  model: VModel;
}
export interface Figure {
  data: Uint8Array;
  width: number;
  height: number;
  basemap?: boolean;
}

const CLASSES = 8;
const RED = "#d93a2b";
const W = 1100;

function pngBytes(c: HTMLCanvasElement): Uint8Array {
  const b = atob(c.toDataURL("image/png").split(",")[1] ?? "");
  return Uint8Array.from(b, (ch) => ch.charCodeAt(0));
}
/** Projection Web Mercator normalisée (0–1), la même que celle des tuiles de fond de carte. */
const merc = (lat: number, lon: number) => {
  const s = Math.sin((lat * Math.PI) / 180);
  return { x: (lon + 180) / 360, y: 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI) };
};
function loadTile(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    const timer = setTimeout(() => resolve(null), 8000);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    img.src = url;
  });
}
function niceStep(range: number, n = 5) {
  const raw = Math.max(range, 1e-12) / n;
  const p = 10 ** Math.floor(Math.log10(raw));
  const f = raw / p;
  return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p;
}

/**
 * Carte statique : fond CARTO (si le réseau le permet), surface interpolée, limites de classes,
 * stations, échelle, nord et légende. Un échec de chargement des tuiles n'empêche pas la figure.
 */
export async function renderMapPng(o: {
  points: SPoint[];
  grid?: Grid | null | undefined;
  label: string;
  limit?: number | null | undefined;
  neutral?: boolean | undefined;
}): Promise<Figure> {
  const bb = o.grid?.bbox ?? bboxOf(o.points, 0.15);
  const tl = merc(bb.maxLat, bb.minLon);
  const br = merc(bb.minLat, bb.maxLon);
  const wx = br.x - tl.x;
  const wy = br.y - tl.y;
  const scale = W / wx;
  const MH = Math.round(wy * scale);
  const LEG = 84;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = MH + LEG;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, MH + LEG);
  const px = (lat: number, lon: number) => {
    const m = merc(lat, lon);
    return { x: (m.x - tl.x) * scale, y: (m.y - tl.y) * scale };
  };

  // Valeurs min/max de l'échelle de couleur (comme à l'écran)
  const vals = o.neutral ? [] : o.points.map((p) => p.value).filter(Number.isFinite);
  const min = o.grid ? Math.min(o.grid.min, ...vals) : Math.min(...vals);
  const max = o.grid ? Math.max(o.grid.max, ...vals) : Math.max(...vals);
  const t = (v: number) => (max > min ? (v - min) / (max - min) : 0.5);
  const exceeds = (v: number) => !o.neutral && o.limit != null && Number.isFinite(o.limit) && v > o.limit;

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, MH);
  ctx.clip();
  ctx.fillStyle = "#e8eef5";
  ctx.fillRect(0, 0, W, MH);

  // Fond de carte
  let z = Math.max(0, Math.min(17, Math.round(Math.log2(W / (wx * 256)))));
  const range = (zz: number) => {
    const n = 2 ** zz;
    return { n, x0: Math.floor(tl.x * n), x1: Math.floor(br.x * n), y0: Math.floor(tl.y * n), y1: Math.floor(br.y * n) };
  };
  while (z > 0) {
    const r = range(z);
    if ((r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1) <= 30) break;
    z--;
  }
  const r = range(z);
  const jobs: Promise<void>[] = [];
  let tilesOk = 0;
  for (let ty = r.y0; ty <= r.y1; ty++)
    for (let tx = r.x0; tx <= r.x1; tx++) {
      if (tx < 0 || ty < 0 || tx >= r.n || ty >= r.n) continue;
      const url = `https://${"abcd"[(tx + ty) % 4]}.basemaps.cartocdn.com/light_all/${z}/${tx}/${ty}.png`;
      jobs.push(
        loadTile(url).then((img) => {
          if (!img) return;
          tilesOk++;
          const x = (tx / r.n - tl.x) * scale;
          const y = (ty / r.n - tl.y) * scale;
          const s = scale / r.n;
          ctx.drawImage(img, x, y, s + 0.6, s + 0.6);
        }),
      );
    }
  await Promise.all(jobs);
  const basemap = tilesOk > 0;

  // Surface interpolée + limites de classes
  if (o.grid) {
    const g = o.grid;
    const off = document.createElement("canvas");
    off.width = g.nx;
    off.height = g.ny;
    const octx = off.getContext("2d")!;
    const im = octx.createImageData(g.nx, g.ny);
    g.values.forEach((v, i) => {
      if (!Number.isFinite(v)) return;
      const cls = Math.min(CLASSES - 1, Math.floor(t(v) * CLASSES));
      const [rr, gg, bb2] = colorAt((cls + 0.5) / CLASSES);
      im.data.set([rr, gg, bb2, 185], i * 4);
    });
    octx.putImageData(im, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(off, 0, 0, W, MH);

    const cls = g.values.map((v) => (Number.isFinite(v) ? Math.min(CLASSES - 1, Math.floor(t(v) * CLASSES)) : -1));
    const cw = W / g.nx;
    const ch = MH / g.ny;
    ctx.strokeStyle = "rgba(20,32,50,0.4)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let j = 0; j < g.ny; j++)
      for (let i = 0; i < g.nx; i++) {
        const k = j * g.nx + i;
        const a = cls[k]!;
        if (a < 0) continue;
        const right = i < g.nx - 1 ? cls[k + 1]! : a;
        const down = j < g.ny - 1 ? cls[k + g.nx]! : a;
        if (right >= 0 && right !== a) {
          ctx.moveTo((i + 1) * cw, j * ch);
          ctx.lineTo((i + 1) * cw, (j + 1) * ch);
        }
        if (down >= 0 && down !== a) {
          ctx.moveTo(i * cw, (j + 1) * ch);
          ctx.lineTo((i + 1) * cw, (j + 1) * ch);
        }
      }
    ctx.stroke();
  }

  // Stations
  ctx.font = "bold 15px Arial";
  for (const p of o.points) {
    const { x, y } = px(p.lat, p.lon);
    if (exceeds(p.value)) {
      ctx.beginPath();
      ctx.arc(x, y, 16, 0, Math.PI * 2);
      ctx.strokeStyle = RED;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, Math.PI * 2);
    ctx.fillStyle = o.neutral ? "#ffffff" : cssColor(t(p.value));
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = o.neutral ? "#142032" : "#ffffff";
    ctx.stroke();
    ctx.lineJoin = "round";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(255,255,255,0.92)";
    ctx.strokeText(p.station, x + 15, y + 5);
    ctx.fillStyle = "#142032";
    ctx.fillText(p.station, x + 15, y + 5);
  }

  // Échelle graphique
  const kmPerPx = ((bb.maxLon - bb.minLon) * 111.32 * Math.cos((((bb.minLat + bb.maxLat) / 2) * Math.PI) / 180)) / W;
  const target = kmPerPx * W * 0.22;
  const km = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500].filter((v) => v <= target).pop() ?? 0.1;
  const bw = km / kmPerPx;
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillRect(14, MH - 52, bw + 40, 40);
  ctx.fillStyle = "#142032";
  ctx.fillRect(28, MH - 28, bw, 4);
  ctx.fillRect(28, MH - 34, 2, 10);
  ctx.fillRect(28 + bw - 2, MH - 34, 2, 10);
  ctx.font = "13px Arial";
  ctx.fillText(`${km} km`, 28, MH - 38);

  // Nord
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillRect(W - 54, 14, 40, 58);
  ctx.fillStyle = "#142032";
  ctx.beginPath();
  ctx.moveTo(W - 34, 22);
  ctx.lineTo(W - 44, 50);
  ctx.lineTo(W - 34, 44);
  ctx.lineTo(W - 24, 50);
  ctx.closePath();
  ctx.fill();
  ctx.font = "bold 15px Arial";
  ctx.textAlign = "center";
  ctx.fillText("N", W - 34, 66);
  ctx.textAlign = "left";

  if (basemap) {
    ctx.font = "11px Arial";
    const txt = "© OpenStreetMap © CARTO";
    const tw = ctx.measureText(txt).width;
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.fillRect(W - tw - 14, MH - 20, tw + 12, 18);
    ctx.fillStyle = "#334155";
    ctx.fillText(txt, W - tw - 8, MH - 7);
  }
  ctx.restore();
  ctx.strokeStyle = "#94a3b8";
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, W - 1, MH - 1);

  // Légende
  ctx.font = "14px Arial";
  const minTxt = fmt(min, 3);
  const maxTxt = fmt(max, 3);
  const x0 = 24 + ctx.measureText(minTxt).width + 12;
  const x1 = W - 24 - ctx.measureText(maxTxt).width - 12;
  const by = MH + 20;
  const grad = ctx.createLinearGradient(x0, 0, x1, 0);
  for (let i = 0; i <= 10; i++) grad.addColorStop(i / 10, cssColor(i / 10));
  ctx.fillStyle = grad;
  ctx.fillRect(x0, by, x1 - x0, 16);
  ctx.fillStyle = "#142032";
  ctx.fillText(minTxt, 24, by + 13);
  ctx.textAlign = "right";
  ctx.fillText(maxTxt, W - 24, by + 13);
  ctx.textAlign = "left";
  if (o.limit != null && !o.neutral && o.limit >= min && o.limit <= max) {
    const lx = x0 + t(o.limit) * (x1 - x0);
    ctx.fillRect(lx - 1, by - 5, 3, 26);
    ctx.font = "12px Arial";
    ctx.textAlign = "center";
    ctx.fillText(`norme ${fmt(o.limit, 3)}`, lx, by + 36);
    ctx.textAlign = "left";
  }
  ctx.font = "bold 14px Arial";
  ctx.fillText(o.label, 24, MH + 72);
  if (o.limit != null && !o.neutral) {
    ctx.beginPath();
    ctx.arc(W - 250, MH + 67, 6, 0, Math.PI * 2);
    ctx.strokeStyle = RED;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.font = "13px Arial";
    ctx.fillStyle = "#142032";
    ctx.fillText("Dépassement de la norme", W - 238, MH + 72);
  }
  return { data: pngBytes(c), width: c.width, height: c.height, basemap };
}

/** Variogramme : semi-variances observées (point = distance moyenne du lag) et modèle ajusté. */
export function renderVariogramPng(fit: ReturnType<typeof fitVariogram>, model: VModel, modelLabel: string): Figure {
  const cw = 900;
  const chh = 470;
  const c = document.createElement("canvas");
  c.width = cw;
  c.height = chh;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, cw, chh);
  const L = 78, R = 24, T = 56, B = 62;
  const xmax = fit.cutoff;
  const ymax = Math.max(fit.params.sill * 1.15, ...fit.bins.map((b) => b.g * 1.12), 1e-9);
  const X = (h: number) => L + (h / xmax) * (cw - L - R);
  const Y = (g: number) => chh - B - (g / ymax) * (chh - T - B);

  ctx.fillStyle = "#1e293b";
  ctx.font = "bold 18px Arial";
  ctx.fillText(`Variogramme — modèle ${modelLabel}`, L, 30);

  ctx.font = "12px Arial";
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 1;
  const sx = niceStep(xmax);
  for (let v = 0; v <= xmax + 1e-9; v += sx) {
    ctx.beginPath(); ctx.moveTo(X(v), T); ctx.lineTo(X(v), chh - B); ctx.stroke();
    ctx.fillStyle = "#334155"; ctx.textAlign = "center"; ctx.fillText(fmt(v, 1), X(v), chh - B + 18);
  }
  const sy = niceStep(ymax);
  for (let v = 0; v <= ymax + 1e-9; v += sy) {
    ctx.beginPath(); ctx.moveTo(L, Y(v)); ctx.lineTo(cw - R, Y(v)); ctx.stroke();
    ctx.fillStyle = "#334155"; ctx.textAlign = "right"; ctx.fillText(fmt(v, 2), L - 8, Y(v) + 4);
  }
  ctx.textAlign = "left";
  ctx.strokeStyle = "#475569";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(L, T, cw - L - R, chh - T - B);

  // Palier et portée
  ctx.setLineDash([6, 5]);
  ctx.strokeStyle = "#94a3b8";
  ctx.beginPath(); ctx.moveTo(L, Y(fit.params.sill)); ctx.lineTo(cw - R, Y(fit.params.sill)); ctx.stroke();
  ctx.fillStyle = "#64748b"; ctx.font = "12px Arial";
  ctx.fillText(`palier ${fmt(fit.params.sill, 2)}`, L + 8, Y(fit.params.sill) - 6);
  if (fit.params.range <= xmax) {
    ctx.beginPath(); ctx.moveTo(X(fit.params.range), T); ctx.lineTo(X(fit.params.range), chh - B); ctx.stroke();
    ctx.fillText(`portée ${fmt(fit.params.range, 1)} km`, X(fit.params.range) + 6, T + 16);
  }
  ctx.setLineDash([]);

  // Modèle
  ctx.strokeStyle = "#1f3a8a";
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 0; i <= 120; i++) {
    const h = Math.max((xmax * i) / 120, xmax * 1e-4);
    const x = X(h);
    const y = Y(gamma(h, model, fit.params));
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Points expérimentaux
  ctx.font = "11px Arial";
  for (const b of fit.bins) {
    ctx.beginPath();
    ctx.arc(X(b.h), Y(b.g), 6, 0, Math.PI * 2);
    ctx.fillStyle = "#d97706";
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = "#64748b";
    ctx.textAlign = "center";
    ctx.fillText(`n=${b.n}`, X(b.h), Y(b.g) - 11);
  }
  ctx.textAlign = "center";
  ctx.fillStyle = "#1e293b";
  ctx.font = "13px Arial";
  ctx.fillText("Distance h (km)", (L + cw - R) / 2, chh - 16);
  ctx.save();
  ctx.translate(20, (T + chh - B) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("Semi-variance γ(h)", 0, 0);
  ctx.restore();

  // Légende
  ctx.textAlign = "left";
  ctx.font = "12px Arial";
  const lx = cw - R - 250;
  ctx.fillStyle = "#d97706"; ctx.beginPath(); ctx.arc(lx, 28, 5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#334155"; ctx.fillText("Empirique (n = paires)", lx + 10, 32);
  ctx.strokeStyle = "#1f3a8a"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(lx + 150, 28); ctx.lineTo(lx + 175, 28); ctx.stroke();
  ctx.fillStyle = "#334155"; ctx.fillText("Modèle", lx + 182, 32);
  return { data: pngBytes(c), width: cw, height: chh };
}
