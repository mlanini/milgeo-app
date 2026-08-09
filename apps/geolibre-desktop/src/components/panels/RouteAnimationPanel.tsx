import type { MapController } from "@geolibre/map";
import type { RefObject } from "react";

interface RouteAnimationPanelProps {
  mapControllerRef: RefObject<MapController | null>;
}

/**
 * Route animation panel shim for web-only builds.
 */
export function RouteAnimationPanel(_props: RouteAnimationPanelProps) {
  return null;
}
