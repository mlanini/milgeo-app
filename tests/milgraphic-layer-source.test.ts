import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  parseMilGraphicLayerSource,
  serializeMilGraphicLayerSource,
  type MilGraphicLayerItem,
} from "../apps/geolibre-desktop/src/lib/milgraphic-layer-source";

describe("milgraphic-layer-source", () => {
  it("migrates legacy tactical source to schemaVersion=2 records", () => {
    const parsed = parseMilGraphicLayerSource({
      SIDC: "G*G*GLF---",
      geometryType: "LineString",
      coordinates: [
        [7.41, 46.92],
        [7.55, 46.97],
      ],
      affiliation: "FRIENDLY",
      name: "FLOT 1",
    });

    assert.equal(parsed.graphics.length, 1);
    const graphic = parsed.graphics[0];
    assert.equal(graphic.sidcOriginal, "G*G*GLF---");
    assert.equal(graphic.sidcCanonical, null);
    assert.equal(graphic.ruleKey, "flot");
    assert.equal(graphic.migration?.migrated, false);
    assert.equal(graphic.migration?.reason, "sidc-not-canonical");
    assert.equal(parsed.diagnostics.length, 1);
    assert.equal(parsed.diagnostics[0].reason, "sidc-not-canonical");
  });

  it("serializes canonical source with schemaVersion=2 and graphics array", () => {
    const graphics: MilGraphicLayerItem[] = [
      {
        id: "g1",
        name: "No Fire",
        SIDC: "10032000000000000000",
        geometryType: "Polygon",
        coordinates: [
          [7.2, 46.8],
          [7.4, 46.8],
          [7.4, 46.9],
        ],
        affiliation: "HOSTILE",
      },
    ];

    const source = serializeMilGraphicLayerSource(graphics);
    assert.equal(source.schemaVersion, 2);
    assert.equal(Array.isArray(source.graphics), true);
    assert.equal(source.graphics.length, 1);
    assert.equal(source.graphics[0].sidcCanonical, "10032000000000000000");
  });

  it("hard-skips non-migratable records with invalid geometry", () => {
    const parsed = parseMilGraphicLayerSource({
      graphics: [
        {
          id: "ok",
          name: "Fortified",
          SIDC: "G*G*GAF---",
          geometryType: "Polygon",
          coordinates: [
            [7.0, 46.7],
            [7.1, 46.7],
            [7.1, 46.8],
          ],
          affiliation: "FRIENDLY",
        },
        {
          id: "bad",
          name: "Broken",
          SIDC: "G*G*GLF---",
          geometryType: "LineString",
          coordinates: [[7.0, 46.7]],
          affiliation: "FRIENDLY",
        },
      ],
    });

    assert.equal(parsed.graphics.length, 1);
    assert.equal(parsed.graphics[0].id, "ok");
    assert.equal(parsed.diagnostics.some((diag) => diag.itemId === "bad"), true);
  });
});
