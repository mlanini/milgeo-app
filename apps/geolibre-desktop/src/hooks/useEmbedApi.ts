import type { MapController } from "@geolibre/map";
import type { RefObject } from "react";

/**
 * Web-only shim: no embed API wiring in this repository variant.
 */
export function useEmbedApi(_mapControllerRef: RefObject<MapController | null>): void {
  // No-op.
}
