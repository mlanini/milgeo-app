# Refactor Implementation Backlog

Date: 2026-08-05

## 2026-09-01 Scope lock

- Priority order starts from terrain analysis and related coordinate workflows.
- Line-of-sight remains beta and is delivered inside the unified height-profile flow.
- MILX interoperability includes full export and bidirectional mapping.
- MILX interoperability excludes cartouche import or export in this release.
- SDL interoperability is explicitly out of scope for now.
- Delivery targets are web on Render and desktop, with iterative Render validation.
- Classification set is fixed to UNCLASSIFIED, RESTRICTED, CONFIDENTIAL, SECRET, TOP SECRET.

## Progress log

### 2026-09-01 - S1.1 terrain audit complete

- Confirmed terrain tool availability and outputs across Analysis panel and Raster toolbox.
- Confirmed sidecar analysis outputs are PNG overlays, while raster toolbox outputs are GeoTIFF files.
- Logged constraints and readiness notes in docs/migration/05-s1-1-terrain-tools-audit.md.

### 2026-09-01 - S1.2 unified profile+LOS flow complete

- Merged elevation profile and line-of-sight into a single guided workflow in the Analysis panel.
- LOS is now an explicit beta overlay toggle inside the Elevation Profile tool.
- Added LOS observer and target height parameters in the same profile workflow.
- Removed the standalone LOS tool entry to enforce one operational flow.

### 2026-09-01 - S1.3 guided terrain presets complete

- Added guided operator presets for Slope, Hillshade, and Viewshed in the Analysis panel.
- Presets now provide operational intent text and recommended area limits per workflow.
- Viewshed presets now include guided observer-centered radius defaults for consistent AOI selection.

### 2026-09-01 - S1.4 terrain performance guardrails complete

- Added hard maximum AOI area validation for terrain sidecar workflows.
- Added preset-level recommended area checks to prevent slow or unstable requests.
- Added online DEM guardrail for very large AOIs with actionable fallback guidance to local DTM or tiled runs.

### 2026-09-01 - S2 coordinates parity complete

- Added LV03 and LV95 coordinate support for smart-paste and manual Set View entry.
- Kept a single active coordinate representation in Set View with explicit DD, DMS, DDM, LV03, and LV95 modes.
- Extended coordinate and geodetic acceptance tests with Swiss-grid and antimeridian scenarios.
- Added operator shortcuts for coordinate and measurement workflows.

### 2026-09-01 - S3 military authoring and MILX interoperability complete

- Audited draw/edit tactical workflows and added keyboard shortcuts for Enter, Esc, and Ctrl/Cmd+Z.
- Confirmed tactical redlining presets for point, line, and area collection flows.
- Added MILXLYZ support for import and export, including ZIP safety guardrails.
- Implemented APP6D-preserving MilX roundtrip tests for symbols and tactical graphics.
- Kept cartouche metadata explicitly out of scope.

### 2026-09-01 - S4 GPS, offline, and templates complete

- Kept GPX scope at MVP level in field workflows, focused on waypoint and route capture parity.
- Added a Field Collection setup selector for online standard and offline field templates.
- Wired offline template presets into setup so operators can prefill layer name, geometry, and form fields in one action.
- Added a project roundtrip regression test that preserves field collection schema, geometry, and captured features across reopen/restore.
- Validated offline workflow readiness through existing PWA/runtime offline coverage plus collection-layer persistence checks.

### 2026-09-01 - S5 print/search/roundtrip increment

- Added neutral tactical print templates with A4/A3/A2/A1/A0 landscape presets.
- Extended print layout paper support to A2, A1, and A0.
- Added classification field handling with fixed-value validation in the print title block.
- Added tactical export guardrails requiring active UTM/MGRS grid and minimum metadata (title + classification).
- Expanded layer panel search to a single surface for place, coordinate, H3, layer, and geocoding provider matches.
- Added dedicated KML and GeoPackage roundtrip tests for import/export fidelity.
- Verified curated geodata catalog profiles with open default basemap policy and ArcGIS profiles scoped to feasible non-default entries.

### 2026-09-01 - Planning lock complete

- Closed the pre-implementation decision set for scope, priorities, and constraints.
- Confirmed fixed classification values: UNCLASSIFIED, RESTRICTED, CONFIDENTIAL, SECRET, TOP SECRET.
- Confirmed MILX bidirectional import/export scope without cartouche support.
- Confirmed print metadata scope to title and classification only, with neutral NATO-like templates.
- Confirmed open default basemap fallback, with ArcGIS vector tile basemaps used only where feasible.
- Marked SitaWare SDL interoperability as out of scope for this release.

### 2026-08-05 - S1 increment A

- Added tactical clean-room redlining presets for Field Collection setup.
- Added keyboard-first capture shortcuts: Ctrl/Cmd+Enter creates a collection
  layer and saves a captured feature; in drawing mode, Enter finishes,
  Ctrl/Cmd+Z undoes, and Esc cancels.
- Added a geodetic measurement utility module plus acceptance tests for
  distance, path length, initial bearing, and midpoint.

## Slice S1 - Terrain and LOS priority parity

- S1.1 Completed: confirm available terrain processing tools and outputs.
- S1.2 Completed: implement a single guided flow for height profile + beta line of sight.
- S1.3 Completed: add slope/hillshade/viewshed guided presets.
- S1.4 Completed: add performance guardrails for heavy terrain operations.

## Slice S2 - Coordinates and geodetic parity

- S2.1 Completed: add LV03 and LV95 support to coordinate workflows.
- S2.2 Completed: keep one active coordinate representation at a time.
- S2.3 Completed: extend geodetic measurement acceptance tests.
- S2.4 Completed: add operator shortcuts for coordinate and measurement workflows.

## Slice S3 - Military authoring and MILX interoperability

- S3.1 Completed: audit draw/edit flows and add operator shortcuts.
- S3.2 Completed: tactical redlining presets available for point, line, and area flows.
- S3.3 Completed: MILXLY and MILXLYZ import plus full MILX export implemented.
- S3.4 Completed: bidirectional mapping validated for MilX layers/symbols, cartouche excluded.

## Slice S4 - GPS, Offline, and Templates

- S4.1 Completed: keep GPX editing MVP to waypoint and route, geometry plus name only.
- S4.2 Completed: add online standard and offline field template selector.
- S4.3 Completed: validate PWA cache behavior for offline field workflows.
- S4.4 Completed: add regression tests for offline reopen and restore.

## Slice S5 - Print, Search, and Catalog parity

- S5.1 Completed: add tactical print templates from A4 to A0, portrait and landscape.
- S5.2 Completed: add MGRS grid and minimum metadata fields: title and classification only.
- S5.3 Completed: merge place/layer/provider search into one operator surface.
- S5.4 Completed: add curated geodata catalog profiles with open default basemaps and ArcGIS vector tile basemaps only where feasible.
- S5.5 Completed: validate KML/GPKG import/export roundtrip fidelity.
- S5.6 Completed: provide a neutral NATO-like print template set with classification value validation.

## Slice S6 - Hardening and rollout

- S6.1 Add per-slice quality gates for lint, test, build, and render output.
- S6.2 Add migration adapters for legacy project payloads.
- S6.3 Add release checklist and rollback verification for web and desktop.
- S6.4 Run final parity acceptance review with iterative Render test logs.
