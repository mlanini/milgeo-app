import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_LAYER_STYLE, type GeoLibreLayer } from "@geolibre/core";
import type { FeatureCollection } from "geojson";
import { parseMilGraphicLayerSource } from "../apps/geolibre-desktop/src/lib/milgraphic-layer-source";
import { parseMilSymbolLayerSource } from "../apps/geolibre-desktop/src/lib/milsymbol-layer-source";
import { mapQgisMilxLayers } from "../apps/geolibre-desktop/src/lib/qgis-milx-layer-mapping";

function qgisGeoJsonLayer(name: string, geojson: FeatureCollection): GeoLibreLayer {
  return {
    id: crypto.randomUUID(),
    name,
    type: "geojson",
    source: { type: "geojson" },
    visible: true,
    opacity: 1,
    style: { ...DEFAULT_LAYER_STYLE },
    metadata: { importedFrom: "qgis", localFileReloadable: true },
    sourcePath: "/work/data/sample.geojson",
    geojson,
  };
}

describe("QGIS MILX mapping", () => {
  it("converts Symbol ID features to mil-symbol and mil-graphic layers", () => {
    const input: FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [12.5, 41.9] },
          properties: {
            "Symbol ID": "10031000000000000000",
            Name: "Unit A",
            T: "Alpha",
            M: "HQ 1",
          },
        },
        {
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: [
              [12.5, 41.9],
              [12.6, 42.0],
            ],
          },
          properties: {
            "Symbol ID": "10031000000000000000",
            name: "Axis",
            tacticalFamily: "Command & Control",
            direction: 45,
          },
        },
      ],
    };

    const layers = mapQgisMilxLayers([qgisGeoJsonLayer("MILX Layer", input)]);

    assert.equal(layers.length, 2);
    const symbolLayer = layers.find((layer) => layer.type === "mil-symbol");
    const graphicLayer = layers.find((layer) => layer.type === "mil-graphic");
    assert.ok(symbolLayer);
    assert.ok(graphicLayer);

    const symbols = parseMilSymbolLayerSource(symbolLayer?.source).symbols;
    const graphics = parseMilGraphicLayerSource(graphicLayer?.source).graphics;

    assert.equal(symbols.length, 1);
    assert.equal(symbols[0].SIDC, "10031000000000000000");
    assert.equal(symbols[0].uniqueDesignation, "Alpha");
    assert.equal(symbols[0].higherFormation, "HQ 1");

    assert.equal(graphics.length, 1);
    assert.equal(graphics[0].SIDC, "10031000000000000000");
    assert.equal(graphics[0].geometryType, "LineString");
    assert.equal(graphics[0].tacticalFamily, "Command & Control");
    assert.equal(graphics[0].tacticalDirectional, true);
  });

  it("keeps unconvertible features in a raw fallback geojson layer", () => {
    const input: FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [12.5, 41.9] },
          properties: {
            "Symbol ID": "10031000000000000000",
            Name: "Convertible",
          },
        },
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [13.0, 42.1] },
          properties: {
            "Symbol ID": "NOT_A_VALID_SIDC",
            Name: "Invalid",
          },
        },
      ],
    };

    const layers = mapQgisMilxLayers([qgisGeoJsonLayer("Mixed Layer", input)]);

    assert.equal(layers.length, 2);
    const symbolLayer = layers.find((layer) => layer.type === "mil-symbol");
    const fallback = layers.find((layer) => layer.type === "geojson");

    assert.ok(symbolLayer);
    assert.ok(fallback);
    assert.equal(fallback?.name, "Mixed Layer (raw)");
    assert.equal(fallback?.sourcePath, undefined);
    assert.equal(fallback?.metadata.localFileReloadable, undefined);
    assert.equal(fallback?.geojson?.features.length, 1);
    assert.equal(fallback?.geojson?.features[0].properties?.Name, "Invalid");
  });
});
