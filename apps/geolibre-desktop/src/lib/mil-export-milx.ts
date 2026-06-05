/**
 * mil-export-milx.ts
 * Export MilGeo layers as MILX format (.milxly / .milxlyx).
 *
 * MILX is the XML format used by KADAS Albireo and compatible tools.
 * The root element is <MilXDocument> containing <MilXLayer> elements,
 * each with <MilXSymbol> point symbols.
 *
 * Reference: kadas-milx MILX 2.0 XSD, KADAS Albireo source code.
 */
import type { MilLayer, MilSymbolItem } from "@geolibre/core";

// ─── XML helpers ──────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// ─── Symbol serialiser ────────────────────────────────────────────────────────

function symbolToMilX(sym: MilSymbolItem): string {
  const amplifiers: string[] = [];

  if (sym.uniqueDesignation)   amplifiers.push(`        <Amplifier type="T">${esc(sym.uniqueDesignation)}</Amplifier>`);
  if (sym.higherFormation)     amplifiers.push(`        <Amplifier type="M">${esc(sym.higherFormation)}</Amplifier>`);
  if (sym.staffComments)       amplifiers.push(`        <Amplifier type="G">${esc(sym.staffComments)}</Amplifier>`);
  if (sym.additionalInformation) amplifiers.push(`        <Amplifier type="H">${esc(sym.additionalInformation)}</Amplifier>`);
  if (sym.dtg)                 amplifiers.push(`        <Amplifier type="W">${esc(sym.dtg)}</Amplifier>`);
  if (sym.altitudeDepth)       amplifiers.push(`        <Amplifier type="X">${esc(sym.altitudeDepth)}</Amplifier>`);
  if (sym.direction !== undefined) amplifiers.push(`        <Amplifier type="Q">${sym.direction}</Amplifier>`);
  if (sym.quantity)            amplifiers.push(`        <Amplifier type="C">${esc(sym.quantity)}</Amplifier>`);
  if (sym.speed)               amplifiers.push(`        <Amplifier type="Z">${esc(sym.speed)}</Amplifier>`);
  if (sym.typeStr)             amplifiers.push(`        <Amplifier type="T1">${esc(sym.typeStr)}</Amplifier>`);

  return `      <MilXSymbol>
        <MssStringXML>${esc(sym.sidc)}</MssStringXML>
        <Name>${esc(sym.name || sym.uniqueDesignation || "Symbol")}</Name>
        <Point lon="${sym.lon}" lat="${sym.lat}"/>
${amplifiers.join("\n")}
      </MilXSymbol>`;
}

// ─── Layer serialiser ─────────────────────────────────────────────────────────

function layerToMilX(layer: MilLayer): string {
  const symbols = layer.symbols.map(symbolToMilX).join("\n");
  return `    <MilXLayer name="${esc(layer.name)}" visible="${layer.visible ? "true" : "false"}">
${symbols}
    </MilXLayer>`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Build and download a MILX (.milxly) file from visible MilGeo layers. */
export function exportMilGeoMilX(layers: MilLayer[], filename?: string): void {
  const layerXml = layers.map(layerToMilX).join("\n");

  const doc = `<?xml version="1.0" encoding="UTF-8"?>
<MilXDocument version="2.0" xmlns="http://www.kadas.ch/milx">
  <Layers>
${layerXml}
  </Layers>
</MilXDocument>`;

  const blob = new Blob([doc], { type: "application/xml" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = filename ?? "milgeo-export.milxly";
  a.click();
  URL.revokeObjectURL(url);
}
