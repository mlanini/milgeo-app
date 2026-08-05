import type {
  GeoLibreAppAPI,
  GeoLibreLayerDraft,
  GeoLibreLayerRecord,
  GeoLibrePlugin,
  GeoLibrePluginState,
} from "./host-api";
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
} from "./swiss-gdi";

const PANEL_TITLE = "Swiss GDI";
const PANEL_DESCRIPTION =
  "Browse official geo.admin.ch WMS layers and add them as tiled raster layers.";

interface SwissGdiViewState {
  language: SwissGdiLanguage;
  search: string;
  loading: boolean;
  error: string | null;
  catalog: SwissGdiCatalogLayer[];
  legendLayerName: string | null;
  legendLanguage: SwissGdiLanguage;
}

function createLayerId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function appendQuery(endpoint: string, params: Array<[string, string]>): string {
  const separator = endpoint.includes("?")
    ? endpoint.endsWith("?") || endpoint.endsWith("&")
      ? ""
      : "&"
    : "?";
  const query = params
    .map(([key, value]) => {
      const encodedValue =
        value === "{bbox-epsg-3857}" ? value : encodeURIComponent(value);
      return `${encodeURIComponent(key)}=${encodedValue}`;
    })
    .join("&");
  return `${endpoint}${separator}${query}`;
}

function createWmsTileUrl(options: {
  endpoint: string;
  layers: string;
  styles: string;
  format: string;
  transparent: boolean;
  tileSize: number;
}): string {
  return appendQuery(options.endpoint, [
    ["SERVICE", "WMS"],
    ["REQUEST", "GetMap"],
    ["VERSION", "1.1.1"],
    ["LAYERS", options.layers],
    ["STYLES", options.styles],
    ["FORMAT", options.format],
    ["TRANSPARENT", options.transparent ? "TRUE" : "FALSE"],
    ["SRS", "EPSG:3857"],
    ["BBOX", "{bbox-epsg-3857}"],
    ["WIDTH", String(options.tileSize)],
    ["HEIGHT", String(options.tileSize)],
  ]);
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

function isSwissGdiLayer(layer: GeoLibreLayerRecord): boolean {
  return (
    layer.type === "wms" &&
    layer.metadata?.swissGdi === true &&
    typeof layer.source?.layers === "string"
  );
}

function swissGdiLayers(app: GeoLibreAppAPI): GeoLibreLayerRecord[] {
  return (app.getLayers?.() ?? []).filter(isSwissGdiLayer);
}

function createSwissGdiLayerDraft(
  catalogLayer: SwissGdiCatalogLayer,
  language: SwissGdiLanguage,
): GeoLibreLayerDraft {
  const endpoint = buildSwissGdiWmsEndpoint(language);
  const tileSize = 256;
  return {
    id: createLayerId(),
    name: catalogLayer.title,
    type: "wms",
    source: {
      type: "raster",
      tiles: [
        createWmsTileUrl({
          endpoint,
          layers: catalogLayer.name,
          styles: "default",
          format: "image/png",
          transparent: true,
          tileSize,
        }),
      ],
      tileSize,
      url: endpoint,
      layers: catalogLayer.name,
      styles: "default",
      format: "image/png",
      transparent: true,
      version: "1.3.0",
      infoFormat: "application/json",
      featureCount: 10,
      lang: language,
    },
    metadata: {
      service: "wms",
      sourceName: "Swiss GDI",
      swissGdi: true,
      swissGdiLang: language,
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
  Object.assign(button.style, {
    padding: "0.35rem 0.65rem",
    borderRadius: "0.5rem",
    fontSize: "0.75rem",
    lineHeight: "1rem",
    cursor: "pointer",
  }, inlineButtonStyle(variant));
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
    const identifyLayerId = app.getIdentifyLayerId?.() ?? null;
    const target = state.search.trim().toLowerCase();
    const filteredCatalog = (target
      ? state.catalog.filter((layer) => {
          const haystack = `${layer.name} ${layer.title} ${layer.abstract ?? ""}`.toLowerCase();
          return haystack.includes(target);
        })
      : state.catalog
    ).slice(0, 80);

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
    });

    const intro = createSectionCard();
    const title = document.createElement("div");
    title.textContent = PANEL_TITLE;
    Object.assign(title.style, { fontWeight: "600", fontSize: "0.95rem" });
    const description = document.createElement("p");
    description.textContent = PANEL_DESCRIPTION;
    Object.assign(description.style, {
      margin: "0.35rem 0 0",
      fontSize: "0.75rem",
      color: "hsl(var(--muted-foreground))",
    });
    const docsRow = document.createElement("div");
    Object.assign(docsRow.style, { marginTop: "0.75rem", display: "flex", gap: "0.5rem" });
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
    Object.assign(languageLabel.style, { fontSize: "0.75rem", color: "hsl(var(--muted-foreground))" });
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
    searchLabel.textContent = "Search layers";
    Object.assign(searchLabel.style, { fontSize: "0.75rem", color: "hsl(var(--muted-foreground))" });
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
      ? "Loading capabilities..."
      : `${filteredCatalog.length} of ${state.catalog.length} layers shown`;
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
        layerId.textContent = String(layer.source.layers ?? "");
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
          createButton(
            identifyLayerId === layer.id ? "Identifying" : "Identify",
            () => app.setIdentifyLayer?.(identifyLayerId === layer.id ? null : layer.id),
            identifyLayerId === layer.id ? "default" : "outline",
          ),
        );
        row.appendChild(
          createButton("Legend", () => {
            state.legendLayerName = String(layer.source.layers ?? "");
            state.legendLanguage = normalizeSwissGdiLanguage(
              typeof layer.source.lang === "string"
                ? layer.source.lang
                : typeof layer.metadata.swissGdiLang === "string"
                  ? String(layer.metadata.swissGdiLang)
                  : state.language,
            );
            render();
          }),
        );
        row.appendChild(
          createButton("Remove", () => {
            if (identifyLayerId === layer.id) app.setIdentifyLayer?.(null);
            app.removeLayer?.(layer.id);
          }, "ghost"),
        );
        activeCard.appendChild(row);
      }
      const identifyHint = document.createElement("p");
      identifyHint.textContent =
        "Click Identify, then click the map to issue a WMS GetFeatureInfo request for that layer.";
      Object.assign(identifyHint.style, {
        margin: "0.25rem 0 0",
        fontSize: "0.7rem",
        color: "hsl(var(--muted-foreground))",
      });
      activeCard.appendChild(identifyHint);
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
        border: "1px solid hsl(0 84% 60%)",
        borderRadius: "0.75rem",
        background: "hsl(0 84% 60% / 0.08)",
        color: "hsl(0 84% 45%)",
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
      empty.textContent = "No Swiss GDI WMS layers match the current search.";
      Object.assign(empty.style, { fontSize: "0.75rem", color: "hsl(var(--muted-foreground))" });
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
      Object.assign(actions.style, { display: "flex", gap: "0.5rem", flexShrink: "0" });
      actions.appendChild(
        createButton("Legend", () => {
          state.legendLayerName = layer.name;
          state.legendLanguage = state.language;
          render();
        }),
      );
      actions.appendChild(
        createButton("Add", () => {
          app.addLayer?.(createSwissGdiLayerDraft(layer, state.language));
          state.legendLayerName = layer.name;
          state.legendLanguage = state.language;
          render();
        }, "default"),
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
        state.error = error instanceof Error ? error.message : "Could not load Swiss GDI capabilities.";
        render();
      });
  };

  const disposeLayers = app.onLayersChange?.(() => render()) ?? (() => undefined);
  const disposeIdentify = app.onIdentifyLayerChange?.(() => render()) ?? (() => undefined);
  loadCatalog();
  render();
  return () => {
    alive = false;
    requestId += 1;
    disposeLayers();
    disposeIdentify();
    container.replaceChildren();
  };
}

export function createSwissGdiPlugin(): GeoLibrePlugin {
  let unregisterPanel: (() => void) | undefined;
  let panelContentCleanup: (() => void) | undefined;
  let shouldOpenAfterActivate = true;
  let isPanelOpen = false;

  return {
    id: SWISS_GDI_PLUGIN_ID,
    name: PANEL_TITLE,
    version: "1.0.0",
    activate(app) {
      if (unregisterPanel) return;
      unregisterPanel = app.registerRightPanel?.({
        id: SWISS_GDI_PLUGIN_ID,
        title: PANEL_TITLE,
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
          panelContentCleanup = createSwissGdiPanel(app, container);
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
    deactivate(app) {
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
      return { open: true } satisfies GeoLibrePluginState;
    },
    applyProjectState(_app, state) {
      const nextOpen =
        state === undefined
          ? true
          : (state as GeoLibrePluginState | undefined)?.open === true;
      const changed = shouldOpenAfterActivate !== nextOpen;
      shouldOpenAfterActivate = nextOpen;
      return changed;
    },
  };
}

export const plugin = createSwissGdiPlugin();
export default plugin;
