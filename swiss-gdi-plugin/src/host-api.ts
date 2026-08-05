export type GeoLibreLayerType = "wms" | "raster" | "geojson" | "wmts" | "xyz" | "vector-tiles" | "arcgis" | "pmtiles" | "mbtiles" | "zarr" | "lidar" | "gaussian-splat" | "3d-tiles" | "cog" | "flatgeobuf" | "geoparquet" | "duckdb-query" | "deckgl-viz" | "video" | "image" | "mil-symbol" | "mil-graphic";

export interface GeoLibreLayerDraft {
  id?: string;
  name: string;
  type: GeoLibreLayerType;
  source: Record<string, unknown>;
  visible?: boolean;
  opacity?: number;
  metadata?: Record<string, unknown>;
  sourcePath?: string;
}

export interface GeoLibreLayerRecord extends GeoLibreLayerDraft {
  id: string;
}

export interface GeoLibreRightPanelRegistration {
  id: string;
  title: string;
  dock?: "left-of-layers" | "right-of-layers" | "left-of-style" | "right-of-style" | "replace-style";
  defaultWidth?: number;
  onOpen?: () => void;
  onClose?: () => void;
  render: (container: HTMLElement) => void | (() => void);
}

export interface GeoLibrePluginState {
  open?: boolean;
}

export interface GeoLibreAppAPI {
  addLayer?: (layer: GeoLibreLayerDraft, beforeLayerId?: string | null) => string;
  removeLayer?: (id: string) => void;
  getLayers?: () => GeoLibreLayerRecord[];
  onLayersChange?: (callback: (layers: GeoLibreLayerRecord[]) => void) => () => void;
  getIdentifyLayerId?: () => string | null;
  onIdentifyLayerChange?: (callback: (id: string | null) => void) => () => void;
  setIdentifyLayer?: (id: string | null) => void;
  registerRightPanel?: (panel: GeoLibreRightPanelRegistration) => () => void;
  openRightPanel?: (id: string) => boolean;
  closeRightPanel?: (id: string) => void;
}

export interface GeoLibrePlugin {
  id: string;
  name: string;
  version: string;
  activate: (app: GeoLibreAppAPI) => boolean | void;
  deactivate: (app: GeoLibreAppAPI) => void;
  getProjectState?: () => unknown;
  applyProjectState?: (app: GeoLibreAppAPI, state: unknown) => boolean | void;
}
