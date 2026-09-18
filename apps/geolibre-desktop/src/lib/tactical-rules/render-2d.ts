import type { Feature, FeatureCollection, LineString, Point, Polygon } from "geojson";
import type { MilAffiliation } from "@geolibre/core";
import type { MilGraphicLayerItem } from "../milgraphic-layer-source";
import { resolveTacticalRuleKey, type TacticalGraphicRuleKey } from "./catalog";

export type TacticalRenderableFeature = Feature<LineString | Polygon | Point>;

const BASE_TACTICAL_LINE_WIDTH = 2.6;

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

function buildArrowHeadSegments(
  tail: [number, number],
  tip: [number, number],
): [[number, number], [number, number]][] {
  const tipLat = tip[1];
  const metersLon = metersPerLonDegree(tipLat);
  const metersLat = 110540;
  const vx = (tip[0] - tail[0]) * metersLon;
  const vy = (tip[1] - tail[1]) * metersLat;
  const len = Math.hypot(vx, vy);
  if (len < 1) return [];

  const ux = vx / len;
  const uy = vy / len;
  const headLengthM = Math.max(350, Math.min(2400, len * 0.24));
  const wingAngle = (30 * Math.PI) / 180;

  const rotate = (x: number, y: number, angle: number): [number, number] => [
    x * Math.cos(angle) - y * Math.sin(angle),
    x * Math.sin(angle) + y * Math.cos(angle),
  ];

  const [leftUx, leftUy] = rotate(-ux, -uy, wingAngle);
  const [rightUx, rightUy] = rotate(-ux, -uy, -wingAngle);

  const leftEnd: [number, number] = [
    tip[0] + (leftUx * headLengthM) / metersLon,
    tip[1] + (leftUy * headLengthM) / metersLat,
  ];
  const rightEnd: [number, number] = [
    tip[0] + (rightUx * headLengthM) / metersLon,
    tip[1] + (rightUy * headLengthM) / metersLat,
  ];

  return [
    [tip, leftEnd],
    [tip, rightEnd],
  ];
}

function baseLineWidth(ruleKey: TacticalGraphicRuleKey, role: string): number {
  if (role === "flot-right-tick") return 1.8;
  if (role === "direction-of-attack-wing") return 2.6;
  if (ruleKey === "direction_of_attack") return 3.2;
  if (ruleKey === "flot") return 2.8;
  if (ruleKey === "no_fire_area") return 2.2;
  if (ruleKey === "fortified_area") return 2.2;
  return 2.4;
}

function areaFillOpacity(ruleKey: TacticalGraphicRuleKey): number {
  if (ruleKey === "no_fire_area") return 0.24;
  if (ruleKey === "fortified_area") return 0.2;
  return 0.14;
}

interface TacticalRenderOptions {
  lineWidthPx?: number;
}

function baseProperties(
  graphic: MilGraphicLayerItem,
  ruleKey: TacticalGraphicRuleKey,
  lineWidthScale: number,
  role: string,
) {
  const color = colorFromAffiliation(graphic.affiliation);
  const width = Math.max(1, baseLineWidth(ruleKey, role) * lineWidthScale);
  return {
    id: graphic.id,
    name: graphic.name,
    sidc: graphic.sidcOriginal ?? graphic.SIDC,
    sidcCanonical: graphic.sidcCanonical ?? null,
    ruleKey,
    migrationReason: graphic.migration?.reason,
    affiliation: graphic.affiliation,
    color,
    tacticalFamily: graphic.tacticalFamily,
    stroke: color,
    "stroke-opacity": 1,
    "stroke-width": width,
    "marker-color": color,
    role,
  };
}

export function milGraphicsToRuleFeatures(
  graphics: MilGraphicLayerItem[],
  options: TacticalRenderOptions = {},
): FeatureCollection<LineString | Polygon | Point> {
  const features: TacticalRenderableFeature[] = [];
  const lineWidthScale =
    typeof options.lineWidthPx === "number" && Number.isFinite(options.lineWidthPx)
      ? Math.max(1, options.lineWidthPx) / BASE_TACTICAL_LINE_WIDTH
      : 1;

  for (const graphic of graphics) {
    const ruleKey =
      graphic.ruleKey ?? resolveTacticalRuleKey(graphic.sidcOriginal ?? graphic.SIDC, graphic.geometryType);

    if (graphic.geometryType === "LineString") {
      if (graphic.coordinates.length < 2) continue;
      const props = baseProperties(graphic, ruleKey, lineWidthScale, "main-line");

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
          const tickProps = baseProperties(graphic, ruleKey, lineWidthScale, "flot-right-tick");
          features.push({
            type: "Feature",
            geometry: {
              type: "LineString",
              coordinates: tickCoordinates,
            },
            properties: {
              ...tickProps,
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
        const wings = buildArrowHeadSegments(prev, tip);
        wings.forEach((segment, index) => {
          const wingProps = baseProperties(
            graphic,
            ruleKey,
            lineWidthScale,
            "direction-of-attack-wing",
          );
          features.push({
            type: "Feature",
            geometry: {
              type: "LineString",
              coordinates: segment,
            },
            properties: {
              ...wingProps,
              id: `${graphic.id}-arrow-wing-${index}`,
              renderRole: "direction-of-attack-wing",
              bearing,
            },
          });
        });
      }
      continue;
    }

    const ring = closePolygonRing(graphic.coordinates);
    if (ring.length < 4) continue;
    const props = baseProperties(graphic, ruleKey, lineWidthScale, "main-area");
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
        fill: props.color,
        "fill-opacity": areaFillOpacity(ruleKey),
      },
    });
  }

  return {
    type: "FeatureCollection",
    features,
  };
}
