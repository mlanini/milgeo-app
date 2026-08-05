import assert from "node:assert/strict";
import test from "node:test";
import {
  createMilGeoPlugin,
  MILGEO_PLUGIN_ID,
} from "../apps/geolibre-desktop/src/plugins/milgeo-plugin";

test("milgeo plugin registers and opens its workspace panel", async () => {
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
    setBuiltInMapControlVisible: () => true,
    setBuiltInMapControlPosition: () => true,
    addGeoJsonLayer: () => "layer-id",
    getMap: () => null,
    fitBounds: () => undefined,
  } as any;

  const plugin = createMilGeoPlugin();

  assert.equal(plugin.id, MILGEO_PLUGIN_ID);
  await plugin.activate(app);
  assert.equal(registrations[0]?.id, MILGEO_PLUGIN_ID);
  assert.deepEqual(opened, [MILGEO_PLUGIN_ID]);

  plugin.deactivate(app);
});
