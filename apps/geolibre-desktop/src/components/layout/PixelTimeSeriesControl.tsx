import type { MapController } from "@geolibre/map";
import type { RefObject } from "react";

interface PixelTimeSeriesControlProps {
  mapControllerRef: RefObject<MapController | null>;
}

/**
 * Optional map control shim for web-only builds.
 */
export function PixelTimeSeriesControl(_props: PixelTimeSeriesControlProps) {
  return null;
}
