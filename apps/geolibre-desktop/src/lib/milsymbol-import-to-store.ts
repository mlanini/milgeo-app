/**
 * milsymbol-import-to-store.ts
 *
 * Converts external military symbology formats to the MilGeoJson data model
 * used by useMilLayerStore (MilLayerPanel).
 *
 * Formats supported:
 *   .orbat.json      — KADAS ORBAT flat unit tree
 *   .milsymb.json    — KADAS MilSymb layer document
 *   .milxly / .milx  — gs-soft MilX V3.1 XML
 *
 * Each function returns { layers: MilLayer[], orbat: OrbatUnit[] } which
 * can be merged into the current store state via importFromMilGeoJson().
 */

import type { MilLayer, MilSymbolItem, MilGraphicItem, OrbatUnit, MilGeometryType } from "@geolibre/core";
import { strFromU8, unzipSync } from "fflate";

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

const MAX_MILX_ARCHIVE_BYTES = 25 * 1024 * 1024;

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
  xmlString: string,
  sourceName?: string,
): StoreImportResult {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, "application/xml");

  if (xmlDoc.querySelector("parsererror")) {
    throw new Error("Invalid MilX file: XML parse error");
  }

  const milxLayers = Array.from(xmlDoc.querySelectorAll("MilXLayer"));
  if (milxLayers.length === 0) {
    throw new Error("Invalid MilX file: no <MilXLayer> elements found");
  }

  const resultLayers: MilLayer[] = [];

  for (const milxLayer of milxLayers) {
    const layerId = crypto.randomUUID();
    const layerName = getText(milxLayer, "Name") ?? sourceName ?? "MilX Import";

    const symbols: MilSymbolItem[] = [];
    const graphics: MilGraphicItem[] = [];

    for (const graphic of Array.from(milxLayer.querySelectorAll("MilXGraphic"))) {
      const mssRaw = getText(graphic, "MssStringXML");
      if (!mssRaw) continue;

      const parsed = parseMssStringXML(mssRaw, parser);
      if (!parsed || !isValidSIDC(parsed.sidc)) continue;

      const { sidc, attrs } = parsed;

      // Prefer APP6D attribute for full 20-char SIDC round-trip
      const finalSidc = (attrs["APP6D"] && isValidSIDC(attrs["APP6D"]))
        ? attrs["APP6D"]
        : sidc;

      const graphicName = getText(graphic, "Name");
      const designation = attrs["T"];
      const name = graphicName ?? designation ?? sidc.slice(0, 8);

      const pointEls = Array.from(graphic.querySelectorAll("PointList > Point"));
      const coords: [number, number][] = pointEls
        .map((pt) => {
          const x = parseFloat(getText(pt, "X") ?? "NaN");
          const y = parseFloat(getText(pt, "Y") ?? "NaN");
          return [x, y] as [number, number];
        })
        .filter(([x, y]) => isFinite(x) && isFinite(y));

      if (coords.length === 0) continue;

      const id = crypto.randomUUID();

      if (coords.length === 1) {
        const [lon, lat] = coords[0];
        symbols.push({
          id,
          name,
          layerId,
          sidc: finalSidc,
          lon,
          lat,
          uniqueDesignation: designation,
          higherFormation: attrs["M"],
          additionalInformation: attrs["H"] ?? attrs["G"],
          direction: attrs["Q"] ? parseFloat(attrs["Q"]) : undefined,
          speed: attrs["Z"],
        });
      } else {
        const first = coords[0];
        const last = coords[coords.length - 1];
        const isClosed =
          first[0] === last[0] && first[1] === last[1] && coords.length >= 4;
        const geometryType: MilGeometryType = isClosed ? "Polygon" : "LineString";

        graphics.push({
          id,
          name,
          layerId,
          sidc: finalSidc,
          geometryType,
          coordinates: coords,
          uniqueDesignation: designation,
          additionalInformation: attrs["H"] ?? attrs["G"],
        });
      }
    }

    resultLayers.push({
      id: layerId,
      name: layerName,
      visible: true,
      opacity: 1,
      symbols,
      graphics,
    });
  }

  return { layers: resultLayers, orbat: [] };
}

/**
 * Parse a zipped MilX layer archive (`.milxlyz`) and extract the first
 * `.milxly` or `.milx` document inside.
 */
export function parseMilXArchiveForStore(
  archive: ArrayBuffer | Uint8Array,
  filename?: string,
  sourceName?: string,
): StoreImportResult {
  const bytes = asBytes(archive);
  if (bytes.byteLength > MAX_MILX_ARCHIVE_BYTES) {
    throw new Error("MilX archive is too large to import safely.");
  }

  let entries: Record<string, Uint8Array>;
  try {
    let expanded = 0;
    entries = unzipSync(bytes, {
      filter(entry) {
        if (entry.originalSize > MAX_MILX_ARCHIVE_BYTES) {
          throw new Error("MilX archive is too large to import safely.");
        }
        expanded += entry.originalSize;
        if (expanded > MAX_MILX_ARCHIVE_BYTES) {
          throw new Error("MilX archive is too large to import safely.");
        }
        return /\.(milxly|milx)$/i.test(entry.name);
      },
    });
  } catch (error) {
    if (error instanceof Error && /too large to import safely/i.test(error.message)) {
      throw error;
    }
    throw new Error("Invalid MilX archive: ZIP parse error");
  }

  const names = Object.keys(entries)
    .filter((name) => /\.(milxly|milx)$/i.test(name))
    .sort((a, b) => a.localeCompare(b));
  if (names.length === 0) {
    throw new Error("Invalid MilX archive: no .milxly/.milx document found");
  }

  const preferredName = names.find((name) => name.toLowerCase().endsWith(".milxly")) ?? names[0];
  const xml = strFromU8(entries[preferredName]);
  const layerName = sourceName ?? filename?.replace(/\.milxlyz$/i, "") ?? preferredName;
  return parseMilXForStore(xml, layerName);
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
  if (nameLower.endsWith(".milxly") || nameLower.endsWith(".milx")) {
    return parseMilXForStore(text, sourceName);
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
    // MilX XML stored as .json?
    if (text.trimStart().includes("MilXLayer")) {
      return parseMilXForStore(text, sourceName);
    }
  }

  // XML without recognized extension
  if (
    text.trimStart().startsWith("<?xml") ||
    text.trimStart().includes("MilXLayer")
  ) {
    return parseMilXForStore(text, sourceName);
  }

  throw new Error(
    `Unrecognised file format: ${filename}. ` +
      "Expected .milgeo.json, .orbat.json, .milsymb.json, .milxlyz, or .milxly",
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
  const lower = filename.toLowerCase();
  if (lower.endsWith(".milxlyz")) {
    return parseMilXArchiveForStore(data, filename, sourceName);
  }

  const text = new TextDecoder().decode(asBytes(data));
  return parseAnyMilFormatForStore(text, filename, sourceName);
}
