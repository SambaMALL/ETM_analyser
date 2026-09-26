import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { FileText, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyData, PageHeader, Panel } from "@/components/etm/ui";
import { confCols, exportCols, idxCols, stationCols } from "@/components/etm/columns";
import { useAnalysis } from "@/lib/etm/store";
import { buildReport } from "@/lib/etm/report";
import { pageHead } from "@/lib/etm/head";

export const Route = createFileRoute("/rapport")({
  head: pageHead("Rapport & Export", "Export CSV des résultats et génération d'un rapport scientifique Word."),
  component: Report,
});

function Report() {
  const a = useAnalysis();
  const [busy, setBusy] = useState(false);
  if (!a.matrixRows.length) return (<><PageHeader title="Rapport & Export" /><EmptyData /></>);
  const gen = async () => {
    setBusy(true);
    try {
      await buildReport({ matrix: a.matrix, normName: a.norm?.name ?? "", rows: a.matrixRows, conf: a.conf, idx: a.idx, stations: a.stations, elements: a.elements, kpi: a.kpi });
      toast.success("Rapport Word généré");
    } catch (e) {
      toast.error("Échec de la génération du rapport");
      console.error(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-6">
      <PageHeader title="Rapport & Export" />
      <div className="grid gap-6 md:grid-cols-2">
        <Panel title="Export CSV des résultats">
          <div className="space-y-2">
            <Button variant="outline" className="w-full justify-start" onClick={() => exportCols("conformite.csv", confCols, a.conf)}><Download className="mr-2 h-4 w-4" />Résultats de conformité</Button>
            <Button variant="outline" className="w-full justify-start" onClick={() => exportCols("indices_elements.csv", idxCols, a.idx)}><Download className="mr-2 h-4 w-4" />Indices par station et élément</Button>
            <Button variant="outline" className="w-full justify-start" onClick={() => exportCols("indices_stations.csv", stationCols, a.stations)}><Download className="mr-2 h-4 w-4" />Indices intégrés par station</Button>
          </div>
        </Panel>
        <Panel title="Rapport scientifique Word (.docx)" desc="Synthèse, coordonnées, conformité, indices, graphiques, données brutes et bibliographie.">
          <Button onClick={gen} disabled={busy}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}Générer le rapport</Button>
        </Panel>
      </div>
    </div>
  );
}
