import type {
  MilAffiliation,
  MilGraphicLayerSource,
  TacticalGraphicMigrationState,
  TacticalGraphicRuleKey,
} from "@geolibre/core";
import { resolveTacticalRuleKey } from "./tactical-rules/catalog";
import { normalizeTacticalSidc } from "./tactical-rules/normalize";

export interface MilGraphicLayerItem {
  id: string;
  name: string;
  SIDC: string;
  sidcOriginal?: string;
  sidcCanonical?: string | null;
  ruleKey?: TacticalGraphicRuleKey;
  geometryType: "LineString" | "Polygon";
  coordinates: [number, number][];
  affiliation: MilAffiliation;
  uniqueDesignation?: string;
  additionalInfo?: string;
  tacticalDirectional?: boolean;
  tacticalFamily?: string;
  migration?: TacticalGraphicMigrationState;
}

export interface TacticalGraphicMigrationDiagnostic {
  itemId: string;
  name: string;
  sidc?: string;
  reason: string;
}

export interface ParsedMilGraphicLayerSource {
  graphics: MilGraphicLayerItem[];
  diagnostics: TacticalGraphicMigrationDiagnostic[];
}

function isAffiliation(value: unknown): value is MilAffiliation {
  return value === "FRIENDLY" || value === "HOSTILE" || value === "NEUTRAL" || value === "UNKNOWN";
}

function isGeometryType(value: unknown): value is "LineString" | "Polygon" {
  return value === "LineString" || value === "Polygon";
}

function isRuleKey(value: unknown): value is TacticalGraphicRuleKey {
  return (
    value === "direction_of_attack" ||
    value === "flot" ||
    value === "no_fire_area" ||
    value === "fortified_area" ||
    value === "fallback"
  );
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
  const minCoordinates = geometryType === "Polygon" ? 3 : 2;

  if (!sidc || !geometryType || coordinates.length < minCoordinates) return null;

  const normalizedSidc = normalizeTacticalSidc(sidc);
  const sidcOriginal =
    typeof record.sidcOriginal === "string" && record.sidcOriginal.trim().length > 0
      ? record.sidcOriginal.trim().toUpperCase()
      : normalizedSidc.original;
  const sidcCanonical =
    typeof record.sidcCanonical === "string" && record.sidcCanonical.trim().length > 0
      ? record.sidcCanonical.trim().toUpperCase()
      : normalizedSidc.canonical20;
  const ruleKey =
    isRuleKey(record.ruleKey)
      ? record.ruleKey
      : resolveTacticalRuleKey(sidcOriginal, geometryType);

  const migration: TacticalGraphicMigrationState =
    record.migration && typeof record.migration === "object"
      ? {
          migrated: (record.migration as Record<string, unknown>).migrated === true,
          reason:
            typeof (record.migration as Record<string, unknown>).reason === "string"
              ? ((record.migration as Record<string, unknown>).reason as string)
              : undefined,
        }
      : {
          migrated: sidcCanonical !== null && ruleKey !== "fallback",
          reason:
            sidcCanonical === null
              ? "sidc-not-canonical"
              : ruleKey === "fallback"
                ? "rule-unresolved"
                : undefined,
        };

  return {
    id: typeof record.id === "string" && record.id.length > 0 ? record.id : crypto.randomUUID(),
    name: typeof record.name === "string" && record.name.length > 0 ? record.name : "Grafica tattica",
    SIDC: sidcOriginal,
    sidcOriginal,
    sidcCanonical,
    ruleKey,
    geometryType,
    coordinates,
    affiliation: isAffiliation(record.affiliation) ? record.affiliation : "UNKNOWN",
    uniqueDesignation: typeof record.uniqueDesignation === "string" ? record.uniqueDesignation : undefined,
    additionalInfo: typeof record.additionalInfo === "string" ? record.additionalInfo : undefined,
    tacticalDirectional: record.tacticalDirectional === true,
    tacticalFamily: typeof record.tacticalFamily === "string" ? record.tacticalFamily : undefined,
    migration,
  };
}

function parseLegacyGraphic(
  raw: Record<string, unknown>,
): { item: MilGraphicLayerItem | null; diagnostic: TacticalGraphicMigrationDiagnostic | null } {
  const sidc = typeof raw.SIDC === "string" ? raw.SIDC : null;
  const geometryType = isGeometryType(raw.geometryType) ? raw.geometryType : null;
  const coordinates = parseCoordinates(raw.coordinates);

  const itemId = typeof raw.id === "string" && raw.id.length > 0 ? raw.id : crypto.randomUUID();
  const itemName =
    typeof raw.name === "string" && raw.name.length > 0 ? raw.name : "Grafica tattica";

  if (!sidc) {
    return {
      item: null,
      diagnostic: {
        itemId,
        name: itemName,
        reason: "sidc-missing",
      },
    };
  }

  if (!geometryType || coordinates.length === 0) {
    return {
      item: null,
      diagnostic: {
        itemId,
        name: itemName,
        sidc,
        reason: "unsupported-geometry",
      },
    };
  }

  const minCoordinates = geometryType === "Polygon" ? 3 : 2;
  if (coordinates.length < minCoordinates) {
    return {
      item: null,
      diagnostic: {
        itemId,
        name: itemName,
        sidc,
        reason: "unsupported-geometry",
      },
    };
  }

  const normalizedSidc = normalizeTacticalSidc(sidc);
  const ruleKey = resolveTacticalRuleKey(normalizedSidc.original, geometryType);
  const migrationReason =
    normalizedSidc.canonical20 === null
      ? "sidc-not-canonical"
      : ruleKey === "fallback"
        ? "rule-unresolved"
        : undefined;

  return {
    item: {
      id: itemId,
      name: itemName,
      SIDC: normalizedSidc.original,
      sidcOriginal: normalizedSidc.original,
      sidcCanonical: normalizedSidc.canonical20,
      ruleKey,
      geometryType,
      coordinates,
      affiliation: isAffiliation(raw.affiliation) ? raw.affiliation : "UNKNOWN",
      uniqueDesignation: typeof raw.uniqueDesignation === "string" ? raw.uniqueDesignation : undefined,
      additionalInfo: typeof raw.additionalInfo === "string" ? raw.additionalInfo : undefined,
      tacticalDirectional: raw.tacticalDirectional === true,
      tacticalFamily: typeof raw.tacticalFamily === "string" ? raw.tacticalFamily : undefined,
      migration: {
        migrated: normalizedSidc.canonical20 !== null && ruleKey !== "fallback",
        ...(migrationReason ? { reason: migrationReason } : {}),
      },
    },
    diagnostic: migrationReason
      ? {
          itemId,
          name: itemName,
          sidc,
          reason: migrationReason,
        }
      : null,
  };
}

export function parseMilGraphicLayerSource(raw: unknown): ParsedMilGraphicLayerSource {
  if (!raw || typeof raw !== "object") {
    return { graphics: [], diagnostics: [] };
  }

  const record = raw as Record<string, unknown>;
  const diagnostics: TacticalGraphicMigrationDiagnostic[] = [];
  const rawGraphics = Array.isArray(record.graphics) ? record.graphics : null;
  if (rawGraphics) {
    const graphics = rawGraphics
      .map((item) => {
        const parsed = parseGraphicItem(item);
        if (parsed) return parsed;
        const fallback = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
        const migrated = parseLegacyGraphic(fallback);
        if (migrated.diagnostic) diagnostics.push(migrated.diagnostic);
        return migrated.item;
      })
      .filter((item): item is MilGraphicLayerItem => item !== null);
    return { graphics, diagnostics };
  }

  const legacy = parseLegacyGraphic(record);
  if (legacy.diagnostic) diagnostics.push(legacy.diagnostic);
  return { graphics: legacy.item ? [legacy.item] : [], diagnostics };
}

export function serializeMilGraphicLayerSource(
  graphics: MilGraphicLayerItem[],
): MilGraphicLayerSource & { schemaVersion: 2; graphics: MilGraphicLayerItem[] } {
  const normalizedGraphics = graphics
    .map((graphic) => {
      const parsed = parseGraphicItem(graphic as unknown);
      if (parsed) return parsed;
      const legacy = parseLegacyGraphic(graphic as unknown as Record<string, unknown>);
      return legacy.item;
    })
    .filter((graphic): graphic is MilGraphicLayerItem => graphic !== null);
  const first = normalizedGraphics[0];

  return {
    SIDC: first?.sidcOriginal ?? first?.SIDC ?? "",
    geometryType: first?.geometryType ?? "LineString",
    coordinates: first?.coordinates ?? [],
    affiliation: first?.affiliation ?? "UNKNOWN",
    uniqueDesignation: first?.uniqueDesignation,
    additionalInfo: first?.additionalInfo,
    schemaVersion: 2,
    graphics: normalizedGraphics,
  };
}
