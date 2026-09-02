import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { milGraphicsToRuleFeatures } from "../apps/geolibre-desktop/src/lib/tactical-rules/render-2d";

describe("tactical-rules render-2d", () => {
  it("adds right-side ticks for FLOT", () => {
    const fc = milGraphicsToRuleFeatures([
      {
        id: "flot-a",
        name: "FLOT A",
        SIDC: "G*G*GLF---",
        geometryType: "LineString",
        coordinates: [
          [7.2, 46.8],
          [7.5, 46.8],
          [7.8, 46.9],
        ],
        affiliation: "FRIENDLY",
      },
    ]);

    const main = fc.features.filter((f) => f.properties?.renderRole === "main-line");
    const ticks = fc.features.filter((f) => f.properties?.renderRole === "flot-right-tick");
    assert.equal(main.length, 1);
    assert.ok(ticks.length >= 1);
  });

  it("adds a direction-of-attack arrowhead point", () => {
    const fc = milGraphicsToRuleFeatures([
      {
        id: "doa-a",
        name: "DOA",
        SIDC: "G*G*OLKGM-",
        geometryType: "LineString",
        coordinates: [
          [7.2, 46.8],
          [7.35, 46.9],
        ],
        affiliation: "HOSTILE",
      },
    ]);

    const head = fc.features.find(
      (f) => f.geometry.type === "Point" && f.properties?.renderRole === "direction-of-attack-head",
    );
    assert.ok(head);
    assert.equal(typeof head.properties?.bearing, "number");
  });
});
