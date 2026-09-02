import { resolveThreeDTilesRequestHeaders, type GeoLibreLayer } from "@geolibre/core";
import type { Cesium3DTileset, DataSource, ImageryLayer, Viewer } from "cesium";
import ms from "milsymbol";

// Reconciles the store's `GeoLibreLayer[]` onto a Cesium globe, mirroring what
// MapController.syncLayers does for MapLibre. M3 covers the layer kinds where
// Cesium is the natural renderer: GeoJSON (as a draped GeoJsonDataSource), XYZ /
// WMS / WMTS / raster tiles (as ImageryLayers), and 3D Tiles (as a
// Cesium3DTileset). Other kinds are skipped on the globe (they still render in
// the 2D panes); the exported `isCesiumSupportedLayerType` lets the UI flag them.
//
// The engine is injected (the `Cesium` namespace + a `Viewer`) so this module
// carries only type-only Cesium imports and never pulls the engine into the
// build graph itself.

type CesiumNs = typeof import("cesium");

ms.setStandard("APP6");
const MilSymbol = ms.Symbol;

// In nadir view (pitch near -90 deg) symbols stay clamped to terrain. As soon
// as the user tilts the globe, lift symbols into billboard mode for legibility.
const MIL_SYMBOL_BILLBOARD_TILT_THRESHOLD_RAD = -1.52;
const MIL_SYMBOL_BILLBOARD_HEIGHT_M = 30;

/** Layer kinds this pass renders on the globe. */
const IMAGERY_TYPES = new Set(["raster", "xyz", "wms", "wmts"]);

type EntryKind = "imagery" | "geojson" | "3dtiles" | "mil-symbol" | "mil-graphic";

interface LayerEntry {
  kind: EntryKind;
  /** The layer as last applied, for change detection. */
  layer: GeoLibreLayer;
  /** The Cesium object, or null while an async create is in flight. */
  handle: ImageryLayer | DataSource | Cesium3DTileset | null;
  /** Set when the entry is removed mid-load so the resolved handle is discarded. */
  cancelled: boolean;
  /** Last opacity key applied in place to a geojson entry (skips redundant restyles). */
  appliedAlpha?: string;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function firstTile(layer: GeoLibreLayer): string | undefined {
  const tiles = layer.source.tiles;
  return Array.isArray(tiles) ? str(tiles[0]) : undefined;
}

function tilesetUrl(layer: GeoLibreLayer): string | undefined {
  return str(layer.source.url) ?? str(layer.sourcePath);
}

interface ParsedMilSymbolItem {
  id: string;
  name: string;
  SIDC: string;
  lon: number;
  lat: number;
  uniqueDesignation?: string;
}

interface ParsedMilSymbolLayerSource {
  symbols: ParsedMilSymbolItem[];
  symbolSize: number;
  showAmplifiers: boolean;
}

interface ParsedMilGraphicItem {
  id: string;
  name: string;
  geometryType: "LineString" | "Polygon";
  coordinates: [number, number][];
  affiliation: "FRIENDLY" | "HOSTILE" | "NEUTRAL" | "UNKNOWN";
}

interface ParsedMilGraphicLayerSource {
  graphics: ParsedMilGraphicItem[];
}

function parseNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function parseMilSymbolItem(raw: unknown): ParsedMilSymbolItem | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const sidc = parseString(record.SIDC);
  const lon = parseNumber(record.lon);
  const lat = parseNumber(record.lat);
  if (!sidc || lon === null || lat === null) return null;
  return {
    id: parseString(record.id) ?? crypto.randomUUID(),
    name: parseString(record.name) ?? "Symbol",
    SIDC: sidc,
    lon,
    lat,
    uniqueDesignation: parseString(record.uniqueDesignation),
  };
}

function parseMilSymbolLayerSource(source: Record<string, unknown>): ParsedMilSymbolLayerSource {
  const symbolSize = parseNumber(source.symbolSize) ?? 38;
  const showAmplifiers = source.showAmplifiers !== false;
  const rawSymbols = Array.isArray(source.symbols) ? source.symbols : [];
  const symbols = rawSymbols
    .map((item) => parseMilSymbolItem(item))
    .filter((item): item is ParsedMilSymbolItem => item !== null);
  if (symbols.length > 0) return { symbols, symbolSize, showAmplifiers };
  const legacy = parseMilSymbolItem(source);
  return { symbols: legacy ? [legacy] : [], symbolSize, showAmplifiers };
}

function parseCoordinate(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const lon = parseNumber(value[0]);
  const lat = parseNumber(value[1]);
  if (lon === null || lat === null) return null;
  return [lon, lat];
}

function parseCoordinates(value: unknown): [number, number][] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => parseCoordinate(item))
    .filter((item): item is [number, number] => item !== null);
}

function parseAffiliation(value: unknown): ParsedMilGraphicItem["affiliation"] {
  if (value === "HOSTILE") return "HOSTILE";
  if (value === "NEUTRAL") return "NEUTRAL";
  if (value === "UNKNOWN") return "UNKNOWN";
  return "FRIENDLY";
}

function parseGeometryType(value: unknown): "LineString" | "Polygon" | null {
  if (value === "LineString") return "LineString";
  if (value === "Polygon") return "Polygon";
  return null;
}

function parseMilGraphicItem(raw: unknown): ParsedMilGraphicItem | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const geometryType = parseGeometryType(record.geometryType);
  const coordinates = parseCoordinates(record.coordinates);
  if (!geometryType || coordinates.length === 0) return null;
  return {
    id: parseString(record.id) ?? crypto.randomUUID(),
    name: parseString(record.name) ?? "Tactical Graphic",
    geometryType,
    coordinates,
    affiliation: parseAffiliation(record.affiliation),
  };
}

function parseMilGraphicLayerSource(source: Record<string, unknown>): ParsedMilGraphicLayerSource {
  const rawGraphics = Array.isArray(source.graphics) ? source.graphics : [];
  const graphics = rawGraphics
    .map((item) => parseMilGraphicItem(item))
    .filter((item): item is ParsedMilGraphicItem => item !== null);
  if (graphics.length > 0) return { graphics };
  const legacy = parseMilGraphicItem(source);
  return { graphics: legacy ? [legacy] : [] };
}

function parseMilGraphicGeoJson(raw: unknown): ParsedMilGraphicItem[] {
  if (!raw || typeof raw !== "object") return [];
  const record = raw as { features?: unknown };
  if (!Array.isArray(record.features)) return [];
  const graphics: ParsedMilGraphicItem[] = [];
  for (const feature of record.features) {
    if (!feature || typeof feature !== "object") continue;
    const f = feature as {
      geometry?: { type?: unknown; coordinates?: unknown };
      properties?: Record<string, unknown>;
    };
    const geometryType = parseGeometryType(f.geometry?.type);
    if (!geometryType) continue;
    const coordinates =
      geometryType === "Polygon"
        ? parseCoordinates(
            Array.isArray(f.geometry?.coordinates) ? (f.geometry?.coordinates as unknown[])[0] : [],
          )
        : parseCoordinates(f.geometry?.coordinates);
    if (coordinates.length === 0) continue;
    const properties = f.properties ?? {};
    graphics.push({
      id: parseString(properties.id) ?? crypto.randomUUID(),
      name: parseString(properties.name) ?? "Tactical Graphic",
      geometryType,
      coordinates,
      affiliation: parseAffiliation(properties.affiliation),
    });
  }
  return graphics;
}

function closePolygonRing(coordinates: [number, number][]): [number, number][] {
  if (coordinates.length === 0) return [];
  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) return coordinates;
  return [...coordinates, [first[0], first[1]]];
}

function milGraphicCssColor(affiliation: ParsedMilGraphicItem["affiliation"]): string {
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

function milSymbolIconDataUrl(sidc: string, size: number, showAmplifiers: boolean): string | null {
  try {
    const symbol = new MilSymbol(sidc, {
      size,
      ...(showAmplifiers ? { outlineColor: "white", outlineWidth: 6 } : {}),
      infoFields: true,
    });
    if (!symbol.isValid()) return null;
    return symbol.toDataURL();
  } catch {
    return null;
  }
}

/**
 * Whether the globe can render this layer *kind* at all (regardless of whether
 * its data has loaded yet). Exported so the UI can flag "2D only" layers on a
 * globe pane. See the module header for the supported kinds.
 */
export function isCesiumSupportedLayerType(layer: GeoLibreLayer): boolean {
  return (
    layer.type === "geojson" ||
    layer.type === "3d-tiles" ||
    layer.type === "mil-symbol" ||
    layer.type === "mil-graphic" ||
    IMAGERY_TYPES.has(layer.type)
  );
}

/** Whether this layer can render on the globe now (kind supported + data ready). */
function isSupported(layer: GeoLibreLayer): boolean {
  if (!isCesiumSupportedLayerType(layer)) return false;
  if (layer.type === "mil-symbol") {
    return parseMilSymbolLayerSource(layer.source).symbols.length > 0;
  }
  if (layer.type === "mil-graphic") {
    if (layer.geojson?.features?.length) return true;
    return parseMilGraphicLayerSource(layer.source).graphics.length > 0;
  }
  if (layer.type === "geojson") return Boolean(layer.geojson?.features?.length);
  if (layer.type === "3d-tiles") return Boolean(tilesetUrl(layer));
  // Mirror createImagery's real capability: WMS builds from source.url, but
  // xyz/raster/wmts need a tile template — a url alone would render nothing.
  return layer.type === "wms" ? Boolean(str(layer.source.url)) : Boolean(firstTile(layer));
}

function entryKind(layer: GeoLibreLayer): EntryKind {
  if (layer.type === "mil-symbol") return "mil-symbol";
  if (layer.type === "mil-graphic") return "mil-graphic";
  if (layer.type === "geojson") return "geojson";
  if (layer.type === "3d-tiles") return "3dtiles";
  return "imagery";
}

// Fill/stroke *colours*, stroke width, and marker colour bake into the GeoJSON
// entities at load, so a change to any of them forces a rebuild. Opacity
// (layer.opacity × fill opacity) is deliberately excluded: it is re-applied in
// place by applyGeoJsonStyle, so dragging the opacity slider restyles the fill
// alpha instead of reloading the whole GeoJsonDataSource on every tick.
function styleSignature(layer: GeoLibreLayer): string {
  const style = layer.style ?? {};
  return [style.fillColor, style.strokeColor, style.strokeWidth, style.markerColor].join("|");
}

/**
 * Whether the Cesium object must be rebuilt (vs. just re-styled) for the change
 * from `prev` to `next`. Live-settable appearance (visibility, imagery alpha) is
 * excluded; only source/data/geometry changes force a rebuild. The GeoJSON
 * FeatureCollection is compared by reference (the store swaps it on edit) and
 * its fill/stroke colours bake into the Cesium colours at load, so a colour
 * change rebuilds; opacity is restyled in place (see styleSignature).
 */
function needsRebuild(prev: GeoLibreLayer, next: GeoLibreLayer): boolean {
  if (prev.type !== next.type) return true;
  switch (entryKind(next)) {
    case "geojson":
      return prev.geojson !== next.geojson || styleSignature(prev) !== styleSignature(next);
    case "mil-graphic":
      return prev.geojson !== next.geojson || prev.source !== next.source;
    case "mil-symbol":
      return prev.source !== next.source;
    case "imagery":
      return (
        firstTile(prev) !== firstTile(next) ||
        // min/maxzoom bake into UrlTemplateImageryProvider's min/maximumLevel.
        prev.source.maxzoom !== next.source.maxzoom ||
        prev.source.minzoom !== next.source.minzoom ||
        str(prev.source.url) !== str(next.source.url) ||
        str(prev.source.layers) !== str(next.source.layers) ||
        // WMS GetMap params baked into the provider at creation; a change must
        // rebuild it so the globe doesn't keep the stale WebMapServiceImageryProvider.
        str(prev.source.styles) !== str(next.source.styles) ||
        str(prev.source.format) !== str(next.source.format) ||
        str(prev.source.version) !== str(next.source.version) ||
        prev.source.transparent !== next.source.transparent
      );
    case "3dtiles":
      return (
        tilesetUrl(prev) !== tilesetUrl(next) ||
        JSON.stringify(prev.source.requestHeaders ?? null) !==
          JSON.stringify(next.source.requestHeaders ?? null) ||
        prev.source.altitudeOffset !== next.source.altitudeOffset
      );
  }
}

export class CesiumLayerSync {
  private readonly entries = new Map<string, LayerEntry>();
  /** Imagery id order last asserted on the globe, to skip redundant reorders. */
  private lastImageryOrder = "";
  /** Camera listener cleanup hook registered in the constructor. */
  private removeCameraChangedListener: (() => void) | null = null;
  /** Last applied mil-symbol billboard mode (avoids redundant entity updates). */
  private milSymbolBillboardMode: "ground" | "billboard" = "ground";

  constructor(
    private readonly Cesium: CesiumNs,
    private readonly viewer: Viewer,
  ) {
    if (this.viewer.camera.percentageChanged > 0.01) {
      this.viewer.camera.percentageChanged = 0.01;
    }
    const onCameraChanged = () => {
      this.syncMilSymbolBillboardMode();
    };
    this.viewer.camera.changed.addEventListener(onCameraChanged);
    this.removeCameraChangedListener = () => {
      this.viewer.camera.changed.removeEventListener(onCameraChanged);
    };
    this.syncMilSymbolBillboardMode();
  }

  /** Reconcile the globe to `layers` (order preserved for imagery stacking). */
  sync(layers: GeoLibreLayer[]): void {
    const nextIds = new Set(layers.map((l) => l.id));
    for (const [id, entry] of this.entries) {
      if (!nextIds.has(id)) {
        this.destroyEntry(entry);
        this.entries.delete(id);
      }
    }

    // Tracks a create/rebuild of an imagery layer this pass (which re-appends it
    // to the top), so the reorder pass below runs even when the store id order
    // is unchanged.
    let imageryRebuilt = false;
    for (const layer of layers) {
      if (!isSupported(layer)) {
        // A previously-supported layer that became unrenderable (e.g. its data
        // was cleared) is torn down.
        const stale = this.entries.get(layer.id);
        if (stale) {
          this.destroyEntry(stale);
          this.entries.delete(layer.id);
        }
        continue;
      }

      const existing = this.entries.get(layer.id);
      if (!existing) {
        this.createEntry(layer);
        if (entryKind(layer) === "imagery") imageryRebuilt = true;
      } else if (needsRebuild(existing.layer, layer)) {
        this.destroyEntry(existing);
        this.entries.delete(layer.id);
        this.createEntry(layer);
        if (entryKind(layer) === "imagery") imageryRebuilt = true;
      } else {
        existing.layer = layer;
        this.applyAppearance(existing);
      }
    }

    // addImageryProvider always appends to the top, so a rebuild/create re-adds
    // imagery above its store neighbours, and a panel reorder (which doesn't
    // rebuild) changes the intended order without touching the globe. Re-assert
    // store order by raising each imagery layer to the top in turn (the base
    // imagery, never raised, stays at the bottom) — but only when the order
    // could actually have changed. sync() also runs on unrelated changes (e.g.
    // an opacity drag), and each raiseToTop is O(n), so reordering every time
    // would be a needless O(n²) on that hot path.
    const imageryOrder = layers
      .filter((l) => this.entries.get(l.id)?.kind === "imagery")
      .map((l) => l.id)
      .join("\n");
    if (imageryRebuilt || imageryOrder !== this.lastImageryOrder) {
      for (const layer of layers) {
        const entry = this.entries.get(layer.id);
        if (entry?.kind === "imagery" && entry.handle) {
          this.viewer.imageryLayers.raiseToTop(entry.handle as ImageryLayer);
        }
      }
      this.lastImageryOrder = imageryOrder;
    }
  }

  destroy(): void {
    this.removeCameraChangedListener?.();
    this.removeCameraChangedListener = null;
    for (const entry of this.entries.values()) this.destroyEntry(entry);
    this.entries.clear();
  }

  private cameraIsTiltedForBillboards(): boolean {
    const pitch = this.viewer.camera.pitch;
    return Number.isFinite(pitch) && pitch > MIL_SYMBOL_BILLBOARD_TILT_THRESHOLD_RAD;
  }

  private syncMilSymbolBillboardMode(): void {
    const nextMode: "ground" | "billboard" = this.cameraIsTiltedForBillboards()
      ? "billboard"
      : "ground";
    if (nextMode === this.milSymbolBillboardMode) return;
    this.milSymbolBillboardMode = nextMode;
    for (const entry of this.entries.values()) {
      if (entry.kind !== "mil-symbol" || !entry.handle) continue;
      this.applyMilSymbolBillboardMode(entry, nextMode);
    }
  }

  private createEntry(layer: GeoLibreLayer): void {
    const kind = entryKind(layer);
    const entry: LayerEntry = { kind, layer, handle: null, cancelled: false };
    this.entries.set(layer.id, entry);
    if (kind === "imagery") this.createImagery(entry);
    else if (kind === "geojson") void this.createGeoJson(entry);
    else if (kind === "mil-graphic") void this.createMilGraphic(entry);
    else if (kind === "mil-symbol") void this.createMilSymbol(entry);
    else void this.createTileset(entry);
  }

  private createImagery(entry: LayerEntry): void {
    const { Cesium, viewer } = this;
    const layer = entry.layer;
    try {
      let provider;
      if (layer.type === "wms" && str(layer.source.url)) {
        // Pass through the same GetMap params the 2D path records on the layer
        // (WmsSource.tsx), so a non-default style/format/version or an opaque
        // (transparent:false) overlay renders the same on the globe as on the map.
        provider = new Cesium.WebMapServiceImageryProvider({
          url: String(layer.source.url),
          layers: String(layer.source.layers ?? ""),
          parameters: {
            transparent: layer.source.transparent !== false,
            format: str(layer.source.format) ?? "image/png",
            styles: str(layer.source.styles) ?? "",
            version: str(layer.source.version) ?? "1.1.1",
          },
        });
      } else {
        const url = firstTile(layer);
        if (!url) return;
        const maxLevel = Number(layer.source.maxzoom);
        const minLevel = Number(layer.source.minzoom);
        provider = new Cesium.UrlTemplateImageryProvider({
          url,
          maximumLevel: Number.isFinite(maxLevel) ? maxLevel : undefined,
          // Honour the service's min-zoom floor so the globe doesn't request
          // (and 404 on) tiles below the levels the service actually serves.
          minimumLevel: Number.isFinite(minLevel) ? minLevel : undefined,
        });
      }
      // addImageryProvider appends above the base imagery (and earlier store
      // layers), so store order maps to Cesium's bottom-to-top stacking.
      const imageryLayer = viewer.imageryLayers.addImageryProvider(provider);
      entry.handle = imageryLayer;
      this.applyAppearance(entry);
    } catch {
      // A provider that throws synchronously (e.g. malformed WMS params) should
      // not abort the sync pass; mirror createGeoJson/createTileset's best-effort.
    }
  }

  private async createGeoJson(entry: LayerEntry): Promise<void> {
    const { Cesium, viewer } = this;
    const layer = entry.layer;
    if (!layer.geojson) return;
    const style = layer.style ?? {};
    const fill = Cesium.Color.fromCssColorString(style.fillColor ?? "#3b82f6");
    const stroke = Cesium.Color.fromCssColorString(style.strokeColor ?? "#1e40af");
    // Fold the layer + fill opacity into the fill colour (a GeoJsonDataSource has
    // no global alpha). A later opacity change re-applies this alpha in place
    // (applyGeoJsonStyle) rather than reloading the whole data source.
    const fillAlpha = (style.fillOpacity ?? 0.6) * layer.opacity;
    try {
      const dataSource = await Cesium.GeoJsonDataSource.load(layer.geojson, {
        stroke,
        strokeWidth: style.strokeWidth ?? 2,
        fill: fill.withAlpha(fillAlpha),
        markerColor: Cesium.Color.fromCssColorString(style.markerColor ?? "#3b82f6"),
        clampToGround: true,
      });
      if (entry.cancelled) return;
      await viewer.dataSources.add(dataSource);
      if (entry.cancelled) {
        viewer.dataSources.remove(dataSource, true);
        return;
      }
      entry.handle = dataSource;
      // applyAppearance → applyGeoJsonStyle fades every entity kind (fill,
      // stroke, marker) by the layer opacity right after load, so points/lines
      // match the 2D map instead of rendering fully opaque.
      this.applyAppearance(entry);
    } catch {
      // A malformed FeatureCollection should not break the whole sync.
    }
  }

  private async createMilSymbol(entry: LayerEntry): Promise<void> {
    const { Cesium, viewer } = this;
    const parsed = parseMilSymbolLayerSource(entry.layer.source);
    if (parsed.symbols.length === 0) return;
    try {
      const dataSource = new Cesium.CustomDataSource(entry.layer.name);
      for (const symbol of parsed.symbols) {
        const image = milSymbolIconDataUrl(symbol.SIDC, parsed.symbolSize, parsed.showAmplifiers);
        if (!image) continue;
        dataSource.entities.add({
          id: symbol.id,
          name: symbol.name,
          position: Cesium.Cartesian3.fromDegrees(symbol.lon, symbol.lat),
          billboard: {
            image,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            verticalOrigin: Cesium.VerticalOrigin.CENTER,
            horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            scale: 1,
          },
          label: symbol.uniqueDesignation
            ? {
                text: symbol.uniqueDesignation,
                font: "12px sans-serif",
                style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                fillColor: Cesium.Color.WHITE,
                outlineColor: Cesium.Color.BLACK,
                outlineWidth: 2,
                pixelOffset: new Cesium.Cartesian2(0, 22),
                heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
              }
            : undefined,
          properties: {
            lon: symbol.lon,
            lat: symbol.lat,
          },
        });
      }
      if (entry.cancelled) return;
      await viewer.dataSources.add(dataSource);
      if (entry.cancelled) {
        viewer.dataSources.remove(dataSource, true);
        return;
      }
      entry.handle = dataSource;
      this.applyAppearance(entry);
      this.applyMilSymbolBillboardMode(entry, this.milSymbolBillboardMode);
    } catch {
      // Best-effort, like other globe layer kinds.
    }
  }

  private async createMilGraphic(entry: LayerEntry): Promise<void> {
    const { Cesium, viewer } = this;
    const layer = entry.layer;
    const parsed = parseMilGraphicLayerSource(layer.source);
    const graphics =
      parsed.graphics.length > 0 ? parsed.graphics : parseMilGraphicGeoJson(layer.geojson);
    if (graphics.length === 0) return;
    try {
      const dataSource = new Cesium.CustomDataSource(layer.name);
      for (const graphic of graphics) {
        if (graphic.geometryType === "LineString") {
          if (graphic.coordinates.length < 2) continue;
          const positions = Cesium.Cartesian3.fromDegreesArray(graphic.coordinates.flat());
          dataSource.entities.add({
            id: graphic.id,
            name: graphic.name,
            polyline: {
              positions,
              width: 3,
              clampToGround: true,
            },
            properties: {
              affiliation: graphic.affiliation,
              geometryType: "LineString",
            },
          });
          continue;
        }

        const ring = closePolygonRing(graphic.coordinates);
        if (ring.length < 4) continue;
        const hierarchy = Cesium.Cartesian3.fromDegreesArray(ring.flat());
        dataSource.entities.add({
          id: graphic.id,
          name: graphic.name,
          polygon: {
            hierarchy,
            perPositionHeight: false,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            classificationType: Cesium.ClassificationType.TERRAIN,
            outline: true,
          },
          properties: {
            affiliation: graphic.affiliation,
            geometryType: "Polygon",
          },
        });
      }
      if (entry.cancelled) return;
      await viewer.dataSources.add(dataSource);
      if (entry.cancelled) {
        viewer.dataSources.remove(dataSource, true);
        return;
      }
      entry.handle = dataSource;
      this.applyAppearance(entry);
    } catch {
      // Best-effort, like other globe layer kinds.
    }
  }

  private async createTileset(entry: LayerEntry): Promise<void> {
    const { Cesium, viewer } = this;
    const layer = entry.layer;
    const url = tilesetUrl(layer);
    if (!url) return;
    // Google Photorealistic tiles strip their X-GOOG-API-KEY from the store, so
    // resolve it back (from runtime env) exactly as the 2D render path does —
    // otherwise the tileset would silently 401/403 and never render on the globe.
    const headers = resolveThreeDTilesRequestHeaders(
      url,
      layer.source.requestHeaders as Record<string, string> | undefined,
    );
    const resource =
      headers && Object.keys(headers).length ? new Cesium.Resource({ url, headers }) : url;
    try {
      const tileset = await Cesium.Cesium3DTileset.fromUrl(resource, {});
      if (entry.cancelled) {
        tileset.destroy();
        return;
      }
      viewer.scene.primitives.add(tileset);
      this.applyTilesetAltitude(tileset, Number(layer.source.altitudeOffset));
      entry.handle = tileset;
      this.applyAppearance(entry);
    } catch {
      // A tileset that fails to load should not break the whole sync.
    }
  }

  /** Raise/lower a tileset by an altitude offset (metres) at its centre. */
  private applyTilesetAltitude(tileset: Cesium3DTileset, offset: number): void {
    if (!Number.isFinite(offset) || offset === 0) return;
    const { Cesium } = this;
    const carto = Cesium.Cartographic.fromCartesian(tileset.boundingSphere.center);
    const surface = Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, 0);
    const target = Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, offset);
    const translation = Cesium.Cartesian3.subtract(target, surface, new Cesium.Cartesian3());
    tileset.modelMatrix = Cesium.Matrix4.fromTranslation(translation);
  }

  private applyAppearance(entry: LayerEntry): void {
    const { handle, layer } = entry;
    if (!handle) return;
    if (entry.kind === "imagery") {
      const imagery = handle as ImageryLayer;
      imagery.show = layer.visible;
      imagery.alpha = layer.opacity;
    } else if (entry.kind === "geojson") {
      (handle as DataSource).show = layer.visible;
      this.applyGeoJsonStyle(entry);
    } else if (entry.kind === "mil-graphic") {
      (handle as DataSource).show = layer.visible;
      this.applyMilGraphicStyle(entry);
    } else if (entry.kind === "mil-symbol") {
      (handle as DataSource).show = layer.visible;
      this.applyMilSymbolStyle(entry);
    } else {
      (handle as Cesium3DTileset).show = layer.visible;
    }
  }

  private applyMilSymbolStyle(entry: LayerEntry): void {
    const dataSource = entry.handle as DataSource | null;
    if (!dataSource) return;
    const opacity = entry.layer.opacity;
    const { Cesium } = this;
    const color = Cesium.Color.WHITE.withAlpha(opacity);
    for (const feature of dataSource.entities.values) {
      if (feature.billboard) {
        feature.billboard.color = new Cesium.ConstantProperty(color);
      }
      if (feature.label) {
        feature.label.fillColor = new Cesium.ConstantProperty(color);
      }
    }
  }

  private applyMilSymbolBillboardMode(
    entry: LayerEntry,
    mode: "ground" | "billboard",
  ): void {
    const dataSource = entry.handle as DataSource | null;
    if (!dataSource) return;
    const { Cesium } = this;
    for (const feature of dataSource.entities.values) {
      const lon = feature.properties?.lon?.getValue?.();
      const lat = feature.properties?.lat?.getValue?.();
      const hasLonLat = typeof lon === "number" && typeof lat === "number";

      if (feature.billboard) {
        feature.billboard.heightReference = new Cesium.ConstantProperty(
          mode === "billboard"
            ? Cesium.HeightReference.NONE
            : Cesium.HeightReference.CLAMP_TO_GROUND,
        );
      }

      if (feature.label) {
        feature.label.heightReference = new Cesium.ConstantProperty(
          mode === "billboard"
            ? Cesium.HeightReference.NONE
            : Cesium.HeightReference.CLAMP_TO_GROUND,
        );
      }

      if (!hasLonLat) continue;
      const altitude = mode === "billboard" ? MIL_SYMBOL_BILLBOARD_HEIGHT_M : 0;
      feature.position = new Cesium.ConstantPositionProperty(
        Cesium.Cartesian3.fromDegrees(lon, lat, altitude),
      );
    }
  }

  private applyMilGraphicStyle(entry: LayerEntry): void {
    const dataSource = entry.handle as DataSource | null;
    if (!dataSource) return;
    const opacity = Math.max(0, Math.min(1, entry.layer.opacity));
    const strokeWidth =
      typeof entry.layer.style?.strokeWidth === "number" && Number.isFinite(entry.layer.style.strokeWidth)
        ? Math.max(1, entry.layer.style.strokeWidth)
        : 3;
    const { Cesium } = this;
    for (const feature of dataSource.entities.values) {
      const affiliationRaw = feature.properties?.affiliation?.getValue?.();
      const affiliation = parseAffiliation(affiliationRaw);
      const base = Cesium.Color.fromCssColorString(milGraphicCssColor(affiliation));
      if (feature.polyline) {
        feature.polyline.material = new Cesium.ColorMaterialProperty(base.withAlpha(opacity));
        feature.polyline.width = new Cesium.ConstantProperty(strokeWidth);
      }
      if (feature.polygon) {
        feature.polygon.material = new Cesium.ColorMaterialProperty(base.withAlpha(opacity * 0.18));
        feature.polygon.outlineColor = new Cesium.ConstantProperty(base.withAlpha(opacity));
      }
    }
  }

  /**
   * Re-apply a GeoJSON layer's opacity in place, so dragging the opacity slider
   * restyles the entities instead of reloading the whole GeoJsonDataSource.
   * Polygon fill uses layer opacity × fill opacity; polyline stroke and point
   * markers use the layer opacity alone (matching the 2D map, where opacity
   * fades lines and points too). Colours themselves bake in at load, so a colour
   * change still rebuilds; the `appliedAlpha` guard makes a no-op call cheap on
   * unrelated syncs.
   */
  private applyGeoJsonStyle(entry: LayerEntry): void {
    const dataSource = entry.handle as DataSource | null;
    if (!dataSource) return;
    const style = entry.layer.style ?? {};
    const opacity = entry.layer.opacity;
    const fillAlpha = (style.fillOpacity ?? 0.6) * opacity;
    // Key on both alphas so any opacity change is picked up (e.g. a lines-only
    // layer whose fill alpha never varies).
    const key = `${fillAlpha}|${opacity}`;
    if (entry.appliedAlpha === key) return;
    entry.appliedAlpha = key;
    const { Cesium } = this;
    const fill = Cesium.Color.fromCssColorString(style.fillColor ?? "#3b82f6").withAlpha(fillAlpha);
    const stroke = Cesium.Color.fromCssColorString(style.strokeColor ?? "#1e40af").withAlpha(
      opacity,
    );
    // Point pins keep their baked-in colour; multiplying by white+alpha only
    // fades them.
    const marker = Cesium.Color.WHITE.withAlpha(opacity);
    for (const feature of dataSource.entities.values) {
      if (feature.polygon) {
        feature.polygon.material = new Cesium.ColorMaterialProperty(fill);
      }
      if (feature.polyline) {
        feature.polyline.material = new Cesium.ColorMaterialProperty(stroke);
      }
      if (feature.billboard) {
        feature.billboard.color = new Cesium.ConstantProperty(marker);
      }
    }
  }

  private destroyEntry(entry: LayerEntry): void {
    entry.cancelled = true;
    const { handle } = entry;
    if (!handle) return;
    if (entry.kind === "imagery") {
      this.viewer.imageryLayers.remove(handle as ImageryLayer, true);
    } else if (
      entry.kind === "geojson" ||
      entry.kind === "mil-symbol" ||
      entry.kind === "mil-graphic"
    ) {
      this.viewer.dataSources.remove(handle as DataSource, true);
    } else {
      this.viewer.scene.primitives.remove(handle as Cesium3DTileset);
    }
  }
}
