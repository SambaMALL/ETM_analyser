import { useMemo, useState, type ReactNode } from "react";
import { ArrowDownUp, ArrowDown, ArrowUp, Search } from "lucide-react";
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
}: {
  cols: Col<T>[];
  rows: T[];
  rowClass?: (r: T) => string;
  filterable?: boolean;
  pageSize?: number;
  actions?: ReactNode;
}) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ k: string; dir: 1 | -1 } | null>(null);
  const [limit, setLimit] = useState(pageSize);
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

  return (
    <div className="space-y-3">
      {(filterable || actions) && (
        <div className="flex flex-wrap items-center gap-2">
          {filterable && (
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrer…" className="pl-8" />
            </div>
          )}
          <span className="text-xs text-muted-foreground">{view.length} ligne(s)</span>
          <div className="ml-auto flex gap-2">{actions}</div>
        </div>
      )}
      <div className="overflow-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted/70 backdrop-blur">
            <tr>
              {cols.map((c) => (
                <th
                  key={c.key}
                  className={cn("cursor-pointer select-none whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground", c.num && "text-right")}
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
                  <td key={c.key} className={cn("whitespace-nowrap px-3 py-1.5", c.num && "text-right font-mono tabular-nums")}>
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
      {view.length > limit && (
        <Button variant="outline" size="sm" onClick={() => setLimit((l) => l + pageSize * 2)}>
          Afficher plus ({view.length - limit} restantes)
        </Button>
      )}
    </div>
  );
}
