import { createFileRoute } from "@tanstack/react-router";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
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

function Conformity() {
  const a = useAnalysis();
  if (!a.matrixRows.length) return (<><PageHeader title="Analyse de conformité" /><EmptyData /></>);
  const over = a.conf.filter((c) => c.status === "Dépassement");
  const counts = a.elements.map((el) => ({ element: el, n: over.filter((o) => o.element === el).length })).filter((x) => x.n > 0);
  const maxRows = a.elements.map((el) => {
    const list = a.conf.filter((c) => c.element === el);
    const m = list.reduce((b, c) => ((c.ratio ?? -1) > (b.ratio ?? -1) || (b.ratio == null && c.concentration > b.concentration) ? c : b), list[0]!);
    return m;
  }).filter((m): m is ConfRow => m != null);
  const rowClass = (r: ConfRow) => (r.status === "Dépassement" ? ((r.ratio ?? 0) > 2 ? "bg-destructive/10" : "bg-warning/15") : "");
  return (
    <div className="space-y-6">
      <PageHeader title="Analyse de conformité" desc={`Référentiel : ${a.norm?.name}. Les lignes orange (1 < ratio ≤ 2) et rouges (ratio > 2) signalent un dépassement.`} />
      <Panel title="Toutes les mesures">
        <DataTable cols={confCols} rows={a.conf} rowClass={rowClass} actions={<Button size="sm" variant="outline" onClick={() => exportCols("conformite.csv", confCols, a.conf)}><Download className="mr-1.5 h-4 w-4" />CSV</Button>} />
      </Panel>
      <div className="grid gap-6 xl:grid-cols-5">
        <Panel title="Dépassements détectés" desc={`${over.length} mesure(s) au-dessus de la limite`} className="xl:col-span-3">
          <DataTable cols={confCols} rows={over} rowClass={rowClass} pageSize={15} />
        </Panel>
        <Panel title="Dépassements par élément" className="xl:col-span-2">
          {counts.length ? (
            <div className="h-72">
              <ResponsiveContainer>
                <BarChart data={counts}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="element" stroke="var(--muted-foreground)" fontSize={12} />
                  <YAxis allowDecimals={false} stroke="var(--muted-foreground)" fontSize={12} />
                  <Tooltip formatter={(v) => [v, "Dépassements"]} contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8 }} />
                  <Bar dataKey="n" fill="var(--destructive)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Aucun dépassement.</p>
          )}
        </Panel>
      </div>
      <Panel title="Concentrations maximales par élément">
        <DataTable cols={confCols.filter((c) => c.key !== "d")} rows={maxRows} filterable={false} rowClass={rowClass} />
      </Panel>
    </div>
  );
}
