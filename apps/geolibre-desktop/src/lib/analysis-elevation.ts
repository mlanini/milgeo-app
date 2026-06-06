/**
 * analysis-elevation.ts
 *
 * Elevation API clients for the Analysis panel.
 *
 * Two backends are supported:
 *  - swisstopo (https://api3.geo.admin.ch): free, sub-metre accuracy, CH only
 *  - OpenTopoData (https://api.opentopodata.org): free, global SRTM 90 m
 *
 * For raster DEM downloads (Slope, Hillshade, Viewshed) the OpenTopography
 * portal API is used (API key required; routed through the Python sidecar).
 */

/** A [longitude, latitude] pair. */
export type LonLat = [number, number];

/** One elevation sample result. */
export interface ElevationSample {
  lon: number;
  lat: number;
  elevationM: number | null;
  source: "swisstopo" | "opentopodata" | "unknown";
}

// ─── Bounding box for Switzerland ────────────────────────────────────────────
const CH_WEST = 5.95;
const CH_EAST = 10.49;
const CH_SOUTH = 45.82;
const CH_NORTH = 47.81;

function isInSwitzerland(lon: number, lat: number): boolean {
  return (
    lon >= CH_WEST && lon <= CH_EAST && lat >= CH_SOUTH && lat <= CH_NORTH
  );
}

// ─── swisstopo ────────────────────────────────────────────────────────────────

/**
 * Query a single point elevation via the swisstopo height service.
 * Swiss coordinates only; returns null for points outside Switzerland.
 */
export async function swisstopoElevation(
  lon: number,
  lat: number,
): Promise<number | null> {
  if (!isInSwitzerland(lon, lat)) return null;

  const url = `https://api3.geo.admin.ch/rest/services/height?easting=${lon}&northing=${lat}&sr=4326`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const data = (await resp.json()) as { height?: string | number };
    const h = Number(data.height);
    return Number.isFinite(h) ? h : null;
  } catch {
    return null;
  }
}

// ─── OpenTopoData ─────────────────────────────────────────────────────────────

/** Maximum points per OpenTopoData request (their free-tier limit). */
const OPENTOPO_BATCH_SIZE = 100;
const OPENTOPO_DATASET = "srtm90m";

/**
 * Query up to 100 points via OpenTopoData SRTM 90 m.
 * Returns elevationM = null for sea/ocean or failed lookups.
 */
export async function openTopoDataBatch(
  points: LonLat[],
): Promise<Array<number | null>> {
  if (points.length === 0) return [];
  const locations = points
    .map(([lon, lat]) => `${lat.toFixed(6)},${lon.toFixed(6)}`)
    .join("|");
  const url = `https://api.opentopodata.org/v1/${OPENTOPO_DATASET}?locations=${locations}`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) return points.map(() => null);
    const data = (await resp.json()) as {
      results?: Array<{ elevation?: number | null }>;
      status?: string;
    };
    if (data.status !== "OK" || !data.results) return points.map(() => null);
    return data.results.map((r) =>
      typeof r.elevation === "number" ? r.elevation : null,
    );
  } catch {
    return points.map(() => null);
  }
}

// ─── Smart elevation router ───────────────────────────────────────────────────

/**
 * Query elevations for an array of points using the best available source.
 * - swisstopo for points inside Switzerland
 * - OpenTopoData for everything else
 *
 * Batches requests to respect API limits.
 */
export async function queryElevations(
  points: LonLat[],
  onProgress?: (done: number, total: number) => void,
): Promise<ElevationSample[]> {
  const results: ElevationSample[] = [];

  const chPoints: Array<{ idx: number; lon: number; lat: number }> = [];
  const globalPoints: Array<{ idx: number; lon: number; lat: number }> = [];

  for (let i = 0; i < points.length; i++) {
    const [lon, lat] = points[i];
    if (isInSwitzerland(lon, lat)) {
      chPoints.push({ idx: i, lon, lat });
    } else {
      globalPoints.push({ idx: i, lon, lat });
    }
  }

  // Pre-fill results
  for (const [lon, lat] of points) {
    results.push({ lon, lat, elevationM: null, source: "unknown" });
  }

  // swisstopo (sequential, no batch endpoint)
  let done = 0;
  for (const { idx, lon, lat } of chPoints) {
    const h = await swisstopoElevation(lon, lat);
    results[idx] = { lon, lat, elevationM: h, source: "swisstopo" };
    onProgress?.(++done, points.length);
  }

  // OpenTopoData in batches
  for (let start = 0; start < globalPoints.length; start += OPENTOPO_BATCH_SIZE) {
    const batch = globalPoints.slice(start, start + OPENTOPO_BATCH_SIZE);
    const elevs = await openTopoDataBatch(batch.map(({ lon, lat }) => [lon, lat]));
    for (let j = 0; j < batch.length; j++) {
      const { idx, lon, lat } = batch[j];
      results[idx] = { lon, lat, elevationM: elevs[j], source: "opentopodata" };
      onProgress?.(++done, points.length);
    }
  }

  return results;
}

// ─── Min / Max / Mean helpers ─────────────────────────────────────────────────

export interface ElevationStats {
  minM: number;
  maxM: number;
  meanM: number;
  count: number;
}

export function elevationStats(samples: ElevationSample[]): ElevationStats {
  const valid = samples
    .map((s) => s.elevationM)
    .filter((h): h is number => h !== null);

  if (valid.length === 0) {
    return { minM: 0, maxM: 0, meanM: 0, count: 0 };
  }

  let min = Infinity;
  let max = -Infinity;
  let sum = 0;

  for (const h of valid) {
    if (h < min) min = h;
    if (h > max) max = h;
    sum += h;
  }

  return { minM: min, maxM: max, meanM: sum / valid.length, count: valid.length };
}

// ─── OpenTopography raster DEM (for sidecar) ──────────────────────────────────

export interface OpenTopoDemRequest {
  south: number;
  north: number;
  west: number;
  east: number;
  demType?: "SRTMGL1" | "SRTMGL3" | "AW3D30" | "COP30";
  apiKey: string;
}

/**
 * Build an OpenTopography API URL for downloading a raster DEM.
 * Intended to be fetched by the Python sidecar (the binary response is a
 * GeoTIFF that needs GDAL processing).
 */
export function buildOpenTopoDemUrl(req: OpenTopoDemRequest): string {
  const params = new URLSearchParams({
    demtype: req.demType ?? "SRTMGL1",
    south: req.south.toFixed(6),
    north: req.north.toFixed(6),
    west: req.west.toFixed(6),
    east: req.east.toFixed(6),
    outputFormat: "GTiff",
    API_Key: req.apiKey,
  });
  return `https://portal.opentopography.org/API/globaldem?${params.toString()}`;
}

// ─── Simple polygon grid sampler ─────────────────────────────────────────────

/**
 * Generate a regular grid of sample points inside the bounding box of
 * `coords` (polygon ring).  Used for Min/Max Elevation analysis.
 *
 * @param coords Ring of [lon, lat] points (closed or open)
 * @param targetCount Approximate number of sample points
 */
export function gridSamplePolygon(
  coords: LonLat[],
  targetCount: number,
): LonLat[] {
  if (coords.length === 0) return [];

  const lons = coords.map((c) => c[0]);
  const lats = coords.map((c) => c[1]);
  const west = Math.min(...lons);
  const east = Math.max(...lons);
  const south = Math.min(...lats);
  const north = Math.max(...lats);

  const aspectRatio = (east - west) / (north - south);
  const cols = Math.max(2, Math.round(Math.sqrt(targetCount * aspectRatio)));
  const rows = Math.max(2, Math.round(targetCount / cols));

  const points: LonLat[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lon = west + ((c + 0.5) / cols) * (east - west);
      const lat = south + ((r + 0.5) / rows) * (north - south);
      if (pointInPolygon([lon, lat], coords)) {
        points.push([lon, lat]);
      }
    }
  }

  // If polygon is very thin and the grid missed everything, fall back to
  // sampling along the boundary.
  if (points.length === 0) {
    return coords.slice(0, targetCount) as LonLat[];
  }

  return points;
}

/** Ray-casting point-in-polygon test. */
function pointInPolygon(pt: LonLat, ring: LonLat[]): boolean {
  const [x, y] = pt;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}
