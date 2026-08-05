# Swiss GDI Plugin

Standalone GeoLibre external plugin source for Swiss GDI.

## What this folder contains

- `src/`: standalone plugin source with its own host API contract.
- `geolibre-plugin/plugin.json`: GeoLibre manifest ready for a published bundle.
- `publish/registry-entry.json`: draft entry for `plugin-registry.json` in `opengeos/geolibre-plugins`.
- `scripts/package-geolibre-plugin.mjs`: packaging helper that mirrors the built bundle into a publish-ready folder.

## Publication flow

1. Install dependencies.
2. Run `npm run package:geolibre`.
3. Copy `publish/plugins/geolibre-swiss-gdi/` into `plugins/geolibre-swiss-gdi/` in `opengeos/geolibre-plugins`.
4. Merge `publish/registry-entry.json` into `plugin-registry.json`.
5. Open a pull request against `opengeos/geolibre-plugins`.

## Host requirements

This plugin expects a GeoLibre host that exposes these optional plugin API members:

- `addLayer`
- `removeLayer`
- `getLayers`
- `onLayersChange`
- `getIdentifyLayerId`
- `onIdentifyLayerChange`
- `setIdentifyLayer`
- `registerRightPanel`
- `openRightPanel`
- `closeRightPanel`

Without the layer and identify helpers the catalog still renders, but Add / active-layer management will not work.
