import type { FeatureCollection } from "geojson";

export interface GeotaggedPhotoResult {
  located: number;
  skipped: number;
  featureCollection: FeatureCollection;
}

/**
 * Returns true for common photo file names.
 */
export function isPhotoDropFileName(name: string): boolean {
  return /\.(jpe?g|png|webp|heic|heif|tiff?)$/i.test(name);
}
