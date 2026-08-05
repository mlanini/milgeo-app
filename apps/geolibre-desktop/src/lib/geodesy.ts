/** Geographic coordinate as [longitude, latitude] in decimal degrees. */
export type LngLat = [number, number];

const EARTH_RADIUS_METERS = 6371008.8;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

/** Great-circle distance between two coordinates, in meters. */
export function geodesicDistanceMeters(a: LngLat, b: LngLat): number {
  const dLat = (b[1] - a[1]) * DEG_TO_RAD;
  const dLng = (b[0] - a[0]) * DEG_TO_RAD;
  const lat1 = a[1] * DEG_TO_RAD;
  const lat2 = b[1] * DEG_TO_RAD;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(s)));
}

/**
 * Sum of great-circle segment lengths along a path.
 * Returns 0 for fewer than two vertices.
 */
export function pathDistanceMeters(path: LngLat[]): number {
  if (path.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < path.length; i += 1) {
    total += geodesicDistanceMeters(path[i - 1], path[i]);
  }
  return total;
}

/** Initial great-circle bearing from `from` to `to`, in degrees [0, 360). */
export function initialBearingDegrees(from: LngLat, to: LngLat): number {
  const lat1 = from[1] * DEG_TO_RAD;
  const lat2 = to[1] * DEG_TO_RAD;
  const dLng = (to[0] - from[0]) * DEG_TO_RAD;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  const raw = Math.atan2(y, x) * RAD_TO_DEG;
  return (raw + 360) % 360;
}

/** Geodesic midpoint between two coordinates. */
export function midpointLngLat(a: LngLat, b: LngLat): LngLat {
  const lat1 = a[1] * DEG_TO_RAD;
  const lon1 = a[0] * DEG_TO_RAD;
  const lat2 = b[1] * DEG_TO_RAD;
  const dLon = (b[0] - a[0]) * DEG_TO_RAD;

  const bx = Math.cos(lat2) * Math.cos(dLon);
  const by = Math.cos(lat2) * Math.sin(dLon);

  const lat3 = Math.atan2(
    Math.sin(lat1) + Math.sin(lat2),
    Math.sqrt((Math.cos(lat1) + bx) ** 2 + by ** 2),
  );
  const lon3 = lon1 + Math.atan2(by, Math.cos(lat1) + bx);

  let lonDeg = lon3 * RAD_TO_DEG;
  if (lonDeg > 180) lonDeg -= 360;
  if (lonDeg < -180) lonDeg += 360;
  return [lonDeg, lat3 * RAD_TO_DEG];
}
