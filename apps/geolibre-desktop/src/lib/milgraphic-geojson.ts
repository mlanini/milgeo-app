import type { Feature, FeatureCollection, LineString, Polygon } from "geojson";
import type { MilGraphicLayerItem } from "./milgraphic-layer-source";

type MilGraphicFeature = Feature<LineString | Polygon>;

function colorFromAffiliation(affiliation: unknown): string {
  switch (affiliation) {
    case "HOSTILE":
      return "#CE4A4A";
    case "NEUTRAL":
      return "#4ACE8C";
    case "UNKNOWN":
      return "#A8A8A8";
    case "FRIENDLY":
    default:
      return "#4A7FCE";
  }
}

function closePolygonRing(coordinates: [number, number][]): [number, number][] {
  if (coordinates.length === 0) return [];
  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) return coordinates;
  return [...coordinates, [first[0], first[1]]];
}

/**
 * Build a canonical GeoJSON representation for tactical graphics.
 * Polygon rings are closed here so both MapLibre and Cesium receive valid geometry.
 */
export function milGraphicsToGeoJson(
  graphics: MilGraphicLayerItem[],
): FeatureCollection<LineString | Polygon> {
  const features: MilGraphicFeature[] = [];

  for (const graphic of graphics) {
    if (graphic.geometryType === "LineString") {
      if (graphic.coordinates.length < 2) continue;
      features.push({
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: graphic.coordinates,
        },
        properties: {
          id: graphic.id,
          name: graphic.name,
          sidc: graphic.SIDC,
          affiliation: graphic.affiliation,
          color: colorFromAffiliation(graphic.affiliation),
          directional: graphic.tacticalDirectional === true ? 1 : 0,
          tacticalFamily: graphic.tacticalFamily,
        },
      });
      continue;
    }

    const ring = closePolygonRing(graphic.coordinates);
    if (ring.length < 4) continue;
    features.push({
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [ring],
      },
      properties: {
        id: graphic.id,
        name: graphic.name,
        sidc: graphic.SIDC,
        affiliation: graphic.affiliation,
        color: colorFromAffiliation(graphic.affiliation),
        directional: 0,
        tacticalFamily: graphic.tacticalFamily,
      },
    });
  }

  return {
    type: "FeatureCollection",
    features,
  };
}