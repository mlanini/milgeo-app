import type { MilAffiliation } from "@geolibre/core";

export const DEFAULT_MIL_SYMBOL_SIZE_PX = 38;

export interface MilSymbolLayerItem {
  id: string;
  name: string;
  SIDC: string;
  lon: number;
  lat: number;
  affiliation: MilAffiliation;
  uniqueDesignation?: string;
  higherFormation?: string;
  direction?: number;
}

export interface ParsedMilSymbolLayerSource {
  symbols: MilSymbolLayerItem[];
  symbolSize: number;
}

function isAffiliation(value: unknown): value is MilAffiliation {
  return value === "FRIENDLY" || value === "HOSTILE" || value === "NEUTRAL" || value === "UNKNOWN";
}

function parseNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseSymbolItem(raw: unknown): MilSymbolLayerItem | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const sidc = typeof record.SIDC === "string" ? record.SIDC : null;
  const lon = parseNumber(record.lon);
  const lat = parseNumber(record.lat);
  const affiliation = isAffiliation(record.affiliation) ? record.affiliation : "UNKNOWN";
  if (!sidc || lon === null || lat === null) return null;

  return {
    id: typeof record.id === "string" && record.id.length > 0 ? record.id : crypto.randomUUID(),
    name: typeof record.name === "string" && record.name.length > 0 ? record.name : "Symbol",
    SIDC: sidc,
    lon,
    lat,
    affiliation,
    uniqueDesignation: typeof record.uniqueDesignation === "string" ? record.uniqueDesignation : undefined,
    higherFormation: typeof record.higherFormation === "string" ? record.higherFormation : undefined,
    direction: parseNumber(record.direction) ?? undefined,
  };
}

function parseLegacySingleSymbol(raw: Record<string, unknown>): MilSymbolLayerItem | null {
  const sidc = typeof raw.SIDC === "string" ? raw.SIDC : null;
  const lon = parseNumber(raw.lon);
  const lat = parseNumber(raw.lat);
  const affiliation = isAffiliation(raw.affiliation) ? raw.affiliation : "UNKNOWN";
  if (!sidc || lon === null || lat === null) return null;

  return {
    id: typeof raw.id === "string" && raw.id.length > 0 ? raw.id : crypto.randomUUID(),
    name: typeof raw.name === "string" && raw.name.length > 0 ? raw.name : "Symbol",
    SIDC: sidc,
    lon,
    lat,
    affiliation,
    uniqueDesignation: typeof raw.uniqueDesignation === "string" ? raw.uniqueDesignation : undefined,
    higherFormation: typeof raw.higherFormation === "string" ? raw.higherFormation : undefined,
    direction: parseNumber(raw.direction) ?? undefined,
  };
}

export function parseMilSymbolLayerSource(raw: unknown): ParsedMilSymbolLayerSource {
  if (!raw || typeof raw !== "object") {
    return { symbols: [], symbolSize: DEFAULT_MIL_SYMBOL_SIZE_PX };
  }

  const record = raw as Record<string, unknown>;
  const symbolSize = parseNumber(record.symbolSize) ?? DEFAULT_MIL_SYMBOL_SIZE_PX;
  const rawSymbols = Array.isArray(record.symbols) ? record.symbols : [];
  const symbols = rawSymbols
    .map((item) => parseSymbolItem(item))
    .filter((item): item is MilSymbolLayerItem => item !== null);

  if (symbols.length > 0) {
    return { symbols, symbolSize };
  }

  const legacy = parseLegacySingleSymbol(record);
  return {
    symbols: legacy ? [legacy] : [],
    symbolSize,
  };
}

export function serializeMilSymbolLayerSource(
  symbols: MilSymbolLayerItem[],
  symbolSize: number,
): Record<string, unknown> {
  const first = symbols[0];

  return {
    SIDC: first?.SIDC ?? "10031000000000000000",
    lon: first?.lon ?? 0,
    lat: first?.lat ?? 0,
    affiliation: first?.affiliation ?? "FRIENDLY",
    uniqueDesignation: first?.uniqueDesignation,
    higherFormation: first?.higherFormation,
    direction: first?.direction,
    symbols,
    symbolSize,
  };
}
