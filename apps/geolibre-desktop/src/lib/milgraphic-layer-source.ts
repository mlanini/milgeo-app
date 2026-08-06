import type { MilAffiliation, MilGraphicLayerSource } from "@geolibre/core";

export interface MilGraphicLayerItem {
  id: string;
  name: string;
  SIDC: string;
  geometryType: "LineString" | "Polygon";
  coordinates: [number, number][];
  affiliation: MilAffiliation;
  uniqueDesignation?: string;
  additionalInfo?: string;
  tacticalDirectional?: boolean;
  tacticalFamily?: string;
}

export interface ParsedMilGraphicLayerSource {
  graphics: MilGraphicLayerItem[];
}

function isAffiliation(value: unknown): value is MilAffiliation {
  return value === "FRIENDLY" || value === "HOSTILE" || value === "NEUTRAL" || value === "UNKNOWN";
}

function isGeometryType(value: unknown): value is "LineString" | "Polygon" {
  return value === "LineString" || value === "Polygon";
}

function parseCoordinate(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const lon = value[0];
  const lat = value[1];
  if (typeof lon !== "number" || !Number.isFinite(lon)) return null;
  if (typeof lat !== "number" || !Number.isFinite(lat)) return null;
  return [lon, lat];
}

function parseCoordinates(value: unknown): [number, number][] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => parseCoordinate(item))
    .filter((item): item is [number, number] => item !== null);
}

function parseGraphicItem(raw: unknown): MilGraphicLayerItem | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;

  const sidc = typeof record.SIDC === "string" ? record.SIDC : null;
  const geometryType = isGeometryType(record.geometryType) ? record.geometryType : null;
  const coordinates = parseCoordinates(record.coordinates);

  if (!sidc || !geometryType || coordinates.length === 0) return null;

  return {
    id: typeof record.id === "string" && record.id.length > 0 ? record.id : crypto.randomUUID(),
    name: typeof record.name === "string" && record.name.length > 0 ? record.name : "Grafica tattica",
    SIDC: sidc,
    geometryType,
    coordinates,
    affiliation: isAffiliation(record.affiliation) ? record.affiliation : "UNKNOWN",
    uniqueDesignation: typeof record.uniqueDesignation === "string" ? record.uniqueDesignation : undefined,
    additionalInfo: typeof record.additionalInfo === "string" ? record.additionalInfo : undefined,
    tacticalDirectional: record.tacticalDirectional === true,
    tacticalFamily: typeof record.tacticalFamily === "string" ? record.tacticalFamily : undefined,
  };
}

function parseLegacyGraphic(raw: Record<string, unknown>): MilGraphicLayerItem | null {
  const sidc = typeof raw.SIDC === "string" ? raw.SIDC : null;
  const geometryType = isGeometryType(raw.geometryType) ? raw.geometryType : null;
  const coordinates = parseCoordinates(raw.coordinates);

  if (!sidc || !geometryType || coordinates.length === 0) return null;

  return {
    id: typeof raw.id === "string" && raw.id.length > 0 ? raw.id : crypto.randomUUID(),
    name: typeof raw.name === "string" && raw.name.length > 0 ? raw.name : "Grafica tattica",
    SIDC: sidc,
    geometryType,
    coordinates,
    affiliation: isAffiliation(raw.affiliation) ? raw.affiliation : "UNKNOWN",
    uniqueDesignation: typeof raw.uniqueDesignation === "string" ? raw.uniqueDesignation : undefined,
    additionalInfo: typeof raw.additionalInfo === "string" ? raw.additionalInfo : undefined,
    tacticalDirectional: raw.tacticalDirectional === true,
    tacticalFamily: typeof raw.tacticalFamily === "string" ? raw.tacticalFamily : undefined,
  };
}

export function parseMilGraphicLayerSource(raw: unknown): ParsedMilGraphicLayerSource {
  if (!raw || typeof raw !== "object") {
    return { graphics: [] };
  }

  const record = raw as Record<string, unknown>;
  const rawGraphics = Array.isArray(record.graphics) ? record.graphics : [];
  const graphics = rawGraphics
    .map((item) => parseGraphicItem(item))
    .filter((item): item is MilGraphicLayerItem => item !== null);

  if (graphics.length > 0) {
    return { graphics };
  }

  const legacy = parseLegacyGraphic(record);
  return { graphics: legacy ? [legacy] : [] };
}

export function serializeMilGraphicLayerSource(
  graphics: MilGraphicLayerItem[],
): MilGraphicLayerSource & { graphics: MilGraphicLayerItem[] } {
  const first = graphics[0];

  return {
    SIDC: first?.SIDC ?? "",
    geometryType: first?.geometryType ?? "LineString",
    coordinates: first?.coordinates ?? [],
    affiliation: first?.affiliation ?? "UNKNOWN",
    uniqueDesignation: first?.uniqueDesignation,
    additionalInfo: first?.additionalInfo,
    graphics,
  };
}
