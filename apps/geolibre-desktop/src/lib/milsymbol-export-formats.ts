/**
 * milsymbol-export-formats.ts
 *
 * Export GeoLibre mil layers to standard military exchange formats:
 *
 *   .orbat.json   — KADAS ORBAT flat-unit-tree (https://github.com/intelligeo/qgis-app6d-plugin)
 *   .milsymb.json — KADAS MilSymb layer document (kadas_milsymb_version 0.2)
 *
 * Supported functions accept the store-native GeoLibreLayer[] model.
 * Graphics layers are omitted because ORBAT/MilSymb are point-symbol-only formats.
 */

import type {
  GeoLibreLayer,
  MilSymbolLayerSource,
} from "@geolibre/core";

// ─── Shared download helper ───────────────────────────────────────────────────

function downloadBlob(
  content: string | Uint8Array,
  mimeType: string,
  filename: string,
): void {
  const blob = new Blob([content], { type: mimeType });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── ORBAT JSON (.orbat.json) export ─────────────────────────────────────────

/**
 * Shape of a single unit in the KADAS ORBAT format.
 * Matches the structure of SAF2025.orbat.json.
 */
interface OrbatExportUnit {
  id: string;
  sidc: string;
  name: string;
  short_name: string;
  parent_id: string | null;
  temporal: { start: string | null; end: string | null };
  longitude: number | null;
  latitude: number | null;
  map_symbol_id: string | null;
}

interface OrbatExportDocument {
  name: string;
  units: OrbatExportUnit[];
}

/**
 * Export mil-symbol layers as KADAS ORBAT JSON (.orbat.json).
 *
 * Each `mil-symbol` layer becomes one unit entry. Hierarchy (`parent_id`)
 * is preserved when the layer was originally imported from an ORBAT file
 * (metadata.orbatParentId). Graphics layers are omitted.
 *
 * @param layers   Store layers to export (typically all mil-symbol layers)
 * @param docName  Human-readable document title stored in `name` field
 * @param filename Filename stem (without extension). Defaults to "milgeo-export"
 */
export function exportToOrbatJson(
  layers: GeoLibreLayer[],
  docName?: string,
  filename?: string,
): void {
  const milSymbolLayers = layers.filter((l) => l.type === "mil-symbol");

  const units: OrbatExportUnit[] = milSymbolLayers.map((layer) => {
    const src  = layer.source as unknown as MilSymbolLayerSource;
    const meta = (layer.metadata ?? {}) as Record<string, unknown>;
    const shortName =
      src.uniqueDesignation ??
      (meta.orbatShortName as string | undefined) ??
      layer.name;

    return {
      id:          layer.id,
      sidc:        src.SIDC,
      name:        layer.name,
      short_name:  shortName,
      parent_id:   (meta.orbatParentId as string | null) ?? null,
      temporal:    { start: null, end: null },
      longitude:   src.lon ?? null,
      latitude:    src.lat ?? null,
      map_symbol_id: layer.id,
    };
  });

  const doc: OrbatExportDocument = {
    name:  docName ?? "MilGeo ORBAT Export",
    units,
  };

  downloadBlob(
    JSON.stringify(doc, null, 2),
    "application/json",
    `${filename ?? "milgeo-export"}.orbat.json`,
  );
}

// ─── MilSymb JSON (.milsymb.json) export ─────────────────────────────────────

interface MilsymbExportSymbol {
  id:                     string;
  sidc:                   string;
  designation?:           string;
  higher_formation?:      string;
  additional_information?: string;
  direction?:             number;
  speed?:                 string;
  longitude:              number;
  latitude:               number;
}

interface MilsymbExportLayer {
  id:      string;
  name:    string;
  visible: boolean;
  symbols: MilsymbExportSymbol[];
}

interface MilsymbExportDocument {
  kadas_milsymb_version: string;
  layers: MilsymbExportLayer[];
}

/**
 * Export mil-symbol layers as KADAS MilSymb JSON (.milsymb.json).
 *
 * Layers that were imported from a milsymb file retain their original
 * layer grouping (via metadata.milsymbLayerId). Otherwise all symbols
 * are grouped into one export layer. Graphics layers are omitted.
 *
 * @param layers   Store layers to export
 * @param docName  Default name for the export layer when no grouping metadata exists
 * @param filename Filename stem (without extension). Defaults to "milgeo-export"
 */
export function exportToMilsymbJson(
  layers: GeoLibreLayer[],
  docName?: string,
  filename?: string,
): void {
  const milSymbolLayers = layers.filter((l) => l.type === "mil-symbol");

  // Group symbols by their original milsymb layer id (if available)
  const groupMap = new Map<
    string,
    { name: string; visible: boolean; symbols: MilsymbExportSymbol[] }
  >();
  const defaultGroupId = crypto.randomUUID();

  for (const layer of milSymbolLayers) {
    const src  = layer.source as unknown as MilSymbolLayerSource;
    if (src.lon == null || src.lat == null) continue;

    const meta      = (layer.metadata ?? {}) as Record<string, unknown>;
    const groupId   = (meta.milsymbLayerId as string) ?? defaultGroupId;
    const groupName = (meta.milsymbLayerName as string) ?? docName ?? "MilGeo Export";

    if (!groupMap.has(groupId)) {
      groupMap.set(groupId, { name: groupName, visible: true, symbols: [] });
    }

    const group = groupMap.get(groupId)!;

    // Propagate invisible state: if ANY symbol is hidden, mark the group hidden
    if (layer.visible === false) group.visible = false;

    const sym: MilsymbExportSymbol = {
      id:        layer.id,
      sidc:      src.SIDC,
      longitude: src.lon,
      latitude:  src.lat,
    };
    if (src.uniqueDesignation) sym.designation           = src.uniqueDesignation;
    if (src.higherFormation)   sym.higher_formation      = src.higherFormation;
    if (src.additionalInfo)    sym.additional_information = src.additionalInfo;
    if (src.direction != null) sym.direction             = src.direction;
    if (src.speed)             sym.speed                 = src.speed;

    group.symbols.push(sym);
  }

  const exportLayers: MilsymbExportLayer[] = Array.from(
    groupMap.entries(),
  ).map(([id, g]) => ({ id, name: g.name, visible: g.visible, symbols: g.symbols }));

  const doc: MilsymbExportDocument = {
    kadas_milsymb_version: "0.2",
    layers: exportLayers,
  };

  downloadBlob(
    JSON.stringify(doc, null, 2),
    "application/json",
    `${filename ?? "milgeo-export"}.milsymb.json`,
  );
}

// MILX export support has been removed.
