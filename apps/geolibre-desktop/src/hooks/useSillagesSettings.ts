/**
 * useSillagesSettings.ts
 *
 * Zustand store for Sillages (Traccar) connection settings.
 * Persisted in localStorage under "milgeo.sillages.settings".
 * Mirrors Python PluginSettings/QgsSettings used in kadas-sillages-plugin.
 */

import { useEffect } from "react";
import { create } from "zustand";

const STORAGE_KEY = "milgeo.sillages.settings";

export interface SillagesSettings {
  serverUrl: string;
  username: string;
  password: string;
  autoConnect: boolean;
  defaultTrackColor: string;
  defaultTrackWidth: number;
  defaultTrackMaxPoints: number;
}

interface SillagesSettingsState {
  settings: SillagesSettings;
  setSettings: (s: SillagesSettings) => void;
}

export const DEFAULT_SILLAGES_SETTINGS: SillagesSettings = {
  serverUrl: "",
  username: "",
  password: "",
  autoConnect: false,
  defaultTrackColor: "#0000FF",
  defaultTrackWidth: 2,
  defaultTrackMaxPoints: 500,
};

function normalize(raw: unknown): SillagesSettings {
  const s = DEFAULT_SILLAGES_SETTINGS;
  if (!raw || typeof raw !== "object") return s;
  const c = raw as Partial<SillagesSettings>;
  return {
    serverUrl: typeof c.serverUrl === "string" ? c.serverUrl.trim() : s.serverUrl,
    username: typeof c.username === "string" ? c.username.trim() : s.username,
    password: typeof c.password === "string" ? c.password : s.password,
    autoConnect:
      typeof c.autoConnect === "boolean" ? c.autoConnect : s.autoConnect,
    defaultTrackColor:
      typeof c.defaultTrackColor === "string" && c.defaultTrackColor
        ? c.defaultTrackColor
        : s.defaultTrackColor,
    defaultTrackWidth:
      typeof c.defaultTrackWidth === "number" && c.defaultTrackWidth > 0
        ? c.defaultTrackWidth
        : s.defaultTrackWidth,
    defaultTrackMaxPoints:
      typeof c.defaultTrackMaxPoints === "number" && c.defaultTrackMaxPoints > 0
        ? c.defaultTrackMaxPoints
        : s.defaultTrackMaxPoints,
  };
}

function load(): SillagesSettings {
  if (typeof window === "undefined") return DEFAULT_SILLAGES_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SILLAGES_SETTINGS;
    return normalize(JSON.parse(raw) as unknown);
  } catch {
    return DEFAULT_SILLAGES_SETTINGS;
  }
}

function save(settings: SillagesSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch { /* quota / disabled storage — best effort */ }
}

export const useSillagesSettingsStore = create<SillagesSettingsState>((set) => ({
  settings: load(),
  setSettings: (settings) => set({ settings: normalize(settings) }),
}));

/** Call once in the app root to persist setting changes. */
export function useSillagesSettingsPersistence(): void {
  useEffect(() => {
    save(useSillagesSettingsStore.getState().settings);
    return useSillagesSettingsStore.subscribe((state, prev) => {
      if (state.settings !== prev.settings) {
        save(state.settings);
      }
    });
  }, []);
}

/** True if the minimum required fields (URL + user + pass) are filled. */
export function isSillagesConfigured(settings: SillagesSettings): boolean {
  return Boolean(settings.serverUrl && settings.username && settings.password);
}
