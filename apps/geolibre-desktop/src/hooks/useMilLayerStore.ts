/**
 * useMilLayerStore.ts
 * Zustand store dedicated to MilGeo ORBAT state.
 * Mil symbol layers now live exclusively in the main app store.
 */
import { v4 as uuidv4 } from "uuid";
import { create } from "zustand";
import type { OrbatUnit } from "@geolibre/core";

export interface MilLayerStoreState {
  orbatUnits: OrbatUnit[];
  addOrbatUnit: (unit: Omit<OrbatUnit, "id">) => OrbatUnit;
  removeOrbatUnit: (unitId: string) => void;
  updateOrbatUnit: (unitId: string, patch: Partial<Omit<OrbatUnit, "id">>) => void;
  clearAll: () => void;
}

export const useMilLayerStore = create<MilLayerStoreState>((set) => ({
  orbatUnits: [],

  addOrbatUnit: (unit) => {
    const orbatUnit: OrbatUnit = { ...unit, id: uuidv4() };
    set((state) => ({ orbatUnits: [...state.orbatUnits, orbatUnit] }));
    return orbatUnit;
  },

  removeOrbatUnit: (unitId) => {
    set((state) => ({
      orbatUnits: state.orbatUnits
        .filter((unit) => unit.id !== unitId)
        .map((unit) => (unit.parentId === unitId ? { ...unit, parentId: null } : unit)),
    }));
  },

  updateOrbatUnit: (unitId, patch) => {
    set((state) => ({
      orbatUnits: state.orbatUnits.map((unit) =>
        unit.id === unitId ? { ...unit, ...patch } : unit
      ),
    }));
  },

  clearAll: () => set({ orbatUnits: [] }),
}));
