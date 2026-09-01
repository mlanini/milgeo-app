/**
 * milsymbol-export-formats.ts
 *
 * Export GeoLibre mil layers to standard military exchange formats:
 *
 *   .orbat.json   — KADAS ORBAT flat-unit-tree (https://github.com/intelligeo/qgis-app6d-plugin)
 *   .milsymb.json — KADAS MilSymb layer document (kadas_milsymb_version 0.2)
 *   .milxly       — gs-soft MilX V3.1 XML (swisstopo KADAS Albireo)
 *
 * All three functions accept the store-native GeoLibreLayer[] model.
 * Graphics (mil-graphic layers) are included in MilX but omitted from
 * ORBAT/MilSymb, which are point-symbol-only formats.
 */

import type {
  GeoLibreLayer,
  MilSymbolLayerSource,
  MilGraphicLayerSource,
} from "@geolibre/core";
import { strToU8, zipSync } from "fflate";

// ─── Shared download helper ───────────────────────────────────────────────────

function downloadBlob(
  content: string | Uint8Array,
  mimeType: string,
  filename: string,
): void {
  const blob = new Blob([content], { type: mimeType });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── ORBAT JSON (.orbat.json) export ─────────────────────────────────────────

/**
 * Shape of a single unit in the KADAS ORBAT format.
 * Matches the structure of SAF2025.orbat.json.
 */
interface OrbatExportUnit {
  id: string;
  sidc: string;
  name: string;
  short_name: string;
  parent_id: string | null;
  temporal: { start: string | null; end: string | null };
  longitude: number | null;
  latitude: number | null;
  map_symbol_id: string | null;
}

interface OrbatExportDocument {
  name: string;
  units: OrbatExportUnit[];
}

/**
 * Export mil-symbol layers as KADAS ORBAT JSON (.orbat.json).
 *
 * Each `mil-symbol` layer becomes one unit entry. Hierarchy (`parent_id`)
 * is preserved when the layer was originally imported from an ORBAT file
 * (metadata.orbatParentId). Graphics layers are omitted.
 *
 * @param layers   Store layers to export (typically all mil-symbol layers)
 * @param docName  Human-readable document title stored in `name` field
 * @param filename Filename stem (without extension). Defaults to "milgeo-export"
 */
export function exportToOrbatJson(
  layers: GeoLibreLayer[],
  docName?: string,
  filename?: string,
): void {
  const milSymbolLayers = layers.filter((l) => l.type === "mil-symbol");

  const units: OrbatExportUnit[] = milSymbolLayers.map((layer) => {
    const src  = layer.source as unknown as MilSymbolLayerSource;
    const meta = (layer.metadata ?? {}) as Record<string, unknown>;
    const shortName =
      src.uniqueDesignation ??
      (meta.orbatShortName as string | undefined) ??
      layer.name;

    return {
      id:          layer.id,
      sidc:        src.SIDC,
      name:        layer.name,
      short_name:  shortName,
      parent_id:   (meta.orbatParentId as string | null) ?? null,
      temporal:    { start: null, end: null },
      longitude:   src.lon ?? null,
      latitude:    src.lat ?? null,
      map_symbol_id: layer.id,
    };
  });

  const doc: OrbatExportDocument = {
    name:  docName ?? "MilGeo ORBAT Export",
    units,
  };

  downloadBlob(
    JSON.stringify(doc, null, 2),
    "application/json",
    `${filename ?? "milgeo-export"}.orbat.json`,
  );
}

// ─── MilSymb JSON (.milsymb.json) export ─────────────────────────────────────

interface MilsymbExportSymbol {
  id:                     string;
  sidc:                   string;
  designation?:           string;
  higher_formation?:      string;
  additional_information?: string;
  direction?:             number;
  speed?:                 string;
  longitude:              number;
  latitude:               number;
}

interface MilsymbExportLayer {
  id:      string;
  name:    string;
  visible: boolean;
  symbols: MilsymbExportSymbol[];
}

interface MilsymbExportDocument {
  kadas_milsymb_version: string;
  layers: MilsymbExportLayer[];
}

/**
 * Export mil-symbol layers as KADAS MilSymb JSON (.milsymb.json).
 *
 * Layers that were imported from a milsymb file retain their original
 * layer grouping (via metadata.milsymbLayerId). Otherwise all symbols
 * are grouped into one export layer. Graphics layers are omitted.
 *
 * @param layers   Store layers to export
 * @param docName  Default name for the export layer when no grouping metadata exists
 * @param filename Filename stem (without extension). Defaults to "milgeo-export"
 */
export function exportToMilsymbJson(
  layers: GeoLibreLayer[],
  docName?: string,
  filename?: string,
): void {
  const milSymbolLayers = layers.filter((l) => l.type === "mil-symbol");

  // Group symbols by their original milsymb layer id (if available)
  const groupMap = new Map<
    string,
    { name: string; visible: boolean; symbols: MilsymbExportSymbol[] }
  >();
  const defaultGroupId = crypto.randomUUID();

  for (const layer of milSymbolLayers) {
    const src  = layer.source as unknown as MilSymbolLayerSource;
    if (src.lon == null || src.lat == null) continue;

    const meta      = (layer.metadata ?? {}) as Record<string, unknown>;
    const groupId   = (meta.milsymbLayerId as string) ?? defaultGroupId;
    const groupName = (meta.milsymbLayerName as string) ?? docName ?? "MilGeo Export";

    if (!groupMap.has(groupId)) {
      groupMap.set(groupId, { name: groupName, visible: true, symbols: [] });
    }

    const group = groupMap.get(groupId)!;

    // Propagate invisible state: if ANY symbol is hidden, mark the group hidden
    if (layer.visible === false) group.visible = false;

    const sym: MilsymbExportSymbol = {
      id:        layer.id,
      sidc:      src.SIDC,
      longitude: src.lon,
      latitude:  src.lat,
    };
    if (src.uniqueDesignation) sym.designation           = src.uniqueDesignation;
    if (src.higherFormation)   sym.higher_formation      = src.higherFormation;
    if (src.additionalInfo)    sym.additional_information = src.additionalInfo;
    if (src.direction != null) sym.direction             = src.direction;
    if (src.speed)             sym.speed                 = src.speed;

    group.symbols.push(sym);
  }

  const exportLayers: MilsymbExportLayer[] = Array.from(
    groupMap.entries(),
  ).map(([id, g]) => ({ id, name: g.name, visible: g.visible, symbols: g.symbols }));

  const doc: MilsymbExportDocument = {
    kadas_milsymb_version: "0.2",
    layers: exportLayers,
  };

  downloadBlob(
    JSON.stringify(doc, null, 2),
    "application/json",
    `${filename ?? "milgeo-export"}.milsymb.json`,
  );
}

// ─── MilX XML (.milxly) export ────────────────────────────────────────────────

const MILX_NS              = "http://gs-soft.com/MilX/V3.1";
const MILX_LIBRARY_VERSION = "2025.02.20";
const MILX_SYMBOL_SIZE     = "12";

function xmlEsc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Build the XML-escaped <MssStringXML> content for a single symbol.
 * The raw inner XML takes the form:
 *   <Symbol ID="{sidc}"><Attribute ID="T">Desig</Attribute>...</Symbol>
 * which is then XML-escaped once, as required by the MilX spec.
 */
function buildMssString(
  sidc: string,
  attrs: Array<[string, string]>,
): string {
  const attrXml = attrs
    .map(([id, v]) => `<Attribute ID="${id}">${xmlEsc(v)}</Attribute>`)
    .join("");
  return xmlEsc(`<Symbol ID="${sidc}">${attrXml}</Symbol>`);
}

function milXGraphicFromSymbol(layer: GeoLibreLayer): string {
  const src    = layer.source as unknown as MilSymbolLayerSource;
  const attrs: Array<[string, string]> = [];
  if (src.uniqueDesignation) attrs.push(["T",     src.uniqueDesignation]);
  if (src.higherFormation)   attrs.push(["M",     src.higherFormation]);
  if (src.additionalInfo)    attrs.push(["H",     src.additionalInfo]);
  if (src.direction != null) attrs.push(["Q",     String(src.direction)]);
  if (src.speed)             attrs.push(["Z",     src.speed]);
  if (src.SIDC.length === 20) attrs.push(["APP6D", src.SIDC]);

  return `      <MilXGraphic>
        <MssStringXML>${buildMssString(src.SIDC, attrs)}</MssStringXML>
        <Name>${xmlEsc(layer.name)}</Name>
        <PointList>
          <Point><X>${src.lon.toFixed(6)}</X><Y>${src.lat.toFixed(6)}</Y></Point>
        </PointList>
        <Offset><FactorX>0</FactorX><FactorY>0</FactorY></Offset>
      </MilXGraphic>`;
}

function milXGraphicFromGraphic(layer: GeoLibreLayer): string {
  const src    = layer.source as unknown as MilGraphicLayerSource;
  const attrs: Array<[string, string]> = [];
  if (src.uniqueDesignation) attrs.push(["T",     src.uniqueDesignation]);
  if (src.additionalInfo)    attrs.push(["H",     src.additionalInfo]);
  if (src.SIDC.length === 20) attrs.push(["APP6D", src.SIDC]);

  const points = src.coordinates
    .map(([lon, lat]: [number, number]) =>
      `          <Point><X>${lon.toFixed(6)}</X><Y>${lat.toFixed(6)}</Y></Point>`,
    )
    .join("\n");

  return `      <MilXGraphic>
        <MssStringXML>${buildMssString(src.SIDC, attrs)}</MssStringXML>
        <Name>${xmlEsc(layer.name)}</Name>
        <PointList>
${points}
        </PointList>
        <Offset><FactorX>0</FactorX><FactorY>0</FactorY></Offset>
      </MilXGraphic>`;
}

/**
 * Export mil layers as gs-soft MilX XML (.milxly).
 *
 * Both point symbols (`mil-symbol`) and tactical graphics (`mil-graphic`)
 * are serialised into a single MilXLayer. The full APP-6D SIDC is embedded
 * as an APP6D attribute for lossless round-trip via KADAS.
 *
 * @param layers   Store layers to export
 * @param filename Filename stem (without extension). Defaults to "milgeo-export"
 */
export function exportToMilX(
  layers: GeoLibreLayer[],
  filename?: string,
): void {
  const xml = buildMilXDocument(layers, filename);
  downloadBlob(xml, "application/xml", `${filename ?? "milgeo-export"}.milxly`);
}

/**
 * Build a MilX XML document from the selected mil layers.
 */
export function buildMilXDocument(
  layers: GeoLibreLayer[],
  filename?: string,
): string {
  const graphicElements: string[] = [];

  for (const layer of layers) {
    if (layer.type === "mil-symbol") {
      const src = layer.source as unknown as MilSymbolLayerSource;
      if (src.lon == null || src.lat == null) continue;
      graphicElements.push(milXGraphicFromSymbol(layer));
    } else if (layer.type === "mil-graphic") {
      const src = layer.source as unknown as MilGraphicLayerSource;
      if (!src.coordinates?.length) continue;
      graphicElements.push(milXGraphicFromGraphic(layer));
    }
  }

  const layerName = filename ?? "MilGeo Export";

  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<MilXDocument_Layer xmlns="${MILX_NS}">
  <MssLibraryVersionTag>${MILX_LIBRARY_VERSION}</MssLibraryVersionTag>
  <MilXLayer>
    <Name>${xmlEsc(layerName)}</Name>
    <LayerType>Normal</LayerType>
    <GraphicList>
${graphicElements.join("\n")}
    </GraphicList>
  </MilXLayer>
  <CoordSystemType>WGS84</CoordSystemType>
  <SymbolSize>${MILX_SYMBOL_SIZE}</SymbolSize>
</MilXDocument_Layer>`;
}

/**
 * Export mil layers as a `.milxlyz` archive containing one `.milxly` entry.
 */
export function exportToMilXlyz(
  layers: GeoLibreLayer[],
  filename?: string,
): void {
  const stem = (filename ?? "milgeo-export").trim() || "milgeo-export";
  const xml = buildMilXDocument(layers, stem);
  const zipped = zipSync({
    [`${stem}.milxly`]: strToU8(xml),
  }, { level: 6 });
  downloadBlob(zipped, "application/zip", `${stem}.milxlyz`);
}
