import type { GeoLibreAppAPI, GeoLibrePlugin } from "@geolibre/plugins";
import type { MapController } from "@geolibre/map";
import { useMemo, type RefObject } from "react";
import { createRoot } from "react-dom/client";
import { MilLayerPanel } from "../components/panels/MilLayerPanel";

export const MILGEO_PLUGIN_ID = "milgeo-workspace";

interface MilGeoPluginState {
  open?: boolean;
}

function MilGeoWorkspacePanelContent({ app }: { app: GeoLibreAppAPI }) {
  // The panel renders into its own React root (see `render()` below), which
  // is not part of the main app's React tree, so a React Context provided by
  // the host (e.g. a MapController context) can never reach it. The MilGeo
  // panels only ever call `.getMap()` on this ref, so a lightweight adapter
  // over the public `GeoLibreAppAPI.getMap()` is enough - no need for the
  // host's internal MapController instance.
  const mapControllerRef: RefObject<MapController | null> = useMemo(
    () => ({ current: { getMap: () => app.getMap?.() ?? null } as MapController }),
    [app],
  );

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3">
      <div className="rounded-md border bg-background/80 p-3 text-xs">
        <div className="font-semibold">MilGeo workspace</div>
        <p className="mt-1 text-muted-foreground">
          This plugin hosts the military symbol workspace as a decoupled GeoLibre
          extension.
        </p>
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
