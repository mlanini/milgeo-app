/**
 * milsymbol-import-milsymb.ts
 *
 * Importers for KADAS milsymb ecosystem formats:
 *
 *   .milsymb.json — KADAS MilSymb layer export (kadas_milsymb_version ≥ 0.2)
 *   .orbat.json   — KADAS ORBAT flat-unit-tree export
 *
 * Both formats use the 20-character number-based APP-6D SIDC and originate
 * from the same tool family (https://github.com/intelligeo/qgis-app6d-plugin).
 *
 * Only point symbols are imported (symbols without coordinates are silently
 * skipped). Graphics / lines / polygons are not part of these formats.
 */

import type { GeoLibreLayer, MilAffiliation } from "@geolibre/core";
import { DEFAULT_LAYER_STYLE } from "@geolibre/core";
import ms from "milsymbol";

const MilSymbol = ms.Symbol;

// ─── Shared helpers ───────────────────────────────────────────────────────────

function inferAffiliation(sidc: string): MilAffiliation {
  const aff = sidc[3];
  if (aff === "6" || aff === "5") return "HOSTILE";
  if (aff === "4") return "NEUTRAL";
  if (aff === "1" || aff === "0") return "UNKNOWN";
  return "FRIENDLY";
}

function isValidSIDC(sidc: string): boolean {
  try {
    const result = new MilSymbol(sidc).isValid();
    return result === true || (typeof result === "object" && result !== null);
  } catch {
    return false;
  }
}

function strOrUndef(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
}

function numOrUndef(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : parseFloat(v as string);
  return isFinite(n) ? n : undefined;
}

// ─── MilSymb JSON (.milsymb.json) ────────────────────────────────────────────

interface MilsymbSymbol {
  id?: string;
  sidc?: string;
  designation?: string;
  higher_formation?: string;
  comment?: string;
  quantity?: string;
  staff_comments?: string;
  additional_information?: string;
  evaluation_rating?: string;
  combat_effectiveness?: string;
  dtg?: string;
  type_str?: string;
  speed?: string;
  altitude_depth?: string;
  direction?: number | null;
  longitude?: number | null;
  latitude?: number | null;
}

interface MilsymbLayer {
  id?: string;
  name?: string;
  visible?: boolean;
  symbols?: MilsymbSymbol[];
  graphics?: unknown[];
}

interface MilsymbDocument {
  kadas_milsymb_version?: string;
  layers?: MilsymbLayer[];
}

/**
 * Import a KADAS `.milsymb.json` document.
 *
 * Each `layers[]` entry becomes one GeoLibre mil-symbol layer. Symbols
 * without valid coordinates or SIDC are silently skipped.
 *
 * @throws {Error} if the JSON does not look like a milsymb document.
 */
export function importMilSymbJson(
  json: string,
  sourceName?: string,
): GeoLibreLayer[] {
  let doc: MilsymbDocument;
  try {
    doc = JSON.parse(json) as MilsymbDocument;
  } catch {
    throw new Error("Invalid milsymb file: JSON parse error");
  }

  if (!doc.layers || !Array.isArray(doc.layers)) {
    throw new Error(
      "Invalid milsymb file: missing or malformed 'layers' array",
    );
  }

  const result: GeoLibreLayer[] = [];

  for (const layer of doc.layers) {
    const layerName =
      strOrUndef(layer.name) ?? sourceName ?? "MilSymb Import";
    const layerId = strOrUndef(layer.id) ?? crypto.randomUUID();
    const symbols = layer.symbols ?? [];

    // One GeoLibre layer per milsymb layer.
    // We piggy-back multiple symbols as siblings: each becomes its own
    // GeoLibreLayer of type "mil-symbol" so they are individually addressable
    // in the layer panel (same pattern as the existing GeoJSON importer).

    for (const sym of symbols) {
      const sidc = strOrUndef(sym.sidc)?.toUpperCase();
      const lon = sym.longitude ?? undefined;
      const lat = sym.latitude ?? undefined;

      if (
        !sidc ||
        !isValidSIDC(sidc) ||
        lon == null ||
        lat == null ||
        !isFinite(lon) ||
        !isFinite(lat)
      ) {
        continue;
      }

      const symId = strOrUndef(sym.id) ?? crypto.randomUUID();
      const designation = strOrUndef(sym.designation);
      const name = designation ?? sidc.slice(0, 8);

      result.push({
        id: symId,
        name: `${layerName} – ${name}`,
        type: "mil-symbol",
        visible: layer.visible !== false,
        opacity: 1,
        style: { ...DEFAULT_LAYER_STYLE },
        metadata: { milsymbLayerId: layerId, milsymbLayerName: layerName },
        source: {
          SIDC: sidc,
          lon,
          lat,
          affiliation: inferAffiliation(sidc),
          uniqueDesignation: designation,
          higherFormation: strOrUndef(sym.higher_formation),
          additionalInfo: strOrUndef(sym.additional_information) ??
            strOrUndef(sym.comment),
          direction: numOrUndef(sym.direction),
          speed: strOrUndef(sym.speed),
        },
      });
    }
  }

  return result;
}

/**
 * Returns true if the parsed JSON looks like a `.milsymb.json` document.
 */
export function isMilsymbDocument(raw: unknown): raw is MilsymbDocument {
  return (
    typeof raw === "object" &&
    raw !== null &&
    "layers" in raw &&
    Array.isArray((raw as MilsymbDocument).layers)
  );
}

// ─── ORBAT JSON (.orbat.json) ─────────────────────────────────────────────────

interface OrbatUnit {
  id?: string;
  sidc?: string;
  name?: string;
  short_name?: string;
  parent_id?: string | null;
  longitude?: number | null;
  latitude?: number | null;
  map_symbol_id?: string | null;
  temporal?: { start?: string | null; end?: string | null };
}

interface OrbatDocument {
  name?: string;
  units?: OrbatUnit[];
}

/**
 * Import a KADAS `.orbat.json` document.
 *
 * Each unit that has valid coordinates and a valid SIDC becomes a
 * `mil-symbol` GeoLibreLayer. Units without coordinates are skipped
 * (they exist in the ORBAT tree but have not been placed on the map).
 *
 * All placed units are grouped into a single GeoLibre layer named after
 * the ORBAT document (`doc.name`).  If you need per-unit layers, call
 * `importOrbatJsonAsLayers()` instead.
 *
 * @throws {Error} if the JSON does not look like an orbat document.
 */
export function importOrbatJson(
  json: string,
  sourceName?: string,
): GeoLibreLayer[] {
  let doc: OrbatDocument;
  try {
    doc = JSON.parse(json) as OrbatDocument;
  } catch {
    throw new Error("Invalid orbat file: JSON parse error");
  }

  if (!doc.units || !Array.isArray(doc.units)) {
    throw new Error("Invalid orbat file: missing or malformed 'units' array");
  }

  const groupName =
    strOrUndef(doc.name) ?? sourceName ?? "ORBAT Import";
  const result: GeoLibreLayer[] = [];

  for (const unit of doc.units) {
    const sidc = strOrUndef(unit.sidc)?.toUpperCase();
    const lon = unit.longitude ?? undefined;
    const lat = unit.latitude ?? undefined;

    if (
      !sidc ||
      !isValidSIDC(sidc) ||
      lon == null ||
      lat == null ||
      !isFinite(lon) ||
      !isFinite(lat)
    ) {
      continue;
    }

    const unitId = strOrUndef(unit.id) ?? crypto.randomUUID();
    const name = strOrUndef(unit.name) ??
      strOrUndef(unit.short_name) ??
      sidc.slice(0, 8);

    result.push({
      id: unitId,
      name: `${groupName} – ${name}`,
      type: "mil-symbol",
      visible: true,
      opacity: 1,
      style: { ...DEFAULT_LAYER_STYLE },
      metadata: {
        orbatDocumentName: groupName,
        orbatParentId: unit.parent_id ?? null,
      },
      source: {
        SIDC: sidc,
        lon,
        lat,
        affiliation: inferAffiliation(sidc),
        uniqueDesignation: strOrUndef(unit.short_name) ?? strOrUndef(unit.name),
        higherFormation: undefined,
        additionalInfo: undefined,
        direction: undefined,
        speed: undefined,
      },
    });
  }

  return result;
}

/**
 * Returns true if the parsed JSON looks like an `.orbat.json` document.
 */
export function isOrbatDocument(raw: unknown): raw is OrbatDocument {
  return (
    typeof raw === "object" &&
    raw !== null &&
    "units" in raw &&
    Array.isArray((raw as OrbatDocument).units)
  );
}

/**
 * Auto-detect and import either a `.milsymb.json` or `.orbat.json` document.
 * Throws if neither format is recognised.
 */
export function importKadasMilSymbFile(
  json: string,
  sourceName?: string,
): GeoLibreLayer[] {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error("Invalid milsymb/orbat file: JSON parse error");
  }

  if (isMilsymbDocument(raw)) {
    return importMilSymbJson(json, sourceName);
  }
  if (isOrbatDocument(raw)) {
    return importOrbatJson(json, sourceName);
  }
  throw new Error(
    "Unrecognised JSON format: expected milsymb (kadas_milsymb_version / layers[]) " +
      "or orbat (units[]) document",
  );
}
