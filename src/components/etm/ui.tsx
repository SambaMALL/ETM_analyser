import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Interp } from "@/lib/etm/analysis";

export function PageHeader({ title, desc, children }: { title: string; desc?: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {desc && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{desc}</p>}
      </div>
      {children}
    </div>
  );
}

export function Panel({ title, desc, children, className, actions }: { title?: string; desc?: string; children: ReactNode; className?: string; actions?: ReactNode }) {
  return (
    <section className={cn("rounded-xl border bg-card p-5 shadow-sm", className)}>
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div>
            {title && <h2 className="text-base font-semibold">{title}</h2>}
            {desc && <p className="text-xs text-muted-foreground">{desc}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

const LEVEL = [
  "bg-success/15 text-success",
  "bg-primary/10 text-primary",
  "bg-warning/20 text-warning-foreground dark:text-warning",
  "bg-warning/30 text-warning-foreground dark:text-warning",
  "bg-destructive/15 text-destructive",
];
export function InterpBadge({ i }: { i: Interp }) {
  if (i.level < 0) return <span className="text-muted-foreground">—</span>;
  return <span className={cn("inline-block rounded-full px-2 py-0.5 text-xs font-medium", LEVEL[i.level])}>{i.label}</span>;
}

export function StatusBadge({ s }: { s: string }) {
  const c = s === "Conforme" ? "bg-success/15 text-success" : s === "Dépassement" ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground";
  return <span className={cn("inline-block rounded-full px-2 py-0.5 text-xs font-medium", c)}>{s}</span>;
}

export function EmptyData() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-card p-12 text-center">
      <Database className="mb-3 h-8 w-8 text-muted-foreground" />
      <h2 className="font-semibold">Aucune donnée pour cette matrice</h2>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">Importez un fichier CSV ou chargez le jeu d'exemple, puis vérifiez la matrice sélectionnée dans la barre latérale.</p>
      <Button asChild className="mt-4">
        <Link to="/">Importer des données</Link>
      </Button>
    </div>
  );
}

export const ELEMENT_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-6)", "var(--chart-7)", "var(--chart-8)", "var(--chart-9)"];

export function NativeSelect({ value, onChange, options, className }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; className?: string }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn("h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring", className)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
