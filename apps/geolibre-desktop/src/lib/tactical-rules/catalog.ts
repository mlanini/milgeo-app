export type TacticalGraphicRuleKey =
  | "direction_of_attack"
  | "flot"
  | "no_fire_area"
  | "fortified_area"
  | "fallback";

function functionTokenFromSidc(sidc: string): string {
  const normalized = sidc.trim().toUpperCase();
  if (normalized.length < 10) return "";
  return normalized.slice(4, 10).replace(/[^A-Z0-9]/g, "");
}

export function resolveTacticalRuleKey(
  sidc: string,
  geometryType: "LineString" | "Polygon",
): TacticalGraphicRuleKey {
  const token = functionTokenFromSidc(sidc);

  if (geometryType === "LineString") {
    if (token.startsWith("OLK") || token === "PF") return "direction_of_attack";
    if (token.startsWith("GLF")) return "flot";
    return "fallback";
  }

  if (geometryType === "Polygon") {
    if (token.startsWith("ACN")) return "no_fire_area";
    if (token.startsWith("GAF")) return "fortified_area";
    return "fallback";
  }

  return "fallback";
}
