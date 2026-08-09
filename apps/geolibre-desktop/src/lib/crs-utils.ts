import type { FeatureCollection } from "geojson";

/** True when a CRS token denotes lon/lat WGS84. */
export function isGeographicCrs(crs: string | null | undefined): boolean {
  const value = (crs ?? "").trim().toUpperCase();
  return value === "" || value === "EPSG:4326" || value === "CRS:84" || value === "OGC:CRS84";
}

/**
 * Best-effort extraction of a source CRS token from GeoJSON metadata.
 */
export function projectedGeoJsonCrs(geojson: FeatureCollection): string | null {
  const maybe = geojson as FeatureCollection & {
    crs?: { properties?: { name?: string } };
  };
  const name = maybe.crs?.properties?.name;
  return typeof name === "string" && name.trim() ? name.trim() : null;
}
