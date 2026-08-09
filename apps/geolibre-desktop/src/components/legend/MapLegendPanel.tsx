import type { MapController } from "@geolibre/map";
import type { RefObject } from "react";

interface MapLegendPanelProps {
  mapControllerRef: RefObject<MapController | null>;
  mapReadyGeneration: number;
}

/**
 * Legend panel shim for web-only builds.
 */
export function MapLegendPanel(_props: MapLegendPanelProps) {
  return null;
}
