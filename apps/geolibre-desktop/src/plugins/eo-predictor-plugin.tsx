import type { GeoLibreAppAPI, GeoLibrePlugin } from "@geolibre/plugins";
import { createRoot } from "react-dom/client";
import { EoPredictorPanel, clearEoPredictorArtifacts } from "../components/panels/EoPredictorPanel";

export const EO_PREDICTOR_PLUGIN_ID = "eo-predictor";

interface EoPredictorPluginState {
  open?: boolean;
}

export function createEoPredictorPlugin(): GeoLibrePlugin {
  let unregisterPanel: (() => void) | undefined;
  let panelCleanup: (() => void) | undefined;
  let shouldOpenAfterActivate = false;
  let isPanelOpen = false;

  function cleanupPanel(): void {
    panelCleanup?.();
    panelCleanup = undefined;
  }

  return {
    id: EO_PREDICTOR_PLUGIN_ID,
    name: "EO Predictor",
    version: "0.1.0",
    activeByDefault: false,
    activate(app: GeoLibreAppAPI) {
      if (unregisterPanel) return;
      unregisterPanel = app.registerRightPanel?.({
        id: EO_PREDICTOR_PLUGIN_ID,
        title: "EO Predictor",
        dock: "right-of-style",
        defaultWidth: 380,
        onOpen: () => {
          isPanelOpen = true;
          shouldOpenAfterActivate = true;
        },
        onClose: () => {
          isPanelOpen = false;
          shouldOpenAfterActivate = false;
        },
        render(container: HTMLElement) {
          cleanupPanel();
          const root = createRoot(container);
          root.render(<EoPredictorPanel app={app} />);

          let disposed = false;
          const cleanupCurrentRoot = () => {
            if (disposed) return;
            disposed = true;
            root.unmount();
            if (panelCleanup === cleanupCurrentRoot) {
              panelCleanup = undefined;
            }
          };
          panelCleanup = cleanupCurrentRoot;
          return () => {
            cleanupCurrentRoot();
          };
        },
      });

      if (shouldOpenAfterActivate) {
        app.openRightPanel?.(EO_PREDICTOR_PLUGIN_ID);
      }
    },
    deactivate(app: GeoLibreAppAPI) {
      cleanupPanel();
      unregisterPanel?.();
      unregisterPanel = undefined;
      shouldOpenAfterActivate = false;
      isPanelOpen = false;
      app.closeRightPanel?.(EO_PREDICTOR_PLUGIN_ID);
      clearEoPredictorArtifacts(app.getMap?.() ?? null);
    },
    getProjectState() {
      if (!shouldOpenAfterActivate && !isPanelOpen) return undefined;
      return { open: true } satisfies EoPredictorPluginState;
    },
    applyProjectState(_app: GeoLibreAppAPI, state: unknown) {
      const nextOpen =
        state === undefined ? false : (state as EoPredictorPluginState | undefined)?.open === true;
      const changed = shouldOpenAfterActivate !== nextOpen;
      shouldOpenAfterActivate = nextOpen;
      return changed;
    },
  };
}

export const eoPredictorPlugin = createEoPredictorPlugin();

export function restoreEoPredictorPlugin(app: GeoLibreAppAPI, active: boolean): void {
  if (active) {
    eoPredictorPlugin.activate(app);
    return;
  }
  eoPredictorPlugin.deactivate(app);
}
