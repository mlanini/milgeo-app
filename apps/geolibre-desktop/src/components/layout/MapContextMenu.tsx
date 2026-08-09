import type { MapController } from "@geolibre/map";
import type { RefObject } from "react";

interface MapContextMenuProps {
  mapControllerRef: RefObject<MapController | null>;
  mapReadyGeneration: number;
  onExplorePlace: (lat: number, lng: number) => void;
}

/**
 * Optional context-menu shim for web-only builds.
 */
export function MapContextMenu(_props: MapContextMenuProps) {
  return null;
}
