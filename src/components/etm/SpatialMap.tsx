import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type * as Leaflet from "leaflet";
import { Compass, Maximize, Minimize, Minus, Plus, RotateCcw, Tags } from "lucide-react";
import { bboxOf, colorAt, cssColor, type Grid, type SPoint } from "@/lib/etm/spatial";
import { fmt } from "@/lib/etm/analysis";
import { cn } from "@/lib/utils";

const CLASSES = 8;
const DESTRUCTIVE = "#d93a2b";

type BaseKey = "plan" | "clair" | "satellite" | "relief";
interface BaseDef {
  label: string;
  url: string;
  attribution: string;
  maxZoom: number;
  subdomains?: string;
}
/** Vrais fond de carte (tuiles) — chargés depuis les serveurs publics des fournisseurs. */
const BASEMAPS: Record<BaseKey, BaseDef> = {
  plan: {
    label: "Plan",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "© OpenStreetMap",
    maxZoom: 19,
    subdomains: "abc",
  },
  clair: {
    label: "Clair",
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    attribution: "© OpenStreetMap © CARTO",
    maxZoom: 20,
    subdomains: "abcd",
  },
  satellite: {
    label: "Satellite",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles © Esri — Esri, Maxar, Earthstar Geographics",
    maxZoom: 19,
  },
  relief: {
    label: "Relief",
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution: "© OpenStreetMap, SRTM | © OpenTopoMap (CC-BY-SA)",
    maxZoom: 17,
    subdomains: "abc",
  },
};

interface MapState {
  L: typeof Leaflet;
  map: Leaflet.Map;
  data: Leaflet.LayerGroup;
  tiles: Leaflet.TileLayer | null;
}

function line(text: string, style = ""): HTMLElement {
  const d = document.createElement("div");
  d.textContent = text;
  if (style) d.style.cssText = style;
  return d;
}

export function SpatialMap({
  points,
  grid,
  label,
  limit,
  limitLabel,
  neutralPoints,
  compact,
}: {
  points: SPoint[];
  grid?: Grid | null | undefined;
  label: string;
  /** Applicable regulatory limit, in the same unit/basis as `value`, for exceedance highlighting. */
  limit?: number | null | undefined;
  limitLabel?: string | undefined;
  /** Stations en blanc, sans code couleur (ex. carte d'incertitude, où la couleur représente autre chose). */
  neutralPoints?: boolean | undefined;
  /** Version réduite (tableau de bord) : remplit son conteneur, sans boutons ni sélecteur de fond. */
  compact?: boolean | undefined;
}) {
  const bbox = grid?.bbox ?? bboxOf(points, 0.15);
  const vals = neutralPoints ? [] : points.map((p) => p.value).filter(Number.isFinite);
  const min = grid ? Math.min(grid.min, ...vals) : Math.min(...vals);
  const max = grid ? Math.max(grid.max, ...vals) : Math.max(...vals);
  const t = (v: number) => (max > min ? (v - min) / (max - min) : 0.5);
  const exceeds = (v: number) => limit != null && Number.isFinite(limit) && v > limit;

  const [base, setBase] = useState<BaseKey>("clair");
  const [showLabels, setShowLabels] = useState(!compact);
  const [fullscreen, setFullscreen] = useState(false);
  const [ready, setReady] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const mapEl = useRef<HTMLDivElement>(null);
  const state = useRef<MapState | null>(null);

  const fit = () => {
    const s = state.current;
    if (!s) return;
    s.map.fitBounds(
      [
        [bbox.minLat, bbox.minLon],
        [bbox.maxLat, bbox.maxLon],
      ],
      { padding: [24, 24] },
    );
  };

  // Limites des classes de couleur, tracées sur la carte (coordonnées géographiques)
  const contours = useMemo(() => {
    if (!grid) return [] as [number, number][][];
    const dLon = (grid.bbox.maxLon - grid.bbox.minLon) / grid.nx;
    const dLat = (grid.bbox.maxLat - grid.bbox.minLat) / grid.ny;
    const cls = grid.values.map((v) => (Number.isFinite(v) ? Math.min(CLASSES - 1, Math.floor(t(v) * CLASSES)) : -1));
    const segs: [number, number][][] = [];
    for (let j = 0; j < grid.ny; j++)
      for (let i = 0; i < grid.nx; i++) {
        const k = j * grid.nx + i;
        const lat0 = grid.bbox.maxLat - j * dLat;
        const lon0 = grid.bbox.minLon + i * dLon;
        if (i < grid.nx - 1 && cls[k] !== cls[k + 1] && cls[k]! >= 0 && cls[k + 1]! >= 0)
          segs.push([[lat0, lon0 + dLon], [lat0 - dLat, lon0 + dLon]]);
        if (j < grid.ny - 1 && cls[k] !== cls[k + grid.nx] && cls[k]! >= 0 && cls[k + grid.nx]! >= 0)
          segs.push([[lat0 - dLat, lon0], [lat0 - dLat, lon0 + dLon]]);
      }
    return segs;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grid, min, max]);

  // Création de la carte (côté navigateur uniquement : Leaflet a besoin de `window`)
  useEffect(() => {
    let cancelled = false;
    let cleanup = () => {};
    void (async () => {
      const mod = await import("leaflet");
      const L = ((mod as unknown as { default?: typeof Leaflet }).default ?? mod) as typeof Leaflet;
      if (cancelled || !mapEl.current) return;
      const map = L.map(mapEl.current, { zoomControl: false, zoomSnap: 0.25, preferCanvas: true });
      L.control.scale({ imperial: false, position: "bottomleft" }).addTo(map);
      const data = L.layerGroup().addTo(map);
      state.current = { L, map, data, tiles: null };
      map.fitBounds([[bbox.minLat, bbox.minLon], [bbox.maxLat, bbox.maxLon]], { padding: [24, 24] });
      setReady(true);
      cleanup = () => {
        map.remove();
        state.current = null;
      };
    })();
    return () => {
      cancelled = true;
      cleanup();
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fond de carte
  useEffect(() => {
    const s = state.current;
    if (!ready || !s) return;
    s.tiles?.remove();
    const b = BASEMAPS[base];
    const opts: Leaflet.TileLayerOptions = { attribution: b.attribution, maxZoom: b.maxZoom };
    if (b.subdomains) opts.subdomains = b.subdomains;
    s.tiles = s.L.tileLayer(b.url, opts).addTo(s.map);
    s.tiles.bringToBack();
  }, [ready, base]);

  // Interpolation + stations
  useEffect(() => {
    const s = state.current;
    if (!ready || !s) return;
    const { L, data } = s;
    data.clearLayers();

    if (grid) {
      const c = document.createElement("canvas");
      c.width = grid.nx;
      c.height = grid.ny;
      const ctx = c.getContext("2d")!;
      const im = ctx.createImageData(grid.nx, grid.ny);
      grid.values.forEach((v, i) => {
        if (!Number.isFinite(v)) return; // hors de l'emprise des stations : transparent
        const cls = Math.min(CLASSES - 1, Math.floor(t(v) * CLASSES));
        const [r, g, b] = colorAt((cls + 0.5) / CLASSES);
        im.data.set([r, g, b, 185], i * 4);
      });
      ctx.putImageData(im, 0, 0);
      L.imageOverlay(
        c.toDataURL(),
        [[grid.bbox.minLat, grid.bbox.minLon], [grid.bbox.maxLat, grid.bbox.maxLon]],
        { interactive: false },
      ).addTo(data);
      if (contours.length) L.polyline(contours, { color: "#142032", weight: 1, opacity: 0.4, interactive: false }).addTo(data);
    }

    for (const p of points) {
      const over = !neutralPoints && exceeds(p.value);
      if (over) L.circleMarker([p.lat, p.lon], { radius: 14, color: DESTRUCTIVE, weight: 2.5, fill: false, interactive: false }).addTo(data);
      const m = L.circleMarker([p.lat, p.lon], { radius: 8, color: neutralPoints ? "#142032" : "#ffffff", weight: 2.5, fillColor: neutralPoints ? "#ffffff" : cssColor(t(p.value)), fillOpacity: 1 });
      m.bindTooltip(
        p.station,
        showLabels
          ? { permanent: true, direction: "right", offset: [10, 0], className: "etm-label" }
          : { direction: "top", offset: [0, -8], className: "etm-label" },
      );
      const box = document.createElement("div");
      box.append(
        line(p.station, "font-weight:600"),
        line(`${p.lat.toFixed(4)}°, ${p.lon.toFixed(4)}°`, "opacity:.7;font-size:11px"),
      );
      if (!neutralPoints) box.append(line(`${label} : ${fmt(p.value, 4)}`, "margin-top:4px;font-family:var(--font-mono)"));
      if (limit != null && !neutralPoints)
        box.append(
          line(
            `${over ? "Dépassement" : "Conforme"}${limitLabel ? ` — ${limitLabel}` : ""}`,
            `margin-top:4px;font-weight:600;color:${over ? DESTRUCTIVE : "#1f8a62"}`,
          ),
        );
      m.bindPopup(box);
      m.addTo(data);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, points, grid, contours, showLabels, limit, limitLabel, label, min, max, neutralPoints]);

  // Recadrage quand l'étendue change (nouvelle variable / élément / mode)
  useEffect(() => {
    if (ready) fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, bbox.minLat, bbox.maxLat, bbox.minLon, bbox.maxLon]);

  useEffect(() => {
    const onFs = () => {
      setFullscreen(!!document.fullscreenElement);
      setTimeout(() => state.current?.map.invalidateSize(), 150);
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const toggleFullscreen = () => {
    if (!wrapRef.current) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void wrapRef.current.requestFullscreen();
  };

  return (
    <div ref={wrapRef} className={cn(compact ? "flex h-full min-h-0 flex-col gap-2" : "space-y-3", fullscreen && "flex h-screen flex-col bg-card p-4")}>
      <div className={cn("relative isolate overflow-hidden rounded-2xl border", fullscreen || compact ? "min-h-0 flex-1" : "h-[460px] sm:h-[560px]")}>
        <div ref={mapEl} className="absolute inset-0" />

        {!compact && (
        <>
        {/* Choix du fond de carte */}
        <div className="glass absolute left-1/2 top-3 z-[1000] flex -translate-x-1/2 gap-0.5 rounded-full p-1">
          {(Object.keys(BASEMAPS) as BaseKey[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setBase(k)}
              className={cn(
                "rounded-full px-2.5 py-1 text-xs transition-colors sm:px-3",
                base === k ? "bg-primary font-medium text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {BASEMAPS[k].label}
            </button>
          ))}
        </div>

        {/* Contrôles */}
        <div className="absolute right-3 top-3 z-[1000] flex flex-col gap-1.5">
          <MapBtn onClick={() => state.current?.map.zoomIn()} title="Zoomer"><Plus className="h-4 w-4" /></MapBtn>
          <MapBtn onClick={() => state.current?.map.zoomOut()} title="Dézoomer"><Minus className="h-4 w-4" /></MapBtn>
          <MapBtn onClick={fit} title="Réinitialiser la vue"><RotateCcw className="h-4 w-4" /></MapBtn>
          <MapBtn onClick={() => setShowLabels((v) => !v)} title="Afficher/masquer les étiquettes" active={showLabels}><Tags className="h-4 w-4" /></MapBtn>
          <MapBtn onClick={toggleFullscreen} title="Plein écran">
            {fullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </MapBtn>
        </div>

        {/* Nord */}
        <div className="glass pointer-events-none absolute left-3 top-3 z-[1000] flex flex-col items-center rounded-full px-2 py-1.5 text-[10px] font-semibold">
          <Compass className="h-4 w-4" />
          <span>N</span>
        </div>
        </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs">
        <span className="font-mono">{fmt(min, 3)}</span>
        <div className="relative h-2.5 min-w-[8rem] flex-1 rounded-full" style={{ background: `linear-gradient(90deg, ${Array.from({ length: 11 }, (_, i) => cssColor(i / 10)).join(",")})` }}>
          {limit != null && limit >= min && limit <= max && (
            <div className="absolute -top-1 h-4 w-0.5 bg-foreground" style={{ left: `${t(limit) * 100}%` }} title={`${limitLabel ?? "Norme"} : ${fmt(limit, 3)}`} />
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
        "glass flex h-9 w-9 items-center justify-center rounded-full text-foreground hover:bg-accent",
        active && "!bg-primary text-primary-foreground hover:!bg-primary/90",
      )}
    >
      {children}
    </button>
  );
}
