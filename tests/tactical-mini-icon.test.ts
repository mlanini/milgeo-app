import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { tacticalMiniIconDataUri } from "../apps/geolibre-desktop/src/lib/tactical-rules/mini-icon";

describe("tactical mini icon", () => {
  it("builds svg data uri for whitelist rules", () => {
    const doa = tacticalMiniIconDataUri("G*G*OLKGM-", "LineString", "HOSTILE");
    const flot = tacticalMiniIconDataUri("G*G*GLF---", "LineString", "FRIENDLY");
    const nfa = tacticalMiniIconDataUri("G*F*ACNI--", "Polygon", "NEUTRAL");

    assert.equal(doa.startsWith("data:image/svg+xml;utf8,"), true);
    assert.equal(flot.startsWith("data:image/svg+xml;utf8,"), true);
    assert.equal(nfa.startsWith("data:image/svg+xml;utf8,"), true);
  });
});
