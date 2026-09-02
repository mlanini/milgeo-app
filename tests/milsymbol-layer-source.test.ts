import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  parseMilSymbolLayerSource,
  serializeMilSymbolLayerSource,
  type MilSymbolLayerItem,
} from "../apps/geolibre-desktop/src/lib/milsymbol-layer-source";

const SAMPLE_SYMBOL: MilSymbolLayerItem = {
  id: "sym-1",
  name: "Alpha",
  SIDC: "10031000000000000000",
  lon: 7.45,
  lat: 46.95,
  affiliation: "FRIENDLY",
};

describe("milsymbol-layer-source", () => {
  it("defaults showAmplifiers to true when missing", () => {
    const parsed = parseMilSymbolLayerSource({
      symbols: [SAMPLE_SYMBOL],
      symbolSize: 42,
    });

    assert.equal(parsed.symbolSize, 42);
    assert.equal(parsed.showAmplifiers, true);
    assert.equal(parsed.symbols.length, 1);
  });

  it("round-trips explicit showAmplifiers=false", () => {
    const raw = serializeMilSymbolLayerSource([SAMPLE_SYMBOL], 38, false);
    const parsed = parseMilSymbolLayerSource(raw);

    assert.equal(parsed.showAmplifiers, false);
    assert.equal(parsed.symbolSize, 38);
    assert.equal(parsed.symbols[0].SIDC, SAMPLE_SYMBOL.SIDC);
  });
});
