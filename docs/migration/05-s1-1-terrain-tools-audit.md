# S1.1 Terrain Tools Audit

Date: 2026-09-01
Scope: confirm available terrain processing tools and their outputs for MilGeo web (Render) and desktop.
Method: static code and test audit (no runtime execution in this environment).

## Summary

The terrain capability baseline is present, with two execution surfaces:

1. Analysis panel workflows for mission operations.
2. Raster toolbox workflows for file-oriented processing.

## Confirmed tools and outputs

| Tool/Workflow | Where | Engine | Main input | Output | Evidence |
| --- | --- | --- | --- | --- | --- |
| Elevation profile | Analysis panel | Client compute + elevation sampling API | Drawn line | Arrays of sampled elevations/distances (downloaded as analysis JSON) | apps/geolibre-desktop/src/components/analysis/AnalysisPanel.tsx, apps/geolibre-desktop/src/lib/analysis-elevation.ts |
| Line of sight (beta) | Analysis panel | Client compute | Drawn line + sampled elevations | Visibility boolean array along profile transect | apps/geolibre-desktop/src/components/analysis/AnalysisPanel.tsx, apps/geolibre-desktop/src/lib/analysis-measure.ts |
| Min/Max elevation | Analysis panel | Client compute + elevation sampling API | Drawn polygon | Min/Max/mean elevation stats | apps/geolibre-desktop/src/components/analysis/AnalysisPanel.tsx |
| Slope map | Analysis panel | Python sidecar analysis endpoint | BBox from drawn geometry + DEM source | PNG data URL overlay image | apps/geolibre-desktop/src/components/analysis/AnalysisPanel.tsx, backend/geolibre_server/geolibre_server/app/analysis.py |
| Hillshade | Analysis panel | Python sidecar analysis endpoint | BBox from drawn geometry + DEM source | PNG data URL overlay image | apps/geolibre-desktop/src/components/analysis/AnalysisPanel.tsx, backend/geolibre_server/geolibre_server/app/analysis.py |
| Viewshed | Analysis panel | Python sidecar analysis endpoint | Observer point (mapped to bbox center) + DEM source | Binary PNG data URL (255 visible / 0 hidden) | apps/geolibre-desktop/src/components/analysis/AnalysisPanel.tsx, backend/geolibre_server/geolibre_server/app/analysis.py |
| Slope | Raster toolbox | Client (geotiff.js) and sidecar | Input GeoTIFF | GeoTIFF raster output (default slope.tif) | packages/processing/src/raster-tools.ts, packages/processing/src/raster-client.ts |
| Hillshade | Raster toolbox | Client (geotiff.js) and sidecar | Input GeoTIFF | GeoTIFF raster output (default hillshade.tif) | packages/processing/src/raster-tools.ts, packages/processing/src/raster-client.ts |

## Constraints found during audit

1. Analysis-panel slope/hillshade/viewshed currently require either:
- OpenTopography API key, or
- local DTM path/data.

2. The sidecar analysis endpoints return image overlays, not persisted GeoTIFF outputs.

3. Viewshed API currently uses fixed observer height defaults server-side and does not expose mission parameters yet.

4. Local DTM path sampling is desktop-local sidecar oriented; web mode depends on online APIs or in-browser GeoTIFF data.

## Test evidence

1. Client raster terrain compute is covered in unit tests for slope/hillshade formulas and NoData handling.
2. Backend raster tool scripts include terrain coverage (hillshade/slope) and output type checks.
3. Map terrain enable/disable behavior is covered in controller tests.

Evidence files:
- tests/raster-client.test.ts
- backend/geolibre_server/tests/test_raster.py
- tests/map-controller.test.ts

## S1.1 conclusion

S1.1 is complete: terrain tools and outputs are confirmed in code for both web and desktop targets.

Readiness for S1.2:
- Good baseline exists for a unified height-profile + LOS beta flow.
- Main work is UX unification and operator presets, not backend creation from scratch.
