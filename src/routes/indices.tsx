import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Download, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyData, PageHeader, Panel } from "@/components/etm/ui";
import { DataTable } from "@/components/etm/DataTable";
import { exportCols, idxCols, stationCols } from "@/components/etm/columns";
import { useAnalysis } from "@/lib/etm/store";
import { BASE_UNIT, TOXIC_FACTOR } from "@/lib/etm/norms";
import { pageHead } from "@/lib/etm/head";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/indices")({
  head: pageHead("Indices de pollution", "Calcul des indices géochimiques FC, Igeo, PI, Er, PLI, Cd, RI et Nemerow par station."),
  component: Indices,
});

const LEGEND = [
  ["FC = C / Cref", "<1 faible · 1–3 modérée · 3–6 considérable · ≥6 très élevée (Hakanson, 1980)"],
  ["Igeo = log₂(C / 1,5·Cref)", "≤0 non pollué … >5 extrêmement pollué (Müller, 1969)"],
  ["PI = FC", "≤1 non pollué · 1–2 faible · 2–3 modérée · >3 forte"],
  ["Er = Tr × FC", "<40 faible · 40–80 modéré · 80–160 considérable · 160–320 élevé · ≥320 très élevé"],
  ["PLI = (ΠFC)^(1/n)", "<1 pas de pollution · =1 niveau de base · >1 détérioration (Tomlinson et al., 1980)"],
  ["Cd = ΣFC", "<8 faible · 8–16 modéré · 16–32 considérable · ≥32 très élevé"],
  ["RI = ΣEr", "<150 faible · 150–300 modéré · 300–600 considérable · ≥600 très élevé"],
  ["Nemerow = √((P̄I² + PImax²)/2)", "≤0,7 propre · 0,7–1 alerte · 1–2 légère · 2–3 modérée · >3 forte"],
];

function Indices() {
  const a = useAnalysis();
  const [tab, setTab] = useState<"el" | "st">("el");
  if (!a.matrixRows.length) return (<><PageHeader title="Indices de pollution" /><EmptyData /></>);
  return (
    <div className="space-y-6">
      <PageHeader title="Indices de pollution géochimiques" desc="Les indices sont calculés sur la concentration moyenne par station et par élément, rapportée à la valeur de fond géochimique saisie ci-dessous." />
      <Panel
        title="Concentrations de référence (fond géochimique)"
        desc={`Unité : ${BASE_UNIT[a.matrix]}. ${a.matrix === "Sol" ? "Valeurs par défaut : shale moyen (Turekian & Wedepohl, 1961)." : "Par défaut : limite du référentiel choisi."}`}
        actions={
          <Button size="sm" variant="ghost" onClick={() => a.elements.forEach((el) => a.setRef(el, undefined))}>
            <RotateCcw className="mr-1.5 h-4 w-4" />
            Valeurs par défaut
          </Button>
        }
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9">
          {a.elements.map((el) => (
            <label key={el} className="rounded-lg border p-2.5">
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="font-semibold">{el}</span>
                <span className="text-muted-foreground">Tr {TOXIC_FACTOR[el] ?? "—"}</span>
              </div>
              <Input
                type="number"
                step="any"
                min={0}
                className={cn("h-8 font-mono", a.refs[el] != null && "border-primary")}
                value={a.refOf(el)}
                onChange={(e) => a.setRef(el, parseFloat(e.target.value))}
              />
            </label>
          ))}
        </div>
      </Panel>

      <div className="inline-flex rounded-lg bg-muted p-1">
        {[
          ["el", "Par station et élément (FC, Igeo, PI, Er)"],
          ["st", "Indices intégrés par station (PLI, Cd, RI, Nemerow)"],
        ].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k as "el" | "st")} className={cn("rounded-md px-3 py-1.5 text-sm", tab === k ? "bg-card font-medium shadow-sm" : "text-muted-foreground")}>
            {l}
          </button>
        ))}
      </div>

      {tab === "el" ? (
        <Panel>
          <DataTable cols={idxCols} rows={a.idx} actions={<Button size="sm" variant="outline" onClick={() => exportCols("indices_elements.csv", idxCols, a.idx)}><Download className="mr-1.5 h-4 w-4" />Exporter CSV</Button>} />
        </Panel>
      ) : (
        <Panel>
          <DataTable cols={stationCols} rows={a.stations} actions={<Button size="sm" variant="outline" onClick={() => exportCols("indices_stations.csv", stationCols, a.stations)}><Download className="mr-1.5 h-4 w-4" />Exporter CSV</Button>} />
        </Panel>
      )}

      <Panel title="Formules et classes d'interprétation">
        <dl className="grid gap-x-8 gap-y-3 text-sm md:grid-cols-2">
          {LEGEND.map(([f, d]) => (
            <div key={f}>
              <dt className="font-mono text-xs font-medium text-primary">{f}</dt>
              <dd className="text-muted-foreground">{d}</dd>
            </div>
          ))}
        </dl>
      </Panel>
    </div>
  );
}
