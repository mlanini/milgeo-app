import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { milGraphicsToGeoJson } from "../apps/geolibre-desktop/src/lib/milgraphic-geojson";

describe("milGraphicsToGeoJson", () => {
  it("closes polygon rings and preserves directional line metadata", () => {
    const result = milGraphicsToGeoJson([
      {
        id: "line-1",
        name: "Main attack",
        SIDC: "G*G*OLKGM-",
        geometryType: "LineString",
        coordinates: [
          [7.4, 46.9],
          [7.6, 47.0],
        ],
        affiliation: "HOSTILE",
        tacticalDirectional: true,
      },
      {
        id: "poly-1",
        name: "Restricted area",
        SIDC: "G*M*OGR---",
        geometryType: "Polygon",
        coordinates: [
          [7.0, 46.8],
          [7.2, 46.8],
          [7.2, 47.0],
        ],
        affiliation: "FRIENDLY",
      },
    ]);

    assert.equal(result.type, "FeatureCollection");
    assert.equal(result.features.length, 2);

    const line = result.features.find((f) => f.geometry.type === "LineString");
    const polygon = result.features.find((f) => f.geometry.type === "Polygon");
    assert.ok(line);
    assert.ok(polygon);

    assert.equal(line.properties?.directional, 1);
    assert.equal(line.properties?.color, "#CE4A4A");

    const ring = polygon.geometry.coordinates[0];
    assert.equal(ring.length, 4);
    assert.deepEqual(ring[0], ring[ring.length - 1]);
  });

  it("drops invalid geometries", () => {
    const result = milGraphicsToGeoJson([
      {
        id: "bad-line",
        name: "Invalid line",
        SIDC: "X",
        geometryType: "LineString",
        coordinates: [[7.1, 46.9]],
        affiliation: "UNKNOWN",
      },
      {
        id: "bad-poly",
        name: "Invalid polygon",
        SIDC: "Y",
        geometryType: "Polygon",
        coordinates: [
          [7.0, 46.0],
          [7.1, 46.0],
        ],
        affiliation: "NEUTRAL",
      },
    ]);

    assert.equal(result.features.length, 0);
  });
});
