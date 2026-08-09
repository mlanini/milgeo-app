import type { MapController } from "@geolibre/map";
import type { RefObject } from "react";

/**
 * Web-only shim: Jupyter relay integration is not bundled here.
 */
export function useJupyterRelay(_mapControllerRef: RefObject<MapController | null>): void {
  // No-op.
}
