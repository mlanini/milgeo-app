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
  staffComments?: string;
  additionalInformation?: string;
  dtg?: string;
  altitudeDepth?: string;
  direction?: number;
  quantity?: string;
  iffSif?: string;
  speed?: string;
  typeStr?: string;
  reinforcedReduced?: string;
  combatEffectiveness?: string;
  evaluationRating?: string;
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

function parseString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
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
    uniqueDesignation: parseString(record.uniqueDesignation),
    higherFormation: parseString(record.higherFormation),
    staffComments: parseString(record.staffComments),
    additionalInformation: parseString(record.additionalInformation) ?? parseString(record.additionalInfo),
    dtg: parseString(record.dtg),
    altitudeDepth: parseString(record.altitudeDepth),
    direction: parseNumber(record.direction) ?? undefined,
    quantity: parseString(record.quantity),
    iffSif: parseString(record.iffSif),
    speed: parseString(record.speed),
    typeStr: parseString(record.typeStr) ?? parseString(record.type),
    reinforcedReduced: parseString(record.reinforcedReduced),
    combatEffectiveness: parseString(record.combatEffectiveness),
    evaluationRating: parseString(record.evaluationRating),
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
    uniqueDesignation: parseString(raw.uniqueDesignation),
    higherFormation: parseString(raw.higherFormation),
    staffComments: parseString(raw.staffComments),
    additionalInformation: parseString(raw.additionalInformation) ?? parseString(raw.additionalInfo),
    dtg: parseString(raw.dtg),
    altitudeDepth: parseString(raw.altitudeDepth),
    direction: parseNumber(raw.direction) ?? undefined,
    quantity: parseString(raw.quantity),
    iffSif: parseString(raw.iffSif),
    speed: parseString(raw.speed),
    typeStr: parseString(raw.typeStr) ?? parseString(raw.type),
    reinforcedReduced: parseString(raw.reinforcedReduced),
    combatEffectiveness: parseString(raw.combatEffectiveness),
    evaluationRating: parseString(raw.evaluationRating),
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
    staffComments: first?.staffComments,
    additionalInformation: first?.additionalInformation,
    additionalInfo: first?.additionalInformation,
    dtg: first?.dtg,
    altitudeDepth: first?.altitudeDepth,
    direction: first?.direction,
    quantity: first?.quantity,
    iffSif: first?.iffSif,
    speed: first?.speed,
    typeStr: first?.typeStr,
    type: first?.typeStr,
    reinforcedReduced: first?.reinforcedReduced,
    combatEffectiveness: first?.combatEffectiveness,
    evaluationRating: first?.evaluationRating,
    symbols,
    symbolSize,
  };
}
