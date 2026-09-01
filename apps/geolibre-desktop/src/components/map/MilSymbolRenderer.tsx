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
import { useAppStore } from "@geolibre/core";
import ms from "milsymbol";
import type { SymbolOptions } from "milsymbol";
import type { FeatureCollection, Feature, Point } from "geojson";
import type {
  GeoLibreLayer,
} from "@geolibre/core";
import { parseMilSymbolLayerSource, DEFAULT_MIL_SYMBOL_SIZE_PX } from "../../lib/milsymbol-layer-source";
import { parseMilGraphicLayerSource } from "../../lib/milgraphic-layer-source";

// ─── Constants ─────────────────────────────────────────────────────────────

const MilSymbol = ms.Symbol;

const SYM_SOURCE_ID = "mil-symbol-source";
const SYM_LAYER_ID  = "mil-symbol-layer";

/** Image-id prefix — prevents collisions with basemap sprites. */
const IMG_PREFIX = "ms-";

/** Default symbol size (CSS px) at 1× DPR. */
const SYMBOL_SIZE = DEFAULT_MIL_SYMBOL_SIZE_PX;

/** Capture DPR once; constant for the component lifetime. */
const PIXEL_RATIO = window.devicePixelRatio || 1;

// ─── Types ─────────────────────────────────────────────────────────────────

interface SymbolCacheEntry {
  sidc: string;
  options: SymbolOptions;
}

function cleanSymbolOptions(opts: SymbolOptions): SymbolOptions {
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(opts)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    cleaned[key] = value;
  }
  return cleaned as SymbolOptions;
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
 * Create the MapLibre source + icon symbol layer.
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
      "icon-rotate":             ["to-number", ["get", "direction"], 0],
      "icon-rotation-alignment": "viewport",
      "icon-pitch-alignment":    "viewport",
      "icon-size":               1,
      "icon-allow-overlap":      true,
      "icon-ignore-placement":   true,
    },
    paint: {
      "icon-opacity": ["to-number", ["get", "opacity"], 1],
    },
  });
}

function graphicColorFromAffiliation(affiliation: unknown): string {
  switch (affiliation) {
    case "HOSTILE":
      return "#CE4A4A";
    case "NEUTRAL":
      return "#4ACE8C";
    case "UNKNOWN":
      return "#A8A8A8";
    case "FRIENDLY":
    default:
      return "#4A7FCE";
  }
}

// ─── Component ─────────────────────────────────────────────────────────────

export default function MilSymbolRenderer({ mapControllerRef }: MilSymbolRendererProps) {
  const layers = useAppStore((s) => s.layers);
  const milLayers = useMemo(
    () => layers.filter((layer) => layer.type === "mil-symbol" || layer.type === "mil-graphic"),
    [layers]
  );
  const symbols = useMemo(
    () => milLayers.filter((layer) => layer.type === "mil-symbol" && layer.visible),
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
    const onImageMissing = (e: { id: string }) => {
      if (!e.id.startsWith(IMG_PREFIX)) return;
      if (map.hasImage(e.id)) return;
      const entry = symbolCacheRef.current.get(e.id);
      if (!entry) return;
      let data = buildMilSymbolImageData(entry.sidc, entry.options, PIXEL_RATIO);
      if (!data) {
        const fallbackOpts: SymbolOptions = {
          size: entry.options.size,
          outlineColor: "white",
          outlineWidth: 6,
        };
        data = buildMilSymbolImageData(entry.sidc, fallbackOpts, PIXEL_RATIO);
      }
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

  // ── Sync mil-symbol items → GeoJSON source ───────────────────────────
  useEffect(() => {
    const map = mapControllerRef.current?.getMap();
    if (!map) return;

    const features: Feature<Point>[] = [];

    for (const layer of symbols) {
      const parsed = parseMilSymbolLayerSource(layer.source);
      const layerSize =
        typeof parsed.symbolSize === "number" &&
        Number.isFinite(parsed.symbolSize) &&
        parsed.symbolSize > 0
          ? parsed.symbolSize
          : SYMBOL_SIZE;
      const layerOpacity =
        typeof layer.opacity === "number" && Number.isFinite(layer.opacity)
          ? Math.max(0, Math.min(1, layer.opacity))
          : 1;

      for (const symbol of parsed.symbols) {
        if (!Number.isFinite(symbol.lon) || !Number.isFinite(symbol.lat)) {
          continue;
        }
        const direction =
          typeof symbol.direction === "number" && Number.isFinite(symbol.direction)
            ? symbol.direction
            : 0;
        const opts: SymbolOptions = {
          size:              layerSize,
          infoFields:        true,
          uniqueDesignation: symbol.uniqueDesignation,
          higherFormation:   symbol.higherFormation,
          staffComments:     symbol.staffComments,
          additionalInformation: symbol.additionalInformation,
          dtg:               symbol.dtg,
          altitudeDepth:     symbol.altitudeDepth,
          outlineColor:      "white",
          outlineWidth:      6,
          quantity:          symbol.quantity,
          iffSif:            symbol.iffSif,
          speed:             symbol.speed,
          type:              symbol.typeStr,
          reinforcedReduced: symbol.reinforcedReduced,
          combatEffectiveness: symbol.combatEffectiveness,
          evaluationRating:  symbol.evaluationRating,
        };
        const cleanedOpts = cleanSymbolOptions(opts);
        const key = makeSymbolKey(symbol.SIDC, cleanedOpts);
        symbolCacheRef.current.set(key, { sidc: symbol.SIDC, options: cleanedOpts });

        features.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: [symbol.lon, symbol.lat] },
          properties: {
            id:        symbol.id,
            symbolKey: key,
            direction,
            opacity:   layerOpacity,
          },
        });
      }
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
    if (!map) return;

    const syncGraphics = () => {
      if (!map.isStyleLoaded()) return;

      // Collect all graphics across visible layers
      const allGraphics = milLayers.filter(
        (layer): layer is GeoLibreLayer => layer.type === "mil-graphic"
      );
      const graphicIds = new Set(allGraphics.map((layer) => layer.id));

      // Remove stale graphic sources
      for (const id of graphicSourcesRef.current) {
        if (!graphicIds.has(id)) {
          const lineId = `mg-line-${id}`;
          const fillId = `mg-fill-${id}`;
          const dirId = `mg-dir-${id}`;
          if (map.getLayer(dirId)) map.removeLayer(dirId);
          if (map.getLayer(lineId)) map.removeLayer(lineId);
          if (map.getLayer(fillId)) map.removeLayer(fillId);
          if (map.getSource(id)) map.removeSource(id);
          graphicSourcesRef.current.delete(id);
        }
      }

      for (const layer of allGraphics) {
        const parsed = parseMilGraphicLayerSource(layer.source);
        if (parsed.graphics.length === 0) continue;

        const lineId = `mg-line-${layer.id}`;
        const fillId = `mg-fill-${layer.id}`;
        const dirId = `mg-dir-${layer.id}`;
        const hasDirectional = parsed.graphics.some(
          (graphic) => graphic.geometryType === "LineString" && graphic.tacticalDirectional === true,
        );

        const features = parsed.graphics.map((graphic) => {
          const color = graphicColorFromAffiliation(graphic.affiliation);
          const geom =
            graphic.geometryType === "Polygon"
              ? ({ type: "Polygon" as const, coordinates: [graphic.coordinates] })
              : ({ type: "LineString" as const, coordinates: graphic.coordinates });

          return {
            type: "Feature" as const,
            geometry: geom,
            properties: {
              id: graphic.id,
              name: graphic.name,
              sidc: graphic.SIDC,
              color,
              directional: graphic.tacticalDirectional === true ? 1 : 0,
            },
          };
        });

        const geoData = {
          type: "FeatureCollection" as const,
          features,
        };

        if (graphicSourcesRef.current.has(layer.id) && map.getSource(layer.id)) {
          (map.getSource(layer.id) as maplibregl.GeoJSONSource)?.setData(geoData);
          const vis = layer.visible ? "visible" : "none";
          if (map.getLayer(lineId)) map.setLayoutProperty(lineId, "visibility", vis);
          if (map.getLayer(fillId)) map.setLayoutProperty(fillId, "visibility", vis);
          if (map.getLayer(dirId)) map.setLayoutProperty(dirId, "visibility", vis);
        } else {
          map.addSource(layer.id, { type: "geojson", data: geoData });

          map.addLayer({
            id: fillId,
            type: "fill",
            source: layer.id,
            filter: ["==", ["geometry-type"], "Polygon"],
            paint: {
              "fill-color": ["coalesce", ["get", "color"], "#4A7FCE"],
              "fill-opacity": layer.opacity * 0.15,
            },
            layout: { visibility: layer.visible ? "visible" : "none" },
          });

          map.addLayer({
            id: lineId,
            type: "line",
            source: layer.id,
            paint: {
              "line-color": ["coalesce", ["get", "color"], "#4A7FCE"],
              "line-width": [
                "interpolate",
                ["linear"],
                ["zoom"],
                4, 1.25,
                8, 2,
                12, 3,
                16, 5,
                20, 8,
              ],
              "line-opacity": layer.opacity,
              "line-dasharray": [3, 1.75],
            },
            layout: { visibility: layer.visible ? "visible" : "none" },
          });

          if (hasDirectional) {
            map.addLayer({
              id: dirId,
              type: "symbol",
              source: layer.id,
              filter: [
                "all",
                ["==", ["geometry-type"], "LineString"],
                [">", ["coalesce", ["get", "directional"], 0], 0],
              ],
              layout: {
                "symbol-placement": "line",
                "symbol-spacing": 180,
                "text-field": ">",
                "text-font": ["Open Sans Regular"],
                "text-size": [
                  "interpolate",
                  ["linear"],
                  ["zoom"],
                  6, 10,
                  12, 14,
                  18, 18,
                ],
                "text-keep-upright": false,
              },
              paint: {
                "text-color": ["coalesce", ["get", "color"], "#4A7FCE"],
                "text-opacity": layer.opacity,
                "text-halo-color": "#ffffff",
                "text-halo-width": 1,
              },
            });
          }

          graphicSourcesRef.current.add(layer.id);
        }

        if (!hasDirectional && map.getLayer(dirId)) {
          map.removeLayer(dirId);
        }
      }
    };

    syncGraphics();

    const onStyleLoad = () => {
      graphicSourcesRef.current.clear();
      syncGraphics();
    }

    map.on("style.load", onStyleLoad);

    return () => {
      map.off("style.load", onStyleLoad);
    };
  }, [milLayers, mapControllerRef]);

  // ── Cleanup on unmount ────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      const map = mapControllerRef.current?.getMap();
      if (!map) return;
      if (map.getLayer(SYM_LAYER_ID))   map.removeLayer(SYM_LAYER_ID);
      if (map.getSource(SYM_SOURCE_ID)) map.removeSource(SYM_SOURCE_ID);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
