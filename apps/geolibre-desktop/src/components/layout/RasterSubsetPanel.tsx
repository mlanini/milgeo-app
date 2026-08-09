import type { GeoLibreLayer } from "@geolibre/core";
import type { MapController } from "@geolibre/map";
import type { RefObject } from "react";

interface RasterSubsetPanelProps {
  layer: GeoLibreLayer | null;
  onClose: () => void;
  mapControllerRef: RefObject<MapController | null>;
}

/**
 * Optional panel shim for web-only builds.
 */
export function RasterSubsetPanel(_props: RasterSubsetPanelProps) {
  return null;
}
