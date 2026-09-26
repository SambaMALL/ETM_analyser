import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { UploadCloud, FileDown, Sparkles, AlertTriangle, CheckCircle2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageHeader, Panel } from "@/components/etm/ui";
import { DataTable, type Col } from "@/components/etm/DataTable";
import { useAnalysis } from "@/lib/etm/store";
import { downloadBlob, fmt, parseCSV, REQUIRED, sampleCSV, type Row } from "@/lib/etm/analysis";
import { pageHead } from "@/lib/etm/head";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: pageHead("Import des données", "Importez vos mesures d'éléments traces métalliques (CSV) pour l'eau, le sol ou l'air."),
  component: ImportPage,
});

const cols: Col<Row>[] = [
  { key: "station", label: "Station", value: (r) => r.station },
  { key: "lat", label: "Latitude", value: (r) => r.lat, num: true },
  { key: "lon", label: "Longitude", value: (r) => r.lon, num: true },
  { key: "date", label: "Date", value: (r) => r.date },
  { key: "mat", label: "Matrice", value: (r) => r.matrice },
  { key: "el", label: "Élément", value: (r) => r.element },
  { key: "c", label: "Concentration", value: (r) => r.concentration, render: (r) => fmt(r.concentration, 4), num: true },
  { key: "u", label: "Unité", value: (r) => r.unite },
];

function ImportPage() {
  const a = useAnalysis();
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [report, setReport] = useState<{ missing: string[]; dropped: number; total: number; kept: number } | null>(null);

  const load = (text: string, name: string) => {
    const r = parseCSV(text);
    setReport({ missing: r.missing, dropped: r.dropped, total: r.total, kept: r.rows.length });
    if (r.missing.length) {
      toast.error("Colonnes obligatoires manquantes");
      return;
    }
    a.setData(r.rows, name);
    toast.success(`${r.rows.length} mesures importées`);
  };
  const onFile = async (f?: File) => {
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".csv")) { toast.error("Le fichier doit être au format CSV"); return; }
    load(await f.text(), f.name);
  };

  const inMatrix = a.matrixRows.length;
  const otherMatrices = [...new Set(a.rows.map((r) => r.matrice))];

  return (
    <div className="space-y-6">
      <PageHeader title="Import des données" desc="Chargez un fichier CSV de mesures. Les colonnes sont détectées automatiquement (séparateur , ou ;), les lignes incomplètes et valeurs non numériques sont écartées." />
      <div className="grid gap-6 lg:grid-cols-3">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            onFile(e.dataTransfer.files[0]);
          }}
          onClick={() => input.current?.click()}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed bg-card p-10 text-center transition-colors lg:col-span-2",
            drag ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
          )}
        >
          <UploadCloud className="mb-3 h-10 w-10 text-primary" />
          <p className="font-medium">Glissez-déposez votre fichier CSV ici</p>
          <p className="mt-1 text-sm text-muted-foreground">ou cliquez pour parcourir</p>
          <input ref={input} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
        </div>
        <Panel title="Démarrer rapidement">
          <div className="space-y-2">
            <Button className="w-full justify-start" onClick={() => load(sampleCSV(), "Jeu d'exemple — Dakar")}>
              <Sparkles className="mr-2 h-4 w-4" /> Utiliser des données d'exemple
            </Button>
            <Button variant="outline" className="w-full justify-start" onClick={() => downloadBlob(new Blob([REQUIRED.join(";") + "\n"], { type: "text/csv" }), "modele_ETM.csv")}>
              <FileDown className="mr-2 h-4 w-4" /> Télécharger le modèle CSV
            </Button>
            {a.rows.length > 0 && (
              <Button variant="ghost" className="w-full justify-start text-muted-foreground" onClick={() => { a.clear(); setReport(null); }}>
                <Trash2 className="mr-2 h-4 w-4" /> Effacer les données
              </Button>
            )}
          </div>
          <div className="mt-4 text-xs text-muted-foreground">
            <div className="mb-1 font-medium text-foreground">Colonnes obligatoires</div>
            <div className="flex flex-wrap gap-1">
              {REQUIRED.map((c) => (
                <code key={c} className="rounded bg-muted px-1.5 py-0.5 font-mono">{c}</code>
              ))}
            </div>
          </div>
        </Panel>
      </div>

      {report?.missing.length ? (
        <div className="flex gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
          <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
          <div>
            <div className="font-semibold text-destructive">Fichier invalide : colonnes manquantes</div>
            <div className="mt-1">Colonnes absentes : <strong>{report.missing.join(", ")}</strong>. Utilisez le modèle CSV pour vérifier la structure.</div>
          </div>
        </div>
      ) : report ? (
        <div className="flex gap-3 rounded-xl border border-success/40 bg-success/10 p-4 text-sm">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
          <div>
            <strong>{report.kept}</strong> lignes valides sur {report.total}. {report.dropped > 0 && <>{report.dropped} ligne(s) incomplète(s) ou non numérique(s) supprimée(s).</>}
          </div>
        </div>
      ) : null}

      {a.rows.length > 0 && inMatrix === 0 && (
        <div className="flex gap-3 rounded-xl border border-warning/50 bg-warning/15 p-4 text-sm">
          <AlertTriangle className="h-5 w-5 shrink-0 text-warning" />
          <div>
            Aucune donnée ne correspond à la matrice <strong>{a.matrix}</strong>. Matrices présentes dans le fichier : {otherMatrices.join(", ")}.
          </div>
        </div>
      )}

      {a.rows.length > 0 && (
        <Panel title="Aperçu des données" desc={`Matrice ${a.matrix} · ${inMatrix} mesures`} actions={inMatrix > 0 && <Button asChild size="sm"><Link to="/tableau-de-bord">Voir le tableau de bord</Link></Button>}>
          <DataTable cols={cols} rows={a.matrixRows} />
        </Panel>
      )}
    </div>
  );
}
