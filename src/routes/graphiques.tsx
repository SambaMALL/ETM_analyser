import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ELEMENT_COLORS, EmptyData, NativeSelect, PageHeader, Panel } from "@/components/etm/ui";
import { useAnalysis } from "@/lib/etm/store";
import { fmt, type IndexRow } from "@/lib/etm/analysis";
import { BASE_UNIT } from "@/lib/etm/norms";
import { pageHead } from "@/lib/etm/head";

export const Route = createFileRoute("/graphiques")({
  head: pageHead("Graphiques", "Graphiques interactifs des concentrations et indices de pollution par station."),
  component: Charts,
});

const VARS: { k: keyof IndexRow; label: string; ref?: number }[] = [
  { k: "conc", label: "Concentration" },
  { k: "fc", label: "FC", ref: 1 },
  { k: "igeo", label: "Igeo", ref: 0 },
  { k: "pi", label: "PI", ref: 1 },
  { k: "er", label: "Er", ref: 40 },
];

function Charts() {
  const a = useAnalysis();
  const [v, setV] = useState("conc");
  const [el, setEl] = useState("Tous");
  if (!a.matrixRows.length) return (<><PageHeader title="Graphiques" /><EmptyData /></>);
  const variable = VARS.find((x) => x.k === v)!;
  const els = el === "Tous" ? a.elements : [el];
  const data = a.stationNames.map((st) => {
    const o: Record<string, string | number | null> = { station: st };
    for (const e of els) {
      const r = a.idx.find((i) => i.station === st && i.element === e);
      const val = r ? (r[variable.k] as number | null) : null;
      o[e] = val != null && Number.isFinite(val) ? val : null;
    }
    return o;
  });
  const unit = v === "conc" ? ` (${BASE_UNIT[a.matrix]})` : "";
  return (
    <div className="space-y-6">
      <PageHeader title="Graphiques" desc="Survolez les barres pour afficher la valeur exacte.">
        <div className="flex gap-2">
          <NativeSelect value={v} onChange={setV} options={VARS.map((x) => ({ value: x.k, label: x.label }))} />
          <NativeSelect value={el} onChange={setEl} options={[{ value: "Tous", label: "Tous les éléments" }, ...a.elements.map((e) => ({ value: e, label: e }))]} />
        </div>
      </PageHeader>
      <Panel title={`${variable.label}${unit} par station`} desc={el === "Tous" ? "Tous les éléments" : `Élément : ${el}`}>
        <div className="h-[460px]">
          <ResponsiveContainer>
            <BarChart data={data} margin={{ bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="station" angle={-35} textAnchor="end" interval={0} stroke="var(--muted-foreground)" fontSize={11} />
              <YAxis stroke="var(--muted-foreground)" fontSize={11} tickFormatter={(x) => fmt(x, 2)} scale={v === "conc" && el === "Tous" ? "log" : "auto"} domain={["auto", "auto"]} allowDataOverflow />
              <Tooltip formatter={(x) => fmt(Number(x), 4)} contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8 }} />
              <Legend verticalAlign="top" />
              {variable.ref != null && <ReferenceLine y={variable.ref} stroke="var(--destructive)" strokeDasharray="4 4" label={{ value: `seuil ${variable.ref}`, fill: "var(--destructive)", fontSize: 11, position: "right" }} />}
              {els.map((e) => (
                <Bar key={e} dataKey={e} fill={ELEMENT_COLORS[a.elements.indexOf(e) % ELEMENT_COLORS.length]} radius={[3, 3, 0, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
        {v === "conc" && el === "Tous" && <p className="mt-2 text-xs text-muted-foreground">Échelle logarithmique appliquée pour comparer des éléments d'ordres de grandeur différents.</p>}
      </Panel>
    </div>
  );
}
