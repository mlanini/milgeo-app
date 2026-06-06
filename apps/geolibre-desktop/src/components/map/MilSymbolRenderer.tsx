/**
 * MilSymbolRenderer
 *
 * Render-less component that keeps the MapLibre map in sync with mil-symbol
 * and mil-graphic layers stored in the Zustand store.
 *
 * ## Symbol rendering (mil-symbol)
 * Uses the orbat-mapper technique:
 *   1. Build a GeoJSON FeatureCollection from all visible mil-symbol layers.
 *   2. Store (sidc + options) in a symbol cache keyed by a hash.
 *   3. Add/update a single MapLibre `symbol` source + layer.
 *   4. On `styleimagemissing`, rasterize the milsymbol to a padded ImageData
 *      (anchor at canvas centre) and register it via `map.addImage()`.
 *
 * This gives: WebGL compositing, native rotation, HiDPI, text labels, and
 * correct rendering of all APP-6D symbol sets — without any DOM markers.
 *
 * Reference: https://github.com/orbat-mapper/orbat-mapper MlMapLogic.vue
 */

import { useEffect, useMemo, useRef } from "react";
import maplibregl from "maplibre-gl";
import type { GeoJSONSource } from "maplibre-gl";
import type { MapController } from "@geolibre/map";
import ms from "milsymbol";
import type { SymbolOptions } from "milsymbol";
import type { FeatureCollection, Feature, Point } from "geojson";
import { useMilLayerStore } from "../../hooks/useMilLayerStore";
import type { MilGraphicItem } from "@geolibre/core";

// ─── Constants ─────────────────────────────────────────────────────────────

// Ensure APP-6D standard is active for this module — must be set before any
// ms.Symbol call, regardless of whether useMilSymbol.ts has been loaded yet.
ms.setStandard("APP6");

const MilSymbol = ms.Symbol;

/** Local milsymbol server endpoint (Vite dev middleware or standalone server). */
const MILSYMBOL_SERVER_PATH = "/__milsymbol";

const SYM_SOURCE_ID = "mil-symbol-source";
const SYM_LAYER_ID  = "mil-symbol-layer";
const SYM_LABEL_ID  = "mil-symbol-labels";

/** Image-id prefix — prevents collisions with basemap sprites. */
const IMG_PREFIX = "ms-";

/** Symbol size (CSS px) at 1× DPR. milsymbol scales internally via asCanvas(). */
const SYMBOL_SIZE = 38;

/** Capture DPR once; constant for the component lifetime. */
const PIXEL_RATIO = window.devicePixelRatio || 1;

// ─── Types ─────────────────────────────────────────────────────────────────

interface SymbolCacheEntry {
  sidc: string;
  options: SymbolOptions;
}

interface MilSymbolRendererProps {
  mapControllerRef: React.RefObject<MapController | null>;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/** djb2 hash → 8-char base-36 string, safe as a MapLibre image id. */
function hashStr(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return (h >>> 0).toString(36).padStart(7, "0");
}

function makeSymbolKey(sidc: string, opts: SymbolOptions): string {
  return IMG_PREFIX + hashStr(JSON.stringify({ sidc, ...opts }));
}

/**
 * Rasterize a milsymbol SIDC to padded ImageData so the anchor point lands
 * exactly at the canvas centre — the position MapLibre uses as icon origin.
 *
 * Used as fallback when the milsymbol server is unavailable (e.g. Tauri prod).
 * Technique from orbat-mapper MlMapLogic.vue L494–514.
 */
function buildMilSymbolImageDataLocal(
  sidc: string,
  opts: SymbolOptions,
  pixelRatio: number,
): ImageData | null {
  try {
    const symb = new MilSymbol(sidc, opts);

    // Do NOT gate on symb.isValid() — milsymbol 3.x returns falsy for valid
    // but partially-specified SIDCs: high echelon codes (21 Corps, 22 Army,
    // 23 Army Group…), generic "frame-only" units (entity "000000"), and
    // certain symbol-set entries. asCanvas() is the authoritative check:
    // if it produces a non-empty canvas the symbol can be rendered.
    const srcCanvas = symb.asCanvas(pixelRatio);
    if (!srcCanvas || srcCanvas.width === 0 || srcCanvas.height === 0) return null;

    const { width, height } = symb.getSize();
    if (width <= 0 || height <= 0) return null;

    // milsymbol 3.x does not expose a public getAnchor() method; the anchor is
    // stored as the internal `symbolAnchor` property set during updateSymbol().
    // Fall back to the geometric centre when the property is absent.
    const sym3 = symb as unknown as { symbolAnchor?: { x: number; y: number } };
    const anchor = sym3.symbolAnchor ?? { x: width / 2, y: height / 2 };

    // Pad so the anchor sits at the padded canvas centre.
    const halfW = Math.max(anchor.x, width  - anchor.x);
    const halfH = Math.max(anchor.y, height - anchor.y);
    if (halfW <= 0 || halfH <= 0) return null;

    const pw = Math.ceil(2 * halfW * pixelRatio);
    const ph = Math.ceil(2 * halfH * pixelRatio);
    if (pw <= 0 || ph <= 0) return null;

    const dx = Math.round((halfW - anchor.x) * pixelRatio);
    const dy = Math.round((halfH - anchor.y) * pixelRatio);

    const canvas = document.createElement("canvas");
    canvas.width  = pw;
    canvas.height = ph;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(srcCanvas, dx, dy);
    return ctx.getImageData(0, 0, pw, ph);
  } catch {
    return null;
  }
}

/**
 * Convert an SVG string to ImageData by rendering through an offscreen canvas.
 * The resulting image preserves natural SVG dimensions scaled by pixelRatio.
 */
function svgStringToImageData(
  svg: string,
  pixelRatio: number,
): Promise<ImageData | null> {
  return new Promise((resolve) => {
    try {
      const blob = new Blob([svg], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        const w = Math.ceil(img.naturalWidth  * pixelRatio);
        const h = Math.ceil(img.naturalHeight * pixelRatio);
        // SVGs without explicit width/height may report 0 — treat as failure.
        if (!w || !h) { URL.revokeObjectURL(url); resolve(null); return; }
        const canvas = document.createElement("canvas");
        canvas.width  = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) { URL.revokeObjectURL(url); resolve(null); return; }
        ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        resolve(ctx.getImageData(0, 0, w, h));
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    } catch {
      resolve(null);
    }
  });
}

/**
 * Fetch a rendered SVG from the local milsymbol server and convert it to
 * ImageData.  Falls back to client-side rendering if the server is unreachable
 * (e.g. production Tauri build without a running sidecar).
 */
async function buildMilSymbolImageData(
  sidc: string,
  opts: SymbolOptions,
  pixelRatio: number,
): Promise<ImageData | null> {
  // The milsymbol server middleware only runs inside the Vite dev server.
  // In production (Render, Tauri, …) there is no /__milsymbol handler, so
  // skip the network round-trip entirely and render client-side.
  if (import.meta.env.DEV) {
    try {
      const params = new URLSearchParams({ sidc, size: String(opts.size ?? SYMBOL_SIZE) });
      if (opts.uniqueDesignation) params.set("uniqueDesignation", opts.uniqueDesignation);
      if (opts.higherFormation)   params.set("higherFormation",   opts.higherFormation);

      const res = await fetch(`${MILSYMBOL_SERVER_PATH}/symbol?${params.toString()}`);
      if (res.ok) {
        const svg = await res.text();
        const data = await svgStringToImageData(svg, pixelRatio);
        // If the SVG→ImageData conversion produced a non-empty result, use it.
        // Otherwise fall through to the local canvas renderer below.
        if (data && data.width > 0 && data.height > 0) return data;
      }
    } catch {
      // Dev server not available — fall through to local rendering.
    }
  }
  // Production path (and dev fallback): render in-browser via milsymbol.
  return buildMilSymbolImageDataLocal(sidc, opts, pixelRatio);
}

/**
 * Create the MapLibre source + two symbol layers (icon + label).
 * Called once on first use, and again after any style.load that wipes sources.
 */
function addSymbolLayers(map: maplibregl.Map, fc: FeatureCollection<Point>) {
  map.addSource(SYM_SOURCE_ID, { type: "geojson", data: fc });

  // Icon layer — viewport-aligned: stays upright regardless of map rotation,
  // pitch, or globe mode. icon-rotate still applies the symbol's direction of
  // movement in screen space (clockwise from up).
  map.addLayer({
    id:     SYM_LAYER_ID,
    type:   "symbol",
    source: SYM_SOURCE_ID,
    layout: {
      "icon-image":              ["get", "symbolKey"],
      "icon-rotate":             ["get", "direction"],
      "icon-rotation-alignment": "viewport",
      "icon-pitch-alignment":    "viewport",
      "icon-size":               1,
      "icon-allow-overlap":      true,
      "icon-ignore-placement":   true,
    },
    paint: {
      "icon-opacity": ["coalesce", ["get", "opacity"], 1],
    },
  });

  // Label layer — also viewport-aligned so text is always horizontal.
  map.addLayer({
    id:     SYM_LABEL_ID,
    type:   "symbol",
    source: SYM_SOURCE_ID,
    layout: {
      "text-field":              ["get", "label"],
      "text-offset":             [0, 2.4],
      "text-anchor":             "top",
      "text-size":               11,
      "text-rotation-alignment": "viewport",
      "text-pitch-alignment":    "viewport",
      "text-allow-overlap":      false,
      "text-ignore-placement":   false,
      "text-font":               ["Noto Sans Regular", "Arial Unicode MS Regular"],
    },
    paint: {
      "text-color":      "#111111",
      "text-halo-color": "rgba(255,255,255,0.9)",
      "text-halo-width": 1.5,
      "text-opacity":    ["coalesce", ["get", "opacity"], 1],
    },
  });
}

// ─── Component ─────────────────────────────────────────────────────────────

export default function MilSymbolRenderer({ mapControllerRef }: MilSymbolRendererProps) {
  // Read the layers array — Zustand returns the same reference when nothing changes.
  const milLayers = useMilLayerStore((s) => s.layers);
  // Derive visible symbols via useMemo so the derived array is only recreated
  // when milLayers actually changes, not on every render.
  const symbols = useMemo(
    () => milLayers.filter((l) => l.visible).flatMap((l) => l.symbols),
    [milLayers]
  );

  /** symbol key → { sidc, options } — read by the styleimagemissing handler. */
  const symbolCacheRef = useRef<Map<string, SymbolCacheEntry>>(new Map());

  /** Last GeoJSON snapshot — used to rebuild source after style.load. */
  const lastFcRef = useRef<FeatureCollection<Point>>({
    type: "FeatureCollection",
    features: [],
  });

  /** Already-tracked mil-graphic source ids. */
  const graphicSourcesRef = useRef<Set<string>>(new Set());

  // ── One-time map event wiring ─────────────────────────────────────────
  //
  // styleimagemissing is registered once; it closes over symbolCacheRef so it
  // always sees the latest cache entries without needing re-registration.
  useEffect(() => {
    const map = mapControllerRef.current?.getMap();
    if (!map) return;

    // Lazy rasterize: MapLibre calls this when it first needs a sprite image.
    // The handler is async: tries the milsymbol server first, then falls back
    // to client-side rendering so production Tauri builds always work.
    const onImageMissing = async (e: { id: string }) => {
      if (!e.id.startsWith(IMG_PREFIX)) return;
      if (map.hasImage(e.id)) return;
      const entry = symbolCacheRef.current.get(e.id);
      if (!entry) return;
      const data = await buildMilSymbolImageData(entry.sidc, entry.options, PIXEL_RATIO);
      if (data && !map.hasImage(e.id)) map.addImage(e.id, data, { pixelRatio: PIXEL_RATIO });
    };

    // After a basemap style reload all sources/layers are cleared — recreate.
    const onStyleLoad = () => {
      if (!map.getSource(SYM_SOURCE_ID)) {
        addSymbolLayers(map, lastFcRef.current);
      }
    };

    map.on("styleimagemissing", onImageMissing);
    map.on("style.load", onStyleLoad);

    return () => {
      map.off("styleimagemissing", onImageMissing);
      map.off("style.load", onStyleLoad);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Sync mil-symbol items → GeoJSON source ───────────────────────────
  useEffect(() => {
    const map = mapControllerRef.current?.getMap();
    if (!map) return;

    const features: Feature<Point>[] = [];

    for (const sym of symbols) {
      if (!sym.sidc || sym.lon === undefined || sym.lat === undefined) continue;

      // Resolve parent layer opacity
      const parentLayer = milLayers.find((l) => l.id === sym.layerId);
      const opacity = parentLayer?.opacity ?? 1;

      const opts: SymbolOptions = {
        size:              SYMBOL_SIZE,
        uniqueDesignation: sym.uniqueDesignation,
        higherFormation:   sym.higherFormation,
        outlineColor:      "white",
        outlineWidth:      6,
      };
      const key = makeSymbolKey(sym.sidc, opts);
      symbolCacheRef.current.set(key, { sidc: sym.sidc, options: opts });

      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [sym.lon, sym.lat] },
        properties: {
          id:        sym.id,
          symbolKey: key,
          direction: sym.direction ?? 0,
          label:     sym.uniqueDesignation ?? "",
          opacity,
        },
      });
    }

    const fc: FeatureCollection<Point> = { type: "FeatureCollection", features };
    lastFcRef.current = fc;

    if (map.getSource(SYM_SOURCE_ID)) {
      (map.getSource(SYM_SOURCE_ID) as GeoJSONSource).setData(fc);
    } else if (map.isStyleLoaded()) {
      addSymbolLayers(map, fc);
    }
  }, [symbols, milLayers, mapControllerRef]);

  // ── Sync mil-graphic items → GeoJSON sources/layers ─────────────────
  useEffect(() => {
    const map = mapControllerRef.current?.getMap();
    if (!map || !map.isStyleLoaded()) return;

    // Collect all graphics across visible layers
    const allGraphics: (MilGraphicItem & { visible: boolean; layerOpacity: number })[] = [];
    for (const layer of milLayers) {
      for (const gr of layer.graphics) {
        allGraphics.push({ ...gr, visible: layer.visible, layerOpacity: layer.opacity });
      }
    }
    const graphicIds = new Set(allGraphics.map((g) => g.id));

    // Remove stale graphic sources
    for (const id of graphicSourcesRef.current) {
      if (!graphicIds.has(id)) {
        const lineId = `mg-line-${id}`;
        const fillId = `mg-fill-${id}`;
        if (map.getLayer(lineId)) map.removeLayer(lineId);
        if (map.getLayer(fillId)) map.removeLayer(fillId);
        if (map.getSource(id))    map.removeSource(id);
        graphicSourcesRef.current.delete(id);
      }
    }

    for (const gr of allGraphics) {
      if (!gr.sidc || !gr.coordinates?.length) continue;

      const color  = "#4A7FCE"; // TODO: derive from SIDC identity
      const lineId = `mg-line-${gr.id}`;
      const fillId = `mg-fill-${gr.id}`;

      const geom =
        gr.geometryType === "Polygon"
          ? { type: "Polygon"    as const, coordinates: [gr.coordinates] }
          : { type: "LineString" as const, coordinates: gr.coordinates };

      const geoData = {
        type:       "Feature"  as const,
        geometry:   geom,
        properties: { name: gr.name, sidc: gr.sidc },
      };

      if (graphicSourcesRef.current.has(gr.id)) {
        (map.getSource(gr.id) as maplibregl.GeoJSONSource)?.setData(geoData);
        const vis = gr.visible ? "visible" : "none";
        if (map.getLayer(lineId)) map.setLayoutProperty(lineId, "visibility", vis);
        if (map.getLayer(fillId)) map.setLayoutProperty(fillId, "visibility", vis);
      } else {
        map.addSource(gr.id, { type: "geojson", data: geoData });

        if (gr.geometryType === "Polygon") {
          map.addLayer({
            id: fillId,
            type: "fill",
            source: gr.id,
            paint: {
              "fill-color":   color,
              "fill-opacity": gr.layerOpacity * 0.15,
            },
            layout: { visibility: gr.visible ? "visible" : "none" },
          });
        }

        map.addLayer({
          id: lineId,
          type: "line",
          source: gr.id,
          paint: {
            "line-color":     color,
            "line-width":     2.5,
            "line-opacity":   gr.layerOpacity,
            "line-dasharray": [6, 3],
          },
          layout: { visibility: gr.visible ? "visible" : "none" },
        });

        graphicSourcesRef.current.add(gr.id);
      }
    }
  }, [milLayers, mapControllerRef]);

  // ── Cleanup on unmount ────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      const map = mapControllerRef.current?.getMap();
      if (!map) return;
      if (map.getLayer(SYM_LABEL_ID))   map.removeLayer(SYM_LABEL_ID);
      if (map.getLayer(SYM_LAYER_ID))   map.removeLayer(SYM_LAYER_ID);
      if (map.getSource(SYM_SOURCE_ID)) map.removeSource(SYM_SOURCE_ID);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
