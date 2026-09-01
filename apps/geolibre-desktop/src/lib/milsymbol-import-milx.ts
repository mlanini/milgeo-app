/**
 * milsymbol-import-milx.ts
 *
 * Importer for the gs-soft **MilX** format (`.milxly`, `.milx`).
 *
 * MilX is an XML-based military symbology exchange format used by:
 *   - KADAS Albireo (Swiss military GIS)
 *   - gs-soft MilX products
 *   - Various NATO C2 tools (XSD: http://gs-soft.com/MilX/V3.1)
 *
 * ## Structure
 * ```xml
 * <MilXDocument_Layer xmlns="http://gs-soft.com/MilX/V3.1">
 *   <MilXLayer>
 *     <Name>…</Name>
 *     <GraphicList>
 *       <MilXGraphic>
 *         <MssStringXML>
 *           &lt;Symbol ID="SFGPUCI----I---"&gt;
 *             &lt;Attribute ID="T"&gt;designation&lt;/Attribute&gt;
 *             &lt;Attribute ID="M"&gt;higher formation&lt;/Attribute&gt;
 *           &lt;/Symbol&gt;
 *         </MssStringXML>
 *         <Name>layer entry name</Name>
 *         <PointList>
 *           <Point><X>lon</X><Y>lat</Y></Point>  <!-- single = symbol -->
 *           …                                    <!-- multiple = graphic -->
 *         </PointList>
 *       </MilXGraphic>
 *     </GraphicList>
 *   </MilXLayer>
 * </MilXDocument_Layer>
 * ```
 *
 * ## SIDC format
 * MilX stores **15-character letter-based SIDCs** (MIL-STD-2525C / APP-6C),
 * e.g. `SFGPUCI----I---`. milsymbol 3.x accepts both letter-based and the
 * 20-char number-based format and auto-detects the encoding, so the raw ID is
 * passed through unchanged.
 *
 * ## Attribute IDs (MSS standard)
 * | ID | Meaning |
 * |----|---------|
 * | T  | Unique designation (unit name / call-sign) |
 * | M  | Higher formation |
 * | C  | Quantity |
 * | F  | Reinforced / reduced |
 * | G  | Staff comments |
 * | H  | Additional information |
 * | Q  | Direction of movement (degrees) |
 * | W  | DTG |
 * | X  | Altitude / depth |
 * | Z  | Speed |
 */

import type { GeoLibreLayer, MilAffiliation } from "@geolibre/core";
import { DEFAULT_LAYER_STYLE } from "@geolibre/core";
import type { MilGraphicLayerSource, MilSymbolLayerSource } from "@geolibre/core";
import ms from "./milsymbol-runtime";

const MilSymbol = ms.Symbol;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isValidSIDC(sidc: string): boolean {
  try {
    const result = new MilSymbol(sidc).isValid();
    return result === true || (typeof result === "object" && result !== null);
  } catch {
    return false;
  }
}

function inferAffiliation(sidc: string): MilAffiliation {
  // Letter-based SIDC: char 1 = affiliation  (S=Friend, H=Hostile, N=Neutral, U=Unknown)
  // Number-based SIDC: char 3 = affiliation digit
  const upper = sidc.toUpperCase();
  if (upper.length >= 20) {
    // Number-based
    const aff = upper[3];
    if (aff === "6" || aff === "5") return "HOSTILE";
    if (aff === "4") return "NEUTRAL";
    if (aff === "1" || aff === "0") return "UNKNOWN";
    return "FRIENDLY";
  }
  // Letter-based (15-char, 2525C / APP-6C)
  const aff = upper[1];
  if (aff === "H") return "HOSTILE";
  if (aff === "N") return "NEUTRAL";
  if (aff === "U" || aff === "P") return "UNKNOWN";
  return "FRIENDLY"; // S, F, A, …
}

function getText(el: Element, tag: string): string | undefined {
  const child = el.querySelector(tag);
  const text = child?.textContent?.trim();
  return text && text !== "" ? text : undefined;
}

/** Parse the escaped inner XML stored in <MssStringXML>. */
function parseMssStringXML(
  raw: string,
  outerParser: DOMParser,
): { sidc: string; attrs: Record<string, string> } | null {
  // The content is HTML-entity-escaped XML, unescape it then re-parse.
  const unescaped = raw
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  let doc: Document;
  try {
    doc = outerParser.parseFromString(unescaped, "application/xml");
  } catch {
    return null;
  }
  if (doc.querySelector("parsererror")) return null;

  const symbolEl = doc.querySelector("Symbol");
  if (!symbolEl) return null;

  const sidc = symbolEl.getAttribute("ID")?.trim() ?? "";
  if (!sidc) return null;

  const attrs: Record<string, string> = {};
  for (const attrEl of Array.from(doc.querySelectorAll("Attribute"))) {
    const id = attrEl.getAttribute("ID");
    const value = attrEl.textContent?.trim();
    if (id && value) attrs[id] = value;
  }

  return { sidc: sidc.toUpperCase(), attrs };
}

// ─── Public importer ─────────────────────────────────────────────────────────

/**
 * Import a MilX XML document (`.milxly` / `.milx`).
 *
 * - Single-point graphics → `mil-symbol` layers
 * - Multi-point graphics  → `mil-graphic` layers (LineString or Polygon
 *   depending on whether the first and last point are the same)
 *
 * @throws {Error} if the XML cannot be parsed or is not a MilX document.
 */
export function importMilX(
  xmlString: string,
  sourceName?: string,
): GeoLibreLayer[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, "application/xml");

  if (doc.querySelector("parsererror")) {
    throw new Error("Invalid MilX file: XML parse error");
  }

  // Accept both namespaced and plain element names
  const milxLayers = Array.from(
    doc.querySelectorAll("MilXLayer"),
  );
  if (milxLayers.length === 0) {
    throw new Error(
      "Invalid MilX file: no <MilXLayer> elements found — is this a MilX document?",
    );
  }

  const result: GeoLibreLayer[] = [];

  for (const milxLayer of milxLayers) {
    const layerName =
      getText(milxLayer, "Name") ?? sourceName ?? "MilX Import";

    const graphics = Array.from(milxLayer.querySelectorAll("MilXGraphic"));

    for (const graphic of graphics) {
      const mssRaw = getText(graphic, "MssStringXML");
      if (!mssRaw) continue;

      const parsed = parseMssStringXML(mssRaw, parser);
      if (!parsed || !isValidSIDC(parsed.sidc)) continue;

      const { sidc, attrs } = parsed;
      const graphicName = getText(graphic, "Name");
      const designation = attrs["T"];
      const name = graphicName ?? designation ?? sidc.slice(0, 8);
      const affiliation = inferAffiliation(sidc);

      // Parse point list
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
      const fullName = `${layerName} – ${name}`;

      if (coords.length === 1) {
        // ── Point symbol ──────────────────────────────────────────────────
        const [lon, lat] = coords[0];
        const source: MilSymbolLayerSource = {
          SIDC: sidc,
          lon,
          lat,
          affiliation,
          uniqueDesignation: designation,
          higherFormation: attrs["M"],
          additionalInfo: attrs["H"] ?? attrs["G"],
          direction: attrs["Q"] ? parseFloat(attrs["Q"]) : undefined,
          speed: attrs["Z"],
        };
        result.push({
          id,
          name: fullName,
          type: "mil-symbol",
          visible: true,
          opacity: 1,
          style: { ...DEFAULT_LAYER_STYLE },
          metadata: { milxLayerName: layerName },
          source: source as unknown as Record<string, unknown>,
        });
      } else {
        // ── Graphic (line / polygon) ──────────────────────────────────────
        // Detect polygon: closed ring (first == last) or ≥ 4 points forming
        // a plausible area.  Fall back to LineString.
        const first = coords[0];
        const last = coords[coords.length - 1];
        const isClosed =
          first[0] === last[0] && first[1] === last[1] && coords.length >= 4;
        const geometryType = isClosed ? "Polygon" : "LineString";

        const source: MilGraphicLayerSource = {
          SIDC: sidc,
          geometryType,
          coordinates: coords,
          affiliation,
          uniqueDesignation: designation,
          additionalInfo: attrs["H"] ?? attrs["G"],
        };
        result.push({
          id,
          name: fullName,
          type: "mil-graphic",
          visible: true,
          opacity: 1,
          style: { ...DEFAULT_LAYER_STYLE },
          metadata: { milxLayerName: layerName },
          source: source as unknown as Record<string, unknown>,
        });
      }
    }
  }

  return result;
}

/**
 * Returns true if the string looks like a MilX XML document.
 */
export function isMilXDocument(raw: string): boolean {
  const trimmed = raw.trimStart();
  return (
    trimmed.includes("MilXDocument_Layer") ||
    trimmed.includes("MilXLayer") ||
    trimmed.includes("gs-soft.com/MilX")
  );
}
