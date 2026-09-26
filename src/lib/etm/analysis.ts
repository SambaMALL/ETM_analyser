import Papa from "papaparse";
import { BASE_UNIT, CRUST_BACKGROUND, TOXIC_FACTOR, type Matrix, type Norm } from "./norms";

export const REQUIRED = ["Station", "Latitude", "Longitude", "Date", "Matrice", "Element", "Concentration", "Unite"];

export interface Row {
  station: string;
  lat: number;
  lon: number;
  date: string;
  matrice: Matrix;
  element: string;
  concentration: number;
  unite: string;
}

export interface ParseResult {
  rows: Row[];
  missing: string[];
  dropped: number;
  total: number;
}

const strip = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

const num = (s: string): number | null => {
  const t = s.replace(",", ".").trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

const EL_NAMES: Record<string, string> = {
  plomb: "Pb", lead: "Pb", cadmium: "Cd", chrome: "Cr", chromium: "Cr", cuivre: "Cu", copper: "Cu",
  zinc: "Zn", arsenic: "As", mercure: "Hg", mercury: "Hg", nickel: "Ni", cobalt: "Co",
  manganese: "Mn", vanadium: "V", antimoine: "Sb", antimony: "Sb", selenium: "Se",
};
export function normElement(s: string): string {
  const k = strip(s).replace(/[^a-z]/g, "");
  if (!k) return "";
  if (EL_NAMES[k]) return EL_NAMES[k];
  return k.charAt(0).toUpperCase() + k.slice(1, 2);
}
export function normMatrix(s: string): Matrix | null {
  const k = strip(s);
  if (["eau", "water", "eaux"].includes(k)) return "Eau";
  if (["sol", "soil", "sols", "sediment", "sediments"].includes(k)) return "Sol";
  if (k === "air") return "Air";
  return null;
}

export function parseCSV(text: string): ParseResult {
  const res = Papa.parse<Record<string, string>>(text.trim(), { header: true, skipEmptyLines: true });
  const fields = res.meta.fields ?? [];
  const map: Record<string, string> = {};
  for (const r of REQUIRED) {
    const f = fields.find((x) => strip(x) === strip(r));
    if (f) map[r] = f;
  }
  const missing = REQUIRED.filter((r) => !map[r]);
  if (missing.length) return { rows: [], missing, dropped: 0, total: res.data.length };
  const rows: Row[] = [];
  let dropped = 0;
  for (const d of res.data) {
    const g = (k: string) => (d[map[k] ?? ""] ?? "").toString().trim();
    const lat = num(g("Latitude"));
    const lon = num(g("Longitude"));
    const c = num(g("Concentration"));
    const station = g("Station");
    const element = normElement(g("Element"));
    const matrice = normMatrix(g("Matrice"));
    const unite = g("Unite");
    if (!station || !element || !matrice || lat == null || lon == null || c == null || c < 0 || !unite) {
      dropped++;
      continue;
    }
    rows.push({ station, lat, lon, date: g("Date"), matrice, element, concentration: c, unite });
  }
  return { rows, missing: [], dropped, total: res.data.length };
}

/* ---------- Units ---------- */
const UNITS: Record<string, { dim: string; f: number }> = {
  "mg/l": { dim: "v", f: 1 }, "ug/l": { dim: "v", f: 1e-3 }, "ng/l": { dim: "v", f: 1e-6 }, "g/l": { dim: "v", f: 1e3 },
  "mg/kg": { dim: "m", f: 1 }, "ug/g": { dim: "m", f: 1 }, ppm: { dim: "m", f: 1 }, "g/kg": { dim: "m", f: 1e3 },
  "ug/kg": { dim: "m", f: 1e-3 }, "mg/g": { dim: "m", f: 1e3 },
  "ug/m3": { dim: "a", f: 1 }, "ng/m3": { dim: "a", f: 1e-3 }, "mg/m3": { dim: "a", f: 1e3 },
};
const nu = (u: string) =>
  u.replace(/[µμ]/g, "u").replace(/³/g, "3").replace(/\s/g, "").toLowerCase();
export function convert(v: number, from: string, to: string): number | null {
  const a = UNITS[nu(from)];
  const b = UNITS[nu(to)];
  if (!a || !b || a.dim !== b.dim) return nu(from) === nu(to) ? v : null;
  return (v * a.f) / b.f;
}

/* ---------- Conformity ---------- */
export type Status = "Conforme" | "Dépassement" | "Norme non disponible";
export interface ConfRow extends Row {
  limit: number | null;
  limitUnit: string;
  period: string;
  ratio: number | null;
  status: Status;
}
export function conformity(rows: Row[], norm: Norm | undefined): ConfRow[] {
  return rows.map((r) => {
    const lim = norm?.limits.find((l) => l.element === r.element);
    if (!lim) return { ...r, limit: null, limitUnit: "—", period: "—", ratio: null, status: "Norme non disponible" };
    const c = convert(r.concentration, r.unite, lim.unit);
    if (c == null) return { ...r, limit: lim.limit, limitUnit: lim.unit, period: lim.period, ratio: null, status: "Norme non disponible" };
    const ratio = c / lim.limit;
    return { ...r, limit: lim.limit, limitUnit: lim.unit, period: lim.period, ratio, status: ratio > 1 ? "Dépassement" : "Conforme" };
  });
}

/* ---------- Indices ---------- */
export interface IndexRow {
  station: string;
  lat: number;
  lon: number;
  element: string;
  conc: number;
  ref: number;
  fc: number;
  igeo: number;
  pi: number;
  er: number | null;
  tf: number | null;
}
export interface StationIdx {
  station: string;
  lat: number;
  lon: number;
  n: number;
  pli: number;
  cd: number;
  ri: number;
  nemerow: number;
}

export function defaultRef(el: string, matrix: Matrix, norm?: Norm): number {
  if (matrix === "Sol" && CRUST_BACKGROUND[el]) return CRUST_BACKGROUND[el];
  const lim = norm?.limits.find((l) => l.element === el);
  if (lim) return convert(lim.limit, lim.unit, BASE_UNIT[matrix]) ?? lim.limit;
  return CRUST_BACKGROUND[el] ?? 1;
}

export function stationMeans(rows: Row[], matrix: Matrix) {
  const m = new Map<string, { station: string; lat: number; lon: number; element: string; sum: number; n: number }>();
  for (const r of rows) {
    const k = `${r.station}|${r.element}`;
    const v = convert(r.concentration, r.unite, BASE_UNIT[matrix]) ?? r.concentration;
    const e = m.get(k);
    if (e) {
      e.sum += v;
      e.n++;
    } else m.set(k, { station: r.station, lat: r.lat, lon: r.lon, element: r.element, sum: v, n: 1 });
  }
  return [...m.values()].map((e) => ({ ...e, conc: e.sum / e.n }));
}

export function computeIndices(rows: Row[], matrix: Matrix, refOf: (el: string) => number) {
  const means = stationMeans(rows, matrix);
  const idx: IndexRow[] = means.map((m) => {
    const ref = refOf(m.element);
    const fc = ref > 0 ? m.conc / ref : NaN;
    const tf = TOXIC_FACTOR[m.element] ?? null;
    return {
      station: m.station, lat: m.lat, lon: m.lon, element: m.element, conc: m.conc, ref, fc,
      igeo: Math.log2(m.conc / (1.5 * ref)), pi: fc, er: tf != null ? fc * tf : null, tf,
    };
  });
  const byStation = new Map<string, IndexRow[]>();
  for (const i of idx) byStation.set(i.station, [...(byStation.get(i.station) ?? []), i]);
  const stations: StationIdx[] = [...byStation.entries()].map(([station, list]) => {
    const fcs = list.map((l) => l.fc).filter((x) => Number.isFinite(x) && x > 0);
    const pli = fcs.length ? Math.exp(fcs.reduce((a, b) => a + Math.log(b), 0) / fcs.length) : NaN;
    const cd = fcs.reduce((a, b) => a + b, 0);
    const ri = list.reduce((a, b) => a + (b.er ?? 0), 0);
    const mean = fcs.length ? cd / fcs.length : 0;
    const max = fcs.length ? Math.max(...fcs) : 0;
    return { station, lat: list[0]!.lat, lon: list[0]!.lon, n: list.length, pli, cd, ri, nemerow: Math.sqrt((mean ** 2 + max ** 2) / 2) };
  });
  return { idx, stations };
}

/* ---------- Interpretation ---------- */
export interface Interp {
  label: string;
  level: number; // 0 (good) .. 4 (critical)
}
const band = (v: number, cuts: number[], labels: string[], levels?: number[]): Interp => {
  if (!Number.isFinite(v)) return { label: "—", level: -1 };
  let i = cuts.findIndex((c) => v < c);
  if (i === -1) i = labels.length - 1;
  return { label: labels[i] ?? "—", level: levels ? (levels[i] ?? 4) : Math.min(4, i) };
};
export const interp = {
  fc: (v: number) => band(v, [1, 3, 6], ["Contamination faible", "Contamination modérée", "Contamination considérable", "Contamination très élevée"], [0, 1, 3, 4]),
  igeo: (v: number) =>
    band(v, [0, 1, 2, 3, 4, 5], ["Non pollué", "Non à modérément pollué", "Modérément pollué", "Modérément à fortement pollué", "Fortement pollué", "Fortement à extrêmement pollué", "Extrêmement pollué"], [0, 1, 1, 2, 3, 4, 4]),
  pi: (v: number) => band(v, [1, 2, 3], ["Non pollué", "Pollution faible", "Pollution modérée", "Pollution forte"], [0, 1, 2, 4]),
  er: (v: number) => band(v, [40, 80, 160, 320], ["Risque faible", "Risque modéré", "Risque considérable", "Risque élevé", "Risque très élevé"]),
  pli: (v: number) => band(v, [1, 1.0000001], ["Pas de pollution", "Niveau de base", "Détérioration du site"], [0, 1, 3]),
  cd: (v: number) => band(v, [8, 16, 32], ["Degré faible", "Degré modéré", "Degré considérable", "Degré très élevé"], [0, 1, 3, 4]),
  ri: (v: number) => band(v, [150, 300, 600], ["Risque faible", "Risque modéré", "Risque considérable", "Risque très élevé"], [0, 1, 3, 4]),
  nemerow: (v: number) => band(v, [0.7, 1, 2, 3], ["Propre", "Seuil d'alerte", "Pollution légère", "Pollution modérée", "Pollution forte"]),
};

/* ---------- Formatting & export ---------- */
export const fmt = (v: number | null | undefined, d = 3) => {
  if (v == null || !Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a !== 0 && (a < 0.001 || a >= 1e6)) return v.toExponential(2);
  return Number(v.toFixed(d)).toString();
};

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function downloadCSV(name: string, headers: string[], rows: (string | number | null)[][]) {
  const esc = (v: string | number | null) => {
    const s = v == null ? "" : String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers, ...rows].map((r) => r.map(esc).join(";")).join("\n");
  downloadBlob(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }), name);
}

/* ---------- Sample data ---------- */
export function sampleCSV(): string {
  let seed = 42;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const stations = [
    ["S01-Hann", 14.72, -17.43], ["S02-Thiaroye", 14.75, -17.37], ["S03-Mbao", 14.73, -17.33],
    ["S04-Rufisque", 14.71, -17.27], ["S05-Pikine", 14.76, -17.4], ["S06-Guediawaye", 14.78, -17.39],
    ["S07-Yeumbeul", 14.77, -17.35], ["S08-Keur Massar", 14.78, -17.31], ["S09-Bargny", 14.69, -17.22],
    ["S10-Sangalkam", 14.79, -17.23], ["S11-Malika", 14.8, -17.33], ["S12-Diamniadio", 14.72, -17.18],
  ] as const;
  const cfg: Record<Matrix, { unit: string; els: Record<string, number> }> = {
    Sol: { unit: "mg/kg", els: { Pb: 45, Cd: 0.9, Cr: 70, Cu: 40, Zn: 150, As: 9, Hg: 0.3, Ni: 35, Co: 12 } },
    Eau: { unit: "mg/L", els: { Pb: 0.008, Cd: 0.002, Cr: 0.03, Cu: 0.4, Zn: 0.9, As: 0.007, Hg: 0.0008, Ni: 0.03 } },
    Air: { unit: "µg/m³", els: { Pb: 0.3, Cd: 0.004, As: 0.005, Ni: 0.015 } },
  };
  const lines = [REQUIRED.join(";")];
  for (const [mat, c] of Object.entries(cfg) as [Matrix, (typeof cfg)["Sol"]][]) {
    stations.forEach(([name, lat, lon], si) => {
      const hot = 0.4 + 1.8 * Math.exp(-(((lon + 17.37) / 0.05) ** 2 + ((lat - 14.75) / 0.03) ** 2)) + (si === 8 ? 1.2 : 0);
      for (const date of ["2026-03-15", "2026-07-15"]) {
        for (const [el, base] of Object.entries(c.els)) {
          const v = base * hot * (0.6 + rnd() * 0.9);
          lines.push([name, lat, lon, date, mat, el, Number(v.toPrecision(4)), c.unit].join(";"));
        }
      }
    });
  }
  return lines.join("\n");
}
