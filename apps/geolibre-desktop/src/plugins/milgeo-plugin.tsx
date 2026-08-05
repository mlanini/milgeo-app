import type { GeoLibreAppAPI, GeoLibrePlugin } from "@geolibre/plugins";
import { createRoot } from "react-dom/client";
import { MilLayerPanel } from "../components/panels/MilLayerPanel";
import { useMapControllerRef } from "../contexts/map-controller-context";
import MilSymbolRenderer from "../components/map/MilSymbolRenderer";

export const MILGEO_PLUGIN_ID = "milgeo-workspace";

interface MilGeoPluginState {
  open?: boolean;
}

function buildSampleSillage(center: { lng: number; lat: number }) {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: [
            [center.lng - 0.03, center.lat - 0.01],
            [center.lng + 0.02, center.lat + 0.02],
            [center.lng + 0.05, center.lat - 0.01],
          ],
        },
        properties: {
          name: "Sample sillage corridor",
          description: "Illustrative operational corridor for plugin-driven analysis.",
        },
      },
    ],
  };
}

function MilGeoWorkspacePanelContent({ app }: { app: GeoLibreAppAPI }) {
  const mapControllerRef = useMapControllerRef();

  const handleCreateSillage = () => {
    const map = app.getMap?.();
    if (!map) return;
    const center = map.getCenter();
    app.addGeoJsonLayer?.("Sillage corridor", buildSampleSillage(center));
  };

  const handleEnableTerrain = () => {
    app.setBuiltInMapControlVisible?.("terrain", true);
    app.setBuiltInMapControlPosition?.("terrain", "top-right");
  };

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3">
      <div className="hidden">
        <MilSymbolRenderer mapControllerRef={mapControllerRef} />
      </div>
      <div className="rounded-md border bg-background/80 p-3 text-xs">
        <div className="font-semibold">MilGeo workspace</div>
        <p className="mt-1 text-muted-foreground">
          This plugin hosts the military symbol workspace, sillage sketching, and
          terrain-analysis entry points as a decoupled GeoLibre extension.
        </p>
      </div>
      <div className="rounded-md border bg-background/80 p-3 text-xs">
        <div className="font-semibold">Sillages</div>
        <p className="mt-1 text-muted-foreground">
          Create a sample corridor layer to test the plugin-based sillage workflow.
        </p>
        <button
          className="mt-2 rounded border px-2 py-1 text-left"
          onClick={handleCreateSillage}
          type="button"
        >
          Add sample sillage layer
        </button>
      </div>
      <div className="rounded-md border bg-background/80 p-3 text-xs">
        <div className="font-semibold">Terrain analysis</div>
        <p className="mt-1 text-muted-foreground">
          Enable terrain controls from the plugin without pulling them into the core app.
        </p>
        <button
          className="mt-2 rounded border px-2 py-1 text-left"
          onClick={handleEnableTerrain}
          type="button"
        >
          Enable terrain control
        </button>
      </div>
      <div className="min-h-0 flex-1 rounded-md border bg-background/80 p-2">
        <MilLayerPanel mapControllerRef={mapControllerRef} />
      </div>
    </div>
  );
}

export function createMilGeoPlugin(): GeoLibrePlugin {
  let unregisterPanel: (() => void) | undefined;
  let panelContentCleanup: (() => void) | undefined;
  let shouldOpenAfterActivate = true;
  let isPanelOpen = false;

  return {
    id: MILGEO_PLUGIN_ID,
    name: "MilGeo workspace",
    version: "1.0.0",
    activeByDefault: false,
    activate(app: GeoLibreAppAPI) {
      if (unregisterPanel) return;
      unregisterPanel = app.registerRightPanel?.({
        id: MILGEO_PLUGIN_ID,
        title: "MilGeo workspace",
        dock: "right-of-style",
        defaultWidth: 360,
        onOpen: () => {
          isPanelOpen = true;
          shouldOpenAfterActivate = true;
        },
        onClose: () => {
          isPanelOpen = false;
          shouldOpenAfterActivate = false;
        },
        render(container) {
          panelContentCleanup?.();
          const root = createRoot(container);
          root.render(<MilGeoWorkspacePanelContent app={app} />);
          panelContentCleanup = () => root.unmount();
          return () => {
            panelContentCleanup?.();
            panelContentCleanup = undefined;
          };
        },
      });
      if (shouldOpenAfterActivate) {
        app.openRightPanel?.(MILGEO_PLUGIN_ID);
      }
    },
    deactivate(app: GeoLibreAppAPI) {
      panelContentCleanup?.();
      panelContentCleanup = undefined;
      unregisterPanel?.();
      unregisterPanel = undefined;
      shouldOpenAfterActivate = false;
      isPanelOpen = false;
      app.closeRightPanel?.(MILGEO_PLUGIN_ID);
    },
    getProjectState() {
      if (!shouldOpenAfterActivate && !isPanelOpen) return undefined;
      return { open: true } satisfies MilGeoPluginState;
    },
    applyProjectState(_app: GeoLibreAppAPI, state: unknown) {
      const nextOpen =
        state === undefined ? true : (state as MilGeoPluginState | undefined)?.open === true;
      const changed = shouldOpenAfterActivate !== nextOpen;
      shouldOpenAfterActivate = nextOpen;
      return changed;
    },
  };
}

export const milgeoPlugin = createMilGeoPlugin();
