import type { Feature, FeatureCollection, LineString, Point, Polygon } from "geojson";
import type { MilAffiliation } from "@geolibre/core";
import type { MilGraphicLayerItem } from "../milgraphic-layer-source";
import { resolveTacticalRuleKey, type TacticalGraphicRuleKey } from "./catalog";

export type TacticalRenderableFeature = Feature<LineString | Polygon | Point>;

function colorFromAffiliation(affiliation: MilAffiliation): string {
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

function lineBearingDegrees(a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const angle = (Math.atan2(dx, dy) * 180) / Math.PI;
  return (angle + 360) % 360;
}

function metersPerLonDegree(latDeg: number): number {
  const cos = Math.cos((latDeg * Math.PI) / 180);
  return Math.max(1, 111320 * Math.max(0.01, cos));
}

function buildFlotRightTicks(coordinates: [number, number][]): [number, number][][] {
  const ticks: [number, number][][] = [];
  for (let i = 0; i < coordinates.length - 1; i += 1) {
    const a = coordinates[i];
    const b = coordinates[i + 1];
    const midLon = (a[0] + b[0]) / 2;
    const midLat = (a[1] + b[1]) / 2;

    const metersLon = metersPerLonDegree(midLat);
    const metersLat = 110540;
    const vx = (b[0] - a[0]) * metersLon;
    const vy = (b[1] - a[1]) * metersLat;
    const len = Math.hypot(vx, vy);
    if (len < 1) continue;

    const nx = vy / len;
    const ny = -vx / len;
    const tickLengthM = Math.max(300, Math.min(2000, len * 0.22));

    const endLon = midLon + (nx * tickLengthM) / metersLon;
    const endLat = midLat + (ny * tickLengthM) / metersLat;
    ticks.push([
      [midLon, midLat],
      [endLon, endLat],
    ]);
  }
  return ticks;
}

function baseProperties(graphic: MilGraphicLayerItem, ruleKey: TacticalGraphicRuleKey) {
  return {
    id: graphic.id,
    name: graphic.name,
    sidc: graphic.sidcOriginal ?? graphic.SIDC,
    sidcCanonical: graphic.sidcCanonical ?? null,
    ruleKey,
    migrationReason: graphic.migration?.reason,
    affiliation: graphic.affiliation,
    color: colorFromAffiliation(graphic.affiliation),
    tacticalFamily: graphic.tacticalFamily,
  };
}

export function milGraphicsToRuleFeatures(
  graphics: MilGraphicLayerItem[],
): FeatureCollection<LineString | Polygon | Point> {
  const features: TacticalRenderableFeature[] = [];

  for (const graphic of graphics) {
    const ruleKey =
      graphic.ruleKey ?? resolveTacticalRuleKey(graphic.sidcOriginal ?? graphic.SIDC, graphic.geometryType);

    if (graphic.geometryType === "LineString") {
      if (graphic.coordinates.length < 2) continue;
      const props = baseProperties(graphic, ruleKey);

      features.push({
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: graphic.coordinates,
        },
        properties: {
          ...props,
          renderRole: "main-line",
        },
      });

      if (ruleKey === "flot") {
        const ticks = buildFlotRightTicks(graphic.coordinates);
        ticks.forEach((tickCoordinates, idx) => {
          features.push({
            type: "Feature",
            geometry: {
              type: "LineString",
              coordinates: tickCoordinates,
            },
            properties: {
              ...props,
              id: `${graphic.id}-flot-${idx}`,
              renderRole: "flot-right-tick",
            },
          });
        });
      }

      if (ruleKey === "direction_of_attack") {
        const tip = graphic.coordinates[graphic.coordinates.length - 1];
        const prev = graphic.coordinates[graphic.coordinates.length - 2];
        const bearing = lineBearingDegrees(prev, tip);
        features.push({
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: tip,
          },
          properties: {
            ...props,
            id: `${graphic.id}-arrow-tip`,
            renderRole: "direction-of-attack-head",
            bearing,
          },
        });
      }
      continue;
    }

    const ring = closePolygonRing(graphic.coordinates);
    if (ring.length < 4) continue;
    const props = baseProperties(graphic, ruleKey);
    const areaPattern = ruleKey === "no_fire_area" ? "no-fire" : ruleKey === "fortified_area" ? "fortified" : "none";

    features.push({
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [ring],
      },
      properties: {
        ...props,
        renderRole: "main-area",
        areaPattern,
      },
    });
  }

  return {
    type: "FeatureCollection",
    features,
  };
}
