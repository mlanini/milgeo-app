import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { before, describe, it } from "node:test";
import { DOMParser } from "linkedom";
import type { FeatureCollection } from "geojson";
import initSqlJs from "sql.js";
import type { SqlJsStatic } from "sql.js";
import { parseKmlText } from "../apps/geolibre-desktop/src/lib/kml";
import { writeKml } from "../apps/geolibre-desktop/src/lib/kml-writer";
import { readGeoPackageSync } from "../apps/geolibre-desktop/src/lib/gpkg-reader";
import { writeGeoPackageSync } from "../apps/geolibre-desktop/src/lib/geopackage-writer";

const require = createRequire(import.meta.url);
let SQL: SqlJsStatic;

before(async () => {
  globalThis.DOMParser = DOMParser as unknown as typeof globalThis.DOMParser;
  const wasmPath = require.resolve("sql.js/dist/sql-wasm.wasm");
  SQL = await initSqlJs({ locateFile: () => wasmPath });
});

const SAMPLE: FeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [7.4386, 46.9511] },
      properties: { name: "Bern", category: "city", priority: 1 },
    },
    {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [
          [7.4386, 46.9511],
          [8.5417, 47.3769],
        ],
      },
      properties: { name: "Route", category: "line", priority: 2 },
    },
  ],
};

describe("vector roundtrip", () => {
  it("round-trips KML geometry and key attributes", () => {
    const kml = writeKml(SAMPLE, "Ops layer");
    const parsed = parseKmlText(kml);

    assert.equal(parsed.features.length, 2);
    assert.equal(parsed.features[0].geometry?.type, "Point");
    assert.equal(parsed.features[1].geometry?.type, "LineString");
    assert.equal(parsed.features[0].properties?.name, "Bern");
    // KML ExtendedData is string-backed; preserve value fidelity, not JS types.
    assert.equal(String(parsed.features[0].properties?.priority), "1");
  });

  it("round-trips GeoPackage geometry and attributes", () => {
    const bytes = writeGeoPackageSync(SQL, SAMPLE, "ops");
    const { featureCollection, epsgCode } = readGeoPackageSync(SQL, bytes);

    assert.equal(epsgCode, null);
    assert.equal(featureCollection.features.length, 2);
    assert.deepEqual(featureCollection.features[0].geometry, SAMPLE.features[0].geometry);
    assert.deepEqual(featureCollection.features[1].geometry, SAMPLE.features[1].geometry);
    assert.equal(featureCollection.features[0].properties?.name, "Bern");
    assert.equal(featureCollection.features[0].properties?.priority, 1);
  });
});
