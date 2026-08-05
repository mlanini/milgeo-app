# Swiss GDI Plugin

Standalone GeoLibre external plugin source for Swiss GDI.

This folder is prepared to ship through the curated GeoLibre plugin registry at
<https://plugins.geolibre.app>.

## What this folder contains

- `src/`: standalone plugin source with its own host API contract.
- `geolibre-plugin/plugin.json`: GeoLibre manifest ready for a published bundle.
- `publish/registry-entry.json`: draft entry for `plugin-registry.json` in `opengeos/geolibre-plugins`.
- `scripts/package-geolibre-plugin.mjs`: packaging helper that mirrors the built bundle into a publish-ready folder.
- `scripts/validate-geolibre-plugin.mjs`: consistency checks for package metadata, manifest, registry entry, and built entry output.

## Registry readiness checklist

- `plugin.json` contains the required `id`, `name`, `version`, and `entry` fields.
- The plugin bundle exports a `GeoLibrePlugin` as both `plugin` and default export.
- The exported plugin does not set `activeByDefault`.
- `publish/registry-entry.json` contains the required registry fields and a relative `manifestUrl` suitable for `plugins.geolibre.app`.
- `npm run prepare:plugins-site` builds the ESM bundle and stages a publish-ready folder at `publish/plugins/geolibre-swiss-gdi/`.

## Publication flow

1. Install dependencies.
2. Run `npm run prepare:plugins-site`.
3. Copy `publish/plugins/geolibre-swiss-gdi/` into `plugins/geolibre-swiss-gdi/` in `opengeos/geolibre-plugins`.
4. Merge `publish/registry-entry.json` into `plugin-registry.json`.
5. Run `npm run minify` in `opengeos/geolibre-plugins` if you are working from a fork and CI cannot push the minified bundle back.
6. Open a pull request against `opengeos/geolibre-plugins`.

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
