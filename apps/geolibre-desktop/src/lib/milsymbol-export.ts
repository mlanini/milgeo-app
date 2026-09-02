import type { FeatureCollection, Feature, Point, LineString, Polygon } from "geojson";
import type { GeoLibreLayer } from "@geolibre/core";
import type { MilSymbolLayerSource, MilGraphicLayerSource } from "@geolibre/core";
import { parseMilGraphicLayerSource } from "./milgraphic-layer-source";

/**
 * Converts all mil-symbol and mil-graphic layers to a GeoJSON FeatureCollection.
 *
 * Each Feature carries a `SIDC` property (uppercase) and all other available
 * mil-symbol attributes (uniqueDesignation, higherFormation, affiliation…).
 *
 * @param layers - Subset of store layers to export (typically already filtered to mil types)
 * @returns A GeoJSON FeatureCollection ready for download / serialization
 */
export function exportMilLayersToGeoJSON(layers: GeoLibreLayer[]): FeatureCollection {
  const features: Feature[] = [];

  for (const layer of layers) {
    if (layer.type === "mil-symbol") {
      const src = layer.source as unknown as MilSymbolLayerSource;
      if (!src.SIDC || src.lon === undefined || src.lat === undefined) continue;

      const feature: Feature<Point> = {
        type: "Feature",
        id: layer.id,
        geometry: {
          type: "Point",
          coordinates: [src.lon, src.lat],
        },
        properties: {
          SIDC: src.SIDC,
          name: layer.name,
          affiliation: src.affiliation,
          ...(src.uniqueDesignation !== undefined && {
            uniqueDesignation: src.uniqueDesignation,
          }),
          ...(src.higherFormation !== undefined && {
            higherFormation: src.higherFormation,
          }),
          ...(src.additionalInfo !== undefined && {
            additionalInfo: src.additionalInfo,
          }),
          ...(src.speed !== undefined && { speed: src.speed }),
          ...(src.direction !== undefined && { direction: src.direction }),
        },
      };
      features.push(feature);

    } else if (layer.type === "mil-graphic") {
      const src = layer.source as unknown as MilGraphicLayerSource;
      const parsed = parseMilGraphicLayerSource(src);
      for (const graphic of parsed.graphics) {
        if (!graphic.SIDC || !graphic.coordinates?.length) continue;

        const geometry =
          graphic.geometryType === "Polygon"
            ? ({ type: "Polygon", coordinates: [graphic.coordinates] } as Polygon)
            : ({ type: "LineString", coordinates: graphic.coordinates } as LineString);

        const feature: Feature<LineString | Polygon> = {
          type: "Feature",
          id: graphic.id,
          geometry,
          properties: {
            SIDC: graphic.sidcOriginal ?? graphic.SIDC,
            sidcCanonical: graphic.sidcCanonical ?? null,
            ruleKey: graphic.ruleKey ?? "fallback",
            migrationReason: graphic.migration?.reason,
            name: graphic.name,
            affiliation: graphic.affiliation,
            ...(graphic.uniqueDesignation !== undefined && {
              uniqueDesignation: graphic.uniqueDesignation,
            }),
            ...(graphic.additionalInfo !== undefined && {
              additionalInfo: graphic.additionalInfo,
            }),
          },
        };
        features.push(feature);
      }
    }
  }

  return { type: "FeatureCollection", features };
}

/**
 * Serialises the exported FeatureCollection as a JSON string (pretty-printed).
 */
export function exportMilLayersToJSON(layers: GeoLibreLayer[]): string {
  return JSON.stringify(exportMilLayersToGeoJSON(layers), null, 2);
}

/**
 * Triggers a browser file download of the exported GeoJSON.
 *
 * @param layers - Layers to export
 * @param filename - Suggested filename (without extension)
 */
export function downloadMilLayersAsGeoJSON(
  layers: GeoLibreLayer[],
  filename = "milgeo-symbols",
): void {
  const json = exportMilLayersToJSON(layers);
  const blob = new Blob([json], { type: "application/geo+json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.geojson`;
  a.click();
  URL.revokeObjectURL(url);
}
