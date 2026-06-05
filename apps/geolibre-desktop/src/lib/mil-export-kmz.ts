/**
 * mil-export-kmz.ts
 * Export MilGeo layers as a KMZ file.
 *
 * KMZ = zip archive containing:
 *   doc.kml   – KML document with Placemarks (name, description, coordinates)
 *   icons/    – PNG icon for each unique SIDC rasterised via milsymbol
 *
 * Requires the `fflate` library (already in the dependency tree via milsymbol).
 * Falls back to a KML-only download if fflate is not available.
 */
import ms from "milsymbol";
import type { MilLayer, MilSymbolItem } from "@geolibre/core";

const MilSymbol = ms.Symbol;
const ICON_SIZE  = 48;
const PIXEL_RATIO = Math.min(window.devicePixelRatio || 1, 2);

// ─── KML builder ─────────────────────────────────────────────────────────────

function escapeXml(s: string): string {
  return s
    .replace(/&/g,  "&amp;")
    .replace(/</g,  "&lt;")
    .replace(/>/g,  "&gt;")
    .replace(/"/g,  "&quot;")
    .replace(/'/g,  "&apos;");
}

function symbolDescriptionKml(sym: MilSymbolItem): string {
  const rows: string[] = [];
  if (sym.uniqueDesignation) rows.push(`<tr><td>Designazione</td><td>${escapeXml(sym.uniqueDesignation)}</td></tr>`);
  if (sym.higherFormation)   rows.push(`<tr><td>Form. superiore</td><td>${escapeXml(sym.higherFormation)}</td></tr>`);
  if (sym.sidc)              rows.push(`<tr><td>SIDC</td><td>${escapeXml(sym.sidc)}</td></tr>`);
  if (!rows.length) return "";
  return `<![CDATA[<table>${rows.join("")}</table>]]>`;
}

function symbolToPlacemark(sym: MilSymbolItem, iconRef: string): string {
  const desc = symbolDescriptionKml(sym);
  return `    <Placemark>
      <name>${escapeXml(sym.name || sym.uniqueDesignation || "Symbol")}</name>
      ${desc ? `<description>${desc}</description>` : ""}
      <Style>
        <IconStyle>
          <Icon><href>${escapeXml(iconRef)}</href></Icon>
          <hotSpot x="0.5" y="0.5" xunits="fraction" yunits="fraction"/>
        </IconStyle>
      </Style>
      <Point>
        <coordinates>${sym.lon},${sym.lat},0</coordinates>
      </Point>
    </Placemark>`;
}

function buildKmlDocument(layers: MilLayer[], sidcIconMap: Map<string, string>): string {
  const folders: string[] = [];

  for (const layer of layers) {
    if (!layer.visible || !layer.symbols.length) continue;
    const placemarks = layer.symbols.map((sym) => {
      const iconRef = sidcIconMap.get(sym.sidc) ?? `icons/${sym.sidc}.png`;
      return symbolToPlacemark(sym, iconRef);
    });
    folders.push(`  <Folder>
    <name>${escapeXml(layer.name)}</name>
${placemarks.join("\n")}
  </Folder>`);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
  <name>MilSymb Export</name>
${folders.join("\n")}
</Document>
</kml>`;
}

// ─── Icon rasteriser ──────────────────────────────────────────────────────────

function rasteriseIconToPng(sidc: string): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      const sym = new MilSymbol(sidc, {
        size: ICON_SIZE,
        outlineColor: "white",
        outlineWidth: 4,
      });
      if (!sym.isValid()) { resolve(null); return; }
      const canvas = sym.asCanvas(PIXEL_RATIO);
      if (!canvas) { resolve(null); return; }
      canvas.toBlob((blob) => resolve(blob), "image/png");
    } catch {
      resolve(null);
    }
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Build and download a KMZ file from visible MilGeo layers.
 * Uses fflate for zip creation if available; otherwise downloads plain KML.
 */
export async function exportMilGeoKmz(layers: MilLayer[], filename?: string): Promise<void> {
  const visibleLayers = layers.filter((l) => l.visible);
  const allSymbols    = visibleLayers.flatMap((l) => l.symbols);

  // Collect unique SIDCs
  const uniqueSidcs = [...new Set(allSymbols.map((s) => s.sidc))];

  // Attempt to load fflate (bundled as a transitive dep)
  let fflate: typeof import("fflate") | null = null;
  try {
    fflate = await import("fflate");
  } catch {
    // fflate not available — fall back to KML-only download
  }

  const sidcIconMap = new Map<string, string>();

  if (fflate) {
    // Build zip with icons
    const zipFiles: Record<string, Uint8Array> = {};

    for (const sidc of uniqueSidcs) {
      const blob = await rasteriseIconToPng(sidc);
      if (blob) {
        const buf = await blob.arrayBuffer();
        const iconPath = `icons/${sidc}.png`;
        zipFiles[iconPath] = new Uint8Array(buf);
        sidcIconMap.set(sidc, iconPath);
      }
    }

    const kml = buildKmlDocument(visibleLayers, sidcIconMap);
    zipFiles["doc.kml"] = new TextEncoder().encode(kml);

    const zipped = fflate.zipSync(zipFiles, { level: 6 });
    const kmzBlob = new Blob([zipped], { type: "application/vnd.google-earth.kmz" });
    const url = URL.createObjectURL(kmzBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename ?? "milgeo-export.kmz";
    a.click();
    URL.revokeObjectURL(url);
  } else {
    // Fallback: plain KML download
    uniqueSidcs.forEach((sidc) => sidcIconMap.set(sidc, `icons/${sidc}.png`));
    const kml = buildKmlDocument(visibleLayers, sidcIconMap);
    const blob = new Blob([kml], { type: "application/vnd.google-earth.kml+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = (filename ?? "milgeo-export").replace(/\.kmz$/, ".kml");
    a.click();
    URL.revokeObjectURL(url);
  }
}
