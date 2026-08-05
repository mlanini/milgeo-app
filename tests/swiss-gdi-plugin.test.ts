import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSwissGdiCapabilitiesUrl,
  buildSwissGdiLegendGraphicUrl,
  buildSwissGdiWmsEndpoint,
  normalizeSwissGdiLanguage,
  SWISS_GDI_PLUGIN_ID,
} from "../apps/geolibre-desktop/src/lib/swiss-gdi";
import { createSwissGdiPlugin } from "../apps/geolibre-desktop/src/plugins/swiss-gdi-plugin";

test("swiss gdi plugin registers and opens its workspace panel", async () => {
  const registrations: Array<{ id: string; title: string }> = [];
  const opened: string[] = [];

  const app = {
    registerRightPanel: (panel: { id: string; title: string }) => {
      registrations.push({ id: panel.id, title: panel.title });
      return () => undefined;
    },
    openRightPanel: (id: string) => {
      opened.push(id);
      return true;
    },
  } as any;

  const plugin = createSwissGdiPlugin();

  assert.equal(plugin.id, SWISS_GDI_PLUGIN_ID);
  await plugin.activate(app);
  assert.equal(registrations[0]?.id, SWISS_GDI_PLUGIN_ID);
  assert.deepEqual(opened, [SWISS_GDI_PLUGIN_ID]);
});

test("swiss gdi helper normalizes language and builds endpoint URLs", () => {
  assert.equal(normalizeSwissGdiLanguage("it-CH"), "it");
  assert.equal(normalizeSwissGdiLanguage("es"), "en");
  assert.equal(buildSwissGdiWmsEndpoint("fr"), "https://wms.geo.admin.ch/fr/");
  assert.equal(
    buildSwissGdiCapabilitiesUrl("en"),
    "https://wms.geo.admin.ch/en/?SERVICE=WMS&REQUEST=GetCapabilities&VERSION=1.3.0",
  );
  assert.match(
    buildSwissGdiLegendGraphicUrl("ch.bafu.bundesinventare-bln", "de"),
    /REQUEST=GetLegendGraphic/,
  );
  assert.match(
    buildSwissGdiLegendGraphicUrl("ch.bafu.bundesinventare-bln", "de"),
    /LAYERS=ch.bafu.bundesinventare-bln/,
  );
});