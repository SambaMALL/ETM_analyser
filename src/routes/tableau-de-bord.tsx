import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { Activity, AlertTriangle, ArrowUpRight, Atom, CheckCircle2, ShieldCheck } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EmptyData, ELEMENT_COLORS, NativeSelect } from "@/components/etm/ui";
import { useAnalysis } from "@/lib/etm/store";
import { fmt } from "@/lib/etm/analysis";
import { pageHead } from "@/lib/etm/head";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/tableau-de-bord")({
  head: pageHead("Tableau de bord", "Vue d'ensemble des stations, éléments analysés et du taux de conformité global."),
  component: Dashboard,
});

const TIP = { background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 };
const AXIS = { fontSize: 10, fill: "var(--muted-foreground)" };
const shortDate = (d: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  return m ? `${m[3]}/${m[2]}/${m[1]!.slice(2)}` : d;
};

function Card({ title, sub, actions, className, children }: { title: string; sub?: string; actions?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={cn("glass flex min-h-0 flex-col rounded-3xl p-4", className)}>
      <div className="mb-2 flex shrink-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold leading-tight">{title}</h2>
          {sub && <p className="truncate text-[11px] text-muted-foreground">{sub}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}
const GoBtn = ({ to, label }: { to: "/conformite" | "/cartographie" | "/graphiques"; label: string }) => (
  <Link to={to} title={label} aria-label={label} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-background/70 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
    <ArrowUpRight className="h-4 w-4" />
  </Link>
);
const Legend = ({ items }: { items: [string, string][] }) => (
  <div className="flex shrink-0 items-center gap-3 text-[11px] text-muted-foreground">
    {items.map(([c, l]) => (
      <span key={l} className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: c }} />{l}</span>
    ))}
  </div>
);

function Kpi({ label, value, unit, chip, icon: Icon, to, dark, tone }: { label: string; value: string | number; unit?: string; chip: string; icon: typeof Atom; to: "/conformite" | "/cartographie" | "/graphiques"; dark?: boolean; tone?: "bad" }) {
  return (
    <div className={cn("relative overflow-hidden rounded-3xl p-4", dark ? "bg-primary text-primary-foreground shadow-lg" : "glass")}>
      <Icon className={cn("pointer-events-none absolute -bottom-3 right-3 h-20 w-20", dark ? "opacity-10" : "opacity-[0.06]")} />
      <div className="flex items-start justify-between">
        <span className={cn("text-xs", dark ? "opacity-80" : "text-muted-foreground")}>{label}</span>
        <Link to={to} aria-label={label} className={cn("flex h-7 w-7 items-center justify-center rounded-full", dark ? "bg-primary-foreground/20 hover:bg-primary-foreground/30" : "border bg-background/70 text-muted-foreground hover:bg-accent")}>
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="font-mono text-3xl font-semibold tabular-nums leading-none">{value}</span>
        {unit && <span className={cn("text-xs", dark ? "opacity-70" : "text-muted-foreground")}>{unit}</span>}
      </div>
      <span className={cn("mt-2 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium", dark ? "bg-primary-foreground/20" : tone === "bad" ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground")}>{chip}</span>
    </div>
  );
}

function Dashboard() {
  const a = useAnalysis();
  const [pct, setPct] = useState("count");
  const [by, setBy] = useState<string | null>(null);

  if (!a.matrixRows.length) return (<><h1 className="mb-6 text-3xl font-light text-primary">Tableau de bord</h1><EmptyData /></>);
  const k = a.kpi;
  const withNorm = k.ok + k.over;

  const byEl = a.elements.map((el) => {
    const r = a.conf.filter((c) => c.element === el);
    return { element: el, Conformes: r.filter((x) => x.status === "Conforme").length, Dépassements: r.filter((x) => x.status === "Dépassement").length, "Sans norme": r.filter((x) => x.status === "Norme non disponible").length };
  });

  const dates = new Set(a.conf.map((c) => c.date));
  const view = by ?? (dates.size > 1 ? "date" : "station");
  const trend = (() => {
    const m = new Map<string, { label: string; Conformes: number; Dépassements: number }>();
    for (const c of a.conf) {
      if (c.status === "Norme non disponible") continue;
      const key = view === "date" ? c.date : c.station;
      const e = m.get(key) ?? { label: view === "date" ? shortDate(key) : key, Conformes: 0, Dépassements: 0 };
      if (c.status === "Conforme") e.Conformes++;
      else e.Dépassements++;
      m.set(key, e);
    }
    const rows = [...m.entries()];
    if (view === "date") rows.sort((x, y) => x[0].localeCompare(y[0]));
    return rows.map(([, v]) => v);
  })();

  const worst = a.conf
    .filter((c) => c.status === "Dépassement" && c.ratio != null)
    .sort((x, y) => (y.ratio ?? 0) - (x.ratio ?? 0))
    .slice(0, 4);

  return (
    <div className="flex flex-col gap-3 lg:h-[calc(100vh-8.5rem)] lg:min-h-[560px]">
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-x-4">
        <h1 className="text-2xl font-light tracking-tight text-primary">Tableau de bord</h1>
        <p className="text-xs text-muted-foreground">Matrice {a.matrix} · référentiel {a.norm?.name}</p>
      </div>

      <div className="grid shrink-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi dark label="Taux de conformité" value={k.rate.toFixed(1)} unit="%" chip={`${k.ok} / ${withNorm} mesures conformes`} icon={ShieldCheck} to="/conformite" />
        <Kpi label="Mesures totales" value={k.total} chip={`${k.stations} stations`} icon={Activity} to="/graphiques" />
        <Kpi label="Éléments analysés" value={k.elements} chip={`Matrice ${a.matrix}`} icon={Atom} to="/cartographie" />
        <Kpi label="Dépassements" value={k.over} chip={`${k.total ? ((k.over / k.total) * 100).toFixed(1) : "0"} % des mesures`} icon={AlertTriangle} to="/conformite" tone="bad" />
      </div>

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-2 lg:grid-rows-2">
        <Card
          className="h-72 lg:col-start-1 lg:row-start-1 lg:h-auto"
          title="Statut des mesures par élément"
          actions={<NativeSelect className="h-8 shrink-0 text-xs" value={pct} onChange={setPct} options={[{ value: "count", label: "Nombre" }, { value: "pct", label: "Pourcentage" }]} />}
        >
          <Legend items={[["var(--success)", "Conformes"], ["var(--destructive)", "Dépassements"], ["var(--muted-foreground)", "Sans norme"]]} />
          <div className="relative min-h-0 flex-1">
            <div className="absolute inset-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byEl} stackOffset={pct === "pct" ? "expand" : "none"} margin={{ top: 4, right: 4, bottom: 0, left: -18 }} barCategoryGap="22%">
                <defs>
                  <pattern id="hatchOk" patternUnits="userSpaceOnUse" width="7" height="7" patternTransform="rotate(45)">
                    <rect width="7" height="7" style={{ fill: "var(--success)", fillOpacity: 0.22 }} />
                    <line x1="0" y1="0" x2="0" y2="7" style={{ stroke: "var(--success)" }} strokeWidth="3.5" />
                  </pattern>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis dataKey="element" tickLine={false} axisLine={false} tick={AXIS} />
                <YAxis tickLine={false} axisLine={false} tick={AXIS} allowDecimals={false} tickFormatter={(v) => (pct === "pct" ? `${Math.round(Number(v) * 100)}%` : String(v))} />
                <Tooltip contentStyle={TIP} cursor={{ fill: "var(--muted)", opacity: 0.45 }} />
                <Bar dataKey="Conformes" stackId="a" fill="url(#hatchOk)" stroke="var(--success)" strokeOpacity={0.5} />
                <Bar dataKey="Dépassements" stackId="a" fill="var(--destructive)" />
                <Bar dataKey="Sans norme" stackId="a" fill="var(--muted-foreground)" fillOpacity={0.35} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            </div>
          </div>
        </Card>

        <Card
          className="h-80 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:h-auto"
          title="Conformité des mesures"
          sub={view === "date" ? "Évolution par date de prélèvement" : "Répartition par station"}
          actions={<NativeSelect className="h-8 shrink-0 text-xs" value={view} onChange={setBy} options={[{ value: "date", label: "Par date" }, { value: "station", label: "Par station" }]} />}
        >
          <Legend items={[["var(--success)", "Conformes"], ["var(--destructive)", "Dépassements"]]} />
          <div className="relative min-h-0 flex-1">
            <div className="absolute inset-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
                <defs>
                  <linearGradient id="gOk" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" style={{ stopColor: "var(--success)", stopOpacity: 0.5 }} />
                    <stop offset="100%" style={{ stopColor: "var(--success)", stopOpacity: 0.02 }} />
                  </linearGradient>
                  <linearGradient id="gOver" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" style={{ stopColor: "var(--destructive)", stopOpacity: 0.45 }} />
                    <stop offset="100%" style={{ stopColor: "var(--destructive)", stopOpacity: 0.02 }} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={AXIS} interval="preserveStartEnd" tickFormatter={(v) => (view === "station" ? String(v).slice(0, 9) : String(v))} />
                <YAxis tickLine={false} axisLine={false} tick={AXIS} allowDecimals={false} />
                <Tooltip contentStyle={TIP} />
                <Area type="monotone" dataKey="Conformes" stroke="var(--success)" strokeWidth={2} fill="url(#gOk)" dot={false} activeDot={{ r: 4 }} />
                <Area type="monotone" dataKey="Dépassements" stroke="var(--destructive)" strokeWidth={2} fill="url(#gOver)" dot={false} activeDot={{ r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
            </div>
          </div>
        </Card>

        <Card className="lg:col-start-1 lg:row-start-2 lg:h-auto" title="Principaux dépassements" sub="Classés par ratio concentration / limite" actions={<GoBtn to="/conformite" label="Voir l'analyse de conformité" />}>
          {worst.length ? (
            <div className="flex min-h-0 flex-1 flex-col text-xs">
              <div className="grid shrink-0 grid-cols-[1.6fr_0.8fr_1.1fr_0.7fr] rounded-xl bg-muted/70 px-3 py-2 font-medium text-muted-foreground">
                <span>Station</span><span>Élément</span><span>Concentration</span><span className="text-right">Ratio</span>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {worst.map((r, i) => (
                  <div key={`${r.station}-${r.element}-${r.date}-${i}`} className={cn("grid grid-cols-[1.6fr_0.8fr_1.1fr_0.7fr] items-center rounded-xl px-3 py-1.5", i % 2 === 1 && "bg-muted/50")}>
                    <span className="min-w-0"><span className="block truncate font-medium">{r.station}</span><span className="block text-[10px] text-muted-foreground">{shortDate(r.date)}</span></span>
                    <span className="flex items-center gap-1.5 font-medium"><span className="h-2 w-2 rounded-full" style={{ background: ELEMENT_COLORS[a.elements.indexOf(r.element) % ELEMENT_COLORS.length] }} />{r.element}</span>
                    <span className="font-mono">{fmt(r.concentration, 3)} <span className="text-muted-foreground">{r.unite}</span></span>
                    <span className="text-right"><span className="inline-block rounded-full bg-destructive/15 px-2 py-0.5 font-mono font-semibold text-destructive">×{fmt(r.ratio, 2)}</span></span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-1 text-center text-sm text-muted-foreground">
              <CheckCircle2 className="h-7 w-7 text-success" />
              Aucun dépassement détecté.
            </div>
          )}
        </Card>

      </div>
    </div>
  );
}
