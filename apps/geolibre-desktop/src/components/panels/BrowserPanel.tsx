import type { MapController } from "@geolibre/map";
import type { RefObject } from "react";

interface BrowserPanelProps {
  mapControllerRef: RefObject<MapController | null>;
  onOpenRecentProject: (path?: string) => Promise<void> | void;
  onAddFilePath: (path: string) => Promise<string | null>;
}

/**
 * Browser panel shim for web-only builds.
 */
export function BrowserPanel(_props: BrowserPanelProps) {
  return null;
}
