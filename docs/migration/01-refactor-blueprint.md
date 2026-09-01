# MilGeo Refactor Blueprint (GeoLibre latest + KADAS parity)

Date: 2026-08-05
Scope: full clean-room refactor on top of newest GeoLibre architecture while preserving MilGeo domain features and Render deployment.

## 2026-09-01 Direction update

- Terrain analysis is the first implementation priority.
- Coordinate support must include LV03 and LV95.
- Line-of-sight is accepted as beta and must be part of the unified height-profile workflow.
- MILX interoperability requires full export and bidirectional mapping.
- MILX interoperability excludes cartouche import or export in this release.
- Print templates are neutral NATO-like and include only title and classification metadata.
- Classification is restricted to UNCLASSIFIED, RESTRICTED, CONFIDENTIAL, SECRET, TOP SECRET.
- SitaWare SDL is excluded until trustworthy public format documentation is available.
- Delivery target remains web on Render and desktop.

## 1. Objectives

- Re-base the web app on the latest GeoLibre architecture and package boundaries.
- Match KADAS Albireo user-facing functionality via clean-room implementation.
- Preserve and harden Render static deployment.
- Keep MilGeo military workflows first-class (APP-6D and tactical tooling).

## 2. Non-negotiable constraints

- No direct code reuse from KADAS (GPL-2.0): features only, no source copying.
- Preserve MIT-compatible code and dependencies.
- Keep SPA routing compatibility for static hosting.
- Avoid breaking existing project formats without migration adapters.

## 3. Migration strategy

### Phase A - Baseline and architecture lock

- Freeze baseline metrics: build time, test pass rate, key UX flows.
- Lock package interfaces for core, map, plugins, processing, ui.
- Define compatibility layer for legacy MilGeo settings and project payloads.

### Phase B - Functional parity implementation

- Deliver KADAS-equivalent capabilities in prioritized slices:
  - Terrain and line-of-sight workflows first
  - Measurement, coordinates, and geodetic tools (including LV03 and LV95)
  - Redlining and annotation workflows
  - GPS/GPX workflows
  - Grids (UTM/MGRS) and multi-view/3D
  - Printing and export/import (KML/GPKG and MILXLY/MILXLYZ, without cartouche)
  - Online/offline switching and templates

### Phase C - Stabilization and deployment hardening

- End-to-end test expansion for each parity slice.
- Performance and memory budgets for desktop/mobile browsers.
- Render deploy verification and rollback readiness.

## 4. Definition of Done

A refactor increment is done when all are true:

1. Typecheck/build/lint/test are green.
2. Render preview build is green.
3. Functional parity checks for the slice pass.
4. No regression in tactical (military) workflows.
5. Migration notes updated.

## 5. Risk register

- License contamination risk from accidental code lift.
- Parity ambiguity where KADAS behavior is UI-dependent but undocumented.
- Performance regressions in terrain and 3D features.
- Static-host constraints for advanced worker/runtime tooling.

## 6. Immediate execution plan

1. Build parity matrix with explicit status per feature.
2. Wire task board to matrix IDs.
3. Add Render-specific quality gates to CI.
4. Start with terrain+height-profile+LOS beta parity slice.
