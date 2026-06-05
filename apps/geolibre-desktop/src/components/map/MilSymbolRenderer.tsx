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

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import type { GeoJSONSource } from "maplibre-gl";
import { useAppStore } from "@geolibre/core";
import type { MapController } from "@geolibre/map";
import ms from "milsymbol";
import type { SymbolOptions } from "milsymbol";
import type { MilSymbolLayerSource, MilGraphicLayerSource } from "@geolibre/core";
import type { FeatureCollection, Feature, Point } from "geojson";

// ─── Constants ─────────────────────────────────────────────────────────────

const MilSymbol = ms.Symbol;

const SYM_SOURCE_ID = "mil-symbol-source";
const SYM_LAYER_ID  = "mil-symbol-layer";
const SYM_LABEL_ID  = "mil-symbol-labels";

/** Image-id prefix — prevents collisions with basemap sprites. */
const IMG_PREFIX = "ms-";

/** Symbol size (CSS px) at 1× DPR. milsymbol scales internally via asCanvas(). */
const SYMBOL_SIZE = 38;

/** Capture DPR once; constant for the component lifetime. */
const PIXEL_RATIO = window.devicePixelRatio || 1;

const GRAPHIC_COLORS: Record<string, string> = {
  FRIENDLY: "#4A7FCE",
  HOSTILE:  "#CE4A4A",
  NEUTRAL:  "#4ACE8C",
  UNKNOWN:  "#999999",
};

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
 * Technique from orbat-mapper MlMapLogic.vue L494–514.
 */
function buildMilSymbolImageData(
  sidc: string,
  opts: SymbolOptions,
  pixelRatio: number,
): ImageData | null {
  try {
    const symb = new MilSymbol(sidc, opts);
    if (!symb.isValid()) return null;

    const { width, height } = symb.getSize();
    const anchor = symb.getAnchor();
    const srcCanvas = symb.asCanvas(pixelRatio);
    if (!srcCanvas) return null;

    // Pad so the anchor sits at the padded canvas centre.
    // halfW/H = distance from anchor to the farthest edge in each axis.
    const halfW = Math.max(anchor.x, width  - anchor.x);
    const halfH = Math.max(anchor.y, height - anchor.y);
    const pw = Math.ceil(2 * halfW * pixelRatio);
    const ph = Math.ceil(2 * halfH * pixelRatio);
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
 * Create the MapLibre source + two symbol layers (icon + label).
 * Called once on first use, and again after any style.load that wipes sources.
 */
function addSymbolLayers(map: maplibregl.Map, fc: FeatureCollection<Point>) {
  map.addSource(SYM_SOURCE_ID, { type: "geojson", data: fc });

  // Icon layer — WebGL composited, rotates with map, correct HiDPI rendering.
  map.addLayer({
    id:     SYM_LAYER_ID,
    type:   "symbol",
    source: SYM_SOURCE_ID,
    layout: {
      "icon-image":              ["get", "symbolKey"],
      "icon-rotate":             ["get", "direction"],
      "icon-rotation-alignment": "map",
      "icon-size":               1,
      "icon-allow-overlap":      true,
      "icon-ignore-placement":   true,
    },
    paint: {
      "icon-opacity": ["coalesce", ["get", "opacity"], 1],
    },
  });

  // Label layer — separate so text-placement rules apply independently.
  map.addLayer({
    id:     SYM_LABEL_ID,
    type:   "symbol",
    source: SYM_SOURCE_ID,
    layout: {
      "text-field":            ["get", "label"],
      "text-offset":           [0, 2.4],
      "text-anchor":           "top",
      "text-size":             11,
      "text-allow-overlap":    false,
      "text-ignore-placement": false,
      "text-font":             ["Noto Sans Regular", "Arial Unicode MS Regular"],
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
  const layers = useAppStore((s) => s.layers);

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
    const onImageMissing = (e: { id: string }) => {
      if (!e.id.startsWith(IMG_PREFIX)) return;
      if (map.hasImage(e.id)) return;
      const entry = symbolCacheRef.current.get(e.id);
      if (!entry) return;
      const data = buildMilSymbolImageData(entry.sidc, entry.options, PIXEL_RATIO);
      if (data) map.addImage(e.id, data, { pixelRatio: PIXEL_RATIO });
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

  // ── Sync mil-symbol layers → GeoJSON source ───────────────────────────
  useEffect(() => {
    const map = mapControllerRef.current?.getMap();
    if (!map) return;

    const milLayers = layers.filter((l) => l.type === "mil-symbol");
    const features: Feature<Point>[] = [];

    for (const layer of milLayers) {
      if (!layer.visible) continue;
      const src = layer.source as unknown as MilSymbolLayerSource;
      if (!src.SIDC || src.lon === undefined || src.lat === undefined) continue;

      const opts: SymbolOptions = {
        size:              SYMBOL_SIZE,
        uniqueDesignation: src.uniqueDesignation,
        higherFormation:   src.higherFormation,
        outlineColor:      "white",
        outlineWidth:      6,
      };
      const key = makeSymbolKey(src.SIDC, opts);
      symbolCacheRef.current.set(key, { sidc: src.SIDC, options: opts });

      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [src.lon, src.lat] },
        properties: {
          id:        layer.id,
          symbolKey: key,
          direction: src.direction ?? 0,
          label:     src.uniqueDesignation ?? "",
          opacity:   layer.opacity ?? 1,
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
  }, [layers, mapControllerRef]);

  // ── Sync mil-graphic layers → GeoJSON sources/layers ─────────────────
  useEffect(() => {
    const map = mapControllerRef.current?.getMap();
    if (!map || !map.isStyleLoaded()) return;

    const graphicLayers = layers.filter((l) => l.type === "mil-graphic");
    const graphicIds    = new Set(graphicLayers.map((l) => l.id));

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

    for (const layer of graphicLayers) {
      const src = layer.source as unknown as MilGraphicLayerSource;
      if (!src.SIDC || !src.coordinates?.length) continue;

      const color  = GRAPHIC_COLORS[src.affiliation] ?? "#4A7FCE";
      const lineId = `mg-line-${layer.id}`;
      const fillId = `mg-fill-${layer.id}`;

      const geom =
        src.geometryType === "Polygon"
          ? { type: "Polygon"    as const, coordinates: [src.coordinates] }
          : { type: "LineString" as const, coordinates: src.coordinates };

      const geoData = {
        type:       "Feature"  as const,
        geometry:   geom,
        properties: { name: layer.name, sidc: src.SIDC },
      };

      if (graphicSourcesRef.current.has(layer.id)) {
        (map.getSource(layer.id) as maplibregl.GeoJSONSource)?.setData(geoData);
        const vis = layer.visible ? "visible" : "none";
        if (map.getLayer(lineId)) map.setLayoutProperty(lineId, "visibility", vis);
        if (map.getLayer(fillId)) map.setLayoutProperty(fillId, "visibility", vis);
      } else {
        map.addSource(layer.id, { type: "geojson", data: geoData });

        if (src.geometryType === "Polygon") {
          map.addLayer({
            id: fillId,
            type: "fill",
            source: layer.id,
            paint: {
              "fill-color":   color,
              "fill-opacity": (layer.opacity ?? 1) * 0.15,
            },
            layout: { visibility: layer.visible ? "visible" : "none" },
          });
        }

        map.addLayer({
          id: lineId,
          type: "line",
          source: layer.id,
          paint: {
            "line-color":     color,
            "line-width":     2.5,
            "line-opacity":   layer.opacity ?? 1,
            "line-dasharray": [6, 3],
          },
          layout: { visibility: layer.visible ? "visible" : "none" },
        });

        graphicSourcesRef.current.add(layer.id);
      }
    }
  }, [layers, mapControllerRef]);

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
