import type { GeoLibreLayer } from "@geolibre/core";

/**
 * Minimal scenegraph conversion shim for dropped KML models.
 */
export function buildKmlModelLayer(layer: {
  id?: string;
  name?: string;
  path?: string;
  url?: string;
  origin?: [number, number, number?];
  scale?: number;
  bearing?: number;
  pitch?: number;
  roll?: number;
}): GeoLibreLayer {
  const id = layer.id ?? crypto.randomUUID();
  const name = layer.name && layer.name.trim() ? layer.name : "KML Model";

  return {
    id,
    name,
    type: "external-native-layer",
    source: {
      kind: "scenegraph",
      url: layer.url,
      origin: layer.origin,
      scale: layer.scale,
      bearing: layer.bearing,
      pitch: layer.pitch,
      roll: layer.roll,
    },
    visible: true,
    opacity: 1,
    style: {},
    metadata: {
      sourcePath: layer.path,
      importedFrom: "kml-model",
    },
  } as unknown as GeoLibreLayer;
}
