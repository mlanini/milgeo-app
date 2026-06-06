/**
 * useMilLayerStore.ts
 * Zustand store dedicated to MilGeo layer management.
 * Completely separate from useAppStore / GeoLibreLayer model.
 *
 * Architecture: 1 MilLayer = N MilSymbolItems + M MilGraphicItems
 */
import { v4 as uuidv4 } from "uuid";
import { create } from "zustand";
import {
  MILGEO_FORMAT_VERSION,
  type MilGeoJson,
  type MilGraphicItem,
  type MilLayer,
  type MilSymbolItem,
  type OrbatUnit,
} from "@geolibre/core";
import { SIDC_BLANK } from "../lib/mil-sidc";

// ─── State ────────────────────────────────────────────────────────────────────

export interface MilLayerState {
  layers: MilLayer[];
  orbatUnits: OrbatUnit[];
  /** Currently selected layer for new symbol placement */
  selectedLayerId: string | null;
  /** Symbol being edited in the editor panel (null = none) */
  editingSymbolId: string | null;

  // ── Layer actions ───────────────────────────────────────────────────────────
  addLayer: (name?: string) => MilLayer;
  removeLayer: (layerId: string) => void;
  updateLayer: (layerId: string, patch: Partial<Omit<MilLayer, "id" | "symbols" | "graphics">>) => void;
  selectLayer: (layerId: string | null) => void;
  reorderLayers: (newOrder: string[]) => void;

  // ── Symbol actions ──────────────────────────────────────────────────────────
  addSymbol: (layerId: string, item: Omit<MilSymbolItem, "id" | "layerId">) => MilSymbolItem;
  removeSymbol: (symbolId: string) => void;
  updateSymbol: (symbolId: string, patch: Partial<Omit<MilSymbolItem, "id" | "layerId">>) => void;
  setEditingSymbol: (symbolId: string | null) => void;

  // ── Graphic actions ─────────────────────────────────────────────────────────
  addGraphic: (layerId: string, item: Omit<MilGraphicItem, "id" | "layerId">) => MilGraphicItem;
  removeGraphic: (graphicId: string) => void;
  updateGraphic: (graphicId: string, patch: Partial<Omit<MilGraphicItem, "id" | "layerId">>) => void;

  // ── ORBAT actions ───────────────────────────────────────────────────────────
  addOrbatUnit: (unit: Omit<OrbatUnit, "id">) => OrbatUnit;
  removeOrbatUnit: (unitId: string) => void;
  updateOrbatUnit: (unitId: string, patch: Partial<Omit<OrbatUnit, "id">>) => void;
  /** Place an ORBAT unit on the map: creates a MilSymbolItem in selectedLayer and links symbolId */
  placeOrbatUnit: (unitId: string, lon: number, lat: number) => MilSymbolItem | null;

  // ── Import / Export ─────────────────────────────────────────────────────────
  importFromMilGeoJson: (doc: MilGeoJson) => void;
  exportToMilGeoJson: () => MilGeoJson;
  clearAll: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeLayer(name: string): MilLayer {
  return { id: uuidv4(), name, visible: true, opacity: 1, showLabels: false, symbols: [], graphics: [] };
}

function findSymbol(layers: MilLayer[], symbolId: string): [MilLayer | null, MilSymbolItem | null] {
  for (const layer of layers) {
    const sym = layer.symbols.find((s) => s.id === symbolId);
    if (sym) return [layer, sym];
  }
  return [null, null];
}

function findGraphic(layers: MilLayer[], graphicId: string): [MilLayer | null, MilGraphicItem | null] {
  for (const layer of layers) {
    const gr = layer.graphics.find((g) => g.id === graphicId);
    if (gr) return [layer, gr];
  }
  return [null, null];
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useMilLayerStore = create<MilLayerState>((set, get) => ({
  layers: [],
  orbatUnits: [],
  selectedLayerId: null,
  editingSymbolId: null,

  // ─ Layer actions ─────────────────────────────────────────────────────────────
  addLayer: (name) => {
    const layer = makeLayer(name ?? `Layer ${get().layers.length + 1}`);
    set((s) => ({ layers: [...s.layers, layer], selectedLayerId: layer.id }));
    return layer;
  },

  removeLayer: (layerId) => {
    set((s) => {
      const layers = s.layers.filter((l) => l.id !== layerId);
      const selectedLayerId =
        s.selectedLayerId === layerId ? (layers[0]?.id ?? null) : s.selectedLayerId;
      return { layers, selectedLayerId };
    });
  },

  updateLayer: (layerId, patch) => {
    set((s) => ({
      layers: s.layers.map((l) => (l.id === layerId ? { ...l, ...patch } : l)),
    }));
  },

  selectLayer: (layerId) => set({ selectedLayerId: layerId }),

  reorderLayers: (newOrder) => {
    set((s) => {
      const map = Object.fromEntries(s.layers.map((l) => [l.id, l]));
      const layers = newOrder.map((id) => map[id]).filter(Boolean) as MilLayer[];
      return { layers };
    });
  },

  // ─ Symbol actions ─────────────────────────────────────────────────────────────
  addSymbol: (layerId, item) => {
    const symbol: MilSymbolItem = { ...item, id: uuidv4(), layerId };
    set((s) => ({
      layers: s.layers.map((l) =>
        l.id === layerId ? { ...l, symbols: [...l.symbols, symbol] } : l
      ),
    }));
    return symbol;
  },

  removeSymbol: (symbolId) => {
    set((s) => ({
      layers: s.layers.map((l) => ({
        ...l,
        symbols: l.symbols.filter((sym) => sym.id !== symbolId),
      })),
      editingSymbolId: s.editingSymbolId === symbolId ? null : s.editingSymbolId,
    }));
  },

  updateSymbol: (symbolId, patch) => {
    set((s) => ({
      layers: s.layers.map((l) => ({
        ...l,
        symbols: l.symbols.map((sym) =>
          sym.id === symbolId ? { ...sym, ...patch } : sym
        ),
      })),
    }));
  },

  setEditingSymbol: (symbolId) => set({ editingSymbolId: symbolId }),

  // ─ Graphic actions ────────────────────────────────────────────────────────────
  addGraphic: (layerId, item) => {
    const graphic: MilGraphicItem = { ...item, id: uuidv4(), layerId };
    set((s) => ({
      layers: s.layers.map((l) =>
        l.id === layerId ? { ...l, graphics: [...l.graphics, graphic] } : l
      ),
    }));
    return graphic;
  },

  removeGraphic: (graphicId) => {
    set((s) => ({
      layers: s.layers.map((l) => ({
        ...l,
        graphics: l.graphics.filter((g) => g.id !== graphicId),
      })),
    }));
  },

  updateGraphic: (graphicId, patch) => {
    set((s) => ({
      layers: s.layers.map((l) => ({
        ...l,
        graphics: l.graphics.map((g) =>
          g.id === graphicId ? { ...g, ...patch } : g
        ),
      })),
    }));
  },

  // ─ ORBAT actions ─────────────────────────────────────────────────────────────
  addOrbatUnit: (unit) => {
    const ou: OrbatUnit = { ...unit, id: uuidv4() };
    set((s) => ({ orbatUnits: [...s.orbatUnits, ou] }));
    return ou;
  },

  removeOrbatUnit: (unitId) => {
    // Detach child units (set parentId to null if their parent is removed)
    set((s) => ({
      orbatUnits: s.orbatUnits
        .filter((u) => u.id !== unitId)
        .map((u) => (u.parentId === unitId ? { ...u, parentId: null } : u)),
    }));
  },

  updateOrbatUnit: (unitId, patch) => {
    set((s) => ({
      orbatUnits: s.orbatUnits.map((u) =>
        u.id === unitId ? { ...u, ...patch } : u
      ),
    }));
  },

  placeOrbatUnit: (unitId, lon, lat) => {
    const { layers, selectedLayerId, orbatUnits } = get();
    const unit = orbatUnits.find((u) => u.id === unitId);
    if (!unit) return null;

    const targetLayerId =
      selectedLayerId ?? (layers.length > 0 ? layers[0].id : null);
    if (!targetLayerId) return null;

    const symbol = get().addSymbol(targetLayerId, {
      name: unit.name,
      sidc: unit.sidc ?? SIDC_BLANK,
      lon,
      lat,
    });
    get().updateOrbatUnit(unitId, { symbolId: symbol.id });
    return symbol;
  },

  // ─ Import / Export ────────────────────────────────────────────────────────────
  importFromMilGeoJson: (doc) => {
    if (doc.version !== MILGEO_FORMAT_VERSION) {
      console.warn("[MilLayerStore] Unknown format version:", doc.version);
    }
    set({ layers: doc.layers ?? [], orbatUnits: doc.orbat ?? [] });
  },

  exportToMilGeoJson: () => {
    const { layers, orbatUnits } = get();
    return { version: MILGEO_FORMAT_VERSION, layers, orbat: orbatUnits };
  },

  clearAll: () => set({ layers: [], orbatUnits: [], selectedLayerId: null, editingSymbolId: null }),
}));

// ─── Convenience selectors ────────────────────────────────────────────────────

/** Returns every MilSymbolItem across all layers (for renderer) */
export function selectAllSymbols(state: MilLayerState): MilSymbolItem[] {
  return state.layers.filter((l) => l.visible).flatMap((l) => l.symbols);
}

/** Returns a single symbol by id */
export function selectSymbolById(
  state: MilLayerState,
  symbolId: string
): MilSymbolItem | null {
  return findSymbol(state.layers, symbolId)[1];
}
