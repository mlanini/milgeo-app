# ADR: Tactical Graphics Rendering V2 (MIL-STD-2525C)

Date: 2026-09-02
Status: Accepted
Owners: MilGeo core map stack

## 1. Context

Current tactical graphics rendering is not reliable and not semantically faithful enough for MIL-STD-2525C operations.

Observed gaps:

- Tactical graphics are often reduced to generic line/fill styling instead of symbol-specific military geometry.
- Some tactical SIDC values are persisted in parameterized form and are not canonical for deterministic rendering.
- 2D and 3D renderers can diverge because they apply separate interpretation logic.
- Workspace item icons for tactical graphics are not always representative of the final map rendering.

Operational need:

- Full MIL-STD-2525C fidelity for a priority tactical subset.
- Stable rendering under style reload, reordering, and visibility/opacity changes.
- Controlled 2D/3D differences accepted when explicitly documented.

## 2. Decisions

### 2.1 Symbol fidelity and scope

- Tactical graphics must target full MIL-STD-2525C rendering semantics for a priority whitelist (V1).
- Priority whitelist V1:
  - Direction of Attack
  - FLOT (Forward Line of Own Troops)
  - No-Fire Area
  - Fortified Area
- Symbols outside whitelist V1 are rendered through explicit fallback rules and marked as non-whitelist.

### 2.2 SIDC canonicalization

- Canonical storage target is SIDC 20 digits (APP-6D) when conversion is possible.
- If deterministic conversion to 20 digits is not possible, keep original SIDC plus normalization diagnostics in metadata.
- Runtime rendering path must always consume a canonical tactical descriptor, never raw ambiguous input.

### 2.3 Migration policy

- Hard migration is enabled.
- Project load uses partial loading (not full fail):
  - Migratable tactical graphics are upgraded and rendered.
  - Non-migratable tactical graphics are skipped from rendering and reported in migration diagnostics.
- No silent acceptance of ambiguous tactical records.

### 2.4 Rendering model

- Introduce TacticalGraphicV2 canonical model in the store source payload for mil-graphic layers.
- Rendering is rule-driven:
  - Rule key selected from SIDC whitelist catalog.
  - Rule expands canonical geometry into render primitives.
- 2D and 3D must share the same semantic rule catalog.
- 3D geometry is draped on terrain by default (accepted behavior).

### 2.5 Directional semantics

- Direction of Attack uses true arrowheads with semantic orientation.
- Arrowhead size scales with zoom (NATO style preference).
- FLOT side markers/decorations are placed on the right side relative to line direction.

### 2.6 Workspace icons

- Tactical graphic icons in workspace lists use mini geometric rendering consistent with rule output.
- Do not rely on point-symbol fallback for line/polygon tactical graphics.

### 2.7 Styling constraints

- Keep current affiliation palette.
- Add dedicated tactical patterns/decorations per rule where required.

## 3. TacticalGraphicV2 canonical model

Proposed payload per graphic item (logical schema):

- id: string
- name: string
- sidcCanonical: string | null
- sidcOriginal: string
- affiliation: FRIENDLY | HOSTILE | NEUTRAL | UNKNOWN
- geometryType: LineString | Polygon
- coordinates: [lon, lat][]
- ruleKey: direction_of_attack | flot | no_fire_area | fortified_area | fallback
- modifiers:
  - directionMode (for directional rules)
  - arrowScaleHint
  - patternVariant
  - label fields as needed
- migration:
  - migrated: boolean
  - reason?: string

Notes:

- sidcCanonical is required for whitelist rules.
- fallback rule may run with sidcOriginal when canonicalization is not possible.

## 4. Rule catalog V1

### 4.1 Direction of Attack

- Input: LineString with at least 2 vertices.
- Semantics: forward direction from first to last vertex.
- Render primitives:
  - main polyline
  - terminal arrowhead (filled) aligned to terminal segment bearing
  - optional secondary decoration per specific SIDC variant
- 3D: draped line + draped arrowhead polygon.

### 4.2 FLOT

- Input: LineString with at least 2 vertices.
- Semantics: tactical frontage line.
- Render primitives:
  - main polyline
  - periodic side markers on right side of line direction
- 3D: draped equivalents.

### 4.3 No-Fire Area

- Input: Polygon ring.
- Semantics: fire restriction area.
- Render primitives:
  - polygon border style per rule
  - area fill with dedicated pattern + current palette base color
- 3D: draped polygon with same border/pattern intent.

### 4.4 Fortified Area

- Input: Polygon ring.
- Semantics: fortified zone.
- Render primitives:
  - reinforced boundary
  - dedicated internal pattern
- 3D: draped polygon equivalent.

## 5. Implementation architecture

### 5.1 New modules

- apps/geolibre-desktop/src/lib/tactical-rules/catalog.ts
  - SIDC -> ruleKey mapping (whitelist V1).
- apps/geolibre-desktop/src/lib/tactical-rules/normalize.ts
  - SIDC normalization and canonicalization helpers.
- apps/geolibre-desktop/src/lib/tactical-rules/primitives.ts
  - Rule output types and geometry helpers.
- apps/geolibre-desktop/src/lib/tactical-rules/render-2d.ts
  - Build MapLibre-ready GeoJSON/features from primitives.
- packages/map/src/tactical-rules/render-3d.ts
  - Build Cesium-ready entities/primitives from same semantic output.

### 5.2 Existing modules to refactor

- apps/geolibre-desktop/src/lib/milgraphic-layer-source.ts
  - Adopt TacticalGraphicV2 payload shape.
- apps/geolibre-desktop/src/lib/milgraphic-geojson.ts
  - Delegate to tactical rule primitives instead of generic geometry-only styling.
- apps/geolibre-desktop/src/components/panels/MilTacticalGraphicsTab.tsx
  - Persist canonical SIDC and ruleKey.
  - Render workspace mini-icons from tactical mini-geometry renderer.
- apps/geolibre-desktop/src/components/map/MilSymbolRenderer.tsx
  - Consume tactical 2D rule output and ensure stable source/layer ownership.
- packages/map/src/cesium-layer-sync.ts
  - Consume tactical 3D rule output for parity.
- python/src/geolibre/project.py
  - Enforce hard migration with partial-load diagnostics.

## 6. Migration strategy (hard + partial load)

On project load:

1. Parse legacy tactical items.
2. Normalize SIDC to canonical 20-digit when possible.
3. Resolve ruleKey through whitelist catalog.
4. If migration succeeds:
   - write TacticalGraphicV2 item.
5. If migration fails:
   - keep record in migration report,
   - skip render insertion for that item,
   - continue loading rest of project.

Project diagnostics include:

- migrated count
- skipped count
- per-item reason (non-canonical SIDC, unsupported geometry, rule unresolved)

## 7. Quality gates and acceptance

### 7.1 Test gates

- Unit tests for:
  - SIDC normalization
  - rule mapping
  - primitive generation for 4 whitelist symbols
- Integration tests for:
  - draw/edit/delete tactical graphics
  - layer visibility and opacity
  - style reload survival
  - reorder stability
- Golden screenshot tests for whitelist symbols in 2D.

### 7.2 Definition of done

- Direction of Attack, FLOT, No-Fire Area, and Fortified Area are visually correct in 2D.
- 3D representation is semantically equivalent and draped.
- Workspace icons are geometric and consistent with map output.
- Hard migration runs at load, with partial-load behavior and explicit diagnostics.

## 8. Rollout plan

### Milestone A: Data model and migration

- Introduce TacticalGraphicV2 schema.
- Add canonical SIDC normalization.
- Add migration diagnostics and partial-load behavior.

### Milestone B: 2D tactical rule engine

- Implement whitelist V1 rule catalog.
- Render 2D primitives with zoom-scaled NATO arrowheads.
- Wire workspace mini-icons to same primitive logic.

### Milestone C: 3D parity and hardening

- Implement draped 3D equivalents from same rules.
- Verify controlled visual differences and document them.
- Add final regression and golden checks.

## 9. Out of scope for this ADR

- Full MIL-STD-2525C coverage beyond whitelist V1.
- Cartouche or document-level layout metadata.
- SDL interoperability.
