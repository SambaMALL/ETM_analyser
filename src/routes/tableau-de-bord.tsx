import { createFileRoute } from "@tanstack/react-router";
import { MapPin, Atom, Hash, CheckCircle2, AlertTriangle } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { EmptyData, PageHeader, Panel } from "@/components/etm/ui";
import { useAnalysis } from "@/lib/etm/store";
import { pageHead } from "@/lib/etm/head";

export const Route = createFileRoute("/tableau-de-bord")({
  head: pageHead("Tableau de bord", "Vue d'ensemble des stations, éléments analysés et du taux de conformité global."),
  component: Dashboard,
});

function Dashboard() {
  const a = useAnalysis();
  if (!a.matrixRows.length) return (<><PageHeader title="Tableau de bord" /><EmptyData /></>);
  const k = a.kpi;
  const cards = [
    { label: "Stations", v: k.stations, icon: MapPin, c: "text-primary bg-primary/10" },
    { label: "Éléments analysés", v: k.elements, icon: Atom, c: "text-primary bg-primary/10" },
    { label: "Mesures totales", v: k.total, icon: Hash, c: "text-primary bg-primary/10" },
    { label: "Mesures conformes", v: k.ok, icon: CheckCircle2, c: "text-success bg-success/15" },
    { label: "Dépassements", v: k.over, icon: AlertTriangle, c: "text-destructive bg-destructive/15" },
  ];
  const byEl = a.elements.map((el) => {
    const r = a.conf.filter((c) => c.element === el);
    return { element: el, Conformes: r.filter((x) => x.status === "Conforme").length, Dépassements: r.filter((x) => x.status === "Dépassement").length, "Sans norme": r.filter((x) => x.status === "Norme non disponible").length };
  });
  return (
    <div className="space-y-6">
      <PageHeader title="Tableau de bord" desc={`Matrice ${a.matrix} · référentiel ${a.norm?.name}`} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border bg-card p-4 shadow-sm">
            <div className={`mb-3 inline-flex h-8 w-8 items-center justify-center rounded-lg ${c.c}`}>
              <c.icon className="h-4 w-4" />
            </div>
            <div className="font-mono text-2xl font-semibold tabular-nums">{c.v}</div>
            <div className="text-xs text-muted-foreground">{c.label}</div>
          </div>
        ))}
      </div>
      <Panel title="Taux de conformité global" desc="Calculé sur les mesures disposant d'une norme applicable">
        <div className="flex items-center gap-4">
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-destructive/20">
            <div className="h-full rounded-full bg-success transition-all" style={{ width: `${k.rate}%` }} />
          </div>
          <div className="font-mono text-2xl font-semibold tabular-nums">{k.rate.toFixed(1)} %</div>
        </div>
      </Panel>
      <Panel title="Statut des mesures par élément">
        <div className="h-72">
          <ResponsiveContainer>
            <BarChart data={byEl}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="element" stroke="var(--muted-foreground)" fontSize={12} />
              <YAxis stroke="var(--muted-foreground)" fontSize={12} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8 }} />
              <Legend />
              <Bar dataKey="Conformes" stackId="a" fill="var(--success)" />
              <Bar dataKey="Dépassements" stackId="a" fill="var(--destructive)" />
              <Bar dataKey="Sans norme" stackId="a" fill="var(--chart-6)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>
    </div>
  );
}
