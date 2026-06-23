/**
 * coordinates.ts
 *
 * Helpers to convert between WGS-84 longitude/latitude and MGRS
 * (Military Grid Reference System) strings, plus light parsing/formatting
 * used by the MilGeo coordinate inputs.
 *
 * MGRS conversion is delegated to the `mgrs` package (the same one proj4 uses).
 */
import mgrs from "mgrs";

/** Default MGRS precision: 5 digits ⇒ 1 m resolution. */
export const MGRS_ACCURACY = 5;

/** True when the value is a finite number in a sensible coordinate range. */
function isFiniteNum(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

/**
 * Convert [lon, lat] to an MGRS string. Returns "" when the input is invalid
 * (out of range or non-finite) or when conversion throws (e.g. polar regions
 * outside UTM coverage).
 */
export function lonLatToMgrs(
  lon: number,
  lat: number,
  accuracy: number = MGRS_ACCURACY,
): string {
  if (!isFiniteNum(lon) || !isFiniteNum(lat)) return "";
  if (lat < -80 || lat > 84) return ""; // UTM/MGRS undefined near the poles
  try {
    return mgrs.forward([lon, lat], accuracy);
  } catch {
    return "";
  }
}

/**
 * Parse an MGRS string to [lon, lat]. Whitespace and case are normalised.
 * Returns null when the string is empty or cannot be parsed.
 */
export function mgrsToLonLat(value: string): [number, number] | null {
  const cleaned = value.replace(/\s+/g, "").toUpperCase();
  if (!cleaned) return null;
  try {
    const point = mgrs.toPoint(cleaned);
    if (!Array.isArray(point) || point.length < 2) return null;
    const [lon, lat] = point;
    if (!isFiniteNum(lon) || !isFiniteNum(lat)) return null;
    return [lon, lat];
  } catch {
    return null;
  }
}

/** Round a coordinate to a fixed number of decimals, dropping trailing noise. */
export function roundCoord(n: number, decimals = 6): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

/** Clamp latitude to [-90, 90]; returns null when not finite. */
export function normalizeLat(n: number): number | null {
  if (!isFiniteNum(n)) return null;
  return Math.min(90, Math.max(-90, n));
}

/** Wrap longitude into [-180, 180]; returns null when not finite. */
export function normalizeLon(n: number): number | null {
  if (!isFiniteNum(n)) return null;
  let lon = n;
  while (lon > 180) lon -= 360;
  while (lon < -180) lon += 360;
  return lon;
}
