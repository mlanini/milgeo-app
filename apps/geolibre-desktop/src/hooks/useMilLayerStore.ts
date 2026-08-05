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
 * Zustand store dedicated to MilGeo ORBAT state.
 * Mil symbol layers now live exclusively in the main app store.
  layers: MilLayer[];
  orbatUnits: OrbatUnit[];
  /** Currently selected layer for new symbol placement */
  selectedLayerId: string | null;
  removeLayer: (layerId: string) => void;
  updateLayer: (layerId: string, patch: Partial<Omit<MilLayer, "id" | "symbols" | "graphics">>) => void;
  reorderLayers: (newOrder: string[]) => void;

  // ── Symbol actions ──────────────────────────────────────────────────────────
export interface MilLayerStoreState {
  updateSymbol: (symbolId: string, patch: Partial<Omit<MilSymbolItem, "id" | "layerId">>) => void;
function makeLayer(name: string): MilLayer {
  return { id: uuidv4(), name, visible: true, opacity: 1, symbols: [], graphics: [] };
}

function findSymbol(layers: MilLayer[], symbolId: string): [MilLayer | null, MilSymbolItem | null] {
  }
  return [null, null];
    return layer;
  },

export const useMilLayerStore = create<MilLayerStoreState>((set) => ({
      const layers = s.layers.filter((l) => l.id !== layerId);
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

  clearAll: () => set({ orbatUnits: [] }),
}));
