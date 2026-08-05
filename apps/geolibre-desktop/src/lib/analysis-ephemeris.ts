/**
 * analysis-ephemeris.ts
 *
 * Self-contained sun & moon ephemeris calculations.
 *
 * Sun algorithm: based on NOAA Solar Calculator (Jean Meeus, Astronomical
 * Algorithms, 2nd ed.) adapted for TypeScript.
 *
 * Moon algorithm: simplified Meeus chapter 47/48 truncated to ~0.5° accuracy.
 *
 * All angles are in degrees unless noted otherwise.
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rad(d: number): number {
  return (d * Math.PI) / 180;
}
function deg(r: number): number {
  return (r * 180) / Math.PI;
}
/** Normalize degrees to [0, 360). */
function norm360(d: number): number {
  return ((d % 360) + 360) % 360;
}
/** Julian Day Number from a Date. */
function julianDay(date: Date): number {
  return date.getTime() / 86400000 + 2440587.5;
}

// ─── Solar Position ───────────────────────────────────────────────────────────

export interface SolarPosition {
  /** Azimuth from true north, degrees clockwise (0–360). */
  azimuth: number;
  /** Elevation (altitude) above horizon, degrees (-90…+90). */
  elevation: number;
  /** True zenith angle (0 at overhead). */
  zenith: number;
  /** Sun rise time (local ISO string), or null if midnight sun / polar night. */
  sunriseUtc: Date | null;
  /** Sun set time (local ISO string), or null if midnight sun / polar night. */
  sunsetUtc: Date | null;
  /** Solar noon UTC. */
  solarNoonUtc: Date | null;
  /** Day length in minutes. */
  dayLengthMin: number;
}

/**
 * Compute solar position and rise/set times.
 * @param date   Observation date/time (UTC preferred)
 * @param lat    Observer latitude  (degrees)
 * @param lon    Observer longitude (degrees, positive east)
 */
export function solarEphemeris(
  date: Date,
  lat: number,
  lon: number,
): SolarPosition {
  const jd = julianDay(date);
  const jc = (jd - 2451545.0) / 36525.0; // Julian century

  // Geometric mean longitude of the sun (degrees)
  const L0 = norm360(280.46646 + jc * (36000.76983 + jc * 0.0003032));
  // Geometric mean anomaly of the sun (degrees)
  const M = norm360(357.52911 + jc * (35999.05029 - 0.0001537 * jc));
  // Sun's equation of centre
  const C =
    Math.sin(rad(M)) * (1.914602 - jc * (0.004817 + 0.000014 * jc)) +
    Math.sin(rad(2 * M)) * (0.019993 - 0.000101 * jc) +
    Math.sin(rad(3 * M)) * 0.000289;
  // Sun's true longitude
  const sunLon = L0 + C;
  // Apparent longitude
  const omega = 125.04 - 1934.136 * jc;
  const lambda = sunLon - 0.00569 - 0.00478 * Math.sin(rad(omega));
  // Mean obliquity of the ecliptic
  const epsilon0 =
    23 +
    (26 + (21.448 - jc * (46.8150 + jc * (0.00059 - jc * 0.001813))) / 60) /
      60;
  // Corrected obliquity
  const epsilon = epsilon0 + 0.00256 * Math.cos(rad(omega));
  // Sun's right ascension
  let RA = deg(Math.atan2(Math.cos(rad(epsilon)) * Math.sin(rad(lambda)), Math.cos(rad(lambda))));
  RA = norm360(RA);
  // Declination
  const decl = deg(Math.asin(Math.sin(rad(epsilon)) * Math.sin(rad(lambda))));

  // Equation of time (minutes)
  const y = Math.tan(rad(epsilon / 2)) ** 2;
  const eqTime =
    4 *
    deg(
      y * Math.sin(2 * rad(L0)) -
        2 * 0.016708634 * Math.sin(rad(M)) +
        4 * 0.016708634 * y * Math.sin(rad(M)) * Math.cos(2 * rad(L0)) -
        0.5 * y * y * Math.sin(4 * rad(L0)) -
        1.25 * 0.016708634 * 0.016708634 * Math.sin(2 * rad(M)),
    );

  // Hour angle for sunset (positive = sunset, negative = sunrise)
  const HA_arg =
    Math.cos(rad(90.833)) /
      (Math.cos(rad(lat)) * Math.cos(rad(decl))) -
    Math.tan(rad(lat)) * Math.tan(rad(decl));

  const fractionalDay = (date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60) / 1440;

  let sunriseUtc: Date | null = null;
  let sunsetUtc: Date | null = null;
  let solarNoonUtc: Date | null = null;
  let dayLengthMin = 0;

  if (Math.abs(HA_arg) <= 1) {
    const HA = deg(Math.acos(HA_arg));
    const solarNoonMinUtc = (720 - 4 * lon - eqTime + 0) / 1440; // fraction of day
    const solarNoonMs =
      Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
      ) +
      solarNoonMinUtc * 86400000;
    const sunriseMs = solarNoonMs - HA * 4 * 60000;
    const sunsetMs = solarNoonMs + HA * 4 * 60000;
    solarNoonUtc = new Date(solarNoonMs);
    sunriseUtc = new Date(sunriseMs);
    sunsetUtc = new Date(sunsetMs);
    dayLengthMin = HA * 8;
  }

  // Hour angle at observation time
  const trueSolarTimeMin =
    ((fractionalDay * 1440 + eqTime + 4 * lon) % 1440 + 1440) % 1440;
  const hourAngle =
    trueSolarTimeMin < 0 ? trueSolarTimeMin / 4 + 180 : trueSolarTimeMin / 4 - 180;

  // Solar zenith angle
  const cosZenith =
    Math.sin(rad(lat)) * Math.sin(rad(decl)) +
    Math.cos(rad(lat)) * Math.cos(rad(decl)) * Math.cos(rad(hourAngle));
  const zenith = deg(Math.acos(Math.max(-1, Math.min(1, cosZenith))));
  const elevation = 90 - zenith;

  // Azimuth
  const cosAz =
    (Math.sin(rad(lat)) * Math.cos(rad(zenith)) - Math.sin(rad(decl))) /
    (Math.cos(rad(lat)) * Math.sin(rad(zenith)));
  let azimuth =
    hourAngle > 0
      ? norm360(deg(Math.acos(Math.max(-1, Math.min(1, cosAz)))) + 180)
      : norm360(540 - deg(Math.acos(Math.max(-1, Math.min(1, cosAz)))));

  return {
    azimuth,
    elevation,
    zenith,
    sunriseUtc,
    sunsetUtc,
    solarNoonUtc,
    dayLengthMin,
  };
}

// ─── Moon Position & Phase ────────────────────────────────────────────────────

export interface LunarPosition {
  /** Azimuth from true north, degrees clockwise (0–360). */
  azimuth: number;
  /** Elevation above horizon, degrees. */
  elevation: number;
  /** Illuminated fraction of the lunar disk (0–1). */
  illumination: number;
  /** Phase name. */
  phaseName: string;
  /** Approximate moonrise UTC (same-day), or null. */
  moonriseUtc: Date | null;
  /** Approximate moonset UTC (same-day), or null. */
  moonsetUtc: Date | null;
}

function moonPhaseAngle(jd: number): number {
  // Simplified (Meeus ch. 25 – first-order)
  const T = (jd - 2451545.0) / 36525.0;
  const D =
    norm360(297.85036 + 445267.111480 * T - 0.0019142 * T * T);
  const M =
    norm360(357.52772 + 35999.050340 * T - 0.0001603 * T * T);
  const Mp =
    norm360(134.96298 + 477198.867398 * T + 0.0086972 * T * T);
  const F =
    norm360(93.27191 + 483202.017538 * T - 0.0036825 * T * T);

  // Longitude
  const lp =
    218.3165 +
    481267.8813 * T +
    6.289 * Math.sin(rad(Mp)) -
    1.274 * Math.sin(rad(2 * D - Mp)) +
    0.658 * Math.sin(rad(2 * D)) -
    0.214 * Math.sin(rad(2 * Mp)) -
    0.114 * Math.sin(rad(D));

  // Sun longitude
  const sunLp = norm360(
    280.46646 + T * (36000.76983 + T * 0.0003032),
  );

  return norm360(lp - sunLp);
}

function phaseName(phaseAngle: number): string {
  const p = norm360(phaseAngle);
  if (p < 22.5 || p >= 337.5) return "New Moon";
  if (p < 67.5) return "Waxing Crescent";
  if (p < 112.5) return "First Quarter";
  if (p < 157.5) return "Waxing Gibbous";
  if (p < 202.5) return "Full Moon";
  if (p < 247.5) return "Waning Gibbous";
  if (p < 292.5) return "Last Quarter";
  return "Waning Crescent";
}

/** Simplified moon position (geocentric RA/Dec → local azimuth/elevation). */
export function lunarEphemeris(
  date: Date,
  lat: number,
  lon: number,
): LunarPosition {
  const jd = julianDay(date);
  const T = (jd - 2451545.0) / 36525.0;

  // Simplified geocentric ecliptic longitude/latitude (Meeus ch. 47)
  const D = norm360(297.85036 + 445267.11148 * T);
  const M = norm360(357.52772 + 35999.05034 * T);
  const Mp = norm360(134.96298 + 477198.867398 * T);
  const F = norm360(93.27191 + 483202.017538 * T);

  const moonLon =
    218.3165 +
    481267.8813 * T +
    6.2888 * Math.sin(rad(Mp)) -
    1.2740 * Math.sin(rad(2 * D - Mp)) +
    0.6583 * Math.sin(rad(2 * D)) -
    0.2136 * Math.sin(rad(2 * Mp)) +
    0.1851 * Math.sin(rad(M)) -
    0.1143 * Math.sin(rad(2 * F)) +
    0.0588 * Math.sin(rad(2 * D - 2 * Mp)) +
    0.0572 * Math.sin(rad(2 * D - M - Mp)) +
    0.0533 * Math.sin(rad(2 * D + Mp));

  const moonLat =
    5.1282 * Math.sin(rad(F)) +
    0.2806 * Math.sin(rad(Mp + F)) +
    0.2777 * Math.sin(rad(Mp - F)) +
    0.1732 * Math.sin(rad(2 * D - F)) +
    0.0550 * Math.sin(rad(2 * D + F - Mp)) +
    0.0465 * Math.sin(rad(2 * D + F));

  // Convert ecliptic → equatorial
  const epsilon =
    23.439291 - 0.013004 * T;
  const moonLonR = rad(moonLon);
  const moonLatR = rad(moonLat);
  const epsR = rad(epsilon);

  const declination = deg(
    Math.asin(
      Math.sin(moonLatR) * Math.cos(epsR) +
        Math.cos(moonLatR) * Math.sin(epsR) * Math.sin(moonLonR),
    ),
  );
  const RA = deg(
    Math.atan2(
      -Math.sin(moonLatR) * Math.sin(epsR) +
        Math.cos(moonLatR) * Math.cos(epsR) * Math.sin(moonLonR),
      Math.cos(moonLatR) * Math.cos(moonLonR),
    ),
  );

  // Greenwich Sidereal Time
  const GST = norm360(280.46061837 + 360.98564736629 * (jd - 2451545.0));
  const LST = norm360(GST + lon);
  const hourAngle = norm360(LST - RA);

  // Altitude
  const sinAlt =
    Math.sin(rad(lat)) * Math.sin(rad(declination)) +
    Math.cos(rad(lat)) * Math.cos(rad(declination)) * Math.cos(rad(hourAngle));
  const elevation = deg(Math.asin(Math.max(-1, Math.min(1, sinAlt))));

  // Azimuth
  const cosAz =
    (Math.sin(rad(declination)) - Math.sin(rad(lat)) * sinAlt) /
    (Math.cos(rad(lat)) * Math.cos(rad(elevation)));
  let azimuth = deg(Math.acos(Math.max(-1, Math.min(1, cosAz))));
  if (Math.sin(rad(hourAngle)) > 0) azimuth = 360 - azimuth;

  // Phase
  const phaseAngle = moonPhaseAngle(jd);
  const illumination = (1 - Math.cos(rad(phaseAngle))) / 2;

  // Approximate rise/set (scan by checking elevation sign crossing)
  let moonriseUtc: Date | null = null;
  let moonsetUtc: Date | null = null;
  const startOfDay = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  );
  let prevElev = -999;
  for (let h = 0; h <= 24; h++) {
    const t = new Date(startOfDay + h * 3600000);
    const pos = lunarElevationOnly(t, lat, lon);
    if (prevElev < 0 && pos >= 0 && moonriseUtc === null) {
      moonriseUtc = new Date(startOfDay + h * 3600000);
    } else if (prevElev >= 0 && pos < 0 && moonsetUtc === null) {
      moonsetUtc = new Date(startOfDay + h * 3600000);
    }
    prevElev = pos;
  }

  return {
    azimuth,
    elevation,
    illumination,
    phaseName: phaseName(phaseAngle),
    moonriseUtc,
    moonsetUtc,
  };
}

/** Faster version of lunarEphemeris that only returns elevation (for rise/set scan). */
function lunarElevationOnly(date: Date, lat: number, lon: number): number {
  const jd = julianDay(date);
  const T = (jd - 2451545.0) / 36525.0;
  const Mp = norm360(134.96298 + 477198.867398 * T);
  const D = norm360(297.85036 + 445267.11148 * T);
  const F = norm360(93.27191 + 483202.017538 * T);
  const moonLon =
    218.3165 +
    481267.8813 * T +
    6.2888 * Math.sin(rad(Mp)) -
    1.274 * Math.sin(rad(2 * D - Mp)) +
    0.6583 * Math.sin(rad(2 * D));
  const moonLat =
    5.1282 * Math.sin(rad(F));
  const epsilon = 23.439291 - 0.013004 * T;
  const decl = deg(
    Math.asin(
      Math.sin(rad(moonLat)) * Math.cos(rad(epsilon)) +
        Math.cos(rad(moonLat)) * Math.sin(rad(epsilon)) * Math.sin(rad(moonLon)),
    ),
  );
  const RA = deg(
    Math.atan2(
      Math.cos(rad(moonLat)) * Math.cos(rad(epsilon)) * Math.sin(rad(moonLon)),
      Math.cos(rad(moonLat)) * Math.cos(rad(moonLon)),
    ),
  );
  const GST = norm360(280.46061837 + 360.98564736629 * (jd - 2451545.0));
  const LST = norm360(GST + lon);
  const HA = norm360(LST - RA);
  const sinAlt =
    Math.sin(rad(lat)) * Math.sin(rad(decl)) +
    Math.cos(rad(lat)) * Math.cos(rad(decl)) * Math.cos(rad(HA));
  return deg(Math.asin(Math.max(-1, Math.min(1, sinAlt))));
}

/** Format a UTC Date as HH:MM (UTC) string. */
export function formatTimeUtc(date: Date | null): string {
  if (!date) return "—";
  return `${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")} UTC`;
}
