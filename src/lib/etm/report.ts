import { AlignmentType, Document, HeadingLevel, ImageRun, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from "docx";
import { downloadBlob, fmt, interp, type ConfRow, type IndexRow, type Row, type StationIdx } from "./analysis";
import { REFERENCES } from "./references";
import { bestIdwPower, computeGrid, crossValidate, fitVariogram, idwCrossValidate, idwPredictor, krigingPredictor, krigingStdPredictor, mergeDuplicates, type CVResult, type VModel } from "./spatial";
import { renderMapPng, renderVariogramPng, type Figure, type MapOptions, type MapSet } from "./report-maps";

const W = 9026;
function table(headers: string[], rows: (string | number | null)[][]) {
  const cw = Math.floor(W / headers.length);
  const cell = (t: string, bold = false) =>
    new TableCell({ width: { size: cw, type: WidthType.DXA }, margins: { top: 40, bottom: 40, left: 80, right: 80 }, children: [new Paragraph({ children: [new TextRun({ text: t, bold, size: 16 })] })] });
  return new Table({
    width: { size: cw * headers.length, type: WidthType.DXA },
    columnWidths: headers.map(() => cw),
    rows: [new TableRow({ tableHeader: true, children: headers.map((h) => cell(h, true)) }), ...rows.map((r) => new TableRow({ children: r.map((v) => cell(v == null ? "—" : String(v))) }))],
  });
}
function barPng(title: string, labels: string[], values: number[]): Uint8Array {
  const c = document.createElement("canvas");
  c.width = 900; c.height = 420;
  const x = c.getContext("2d")!;
  x.fillStyle = "#fff"; x.fillRect(0, 0, 900, 420);
  x.fillStyle = "#1e293b"; x.font = "bold 18px Arial"; x.fillText(title, 20, 30);
  const max = Math.max(...values, 1e-9);
  const bw = 820 / Math.max(labels.length, 1);
  labels.forEach((l, i) => {
    const h = ((values[i] ?? 0) / max) * 300;
    x.fillStyle = "#1f5f99"; x.fillRect(50 + i * bw + bw * 0.15, 370 - h, bw * 0.7, h);
    x.fillStyle = "#334155"; x.font = "12px Arial";
    x.fillText(l.slice(0, 12), 50 + i * bw + 4, 390);
    x.fillText(fmt(values[i], 2), 50 + i * bw + 4, 365 - h);
  });
  const b = atob(c.toDataURL("image/png").split(",")[1] ?? "");
  return Uint8Array.from(b, (ch) => ch.charCodeAt(0));
}

const MODEL_LABEL: Record<VModel, string> = { spherical: "sphérique", exponential: "exponentiel", gaussian: "gaussien" };

/** Section « Cartographie et interpolation » : cartes, variogramme, validation croisée. */
async function mapsSection(sets: MapSet[], o: MapOptions, no: number): Promise<(Paragraph | Table)[]> {
  const out: (Paragraph | Table)[] = [];
  const H1 = (t: string) => new Paragraph({ heading: HeadingLevel.HEADING_1, keepNext: true, spacing: { before: 300, after: 150 }, children: [new TextRun(t)] });
  const H2 = (t: string) => new Paragraph({ heading: HeadingLevel.HEADING_2, keepNext: true, spacing: { before: 240, after: 100 }, children: [new TextRun(t)] });
  const P2 = (t: string) => new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: t, size: 20 })] });
  const cap = (t: string) => new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 220 }, children: [new TextRun({ text: t, italics: true, size: 18 })] });
  const figure = (f: Figure, name: string) => {
    const w = Math.min(600, Math.round((520 * f.width) / f.height));
    const h = Math.round((w * f.height) / f.width);
    return new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, children: [new ImageRun({ type: "png", data: f.data, transformation: { width: w, height: h }, altText: { title: name, description: name, name } })] });
  };
  const cvLine = (name: string, par: string, cv: CVResult) => [name, par, fmt(cv.rmse, 3), fmt(cv.mae, 3), fmt(cv.bias, 3), `${fmt(cv.skill * 100, 0)} %`];

  out.push(H1(`${no}. Cartographie et interpolation spatiale`));
  out.push(P2("Les distances sont calculées en km sur un plan local centré sur les stations. Les surfaces interpolées sont limitées à l'enveloppe des stations plus une marge d'environ un espacement moyen ; elles ne descendent pas sous 0 (sauf Igeo). La validation croisée est de type leave-one-out ; le gain mesure l'amélioration par rapport à la simple moyenne des autres stations (≤ 0 % : l'interpolation n'apporte rien)."));
  let fig = 1;
  for (const [k, s] of sets.entries()) {
    out.push(H2(`${no}.${k + 1} ${s.title}`));
    const pts = mergeDuplicates(s.points);
    if (pts.length < 3) {
      out.push(P2("Au moins 3 stations avec une valeur sont nécessaires pour la cartographie."));
      continue;
    }
    const label = s.label + (s.unit ? ` (${s.unit})` : "");
    const limNote = s.limit != null ? ` Cercle rouge : dépassement de ${s.limitLabel ?? "la norme"}.` : "";
    const cvRows: string[][] = [];
    try {
      if (o.stations) {
        out.push(figure(await renderMapPng({ points: s.points, grid: null, label, limit: s.limit }), "Carte des stations"));
        out.push(cap(`Figure ${fig++} — Stations : ${label}.${limNote}`));
      }
      if (o.idw) {
        const bp = bestIdwPower(pts);
        const grid = computeGrid(pts, idwPredictor(pts, bp.power), 80, { floor: s.floor });
        out.push(figure(await renderMapPng({ points: s.points, grid, label, limit: s.limit }), "Carte IDW"));
        out.push(cap(`Figure ${fig++} — Interpolation IDW de ${label}, puissance optimale p = ${bp.power.toFixed(1)} (RMSE de validation croisée : ${fmt(bp.rmse, 3)}).${limNote}`));
        cvRows.push(cvLine("IDW", `p = ${bp.power.toFixed(1)}`, idwCrossValidate(pts, bp.power)));
      }
      if (o.krig || o.std || o.variogram) {
        const fit = fitVariogram(pts, o.model);
        const cv = crossValidate(pts, o.model, fit.params);
        if (o.krig) {
          const grid = computeGrid(pts, krigingPredictor(pts, o.model, fit.params), 60, { floor: s.floor });
          out.push(figure(await renderMapPng({ points: s.points, grid, label, limit: s.limit }), "Carte krigeage"));
          out.push(cap(`Figure ${fig++} — Krigeage ordinaire de ${label}, modèle ${MODEL_LABEL[o.model]} (portée ${fmt(fit.params.range, 1)} km).${limNote}`));
        }
        if (o.std) {
          const grid = computeGrid(pts, krigingStdPredictor(pts, o.model, fit.params), 60);
          out.push(figure(await renderMapPng({ points: s.points, grid, label: `Écart-type de krigeage — ${label}`, neutral: true }), "Incertitude du krigeage"));
          out.push(cap(`Figure ${fig++} — Incertitude (écart-type de krigeage) de ${label}. Elle augmente avec l'éloignement des stations.`));
        }
        if (o.variogram) {
          out.push(figure(renderVariogramPng(fit, o.model, MODEL_LABEL[o.model]), "Variogramme"));
          out.push(cap(`Figure ${fig++} — Variogramme expérimental et modèle ${MODEL_LABEL[o.model]} ajusté (${pts.length} stations).`));
        }
        cvRows.push(cvLine("Krigeage ordinaire", MODEL_LABEL[o.model], cv));
        out.push(table(["Modèle", "Pépite", "Palier", "Portée (km)", "Part de pépite", "Structure spatiale"], [[MODEL_LABEL[o.model], fmt(fit.params.nugget, 3), fmt(fit.params.sill, 3), fmt(fit.params.range, 2), `${fmt(fit.nugRatio * 100, 0)} %`, fit.structure]]));
        out.push(P2(""));
        if (pts.length < 20) out.push(P2(`Attention : seulement ${pts.length} stations. Le variogramme repose sur très peu de paires de points (30 à 50 stations sont recommandées) ; le krigeage reste indicatif.`));
        if (fit.structure === "aucune") out.push(P2("Aucune structure spatiale nette n'est détectée (effet de pépite dominant) : le krigeage retombe sur la moyenne loin des stations."));
      }
      if (cvRows.length) {
        out.push(table(["Méthode", "Paramètre", "RMSE", "MAE", "Biais", "Gain vs. moyenne"], cvRows));
        out.push(P2(""));
      }
    } catch (e) {
      console.error(e);
      out.push(P2("Une figure n'a pas pu être générée pour cet élément."));
    }
  }
  return out;
}

export async function buildReport(d: { matrix: string; normName: string; rows: Row[]; conf: ConfRow[]; idx: IndexRow[]; stations: StationIdx[]; elements: string[]; kpi: { stations: number; total: number; ok: number; over: number; rate: number }; maps?: { sets: MapSet[]; opts: MapOptions } | undefined }) {
  const H = (t: string) => new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 300, after: 150 }, children: [new TextRun(t)] });
  const P = (t: string) => new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: t, size: 20 })] });
  const img = (data: Uint8Array) => new Paragraph({ children: [new ImageRun({ type: "png", data, transformation: { width: 600, height: 280 }, altText: { title: "Graphique", description: "Graphique", name: "chart" } })] });
  const over = d.conf.filter((c) => c.status === "Dépassement");
  const maps = d.maps ? await mapsSection(d.maps.sets, d.maps.opts, 5) : [];
  const nx = maps.length ? 6 : 5;
  const doc = new Document({
    styles: { default: { document: { run: { font: "Arial", size: 20 } } } },
    sections: [{
      children: [
        new Paragraph({ alignment: AlignmentType.CENTER, heading: HeadingLevel.TITLE, children: [new TextRun({ text: "Rapport ETM Analyzer", bold: true, size: 40 })] }),
        P(`Matrice : ${d.matrix} — Référentiel : ${d.normName} — Généré le ${new Date().toLocaleDateString("fr-FR")}`),
        H("1. Synthèse"),
        P(`${d.kpi.stations} stations, ${d.kpi.total} mesures, ${d.kpi.ok} conformes, ${d.kpi.over} dépassements. Taux de conformité : ${d.kpi.rate.toFixed(1)} %.`),
        H("2. Coordonnées des stations"),
        table(["Station", "Latitude", "Longitude"], d.stations.map((s) => [s.station, s.lat, s.lon])),
        H("3. Résultats de conformité"),
        img(barPng("Dépassements par élément", d.elements, d.elements.map((e) => over.filter((o) => o.element === e).length))),
        table(["Station", "Date", "Élément", "C", "Unité", "Limite", "Ratio", "Statut"], over.map((r) => [r.station, r.date, r.element, fmt(r.concentration, 4), r.unite, fmt(r.limit, 4), fmt(r.ratio, 2), r.status])),
        H("4. Indices de pollution"),
        img(barPng("Indice de risque écologique RI par station", d.stations.map((s) => s.station), d.stations.map((s) => s.ri))),
        table(["Station", "Élément", "FC", "Igeo", "Er", "Interprétation Igeo"], d.idx.map((r) => [r.station, r.element, fmt(r.fc, 2), fmt(r.igeo, 2), fmt(r.er, 1), interp.igeo(r.igeo).label])),
        P(""),
        table(["Station", "PLI", "Cd", "RI", "Nemerow", "Interprétation RI"], d.stations.map((s) => [s.station, fmt(s.pli, 2), fmt(s.cd, 2), fmt(s.ri, 1), fmt(s.nemerow, 2), interp.ri(s.ri).label])),
        ...maps,
        H(`${nx}. Données brutes`),
        P(d.rows.length > 300 ? `300 premières lignes sur ${d.rows.length}.` : ""),
        table(["Station", "Date", "Élément", "Concentration", "Unité"], d.rows.slice(0, 300).map((r) => [r.station, r.date, r.element, fmt(r.concentration, 4), r.unite])),
        H(`${nx + 1}. Bibliographie`),
        ...REFERENCES.map((r) => P(r)),
      ],
    }],
  });
  downloadBlob(await Packer.toBlob(doc), `rapport_ETM_${d.matrix}.docx`);
}
