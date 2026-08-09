import type { GeoLibreLayer } from "@geolibre/core";

/**
 * Raster subset export availability shim.
 */
export function canExtractRasterSubset(_layer: GeoLibreLayer): boolean {
  return false;
}
