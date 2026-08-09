import type { MapController } from "@geolibre/map";
import type { RefObject } from "react";

interface BasemapExtractPanelProps {
  open: boolean;
  onClose: () => void;
  mapControllerRef: RefObject<MapController | null>;
}

/**
 * Optional panel shim for web-only builds.
 */
export function BasemapExtractPanel(_props: BasemapExtractPanelProps) {
  return null;
}
