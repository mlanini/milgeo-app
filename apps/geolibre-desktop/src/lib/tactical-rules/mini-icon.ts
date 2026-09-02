import type { MilAffiliation } from "@geolibre/core";
import { resolveTacticalRuleKey } from "./catalog";

const COLOR_BY_AFFILIATION: Record<MilAffiliation, string> = {
  FRIENDLY: "#4A7FCE",
  HOSTILE: "#CE4A4A",
  NEUTRAL: "#4ACE8C",
  UNKNOWN: "#A8A8A8",
};

function svgDataUri(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function tacticalMiniIconDataUri(
  sidc: string,
  geometryType: "LineString" | "Polygon",
  affiliation: MilAffiliation,
): string {
  const color = COLOR_BY_AFFILIATION[affiliation] ?? COLOR_BY_AFFILIATION.UNKNOWN;
  const ruleKey = resolveTacticalRuleKey(sidc, geometryType);

  if (ruleKey === "direction_of_attack") {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><path d='M4 20 L18 14' fill='none' stroke='${color}' stroke-width='2.5' stroke-linecap='round'/><path d='M18 14 L13 10 L28 12 L16 21 Z' fill='${color}'/></svg>`;
    return svgDataUri(svg);
  }

  if (ruleKey === "flot") {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><path d='M3 18 L29 18' fill='none' stroke='${color}' stroke-width='2.3'/><path d='M9 18 L9 23 M15 18 L15 23 M21 18 L21 23' fill='none' stroke='${color}' stroke-width='2'/></svg>`;
    return svgDataUri(svg);
  }

  if (ruleKey === "no_fire_area") {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><polygon points='5,7 27,7 24,25 7,24' fill='${color}' fill-opacity='0.18' stroke='${color}' stroke-width='2'/><path d='M8 22 L24 10 M10 25 L26 13' stroke='${color}' stroke-width='1.4' stroke-opacity='0.9'/></svg>`;
    return svgDataUri(svg);
  }

  if (ruleKey === "fortified_area") {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><polygon points='6,8 26,8 26,24 6,24' fill='${color}' fill-opacity='0.15' stroke='${color}' stroke-width='2'/><path d='M7 10 L25 10 M7 14 L25 14 M7 18 L25 18 M7 22 L25 22' stroke='${color}' stroke-width='1.1' stroke-opacity='0.9'/></svg>`;
    return svgDataUri(svg);
  }

  if (geometryType === "Polygon") {
    return svgDataUri(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><polygon points='6,8 27,10 24,25 7,23' fill='${color}' fill-opacity='0.17' stroke='${color}' stroke-width='2'/></svg>`);
  }

  return svgDataUri(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><path d='M4 21 L28 11' fill='none' stroke='${color}' stroke-width='2.4' stroke-linecap='round'/></svg>`);
}
