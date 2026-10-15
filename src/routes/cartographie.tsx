import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertTriangle, Info } from "lucide-react";
import { CartesianGrid, ComposedChart, Line, ResponsiveContainer, Scatter, XAxis, YAxis } from "recharts";
import { Slider } from "@/components/ui/slider";
import { EmptyData, NativeSelect, PageHeader, Panel } from "@/components/etm/ui";
import { DataTable } from "@/components/etm/DataTable";
import { SpatialMap } from "@/components/etm/SpatialMap";
import { useAnalysis } from "@/lib/etm/store";
import { convert, fmt } from "@/lib/etm/analysis";
import { BASE_UNIT } from "@/lib/etm/norms";
import {
  bestIdwPower, computeGrid, crossValidate, fitVariogram, gamma, idwCrossValidate, idwPredictor,
  krigingPredictor, krigingStdPredictor, mergeDuplicates, type CVResult, type SPoint, type VModel,
} from "@/lib/etm/spatial";
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
  const [krigView, setKrigView] = useState<"pred" | "std">("pred");
  const element = el || a.elements[0] || "";

  // Le filtre est DANS le useMemo : sinon `points` changeait à chaque rendu et tout l'interpolation était recalculée.
  const points: SPoint[] = useMemo(() => {
    const raw: SPoint[] = (ST_VARS as readonly string[]).includes(v)
      ? a.stations.map((s) => ({ station: s.station, lat: s.lat, lon: s.lon, value: s[v as (typeof ST_VARS)[number]] }))
      : a.idx.filter((i) => i.element === element).map((i) => ({ station: i.station, lat: i.lat, lon: i.lon, value: (i[v as (typeof EL_VARS)[number]] as number) ?? NaN }));
    return raw.filter((p) => Number.isFinite(p.value));
  }, [a, v, element]);
  // Stations quasi confondues fusionnées (sinon matrice de krigeage singulière)
  const ipoints = useMemo(() => mergeDuplicates(points), [points]);
  // Toutes les variables sont positives sauf Igeo (log) : on ne laisse pas l'interpolation passer sous 0.
  const floor = v === "igeo" ? undefined : 0;

  const limitInfo = useMemo(() => {
    if (v !== "conc" || !a.norm) return null;
    const lim = a.norm.limits.find((l) => l.element === element);
    if (!lim) return null;
    const value = convert(lim.limit, lim.unit, BASE_UNIT[a.matrix]);
    if (value == null) return null;
    return { value, label: `${a.norm.name} (${lim.period})` };
  }, [v, a.norm, a.matrix, element]);

  const krig = useMemo(() => {
    if (mode !== "krig" || ipoints.length < 3) return null;
    const fit = fitVariogram(ipoints, model);
    return {
      fit,
      pred: computeGrid(ipoints, krigingPredictor(ipoints, model, fit.params), 60, { floor }),
      std: computeGrid(ipoints, krigingStdPredictor(ipoints, model, fit.params), 60),
      cv: crossValidate(ipoints, model, fit.params),
    };
  }, [mode, ipoints, model, floor]);
  const idw = useMemo(() => (mode === "idw" && ipoints.length >= 2 ? computeGrid(ipoints, idwPredictor(ipoints, power), 80, { floor }) : null), [mode, ipoints, power, floor]);
  const idwCv = useMemo(() => (mode === "idw" && ipoints.length >= 3 ? idwCrossValidate(ipoints, power) : null), [mode, ipoints, power]);
  const bestP = useMemo(() => (mode === "idw" && ipoints.length >= 3 ? bestIdwPower(ipoints) : null), [mode, ipoints]);

  if (!a.matrixRows.length) return (<><PageHeader title="Cartographie & Interpolation" /><EmptyData /></>);
  const isEl = (EL_VARS as readonly string[]).includes(v);
  const showStd = mode === "krig" && krigView === "std" && !!krig;
  const grid = mode === "idw" ? idw : mode === "krig" ? (showStd ? krig?.std : krig?.pred) : null;
  const mapLabel = showStd ? `Écart-type de krigeage (${LABELS[v] ?? v})` : (LABELS[v] ?? v);
  const cvRows = mode === "krig" ? krig?.cv.rows : mode === "idw" ? idwCv?.rows : null;

  const notes: string[] = [];
  if (mode !== "pts" && points.length !== ipoints.length)
    notes.push(`${points.length - ipoints.length} station(s) quasi confondue(s) ont été fusionnées (moyenne) pour l'interpolation.`);
  if (mode === "krig" && krig) {
    if (ipoints.length < 20) notes.push(`Seulement ${ipoints.length} stations : le variogramme repose sur très peu de paires de points (on recommande au moins 30 à 50 stations). Le krigeage reste indicatif.`);
    if (krig.fit.structure === "aucune") notes.push("Aucune structure spatiale nette : l'effet de pépite domine, donc le krigeage retombe sur la moyenne loin des stations. L'IDW ou la carte des stations est plus honnête ici.");
    if (krig.cv.skill <= 0) notes.push("La validation croisée n'améliore pas la prédiction par rapport à la simple moyenne des stations.");
  }
  if (mode === "idw" && idwCv && idwCv.skill <= 0) notes.push("La validation croisée n'améliore pas la prédiction par rapport à la simple moyenne des stations : essayez la puissance optimale ou la carte des stations.");

  return (
    <div className="space-y-6">
      <PageHeader title="Cartographie & Interpolation">
        <div className="flex gap-2">
          <NativeSelect value={v} onChange={(x) => setV(x ?? "conc")} options={Object.entries(LABELS).map(([value, label]) => ({ value, label }))} />
          {isEl && <NativeSelect value={element} onChange={(x) => setEl(x ?? "")} options={a.elements.map((e) => ({ value: e, label: e }))} />}
        </div>
      </PageHeader>
      <div className="glass flex gap-3 rounded-2xl p-4 text-sm">
        <Info className="h-5 w-5 shrink-0 text-primary" />
        <p>Les distances sont calculées en km sur un plan local centré sur les stations (erreur &lt; 0,1 % pour une zone de moins de 100 km). Les cartes d'interpolation sont limitées à l'enveloppe des stations plus une marge d'environ un espacement moyen : au-delà, la valeur estimée n'est plus fiable. Les valeurs interpolées ne descendent jamais sous 0 (sauf Igeo).</p>
      </div>
      {notes.length > 0 && (
        <div className="flex gap-3 rounded-2xl border border-warning/50 bg-warning/15 p-4 text-sm">
          <AlertTriangle className="h-5 w-5 shrink-0 text-warning" />
          <ul className="space-y-1">{notes.map((n) => <li key={n}>{n}</li>)}</ul>
        </div>
      )}
      <div className="inline-flex rounded-full bg-muted/70 p-1">
        {([["pts", "Stations"], ["idw", "Interpolation IDW"], ["krig", "Krigeage ordinaire"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setMode(k)} className={cn("rounded-full px-4 py-1.5 text-sm transition-colors", mode === k ? "bg-primary font-medium text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground")}>{l}</button>
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <Panel className="xl:col-span-2" title={`${LABELS[v]}${isEl ? ` — ${element}` : ""}${showStd ? " · incertitude" : ""}`}>
          {points.length ? (
            <SpatialMap points={points} grid={grid} label={mapLabel} limit={showStd ? null : limitInfo?.value} limitLabel={limitInfo?.label} neutralPoints={showStd} />
          ) : (
            <p className="text-sm text-muted-foreground">Aucune valeur.</p>
          )}
        </Panel>
        <div className="space-y-6">
          {mode === "idw" && (
            <Panel title="Paramètres IDW">
              <div className="mb-2 text-sm">Puissance : <span className="font-mono">{power.toFixed(1)}</span></div>
              <Slider min={0.5} max={5} step={0.5} value={[power]} onValueChange={([p]) => setPower(p ?? 2)} />
              {bestP && (
                <button onClick={() => setPower(bestP.power)} className="mt-2 text-xs text-primary hover:underline">
                  Puissance optimale : {bestP.power.toFixed(1)} (RMSE {fmt(bestP.rmse, 3)}){bestP.power !== power ? " — appliquer" : " ✓"}
                </button>
              )}
              {idw && <Stats g={idw} />}
              {idwCv && <CvStats cv={idwCv} />}
            </Panel>
          )}
          {mode === "krig" && (
            <Panel title="Krigeage ordinaire">
              {ipoints.length < 3 ? <p className="text-sm text-muted-foreground">Au moins 3 stations requises.</p> : (
                <>
                  <label className="mb-1 block text-xs font-medium">Modèle de variogramme</label>
                  <NativeSelect className="w-full" value={model} onChange={(m) => setModel(m as VModel)} options={[{ value: "spherical", label: "Sphérique" }, { value: "exponential", label: "Exponentiel" }, { value: "gaussian", label: "Gaussien" }]} />
                  <div className="mt-3 inline-flex rounded-full bg-muted/70 p-1 text-xs">
                    {([["pred", "Prédiction"], ["std", "Incertitude (σ)"]] as const).map(([k, l]) => (
                      <button key={k} onClick={() => setKrigView(k)} className={cn("rounded-full px-3 py-1 transition-colors", krigView === k ? "bg-primary font-medium text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>{l}</button>
                    ))}
                  </div>
                  {krig && (
                    <>
                      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                        <Kv k="Pépite" v={fmt(krig.fit.params.nugget, 3)} /><Kv k="Palier" v={fmt(krig.fit.params.sill, 3)} /><Kv k="Portée (km)" v={fmt(krig.fit.params.range, 2)} />
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                        <Kv k="Part de pépite" v={`${fmt(krig.fit.nugRatio * 100, 0)} %`} /><Kv k="Structure spatiale" v={krig.fit.structure} />
                      </div>
                      <Stats g={showStd ? krig.std : krig.pred} />
                      <div className="mt-3 text-xs font-semibold">Variogramme (empirique et modèle)</div>
                      <VariogramChart fit={krig.fit} model={model} />
                      <CvStats cv={krig.cv} />
                    </>
                  )}
                </>
              )}
            </Panel>
          )}
        </div>
      </div>
      {cvRows && (
        <Panel title="Observé vs. prédit (validation croisée)">
          <DataTable filterable={false} rows={cvRows} cols={[
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
  <div className="rounded-xl bg-muted/70 p-2"><div className="text-muted-foreground">{k}</div><div className="font-mono font-medium">{v}</div></div>
);
const Stats = ({ g }: { g: { min: number; mean: number; max: number } }) => (
  <div className="mt-3 grid grid-cols-3 gap-2 text-xs"><Kv k="Min" v={fmt(g.min, 3)} /><Kv k="Moyenne" v={fmt(g.mean, 3)} /><Kv k="Max" v={fmt(g.max, 3)} /></div>
);
const CvStats = ({ cv }: { cv: CVResult }) => (
  <>
    <div className="mt-3 text-xs font-semibold">Validation croisée (leave-one-out)</div>
    <div className="mt-1 grid grid-cols-3 gap-2 text-xs">
      <Kv k="MAE" v={fmt(cv.mae, 3)} /><Kv k="RMSE" v={fmt(cv.rmse, 3)} /><Kv k="Biais" v={fmt(cv.bias, 3)} />
    </div>
    <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
      <Kv k="Gain vs. moyenne" v={`${fmt(cv.skill * 100, 0)} %`} />
      {cv.msdr != null && <Kv k="Calibration σ (≈ 1)" v={fmt(cv.msdr, 2)} />}
    </div>
  </>
);

function VariogramChart({ fit, model }: { fit: ReturnType<typeof fitVariogram>; model: VModel }) {
  const curve = Array.from({ length: 41 }, (_, i) => {
    const h = Math.max((fit.cutoff * i) / 40, fit.cutoff * 1e-4);
    return { h, g: gamma(h, model, fit.params) };
  });
  return (
    <div className="mt-1">
      <ResponsiveContainer width="100%" height={190}>
        <ComposedChart margin={{ top: 8, right: 8, bottom: 16, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis type="number" dataKey="h" domain={[0, fit.cutoff]} tickFormatter={(x) => fmt(Number(x), 1)} tick={{ fontSize: 11 }} label={{ value: "Distance h (km)", position: "insideBottom", offset: -10, fontSize: 11 }} />
          <YAxis type="number" dataKey="g" domain={[0, "auto"]} tickFormatter={(x) => fmt(Number(x), 2)} tick={{ fontSize: 11 }} width={44} />
          <Scatter data={fit.bins} dataKey="g" fill="var(--chart-4)" isAnimationActive={false} />
          <Line data={curve} dataKey="g" stroke="var(--chart-1)" strokeWidth={2} dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
      <p className="text-[11px] text-muted-foreground">Points : semi-variance observée (paires jusqu'à {fmt(fit.cutoff, 1)} km) · Ligne : modèle ajusté.</p>
    </div>
  );
}
