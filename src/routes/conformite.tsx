import { createFileRoute } from "@tanstack/react-router";
import { Bar, BarChart, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyData, PageHeader, Panel } from "@/components/etm/ui";
import { DataTable } from "@/components/etm/DataTable";
import { confCols, exportCols } from "@/components/etm/columns";
import { useAnalysis } from "@/lib/etm/store";
import type { ConfRow } from "@/lib/etm/analysis";
import { pageHead } from "@/lib/etm/head";

export const Route = createFileRoute("/conformite")({
  head: pageHead("Analyse de conformité", "Comparaison de chaque mesure aux limites réglementaires du référentiel choisi."),
  component: Conformity,
});

const TIP = { background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 };

function Conformity() {
  const a = useAnalysis();
  if (!a.matrixRows.length) return (<><PageHeader title="Analyse de conformité" /><EmptyData /></>);
  const over = a.conf.filter((c) => c.status === "Dépassement");
  // Dépassements par élément, répartis selon leur gravité (mêmes seuils que les couleurs des lignes : ratio ≤ 2 orange, > 2 rouge)
  const sev = a.elements
    .map((el) => {
      const o = over.filter((x) => x.element === el);
      const high = o.filter((x) => (x.ratio ?? 0) > 2).length;
      return { element: el, modere: o.length - high, eleve: high, total: o.length };
    })
    .filter((x) => x.total > 0)
    .sort((x, y) => y.total - x.total);
  const maxRows = a.elements.map((el) => {
    const list = a.conf.filter((c) => c.element === el);
    const m = list.reduce((b, c) => ((c.ratio ?? -1) > (b.ratio ?? -1) || (b.ratio == null && c.concentration > b.concentration) ? c : b), list[0]!);
    return m;
  }).filter((m): m is ConfRow => m != null);
  const rowClass = (r: ConfRow) => (r.status === "Dépassement" ? ((r.ratio ?? 0) > 2 ? "bg-destructive/10" : "bg-warning/15") : "");
  return (
    <div className="space-y-4">
      <PageHeader title="Analyse de conformité" desc={`Référentiel : ${a.norm?.name}. Les lignes orange (1 < ratio ≤ 2) et rouges (ratio > 2) signalent un dépassement.`} />
      <Panel className="p-4" title="Toutes les mesures">
        <DataTable compact focusable title="Toutes les mesures" maxHeight="max-h-72" cols={confCols} rows={a.conf} rowClass={rowClass} actions={<Button size="sm" variant="outline" onClick={() => exportCols("conformite.csv", confCols, a.conf)}><Download className="mr-1.5 h-4 w-4" />CSV</Button>} />
      </Panel>
      <div className="grid gap-4 xl:grid-cols-5">
        <Panel title="Dépassements détectés" desc={`${over.length} mesure(s) au-dessus de la limite`} className="p-4 xl:col-span-3">
          <DataTable compact focusable title="Dépassements détectés" maxHeight="max-h-64" cols={confCols} rows={over} rowClass={rowClass} pageSize={15} />
        </Panel>
        <Panel
          title="Dépassements par élément"
          desc={sev.length ? `${sev.length} élément(s) concerné(s), du plus au moins touché` : undefined}
          className="flex flex-col p-4 xl:col-span-2"
        >
          {sev.length ? (
            <>
              <div className="mb-1 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-warning" />1 &lt; ratio ≤ 2</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-destructive" />ratio &gt; 2</span>
              </div>
              <div className="relative min-h-[230px] flex-1">
                <div className="absolute inset-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={sev} layout="vertical" margin={{ top: 4, right: 34, bottom: 0, left: 0 }} barCategoryGap="26%">
                      <XAxis type="number" hide />
                      <YAxis type="category" dataKey="element" tickLine={false} axisLine={false} width={42} tick={{ fontSize: 12, fontWeight: 600, fill: "var(--foreground)" }} />
                      <Tooltip contentStyle={TIP} cursor={{ fill: "var(--muted)", opacity: 0.45 }} />
                      <Bar dataKey="modere" name="1 < ratio ≤ 2" stackId="s" fill="var(--warning)" radius={6} stroke="var(--card)" strokeWidth={2} maxBarSize={26} />
                      <Bar dataKey="eleve" name="ratio > 2" stackId="s" fill="var(--destructive)" radius={6} stroke="var(--card)" strokeWidth={2} maxBarSize={26}>
                        <LabelList dataKey="total" position="right" style={{ fontSize: 12, fontWeight: 600, fill: "var(--foreground)" }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Aucun dépassement.</p>
          )}
        </Panel>
      </div>
      <Panel className="p-4" title="Concentrations maximales par élément">
        <DataTable compact focusable title="Concentrations maximales par élément" maxHeight="max-h-72" cols={confCols.filter((c) => c.key !== "d")} rows={maxRows} filterable={false} rowClass={rowClass} />
      </Panel>
    </div>
  );
}
