import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowDownUp, ArrowDown, ArrowUp, Maximize2, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface Col<T> {
  key: string;
  label: string;
  value: (r: T) => string | number | null;
  render?: (r: T) => ReactNode;
  num?: boolean;
}

export function DataTable<T>({
  cols,
  rows,
  rowClass,
  filterable = true,
  pageSize = 50,
  actions,
  compact = false,
  maxHeight,
  focusable = false,
  title,
}: {
  cols: Col<T>[];
  rows: T[];
  rowClass?: (r: T) => string;
  filterable?: boolean;
  pageSize?: number;
  actions?: ReactNode;
  /** Tableau réduit (texte et lignes plus petits). */
  compact?: boolean;
  /** Classe Tailwind de hauteur maximale (ex. "max-h-72") : au-delà, le tableau défile dans son cadre. */
  maxHeight?: string;
  /** Ajoute un bouton « Agrandir » qui ouvre le tableau en plein écran (mode focus). */
  focusable?: boolean;
  /** Titre affiché en mode focus. */
  title?: string;
}) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ k: string; dir: 1 | -1 } | null>(null);
  const [limit, setLimit] = useState(pageSize);
  const [focus, setFocus] = useState(false);

  const view = useMemo(() => {
    let r = rows;
    if (q) {
      const s = q.toLowerCase();
      r = r.filter((x) => cols.some((c) => String(c.value(x) ?? "").toLowerCase().includes(s)));
    }
    if (sort) {
      const c = cols.find((c) => c.key === sort.k)!;
      r = [...r].sort((a, b) => {
        const va = c.value(a);
        const vb = c.value(b);
        if (va == null) return 1;
        if (vb == null) return -1;
        return (typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "fr", { numeric: true })) * sort.dir;
      });
    }
    return r;
  }, [rows, q, sort, cols]);

  // Mode focus : Échap ferme, la page derrière ne défile plus
  useEffect(() => {
    if (!focus) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFocus(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [focus]);

  const openFocus = () => {
    setLimit((l) => Math.max(l, 200));
    setFocus(true);
  };

  const toolbar = (dense: boolean, inFocus: boolean) =>
    (filterable || actions || focusable) && (
      <div className="flex flex-wrap items-center gap-2">
        {filterable && (
          <div className="relative w-full max-w-xs">
            <Search className={cn("absolute left-2.5 h-4 w-4 text-muted-foreground", dense ? "top-2" : "top-2.5")} />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrer…" className={cn("pl-8", dense && "h-8 text-xs")} />
          </div>
        )}
        <span className="text-xs text-muted-foreground">{view.length} ligne(s)</span>
        <div className="ml-auto flex gap-2">
          {actions}
          {focusable && !inFocus && (
            <Button size="sm" variant="outline" onClick={openFocus} title="Agrandir le tableau (mode focus)">
              <Maximize2 className="mr-1.5 h-4 w-4" />
              Agrandir
            </Button>
          )}
        </div>
      </div>
    );

  const table = (dense: boolean, boxClass?: string) => (
    <div className={cn("overflow-auto rounded-xl border bg-card", boxClass)}>
      <table className={cn("w-full", dense ? "text-xs" : "text-sm")}>
        <thead className="sticky top-0 z-10 bg-muted">
          <tr>
            {cols.map((c) => (
              <th
                key={c.key}
                className={cn(
                  "cursor-pointer select-none whitespace-nowrap text-left font-semibold uppercase tracking-wide text-muted-foreground",
                  dense ? "px-2.5 py-1.5 text-[10px]" : "px-3 py-2 text-xs",
                  c.num && "text-right",
                )}
                onClick={() => setSort((s) => (s?.k === c.key ? { k: c.key, dir: s.dir === 1 ? -1 : 1 } : { k: c.key, dir: 1 }))}
              >
                <span className="inline-flex items-center gap-1">
                  {c.label}
                  {sort?.k === c.key ? (sort.dir === 1 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowDownUp className="h-3 w-3 opacity-40" />}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {view.slice(0, limit).map((r, i) => (
            <tr key={i} className={cn("border-t", rowClass?.(r))}>
              {cols.map((c) => (
                <td key={c.key} className={cn("whitespace-nowrap", dense ? "px-2.5 py-1" : "px-3 py-1.5", c.num && "text-right font-mono tabular-nums")}>
                  {c.render ? c.render(r) : (c.value(r) ?? "—")}
                </td>
              ))}
            </tr>
          ))}
          {view.length === 0 && (
            <tr>
              <td colSpan={cols.length} className="px-3 py-6 text-center text-muted-foreground">
                Aucune ligne
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );

  const more =
    view.length > limit ? (
      <Button variant="outline" size="sm" onClick={() => setLimit((l) => l + pageSize * 2)}>
        Afficher plus ({view.length - limit} restantes)
      </Button>
    ) : null;

  return (
    <div className="space-y-3">
      {toolbar(compact, false)}
      {table(compact, maxHeight)}
      {more}
      {focus &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex bg-background/70 p-3 backdrop-blur-md sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-label={title ?? "Tableau"}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setFocus(false);
            }}
          >
            <div className="mx-auto flex h-full w-full max-w-[1500px] flex-col gap-3 rounded-3xl border bg-card p-4 shadow-2xl sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="truncate text-lg font-semibold">{title ?? "Tableau"}</h2>
                <Button size="sm" variant="outline" onClick={() => setFocus(false)} title="Fermer (Échap)">
                  <X className="mr-1.5 h-4 w-4" />
                  Fermer
                </Button>
              </div>
              {toolbar(false, true)}
              {table(false, "min-h-0 flex-1")}
              {more}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
