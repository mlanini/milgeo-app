import type { FeatureCollection, LineString, Point, Polygon } from "geojson";
import type { MilGraphicLayerItem } from "./milgraphic-layer-source";
import { milGraphicsToRuleFeatures } from "./tactical-rules/render-2d";

export const DEFAULT_TACTICAL_LINE_WIDTH_PX = 2.6;

interface MilGraphicGeoJsonOptions {
  lineWidthPx?: number;
}

/**
 * Build a canonical GeoJSON representation for tactical graphics.
 * Milestone B uses rule-driven primitive expansion for whitelist tactical symbols.
 */
export function milGraphicsToGeoJson(
  graphics: MilGraphicLayerItem[],
  options: MilGraphicGeoJsonOptions = {},
): FeatureCollection<LineString | Polygon | Point> {
  const lineWidthPx =
    typeof options.lineWidthPx === "number" && Number.isFinite(options.lineWidthPx)
      ? Math.max(1, options.lineWidthPx)
      : DEFAULT_TACTICAL_LINE_WIDTH_PX;
  return milGraphicsToRuleFeatures(graphics, { lineWidthPx });
}