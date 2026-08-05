import { useAppStore, type GeoLibreLayer } from "@geolibre/core";
import type { GeoLibreAppAPI, GeoLibrePlugin } from "@geolibre/plugins";
import { Button, Input, Select, cn } from "@geolibre/ui";
import { Crosshair, Globe, Layers, RefreshCcw, Search, Trash2 } from "lucide-react";
import { createRoot } from "react-dom/client";
import { useEffect, useMemo, useState } from "react";
import {
  createBaseLayer,
  createWmsTileUrl,
} from "../components/layout/add-data/helpers";
import {
  buildSwissGdiCapabilitiesUrl,
  buildSwissGdiLegendGraphicUrl,
  buildSwissGdiWmsEndpoint,
  normalizeSwissGdiLanguage,
  parseSwissGdiCapabilities,
  SWISS_GDI_DOCS_URL,
  SWISS_GDI_PLUGIN_ID,
  type SwissGdiCatalogLayer,
  type SwissGdiLanguage,
} from "../lib/swiss-gdi";

interface SwissGdiPluginState {
  open?: boolean;
}

function defaultSwissGdiLanguage(): SwissGdiLanguage {
  if (typeof document !== "undefined") {
    const htmlLang = document.documentElement.lang;
    if (htmlLang) return normalizeSwissGdiLanguage(htmlLang);
  }
  if (typeof navigator !== "undefined") {
    return normalizeSwissGdiLanguage(navigator.language);
  }
  return "en";
}

function SwissGdiPanelContent() {
  const addLayer = useAppStore((state) => state.addLayer);
  const removeLayer = useAppStore((state) => state.removeLayer);
  const identifyLayerId = useAppStore((state) => state.identifyLayerId);
  const setIdentifyLayer = useAppStore((state) => state.setIdentifyLayer);
  const swissGdiLayers = useAppStore((state) =>
    state.layers.filter(
      (layer) =>
        layer.type === "wms" &&
        layer.metadata.swissGdi === true &&
        typeof layer.source.layers === "string",
    ),
  );
  const [language, setLanguage] = useState<SwissGdiLanguage>(
    defaultSwissGdiLanguage,
  );
  const [reloadKey, setReloadKey] = useState(0);
  const [search, setSearch] = useState("");
  const [legendLayerName, setLegendLayerName] = useState<string | null>(null);
  const [legendLanguage, setLegendLanguage] = useState<SwissGdiLanguage>(
    defaultSwissGdiLanguage,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<SwissGdiCatalogLayer[]>([]);

  const activeLegendUrl =
    legendLayerName !== null
      ? buildSwissGdiLegendGraphicUrl(legendLayerName, legendLanguage)
      : null;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(buildSwissGdiCapabilitiesUrl(language))
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return parseSwissGdiCapabilities(await response.text());
      })
      .then((layers) => {
        if (cancelled) return;
        setCatalog(layers);
        setLoading(false);
      })
      .catch((fetchError: unknown) => {
        if (cancelled) return;
        setCatalog([]);
        setLoading(false);
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "Could not load Swiss GDI capabilities.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [language, reloadKey]);

  const filteredCatalog = useMemo(() => {
    const target = search.trim().toLowerCase();
    if (!target) return catalog.slice(0, 80);
    return catalog
      .filter((layer) => {
        const haystack = `${layer.name} ${layer.title} ${layer.abstract ?? ""}`.toLowerCase();
        return haystack.includes(target);
      })
      .slice(0, 80);
  }, [catalog, search]);

  const handleAddLayer = (layer: SwissGdiCatalogLayer) => {
    const endpoint = buildSwissGdiWmsEndpoint(language);
    const tileSize = 256;
    addLayer(
      createBaseLayer(
        layer.title,
        "wms",
        {
          type: "raster",
          tiles: [
            createWmsTileUrl({
              endpoint,
              layers: layer.name,
              styles: "default",
              format: "image/png",
              transparent: true,
              tileSize,
            }),
          ],
          tileSize,
          url: endpoint,
          layers: layer.name,
          styles: "default",
          format: "image/png",
          transparent: true,
          version: "1.3.0",
          infoFormat: "application/json",
          featureCount: 10,
          lang: language,
        },
        {
          service: "wms",
          sourceName: "Swiss GDI",
          swissGdi: true,
          swissGdiLang: language,
        },
      ),
    );
    setLegendLayerName(layer.name);
    setLegendLanguage(language);
  };

  const showLegendForCatalogLayer = (layer: SwissGdiCatalogLayer) => {
    setLegendLayerName(layer.name);
    setLegendLanguage(language);
  };

  const showLegendForActiveLayer = (layer: GeoLibreLayer) => {
    const layerName = typeof layer.source.layers === "string" ? layer.source.layers : null;
    if (!layerName) return;
    setLegendLayerName(layerName);
    setLegendLanguage(
      normalizeSwissGdiLanguage(
        typeof layer.source.lang === "string"
          ? layer.source.lang
          : typeof layer.metadata.swissGdiLang === "string"
            ? layer.metadata.swissGdiLang
            : language,
      ),
    );
  };

  const toggleIdentify = (layerId: string) => {
    setIdentifyLayer(identifyLayerId === layerId ? null : layerId);
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden p-3 text-sm">
      <div className="rounded-md border bg-background/80 p-3">
        <div className="flex items-center gap-2 font-semibold">
          <Globe className="h-4 w-4 text-primary" />
          Swiss GDI
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Browse official geo.admin.ch WMS layers and add them as tiled raster layers.
        </p>
        <div className="mt-3 flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            onClick={() => window.open(SWISS_GDI_DOCS_URL, "_blank", "noopener,noreferrer")}
          >
            Open docs
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-[7rem_1fr]">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Language</label>
          <Select
            value={language}
            onChange={(event) =>
              setLanguage(normalizeSwissGdiLanguage(event.target.value))
            }
          >
            <option value="de">Deutsch</option>
            <option value="fr">Francais</option>
            <option value="it">Italiano</option>
            <option value="rm">Rumantsch</option>
            <option value="en">English</option>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Search layers</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Layer id, title, or abstract"
              className="pl-7"
            />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {loading
            ? "Loading capabilities..."
            : `${filteredCatalog.length} of ${catalog.length} layers shown`}
        </span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 gap-1 px-2 text-xs"
          onClick={() => setReloadKey((current) => current + 1)}
        >
          <RefreshCcw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {swissGdiLayers.length > 0 ? (
        <div className="rounded-md border bg-background/80 p-3">
          <div className="mb-2 text-xs font-medium text-muted-foreground">
            Active Swiss GDI layers
          </div>
          <div className="space-y-2">
            {swissGdiLayers.map((layer) => {
              const inspectActive = identifyLayerId === layer.id;
              return (
                <div
                  key={layer.id}
                  className="flex items-center gap-2 rounded border px-2 py-2 text-xs"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{layer.name}</div>
                    <div className="truncate font-mono text-[10px] text-muted-foreground">
                      {typeof layer.source.layers === "string" ? layer.source.layers : ""}
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant={inspectActive ? "default" : "outline"}
                    className="h-7 px-2 text-xs"
                    onClick={() => toggleIdentify(layer.id)}
                  >
                    <Crosshair className="mr-1 h-3.5 w-3.5" />
                    {inspectActive ? "Identifying" : "Identify"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-xs"
                    onClick={() => showLegendForActiveLayer(layer)}
                  >
                    Legend
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => {
                      if (identifyLayerId === layer.id) setIdentifyLayer(null);
                      removeLayer(layer.id);
                    }}
                    aria-label={`Remove ${layer.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Click Identify, then click the map to issue a WMS GetFeatureInfo request for that layer.
          </p>
        </div>
      ) : null}

      {activeLegendUrl ? (
        <div className="rounded-md border bg-background/80 p-3">
          <div className="mb-2 text-xs font-medium text-muted-foreground">
            Legend preview
          </div>
          <img
            src={activeLegendUrl}
            alt="Swiss GDI legend preview"
            className="max-h-56 rounded border bg-white object-contain"
          />
        </div>
      ) : null}

      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
          Could not load Swiss GDI capabilities: {error}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto rounded-md border bg-background/80">
        <div className="divide-y">
          {filteredCatalog.map((layer) => (
            <div key={layer.name} className="flex items-start gap-3 p-3">
              <Layers className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{layer.title}</div>
                <div className="mt-0.5 break-all font-mono text-[11px] text-muted-foreground">
                  {layer.name}
                </div>
                {layer.abstract ? (
                  <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">
                    {layer.abstract}
                  </p>
                ) : null}
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className={cn("h-7 shrink-0 text-xs")}
                onClick={() => showLegendForCatalogLayer(layer)}
              >
                Legend
              </Button>
              <Button
                type="button"
                size="sm"
                className={cn("h-7 shrink-0 text-xs")}
                onClick={() => handleAddLayer(layer)}
              >
                Add
              </Button>
            </div>
          ))}
          {!loading && !error && filteredCatalog.length === 0 ? (
            <div className="p-4 text-xs text-muted-foreground">
              No Swiss GDI WMS layers match the current search.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function createSwissGdiPlugin(): GeoLibrePlugin {
  let unregisterPanel: (() => void) | undefined;
  let panelContentCleanup: (() => void) | undefined;
  let shouldOpenAfterActivate = true;
  let isPanelOpen = false;

  return {
    id: SWISS_GDI_PLUGIN_ID,
    name: "Swiss GDI",
    version: "1.0.0",
    activeByDefault: false,
    activate(app: GeoLibreAppAPI) {
      if (unregisterPanel) return;
      unregisterPanel = app.registerRightPanel?.({
        id: SWISS_GDI_PLUGIN_ID,
        title: "Swiss GDI",
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
        render(container) {
          panelContentCleanup?.();
          const root = createRoot(container);
          root.render(<SwissGdiPanelContent />);
          panelContentCleanup = () => root.unmount();
          return () => {
            panelContentCleanup?.();
            panelContentCleanup = undefined;
          };
        },
      });
      if (shouldOpenAfterActivate) {
        app.openRightPanel?.(SWISS_GDI_PLUGIN_ID);
      }
    },
    deactivate(app: GeoLibreAppAPI) {
      panelContentCleanup?.();
      panelContentCleanup = undefined;
      unregisterPanel?.();
      unregisterPanel = undefined;
      shouldOpenAfterActivate = false;
      isPanelOpen = false;
      app.closeRightPanel?.(SWISS_GDI_PLUGIN_ID);
    },
    getProjectState() {
      if (!shouldOpenAfterActivate && !isPanelOpen) return undefined;
      return { open: true } satisfies SwissGdiPluginState;
    },
    applyProjectState(_app: GeoLibreAppAPI, state: unknown) {
      const nextOpen =
        state === undefined
          ? true
          : (state as SwissGdiPluginState | undefined)?.open === true;
      const changed = shouldOpenAfterActivate !== nextOpen;
      shouldOpenAfterActivate = nextOpen;
      return changed;
    },
  };
}

export const swissGdiPlugin = createSwissGdiPlugin();