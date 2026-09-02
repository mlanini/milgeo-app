/**
 * milsymbol-import-to-store.ts
 *
 * Converts external military symbology formats to the MilGeoJson data model
 * used by useMilLayerStore (MilLayerPanel).
 *
 * Formats supported:
 *   .orbat.json      — KADAS ORBAT flat unit tree
 *   .milsymb.json    — KADAS MilSymb layer document
 *
 * Each function returns { layers: MilLayer[], orbat: OrbatUnit[] } which
 * can be merged into the current store state via importFromMilGeoJson().
 */

import type { MilLayer, MilSymbolItem, MilGraphicItem, OrbatUnit, MilGeometryType } from "@geolibre/core";

// ─── Shared helpers ───────────────────────────────────────────────────────────

/**
 * Structural SIDC validation — does NOT call milsymbol.isValid().
 *
 * milsymbol 3.x returns falsy for many valid APP-6D SIDCs (partially-specified
 * entity codes, high echelon marks, frame-only generics, …).  Using isValid()
 * as an import gate silently drops large portions of an ORBAT.  Instead we
 * accept anything that looks structurally plausible:
 *   • 20-digit numeric → APP-6D
 *   • 15-char alphanumeric → MIL-STD-2525C
 */
function isValidSIDC(sidc: string): boolean {
  return /^\d{20}$/.test(sidc) || /^[A-Z0-9]{15}$/i.test(sidc);
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
}

function num(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : parseFloat(v as string);
  return isFinite(n) ? n : undefined;
}

function validCoord(lon: unknown, lat: unknown): [number, number] | null {
  const lo = num(lon);
  const la = num(lat);
  if (lo == null || la == null) return null;
  return [lo, la];
}

// ─── Return type ──────────────────────────────────────────────────────────────

export interface StoreImportResult {
  layers: MilLayer[];
  orbat: OrbatUnit[];
}

function asBytes(data: ArrayBuffer | Uint8Array): Uint8Array {
  return data instanceof Uint8Array ? data : new Uint8Array(data);
}

// ─── ORBAT JSON ───────────────────────────────────────────────────────────────

interface OrbatJsonUnit {
  id?: string;
  sidc?: string;
  name?: string;
  short_name?: string;
  parent_id?: string | null;
  longitude?: number | null;
  latitude?: number | null;
}

interface OrbatJsonDoc {
  name?: string;
  units?: OrbatJsonUnit[];
}

/**
 * Parse a `.orbat.json` file into MilLayer[] + OrbatUnit[].
 *
 * - Units WITH valid coordinates → MilSymbolItem in a new map layer
 * - ALL units → OrbatUnit in the ORBAT tree (preserving hierarchy)
 * - Units with null coordinates are in the tree only (unplaced)
 */
export function parseOrbatJsonForStore(
  jsonText: string,
  sourceName?: string,
): StoreImportResult {
  let doc: OrbatJsonDoc;
  try {
    doc = JSON.parse(jsonText) as OrbatJsonDoc;
  } catch {
    throw new Error("Invalid ORBAT file: JSON parse error");
  }
  if (!Array.isArray(doc.units)) {
    throw new Error("Invalid ORBAT file: missing 'units' array");
  }

  const groupName = str(doc.name) ?? sourceName ?? "ORBAT Import";
  const layerId = crypto.randomUUID();

  const symbols: MilSymbolItem[] = [];
  const orbatUnits: OrbatUnit[] = [];

  // Map from original unit id → store symbol id (for symbolId linking)
  const unitIdToSymbolId = new Map<string, string>();

  for (const unit of doc.units) {
    const sidc = str(unit.sidc)?.toUpperCase();
    const unitId = str(unit.id) ?? crypto.randomUUID();
    const name = str(unit.name) ?? str(unit.short_name) ?? sidc ?? "Unit";

    // Always add to ORBAT tree
    orbatUnits.push({
      id: unitId,
      name,
      sidc: sidc ?? "10031000000000000000",
      parentId: str(unit.parent_id) ?? null,
    });

    // Only place on map if coordinates are valid
    const coord = validCoord(unit.longitude, unit.latitude);
    if (!coord || !sidc || !isValidSIDC(sidc)) continue;

    const [lon, lat] = coord;
    const symbolId = unitId; // reuse same id for easy cross-reference
    unitIdToSymbolId.set(unitId, symbolId);

    // Use short_name as the compact label; fall back to full name so that
    // every symbol always shows a human-readable label instead of SIDC.
    const label = str(unit.short_name) ?? name;

    symbols.push({
      id: symbolId,
      name: label,
      layerId,
      sidc,
      lon,
      lat,
      uniqueDesignation: label,
      higherFormation: undefined,
    });
  }

  // Back-link symbolId into orbatUnits
  const linkedOrbat = orbatUnits.map((u) => {
    const symId = unitIdToSymbolId.get(u.id);
    return symId ? { ...u, symbolId: symId } : u;
  });

  const layer: MilLayer = {
    id: layerId,
    name: groupName,
    visible: true,
    opacity: 1,
    symbols,
    graphics: [],
  };

  return { layers: [layer], orbat: linkedOrbat };
}

// ─── MilSymb JSON ─────────────────────────────────────────────────────────────

interface MilsymbJsonSymbol {
  id?: string;
  sidc?: string;
  designation?: string;
  higher_formation?: string;
  additional_information?: string;
  comment?: string;
  direction?: number | null;
  speed?: string;
  longitude?: number | null;
  latitude?: number | null;
}

interface MilsymbJsonLayer {
  id?: string;
  name?: string;
  visible?: boolean;
  symbols?: MilsymbJsonSymbol[];
}

interface MilsymbJsonDoc {
  kadas_milsymb_version?: string;
  layers?: MilsymbJsonLayer[];
}

/**
 * Parse a `.milsymb.json` file into MilLayer[] (no ORBAT units).
 * Each source layer becomes one MilLayer; symbols without valid coordinates
 * are silently skipped.
 */
export function parseMilsymbJsonForStore(
  jsonText: string,
  sourceName?: string,
): StoreImportResult {
  let doc: MilsymbJsonDoc;
  try {
    doc = JSON.parse(jsonText) as MilsymbJsonDoc;
  } catch {
    throw new Error("Invalid MilSymb file: JSON parse error");
  }
  if (!Array.isArray(doc.layers)) {
    throw new Error("Invalid MilSymb file: missing 'layers' array");
  }

  const layers: MilLayer[] = [];

  for (const srcLayer of doc.layers) {
    const layerId = str(srcLayer.id) ?? crypto.randomUUID();
    const layerName = str(srcLayer.name) ?? sourceName ?? "MilSymb Import";
    const symbols: MilSymbolItem[] = [];

    for (const sym of srcLayer.symbols ?? []) {
      const sidc = str(sym.sidc)?.toUpperCase();
      const coord = validCoord(sym.longitude, sym.latitude);
      if (!sidc || !coord || !isValidSIDC(sidc)) continue;

      const [lon, lat] = coord;
      const designation = str(sym.designation);

      symbols.push({
        id: str(sym.id) ?? crypto.randomUUID(),
        name: designation ?? sidc.slice(0, 8),
        layerId,
        sidc,
        lon,
        lat,
        uniqueDesignation: designation,
        higherFormation: str(sym.higher_formation),
        additionalInformation:
          str(sym.additional_information) ?? str(sym.comment),
        direction: num(sym.direction),
        speed: str(sym.speed),
      });
    }

    layers.push({
      id: layerId,
      name: layerName,
      visible: srcLayer.visible !== false,
      opacity: 1,
      symbols,
      graphics: [],
    });
  }

  return { layers, orbat: [] };
}

// ─── MilX XML ─────────────────────────────────────────────────────────────────

function getText(el: Element, tag: string): string | undefined {
  const child = el.querySelector(tag);
  const text = child?.textContent?.trim();
  return text && text !== "" ? text : undefined;
}

function parseMssStringXML(
  raw: string,
  parser: DOMParser,
): { sidc: string; attrs: Record<string, string> } | null {
  const unescaped = raw
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  let xmlDoc: Document;
  try {
    xmlDoc = parser.parseFromString(unescaped, "application/xml");
  } catch {
    return null;
  }
  if (xmlDoc.querySelector("parsererror")) return null;

  const symbolEl = xmlDoc.querySelector("Symbol");
  if (!symbolEl) return null;

  const sidc = symbolEl.getAttribute("ID")?.trim() ?? "";
  if (!sidc) return null;

  const attrs: Record<string, string> = {};
  for (const attrEl of Array.from(xmlDoc.querySelectorAll("Attribute"))) {
    const id = attrEl.getAttribute("ID");
    const value = attrEl.textContent?.trim();
    if (id && value) attrs[id] = value;
  }

  return { sidc: sidc.toUpperCase(), attrs };
}

/**
 * Parse a MilX XML document (`.milxly` / `.milx`) into MilLayer[].
 * Single-point graphics → MilSymbolItem; multi-point → MilGraphicItem.
 * Each MilXLayer becomes one MilLayer.
 */
export function parseMilXForStore(
  _xmlString: string,
  _sourceName?: string,
): StoreImportResult {
  throw new Error("MILX import non e piu supportato.");
}

/**
 * Parse a zipped MilX layer archive (`.milxlyz`) and extract the first
 * `.milxly` or `.milx` document inside.
 */
export function parseMilXArchiveForStore(
  _archive: ArrayBuffer | Uint8Array,
  _filename?: string,
  _sourceName?: string,
): StoreImportResult {
  throw new Error("MILX import non e piu supportato.");
}

// ─── Auto-detect dispatcher ───────────────────────────────────────────────────

/**
 * Detect the format from filename + content and return the parsed store data.
 * Throws if no format matches.
 */
export function parseAnyMilFormatForStore(
  text: string,
  filename: string,
  sourceName?: string,
): StoreImportResult {
  const nameLower = filename.toLowerCase();

  if (nameLower.endsWith(".orbat.json")) {
    return parseOrbatJsonForStore(text, sourceName);
  }
  if (nameLower.endsWith(".milsymb.json")) {
    return parseMilsymbJsonForStore(text, sourceName);
  }
  // Generic JSON: probe content
  if (nameLower.endsWith(".json")) {
    try {
      const raw = JSON.parse(text) as Record<string, unknown>;
      if (Array.isArray(raw["units"])) {
        return parseOrbatJsonForStore(text, sourceName);
      }
      if (
        "kadas_milsymb_version" in raw ||
        Array.isArray(raw["layers"])
      ) {
        // Distinguish milsymb from milgeo.json: milgeo has a version field
        if (raw["version"] !== undefined && !("kadas_milsymb_version" in raw)) {
          throw new Error("__milgeo_json__"); // signal to caller to use milgeo path
        }
        return parseMilsymbJsonForStore(text, sourceName);
      }
    } catch (e) {
      if (e instanceof Error && e.message === "__milgeo_json__") throw e;
      // ignore parse errors for content probing
    }
  }

  throw new Error(
    `Unrecognised file format: ${filename}. ` +
      "Expected .milgeo.json, .orbat.json, or .milsymb.json",
  );
}

/**
 * Byte-oriented dispatcher for imports. Needed for zipped `.milxlyz` where
 * `File.text()` cannot be used directly.
 */
export function parseAnyMilFormatFromBytesForStore(
  data: ArrayBuffer | Uint8Array,
  filename: string,
  sourceName?: string,
): StoreImportResult {
  const text = new TextDecoder().decode(asBytes(data));
  return parseAnyMilFormatForStore(text, filename, sourceName);
}
