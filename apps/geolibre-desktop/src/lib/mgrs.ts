/**
 * mgrs.ts
 * Lightweight WGS-84 lon/lat → MGRS coordinate converter.
 * Implements the Redfearn / Helmert series for UTM then the standard
 * 100 km grid-square lookup for MGRS.
 *
 * Reference: Defense Mapping Agency TM 8358.1 / FGDC-STD-011-2001
 */

// ─── WGS-84 ellipsoid constants ───────────────────────────────────────────────
const DEG  = Math.PI / 180;
const A    = 6_378_137.0;               // semi-major axis (m)
const F    = 1 / 298.257_223_563;       // flattening
const E2   = 2 * F - F * F;             // first eccentricity squared
const EP2  = E2 / (1 - E2);             // second eccentricity squared
const K0   = 0.9996;                    // UTM scale on central meridian

// Meridional arc series coefficients
const MC0 = 1 - E2 / 4 - 3 * E2 ** 2 / 64 - 5 * E2 ** 3 / 256;
const MC2 = 3 / 8   * E2 + 3  / 32   * E2 ** 2 + 45 / 1024 * E2 ** 3;
const MC4 = 15 / 256 * E2 ** 2 + 45 / 1024 * E2 ** 3;
const MC6 = 35 / 3072 * E2 ** 3;

// ─── MGRS letter tables ───────────────────────────────────────────────────────
const BAND_LETTERS = "CDEFGHJKLMNPQRSTUVWX"; // 20 latitude bands, 8° each

// Easting 100 km sets (cycles every 3 zones: 1-3, 4-6, …)
const E_SET = ["ABCDEFGH", "JKLMNPQR", "STUVWXYZ"];

// Northing 100 km sets (cycles odd / even zones)
const N_SET = [
  "ABCDEFGHJKLMNPQRSTUV", // odd zones
  "FGHJKLMNPQRSTUVABCDE", // even zones
];

// ─── UTM conversion ───────────────────────────────────────────────────────────

interface Utm {
  zone:     number;
  easting:  number;
  northing: number;
}

function toUtm(lon: number, lat: number): Utm {
  // Determine UTM zone (with Norway / Svalbard exceptions)
  let zone = Math.floor((lon + 180) / 6) + 1;
  if (lat >= 56 && lat < 64 && lon >= 3 && lon < 12) zone = 32;
  if (lat >= 72 && lat < 84) {
    if      (lon >=  0 && lon <  9) zone = 31;
    else if (lon >=  9 && lon < 21) zone = 33;
    else if (lon >= 21 && lon < 33) zone = 35;
    else if (lon >= 33 && lon < 42) zone = 37;
  }

  const phi  = lat * DEG;
  const lam0 = ((zone - 1) * 6 - 180 + 3) * DEG; // central meridian
  const dl   = lon * DEG - lam0;
  const sp   = Math.sin(phi);
  const cp   = Math.cos(phi);
  const tp   = Math.tan(phi);

  const N  = A / Math.sqrt(1 - E2 * sp * sp);
  const T  = tp * tp;
  const C  = EP2 * cp * cp;
  const Al = cp * dl;

  const M = A * (
    MC0 * phi
    - MC2 * Math.sin(2 * phi)
    + MC4 * Math.sin(4 * phi)
    - MC6 * Math.sin(6 * phi)
  );

  const easting = K0 * N * (
    Al
    + (1 - T + C) * Al ** 3 / 6
    + (5 - 18 * T + T * T + 72 * C - 58 * EP2) * Al ** 5 / 120
  ) + 500_000;

  let northing = K0 * (
    M + N * tp * (
      Al ** 2 / 2
      + (5 - T + 9 * C + 4 * C * C)         * Al ** 4 / 24
      + (61 - 58 * T + T * T + 600 * C - 330 * EP2) * Al ** 6 / 720
    )
  );
  if (lat < 0) northing += 10_000_000; // southern hemisphere false northing

  return { zone, easting, northing };
}

// ─── 100 km grid-square letters ───────────────────────────────────────────────

function gridLetters(zone: number, easting: number, northing: number): string {
  const setIdx = (zone - 1) % 3;
  const eIdx   = Math.floor(easting / 100_000) - 1;         // 0–7
  const nIdx   = Math.floor(northing / 100_000) % 20;       // 0–19

  const eLet = E_SET[setIdx]?.[eIdx] ?? "?";
  const nLet = N_SET[zone % 2 === 1 ? 0 : 1]?.[nIdx] ?? "?";
  return eLet + nLet;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Convert WGS-84 lon/lat to an MGRS string.
 *
 * @param lon       Longitude in degrees (−180…180)
 * @param lat       Latitude in degrees  (−90…90)
 * @param precision Numeric digits per easting/northing component (1–5, default 5 = 1 m)
 * @returns         e.g. "32T NK 12345 54321"  or "Polar" for lat < −80 / > 84
 */
export function toMgrs(lon: number, lat: number, precision = 5): string {
  if (lat < -80 || lat > 84) return "Polar";
  if (lon <= -180 || lon >= 180) lon = ((lon + 180) % 360 + 360) % 360 - 180;

  const { zone, easting, northing } = toUtm(lon, lat);
  const band   = BAND_LETTERS[Math.max(0, Math.min(19, Math.floor((lat + 80) / 8)))]!;
  const sq     = gridLetters(zone, easting, northing);
  const scale  = 10 ** (5 - precision);
  const eNum   = String(Math.floor(easting  % 100_000 / scale)).padStart(precision, "0");
  const nNum   = String(Math.floor(northing % 100_000 / scale)).padStart(precision, "0");

  return `${zone}${band} ${sq} ${eNum} ${nNum}`;
}
