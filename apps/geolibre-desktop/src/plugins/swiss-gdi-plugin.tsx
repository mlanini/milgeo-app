import type {
  GeoLibreAppAPI,
  GeoLibreLayerDraft,
  GeoLibreMapControlPosition,
  GeoLibrePlugin,
} from "@geolibre/plugins";
import type { IControl, Map as MapLibreMap } from "maplibre-gl";
import {
  buildSwissGdiCapabilitiesUrl,
  buildSwissGdiLegendGraphicUrl,
  buildSwissGdiWmtsTileUrl,
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

const CONTROL_ID = SWISS_GDI_PLUGIN_ID;
const CONTROL_TITLE = "Swiss GDI";
const CONTROL_DESCRIPTION =
  "Browse geo.admin.ch WMTS services and add them as raster layers.";

interface SwissGdiViewState {
  language: SwissGdiLanguage;
  search: string;
  loading: boolean;
  error: string | null;
  catalog: SwissGdiCatalogLayer[];
  legendLayerName: string | null;
  legendLanguage: SwissGdiLanguage;
}

interface SwissGdiStoreLayer {
  id: string;
  name: string;
  source: Record<string, unknown>;
  metadata: Record<string, unknown>;
  type?: string;
}

let swissGdiPosition: GeoLibreMapControlPosition = "top-left";

function createLayerId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isSwissGdiLayer(layer: unknown): layer is SwissGdiStoreLayer {
  if (!layer || typeof layer !== "object") return false;
  const candidate = layer as Partial<SwissGdiStoreLayer>;
  return (
    (candidate.type === "wmts" || candidate.type === "wms") &&
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.source === "object" &&
    candidate.source !== null &&
    typeof candidate.metadata === "object" &&
    candidate.metadata !== null &&
    (candidate.metadata as Record<string, unknown>).swissGdi === true
  );
}

function swissGdiLayers(app: GeoLibreAppAPI): SwissGdiStoreLayer[] {
  return (app.getLayers?.() ?? []).filter(isSwissGdiLayer);
}

function swissGdiLayerName(layer: SwissGdiStoreLayer): string {
  const metadataLayer =
    typeof layer.metadata.swissGdiLayerName === "string"
      ? layer.metadata.swissGdiLayerName
      : null;
  if (metadataLayer) return metadataLayer;
  const sourceLayer =
    typeof layer.source.layer === "string"
      ? layer.source.layer
      : typeof layer.source.layers === "string"
        ? layer.source.layers
        : null;
  return sourceLayer ?? layer.name;
}

function createSwissGdiLayerDraft(
  catalogLayer: SwissGdiCatalogLayer,
  language: SwissGdiLanguage,
): GeoLibreLayerDraft {
  const tileSize = 256;
  const tileUrl = buildSwissGdiWmtsTileUrl(catalogLayer, language);
  return {
    id: createLayerId(),
    name: catalogLayer.title,
    type: "wmts",
    source: {
      type: "raster",
      tiles: [tileUrl],
      tileSize,
      layer: catalogLayer.name,
      lang: language,
      ...(catalogLayer.format ? { format: catalogLayer.format } : {}),
      ...(catalogLayer.tileMatrixSet
        ? { tileMatrixSet: catalogLayer.tileMatrixSet }
        : {}),
    },
    metadata: {
      service: "wmts",
      sourceName: "Swiss GDI",
      swissGdi: true,
      swissGdiLang: language,
      swissGdiLayerName: catalogLayer.name,
    },
  };
}

function inlineButtonStyle(variant: "default" | "outline" | "ghost" = "outline") {
  if (variant === "default") {
    return {
      border: "1px solid hsl(var(--primary))",
      background: "hsl(var(--primary))",
      color: "hsl(var(--primary-foreground))",
    };
  }
  if (variant === "ghost") {
    return {
      border: "1px solid transparent",
      background: "transparent",
      color: "hsl(var(--foreground))",
    };
  }
  return {
    border: "1px solid hsl(var(--border))",
    background: "hsl(var(--background))",
    color: "hsl(var(--foreground))",
  };
}

function createButton(
  label: string,
  onClick: () => void,
  variant: "default" | "outline" | "ghost" = "outline",
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.onclick = onClick;
  Object.assign(
    button.style,
    {
      padding: "0.35rem 0.65rem",
      borderRadius: "0.5rem",
      fontSize: "0.75rem",
      lineHeight: "1rem",
      cursor: "pointer",
    },
    inlineButtonStyle(variant),
  );
  return button;
}

function createSectionCard(): HTMLDivElement {
  const card = document.createElement("div");
  Object.assign(card.style, {
    border: "1px solid hsl(var(--border))",
    borderRadius: "0.75rem",
    background: "hsl(var(--background))",
    padding: "0.75rem",
  });
  return card;
}

function createSwissGdiPanel(app: GeoLibreAppAPI, container: HTMLElement) {
  let alive = true;
  let requestId = 0;
  const state: SwissGdiViewState = {
    language: defaultSwissGdiLanguage(),
    search: "",
    loading: true,
    error: null,
    catalog: [],
    legendLayerName: null,
    legendLanguage: defaultSwissGdiLanguage(),
  };

  const render = () => {
    if (!alive) return;
    const activeLayers = swissGdiLayers(app);
    const target = state.search.trim().toLowerCase();
    const filteredCatalog = (target
      ? state.catalog.filter((layer) => {
          const haystack =
            `${layer.name} ${layer.title} ${layer.abstract ?? ""}`.toLowerCase();
          return haystack.includes(target);
        })
      : state.catalog
    ).slice(0, 200);

    container.replaceChildren();
    Object.assign(container.style, {
      display: "flex",
      flexDirection: "column",
      gap: "0.75rem",
      height: "100%",
      minHeight: "0",
      overflow: "hidden",
      padding: "0.75rem",
      fontSize: "0.875rem",
      color: "hsl(var(--foreground))",
      background: "hsl(var(--background))",
    });

    const intro = createSectionCard();
    const title = document.createElement("div");
    title.textContent = CONTROL_TITLE;
    Object.assign(title.style, { fontWeight: "600", fontSize: "0.95rem" });
    const description = document.createElement("p");
    description.textContent = CONTROL_DESCRIPTION;
    Object.assign(description.style, {
      margin: "0.35rem 0 0",
      fontSize: "0.75rem",
      color: "hsl(var(--muted-foreground))",
    });
    const docsRow = document.createElement("div");
    Object.assign(docsRow.style, {
      marginTop: "0.75rem",
      display: "flex",
      gap: "0.5rem",
    });
    docsRow.appendChild(
      createButton("Open docs", () => {
        window.open(SWISS_GDI_DOCS_URL, "_blank", "noopener,noreferrer");
      }),
    );
    intro.append(title, description, docsRow);
    container.appendChild(intro);

    const filters = createSectionCard();
    Object.assign(filters.style, { display: "grid", gap: "0.75rem" });
    const languageLabel = document.createElement("label");
    languageLabel.textContent = "Language";
    Object.assign(languageLabel.style, {
      fontSize: "0.75rem",
      color: "hsl(var(--muted-foreground))",
    });
    const languageSelect = document.createElement("select");
    for (const value of ["de", "fr", "it", "rm", "en"] satisfies SwissGdiLanguage[]) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent =
        value === "de"
          ? "Deutsch"
          : value === "fr"
            ? "Francais"
            : value === "it"
              ? "Italiano"
              : value === "rm"
                ? "Rumantsch"
                : "English";
      if (value === state.language) option.selected = true;
      languageSelect.appendChild(option);
    }
    Object.assign(languageSelect.style, {
      width: "100%",
      padding: "0.45rem 0.55rem",
      border: "1px solid hsl(var(--border))",
      borderRadius: "0.5rem",
      background: "hsl(var(--background))",
      color: "hsl(var(--foreground))",
    });
    languageSelect.onchange = () => {
      state.language = normalizeSwissGdiLanguage(languageSelect.value);
      loadCatalog();
    };

    const searchLabel = document.createElement("label");
    searchLabel.textContent = "Search services";
    Object.assign(searchLabel.style, {
      fontSize: "0.75rem",
      color: "hsl(var(--muted-foreground))",
    });
    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.value = state.search;
    searchInput.placeholder = "Layer id, title, or abstract";
    Object.assign(searchInput.style, {
      width: "100%",
      padding: "0.45rem 0.55rem",
      border: "1px solid hsl(var(--border))",
      borderRadius: "0.5rem",
      background: "hsl(var(--background))",
      color: "hsl(var(--foreground))",
    });
    searchInput.oninput = () => {
      state.search = searchInput.value;
      render();
    };

    filters.append(languageLabel, languageSelect, searchLabel, searchInput);
    container.appendChild(filters);

    const statusRow = document.createElement("div");
    Object.assign(statusRow.style, {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "0.75rem",
      fontSize: "0.75rem",
      color: "hsl(var(--muted-foreground))",
    });
    const statusText = document.createElement("span");
    statusText.textContent = state.loading
      ? "Loading services..."
      : `${filteredCatalog.length} of ${state.catalog.length} services shown`;
    statusRow.append(statusText, createButton("Refresh", () => loadCatalog(), "ghost"));
    container.appendChild(statusRow);

    if (activeLayers.length > 0) {
      const activeCard = createSectionCard();
      const activeTitle = document.createElement("div");
      activeTitle.textContent = "Active Swiss GDI layers";
      Object.assign(activeTitle.style, {
        marginBottom: "0.5rem",
        fontSize: "0.75rem",
        color: "hsl(var(--muted-foreground))",
        fontWeight: "600",
      });
      activeCard.appendChild(activeTitle);
      for (const layer of activeLayers) {
        const row = document.createElement("div");
        Object.assign(row.style, {
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          border: "1px solid hsl(var(--border))",
          borderRadius: "0.5rem",
          padding: "0.5rem",
          marginBottom: "0.5rem",
        });
        const text = document.createElement("div");
        Object.assign(text.style, { flex: "1 1 auto", minWidth: "0" });
        const name = document.createElement("div");
        name.textContent = layer.name;
        Object.assign(name.style, {
          fontWeight: "600",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        });
        const layerId = document.createElement("div");
        layerId.textContent = swissGdiLayerName(layer);
        Object.assign(layerId.style, {
          fontSize: "0.65rem",
          color: "hsl(var(--muted-foreground))",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        });
        text.append(name, layerId);
        row.appendChild(text);
        row.appendChild(
          createButton("Legend", () => {
            state.legendLayerName = swissGdiLayerName(layer);
            state.legendLanguage = normalizeSwissGdiLanguage(
              typeof layer.metadata.swissGdiLang === "string"
                ? String(layer.metadata.swissGdiLang)
                : state.language,
            );
            render();
          }),
        );
        row.appendChild(
          createButton(
            "Remove",
            () => {
              app.removeLayer?.(layer.id);
            },
            "ghost",
          ),
        );
        activeCard.appendChild(row);
      }
      container.appendChild(activeCard);
    }

    if (state.legendLayerName) {
      const legendCard = createSectionCard();
      const legendTitle = document.createElement("div");
      legendTitle.textContent = "Legend preview";
      Object.assign(legendTitle.style, {
        marginBottom: "0.5rem",
        fontSize: "0.75rem",
        color: "hsl(var(--muted-foreground))",
        fontWeight: "600",
      });
      const image = document.createElement("img");
      image.src = buildSwissGdiLegendGraphicUrl(
        state.legendLayerName,
        state.legendLanguage,
      );
      image.alt = "Swiss GDI legend preview";
      Object.assign(image.style, {
        maxHeight: "14rem",
        maxWidth: "100%",
        border: "1px solid hsl(var(--border))",
        borderRadius: "0.5rem",
        background: "white",
        objectFit: "contain",
      });
      legendCard.append(legendTitle, image);
      container.appendChild(legendCard);
    }

    if (state.error) {
      const errorCard = document.createElement("div");
      errorCard.textContent = `Could not load Swiss GDI capabilities: ${state.error}`;
      Object.assign(errorCard.style, {
        border: "1px solid hsl(var(--destructive))",
        borderRadius: "0.75rem",
        background: "hsl(var(--destructive) / 0.08)",
        color: "hsl(var(--destructive))",
        padding: "0.75rem",
        fontSize: "0.75rem",
      });
      container.appendChild(errorCard);
    }

    const catalogCard = createSectionCard();
    Object.assign(catalogCard.style, {
      flex: "1 1 auto",
      minHeight: "0",
      overflowY: "auto",
    });

    if (!state.loading && !state.error && filteredCatalog.length === 0) {
      const empty = document.createElement("div");
      empty.textContent = "No Swiss GDI services match the current search.";
      Object.assign(empty.style, {
        fontSize: "0.75rem",
        color: "hsl(var(--muted-foreground))",
      });
      catalogCard.appendChild(empty);
    }

    for (const layer of filteredCatalog) {
      const row = document.createElement("div");
      Object.assign(row.style, {
        display: "flex",
        alignItems: "flex-start",
        gap: "0.75rem",
        padding: "0.75rem 0",
        borderBottom: "1px solid hsl(var(--border))",
      });
      const body = document.createElement("div");
      Object.assign(body.style, { flex: "1 1 auto", minWidth: "0" });
      const rowTitle = document.createElement("div");
      rowTitle.textContent = layer.title;
      Object.assign(rowTitle.style, {
        fontWeight: "600",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      });
      const rowName = document.createElement("div");
      rowName.textContent = layer.name;
      Object.assign(rowName.style, {
        fontSize: "0.7rem",
        color: "hsl(var(--muted-foreground))",
        wordBreak: "break-all",
        marginTop: "0.2rem",
      });
      body.append(rowTitle, rowName);
      if (layer.abstract) {
        const abstract = document.createElement("p");
        abstract.textContent = layer.abstract;
        Object.assign(abstract.style, {
          margin: "0.4rem 0 0",
          fontSize: "0.75rem",
          color: "hsl(var(--muted-foreground))",
        });
        body.appendChild(abstract);
      }
      const actions = document.createElement("div");
      Object.assign(actions.style, {
        display: "flex",
        gap: "0.5rem",
        flexShrink: "0",
      });
      actions.appendChild(
        createButton("Legend", () => {
          state.legendLayerName = layer.name;
          state.legendLanguage = state.language;
          render();
        }),
      );
      actions.appendChild(
        createButton(
          "Add",
          () => {
            app.addLayer?.(createSwissGdiLayerDraft(layer, state.language));
            state.legendLayerName = layer.name;
            state.legendLanguage = state.language;
            render();
          },
          "default",
        ),
      );
      row.append(body, actions);
      catalogCard.appendChild(row);
    }
    container.appendChild(catalogCard);
  };

  const loadCatalog = () => {
    const currentRequest = ++requestId;
    state.loading = true;
    state.error = null;
    render();
    void fetch(buildSwissGdiCapabilitiesUrl(state.language))
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return parseSwissGdiCapabilities(await response.text());
      })
      .then((catalog) => {
        if (!alive || currentRequest !== requestId) return;
        state.catalog = catalog;
        state.loading = false;
        render();
      })
      .catch((error: unknown) => {
        if (!alive || currentRequest !== requestId) return;
        state.catalog = [];
        state.loading = false;
        state.error =
          error instanceof Error
            ? error.message
            : "Could not load Swiss GDI capabilities.";
        render();
      });
  };

  const disposeLayers = app.onLayersChange?.(() => render()) ?? (() => undefined);
  loadCatalog();
  render();

  return () => {
    alive = false;
    requestId += 1;
    disposeLayers();
    container.replaceChildren();
  };
}

class SwissGdiMapControl implements IControl {
  private app: GeoLibreAppAPI;
  private container: HTMLDivElement | null = null;
  private button: HTMLButtonElement | null = null;
  private panel: HTMLDivElement | null = null;
  private panelContentCleanup: (() => void) | null = null;
  private removeOutsideListener: (() => void) | null = null;
  private isOpen = false;

  constructor(app: GeoLibreAppAPI) {
    this.app = app;
  }

  onAdd(_map: MapLibreMap): HTMLElement {
    const root = document.createElement("div");
    root.className = "maplibregl-ctrl maplibregl-ctrl-group geolibre-swiss-gdi-control";
    Object.assign(root.style, { position: "relative" });

    const button = document.createElement("button");
    button.type = "button";
    button.className = "maplibregl-ctrl-icon";
    button.title = CONTROL_TITLE;
    button.setAttribute("aria-label", CONTROL_TITLE);
    button.setAttribute("aria-expanded", "false");
    button.textContent = "CH";
    Object.assign(button.style, {
      fontSize: "0.65rem",
      fontWeight: "700",
      letterSpacing: "0.02em",
    });

    const panel = document.createElement("div");
    Object.assign(panel.style, {
      position: "absolute",
      top: "calc(100% + 0.5rem)",
      left: "0",
      width: "min(24rem, calc(100vw - 2rem))",
      height: "min(38rem, 72vh)",
      borderRadius: "0.75rem",
      border: "1px solid hsl(var(--border))",
      boxShadow: "0 12px 30px rgba(0, 0, 0, 0.2)",
      overflow: "hidden",
      zIndex: "30",
      display: "none",
      background: "hsl(var(--background))",
    });

    this.container = root;
    this.button = button;
    this.panel = panel;
    this.panelContentCleanup = createSwissGdiPanel(this.app, panel);

    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.setOpen(!this.isOpen);
    });

    const onPointerDown = (event: PointerEvent) => {
      if (!this.isOpen || !this.container) return;
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!this.container.contains(target)) {
        this.setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    this.removeOutsideListener = () => {
      document.removeEventListener("pointerdown", onPointerDown);
    };

    root.append(button, panel);
    this.setOpen(this.isOpen);
    return root;
  }

  onRemove(): void {
    this.setOpen(false);
    this.removeOutsideListener?.();
    this.removeOutsideListener = null;
    this.panelContentCleanup?.();
    this.panelContentCleanup = null;
    this.container?.remove();
    this.container = null;
    this.button = null;
    this.panel = null;
  }

  setOpen(nextOpen: boolean): void {
    this.isOpen = nextOpen;
    if (this.button) {
      this.button.setAttribute("aria-expanded", nextOpen ? "true" : "false");
    }
    if (this.panel) {
      this.panel.style.display = nextOpen ? "block" : "none";
    }
  }

  getOpen(): boolean {
    return this.isOpen;
  }

  getDefaultPosition(): string {
    return swissGdiPosition;
  }
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

export function createSwissGdiPlugin(): GeoLibrePlugin {
  let control: SwissGdiMapControl | null = null;
  let shouldOpenAfterActivate = false;

  return {
    id: CONTROL_ID,
    name: CONTROL_TITLE,
    version: "1.1.0",
    activeByDefault: false,
    activate(app: GeoLibreAppAPI) {
      if (!control) {
        control = new SwissGdiMapControl(app);
      }
      const added = app.addMapControl(control, swissGdiPosition);
      if (!added) {
        control = null;
        return false;
      }
      control.setOpen(shouldOpenAfterActivate);
    },
    deactivate(app: GeoLibreAppAPI) {
      if (!control) return;
      shouldOpenAfterActivate = control.getOpen();
      app.removeMapControl(control);
      control = null;
    },
    getMapControlPosition: () => swissGdiPosition,
    setMapControlPosition: (
      app: GeoLibreAppAPI,
      position: GeoLibreMapControlPosition,
    ) => {
      swissGdiPosition = position;
      if (!control) return;
      const wasOpen = control.getOpen();
      app.removeMapControl(control);
      const added = app.addMapControl(control, swissGdiPosition);
      if (!added) {
        control = null;
        return false;
      }
      control.setOpen(wasOpen);
    },
    getProjectState() {
      const open = control?.getOpen() ?? shouldOpenAfterActivate;
      return open ? ({ open: true } satisfies SwissGdiPluginState) : undefined;
    },
    applyProjectState(_app: GeoLibreAppAPI, state: unknown) {
      const nextOpen =
        (state as SwissGdiPluginState | undefined)?.open === true;
      const changed = shouldOpenAfterActivate !== nextOpen;
      shouldOpenAfterActivate = nextOpen;
      if (control) {
        control.setOpen(nextOpen);
      }
      return changed;
    },
  };
}

export const swissGdiPlugin = createSwissGdiPlugin();
