# KADAS to GeoLibre Parity Matrix

Date: 2026-08-05
Legend: Present | Partial | Missing | Needs Validation

## Core UX and Mapping

| ID | Capability | Current Status | Evidence Area | Target Action |
| --- | --- | --- | --- | --- |
| K01 | Streamlined operational UI | Needs Validation | apps/geolibre-desktop/src/components/layout | UX profile and operator presets |
| K02 | Multiple synchronized map views | Needs Validation | map controller / layout | Verify side-by-side and sync controls |
| K03 | 3D globe visualization | Present | map plugins / maplibre integrations | Validate military overlays in 3D |

## Drawing, Redlining, Symbols

| ID | Capability | Current Status | Evidence Area | Target Action |
| --- | --- | --- | --- | --- |
| K10 | Redlining geometries and pins | Needs Validation | geo editor tools | Build KADAS-style quick workflows |
| K11 | Georeferenced pictures/annotations | Partial | georeference dialogs | Add one-click field workflow |
| K12 | Military symbology workflows | Present | milsymbol libs and plugin | Add parity tests for common symbol sets |

## Measurement, Terrain, Analysis

| ID | Capability | Current Status | Evidence Area | Target Action |
| --- | --- | --- | --- | --- |
| K20 | Geodetic measurement suite | Needs Validation | coordinates/measurement tools | Add acceptance tests and UX shortcuts |
| K21 | Slope/hillshade/viewshed | Partial | processing/terrain stack | Provide guided task flows and presets |
| K22 | Line of sight | Needs Validation | processing + map overlays | Implement LOS panel if absent |

## Search, Catalog, Data IO

| ID | Capability | Current Status | Evidence Area | Target Action |
| --- | --- | --- | --- | --- |
| K30 | Integrated search | Partial | assistant/search modules | Add geodata + place + layer unified search |
| K31 | Integrated geodata catalog | Partial | add-data and providers | Add curated catalog profiles |
| K32 | KML/GPKG import and export | Present | kml/gpkg modules | Validate full roundtrip compatibility |

## GPS, Offline, Printing

| ID | Capability | Current Status | Evidence Area | Target Action |
| --- | --- | --- | --- | --- |
| K40 | GPS geolocation and GPX editing | Partial | gpx and mobile hooks | Add waypoint/route editor parity |
| K41 | Online/offline project templates | Partial | offline regions/tiles | Add profile-driven offline templates |
| K42 | User-friendly printing | Present | print layout and export modules | Add tactical print templates |

## Grids and Coordinates

| ID | Capability | Current Status | Evidence Area | Target Action |
| --- | --- | --- | --- | --- |
| K50 | Advanced grids (UTM/MGRS/guide) | Partial | MapGrid and mgrs utilities | Add guide-grid modes and tests |

## Validation notes

- Status values above are initial assumptions from code inventory and must be verified with run-time checks and tests.
- No parity claim is final before tests and UX acceptance are complete.
