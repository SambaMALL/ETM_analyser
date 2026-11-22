import {
  AlignmentType, BorderStyle, Document, Footer, Header, HeadingLevel, HeightRule, ImageRun, NumberFormat, Packer, PageNumber, Paragraph,
  LineRuleType, SectionType, ShadingType, SimpleField, Table, TableCell, TableLayoutType, TableOfContents, TableRow, TabStopType, TextRun, VerticalAlign, WidthType,
} from "docx";
import { downloadBlob, fmt as fmtDot, interp, type ConfRow, type IndexRow, type Row, type StationIdx } from "./analysis";
import { REFERENCES } from "./references";
import { bestIdwPower, computeGrid, crossValidate, fitVariogram, idwCrossValidate, idwPredictor, krigingPredictor, krigingStdPredictor, mergeDuplicates, type CVResult, type VModel } from "./spatial";
import { interpretConformity, interpretIndices, interpretLimits, interpretSpatial, interpretSynthesis, type Item } from "./interpretation";
import { renderMapPng, renderVariogramPng, type Figure, type MapOptions, type MapSet } from "./report-maps";

/* ---------- Charte graphique du rapport ---------- */
const FONT = "Calibri";
const C = {
  primary: "26286B", accent: "4F7BD9", accentDark: "2F4FA8", light: "EEF1FB", zebra: "F6F8FD", line: "D6DCF2", callout: "F3F6FF",
  text: "1E293B", muted: "64748B", caption: "334155", red: "D93A2B", redLight: "FDECEA", orange: "E08A00", green: "1F8A62",
};
/** Nombres au format français (virgule décimale). */
const fmt = (v: number | null | undefined, d?: number) => fmtDot(v, d).replace(".", ",");
/** Nombre à décimales fixes (virgule française) pour des colonnes alignées. */
const fx = (v: number | null | undefined, d: number) => (v == null || !Number.isFinite(v) ? "—" : v.toFixed(d).replace(".", ","));
const W = 9638; // largeur utile (A4, marges 2 cm)
type Block = Paragraph | Table | TableOfContents;
type Cell = string | number | null;

const run = (text: string, o: { bold?: boolean; italics?: boolean; size?: number; color?: string; spacing?: number } = {}) =>
  new TextRun({ text, font: FONT, size: o.size ?? 21, color: o.color ?? C.text, ...(o.bold ? { bold: true } : {}), ...(o.italics ? { italics: true } : {}), ...(o.spacing ? { characterSpacing: o.spacing } : {}) });
const P = (t: string) => new Paragraph({ spacing: { after: 120 }, children: [run(t)] });
const H1 = (t: string, pageBreak = false) => new Paragraph({ heading: HeadingLevel.HEADING_1, ...(pageBreak ? { pageBreakBefore: true } : {}), children: [new TextRun(t)] });
const H2 = (t: string) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(t)] });
const NO = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } as const;
const NOB = { top: NO, bottom: NO, left: NO, right: NO } as const;
const line = (c: string, s = 4) => ({ style: BorderStyle.SINGLE, size: s, color: c }) as const;

/* ---------- Légendes numérotées (champs SEQ → listes des figures / tableaux) ---------- */
class Ctx {
  fig = 0;
  tab = 0;
  /** Légende courte (reprise dans la liste des figures) + note explicative facultative sous la figure. */
  figure(text: string, note?: string): Paragraph[] {
    this.fig++;
    const cap = this.caption("Figure", this.fig, text, false, note ? 10 : 220);
    return note ? [cap, new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 220 }, children: [run(note, { size: 16, italics: true, color: C.muted })] })] : [cap];
  }
  table(text: string) {
    this.tab++;
    return this.caption("Tableau", this.tab, text, true, 80);
  }
  private caption(kind: string, n: number, text: string, above: boolean, after: number) {
    return new Paragraph({
      style: "Caption",
      keepNext: above,
      alignment: above ? AlignmentType.LEFT : AlignmentType.CENTER,
      spacing: { before: above ? 200 : 60, after },
      children: [run(`${kind} `, { bold: true, size: 18, color: C.primary }), new SimpleField(`SEQ ${kind} \\* ARABIC`, String(n)), run(` — ${text}`, { size: 18, color: C.caption })],
    });
  }
}

/* ---------- Tableaux ---------- */
const isNum = (v: Cell) => v == null || v === "—" || /^[-+]?\d[\d\s.,]*(e[-+]?\d+)?\s*%?$/i.test(String(v).trim());
function widthsFor(headers: string[], rows: Cell[][]): number[] {
  const sample = rows.slice(0, 60);
  const w = headers.map((h, j) => Math.min(Math.max(Math.max(h.length * 0.85, ...sample.map((r) => String(r[j] ?? "").length)), 5), 26));
  const tot = w.reduce((a, b) => a + b, 0);
  const out = w.map((x) => Math.floor((W * x) / tot));
  out[out.length - 1] = (out[out.length - 1] ?? 0) + (W - out.reduce((a, b) => a + b, 0));
  return out;
}
function table(headers: string[], rows: Cell[][], o: { widths?: number[]; size?: number; emph?: (col: number, text: string) => { color?: string; bold?: boolean } | undefined } = {}) {
  const widths = o.widths ?? widthsFor(headers, rows);
  const size = o.size ?? 17;
  const right = headers.map((_, j) => rows.slice(0, 60).every((r) => isNum(r[j] ?? null)));
  const cell = (t: string, j: number, kind: "head" | "even" | "odd") => {
    const em = kind === "head" ? undefined : o.emph?.(j, t);
    return new TableCell({
      width: { size: widths[j] ?? 1000, type: WidthType.DXA },
      verticalAlign: VerticalAlign.CENTER,
      shading: { type: ShadingType.CLEAR, fill: kind === "head" ? C.primary : kind === "odd" ? C.zebra : "FFFFFF", color: "auto" },
      margins: { top: 50, bottom: 50, left: 90, right: 90 },
      borders: { top: NO, left: NO, right: NO, bottom: line(kind === "head" ? C.primary : C.line) },
      children: [new Paragraph({ alignment: right[j] ? AlignmentType.RIGHT : AlignmentType.LEFT, spacing: { after: 0 }, children: [run(t, { size, bold: kind === "head" || em?.bold === true, color: kind === "head" ? "FFFFFF" : (em?.color ?? C.text) })] })],
    });
  };
  const total = widths.reduce((a, b) => a + b, 0);
  return new Table({
    width: { size: total, type: WidthType.DXA },
    columnWidths: widths,
    layout: TableLayoutType.FIXED,
    borders: { ...NOB, insideHorizontal: NO, insideVertical: NO },
    rows: [
      new TableRow({ tableHeader: true, cantSplit: true, children: headers.map((h, j) => cell(h, j, "head")) }),
      ...rows.map((r, i) => new TableRow({ cantSplit: true, children: headers.map((_, j) => cell(r[j] == null ? "—" : String(r[j]), j, i % 2 ? "odd" : "even")) })),
    ],
  });
}

/* ---------- Encadré d'interprétation ---------- */
function callout(label: string, items: Item[] | string[]): Paragraph[] {
  const list: Item[] = items.map((it) => (typeof it === "string" ? { text: it } : it));
  if (!list.length) return [];
  const base = { shading: { type: ShadingType.CLEAR, fill: C.callout, color: "auto" }, border: { left: { style: BorderStyle.SINGLE, size: 24, color: C.accent, space: 10 } }, indent: { left: 200, right: 120 } } as const;
  return [
    new Paragraph({ ...base, keepNext: true, spacing: { before: 160, after: 40 }, children: [run(label.toUpperCase(), { bold: true, size: 16, color: C.accentDark, spacing: 40 })] }),
    ...list.map((it, i) => new Paragraph({ ...base, spacing: { after: i === list.length - 1 ? 200 : 70 }, children: [...(it.title ? [run(`${it.title} — `, { bold: true })] : []), run(it.text)] })),
  ];
}

/* ---------- Graphiques en barres (images) ---------- */
function niceStep(range: number, n = 5) {
  const raw = Math.max(range, 1e-12) / n;
  const p = 10 ** Math.floor(Math.log10(raw));
  const f = raw / p;
  return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p;
}
function barPng(title: string, labels: string[], values: number[], color: (v: number) => string, note?: string): Uint8Array {
  const cw = 1100;
  const ch = 520;
  const c = document.createElement("canvas");
  c.width = cw; c.height = ch;
  const x = c.getContext("2d")!;
  x.fillStyle = "#ffffff"; x.fillRect(0, 0, cw, ch);
  void title;
  const L = 80, R = 26, T = 36, B = note ? 104 : 84;
  const pw = cw - L - R, ph = ch - T - B;
  const step = niceStep(Math.max(...values, 1e-9));
  const top = Math.ceil(Math.max(...values, 1e-9) / step) * step;
  const Y = (v: number) => T + ph - (v / top) * ph;
  x.font = "17px Calibri, Arial, sans-serif";
  for (let v = 0; v <= top + 1e-9; v += step) {
    x.strokeStyle = v === 0 ? "#94a3b8" : "#e2e8f0"; x.lineWidth = 1;
    x.beginPath(); x.moveTo(L, Y(v)); x.lineTo(cw - R, Y(v)); x.stroke();
    x.fillStyle = "#64748b"; x.textAlign = "right"; x.fillText(fmt(v, 2), L - 10, Y(v) + 5);
  }
  const n = Math.max(labels.length, 1);
  const bw = pw / n;
  const barW = Math.min(bw * 0.62, 72);
  const rotate = n > 9;
  labels.forEach((l, i) => {
    const v = values[i] ?? 0;
    const bx = L + i * bw + (bw - barW) / 2;
    const by = Y(v);
    x.fillStyle = color(v);
    if (v > 0) {
      const r = Math.min(7, barW / 2, (T + ph - by) / 2);
      x.beginPath();
      x.moveTo(bx, T + ph); x.lineTo(bx, by + r); x.quadraticCurveTo(bx, by, bx + r, by);
      x.lineTo(bx + barW - r, by); x.quadraticCurveTo(bx + barW, by, bx + barW, by + r); x.lineTo(bx + barW, T + ph);
      x.closePath(); x.fill();
    }
    x.fillStyle = "#1e293b"; x.font = "bold 18px Calibri, Arial, sans-serif"; x.textAlign = "center";
    x.fillText(fmt(v, 1), bx + barW / 2, by - 8);
    x.fillStyle = "#334155"; x.font = "17px Calibri, Arial, sans-serif";
    if (rotate) {
      x.save(); x.translate(bx + barW / 2, T + ph + 14); x.rotate(-Math.PI / 5); x.textAlign = "right"; x.fillText(l.slice(0, 14), 0, 0); x.restore();
    } else x.fillText(l.slice(0, 14), bx + barW / 2, T + ph + 20);
  });
  if (note) { x.fillStyle = "#64748b"; x.font = "italic 15px Calibri, Arial, sans-serif"; x.textAlign = "left"; x.fillText(note, 28, ch - 16); }
  const b = atob(c.toDataURL("image/png").split(",")[1] ?? "");
  return Uint8Array.from(b, (ch2) => ch2.charCodeAt(0));
}
const RI_COLORS = ["#1F8A62", "#D9A400", "#E08A00", "#E0661F", "#D93A2B"];

/* ---------- Images dans le document ---------- */
const picture = (data: Uint8Array, w: number, h: number, name: string) =>
  new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, spacing: { before: 120, after: 0 }, children: [new ImageRun({ type: "png", data, transformation: { width: w, height: h }, altText: { title: name, description: name, name } })] });
const figureImage = (f: Figure, name: string) => {
  const w = Math.min(560, Math.round((500 * f.width) / f.height));
  return picture(f.data, w, Math.round((w * f.height) / f.width), name);
};

const MODEL_LABEL: Record<VModel, string> = { spherical: "sphérique", exponential: "exponentiel", gaussian: "gaussien" };

/** Section « Cartographie et interpolation » : cartes, variogramme, validation croisée. */
async function mapsSection(ctx: Ctx, sets: MapSet[], o: MapOptions, no: number, withText: boolean): Promise<Block[]> {
  const out: Block[] = [];
  const cvLine = (name: string, par: string, cv: CVResult) => [name, par, fmt(cv.rmse, 3), fmt(cv.mae, 3), fmt(cv.bias, 3), `${fmt(cv.skill * 100, 0)} %`];
  out.push(H1(`${no}. Cartographie et interpolation spatiale`, true));
  out.push(P("Les distances sont calculées en km sur un plan local centré sur les stations. Les surfaces interpolées sont limitées à l'enveloppe des stations plus une marge d'environ un espacement moyen ; elles ne descendent pas sous 0 (sauf Igeo). La validation croisée est de type leave-one-out ; le gain mesure l'amélioration par rapport à la simple moyenne des autres stations (≤ 0 % : l'interpolation n'apporte rien)."));
  for (const [k, s] of sets.entries()) {
    out.push(H2(`${no}.${k + 1} ${s.title}`));
    const pts = mergeDuplicates(s.points);
    if (pts.length < 3) {
      out.push(P("Au moins 3 stations avec une valeur sont nécessaires pour la cartographie."));
      continue;
    }
    const label = s.label + (s.unit ? ` (${s.unit})` : "");
    const limNote = s.limit != null ? ` Cercle rouge : dépassement de ${s.limitLabel ?? "la norme"}.` : "";
    const cvRows: string[][] = [];
    let idwInfo: { power: number; cv: CVResult } | undefined;
    let krigInfo: { model: VModel; fit: ReturnType<typeof fitVariogram>; cv: CVResult } | undefined;
    try {
      if (o.stations) {
        out.push(figureImage(await renderMapPng({ points: s.points, grid: null, label, limit: s.limit }), "Carte des stations"));
        out.push(...ctx.figure(`Carte des stations — ${label}`, limNote.trim() || undefined));
      }
      if (o.idw) {
        const bp = bestIdwPower(pts);
        const grid = computeGrid(pts, idwPredictor(pts, bp.power), 80, { floor: s.floor });
        out.push(figureImage(await renderMapPng({ points: s.points, grid, label, limit: s.limit }), "Carte IDW"));
        out.push(...ctx.figure(`Interpolation IDW — ${label}`, `Puissance optimale p = ${bp.power.toFixed(1)} (RMSE de validation croisée : ${fmt(bp.rmse, 3)}).${limNote}`));
        const icv = idwCrossValidate(pts, bp.power);
        idwInfo = { power: bp.power, cv: icv };
        cvRows.push(cvLine("IDW", `p = ${bp.power.toFixed(1)}`, icv));
      }
      if (o.krig || o.std || o.variogram) {
        const fit = fitVariogram(pts, o.model);
        const cv = crossValidate(pts, o.model, fit.params);
        if (o.krig) {
          const grid = computeGrid(pts, krigingPredictor(pts, o.model, fit.params), 60, { floor: s.floor });
          out.push(figureImage(await renderMapPng({ points: s.points, grid, label, limit: s.limit }), "Carte krigeage"));
          out.push(...ctx.figure(`Krigeage ordinaire — ${label}`, `Modèle ${MODEL_LABEL[o.model]}, portée ${fmt(fit.params.range, 1)} km.${limNote}`));
        }
        if (o.std) {
          const grid = computeGrid(pts, krigingStdPredictor(pts, o.model, fit.params), 60);
          out.push(figureImage(await renderMapPng({ points: s.points, grid, label: `Écart-type de krigeage — ${label}`, neutral: true }), "Incertitude du krigeage"));
          out.push(...ctx.figure(`Incertitude du krigeage (écart-type) — ${label}`, "L'incertitude augmente avec l'éloignement des stations."));
        }
        if (o.variogram) {
          out.push(figureImage(renderVariogramPng(fit, o.model, MODEL_LABEL[o.model]), "Variogramme"));
          out.push(...ctx.figure(`Variogramme — ${label}`, `Variogramme expérimental et modèle ${MODEL_LABEL[o.model]} ajusté (${pts.length} stations).`));
        }
        krigInfo = { model: o.model, fit, cv };
        cvRows.push(cvLine("Krigeage ordinaire", MODEL_LABEL[o.model], cv));
        out.push(ctx.table(`Paramètres du variogramme — ${label}`));
        out.push(table(["Modèle", "Pépite", "Palier", "Portée (km)", "Part de pépite", "Structure spatiale"], [[MODEL_LABEL[o.model], fmt(fit.params.nugget, 3), fmt(fit.params.sill, 3), fmt(fit.params.range, 2), `${fmt(fit.nugRatio * 100, 0)} %`, fit.structure]]));
        out.push(P(""));
        if (!withText && pts.length < 20) out.push(P(`Attention : seulement ${pts.length} stations. Le variogramme repose sur très peu de paires de points (30 à 50 stations sont recommandées) ; le krigeage reste indicatif.`));
        if (!withText && fit.structure === "aucune") out.push(P("Aucune structure spatiale nette n'est détectée (effet de pépite dominant) : le krigeage retombe sur la moyenne loin des stations."));
      }
      if (cvRows.length) {
        out.push(ctx.table(`Validation croisée — ${label}`));
        out.push(table(["Méthode", "Paramètre", "RMSE", "MAE", "Biais", "Gain vs. moyenne"], cvRows));
        out.push(P(""));
      }
      if (withText) out.push(...callout("Interprétation", interpretSpatial({ label, points: pts, idw: idwInfo, krig: krigInfo, std: o.std && !!krigInfo })));
    } catch (e) {
      console.error(e);
      out.push(P("Une figure n'a pas pu être générée pour cet élément."));
    }
  }
  return out;
}

/* ---------- Page de garde ---------- */
export interface CoverInfo {
  title?: string | undefined;
  author?: string | undefined;
  organization?: string | undefined;
  site?: string | undefined;
}
const DEFAULT_TITLE = "Rapport d'analyse des éléments traces métalliques";

function coverPage(d: { matrix: string; normName: string; rows: Row[]; elements: string[]; kpi: { stations: number; total: number; rate: number } }, cover: CoverInfo): Block[] {
  const title = cover.title?.trim() || DEFAULT_TITLE;
  const dates = [...new Set(d.rows.map((r) => r.date).filter(Boolean))].sort();
  const period = dates.length === 0 ? "" : dates.length === 1 ? (dates[0] ?? "") : `${dates[0]} → ${dates[dates.length - 1]}`;
  const banner = new Table({
    width: { size: W, type: WidthType.DXA },
    columnWidths: [W],
    borders: { ...NOB, insideHorizontal: NO, insideVertical: NO },
    rows: [
      new TableRow({
        height: { value: 5600, rule: HeightRule.ATLEAST },
        children: [
          new TableCell({
            width: { size: W, type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            shading: { type: ShadingType.CLEAR, fill: C.primary, color: "auto" },
            margins: { top: 500, bottom: 500, left: 620, right: 620 },
            borders: NOB,
            children: [
              new Paragraph({ spacing: { after: 200 }, children: [run("RAPPORT D'ANALYSE · ETM ANALYZER", { size: 20, color: "A9B8F5", bold: true, spacing: 60 })] }),
              new Paragraph({ spacing: { after: 120, line: 240, lineRule: LineRuleType.AUTO }, children: [run(title, { size: 60, bold: true, color: "FFFFFF" })] }),
              new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 24, color: C.accent, space: 1 } }, indent: { right: 6200 }, spacing: { before: 60, after: 240 }, children: [] }),
              new Paragraph({ spacing: { after: 0 }, children: [run(`Matrice ${d.matrix.toLowerCase()}${d.normName ? ` — ${d.normName}` : ""}`, { size: 26, color: "DCE3FF" })] }),
            ],
          }),
        ],
      }),
    ],
  });
  const info: [string, string][] = [
    ["Zone d'étude", cover.site?.trim() ?? ""],
    ["Matrice analysée", d.matrix],
    ["Référentiel", d.normName],
    ["Période de prélèvement", period],
    ["Données", `${d.kpi.stations} stations · ${d.kpi.total} mesures · ${d.elements.length} éléments`],
    ["Taux de conformité", d.kpi.total ? `${fx(d.kpi.rate, 1)} %` : ""],
  ];
  const rows = info.filter(([, v]) => v);
  const lw = 2900;
  const infoTable = new Table({
    width: { size: W, type: WidthType.DXA },
    columnWidths: [lw, W - lw],
    borders: { ...NOB, insideHorizontal: NO, insideVertical: NO },
    rows: rows.map(([k, v]) =>
      new TableRow({
        cantSplit: true,
        children: [
          new TableCell({ width: { size: lw, type: WidthType.DXA }, margins: { top: 110, bottom: 110, left: 100, right: 100 }, borders: { ...NOB, bottom: line(C.line) }, children: [new Paragraph({ spacing: { after: 0 }, children: [run(k.toUpperCase(), { bold: true, size: 17, color: C.accentDark, spacing: 30 })] })] }),
          new TableCell({ width: { size: W - lw, type: WidthType.DXA }, margins: { top: 110, bottom: 110, left: 100, right: 100 }, borders: { ...NOB, bottom: line(C.line) }, children: [new Paragraph({ spacing: { after: 0 }, children: [run(v, { size: 23 })] })] }),
        ],
      }),
    ),
  });
  const who = [cover.author?.trim(), cover.organization?.trim()].filter(Boolean) as string[];
  return [
    banner,
    new Paragraph({ spacing: { before: 500, after: 0 }, children: [] }),
    infoTable,
    new Paragraph({ spacing: { before: 1500, after: 0 }, children: [] }),
    ...(who.length
      ? [
          new Paragraph({ spacing: { after: 40 }, children: [run("RÉALISÉ PAR", { bold: true, size: 16, color: C.muted, spacing: 40 })] }),
          ...who.map((w, i) => new Paragraph({ spacing: { after: 20 }, children: [run(w, { size: i === 0 ? 28 : 23, bold: i === 0, color: i === 0 ? C.primary : C.caption })] })),
        ]
      : []),
    new Paragraph({ spacing: { before: 240, after: 0 }, children: [run(`Rapport généré le ${new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })} avec ETM Analyzer`, { size: 18, color: C.muted })] }),
  ];
}

/** Cartes de synthèse (indicateurs clés). */
function kpiCards(d: { matrix: string; elements: string[]; kpi: { stations: number; total: number; ok: number; over: number; rate: number } }): Table {
  const k = d.kpi;
  const withNorm = k.ok + k.over;
  const cards: { label: string; value: string; sub: string; fill: string; color: string }[] = [
    { label: "TAUX DE CONFORMITÉ", value: withNorm ? `${fx(k.rate, 1)} %` : "—", sub: `${k.ok} / ${withNorm} mesures conformes`, fill: C.light, color: C.primary },
    { label: "MESURES", value: String(k.total), sub: `${k.stations} stations`, fill: C.light, color: C.primary },
    { label: "ÉLÉMENTS", value: String(d.elements.length), sub: `Matrice ${d.matrix.toLowerCase()}`, fill: C.light, color: C.primary },
    { label: "DÉPASSEMENTS", value: String(k.over), sub: k.total ? `${fx((k.over / k.total) * 100, 1)} % des mesures` : "—", fill: k.over ? C.redLight : C.light, color: k.over ? C.red : C.primary },
  ];
  const cw = Math.floor(W / 4);
  const gap = { style: BorderStyle.SINGLE, size: 36, color: "FFFFFF" } as const;
  return new Table({
    width: { size: cw * 4, type: WidthType.DXA },
    columnWidths: [cw, cw, cw, cw],
    borders: { ...NOB, insideHorizontal: NO, insideVertical: NO },
    rows: [
      new TableRow({
        cantSplit: true,
        children: cards.map((c) =>
          new TableCell({
            width: { size: cw, type: WidthType.DXA },
            shading: { type: ShadingType.CLEAR, fill: c.fill, color: "auto" },
            margins: { top: 160, bottom: 160, left: 180, right: 120 },
            borders: { top: gap, bottom: gap, left: gap, right: gap },
            children: [
              new Paragraph({ spacing: { after: 40 }, children: [run(c.label, { bold: true, size: 15, color: C.muted, spacing: 30 })] }),
              new Paragraph({ spacing: { after: 20 }, children: [run(c.value, { bold: true, size: 44, color: c.color })] }),
              new Paragraph({ spacing: { after: 0 }, children: [run(c.sub, { size: 16, color: C.muted })] }),
            ],
          }),
        ),
      }),
    ],
  });
}

const frontTitle = (t: string, pageBreak = false) => new Paragraph({ style: "FrontTitle", ...(pageBreak ? { pageBreakBefore: true } : {}), children: [new TextRun(t)] });

/* ---------- Rapport ---------- */
export async function buildReport(d: {
  matrix: string; normName: string; rows: Row[]; conf: ConfRow[]; idx: IndexRow[]; stations: StationIdx[]; elements: string[];
  kpi: { stations: number; total: number; ok: number; over: number; rate: number };
  maps?: { sets: MapSet[]; opts: MapOptions } | undefined;
  interpretations?: boolean | undefined;
  cover?: CoverInfo | undefined;
}) {
  const on = d.interpretations !== false;
  const ctx = new Ctx();
  const over = d.conf.filter((c) => c.status === "Dépassement");
  const title = d.cover?.title?.trim() || DEFAULT_TITLE;

  // Contenu du corps, dans l'ordre : les légendes sont numérotées au fil de la construction
  const body: Block[] = [];
  body.push(H1("1. Synthèse"));
  body.push(kpiCards(d));
  body.push(new Paragraph({ spacing: { after: 120 }, children: [] }));
  if (on) body.push(...callout("Interprétation", interpretSynthesis(d)));
  else body.push(P(`${d.kpi.stations} stations, ${d.kpi.total} mesures, ${d.kpi.ok} conformes, ${d.kpi.over} dépassements. Taux de conformité : ${fx(d.kpi.rate, 1)} %.`));

  body.push(H1("2. Coordonnées des stations"));
  body.push(ctx.table("Coordonnées des stations (WGS84, degrés décimaux)"));
  body.push(table(["Station", "Latitude", "Longitude"], d.stations.map((s) => [s.station, s.lat.toFixed(5), s.lon.toFixed(5)])));

  body.push(H1("3. Résultats de conformité"));
  body.push(picture(barPng("Nombre de dépassements par élément", d.elements, d.elements.map((e) => over.filter((o) => o.element === e).length), () => `#${C.red}`), 560, 265, "Dépassements par élément"));
  body.push(...ctx.figure("Nombre de dépassements par élément", "Dépassements de la limite réglementaire du référentiel retenu."));
  if (on) body.push(...callout("Interprétation", interpretConformity(d)));
  body.push(ctx.table(`Dépassements détectés (${over.length})`));
  body.push(
    table(["Station", "Date", "Élément", "C", "Unité", "Limite", "Ratio", "Statut"], over.map((r) => [r.station, r.date, r.element, fmt(r.concentration, 4), r.unite, fmt(r.limit, 4), fx(r.ratio, 2), r.status]), {
      emph: (col, t) => (col === 6 ? { color: Number(t) > 2 ? C.red : C.orange, bold: true } : col === 7 ? { color: C.red } : undefined),
    }),
  );

  body.push(H1("4. Indices de pollution"));
  body.push(picture(barPng("Indice de risque écologique potentiel (RI) par station", d.stations.map((s) => s.station), d.stations.map((s) => s.ri), (v) => RI_COLORS[interp.ri(v).level] ?? RI_COLORS[0]!, "Classes de Hakanson : < 150 faible · 150–300 modéré · 300–600 considérable · > 600 très élevé"), 560, 265, "RI par station"));
  body.push(...ctx.figure("Indice de risque écologique potentiel (RI) par station"));
  if (on) body.push(...callout("Interprétation", interpretIndices(d)));
  body.push(ctx.table("Indices de contamination par station et par élément"));
  body.push(table(["Station", "Élément", "FC", "Igeo", "Er", "Interprétation Igeo"], d.idx.map((r) => [r.station, r.element, fx(r.fc, 2), fx(r.igeo, 2), fx(r.er, 1), interp.igeo(r.igeo).label])));
  body.push(P(""));
  body.push(ctx.table("Indices intégrés par station (PLI, Cd, RI, Nemerow)"));
  body.push(table(["Station", "PLI", "Cd", "RI", "Nemerow", "Interprétation RI"], d.stations.map((s) => [s.station, fx(s.pli, 2), fx(s.cd, 2), fx(s.ri, 1), fx(s.nemerow, 2), interp.ri(s.ri).label])));

  const maps = d.maps ? await mapsSection(ctx, d.maps.sets, d.maps.opts, 5, on) : [];
  body.push(...maps);
  let sec = maps.length ? 6 : 5;
  if (on) body.push(H1(`${sec++}. Limites et précautions`), ...callout("À retenir", interpretLimits(d)));
  body.push(H1(`${sec++}. Données brutes`));
  if (d.rows.length > 300) body.push(P(`300 premières lignes sur ${d.rows.length}.`));
  body.push(ctx.table("Mesures brutes importées"));
  body.push(table(["Station", "Date", "Élément", "Concentration", "Unité"], d.rows.slice(0, 300).map((r) => [r.station, r.date, r.element, fmt(r.concentration, 4), r.unite])));
  body.push(H1(`${sec++}. Bibliographie`, true));
  body.push(...REFERENCES.map((r) => new Paragraph({ spacing: { after: 100 }, indent: { left: 360, hanging: 360 }, children: [run(r, { size: 19 })] })));

  const page = { size: { width: 11906, height: 16838 }, margin: { top: 1418, bottom: 1304, left: 1134, right: 1134, header: 620, footer: 520 } };
  const header = new Header({
    children: [new Paragraph({ style: "HeaderText", alignment: AlignmentType.RIGHT, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: C.accent, space: 4 } }, spacing: { after: 0 }, children: [run(title.length > 90 ? `${title.slice(0, 87)}…` : title, { size: 16, color: C.muted })] })],
  });
  const footer = (numbered: "roman" | "page") =>
    new Footer({
      children: [
        new Paragraph({
          style: "HeaderText",
          tabStops: [{ type: TabStopType.RIGHT, position: W }],
          border: { top: { style: BorderStyle.SINGLE, size: 4, color: C.line, space: 6 } },
          spacing: { after: 0 },
          children: [
            run("ETM Analyzer", { size: 16, color: C.muted }),
            new TextRun({ text: "\t", font: FONT, size: 16 }),
            numbered === "roman"
              ? new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: C.muted })
              : new TextRun({ children: ["Page ", PageNumber.CURRENT], font: FONT, size: 16, color: C.muted }),
          ],
        }),
      ],
    });

  const doc = new Document({
    creator: "ETM Analyzer",
    title,
    description: `Rapport ETM Analyzer — matrice ${d.matrix}`,
    features: { updateFields: true },
    styles: {
      default: {
        document: { run: { font: FONT, size: 21, color: C.text }, paragraph: { spacing: { line: 276, lineRule: LineRuleType.AUTO, after: 120 } } },
        heading1: { run: { font: FONT, size: 34, bold: true, color: C.primary }, paragraph: { outlineLevel: 0, spacing: { before: 360, after: 180 }, keepNext: true, border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: C.accent, space: 4 } } } },
        heading2: { run: { font: FONT, size: 26, bold: true, color: C.accentDark }, paragraph: { outlineLevel: 1, spacing: { before: 280, after: 100 }, keepNext: true } },
      },
      paragraphStyles: [
        { id: "FrontTitle", name: "Front Title", basedOn: "Normal", next: "Normal", run: { font: FONT, size: 36, bold: true, color: C.primary }, paragraph: { spacing: { before: 0, after: 240 }, keepNext: true, border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: C.accent, space: 4 } } } },
        // Entrées compactes pour la table des matières et les listes de figures / tableaux
        { id: "TOC1", name: "toc 1", basedOn: "Normal", next: "Normal", run: { font: FONT, size: 20, bold: true }, paragraph: { spacing: { before: 40, after: 40 } } },
        { id: "TOC2", name: "toc 2", basedOn: "Normal", next: "Normal", run: { font: FONT, size: 19 }, paragraph: { indent: { left: 240 }, spacing: { before: 0, after: 30 } } },
        { id: "TableofFigures", name: "table of figures", basedOn: "Normal", next: "Normal", run: { font: FONT, size: 19 }, paragraph: { spacing: { before: 0, after: 30 } } },
        { id: "HeaderText", name: "Header Text", basedOn: "Normal", run: { font: FONT, size: 16, color: C.muted }, paragraph: { spacing: { before: 0, after: 0 } } },
        { id: "Caption", name: "caption", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: FONT, size: 18, color: C.caption }, paragraph: { spacing: { before: 60, after: 120 } } },
      ],
    },
    sections: [
      // 1. Page de garde (sans en-tête ni pied de page)
      { properties: { page }, children: coverPage(d, d.cover ?? {}) },
      // 2. Table des matières et listes (numérotation en chiffres romains)
      {
        properties: { type: SectionType.NEXT_PAGE, page: { ...page, pageNumbers: { start: 1, formatType: NumberFormat.LOWER_ROMAN } } },
        headers: { default: header },
        footers: { default: footer("roman") },
        children: [
          frontTitle("Table des matières"),
          new TableOfContents("Table des matières", { hyperlink: true, headingStyleRange: "1-2" }),
          new Paragraph({ spacing: { after: 200 }, children: [] }),
          frontTitle("Liste des figures"),
          new TableOfContents("Liste des figures", { hyperlink: true, captionLabelIncludingNumbers: "Figure" }),
          new Paragraph({ spacing: { after: 200 }, children: [] }),
          frontTitle("Liste des tableaux"),
          new TableOfContents("Liste des tableaux", { hyperlink: true, captionLabelIncludingNumbers: "Tableau" }),
        ],
      },
      // 3. Corps du rapport (numérotation « Page X sur Y »)
      {
        properties: { type: SectionType.NEXT_PAGE, page: { ...page, pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL } } },
        headers: { default: header },
        footers: { default: footer("page") },
        children: body,
      },
    ],
  });
  downloadBlob(await Packer.toBlob(doc), `rapport_ETM_${d.matrix}.docx`);
}
