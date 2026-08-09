import type { MapController } from "@geolibre/map";
import type { RefObject } from "react";

interface TerrainSettingsDialogProps {
  mapControllerRef: RefObject<MapController | null>;
}

/**
 * Optional dialog shim for web-only builds.
 */
export function TerrainSettingsDialog(_props: TerrainSettingsDialogProps) {
  return null;
}
