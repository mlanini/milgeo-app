# KADAS to GeoLibre Parity Matrix

Date: 2026-08-05
Legend: Present | Partial | Missing | Needs Validation

## 2026-09-01 Product decisions lock

- Implementation priority is terrain analysis first.
- Coordinate workflows must include LV03 and LV95 in addition to DD, DMS, UTM, and MGRS.
- Line-of-sight is accepted as beta and must be integrated in the height profile workflow.
- GPS MVP scope is waypoint and route editing with geometry and name only.
- Offline MVP scope is PWA cache plus two templates: online standard and offline field.
- Tactical print scope is A4 to A0, portrait and landscape, MGRS grid, and metadata: title and classification only.
- Classification values are fixed to: UNCLASSIFIED, RESTRICTED, CONFIDENTIAL, SECRET, TOP SECRET.
- MILX interoperability is in scope with full export and bidirectional mapping.
- MILX mapping excludes cartouche import or export in this release.
- SitaWare SDL interoperability is out of scope until public, authoritative format documentation becomes available.
- Target platforms are web on Render and desktop.
- Validation strategy is iterative testing on Render.

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
| K21 | Slope/hillshade/viewshed | Partial | processing/terrain stack | Priority P0: guided operator workflows and presets |
| K22 | Line of sight | Needs Validation | processing + map overlays | Beta inside unified height-profile workflow |

## Search, Catalog, Data IO

| ID | Capability | Current Status | Evidence Area | Target Action |
| --- | --- | --- | --- | --- |
| K30 | Integrated search | Partial | assistant/search modules | Add geodata + place + layer unified search |
| K31 | Integrated geodata catalog | Partial | add-data and providers | Add curated catalog profiles |
| K32 | KML/GPKG import and export | Present | kml/gpkg modules | Validate full roundtrip compatibility |
| K33 | MILX layer interoperability | Partial | milsymbol plugin + import/export modules | Add MILXLY/MILXLYZ import/export with full bidirectional mapping, excluding cartouche |

## GPS, Offline, Printing

| ID | Capability | Current Status | Evidence Area | Target Action |
| --- | --- | --- | --- | --- |
| K40 | GPS geolocation and GPX editing | Partial | gpx and mobile hooks | MVP: waypoint and route editing (geometry + name) |
| K41 | Online/offline project templates | Partial | offline regions/tiles | Add two templates: online standard + offline field |
| K42 | User-friendly printing | Present | print layout and export modules | Neutral NATO-like templates A4-A0 portrait/landscape + MGRS + metadata (title, classification) |

## Grids and Coordinates

| ID | Capability | Current Status | Evidence Area | Target Action |
| --- | --- | --- | --- | --- |
| K50 | Advanced grids (UTM/MGRS/guide) | Partial | MapGrid and mgrs utilities | Add LV03/LV95 support and enforce one active coordinate representation |

## Validation notes

- Status values above are initial assumptions from code inventory and must be verified with run-time checks and tests.
- No parity claim is final before tests and UX acceptance are complete.
- SDL is intentionally excluded from this parity target due to insufficient public format references.
- Basemap catalog profiles should prefer open defaults, using ArcGIS vector tiles only where technically and operationally feasible.
