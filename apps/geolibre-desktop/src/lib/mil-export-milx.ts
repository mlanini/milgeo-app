/**
 * mil-export-milx.ts
 * Export MilGeo layers as MILX format (.milxly).
 *
 * MILX is the XML dialect used by swisstopo KADAS Albireo and gs-soft tools.
 * Reference: kadas-app6d-plugin milxly_io.py (gs-soft MilX V3.1 format).
 *
 * Key format details:
 *  - Root element: <MilXDocument_Layer xmlns="http://gs-soft.com/MilX/V3.1">
 *  - <MssLibraryVersionTag> e.g. "2025.02.20"
 *  - <MilXLayer><Name/><LayerType>Normal</LayerType><GraphicList>...</GraphicList></MilXLayer>
 *  - Per symbol: <MilXGraphic>
 *      <MssStringXML> – XML-escaped <Symbol ID="..."><Attribute ID="x">v</Attribute></Symbol>
 *      <Name> – display name
 *      <PointList><Point><X>lon</X><Y>lat</Y></Point></PointList>
 *      <Offset><FactorX>0</FactorX><FactorY>0</FactorY></Offset>
 *    </MilXGraphic>
 *  - The full 20-char APP-6D SIDC is stored in Attribute ID="APP6D" for
 *    lossless round-trip; KADAS reads APP6D first when importing.
 *  - One .milxly file per layer (multiple layers → multiple downloads).
 */
import type { MilLayer, MilSymbolItem } from "@geolibre/core";

const MILX_NS              = "http://gs-soft.com/MilX/V3.1";
const MILX_LIBRARY_VERSION = "2025.02.20";
const MILX_SYMBOL_SIZE     = "12";

// ─── XML helpers ──────────────────────────────────────────────────────────────

/** Escape a string for use as XML text content or attribute value. */
function xmlEsc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Build the MssStringXML text content.
 *
 * The text content of <MssStringXML> is an XML-escaped string whose
 * raw (un-escaped) form is:
 *   <Symbol ID="{sidc}"><Attribute ID="T">designation</Attribute>...</Symbol>
 *
 * Amplifier IDs follow the MilX / APP-6 convention:
 *   T  = Unique Designation    M  = Higher Formation
 *   H  = Additional Info       AG = Staff Comments
 *   W  = DTG                   X  = Altitude/Depth
 *   Q  = Direction             C  = Quantity
 *   Z  = Speed                 T1 = Type
 *   APP6D = full 20-char APP-6D SIDC (KADAS custom, for lossless import)
 */
function buildMssString(sym: MilSymbolItem): string {
  const attrs: Array<[string, string]> = [];

  if (sym.uniqueDesignation)    attrs.push(["T",    sym.uniqueDesignation]);
  if (sym.higherFormation)      attrs.push(["M",    sym.higherFormation]);
  if (sym.additionalInformation) attrs.push(["H",   sym.additionalInformation]);
  if (sym.staffComments)        attrs.push(["AG",   sym.staffComments]);
  if (sym.dtg)                  attrs.push(["W",    sym.dtg]);
  if (sym.altitudeDepth)        attrs.push(["X",    sym.altitudeDepth]);
  if (sym.direction !== undefined) attrs.push(["Q", String(sym.direction)]);
  if (sym.quantity)             attrs.push(["C",    sym.quantity]);
  if (sym.speed)                attrs.push(["Z",    sym.speed]);
  if (sym.typeStr)              attrs.push(["T1",   sym.typeStr]);
  // Always embed full 20-char APP-6D SIDC for lossless KADAS round-trip
  if (sym.sidc && sym.sidc.length === 20) attrs.push(["APP6D", sym.sidc]);

  const attrXml = attrs
    .map(([id, v]) => `<Attribute ID="${id}">${xmlEsc(v)}</Attribute>`)
    .join("");

  // Raw (un-escaped) inner XML:  <Symbol ID="sidc">…</Symbol>
  const rawXml = `<Symbol ID="${sym.sidc}">${attrXml}</Symbol>`;

  // The element text must be XML-escaped once (the parser re-escapes it)
  return xmlEsc(rawXml);
}

// ─── Symbol serialiser ────────────────────────────────────────────────────────

function symbolToMilXGraphic(sym: MilSymbolItem): string {
  const displayName = xmlEsc(sym.name || sym.uniqueDesignation || sym.sidc || "Symbol");
  const mss         = buildMssString(sym);

  return `      <MilXGraphic>
        <MssStringXML>${mss}</MssStringXML>
        <Name>${displayName}</Name>
        <PointList>
          <Point>
            <X>${sym.lon.toFixed(6)}</X>
            <Y>${sym.lat.toFixed(6)}</Y>
          </Point>
        </PointList>
        <Offset>
          <FactorX>0</FactorX>
          <FactorY>0</FactorY>
        </Offset>
      </MilXGraphic>`;
}

// ─── Layer → full MilXDocument_Layer document ────────────────────────────────

function layerToMilXDoc(layer: MilLayer): string {
  const graphics = layer.symbols.map(symbolToMilXGraphic).join("\n");

  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<MilXDocument_Layer xmlns="${MILX_NS}">
  <MssLibraryVersionTag>${MILX_LIBRARY_VERSION}</MssLibraryVersionTag>
  <MilXLayer>
    <Name>${xmlEsc(layer.name)}</Name>
    <LayerType>Normal</LayerType>
    <CoordSystemType>WGS84</CoordSystemType>
    <SymbolSize>${MILX_SYMBOL_SIZE}</SymbolSize>
    <GraphicList>
${graphics}
    </GraphicList>
  </MilXLayer>
</MilXDocument_Layer>`;
}

// ─── Download helper ──────────────────────────────────────────────────────────

function downloadXml(xml: string, filename: string): void {
  const blob = new Blob([xml], { type: "application/xml" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Export MilGeo layers as MILX (.milxly) files, one per layer.
 * Each file follows the gs-soft MilX V3.1 format expected by KADAS Albireo.
 */
export function exportMilGeoMilX(layers: MilLayer[], filenamePrefix?: string): void {
  const prefix = filenamePrefix ?? "milgeo-export";

  if (layers.length === 0) return;

  if (layers.length === 1) {
    downloadXml(layerToMilXDoc(layers[0]), `${prefix}.milxly`);
    return;
  }

  // Multiple layers: download one file per layer
  for (const layer of layers) {
    const safeName = layer.name.replace(/[^a-zA-Z0-9_\-]/g, "_").substring(0, 40);
    downloadXml(layerToMilXDoc(layer), `${prefix}_${safeName}.milxly`);
  }
}
