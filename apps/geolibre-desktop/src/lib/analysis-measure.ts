/**
 * analysis-measure.ts
 *
 * Pure client-side geodetic calculations for the Analysis panel.
 * All coordinates are [longitude, latitude] in decimal degrees (WGS-84).
 * Uses the haversine formula; accurate to ~0.5% for short distances.
 */

/** Earth mean radius in metres (WGS-84). */
const R_EARTH_M = 6_371_008.8;

/** Convert degrees to radians. */
function rad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Convert radians to degrees. */
function deg(r: number): number {
  return (r * 180) / Math.PI;
}

/**
 * Haversine distance between two points in metres.
 * @param a [lon, lat]
 * @param b [lon, lat]
 */
export function haversineDistance(
  a: [number, number],
  b: [number, number],
): number {
  const dLat = rad(b[1] - a[1]);
  const dLon = rad(b[0] - a[0]);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const h =
    sinDLat * sinDLat +
    Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * sinDLon * sinDLon;
  return 2 * R_EARTH_M * Math.asin(Math.sqrt(h));
}

/**
 * Total length of a polyline (sequence of [lon, lat] points) in metres.
 */
export function polylineLength(coords: [number, number][]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    total += haversineDistance(coords[i - 1], coords[i]);
  }
  return total;
}

/**
 * Initial bearing (azimuth) from a to b, in degrees clockwise from north
 * (0–360).
 * @param a [lon, lat]
 * @param b [lon, lat]
 */
export function bearing(a: [number, number], b: [number, number]): number {
  const lat1 = rad(a[1]);
  const lat2 = rad(b[1]);
  const dLon = rad(b[0] - a[0]);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

/**
 * Spherical excess area of a polygon (ring of [lon, lat] points) in m².
 * The ring must be closed (first === last) or will be closed automatically.
 * Uses the spherical polygon formula (L'Huilier's theorem is more accurate
 * for very large polygons, but this Girard approach is good enough here).
 *
 * Implementation: converts to stereographic excess via bearing differences.
 * Reference: https://trs.jpl.nasa.gov/handle/2014/40900
 */
export function polygonArea(coords: [number, number][]): number {
  if (coords.length < 3) return 0;

  // Ensure ring is closed
  const ring = [...coords];
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    ring.push(first);
  }

  // Spherical excess method (Bevis & Cambareri, 1987)
  let total = 0;
  const n = ring.length - 1;
  for (let i = 0; i < n; i++) {
    const lon1 = rad(ring[i][0]);
    const lon2 = rad(ring[(i + 1) % n][0]);
    const lat1 = rad(ring[i][1]);
    const lat2 = rad(ring[(i + 1) % n][1]);
    total += (lon2 - lon1) * (2 + Math.sin(lat1) + Math.sin(lat2));
  }

  return Math.abs(total * R_EARTH_M * R_EARTH_M * 0.5);
}

/** Format a distance value as a human-readable string. */
export function formatDistance(metres: number): string {
  if (metres < 1000) {
    return `${metres.toFixed(0)} m`;
  }
  const km = metres / 1000;
  return km < 100 ? `${km.toFixed(3)} km` : `${km.toFixed(1)} km`;
}

/** Format an area value as a human-readable string. */
export function formatArea(m2: number): string {
  if (m2 < 10_000) {
    return `${m2.toFixed(0)} m²`;
  }
  const ha = m2 / 10_000;
  if (ha < 100) return `${ha.toFixed(2)} ha`;
  const km2 = m2 / 1_000_000;
  return `${km2.toFixed(4)} km²`;
}

/** Format a bearing as e.g. "045.3° NE". */
export function formatBearing(azimuth: number): string {
  const b = ((azimuth % 360) + 360) % 360;
  const dirs = [
    "N", "NNE", "NE", "ENE",
    "E", "ESE", "SE", "SSE",
    "S", "SSW", "SW", "WSW",
    "W", "WNW", "NW", "NNW",
  ];
  const idx = Math.round(b / 22.5) % 16;
  return `${b.toFixed(1)}° ${dirs[idx]}`;
}

/**
 * Sample points at a regular interval along a polyline (for elevation queries).
 * Returns an array of [lon, lat] with approximately `count` points including
 * the start and end points.
 */
export function samplePolyline(
  coords: [number, number][],
  count: number,
): [number, number][] {
  if (coords.length === 0) return [];
  if (coords.length === 1 || count <= 1) return [coords[0]];

  const total = polylineLength(coords);
  if (total === 0) return [coords[0]];

  const step = total / (count - 1);
  const result: [number, number][] = [coords[0]];
  let accumulated = 0;
  let targetDist = step;

  for (let i = 1; i < coords.length; i++) {
    const segLen = haversineDistance(coords[i - 1], coords[i]);
    while (targetDist <= accumulated + segLen && result.length < count - 1) {
      const t = (targetDist - accumulated) / segLen;
      const lon = coords[i - 1][0] + t * (coords[i][0] - coords[i - 1][0]);
      const lat = coords[i - 1][1] + t * (coords[i][1] - coords[i - 1][1]);
      result.push([lon, lat]);
      targetDist += step;
    }
    accumulated += segLen;
  }

  result.push(coords[coords.length - 1]);
  return result;
}

/**
 * Distance along the polyline to reach a given point index (or intermediate
 * fraction), used for building an x-axis for elevation profiles.
 *
 * Returns an array of cumulative distances (in metres) with the same length
 * as `coords`.
 */
export function cumulativeDistances(coords: [number, number][]): number[] {
  const result: number[] = [0];
  for (let i = 1; i < coords.length; i++) {
    result.push(result[i - 1] + haversineDistance(coords[i - 1], coords[i]));
  }
  return result;
}

/**
 * Line-of-sight analysis: given an elevation profile (arrays of distances and
 * elevations), an observer height, and a target height, returns a boolean
 * array indicating whether each sample point is visible from the first point.
 */
export function lineOfSight(
  elevations: number[],
  observerHeightM = 1.8,
  targetHeightM = 0,
): boolean[] {
  if (elevations.length === 0) return [];
  const n = elevations.length;
  const result = new Array<boolean>(n).fill(false);
  result[0] = true;

  const observerElev = elevations[0] + observerHeightM;

  for (let i = 1; i < n; i++) {
    const targetElev = elevations[i] + (i === n - 1 ? targetHeightM : 0);
    const maxSlope = (targetElev - observerElev) / i;

    let blocked = false;
    for (let j = 1; j < i; j++) {
      const slope = (elevations[j] - observerElev) / j;
      if (slope > maxSlope) {
        blocked = true;
        break;
      }
    }
    result[i] = !blocked;
  }

  return result;
}
