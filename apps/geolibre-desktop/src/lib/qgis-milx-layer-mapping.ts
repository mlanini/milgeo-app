import { DEFAULT_LAYER_STYLE, type GeoLibreLayer, type MilAffiliation } from "@geolibre/core";
import type {
  Feature,
  FeatureCollection,
  Geometry,
  LineString,
  MultiLineString,
  MultiPoint,
  MultiPolygon,
  Point,
  Polygon,
} from "geojson";
import ms from "milsymbol";
import {
  DEFAULT_MIL_SYMBOL_SIZE_PX,
  serializeMilSymbolLayerSource,
  type MilSymbolLayerItem,
} from "./milsymbol-layer-source";
import { serializeMilGraphicLayerSource, type MilGraphicLayerItem } from "./milgraphic-layer-source";

const MilSymbol = ms.Symbol;

function stripLocalReloadFlag(metadata: Record<string, unknown>): Record<string, unknown> {
  const { localFileReloadable: _drop, ...rest } = metadata;
  return rest;
}

function normalizePropertyKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function readStringProperty(properties: Record<string, unknown>, aliases: string[]): string | undefined {
  const aliasSet = new Set(aliases.map(normalizePropertyKey));
  for (const [key, value] of Object.entries(properties)) {
    if (!aliasSet.has(normalizePropertyKey(key))) continue;
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
    }
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function readNumberProperty(properties: Record<string, unknown>, aliases: string[]): number | undefined {
  const aliasSet = new Set(aliases.map(normalizePropertyKey));
  for (const [key, value] of Object.entries(properties)) {
    if (!aliasSet.has(normalizePropertyKey(key))) continue;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function inferAffiliation(sidc: string): MilAffiliation {
  const upper = sidc.toUpperCase();
  if (upper.length >= 20) {
    const aff = upper[3];
    if (aff === "6" || aff === "5") return "HOSTILE";
    if (aff === "4") return "NEUTRAL";
    if (aff === "1" || aff === "0") return "UNKNOWN";
    return "FRIENDLY";
  }
  const aff = upper[1];
  if (aff === "H") return "HOSTILE";
  if (aff === "N") return "NEUTRAL";
  if (aff === "U" || aff === "P") return "UNKNOWN";
  return "FRIENDLY";
}

function isValidSidc(sidc: string): boolean {
  try {
    const result = new MilSymbol(sidc).isValid();
    return result === true || (typeof result === "object" && result !== null);
  } catch {
    return false;
  }
}

function toPairs(coords: unknown[]): [number, number][] {
  return coords
    .filter((item): item is [number, number] => Array.isArray(item) && item.length >= 2)
    .map((item) => [Number(item[0]), Number(item[1])] as [number, number])
    .filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat));
}

function hasTacticalDirection(properties: Record<string, unknown>): boolean {
  if (readNumberProperty(properties, ["direction", "directionOfMovement", "azimuth"]) != null) {
    return true;
  }
  const flag = readStringProperty(properties, ["tacticalDirectional", "directional"]);
  return flag === "1" || /^true$/i.test(flag ?? "");
}

function readTacticalFamily(properties: Record<string, unknown>): string | undefined {
  return readStringProperty(properties, ["tacticalFamily", "family", "graphicFamily"]);
}

function featureName(properties: Record<string, unknown>, fallback: string): string {
  return (
    readStringProperty(properties, ["name", "Name", "label", "designation", "uniqueDesignation", "T"]) ??
    fallback
  );
}

function sidcFromProperties(properties: Record<string, unknown>): string | undefined {
  return readStringProperty(properties, [
    "Symbol ID",
    "symbol_id",
    "symbolid",
    "sidc",
    "SIDC",
    "app6d",
    "mss",
  ])?.toUpperCase();
}

function buildSymbolItem(
  geometry: Point,
  sidc: string,
  properties: Record<string, unknown>,
  defaultName: string,
): MilSymbolLayerItem | null {
  const [lon, lat] = geometry.coordinates;
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  return {
    id: crypto.randomUUID(),
    name: featureName(properties, defaultName),
    SIDC: sidc,
    lon,
    lat,
    affiliation: inferAffiliation(sidc),
    uniqueDesignation: readStringProperty(properties, ["uniqueDesignation", "designation", "T"]),
    higherFormation: readStringProperty(properties, ["higherFormation", "M"]),
    additionalInformation: readStringProperty(properties, ["additionalInformation", "additionalInfo", "H", "G"]),
    direction: readNumberProperty(properties, ["direction", "directionOfMovement", "Q"]),
    speed: readStringProperty(properties, ["speed", "Z"]),
  };
}

function buildGraphicItem(
  geometryType: "LineString" | "Polygon",
  coordinates: [number, number][],
  sidc: string,
  properties: Record<string, unknown>,
  defaultName: string,
): MilGraphicLayerItem | null {
  if (coordinates.length < 2) return null;
  return {
    id: crypto.randomUUID(),
    name: featureName(properties, defaultName),
    SIDC: sidc,
    geometryType,
    coordinates,
    affiliation: inferAffiliation(sidc),
    uniqueDesignation: readStringProperty(properties, ["uniqueDesignation", "designation", "T"]),
    additionalInfo: readStringProperty(properties, ["additionalInformation", "additionalInfo", "H", "G"]),
    tacticalDirectional: hasTacticalDirection(properties),
    tacticalFamily: readTacticalFamily(properties),
  };
}

function convertFeature(
  feature: Feature,
  layerName: string,
): { symbols: MilSymbolLayerItem[]; graphics: MilGraphicLayerItem[]; converted: boolean } {
  const properties = (feature.properties ?? {}) as Record<string, unknown>;
  const sidc = sidcFromProperties(properties);
  if (!sidc || !isValidSidc(sidc) || !feature.geometry) {
    return { symbols: [], graphics: [], converted: false };
  }

  const symbols: MilSymbolLayerItem[] = [];
  const graphics: MilGraphicLayerItem[] = [];
  const baseName = featureName(properties, layerName);

  switch (feature.geometry.type) {
    case "Point": {
      const item = buildSymbolItem(feature.geometry as Point, sidc, properties, baseName);
      if (item) symbols.push(item);
      break;
    }
    case "MultiPoint": {
      const points = (feature.geometry as MultiPoint).coordinates as [number, number][];
      points.forEach((coords: [number, number], index: number) => {
        const pointFeature: Point = { type: "Point", coordinates: coords };
        const item = buildSymbolItem(pointFeature, sidc, properties, `${baseName} ${index + 1}`);
        if (item) symbols.push(item);
      });
      break;
    }
    case "LineString": {
      const item = buildGraphicItem(
        "LineString",
        toPairs((feature.geometry as LineString).coordinates as unknown[]),
        sidc,
        properties,
        baseName,
      );
      if (item) graphics.push(item);
      break;
    }
    case "MultiLineString": {
      const lines = (feature.geometry as MultiLineString).coordinates as [number, number][][];
      lines.forEach((line: [number, number][], index: number) => {
        const item = buildGraphicItem(
          "LineString",
          toPairs(line as unknown[]),
          sidc,
          properties,
          `${baseName} ${index + 1}`,
        );
        if (item) graphics.push(item);
      });
      break;
    }
    case "Polygon": {
      const ring = (feature.geometry as Polygon).coordinates[0] ?? [];
      const item = buildGraphicItem("Polygon", toPairs(ring as unknown[]), sidc, properties, baseName);
      if (item) graphics.push(item);
      break;
    }
    case "MultiPolygon": {
      const polygons = (feature.geometry as MultiPolygon).coordinates as [number, number][][][];
      polygons.forEach((poly: [number, number][][], index: number) => {
        const ring = poly[0] ?? [];
        const item = buildGraphicItem(
          "Polygon",
          toPairs(ring as unknown[]),
          sidc,
          properties,
          `${baseName} ${index + 1}`,
        );
        if (item) graphics.push(item);
      });
      break;
    }
    default:
      return { symbols: [], graphics: [], converted: false };
  }

  const converted = symbols.length > 0 || graphics.length > 0;
  return { symbols, graphics, converted };
}

function fallbackLayer(
  sourceLayer: GeoLibreLayer,
  fallbackFeatures: Feature<Geometry, Record<string, unknown>>[],
): GeoLibreLayer {
  const fallbackCollection: FeatureCollection = {
    type: "FeatureCollection",
    features: fallbackFeatures,
  };
  return {
    ...sourceLayer,
    name: `${sourceLayer.name} (raw)`,
    source: { type: "geojson" },
    sourcePath: undefined,
    geojson: fallbackCollection,
    metadata: {
      ...stripLocalReloadFlag(sourceLayer.metadata),
      importedFrom: "qgis",
      qgisMilxFallback: true,
      qgisMilxFallbackCount: fallbackFeatures.length,
    },
  };
}

function buildMilSymbolLayer(sourceLayer: GeoLibreLayer, symbols: MilSymbolLayerItem[]): GeoLibreLayer {
  return {
    id: crypto.randomUUID(),
    name: `${sourceLayer.name} Symbols`,
    type: "mil-symbol",
    source: serializeMilSymbolLayerSource(symbols, DEFAULT_MIL_SYMBOL_SIZE_PX),
    visible: sourceLayer.visible,
    opacity: sourceLayer.opacity,
    style: { ...DEFAULT_LAYER_STYLE },
    metadata: {
      ...stripLocalReloadFlag(sourceLayer.metadata),
      importedFrom: "qgis",
      qgisMilxConverted: true,
      qgisMilxSourceLayerId: sourceLayer.id,
      qgisMilxSourceLayerName: sourceLayer.name,
    },
    groupId: sourceLayer.groupId,
  };
}

function buildMilGraphicLayer(sourceLayer: GeoLibreLayer, graphics: MilGraphicLayerItem[]): GeoLibreLayer {
  return {
    id: crypto.randomUUID(),
    name: `${sourceLayer.name} Tactical Graphics`,
    type: "mil-graphic",
    source: serializeMilGraphicLayerSource(graphics),
    visible: sourceLayer.visible,
    opacity: sourceLayer.opacity,
    style: { ...DEFAULT_LAYER_STYLE },
    metadata: {
      ...stripLocalReloadFlag(sourceLayer.metadata),
      importedFrom: "qgis",
      qgisMilxConverted: true,
      qgisMilxSourceLayerId: sourceLayer.id,
      qgisMilxSourceLayerName: sourceLayer.name,
    },
    groupId: sourceLayer.groupId,
  };
}

export function mapQgisMilxLayers(layers: GeoLibreLayer[]): GeoLibreLayer[] {
  const mapped: GeoLibreLayer[] = [];

  for (const layer of layers) {
    if (layer.type !== "geojson" || !layer.geojson || layer.geojson.features.length === 0) {
      mapped.push(layer);
      continue;
    }

    const symbols: MilSymbolLayerItem[] = [];
    const graphics: MilGraphicLayerItem[] = [];
    const fallbackFeatures: Feature<Geometry, Record<string, unknown>>[] = [];

    for (const feature of layer.geojson.features) {
      const converted = convertFeature(feature as Feature, layer.name);
      symbols.push(...converted.symbols);
      graphics.push(...converted.graphics);
      if (!converted.converted) {
        fallbackFeatures.push(feature as Feature<Geometry, Record<string, unknown>>);
      }
    }

    if (symbols.length === 0 && graphics.length === 0) {
      mapped.push(layer);
      continue;
    }

    if (symbols.length > 0) mapped.push(buildMilSymbolLayer(layer, symbols));
    if (graphics.length > 0) mapped.push(buildMilGraphicLayer(layer, graphics));
    if (fallbackFeatures.length > 0) mapped.push(fallbackLayer(layer, fallbackFeatures));
  }

  return mapped;
}