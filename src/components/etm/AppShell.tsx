import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  Upload, LayoutDashboard, ShieldCheck, FlaskConical, BarChart3, Map, FileText, BookOpen, ChevronDown, Moon, Sun, Atom, Menu, X,
} from "lucide-react";
import { useAnalysis } from "@/lib/etm/store";
import { MATRICES, normsFor } from "@/lib/etm/norms";
import { NativeSelect } from "./ui";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Import des données", icon: Upload },
  { to: "/tableau-de-bord", label: "Tableau de bord", icon: LayoutDashboard },
  { to: "/conformite", label: "Analyse de conformité", icon: ShieldCheck },
  { to: "/indices", label: "Indices de pollution", icon: FlaskConical },
  { to: "/graphiques", label: "Graphiques", icon: BarChart3 },
  { to: "/cartographie", label: "Cartographie & Interpolation", icon: Map },
  { to: "/rapport", label: "Rapport & Export", icon: FileText },
  { to: "/references", label: "Références scientifiques", icon: BookOpen },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const a = useAnalysis();
  const [open, setOpen] = useState(false);
  const [verif, setVerif] = useState(false);
  const [dark, setDark] = useState(false);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 flex items-center gap-2 border-b bg-card px-4 py-3 lg:hidden">
        <button onClick={() => setOpen((o) => !o)} aria-label="Menu">
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
        <span className="font-semibold">ETM Analyzer</span>
      </header>
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-72 flex-col overflow-y-auto border-r bg-sidebar text-sidebar-foreground transition-transform lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center gap-2.5 px-5 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Atom className="h-5 w-5" />
          </div>
          <div>
            <div className="font-semibold leading-tight">ETM Analyzer</div>
            <div className="text-[11px] text-muted-foreground">Éléments Traces Métalliques</div>
          </div>
        </div>

        <nav className="space-y-0.5 px-3">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              onClick={() => setOpen(false)}
              activeOptions={{ exact: true }}
              className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
              activeProps={{ className: "!bg-primary !text-primary-foreground font-medium" }}
            >
              <n.icon className="h-4 w-4" />
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="mx-5 my-5 border-t" />
        <div className="space-y-4 px-5 pb-5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Paramètres globaux</div>
          <div>
            <label className="mb-1.5 block text-xs font-medium">Matrice</label>
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
              {MATRICES.map((m) => (
                <button
                  key={m}
                  onClick={() => a.setMatrix(m)}
                  className={cn("rounded-md py-1.5 text-sm transition-colors", a.matrix === m ? "bg-card font-medium shadow-sm" : "text-muted-foreground hover:text-foreground")}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium">Référentiel normatif</label>
            <NativeSelect className="w-full" value={a.normId} onChange={a.setNormId} options={normsFor(a.matrix).map((n) => ({ value: n.id, label: n.name }))} />
          </div>
          <div className="rounded-lg border bg-card">
            <button onClick={() => setVerif((v) => !v)} className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium">
              Vérification du référentiel
              <ChevronDown className={cn("h-4 w-4 transition-transform", verif && "rotate-180")} />
            </button>
            {verif && a.norm && (
              <div className="border-t p-2">
                <table className="w-full text-[11px]">
                  <thead className="text-muted-foreground">
                    <tr>
                      <th className="text-left font-medium">Élém.</th>
                      <th className="text-right font-medium">Limite</th>
                      <th className="pl-1 text-left font-medium">Unité</th>
                      <th className="text-left font-medium">Période</th>
                    </tr>
                  </thead>
                  <tbody>
                    {a.norm.limits.map((l) => (
                      <tr key={l.element} className="border-t">
                        <td className="py-0.5 font-medium">{l.element}</td>
                        <td className="text-right font-mono">{l.limit}</td>
                        <td className="pl-1">{l.unit}</td>
                        <td className="text-muted-foreground">{l.period}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-2 text-[10px] leading-snug text-muted-foreground">{a.norm.source}</p>
              </div>
            )}
          </div>
          <div className="rounded-lg bg-muted/60 p-3 text-xs">
            {a.rows.length ? (
              <>
                <div className="font-medium">{a.source}</div>
                <div className="text-muted-foreground">
                  {a.kpi.total} mesures · {a.kpi.stations} stations ({a.matrix})
                </div>
              </>
            ) : (
              <span className="text-muted-foreground">Aucune donnée chargée</span>
            )}
          </div>
          <button onClick={() => setDark((d) => !d)} className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            Mode {dark ? "clair" : "sombre"}
          </button>
        </div>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-foreground/30 lg:hidden" onClick={() => setOpen(false)} />}
      <main className="lg:pl-72">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-8">{children}</div>
      </main>
    </div>
  );
}
