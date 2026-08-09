import type { GeoLibreLayer } from "@geolibre/core";

interface LayerSwatchIconProps {
  layer: GeoLibreLayer;
}

/**
 * Layer swatch shim for reduced web-only builds.
 */
export function LayerSwatchIcon(_props: LayerSwatchIconProps) {
  return null;
}
