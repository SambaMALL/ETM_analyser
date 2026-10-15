import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  Upload, LayoutDashboard, ShieldCheck, FlaskConical, BarChart3, Map, FileText, BookOpen, ChevronDown, Moon, Sun, Atom,
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
  const [verif, setVerif] = useState(false);
  const [dark, setDark] = useState(false);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  return (
    <div className="min-h-screen">
      {/* Rail de navigation flottant : vertical sur ordinateur, barre en bas sur mobile */}
      <nav
        aria-label="Navigation principale"
        className="glass fixed bottom-3 left-1/2 z-40 flex max-w-[calc(100vw-1.5rem)] -translate-x-1/2 gap-1 overflow-x-auto rounded-full p-1.5 lg:bottom-auto lg:left-5 lg:top-1/2 lg:-translate-y-1/2 lg:translate-x-0 lg:flex-col lg:overflow-visible"
      >
        {NAV.map((n) => (
          <Link
            key={n.to}
            to={n.to}
            title={n.label}
            aria-label={n.label}
            activeOptions={{ exact: true }}
            className="group relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            activeProps={{ className: "!bg-primary !text-primary-foreground shadow-md" }}
          >
            <n.icon className="h-[18px] w-[18px]" />
            <span className="pointer-events-none absolute left-12 hidden whitespace-nowrap rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground opacity-0 shadow-lg transition-opacity group-hover:opacity-100 lg:block">
              {n.label}
            </span>
          </Link>
        ))}
        <div className="mx-2 my-1 border-t border-foreground/10 lg:mx-1" />
        <button
          onClick={() => setDark((d) => !d)}
          title={dark ? "Mode clair" : "Mode sombre"}
          aria-label={dark ? "Mode clair" : "Mode sombre"}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {dark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
        </button>
      </nav>

      {/* Barre supérieure en pilule : paramètres globaux */}
      <header className="sticky top-3 z-30 px-3 sm:px-6 lg:pl-24">
        <div className="mx-auto max-w-6xl">
          <div className="glass flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[2rem] px-4 py-2.5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Atom className="h-5 w-5" />
              </div>
              <div className="hidden leading-tight sm:block">
                <div className="font-semibold">ETM Analyzer</div>
                <div className="text-[11px] text-muted-foreground">Éléments Traces Métalliques</div>
              </div>
            </div>

            <div className="flex items-center gap-1 rounded-full bg-muted/70 p-1" role="group" aria-label="Matrice">
              {MATRICES.map((m) => (
                <button
                  key={m}
                  onClick={() => a.setMatrix(m)}
                  className={cn(
                    "rounded-full px-3.5 py-1.5 text-sm transition-colors",
                    a.matrix === m ? "bg-primary font-medium text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {m}
                </button>
              ))}
            </div>

            <NativeSelect
              className="min-w-0 max-w-[16rem] flex-1 sm:flex-none"
              value={a.normId}
              onChange={a.setNormId}
              options={normsFor(a.matrix).map((n) => ({ value: n.id, label: n.name }))}
            />

            <button
              onClick={() => setVerif((v) => !v)}
              className="flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Vérification du référentiel
              <ChevronDown className={cn("h-4 w-4 transition-transform", verif && "rotate-180")} />
            </button>

            <div className="ml-auto rounded-full bg-muted/70 px-3.5 py-1.5 text-xs">
              {a.rows.length ? (
                <>
                  <span className="font-medium">{a.source}</span>
                  <span className="text-muted-foreground"> · {a.kpi.total} mesures · {a.kpi.stations} stations ({a.matrix})</span>
                </>
              ) : (
                <span className="text-muted-foreground">Aucune donnée chargée</span>
              )}
            </div>
          </div>

          {verif && a.norm && (
            <div className="glass mt-2 max-h-80 overflow-y-auto rounded-3xl p-4">
              <table className="w-full text-xs">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="text-left font-medium">Élément</th>
                    <th className="text-right font-medium">Limite</th>
                    <th className="pl-3 text-left font-medium">Unité</th>
                    <th className="text-left font-medium">Période</th>
                  </tr>
                </thead>
                <tbody>
                  {a.norm.limits.map((l) => (
                    <tr key={l.element} className="border-t border-foreground/10">
                      <td className="py-1 font-medium">{l.element}</td>
                      <td className="text-right font-mono">{l.limit}</td>
                      <td className="pl-3">{l.unit}</td>
                      <td className="text-muted-foreground">{l.period}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-[11px] leading-snug text-muted-foreground">{a.norm.source}</p>
            </div>
          )}
        </div>
      </header>

      <main className="px-3 pb-28 pt-8 sm:px-6 lg:pb-10 lg:pl-24">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
