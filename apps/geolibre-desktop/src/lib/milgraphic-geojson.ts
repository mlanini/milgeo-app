import type { FeatureCollection, LineString, Point, Polygon } from "geojson";
import type { MilGraphicLayerItem } from "./milgraphic-layer-source";
import { milGraphicsToRuleFeatures } from "./tactical-rules/render-2d";

/**
 * Build a canonical GeoJSON representation for tactical graphics.
 * Milestone B uses rule-driven primitive expansion for whitelist tactical symbols.
 */
export function milGraphicsToGeoJson(
  graphics: MilGraphicLayerItem[],
): FeatureCollection<LineString | Polygon | Point> {
  return milGraphicsToRuleFeatures(graphics);
}