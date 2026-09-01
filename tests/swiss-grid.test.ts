import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  looksLikeLv03,
  looksLikeLv95,
  lv03ToWgs84,
  lv95ToWgs84,
  wgs84ToLv03,
  wgs84ToLv95,
} from "../apps/geolibre-desktop/src/lib/swiss-grid";

function close(actual: number, expected: number, tolerance: number): void {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  );
}

describe("Swiss grid conversions", () => {
  it("converts the Bern LV95 false-origin reference near Bern to WGS84", () => {
    const { lon, lat } = lv95ToWgs84(2_600_000, 1_200_000);
    close(lat, 46.951, 0.02);
    close(lon, 7.439, 0.02);
  });

  it("round-trips WGS84 through LV03 and LV95", () => {
    const lon = 8.5417;
    const lat = 47.3769;

    const lv03 = wgs84ToLv03(lon, lat);
    const back03 = lv03ToWgs84(lv03.easting, lv03.northing);
    close(back03.lon, lon, 0.0005);
    close(back03.lat, lat, 0.0005);

    const lv95 = wgs84ToLv95(lon, lat);
    const back95 = lv95ToWgs84(lv95.easting, lv95.northing);
    close(back95.lon, lon, 0.0005);
    close(back95.lat, lat, 0.0005);
  });

  it("recognizes plausible Swiss projected ranges", () => {
    assert.equal(looksLikeLv03(600_000, 200_000), true);
    assert.equal(looksLikeLv95(2_600_000, 1_200_000), true);
    assert.equal(looksLikeLv03(2_600_000, 1_200_000), false);
    assert.equal(looksLikeLv95(600_000, 200_000), false);
  });
});
