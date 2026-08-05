# Refactor Implementation Backlog

Date: 2026-08-05

## Progress log

### 2026-08-05 - S1 increment A

- Added tactical clean-room redlining presets for Field Collection setup.
- Added keyboard-first capture shortcuts: Ctrl/Cmd+Enter creates a collection
  layer and saves a captured feature; in drawing mode, Enter finishes,
  Ctrl/Cmd+Z undoes, and Esc cancels.
- Added a geodetic measurement utility module plus acceptance tests for
  distance, path length, initial bearing, and midpoint.

## Slice S1 - Redlining and Measurement parity

- S1.1 Audit existing draw/edit flows and define operator shortcuts.
- S1.2 Add tactical redlining presets (styles, symbols, pin defaults).
- S1.3 Add geodetic measurement acceptance tests.
- S1.4 Add keyboard-first workflows for field operations.

## Slice S2 - Terrain and LOS parity

- S2.1 Confirm available terrain processing tools and outputs.
- S2.2 Implement or refine line-of-sight workflow panel.
- S2.3 Add slope/hillshade/viewshed guided presets.
- S2.4 Add performance guardrails for heavy terrain operations.

## Slice S3 - GPS, Offline, and Templates

- S3.1 Expand GPX route/waypoint editing UX.
- S3.2 Add online/offline project template selector.
- S3.3 Add offline cache governance (size/expiry/visibility).
- S3.4 Add regression tests for offline reopen and restore.

## Slice S4 - Search, Catalog, and Print parity

- S4.1 Merge place/layer/provider search into one operator surface.
- S4.2 Add curated geodata catalog profiles.
- S4.3 Add tactical print templates and legend presets.
- S4.4 Validate KML/GPKG import/export roundtrip fidelity.

## Slice S5 - Hardening and rollout

- S5.1 Add per-slice quality gates for lint, test, build, render output.
- S5.2 Add migration adapters for legacy project payloads.
- S5.3 Add release checklist and rollback verification.
- S5.4 Run final parity acceptance review.
