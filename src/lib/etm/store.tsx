import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { normsFor, NORMS, type Matrix } from "./norms";
import { computeIndices, conformity, defaultRef, type Row } from "./analysis";

interface Ctx {
  rows: Row[];
  source: string | null;
  setData: (rows: Row[], source: string) => void;
  clear: () => void;
  matrix: Matrix;
  setMatrix: (m: Matrix) => void;
  normId: string;
  setNormId: (id: string) => void;
  refs: Record<string, number>;
  setRef: (el: string, v: number | undefined) => void;
}
// Keep a single context instance across hot reloads to avoid "provider missing" crashes
const g = globalThis as unknown as { __etmCtx?: React.Context<Ctx | null> };
const C = g.__etmCtx ?? (g.__etmCtx = createContext<Ctx | null>(null));

export function EtmProvider({ children }: { children: ReactNode }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [source, setSource] = useState<string | null>(null);
  const [matrix, setMatrixS] = useState<Matrix>("Sol");
  const [normId, setNormId] = useState(normsFor("Sol")[0]!.id);
  const [refsByMatrix, setRefs] = useState<Record<string, Record<string, number>>>({});
  // Persist data between visits (browser storage, read after hydration)
  const loaded = useRef(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("etm-analyzer-v1");
      if (raw) {
        const d = JSON.parse(raw);
        if (Array.isArray(d.rows)) setRows(d.rows);
        if (typeof d.source === "string") setSource(d.source);
        if (d.matrix === "Eau" || d.matrix === "Sol" || d.matrix === "Air") setMatrixS(d.matrix);
        if (typeof d.normId === "string" && NORMS.some((n) => n.id === d.normId)) setNormId(d.normId);
        if (d.refs && typeof d.refs === "object") setRefs(d.refs);
      }
    } catch {
      /* ignore corrupted storage */
    }
    loaded.current = true;
  }, []);
  useEffect(() => {
    if (!loaded.current) return;
    try {
      localStorage.setItem("etm-analyzer-v1", JSON.stringify({ rows, source, matrix, normId, refs: refsByMatrix }));
    } catch {
      /* storage full or unavailable */
    }
  }, [rows, source, matrix, normId, refsByMatrix]);
  const value: Ctx = {
    rows,
    source,
    setData: (r, s) => {
      setRows(r);
      setSource(s);
    },
    clear: () => {
      setRows([]);
      setSource(null);
    },
    matrix,
    setMatrix: (m) => {
      setMatrixS(m);
      setNormId(normsFor(m)[0]!.id);
    },
    normId,
    setNormId,
    refs: refsByMatrix[matrix] ?? {},
    setRef: (el, v) =>
      setRefs((p) => {
        const cur = { ...(p[matrix] ?? {}) };
        if (v == null || !Number.isFinite(v) || v <= 0) delete cur[el];
        else cur[el] = v;
        return { ...p, [matrix]: cur };
      }),
  };
  return <C.Provider value={value}>{children}</C.Provider>;
}

export function useEtm() {
  const c = useContext(C);
  if (!c) throw new Error("EtmProvider missing");
  return c;
}

export function useAnalysis() {
  const s = useEtm();
  return useMemo(() => {
    const norm = NORMS.find((n) => n.id === s.normId);
    const rows = s.rows.filter((r) => r.matrice === s.matrix);
    const conf = conformity(rows, norm);
    const elements = [...new Set(rows.map((r) => r.element))].sort();
    const stationNames = [...new Set(rows.map((r) => r.station))];
    const refOf = (el: string) => s.refs[el] ?? defaultRef(el, s.matrix, norm);
    const { idx, stations } = computeIndices(rows, s.matrix, refOf);
    const ok = conf.filter((c) => c.status === "Conforme").length;
    const over = conf.filter((c) => c.status === "Dépassement").length;
    return {
      ...s,
      norm,
      matrixRows: rows,
      conf,
      elements,
      stationNames,
      refOf,
      idx,
      stations,
      kpi: { stations: stationNames.length, elements: elements.length, total: rows.length, ok, over, rate: ok + over ? (ok / (ok + over)) * 100 : 0 },
    };
  }, [s]);
}
