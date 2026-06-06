/**
 * traccar-layer.ts
 *
 * MapLibre GL layer management for Sillages live tracking.
 * Translates the Python MapLayerManager / LayerStyler into a browser module
 * that operates directly on a MapLibre GL Map instance.
 *
 * Layer architecture
 * ------------------
 * • Source "sillages-tracks"    → FeatureCollection of LineStrings (one per visible device)
 * • Source "sillages-positions" → FeatureCollection of Points (latest position per device)
 * • Layer  "sillages-tracks-line"   → line (data-driven color + width)
 * • Layer  "sillages-positions-dot" → circle (data-driven color)
 * • Layer  "sillages-positions-label" → symbol (device name label)
 */

import type { Map as MaplibreMap, GeoJSONSource } from "maplibre-gl";
import type { TraccarDeviceState, TraccarPosition } from "./traccar-client";

const SRC_TRACKS  = "sillages-tracks";
const SRC_POS     = "sillages-positions";
const LYR_TRACKS  = "sillages-tracks-line";
const LYR_DOT     = "sillages-positions-dot";
const LYR_LABEL   = "sillages-positions-label";

/** Empty FeatureCollection. */
const EMPTY_FC = { type: "FeatureCollection", features: [] } as const;

// ─── Public API ────────────────────────────────────────────────────────────────

/** Create the three Sillages layers on the given map. */
export function createSillagesLayers(map: MaplibreMap): void {
  if (map.getSource(SRC_TRACKS)) return; // already added

  map.addSource(SRC_TRACKS, { type: "geojson", data: { ...EMPTY_FC } });
  map.addSource(SRC_POS,    { type: "geojson", data: { ...EMPTY_FC } });

  // Track lines
  map.addLayer({
    id: LYR_TRACKS,
    type: "line",
    source: SRC_TRACKS,
    layout: { "line-join": "round", "line-cap": "round" },
    paint: {
      "line-color": ["get", "trackColor"],
      "line-width": ["get", "trackWidth"],
      "line-opacity": 0.8,
    },
  });

  // Device position dots
  map.addLayer({
    id: LYR_DOT,
    type: "circle",
    source: SRC_POS,
    paint: {
      "circle-radius": [
        "case",
        ["==", ["get", "status"], "online"], 8,
        6,
      ],
      "circle-color": ["get", "trackColor"],
      "circle-stroke-width": 2,
      "circle-stroke-color": "#ffffff",
      "circle-opacity": [
        "case",
        ["==", ["get", "status"], "offline"], 0.55,
        1.0,
      ],
    },
  });

  // Device name labels
  map.addLayer({
    id: LYR_LABEL,
    type: "symbol",
    source: SRC_POS,
    layout: {
      "text-field": ["case", ["get", "showLabel"], ["get", "name"], ""],
      "text-size": 11,
      "text-anchor": "top",
      "text-offset": [0, 0.9],
      "text-allow-overlap": false,
    },
    paint: {
      "text-color": "#ffffff",
      "text-halo-color": "#333333",
      "text-halo-width": 1,
    },
  });
}

/** Remove all Sillages layers and sources from the map. */
export function removeSillagesLayers(map: MaplibreMap): void {
  for (const id of [LYR_LABEL, LYR_DOT, LYR_TRACKS]) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  for (const id of [SRC_POS, SRC_TRACKS]) {
    if (map.getSource(id)) map.removeSource(id);
  }
}

/**
 * Refresh both the position source and the track source from the in-memory
 * state held by the SillagesPanel (devices + per-device track buffers).
 */
export function updateSillagesLayers(
  map: MaplibreMap,
  devices: TraccarDeviceState[],
  getTracks: (deviceId: number) => TraccarPosition[],
): void {
  if (!map.getSource(SRC_POS)) return;

  // Build position features
  const posFeatures = devices
    .filter((d) => d.visible)
    .map((d) => {
      const track = getTracks(d.id);
      const latest = track[track.length - 1];
      if (!latest) return null;
      return {
        type: "Feature" as const,
        geometry: {
          type: "Point" as const,
          coordinates: [latest.longitude, latest.latitude],
        },
        properties: {
          id: d.id,
          name: d.name,
          status: d.status,
          trackColor: d.trackColor,
          trackWidth: d.trackWidth,
          showLabel: d.showLabel,
          speed: latest.speed,
          course: latest.course,
          fixTime: latest.fixTime ?? "",
        },
      };
    })
    .filter((f): f is NonNullable<typeof f> => f !== null);

  // Build track features
  const trackFeatures = devices
    .filter((d) => d.visible)
    .map((d) => {
      const track = getTracks(d.id);
      if (track.length < 2) return null;
      return {
        type: "Feature" as const,
        geometry: {
          type: "LineString" as const,
          coordinates: track.map((p) => [p.longitude, p.latitude]),
        },
        properties: {
          id: d.id,
          name: d.name,
          trackColor: d.trackColor,
          trackWidth: d.trackWidth,
        },
      };
    })
    .filter((f): f is NonNullable<typeof f> => f !== null);

  (map.getSource(SRC_POS) as GeoJSONSource).setData({
    type: "FeatureCollection",
    features: posFeatures,
  });

  (map.getSource(SRC_TRACKS) as GeoJSONSource).setData({
    type: "FeatureCollection",
    features: trackFeatures,
  });
}

/** Wipe the track ring-buffer visuals for a single device. */
export function clearDeviceTrackOnMap(
  map: MaplibreMap,
  deviceId: number,
  devices: TraccarDeviceState[],
): void {
  if (!map.getSource(SRC_TRACKS)) return;
  const src = map.getSource(SRC_TRACKS) as GeoJSONSource;
  const current = map.querySourceFeatures(SRC_TRACKS);
  const remaining = current.filter(
    (f) => (f.properties?.id as number) !== deviceId,
  );
  src.setData({ type: "FeatureCollection", features: remaining });

  // Also clear the position dot if device has no more track
  const dev = devices.find((d) => d.id === deviceId);
  if (!dev) return;
  // The position will be cleared on next updateSillagesLayers call (no track = no dot)
}

export { LYR_DOT, LYR_TRACKS, LYR_LABEL, SRC_POS, SRC_TRACKS };
