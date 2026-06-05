import type { FeatureCollection, Feature, Point, LineString, Polygon } from "geojson";
import type { GeoLibreLayer, MilAffiliation } from "@geolibre/core";
import { DEFAULT_LAYER_STYLE } from "@geolibre/core";
import ms from "milsymbol";

const MilSymbol = ms.Symbol;

// ─── SIDC field lookup ────────────────────────────────────────────────────────

/** Property names tried in order when looking for the SIDC in a GeoJSON feature. */
const SIDC_FIELDS = ["SIDC", "sidc", "app6d", "APP6D", "symbol_id", "milsymbol"];

function extractSIDC(props: Record<string, unknown>): string | null {
  for (const field of SIDC_FIELDS) {
    const val = props[field];
    if (typeof val === "string" && val.length >= 10) return val.toUpperCase();
  }
  return null;
}

function inferAffiliation(sidc: string): MilAffiliation {
  // Char at index 3 = affiliation digit in number-based SIDC
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

// ─── GeoJSON import ───────────────────────────────────────────────────────────

/**
 * Parses a GeoJSON FeatureCollection and returns mil-symbol / mil-graphic
 * GeoLibreLayer objects for any feature that carries a valid SIDC property.
 *
 * - Point features → LayerType "mil-symbol"
 * - LineString / Polygon features → LayerType "mil-graphic"
 *
 * Features without a recognisable SIDC are silently skipped.
 */
export function importMilSymbolsFromGeoJSON(
  fc: FeatureCollection,
  sourceName = "Imported MilSymbols",
): GeoLibreLayer[] {
  const layers: GeoLibreLayer[] = [];

  for (const feature of fc.features) {
    const props = (feature.properties ?? {}) as Record<string, unknown>;
    const sidc = extractSIDC(props);
    if (!sidc || !isValidSIDC(sidc)) continue;

    const id = (props["id"] as string | undefined) ?? crypto.randomUUID();
    const name = (props["name"] as string | undefined) ??
      (props["uniqueDesignation"] as string | undefined) ??
      (props["label"] as string | undefined) ??
      sidc.slice(0, 8);
    const affiliation = inferAffiliation(sidc);

    const geom = feature.geometry;

    if (geom?.type === "Point") {
      const [lon, lat] = (geom as Point).coordinates;
      layers.push({
        id,
        name: `${sourceName} – ${name}`,
        type: "mil-symbol",
        visible: true,
        opacity: 1,
        style: { ...DEFAULT_LAYER_STYLE },
        metadata: {},
        source: {
          SIDC: sidc,
          lon,
          lat,
          affiliation,
          uniqueDesignation: props["uniqueDesignation"] as string | undefined,
          higherFormation: props["higherFormation"] as string | undefined,
          additionalInfo: props["additionalInfo"] as string | undefined,
          direction: props["direction"] as number | undefined,
          speed: props["speed"] as string | undefined,
        },
      });
    } else if (geom?.type === "LineString" || geom?.type === "Polygon") {
      const rawCoords =
        geom.type === "LineString"
          ? (geom as LineString).coordinates
          : (geom as Polygon).coordinates[0];
      const coordinates = rawCoords as [number, number][];

      layers.push({
        id,
        name: `${sourceName} – ${name}`,
        type: "mil-graphic",
        visible: true,
        opacity: 1,
        style: { ...DEFAULT_LAYER_STYLE },
        metadata: {},
        source: {
          SIDC: sidc,
          geometryType: geom.type as "LineString" | "Polygon",
          coordinates,
          affiliation,
          uniqueDesignation: props["uniqueDesignation"] as string | undefined,
          additionalInfo: props["additionalInfo"] as string | undefined,
        },
      });
    }
  }

  return layers;
}

// ─── KML import ───────────────────────────────────────────────────────────────

/**
 * Parses a KML string and returns mil-symbol / mil-graphic layers for any
 * Placemark that carries a SIDC in its ExtendedData.
 *
 * Looks for `<Data name="SIDC">` or `<Data name="sidc">` in ExtendedData.
 * Only supports Point, LineString and Polygon geometries.
 */
export function importMilSymbolsFromKML(
  kmlString: string,
  sourceName = "KML MilSymbols",
): GeoLibreLayer[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(kmlString, "application/xml");

  if (doc.querySelector("parsererror")) {
    throw new Error("Invalid KML: XML parse error");
  }

  const placemarks = Array.from(doc.querySelectorAll("Placemark"));
  const fc: FeatureCollection = { type: "FeatureCollection", features: [] };

  for (const pm of placemarks) {
    // Extract properties from ExtendedData
    const props: Record<string, unknown> = {};
    const nameEl = pm.querySelector("name");
    if (nameEl) props["name"] = nameEl.textContent?.trim();

    const extendedData = pm.querySelector("ExtendedData");
    if (extendedData) {
      for (const dataEl of Array.from(extendedData.querySelectorAll("Data"))) {
        const key = dataEl.getAttribute("name") ?? "";
        const val = dataEl.querySelector("value")?.textContent?.trim() ?? "";
        if (key) props[key] = val;
      }
    }

    // Geometry
    const pointEl = pm.querySelector("Point > coordinates");
    if (pointEl) {
      const [lonStr, latStr] = (pointEl.textContent?.trim() ?? "").split(",");
      const lon = parseFloat(lonStr);
      const lat = parseFloat(latStr);
      if (!isNaN(lon) && !isNaN(lat)) {
        const feature: Feature<Point> = {
          type: "Feature",
          geometry: { type: "Point", coordinates: [lon, lat] },
          properties: props,
        };
        fc.features.push(feature);
      }
      continue;
    }

    const lineEl = pm.querySelector("LineString > coordinates");
    if (lineEl) {
      const coords = parseKMLCoordinates(lineEl.textContent ?? "");
      if (coords.length >= 2) {
        const feature: Feature<LineString> = {
          type: "Feature",
          geometry: { type: "LineString", coordinates: coords },
          properties: props,
        };
        fc.features.push(feature);
      }
      continue;
    }

    const polyEl = pm.querySelector("Polygon outerBoundaryIs coordinates");
    if (polyEl) {
      const coords = parseKMLCoordinates(polyEl.textContent ?? "");
      if (coords.length >= 3) {
        const feature: Feature<Polygon> = {
          type: "Feature",
          geometry: { type: "Polygon", coordinates: [coords] },
          properties: props,
        };
        fc.features.push(feature);
      }
    }
  }

  return importMilSymbolsFromGeoJSON(fc, sourceName);
}

function parseKMLCoordinates(raw: string): [number, number][] {
  return raw
    .trim()
    .split(/\s+/)
    .map((s) => {
      const [lon, lat] = s.split(",").map(parseFloat);
      return [lon, lat] as [number, number];
    })
    .filter(([lon, lat]) => !isNaN(lon) && !isNaN(lat));
}
