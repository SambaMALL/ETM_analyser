import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { EmptyData, NativeSelect, PageHeader, Panel } from "@/components/etm/ui";
import { DataTable } from "@/components/etm/DataTable";
import { SpatialMap } from "@/components/etm/SpatialMap";
import { useAnalysis } from "@/lib/etm/store";
import { convert, fmt } from "@/lib/etm/analysis";
import { BASE_UNIT } from "@/lib/etm/norms";
import { computeGrid, crossValidate, fitVariogram, idwPredictor, krigingPredictor, type SPoint, type VModel } from "@/lib/etm/spatial";
import { pageHead } from "@/lib/etm/head";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/cartographie")({
  head: pageHead("Cartographie & Interpolation", "Carte des stations et interpolation spatiale IDW et krigeage ordinaire."),
  component: MapPage,
});

const EL_VARS = ["conc", "fc", "igeo", "pi", "er"] as const;
const ST_VARS = ["pli", "cd", "ri", "nemerow"] as const;
const LABELS: Record<string, string> = { conc: "Concentration", fc: "FC", igeo: "Igeo", pi: "PI", er: "Er", pli: "PLI", cd: "Cd", ri: "RI", nemerow: "Nemerow" };

function MapPage() {
  const a = useAnalysis();
  const [v, setV] = useState("conc");
  const [el, setEl] = useState("");
  const [mode, setMode] = useState<"pts" | "idw" | "krig">("pts");
  const [power, setPower] = useState(2);
  const [model, setModel] = useState<VModel>("spherical");
  const element = el || a.elements[0] || "";
  const points: SPoint[] = useMemo(() => {
    if ((ST_VARS as readonly string[]).includes(v))
      return a.stations.map((s) => ({ station: s.station, lat: s.lat, lon: s.lon, value: s[v as (typeof ST_VARS)[number]] }));
    return a.idx.filter((i) => i.element === element).map((i) => ({ station: i.station, lat: i.lat, lon: i.lon, value: (i[v as (typeof EL_VARS)[number]] as number) ?? NaN }));
  }, [a, v, element]).filter((p) => Number.isFinite(p.value));

  const limitInfo = useMemo(() => {
    if (v !== "conc" || !a.norm) return null;
    const lim = a.norm.limits.find((l) => l.element === element);
    if (!lim) return null;
    const value = convert(lim.limit, lim.unit, BASE_UNIT[a.matrix]);
    if (value == null) return null;
    return { value, label: `${a.norm.name} (${lim.period})` };
  }, [v, a.norm, a.matrix, element]);

  const krig = useMemo(() => {
    if (mode !== "krig" || points.length < 3) return null;
    const fit = fitVariogram(points, model);
    return { fit, grid: computeGrid(points, krigingPredictor(points, model, fit.params), 60), cv: crossValidate(points, model, fit.params) };
  }, [mode, points, model]);
  const idw = useMemo(() => (mode === "idw" && points.length >= 2 ? computeGrid(points, idwPredictor(points, power)) : null), [mode, points, power]);

  if (!a.matrixRows.length) return (<><PageHeader title="Cartographie & Interpolation" /><EmptyData /></>);
  const isEl = (EL_VARS as readonly string[]).includes(v);
  const grid = mode === "idw" ? idw : mode === "krig" ? krig?.grid : null;
  return (
    <div className="space-y-6">
      <PageHeader title="Cartographie & Interpolation">
        <div className="flex gap-2">
          <NativeSelect value={v} onChange={(x) => setV(x ?? "conc")} options={Object.entries(LABELS).map(([value, label]) => ({ value, label }))} />
          {isEl && <NativeSelect value={element} onChange={(x) => setEl(x ?? "")} options={a.elements.map((e) => ({ value: e, label: e }))} />}
        </div>
      </PageHeader>
      <div className="flex gap-3 rounded-xl border border-warning/50 bg-warning/15 p-4 text-sm">
        <AlertTriangle className="h-5 w-5 shrink-0 text-warning" />
        <p>Résultats d'interpolation <strong>préliminaires</strong> : les coordonnées géographiques sont approximées en km localement. Pour une étude rigoureuse, projetez les coordonnées dans un système métrique (ex. UTM) et vérifiez la densité d'échantillonnage.</p>
      </div>
      <div className="inline-flex rounded-lg bg-muted p-1">
        {([["pts", "Stations"], ["idw", "Interpolation IDW"], ["krig", "Krigeage ordinaire"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setMode(k)} className={cn("rounded-md px-3 py-1.5 text-sm", mode === k ? "bg-card font-medium shadow-sm" : "text-muted-foreground")}>{l}</button>
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <Panel className="xl:col-span-2" title={`${LABELS[v]}${isEl ? ` — ${element}` : ""}`}>
          {points.length ? (
            <SpatialMap points={points} grid={grid} label={LABELS[v] ?? v} limit={limitInfo?.value} limitLabel={limitInfo?.label} />
          ) : (
            <p className="text-sm text-muted-foreground">Aucune valeur.</p>
          )}
        </Panel>
        <div className="space-y-6">
          {mode === "idw" && (
            <Panel title="Paramètres IDW">
              <div className="mb-2 text-sm">Puissance : <span className="font-mono">{power.toFixed(1)}</span></div>
              <Slider min={0.5} max={5} step={0.5} value={[power]} onValueChange={([p]) => setPower(p ?? 2)} />
              {idw && <Stats g={idw} />}
            </Panel>
          )}
          {mode === "krig" && (
            <Panel title="Krigeage ordinaire">
              {points.length < 3 ? <p className="text-sm text-muted-foreground">Au moins 3 stations requises.</p> : (
                <>
                  <label className="mb-1 block text-xs font-medium">Modèle de variogramme</label>
                  <NativeSelect className="w-full" value={model} onChange={(m) => setModel(m as VModel)} options={[{ value: "spherical", label: "Sphérique" }, { value: "exponential", label: "Exponentiel" }, { value: "gaussian", label: "Gaussien" }]} />
                  {krig && (
                    <>
                      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                        <Kv k="Pépite" v={fmt(krig.fit.params.nugget, 3)} /><Kv k="Palier" v={fmt(krig.fit.params.sill, 3)} /><Kv k="Portée (km)" v={fmt(krig.fit.params.range, 2)} />
                      </div>
                      <Stats g={krig.grid} />
                      <div className="mt-3 text-xs font-semibold">Validation croisée (leave-one-out)</div>
                      <div className="mt-1 grid grid-cols-3 gap-2 text-xs">
                        <Kv k="MAE" v={fmt(krig.cv.mae, 3)} /><Kv k="RMSE" v={fmt(krig.cv.rmse, 3)} /><Kv k="Biais" v={fmt(krig.cv.bias, 3)} />
                      </div>
                    </>
                  )}
                </>
              )}
            </Panel>
          )}
        </div>
      </div>
      {mode === "krig" && krig && (
        <Panel title="Observé vs. prédit (validation croisée)">
          <DataTable filterable={false} rows={krig.cv.rows} cols={[
            { key: "s", label: "Station", value: (r) => r.station },
            { key: "o", label: "Observé", value: (r) => r.observed, render: (r) => fmt(r.observed, 4), num: true },
            { key: "p", label: "Prédit", value: (r) => r.predicted, render: (r) => fmt(r.predicted, 4), num: true },
            { key: "e", label: "Erreur", value: (r) => r.error, render: (r) => fmt(r.error, 4), num: true },
          ]} />
        </Panel>
      )}
      <Panel title="Données spatiales">
        <DataTable rows={points} cols={[
          { key: "s", label: "Station", value: (r) => r.station },
          { key: "la", label: "Latitude", value: (r) => r.lat, num: true },
          { key: "lo", label: "Longitude", value: (r) => r.lon, num: true },
          { key: "v", label: LABELS[v] ?? v, value: (r) => r.value, render: (r) => fmt(r.value, 4), num: true },
        ]} />
      </Panel>
    </div>
  );
}

const Kv = ({ k, v }: { k: string; v: string }) => (
  <div className="rounded-md bg-muted p-2"><div className="text-muted-foreground">{k}</div><div className="font-mono font-medium">{v}</div></div>
);
const Stats = ({ g }: { g: { min: number; mean: number; max: number } }) => (
  <div className="mt-3 grid grid-cols-3 gap-2 text-xs"><Kv k="Min" v={fmt(g.min, 3)} /><Kv k="Moyenne" v={fmt(g.mean, 3)} /><Kv k="Max" v={fmt(g.max, 3)} /></div>
);
