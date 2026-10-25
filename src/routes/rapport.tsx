import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { FileText, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyData, NativeSelect, PageHeader, Panel } from "@/components/etm/ui";
import { confCols, exportCols, idxCols, stationCols } from "@/components/etm/columns";
import { useAnalysis } from "@/lib/etm/store";
import { convert } from "@/lib/etm/analysis";
import { BASE_UNIT } from "@/lib/etm/norms";
import { buildReport } from "@/lib/etm/report";
import type { MapSet } from "@/lib/etm/report-maps";
import type { SPoint, VModel } from "@/lib/etm/spatial";
import { pageHead } from "@/lib/etm/head";

export const Route = createFileRoute("/rapport")({
  head: pageHead("Rapport & Export", "Export CSV des résultats et génération d'un rapport scientifique Word."),
  component: Report,
});

const LABELS: Record<string, string> = { conc: "Concentration", fc: "FC", igeo: "Igeo", pi: "PI", er: "Er", pli: "PLI", cd: "Cd", ri: "RI", nemerow: "Nemerow" };
const ST_VARS = ["pli", "cd", "ri", "nemerow"] as const;
type ElVar = "conc" | "fc" | "igeo" | "pi" | "er";

function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />
      {children}
    </label>
  );
}

function Report() {
  const a = useAnalysis();
  const [busy, setBusy] = useState(false);
  const [v, setV] = useState("conc");
  const [els, setEls] = useState<string[] | null>(null);
  const [model, setModel] = useState<VModel>("spherical");
  const [inc, setInc] = useState({ stations: true, idw: true, krig: true, std: false, variogram: true });

  // Par défaut : les éléments qui dépassent la norme (4 au plus), sinon le premier élément.
  const defaultEls = useMemo(() => {
    const over = a.elements.filter((e) => a.conf.some((c) => c.element === e && c.status === "Dépassement"));
    return (over.length ? over : a.elements.slice(0, 1)).slice(0, 4);
  }, [a.elements, a.conf]);

  if (!a.matrixRows.length) return (<><PageHeader title="Rapport & Export" /><EmptyData /></>);

  const isStationVar = (ST_VARS as readonly string[]).includes(v);
  const chosen = (els ?? defaultEls).filter((e) => a.elements.includes(e));
  const anyFigure = inc.stations || inc.idw || inc.krig || inc.std || inc.variogram;
  const floor = v === "igeo" ? undefined : 0;
  const finite = (p: SPoint) => Number.isFinite(p.value);

  const buildSets = (): MapSet[] => {
    if (isStationVar)
      return [{ title: LABELS[v] ?? v, label: LABELS[v] ?? v, floor, points: a.stations.map((s) => ({ station: s.station, lat: s.lat, lon: s.lon, value: s[v as (typeof ST_VARS)[number]] })).filter(finite) }];
    return chosen.map((el) => {
      const lim = a.norm?.limits.find((l) => l.element === el);
      const limit = v === "conc" && lim && a.norm ? convert(lim.limit, lim.unit, BASE_UNIT[a.matrix]) : null;
      return {
        title: `${el} — ${LABELS[v] ?? v}`,
        label: `${LABELS[v] ?? v} — ${el}`,
        unit: v === "conc" ? BASE_UNIT[a.matrix] : undefined,
        limit,
        limitLabel: limit != null && lim && a.norm ? `${a.norm.name} (${lim.period})` : undefined,
        floor,
        points: a.idx.filter((i) => i.element === el).map((i) => ({ station: i.station, lat: i.lat, lon: i.lon, value: (i[v as ElVar] as number) ?? NaN })).filter(finite),
      };
    });
  };

  const gen = async () => {
    setBusy(true);
    try {
      const sets = buildSets();
      await buildReport({
        matrix: a.matrix, normName: a.norm?.name ?? "", rows: a.matrixRows, conf: a.conf, idx: a.idx, stations: a.stations, elements: a.elements, kpi: a.kpi,
        maps: anyFigure && sets.length ? { sets, opts: { ...inc, model } } : undefined,
      });
      toast.success("Rapport Word généré");
    } catch (e) {
      toast.error("Échec de la génération du rapport");
      console.error(e);
    } finally {
      setBusy(false);
    }
  };
  const toggleEl = (e: string) => setEls((cur) => { const base = cur ?? defaultEls; return base.includes(e) ? base.filter((x) => x !== e) : [...base, e]; });

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
        <Panel title="Rapport scientifique Word (.docx)" desc="Synthèse, coordonnées, conformité, indices, cartes d'interpolation et variogramme (options ci-dessous), données brutes et bibliographie.">
          <Button onClick={gen} disabled={busy}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}Générer le rapport</Button>
          {busy && <p className="mt-2 text-xs text-muted-foreground">Création des cartes en cours (chargement du fond de carte)…</p>}
        </Panel>
      </div>
      <Panel title="Cartes et variogramme du rapport" desc="Figures ajoutées au rapport Word : mêmes calculs que la page Cartographie (IDW avec puissance optimale, krigeage ordinaire, validation croisée).">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium">Variable à cartographier</label>
              <NativeSelect className="w-full" value={v} onChange={(x) => setV(x ?? "conc")} options={Object.entries(LABELS).map(([value, label]) => ({ value, label }))} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Modèle de variogramme (krigeage)</label>
              <NativeSelect className="w-full" value={model} onChange={(m) => setModel(m as VModel)} options={[{ value: "spherical", label: "Sphérique" }, { value: "exponential", label: "Exponentiel" }, { value: "gaussian", label: "Gaussien" }]} />
            </div>
            <div className="space-y-2">
              <div className="text-xs font-medium">Figures à inclure</div>
              <Check checked={inc.stations} onChange={(c) => setInc({ ...inc, stations: c })}>Carte des stations</Check>
              <Check checked={inc.idw} onChange={(c) => setInc({ ...inc, idw: c })}>Interpolation IDW</Check>
              <Check checked={inc.krig} onChange={(c) => setInc({ ...inc, krig: c })}>Krigeage ordinaire</Check>
              <Check checked={inc.std} onChange={(c) => setInc({ ...inc, std: c })}>Incertitude du krigeage (écart-type)</Check>
              <Check checked={inc.variogram} onChange={(c) => setInc({ ...inc, variogram: c })}>Variogramme</Check>
            </div>
          </div>
          <div>
            <div className="mb-2 text-xs font-medium">{isStationVar ? "Variable calculée par station" : "Éléments à cartographier"}</div>
            {isStationVar ? (
              <p className="text-sm text-muted-foreground">{LABELS[v]} est un indice par station : une seule carte par figure, tous éléments confondus.</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  {a.elements.map((e) => <Check key={e} checked={chosen.includes(e)} onChange={() => toggleEl(e)}>{e}</Check>)}
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  {chosen.length === 0 ? "Aucun élément sélectionné : aucune carte ne sera ajoutée." : chosen.length > 5 ? `${chosen.length} éléments : le rapport sera long (plusieurs figures par élément).` : "Par défaut, les éléments qui dépassent la norme sont présélectionnés."}
                </p>
              </>
            )}
            {!anyFigure && <p className="mt-3 text-xs text-muted-foreground">Aucune figure cochée : le rapport sera généré sans section cartographie.</p>}
          </div>
        </div>
      </Panel>
    </div>
  );
}
