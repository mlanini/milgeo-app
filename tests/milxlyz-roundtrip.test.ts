import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DOMParser } from "linkedom";
import { strToU8, zipSync } from "fflate";
import { DEFAULT_LAYER_STYLE, type GeoLibreLayer } from "@geolibre/core";
import {
  parseAnyMilFormatFromBytesForStore,
  parseMilXForStore,
} from "../apps/geolibre-desktop/src/lib/milsymbol-import-to-store";
import {
  buildMilXDocument,
} from "../apps/geolibre-desktop/src/lib/milsymbol-export-formats";
import {
  serializeMilSymbolLayerSource,
} from "../apps/geolibre-desktop/src/lib/milsymbol-layer-source";
import {
  serializeMilGraphicLayerSource,
} from "../apps/geolibre-desktop/src/lib/milgraphic-layer-source";

globalThis.DOMParser = DOMParser as unknown as typeof globalThis.DOMParser;

describe("MILXLYZ interoperability", () => {
  it("imports a zipped .milxlyz archive", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<MilXDocument_Layer xmlns="http://gs-soft.com/MilX/V3.1">
  <MssLibraryVersionTag>2025.02.20</MssLibraryVersionTag>
  <MilXLayer>
    <Name>Ops Layer</Name>
    <LayerType>Normal</LayerType>
    <GraphicList>
      <MilXGraphic>
        <MssStringXML>&lt;Symbol ID="10031000000000000000"&gt;&lt;Attribute ID="APP6D"&gt;10031000000000000000&lt;/Attribute&gt;&lt;Attribute ID="T"&gt;ALPHA&lt;/Attribute&gt;&lt;/Symbol&gt;</MssStringXML>
        <Name>Unit Alpha</Name>
        <PointList>
          <Point><X>7.45</X><Y>46.95</Y></Point>
        </PointList>
        <Offset><FactorX>0</FactorX><FactorY>0</FactorY></Offset>
      </MilXGraphic>
      <MilXGraphic>
        <MssStringXML>&lt;Symbol ID="10032500130000000000"&gt;&lt;Attribute ID="APP6D"&gt;10032500130000000000&lt;/Attribute&gt;&lt;Attribute ID="T"&gt;BOUNDARY&lt;/Attribute&gt;&lt;/Symbol&gt;</MssStringXML>
        <Name>Boundary</Name>
        <PointList>
          <Point><X>7.4</X><Y>46.9</Y></Point>
          <Point><X>7.6</X><Y>47.0</Y></Point>
        </PointList>
        <Offset><FactorX>0</FactorX><FactorY>0</FactorY></Offset>
      </MilXGraphic>
    </GraphicList>
  </MilXLayer>
  <CoordSystemType>WGS84</CoordSystemType>
  <SymbolSize>12</SymbolSize>
</MilXDocument_Layer>`;

    const bytes = zipSync({ "ops.milxly": strToU8(xml) });
    const parsed = parseAnyMilFormatFromBytesForStore(bytes, "ops.milxlyz", "ops");

    assert.equal(parsed.layers.length, 1);
    assert.equal(parsed.layers[0].symbols.length, 1);
    assert.equal(parsed.layers[0].graphics.length, 1);
    assert.equal(parsed.layers[0].symbols[0].sidc, "10031000000000000000");
    assert.equal(parsed.layers[0].graphics[0].sidc, "10032500130000000000");
  });

  it("round-trips APP6D SIDC through MilX export/import", () => {
    const symbolLayer: GeoLibreLayer = {
      id: "symbol-layer",
      name: "Blue Force",
      type: "mil-symbol",
      visible: true,
      opacity: 1,
      style: { ...DEFAULT_LAYER_STYLE },
      metadata: {},
      source: serializeMilSymbolLayerSource([
        {
          id: "sym-1",
          name: "Alpha",
          SIDC: "10031000000000000000",
          lon: 7.45,
          lat: 46.95,
          affiliation: "FRIENDLY",
          uniqueDesignation: "ALPHA",
          higherFormation: "HQ 1",
          additionalInformation: "OBS",
          direction: 90,
          speed: "20",
        },
      ], 38),
    };

    const graphicLayer: GeoLibreLayer = {
      id: "graphic-layer",
      name: "Graphics",
      type: "mil-graphic",
      visible: true,
      opacity: 1,
      style: { ...DEFAULT_LAYER_STYLE },
      metadata: {},
      source: serializeMilGraphicLayerSource([
        {
          id: "gr-1",
          name: "Boundary",
          SIDC: "10032500130000000000",
          geometryType: "LineString",
          coordinates: [[7.4, 46.9], [7.6, 47.0]],
          affiliation: "FRIENDLY",
          uniqueDesignation: "BOUNDARY",
          additionalInfo: "Phase",
        },
      ]) as unknown as Record<string, unknown>,
    };

    const xml = buildMilXDocument([symbolLayer, graphicLayer], "roundtrip");
    const parsed = parseMilXForStore(xml, "roundtrip");

    assert.equal(parsed.layers.length, 1);
    assert.equal(parsed.layers[0].symbols.length, 1);
    assert.equal(parsed.layers[0].graphics.length, 1);
    assert.equal(parsed.layers[0].symbols[0].sidc, "10031000000000000000");
    assert.equal(parsed.layers[0].symbols[0].higherFormation, "HQ 1");
    assert.equal(parsed.layers[0].graphics[0].sidc, "10032500130000000000");
    assert.equal(parsed.layers[0].graphics[0].geometryType, "LineString");
  });
});
