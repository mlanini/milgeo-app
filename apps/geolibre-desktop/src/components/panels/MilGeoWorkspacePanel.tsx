import type { MapController } from "@geolibre/map";
import { Button, cn } from "@geolibre/ui";
import {
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Activity, PanelRightClose, Shield } from "lucide-react";
import { AnalysisPanel } from "../analysis/AnalysisPanel";
import { MilLayerPanel } from "./MilLayerPanel";

type MilGeoTab = "milsymbols" | "dtm";

interface MilGeoWorkspacePanelProps {
  mapControllerRef: RefObject<MapController | null>;
  onResizeStart: (event: ReactPointerEvent<HTMLDivElement>) => void;
  milSymbolsEnabled: boolean;
  dtmAnalysisEnabled: boolean;
  onClose: () => void;
}

export function MilGeoWorkspacePanel({
  mapControllerRef,
  onResizeStart,
  milSymbolsEnabled,
  dtmAnalysisEnabled,
  onClose,
}: MilGeoWorkspacePanelProps) {
  const enabledTabs = useMemo(() => {
    const tabs: MilGeoTab[] = [];
    if (milSymbolsEnabled) tabs.push("milsymbols");
    if (dtmAnalysisEnabled) tabs.push("dtm");
    return tabs;
  }, [milSymbolsEnabled, dtmAnalysisEnabled]);

  const [activeTab, setActiveTab] = useState<MilGeoTab>(
    milSymbolsEnabled ? "milsymbols" : "dtm",
  );

  useEffect(() => {
    if (enabledTabs.length === 0) return;
    if (!enabledTabs.includes(activeTab)) {
      setActiveTab(enabledTabs[0]);
    }
  }, [activeTab, enabledTabs]);

  return (
    <aside className="relative flex max-h-[min(24rem,42vh)] supports-[max-height:1dvh]:max-h-[min(24rem,42dvh)] w-full shrink-0 flex-col border-t bg-card max-md:absolute max-md:inset-x-0 max-md:bottom-0 max-md:z-30 max-md:shadow-xl md:max-h-none md:w-[var(--milgeo-panel-width)] md:border-l md:border-t-0">
      <div
        role="separator"
        aria-orientation="vertical"
        className="absolute left-0 top-0 hidden h-full w-2 -translate-x-1 cursor-col-resize md:block"
        onPointerDown={onResizeStart}
      />

      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
        <Shield className="h-4 w-4 text-primary" />
        <span className="flex-1 text-sm font-semibold">MilGeo workspace</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onClose}
          aria-label="Close MilGeo workspace"
        >
          <PanelRightClose className="h-4 w-4" />
        </Button>
      </div>

      {enabledTabs.length > 1 ? (
        <div className="flex shrink-0 gap-1 border-b px-2 py-1.5">
          <button
            type="button"
            className={cn(
              "rounded px-2 py-1 text-xs font-medium",
              activeTab === "milsymbols"
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-accent",
            )}
            onClick={() => setActiveTab("milsymbols")}
          >
            MILSymbols
          </button>
          <button
            type="button"
            className={cn(
              "rounded px-2 py-1 text-xs font-medium",
              activeTab === "dtm"
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-accent",
            )}
            onClick={() => setActiveTab("dtm")}
          >
            <span className="inline-flex items-center gap-1">
              <Activity className="h-3.5 w-3.5" />
              DTM Analysis
            </span>
          </button>
        </div>
      ) : null}

      <div className="min-h-0 flex-1">
        {enabledTabs.length === 0 ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-xs text-muted-foreground">
            Enable at least one MilGeo module from the MilGeo top menu.
          </div>
        ) : activeTab === "milsymbols" ? (
          <MilLayerPanel mapControllerRef={mapControllerRef} />
        ) : (
          <AnalysisPanel embedded mapControllerRef={mapControllerRef} />
        )}
      </div>
    </aside>
  );
}
