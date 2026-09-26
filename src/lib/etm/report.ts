import { AlignmentType, Document, HeadingLevel, ImageRun, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from "docx";
import { downloadBlob, fmt, interp, type ConfRow, type IndexRow, type Row, type StationIdx } from "./analysis";
import { REFERENCES } from "./references";

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

export async function buildReport(d: { matrix: string; normName: string; rows: Row[]; conf: ConfRow[]; idx: IndexRow[]; stations: StationIdx[]; elements: string[]; kpi: { stations: number; total: number; ok: number; over: number; rate: number } }) {
  const H = (t: string) => new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 300, after: 150 }, children: [new TextRun(t)] });
  const P = (t: string) => new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: t, size: 20 })] });
  const img = (data: Uint8Array) => new Paragraph({ children: [new ImageRun({ type: "png", data, transformation: { width: 600, height: 280 }, altText: { title: "Graphique", description: "Graphique", name: "chart" } })] });
  const over = d.conf.filter((c) => c.status === "Dépassement");
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
        H("5. Données brutes"),
        P(d.rows.length > 300 ? `300 premières lignes sur ${d.rows.length}.` : ""),
        table(["Station", "Date", "Élément", "Concentration", "Unité"], d.rows.slice(0, 300).map((r) => [r.station, r.date, r.element, fmt(r.concentration, 4), r.unite])),
        H("6. Bibliographie"),
        ...REFERENCES.map((r) => P(r)),
      ],
    }],
  });
  downloadBlob(await Packer.toBlob(doc), `rapport_ETM_${d.matrix}.docx`);
}
