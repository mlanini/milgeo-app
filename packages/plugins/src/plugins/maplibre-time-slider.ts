import {
  DEFAULT_LAYER_STYLE,
  useAppStore,
  type GeoLibreLayer,
} from "@geolibre/core";
import {
  TimeSliderControl,
  type SourceSpec,
  type TimeSliderConfig,
  type TimeSliderEventData,
  type TimeSliderOptions,
} from "maplibre-gl-time-slider";
import type {
  GeoLibreAppAPI,
  GeoLibreMapControlPosition,
  GeoLibrePlugin,
} from "../types";

/**
 * Marker placed on every GeoLibre store layer that mirrors a time-slider
 * source, used to reconcile and prune the plugin's layers without touching any
 * others (mirrors the Esri Wayback `sourceKind` convention).
 */
const STORE_LAYER_SOURCE_KIND = "time-slider";

// ─── Current-date broadcast ───────────────────────────────────────────────────
//
// MilGeo extension: the mil-symbol renderer filters APP-6D symbols/graphics by
// their startDate/endDate window against the slider's current date. The plugin
// publishes the active date through this tiny module-level pub/sub so app code
// can subscribe without owning a reference to the control (same pattern as the
// subscribeXxxPanel helpers in maplibre-components).

type TimeSliderDateListener = (date: Date | null) => void;

const dateListeners = new Set<TimeSliderDateListener>();
let currentSliderDate: Date | null = null;

function publishTimeSliderDate(date: Date | null): void {
  // Skip no-op updates so playback ticks that land on the same instant (or a
  // null → null transition) do not trigger renderer work.
  if (
    (date === null && currentSliderDate === null) ||
    (date !== null &&
      currentSliderDate !== null &&
      date.getTime() === currentSliderDate.getTime())
  ) {
    return;
  }
  currentSliderDate = date;
  for (const listener of dateListeners) listener(date);
}

/**
 * Returns the time slider's current date, or null when the plugin is inactive.
 * Stable reference between changes, so it is safe as a useSyncExternalStore
 * snapshot.
 */
export function getTimeSliderDate(): Date | null {
  return currentSliderDate;
}

/**
 * Subscribes to time-slider date changes. The listener fires with the new
 * date on every slider step/playback tick, and with `null` when the plugin is
 * deactivated. Returns an unsubscribe function.
 */
export function subscribeTimeSliderDate(
  listener: TimeSliderDateListener,
): () => void {
  dateListeners.add(listener);
  return () => {
    dateListeners.delete(listener);
  };
}

/**
 * Default configuration applied on first activation. No data sources are
 * seeded: the dock opens expanded with an empty timeline so the user can add
 * their own layers via the dock's "Add data" form. The default range targets a
 * recent operational window at day granularity, which suits mil-symbol
 * scenario playback better than the upstream Landsat sample range.
 */
function buildDefaultOptions(): TimeSliderOptions {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 30);
  const toIsoDay = (d: Date) => d.toISOString().slice(0, 10);
  return {
    startDate: toIsoDay(start),
    endDate: toIsoDay(end),
    granularity: "day",
    granularities: ["year", "month", "day", "hour"],
    speed: 800,
    collapsible: true,
    collapsed: false,
    // Match the in-app light/dark toggle rather than the system
    // `prefers-color-scheme`, which the dock's default `auto` theme follows
    // and which may differ from the in-app theme.
    theme: resolveDocumentTheme(),
    sources: [],
  };
}

/**
 * Reads the current theme from the `dark` class that the desktop app toggles
 * on the document element, so the time slider dock is forced to match the
 * in-app theme instead of the system `prefers-color-scheme`.
 */
function resolveDocumentTheme(): "light" | "dark" {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

// Observes the document element's `class` so the dock theme tracks the in-app
// light/dark toggle. A single module-level observer suffices: only one control
// is ever active at a time.
let themeObserver: MutationObserver | null = null;

function startThemeSync(control: TimeSliderControl): void {
  control.setTheme(resolveDocumentTheme());
  if (
    themeObserver ||
    typeof MutationObserver === "undefined" ||
    typeof document === "undefined"
  ) {
    return;
  }
  // The observer fires on any `class` mutation of <html>, so cache the last
  // applied theme and only call setTheme when the dark/light value flips. It
  // targets the module-level `timeSliderControl` (late-bound) so a rebuilt
  // control still receives theme updates.
  let lastTheme = resolveDocumentTheme();
  themeObserver = new MutationObserver(() => {
    const next = resolveDocumentTheme();
    if (next === lastTheme) return;
    lastTheme = next;
    timeSliderControl?.setTheme(next);
  });
  themeObserver.observe(document.documentElement, {
    attributeFilter: ["class"],
  });
}

function stopThemeSync(): void {
  themeObserver?.disconnect();
  themeObserver = null;
}

let timeSliderPosition: GeoLibreMapControlPosition = "bottom-left";
let timeSliderControl: TimeSliderControl | null = null;
// Last known config, kept so deactivating/reactivating (or restoring a saved
// project) rebuilds the timeline and its layers exactly.
let savedConfig: TimeSliderConfig | null = null;
// Detaches the active control's store-sync listeners; set by attachStoreSync,
// cleared when invoked. Bound to a specific control so handlers cannot leak.
let detachStoreSync: (() => void) | null = null;

export const maplibreTimeSliderPlugin: GeoLibrePlugin = {
  id: "maplibre-gl-time-slider",
  name: "Time Slider",
  version: "1.0.3",
  activate: (app: GeoLibreAppAPI) => {
    if (timeSliderControl) return;
    const control = new TimeSliderControl(
      savedConfig ? configToOptions(savedConfig) : buildDefaultOptions(),
    );
    timeSliderControl = control;
    attachStoreSync(control);

    const added = app.addMapControl(control, timeSliderPosition);
    if (!added) {
      detachStoreSync?.();
      timeSliderControl = null;
      return false;
    }
    // Layers (especially the async COG) only exist a tick after the control is
    // added, so reconcile the store once they have been created. Capture the
    // control locally so a later reassignment cannot redirect this callback.
    setTimeout(() => syncStoreLayers(control), 0);
  },
  deactivate: (app: GeoLibreAppAPI) => {
    if (!timeSliderControl) return;
    savedConfig = timeSliderControl.getConfig();
    detachStoreSync?.();
    app.removeMapControl(timeSliderControl);
    timeSliderControl = null;
    removeAllTimeSliderStoreLayers();
  },
  getMapControlPosition: () => timeSliderPosition,
  setMapControlPosition: (
    app: GeoLibreAppAPI,
    position: GeoLibreMapControlPosition,
  ) => {
    timeSliderPosition = position;
    if (!timeSliderControl) return;
    // The library's onRemove destroys all adapters/layers and clears event
    // handlers, so capture the full config first and rebuild a fresh control
    // at the new position to preserve user-added layers.
    const config = timeSliderControl.getConfig();
    detachStoreSync?.();
    app.removeMapControl(timeSliderControl);
    const control = new TimeSliderControl(configToOptions(config));
    timeSliderControl = control;
    attachStoreSync(control);
    const added = app.addMapControl(control, timeSliderPosition);
    if (!added) {
      detachStoreSync?.();
      timeSliderControl = null;
      // Preserve the captured config so a later activate() restores the user's
      // layers, and drop the now-orphaned store layers (the previous control's
      // map layers were already removed above).
      savedConfig = config;
      removeAllTimeSliderStoreLayers();
      return false;
    }
    setTimeout(() => syncStoreLayers(control), 0);
  },
  getProjectState: () => {
    const config = timeSliderControl?.getConfig() ?? savedConfig;
    // getConfig() includes optional keys (e.g. dateFormat/beforeId) with
    // `undefined` values. The host drops plugin settings that are not strictly
    // JSON-compatible, and `undefined` fails that check, so round-trip through
    // JSON to strip those keys before persisting.
    return config
      ? (JSON.parse(JSON.stringify(config)) as TimeSliderConfig)
      : undefined;
  },
  applyProjectState: (app: GeoLibreAppAPI, state: unknown) => {
    const nextConfig = normalizeConfig(state);
    if (!nextConfig) {
      // A reset/new project (or an invalid value) clears the cached config so
      // the next activation rebuilds the default empty timeline. If a control
      // is still live (e.g. an invalid settings entry arrives while the plugin
      // stays active across a project switch), tear it down and rebuild so the
      // previous project's timeline cannot linger on screen.
      savedConfig = null;
      if (timeSliderControl) {
        detachStoreSync?.();
        app.removeMapControl(timeSliderControl);
        timeSliderControl = null;
        removeAllTimeSliderStoreLayers();
        return maplibreTimeSliderPlugin.activate(app) !== false;
      }
      return false;
    }

    savedConfig = nextConfig;
    if (!timeSliderControl) return true;

    // setConfig replaces the sources in place without firing
    // sourceadd/sourceremove, so reconcile the store via the setTimeout below
    // once the new layers exist. Capture the control so a later reassignment
    // cannot redirect this callback.
    const control = timeSliderControl;
    control.setConfig(nextConfig);
    publishTimeSliderDate(control.getCurrentDate());
    setTimeout(() => syncStoreLayers(control), 0);
    return true;
  },
};

/**
 * Builds constructor options from a serialized config so a fresh control
 * restores the full timeline state and all of its sources.
 */
function configToOptions(config: TimeSliderConfig): TimeSliderOptions {
  return {
    startDate: config.startDate,
    endDate: config.endDate,
    interval: config.interval,
    granularity: config.granularity,
    granularities: config.granularities,
    initialDate: config.currentDate,
    speed: config.speed,
    loop: config.loop,
    autoPlay: config.autoPlay,
    theme: config.theme,
    dateFormat: config.dateFormat,
    collapsed: config.collapsed,
    beforeId: config.beforeId,
    // Copy each source so the rebuilt control cannot mutate the cached config.
    sources: config.sources.map((source) => ({ ...source })),
    collapsible: true,
  };
}

/**
 * Returns true when a source URL-bearing field is safe to hand to the library:
 * absent/empty, a non-string (e.g. inline GeoJSON data objects), or a plain
 * http(s) URL. Other schemes (javascript:/data:/file:) are rejected.
 */
function isSafeSourceUrl(value: unknown): boolean {
  if (typeof value !== "string" || value === "") return true;
  return /^https?:\/\//i.test(value);
}

/**
 * Minimal validation of a restored project value before treating it as a
 * `TimeSliderConfig` (it arrives untyped from the saved project file).
 */
function normalizeConfig(state: unknown): TimeSliderConfig | null {
  if (!state || typeof state !== "object") return null;
  const candidate = state as Partial<TimeSliderConfig>;
  if (
    typeof candidate.startDate !== "string" ||
    typeof candidate.endDate !== "string" ||
    typeof candidate.granularity !== "string" ||
    (candidate.currentDate !== undefined &&
      typeof candidate.currentDate !== "string") ||
    !Array.isArray(candidate.sources) ||
    (candidate.sources as unknown[]).some((source) => {
      if (!source || typeof source !== "object") return true;
      const spec = source as {
        id?: unknown;
        url?: unknown;
        tiles?: unknown;
        data?: unknown;
        baseUrl?: unknown;
      };
      // Reject malformed ids and any URL-bearing field that is not a plain
      // http(s) URL. A crafted project file could otherwise smuggle a
      // javascript:/data:/file: URI that MapLibre would fetch, which matters
      // under the Tauri desktop target.
      return (
        typeof spec.id !== "string" ||
        !isSafeSourceUrl(spec.url) ||
        !isSafeSourceUrl(spec.tiles) ||
        !isSafeSourceUrl(spec.data) ||
        !isSafeSourceUrl(spec.baseUrl)
      );
    })
  ) {
    return null;
  }
  return candidate as TimeSliderConfig;
}

// Only sourceadd/sourceremove change the store's layer set. statechange also
// fires on every playback tick (goTo emits it), so subscribing it to a store
// reconcile would run at animation speed for no benefit; opacity and
// visibility are intentionally left to the Layers panel. The `change` event is
// instead forwarded to the lightweight date broadcast so mil-symbol layers can
// follow playback.
function attachStoreSync(control: TimeSliderControl): void {
  const onSourceAdd = () => syncStoreLayers(control);
  const onSourceRemove = () => syncStoreLayers(control);
  const onTimeChange = (event: TimeSliderEventData) =>
    publishTimeSliderDate(event.state.currentDate);
  control.on("sourceadd", onSourceAdd);
  control.on("sourceremove", onSourceRemove);
  control.on("change", onTimeChange);
  // Broadcast the initial position so subscribers filter immediately.
  publishTimeSliderDate(control.getCurrentDate());
  // Force the dock theme to follow the in-app light/dark toggle for as long as
  // this control is attached.
  startThemeSync(control);
  // Bind the detacher to this specific control and its own handler closures so
  // a second attach can never orphan the previous control's listeners.
  detachStoreSync = () => {
    control.off("sourceadd", onSourceAdd);
    control.off("sourceremove", onSourceRemove);
    control.off("change", onTimeChange);
    publishTimeSliderDate(null);
    stopThemeSync();
    detachStoreSync = null;
  };
}

/**
 * Reconciles the GeoLibre layer store with the control's current sources: each
 * source becomes (or updates) an external-native store layer, and store layers
 * whose source no longer exists are pruned. The maplibre layer id equals the
 * source id for every adapter type, so `nativeLayerIds` lets the Layers panel
 * and the on-map layer control drive the underlying layer.
 */
function syncStoreLayers(control: TimeSliderControl | null): void {
  if (!control) return;
  const activeIds = new Set<string>();
  for (const spec of control.getSources()) {
    if (!spec.id) continue;
    activeIds.add(spec.id);
    addOrUpdateStoreLayer(createStoreLayer(spec));
  }

  const store = useAppStore.getState();
  const staleIds = store.layers
    .filter(
      (layer) =>
        layer.metadata.sourceKind === STORE_LAYER_SOURCE_KIND &&
        !activeIds.has(layer.id),
    )
    .map((layer) => layer.id);
  for (const id of staleIds) {
    store.removeLayer(id);
  }
}

function addOrUpdateStoreLayer(layer: GeoLibreLayer): void {
  const store = useAppStore.getState();
  const existingLayer = store.layers.find((item) => item.id === layer.id);
  if (!existingLayer) {
    store.addLayer(layer);
    return;
  }

  if (!shouldUpdateStoreLayer(existingLayer, layer)) return;

  // Only sync identity/source/metadata; visibility and opacity are left to the
  // user via the Layers panel so a dock-side state change cannot clobber them.
  store.updateLayer(layer.id, {
    metadata: layer.metadata,
    name: layer.name,
    source: layer.source,
  });
}

function shouldUpdateStoreLayer(
  existingLayer: GeoLibreLayer,
  nextLayer: GeoLibreLayer,
): boolean {
  return (
    existingLayer.name !== nextLayer.name ||
    JSON.stringify(existingLayer.metadata) !==
      JSON.stringify(nextLayer.metadata) ||
    JSON.stringify(existingLayer.source) !== JSON.stringify(nextLayer.source)
  );
}

function createStoreLayer(spec: SourceSpec): GeoLibreLayer {
  const sourceId = spec.id as string;
  const layerType = spec.type === "geojson" ? "geojson" : "raster";
  return {
    id: sourceId,
    name: spec.name ?? sourceId,
    type: layerType,
    source: { type: layerType, sourceId },
    visible: spec.visible !== false,
    opacity: spec.opacity ?? 1,
    style: { ...DEFAULT_LAYER_STYLE },
    metadata: {
      externalNativeLayer: true,
      identifiable: false,
      nativeLayerIds: [sourceId],
      sourceId,
      sourceIds: [sourceId],
      sourceKind: STORE_LAYER_SOURCE_KIND,
    },
  };
}

function removeAllTimeSliderStoreLayers(): void {
  const store = useAppStore.getState();
  const ids = store.layers
    .filter((layer) => layer.metadata.sourceKind === STORE_LAYER_SOURCE_KIND)
    .map((layer) => layer.id);
  for (const id of ids) {
    store.removeLayer(id);
  }
}
