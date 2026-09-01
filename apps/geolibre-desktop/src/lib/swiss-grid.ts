/**
 * swiss-grid.ts
 * Approximate conversions between WGS84 lon/lat and Swiss national grids.
 *
 * Formulas follow swisstopo's published auxiliary-polynomial transforms:
 * - CH1903 / LV03 (EPSG:21781)
 * - CH1903+ / LV95 (EPSG:2056)
 *
 * Accuracy is suitable for operator UI workflows (set-view/search parsing), not
 * cadastral-grade surveying.
 */

export interface SwissGrid {
  easting: number;
  northing: number;
}

export type SwissGridKind = "lv03" | "lv95";

// Coarse validity ranges that cover Switzerland with a modest margin.
const LV03_E_MIN = 420_000;
const LV03_E_MAX = 900_000;
const LV03_N_MIN = 30_000;
const LV03_N_MAX = 350_000;
const LV95_E_MIN = 2_420_000;
const LV95_E_MAX = 2_900_000;
const LV95_N_MIN = 1_030_000;
const LV95_N_MAX = 1_350_000;

function toSexagesimalSeconds(deg: number): number {
  return deg * 3600;
}

/** Convert WGS84 lon/lat (degrees) to Swiss LV03 easting/northing (metres). */
export function wgs84ToLv03(lon: number, lat: number): SwissGrid {
  const latSec = toSexagesimalSeconds(lat);
  const lonSec = toSexagesimalSeconds(lon);

  const latAux = (latSec - 169_028.66) / 10_000;
  const lonAux = (lonSec - 26_782.5) / 10_000;

  const easting =
    600_072.37 +
    211_455.93 * lonAux -
    10_938.51 * lonAux * latAux -
    0.36 * lonAux * latAux ** 2 -
    44.54 * lonAux ** 3;

  const northing =
    200_147.07 +
    308_807.95 * latAux +
    3_745.25 * lonAux ** 2 +
    76.63 * latAux ** 2 -
    194.56 * lonAux ** 2 * latAux +
    119.79 * latAux ** 3;

  return { easting, northing };
}

/** Convert WGS84 lon/lat (degrees) to Swiss LV95 easting/northing (metres). */
export function wgs84ToLv95(lon: number, lat: number): SwissGrid {
  const lv03 = wgs84ToLv03(lon, lat);
  return {
    easting: lv03.easting + 2_000_000,
    northing: lv03.northing + 1_000_000,
  };
}

/** Convert Swiss LV03 easting/northing (metres) to WGS84 lon/lat (degrees). */
export function lv03ToWgs84(easting: number, northing: number): { lon: number; lat: number } {
  const y = (easting - 600_000) / 1_000_000;
  const x = (northing - 200_000) / 1_000_000;

  const latArcSec =
    16.9023892 +
    3.238272 * x -
    0.270978 * y ** 2 -
    0.002528 * x ** 2 -
    0.0447 * y ** 2 * x -
    0.014 * x ** 3;

  const lonArcSec =
    2.6779094 +
    4.728982 * y +
    0.791484 * y * x +
    0.1306 * y * x ** 2 -
    0.0436 * y ** 3;

  return {
    lat: (latArcSec * 100) / 36,
    lon: (lonArcSec * 100) / 36,
  };
}

/** Convert Swiss LV95 easting/northing (metres) to WGS84 lon/lat (degrees). */
export function lv95ToWgs84(easting: number, northing: number): { lon: number; lat: number } {
  return lv03ToWgs84(easting - 2_000_000, northing - 1_000_000);
}

export function looksLikeLv03(easting: number, northing: number): boolean {
  return (
    easting >= LV03_E_MIN &&
    easting <= LV03_E_MAX &&
    northing >= LV03_N_MIN &&
    northing <= LV03_N_MAX
  );
}

export function looksLikeLv95(easting: number, northing: number): boolean {
  return (
    easting >= LV95_E_MIN &&
    easting <= LV95_E_MAX &&
    northing >= LV95_N_MIN &&
    northing <= LV95_N_MAX
  );
}
