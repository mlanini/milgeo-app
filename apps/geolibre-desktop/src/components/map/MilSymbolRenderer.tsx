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
import ms from "../../lib/milsymbol-runtime";
import type { SymbolOptions } from "milsymbol";
import type { FeatureCollection, Feature, Point } from "geojson";
import type {
  GeoLibreLayer,
} from "@geolibre/core";
import { parseMilSymbolLayerSource, DEFAULT_MIL_SYMBOL_SIZE_PX } from "../../lib/milsymbol-layer-source";
import { parseMilGraphicLayerSource } from "../../lib/milgraphic-layer-source";
import { milGraphicsToGeoJson } from "../../lib/milgraphic-geojson";

// ─── Constants ─────────────────────────────────────────────────────────────

const MilSymbol = ms.Symbol;

const SYM_SOURCE_ID = "mil-symbol-source";
const SYM_LAYER_ID  = "mil-symbol-layer";

/** Image-id prefix — prevents collisions with basemap sprites. */
const IMG_PREFIX = "ms-";

/** Default symbol size (CSS px) at 1× DPR. */
const SYMBOL_SIZE = DEFAULT_MIL_SYMBOL_SIZE_PX;
const TACTICAL_ARROW_FRIENDLY = "mil-tactical-arrow-friendly";
const TACTICAL_ARROW_HOSTILE = "mil-tactical-arrow-hostile";
const TACTICAL_ARROW_NEUTRAL = "mil-tactical-arrow-neutral";
const TACTICAL_ARROW_UNKNOWN = "mil-tactical-arrow-unknown";

/** Capture DPR once; constant for the component lifetime. */
const PIXEL_RATIO = window.devicePixelRatio || 1;

function graphicSourceId(layerId: string): string {
  return `mg-source-${layerId}`;
}

function graphicLineLayerId(layerId: string): string {
  return `mg-line-${layerId}`;
}

function graphicFillLayerId(layerId: string): string {
  return `mg-fill-${layerId}`;
}

function graphicDirectionLayerId(layerId: string): string {
  return `mg-dir-${layerId}`;
}

function buildArrowHeadImageData(color: string): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new ImageData(2, 2);
  ctx.clearRect(0, 0, 64, 64);
  ctx.beginPath();
  ctx.moveTo(32, 4);
  ctx.lineTo(58, 56);
  ctx.lineTo(32, 46);
  ctx.lineTo(6, 56);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 4;
  ctx.stroke();
  return ctx.getImageData(0, 0, 64, 64);
}

function ensureTacticalArrowImages(map: maplibregl.Map): void {
  if (!map.hasImage(TACTICAL_ARROW_FRIENDLY)) {
    map.addImage(TACTICAL_ARROW_FRIENDLY, buildArrowHeadImageData("#4A7FCE"), { pixelRatio: 2 });
  }
  if (!map.hasImage(TACTICAL_ARROW_HOSTILE)) {
    map.addImage(TACTICAL_ARROW_HOSTILE, buildArrowHeadImageData("#CE4A4A"), { pixelRatio: 2 });
  }
  if (!map.hasImage(TACTICAL_ARROW_NEUTRAL)) {
    map.addImage(TACTICAL_ARROW_NEUTRAL, buildArrowHeadImageData("#4ACE8C"), { pixelRatio: 2 });
  }
  if (!map.hasImage(TACTICAL_ARROW_UNKNOWN)) {
    map.addImage(TACTICAL_ARROW_UNKNOWN, buildArrowHeadImageData("#A8A8A8"), { pixelRatio: 2 });
  }
}

function hasRenderableMilGraphicFeatures(value: unknown): value is FeatureCollection {
  if (!value || typeof value !== "object") return false;
  const record = value as { features?: unknown };
  if (!Array.isArray(record.features)) return false;
  return record.features.some((feature) => {
    if (!feature || typeof feature !== "object") return false;
    const geometry = (feature as { geometry?: { type?: unknown } }).geometry;
    return geometry?.type === "LineString" || geometry?.type === "Polygon";
  });
}

// ─── Types ─────────────────────────────────────────────────────────────────

interface SymbolCacheEntry {
  sidc: string;
  options: SymbolOptions;
}

interface MarkerEntry {
  marker: maplibregl.Marker;
  symbolKey: string;
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
  /**
   * Bumped by the shell each time the MapLibre controller (re)initialises.
   * Used as an effect dependency so this render-less component wires up its
   * map event handlers once the map is actually ready, even when no symbols
   * exist yet at first mount.
   */
  mapReadyGeneration?: number;
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

function ensureSymbolImage(
  map: maplibregl.Map,
  key: string,
  sidc: string,
  options: SymbolOptions,
  pixelRatio: number,
): void {
  if (map.hasImage(key)) return;
  let data = buildMilSymbolImageData(sidc, options, pixelRatio);
  if (!data) {
    const fallbackOpts: SymbolOptions = {
      size: options.size,
      outlineColor: "white",
      outlineWidth: 6,
    };
    data = buildMilSymbolImageData(sidc, fallbackOpts, pixelRatio);
  }
  // Avoid repeated styleimagemissing/render-error loops when SIDC is invalid.
  if (!data) data = new ImageData(2, 2);
  try {
    map.addImage(key, data, { pixelRatio });
  } catch {
    // style reload race: a later sync/style event will retry.
  }
}

function buildMilSymbolMarkerElement(sidc: string, options: SymbolOptions): HTMLDivElement | null {
  try {
    const symb = new MilSymbol(sidc, options);
    if (!symb.isValid()) return null;
    const svg = symb.asSVG();
    if (!svg) return null;
    const element = document.createElement("div");
    element.className = "geolibre-mil-symbol-marker";
    element.style.pointerEvents = "none";
    element.style.transformOrigin = "center center";
    element.style.display = "block";
    element.innerHTML = svg;
    const root = element.firstElementChild as HTMLElement | null;
    if (root) {
      root.style.display = "block";
    }
    return element;
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
      "icon-rotate":             ["coalesce", ["get", "direction"], 0],
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
}

// ─── Component ─────────────────────────────────────────────────────────────

export default function MilSymbolRenderer({
  mapControllerRef,
  mapReadyGeneration,
}: MilSymbolRendererProps) {
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

  /** Live DOM markers keyed by layer+symbol id, used as a robust fallback path. */
  const markerEntriesRef = useRef<Map<string, MarkerEntry>>(new Map());

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
      ensureSymbolImage(map, e.id, entry.sidc, entry.options, PIXEL_RATIO);
    };

    // After a basemap style reload all sources/layers are cleared — recreate.
    const onStyleLoad = () => {
      for (const [key, entry] of symbolCacheRef.current.entries()) {
        ensureSymbolImage(map, key, entry.sidc, entry.options, PIXEL_RATIO);
      }
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
  }, [mapReadyGeneration]);

  // ── Sync mil-symbol items → GeoJSON source ───────────────────────────
  useEffect(() => {
    const map = mapControllerRef.current?.getMap();
    if (!map) return;

    const features: Feature<Point>[] = [];

    for (const layer of symbols) {
      const parsed = parseMilSymbolLayerSource(layer.source);
      const showAmplifiers = parsed.showAmplifiers;
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
          ...(showAmplifiers ? { outlineColor: "white", outlineWidth: 6 } : {}),
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
        if (map.isStyleLoaded()) {
          ensureSymbolImage(map, key, symbol.SIDC, cleanedOpts, PIXEL_RATIO);
        }

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
  }, [symbols, milLayers, mapControllerRef, mapReadyGeneration]);

  // ── Sync mil-symbol items → DOM markers fallback ───────────────────
  useEffect(() => {
    const map = mapControllerRef.current?.getMap();
    if (!map) return;

    const nextIds = new Set<string>();

    for (const layer of symbols) {
      const parsed = parseMilSymbolLayerSource(layer.source);
      const showAmplifiers = parsed.showAmplifiers;
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
        if (!Number.isFinite(symbol.lon) || !Number.isFinite(symbol.lat)) continue;
        const opts: SymbolOptions = cleanSymbolOptions({
          size: layerSize,
          infoFields: true,
          uniqueDesignation: symbol.uniqueDesignation,
          higherFormation: symbol.higherFormation,
          staffComments: symbol.staffComments,
          additionalInformation: symbol.additionalInformation,
          dtg: symbol.dtg,
          altitudeDepth: symbol.altitudeDepth,
          ...(showAmplifiers ? { outlineColor: "white", outlineWidth: 6 } : {}),
          quantity: symbol.quantity,
          iffSif: symbol.iffSif,
          speed: symbol.speed,
          type: symbol.typeStr,
          reinforcedReduced: symbol.reinforcedReduced,
          combatEffectiveness: symbol.combatEffectiveness,
          evaluationRating: symbol.evaluationRating,
        });
        const markerId = `${layer.id}:${symbol.id}`;
        nextIds.add(markerId);
        const direction =
          typeof symbol.direction === "number" && Number.isFinite(symbol.direction)
            ? symbol.direction
            : 0;
        const symbolKey = makeSymbolKey(symbol.SIDC, opts);
        const current = markerEntriesRef.current.get(markerId);
        if (current && current.symbolKey === symbolKey) {
          const element = current.marker.getElement() as HTMLElement;
          element.style.opacity = String(layerOpacity);
          current.marker.setLngLat([symbol.lon, symbol.lat]);
          current.marker.setRotation(direction);
          continue;
        }

        current?.marker.remove();
        const element = buildMilSymbolMarkerElement(symbol.SIDC, opts);
        if (!element) continue;
        element.style.opacity = String(layerOpacity);
        const marker = new maplibregl.Marker({ element, anchor: "center", rotationAlignment: "viewport" })
          .setLngLat([symbol.lon, symbol.lat])
          .setRotation(direction)
          .addTo(map);
        markerEntriesRef.current.set(markerId, { marker, symbolKey });
      }
    }

    for (const [markerId, entry] of markerEntriesRef.current.entries()) {
      if (nextIds.has(markerId)) continue;
      entry.marker.remove();
      markerEntriesRef.current.delete(markerId);
    }

    return () => {
      for (const entry of markerEntriesRef.current.values()) {
        entry.marker.remove();
      }
      markerEntriesRef.current.clear();
    };
  }, [symbols, mapControllerRef, mapReadyGeneration]);

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
          const srcId = graphicSourceId(id);
          const lineId = graphicLineLayerId(id);
          const fillId = graphicFillLayerId(id);
          const dirId = graphicDirectionLayerId(id);
          if (map.getLayer(dirId)) map.removeLayer(dirId);
          if (map.getLayer(lineId)) map.removeLayer(lineId);
          if (map.getLayer(fillId)) map.removeLayer(fillId);
          if (map.getSource(srcId)) map.removeSource(srcId);
          graphicSourcesRef.current.delete(id);
        }
      }

      for (const layer of allGraphics) {
        const srcId = graphicSourceId(layer.id);
        const lineId = graphicLineLayerId(layer.id);
        const fillId = graphicFillLayerId(layer.id);
        const dirId = graphicDirectionLayerId(layer.id);
        const layerVisible = typeof layer.visible === "boolean" ? layer.visible : true;
        const layerOpacity =
          typeof layer.opacity === "number" && Number.isFinite(layer.opacity)
            ? Math.max(0, Math.min(1, layer.opacity))
            : 1;
        const parsed = parseMilGraphicLayerSource(layer.source);
        const fallbackGeoData = milGraphicsToGeoJson(parsed.graphics);
        const geoData = hasRenderableMilGraphicFeatures(layer.geojson)
          ? layer.geojson
          : fallbackGeoData;
        if (!Array.isArray(geoData.features) || geoData.features.length === 0) continue;

        const hasDirectional = geoData.features.some((feature) => {
          if (feature.geometry?.type !== "Point") return false;
          const props =
            feature.properties && typeof feature.properties === "object"
              ? (feature.properties as Record<string, unknown>)
              : null;
          return props?.renderRole === "direction-of-attack-head";
        });

        const sourceExists = Boolean(map.getSource(srcId));
        if (!sourceExists) {
          map.addSource(srcId, { type: "geojson", data: geoData });
        } else {
          (map.getSource(srcId) as maplibregl.GeoJSONSource)?.setData(geoData);
        }

        if (!map.getLayer(fillId)) {
          map.addLayer({
            id: fillId,
            type: "fill",
            source: srcId,
            filter: ["==", ["geometry-type"], "Polygon"],
            paint: {
              "fill-color": ["coalesce", ["get", "color"], "#4A7FCE"],
              "fill-opacity": [
                "*",
                layerOpacity,
                [
                  "case",
                  ["==", ["coalesce", ["get", "areaPattern"], "none"], "no-fire"],
                  0.3,
                  ["==", ["coalesce", ["get", "areaPattern"], "none"], "fortified"],
                  0.24,
                  0.18,
                ],
              ],
            },
            layout: { visibility: layerVisible ? "visible" : "none" },
          });
        }

        if (!map.getLayer(lineId)) {
          map.addLayer({
            id: lineId,
            type: "line",
            source: srcId,
            paint: {
              "line-color": ["coalesce", ["get", "color"], "#4A7FCE"],
              "line-width": [
                "case",
                ["==", ["coalesce", ["get", "renderRole"], "main-line"], "flot-right-tick"],
                [
                  "interpolate",
                  ["linear"],
                  ["zoom"],
                  4, 1.5,
                  10, 2.2,
                  16, 3.2,
                ],
                [
                  "interpolate",
                  ["linear"],
                  ["zoom"],
                  4, 2,
                  8, 3,
                  12, 4.5,
                  16, 7,
                  20, 10,
                ],
              ],
              "line-opacity": layerOpacity,
              "line-dasharray": [
                "case",
                ["==", ["coalesce", ["get", "ruleKey"], "fallback"], "no_fire_area"],
                ["literal", [2, 1.3]],
                ["literal", [1, 0.001]],
              ],
              "line-cap": "round",
              "line-join": "round",
            },
            layout: { visibility: layerVisible ? "visible" : "none" },
          });
        }

        if (hasDirectional && !map.getLayer(dirId)) {
          ensureTacticalArrowImages(map);
          map.addLayer({
            id: dirId,
            type: "symbol",
            source: srcId,
            filter: [
              "==",
              ["coalesce", ["get", "renderRole"], ""],
              "direction-of-attack-head",
            ],
            layout: {
              "icon-image": [
                "match",
                ["coalesce", ["get", "affiliation"], "FRIENDLY"],
                "HOSTILE",
                TACTICAL_ARROW_HOSTILE,
                "NEUTRAL",
                TACTICAL_ARROW_NEUTRAL,
                "UNKNOWN",
                TACTICAL_ARROW_UNKNOWN,
                TACTICAL_ARROW_FRIENDLY,
              ],
              "icon-size": [
                "interpolate",
                ["linear"],
                ["zoom"],
                6, 0.28,
                10, 0.45,
                14, 0.72,
                18, 1,
              ],
              "icon-rotate": ["coalesce", ["get", "bearing"], 0],
              "icon-rotation-alignment": "map",
              "icon-pitch-alignment": "map",
              "icon-allow-overlap": true,
              "icon-ignore-placement": true,
              "icon-anchor": "center",
              "icon-offset": [0, -0.1],
              "symbol-sort-key": [
                "case",
                ["==", ["coalesce", ["get", "renderRole"], ""], "direction-of-attack-head"],
                100,
                0,
              ],
            },
            paint: {
              "icon-opacity": layerOpacity,
            },
          });
        }

        const vis = layerVisible ? "visible" : "none";
        if (map.getLayer(lineId)) map.setLayoutProperty(lineId, "visibility", vis);
        if (map.getLayer(fillId)) map.setLayoutProperty(fillId, "visibility", vis);
        if (map.getLayer(dirId)) map.setLayoutProperty(dirId, "visibility", vis);
        if (map.getLayer(lineId)) map.setPaintProperty(lineId, "line-opacity", layerOpacity);
        if (map.getLayer(fillId)) {
          map.setPaintProperty(fillId, "fill-opacity", [
            "*",
            layerOpacity,
            [
              "case",
              ["==", ["coalesce", ["get", "areaPattern"], "none"], "no-fire"],
              0.3,
              ["==", ["coalesce", ["get", "areaPattern"], "none"], "fortified"],
              0.24,
              0.18,
            ],
          ]);
        }
        if (map.getLayer(dirId)) map.setPaintProperty(dirId, "icon-opacity", layerOpacity);

        graphicSourcesRef.current.add(layer.id);

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
  }, [milLayers, mapControllerRef, mapReadyGeneration]);

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
