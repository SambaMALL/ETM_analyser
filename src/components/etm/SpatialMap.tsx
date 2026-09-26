import { useEffect, useMemo, useRef, useState, type PointerEventHandler, type ReactNode, type WheelEventHandler } from "react";
import { Compass, Download, Maximize, Minimize, Minus, Plus, RotateCcw, Tags } from "lucide-react";
import { bboxOf, colorAt, cssColor, type Grid, type SPoint } from "@/lib/etm/spatial";
import { fmt } from "@/lib/etm/analysis";
import { cn } from "@/lib/utils";

const W = 820;
const CLASSES = 8;
const MIN_ZOOM = 1;
const MAX_ZOOM = 12;

interface VBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Pick a "nice" round distance (1/2/5 × 10^n) at or just under `max`. */
function niceDistance(max: number): number {
  if (max <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(max)));
  for (const m of [5, 2, 1]) if (m * pow <= max) return m * pow;
  return pow / 2;
}

export function SpatialMap({
  points,
  grid,
  label,
  limit,
  limitLabel,
}: {
  points: SPoint[];
  grid?: Grid | null | undefined;
  label: string;
  /** Applicable regulatory limit, in the same unit/basis as `value`, for exceedance highlighting. */
  limit?: number | null | undefined;
  limitLabel?: string | undefined;
}) {
  const bbox = grid?.bbox ?? bboxOf(points, 0.15);
  const kLat = Math.cos((((bbox.minLat + bbox.maxLat) / 2) * Math.PI) / 180);
  const H = Math.min(700, Math.max(300, (W * (bbox.maxLat - bbox.minLat)) / ((bbox.maxLon - bbox.minLon) * kLat)));
  const vals = points.map((p) => p.value).filter(Number.isFinite);
  const min = grid ? Math.min(grid.min, ...vals) : Math.min(...vals);
  const max = grid ? Math.max(grid.max, ...vals) : Math.max(...vals);
  const t = (v: number) => (max > min ? (v - min) / (max - min) : 0.5);
  const X = (lon: number) => ((lon - bbox.minLon) / (bbox.maxLon - bbox.minLon)) * W;
  const Y = (lat: number) => ((bbox.maxLat - lat) / (bbox.maxLat - bbox.minLat)) * H;
  const [img, setImg] = useState<string | null>(null);
  const [hover, setHover] = useState<SPoint | null>(null);
  const [pinned, setPinned] = useState<SPoint | null>(null);
  const [showLabels, setShowLabels] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // km per SVG unit is constant (viewBox only windows the same coordinate system)
  const kmPerUnit = ((bbox.maxLon - bbox.minLon) * 111.32 * kLat) / W;

  const [vb, setVb] = useState<VBox>({ x: 0, y: 0, w: W, h: H });
  // Reset the view whenever the underlying extent changes (new variable/element/mode)
  useEffect(() => setVb({ x: 0, y: 0, w: W, h: H }), [H, bbox.minLat, bbox.maxLat, bbox.minLon, bbox.maxLon]);

  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  useEffect(() => {
    if (!grid) return setImg(null);
    const c = document.createElement("canvas");
    c.width = grid.nx;
    c.height = grid.ny;
    const ctx = c.getContext("2d")!;
    const im = ctx.createImageData(grid.nx, grid.ny);
    grid.values.forEach((v, i) => {
      const cls = Math.min(CLASSES - 1, Math.floor(t(v) * CLASSES));
      const [r, g, b] = colorAt((cls + 0.5) / CLASSES);
      im.data.set([r, g, b, 200], i * 4);
    });
    ctx.putImageData(im, 0, 0);
    setImg(c.toDataURL());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grid, min, max]);

  const contours = useMemo(() => {
    if (!grid) return "";
    const cw = W / grid.nx;
    const ch = H / grid.ny;
    const cls = grid.values.map((v) => Math.min(CLASSES - 1, Math.floor(t(v) * CLASSES)));
    let d = "";
    for (let j = 0; j < grid.ny; j++)
      for (let i = 0; i < grid.nx; i++) {
        const k = j * grid.nx + i;
        if (i < grid.nx - 1 && cls[k] !== cls[k + 1]) d += `M${(i + 1) * cw},${j * ch}v${ch}`;
        if (j < grid.ny - 1 && cls[k] !== cls[k + grid.nx]) d += `M${i * cw},${(j + 1) * ch}h${cw}`;
      }
    return d;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grid, H, min, max]);

  const ticks = (a: number, b: number) => Array.from({ length: 5 }, (_, i) => a + ((i + 0.5) / 5) * (b - a));

  /* --- Zoom & pan --- */
  const clampVb = (nv: VBox): VBox => {
    const w = Math.min(W / MIN_ZOOM, Math.max(W / MAX_ZOOM, nv.w));
    const h = w * (H / W);
    let x = Math.min(W - w, Math.max(0, nv.x));
    let y = Math.min(H - h, Math.max(0, nv.y));
    if (W - w < 0) x = -(w - W) / 2;
    if (H - h < 0) y = -(h - H) / 2;
    return { x, y, w, h };
  };
  const svgPoint = (clientX: number, clientY: number) => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    return { x: vb.x + ((clientX - r.left) / r.width) * vb.w, y: vb.y + ((clientY - r.top) / r.height) * vb.h };
  };
  const zoomAt = (clientX: number, clientY: number, factor: number) => {
    const p = svgPoint(clientX, clientY);
    setVb((cur) => {
      const nw = cur.w * factor;
      const nh = nw * (H / W);
      const nx = p.x - ((p.x - cur.x) / cur.w) * nw;
      const ny = p.y - ((p.y - cur.y) / cur.h) * nh;
      return clampVb({ x: nx, y: ny, w: nw, h: nh });
    });
  };
  const onWheel: WheelEventHandler<SVGSVGElement> = (e) => {
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, e.deltaY > 0 ? 1.2 : 1 / 1.2);
  };
  const zoomAtCenter = (factor: number) => {
    const r = svgRef.current?.getBoundingClientRect();
    if (r) zoomAt(r.left + r.width / 2, r.top + r.height / 2, factor);
  };
  const drag = useRef<{ x: number; y: number; vb: VBox } | null>(null);
  const onPointerDown: PointerEventHandler<SVGSVGElement> = (e) => {
    drag.current = { x: e.clientX, y: e.clientY, vb };
    (e.target as Element).setPointerCapture(e.pointerId);
  };
  const onPointerMove: PointerEventHandler<SVGSVGElement> = (e) => {
    if (!drag.current) return;
    const r = svgRef.current?.getBoundingClientRect();
    if (!r) return;
    const dx = ((e.clientX - drag.current.x) / r.width) * drag.current.vb.w;
    const dy = ((e.clientY - drag.current.y) / r.height) * drag.current.vb.h;
    setVb(clampVb({ ...drag.current.vb, x: drag.current.vb.x - dx, y: drag.current.vb.y - dy }));
  };
  const endDrag: PointerEventHandler<SVGSVGElement> = () => {
    drag.current = null;
  };
  const zoomLevel = W / vb.w;

  const [renderedW, setRenderedW] = useState(W);
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setRenderedW(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const pxPerUnit = renderedW / vb.w;
  const scaleKm = niceDistance((vb.w * kmPerUnit) / 4);
  const scaleBarPx = (scaleKm / kmPerUnit) * pxPerUnit;

  const toggleFullscreen = () => {
    if (!wrapRef.current) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void wrapRef.current.requestFullscreen();
  };

  const exportPng = () => {
    const svg = svgRef.current;
    if (!svg) return;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("width", String(W * 2));
    clone.setAttribute("height", String(H * 2));
    clone.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    bg.setAttribute("width", "100%");
    bg.setAttribute("height", "100%");
    bg.setAttribute("fill", "white");
    clone.insertBefore(bg, clone.firstChild);
    const xml = new XMLSerializer().serializeToString(clone);
    const svgUrl = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);
    const image = new Image();
    image.onload = () => {
      const c = document.createElement("canvas");
      c.width = W * 2;
      c.height = H * 2;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(image, 0, 0);
      const a = document.createElement("a");
      a.download = `carte-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`;
      a.href = c.toDataURL("image/png");
      a.click();
    };
    image.src = svgUrl;
  };

  const active = pinned ?? hover;
  const exceeds = (v: number) => limit != null && Number.isFinite(limit) && v > limit;

  return (
    <div ref={wrapRef} className={cn("space-y-3", fullscreen && "flex h-screen flex-col justify-center bg-card p-4")}>
      <div className="relative overflow-hidden rounded-lg border bg-muted/40">
        <svg
          ref={svgRef}
          viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
          className="block h-auto w-full cursor-grab touch-none active:cursor-grabbing"
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerLeave={endDrag}
        >
          {ticks(bbox.minLon, bbox.maxLon).map((lon) => (
            <g key={lon}>
              <line x1={X(lon)} x2={X(lon)} y1={0} y2={H} stroke="var(--border)" strokeDasharray="2 4" />
              <text x={X(lon) + 3} y={H - 6} fontSize={10} fill="var(--muted-foreground)">{lon.toFixed(3)}°</text>
            </g>
          ))}
          {ticks(bbox.minLat, bbox.maxLat).map((lat) => (
            <g key={lat}>
              <line x1={0} x2={W} y1={Y(lat)} y2={Y(lat)} stroke="var(--border)" strokeDasharray="2 4" />
              <text x={4} y={Y(lat) - 3} fontSize={10} fill="var(--muted-foreground)">{lat.toFixed(3)}°</text>
            </g>
          ))}
          {img && <image href={img} x={0} y={0} width={W} height={H} preserveAspectRatio="none" style={{ imageRendering: "pixelated" }} />}
          {contours && <path d={contours} stroke="rgba(20,30,50,0.45)" strokeWidth={1 / zoomLevel} fill="none" />}
          {points.map((p) => {
            const over = exceeds(p.value);
            const isActive = active === p;
            return (
              <g
                key={p.station}
                onMouseEnter={() => setHover(p)}
                onMouseLeave={() => setHover(null)}
                onClick={() => setPinned((cur) => (cur === p ? null : p))}
                className="cursor-pointer"
              >
                {over && (
                  <circle
                    cx={X(p.lon)}
                    cy={Y(p.lat)}
                    r={(isActive ? 15 : 12) / Math.sqrt(zoomLevel)}
                    fill="none"
                    stroke="var(--destructive)"
                    strokeWidth={2 / Math.sqrt(zoomLevel)}
                  />
                )}
                <circle
                  cx={X(p.lon)}
                  cy={Y(p.lat)}
                  r={(isActive ? 11 : 8) / Math.sqrt(zoomLevel)}
                  fill={cssColor(t(p.value))}
                  stroke="white"
                  strokeWidth={2 / Math.sqrt(zoomLevel)}
                />
                {showLabels && (
                  <text
                    x={X(p.lon) + 11 / Math.sqrt(zoomLevel)}
                    y={Y(p.lat) + 4 / Math.sqrt(zoomLevel)}
                    fontSize={10 / Math.sqrt(zoomLevel)}
                    fill="var(--foreground)"
                    style={{ paintOrder: "stroke", stroke: "var(--card)", strokeWidth: 3 / Math.sqrt(zoomLevel) }}
                  >
                    {p.station}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {/* Controls */}
        <div className="absolute right-2 top-2 flex flex-col gap-1">
          <MapBtn onClick={() => zoomAtCenter(1 / 1.4)} title="Zoomer"><Plus className="h-3.5 w-3.5" /></MapBtn>
          <MapBtn onClick={() => zoomAtCenter(1.4)} title="Dézoomer"><Minus className="h-3.5 w-3.5" /></MapBtn>
          <MapBtn onClick={() => setVb({ x: 0, y: 0, w: W, h: H })} title="Réinitialiser la vue"><RotateCcw className="h-3.5 w-3.5" /></MapBtn>
          <MapBtn onClick={() => setShowLabels((v) => !v)} title="Afficher/masquer les étiquettes" active={showLabels}><Tags className="h-3.5 w-3.5" /></MapBtn>
          <MapBtn onClick={exportPng} title="Exporter en PNG"><Download className="h-3.5 w-3.5" /></MapBtn>
          <MapBtn onClick={toggleFullscreen} title="Plein écran">
            {fullscreen ? <Minimize className="h-3.5 w-3.5" /> : <Maximize className="h-3.5 w-3.5" />}
          </MapBtn>
        </div>

        {/* North arrow */}
        <div className="pointer-events-none absolute left-2 top-2 flex flex-col items-center rounded-md bg-popover/90 px-1.5 py-1 text-[10px] font-semibold shadow-sm">
          <Compass className="h-4 w-4" />
          <span>N</span>
        </div>

        {/* Scale bar */}
        <div className="pointer-events-none absolute bottom-2 left-2 rounded-md bg-popover/90 px-2 py-1 text-[10px] shadow-sm">
          <div style={{ width: Math.max(1, scaleBarPx) }} className="h-0 border-l-2 border-r-2 border-t-2 border-foreground" />
          <div className="mt-0.5 text-center">{scaleKm >= 1 ? `${fmt(scaleKm, 0)} km` : `${fmt(scaleKm * 1000, 0)} m`}</div>
        </div>

        {active && (
          <div className="pointer-events-none absolute right-3 top-3 max-w-[13rem] rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
            <div className="font-semibold">{active.station}</div>
            <div className="text-muted-foreground">{active.lat.toFixed(4)}°, {active.lon.toFixed(4)}°</div>
            <div className="mt-1 font-mono">{label} : {fmt(active.value, 4)}</div>
            {limit != null && (
              <div className={cn("mt-1 font-medium", exceeds(active.value) ? "text-destructive" : "text-success")}>
                {exceeds(active.value) ? "Dépassement" : "Conforme"}{limitLabel ? ` — ${limitLabel}` : ""}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs">
        <span className="font-mono">{fmt(min, 3)}</span>
        <div className="relative h-2.5 flex-1 min-w-[8rem] rounded-full" style={{ background: `linear-gradient(90deg, ${Array.from({ length: 11 }, (_, i) => cssColor(i / 10)).join(",")})` }}>
          {limit != null && limit >= min && limit <= max && (
            <div
              className="absolute -top-1 h-4 w-0.5 bg-foreground"
              style={{ left: `${t(limit) * 100}%` }}
              title={`${limitLabel ?? "Norme"} : ${fmt(limit, 3)}`}
            />
          )}
        </div>
        <span className="font-mono">{fmt(max, 3)}</span>
        <span className="text-muted-foreground">{label}</span>
        {limit != null && (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <span className="inline-block h-2 w-2 rounded-full border-2 border-destructive" /> Dépassement de la norme
          </span>
        )}
      </div>
    </div>
  );
}

function MapBtn({ children, onClick, title, active }: { children: ReactNode; onClick: () => void; title: string; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-md border bg-popover/90 text-foreground shadow-sm hover:bg-accent",
        active && "bg-primary text-primary-foreground hover:bg-primary/90",
      )}
    >
      {children}
    </button>
  );
}
