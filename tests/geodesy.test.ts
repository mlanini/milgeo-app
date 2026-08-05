import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  geodesicDistanceMeters,
  initialBearingDegrees,
  midpointLngLat,
  pathDistanceMeters,
} from "../apps/geolibre-desktop/src/lib/geodesy";

function close(actual: number, expected: number, tolerance: number): void {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  );
}

describe("geodesicDistanceMeters", () => {
  it("is approximately 111.2 km for one degree of latitude", () => {
    close(geodesicDistanceMeters([0, 0], [0, 1]), 111195, 500);
  });

  it("returns zero for identical coordinates", () => {
    assert.equal(geodesicDistanceMeters([12.3, 45.6], [12.3, 45.6]), 0);
  });
});

describe("pathDistanceMeters", () => {
  it("sums consecutive great-circle segments", () => {
    const d = pathDistanceMeters([
      [0, 0],
      [0, 1],
      [0, 2],
    ]);
    close(d, 2 * 111195, 1000);
  });

  it("returns zero for empty and single-point paths", () => {
    assert.equal(pathDistanceMeters([]), 0);
    assert.equal(pathDistanceMeters([[0, 0]]), 0);
  });
});

describe("initialBearingDegrees", () => {
  it("is ~90 degrees when heading due east on the equator", () => {
    close(initialBearingDegrees([0, 0], [1, 0]), 90, 0.5);
  });

  it("is ~0 degrees when heading due north", () => {
    close(initialBearingDegrees([0, 0], [0, 1]), 0, 0.5);
  });
});

describe("midpointLngLat", () => {
  it("returns the midpoint on an equatorial segment", () => {
    const [lon, lat] = midpointLngLat([0, 0], [2, 0]);
    close(lon, 1, 0.01);
    close(lat, 0, 0.01);
  });

  it("returns a finite coordinate for long segments", () => {
    const [lon, lat] = midpointLngLat([-120, 30], [45, -15]);
    assert.ok(Number.isFinite(lon));
    assert.ok(Number.isFinite(lat));
    assert.ok(lon >= -180 && lon <= 180);
    assert.ok(lat >= -90 && lat <= 90);
  });
});
