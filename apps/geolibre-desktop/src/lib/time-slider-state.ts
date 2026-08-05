/**
 * time-slider-state.ts
 *
 * Module-level pub/sub store for the map time slider's current date.
 * Decoupled from @geolibre/plugins so MilSymbolRenderer can subscribe to
 * temporal changes without depending on upstream plugin exports that may change.
 *
 * useSyncExternalStore-compatible API:
 *   - getTimeSliderDate()        → current snapshot (server/client)
 *   - subscribeTimeSliderDate()  → subscribe, returns unsubscribe fn
 *   - setTimeSliderDate()        → called by the time-slider plugin adapter
 */

let _current: Date | null = null;
const _listeners = new Set<() => void>();

export function getTimeSliderDate(): Date | null {
  return _current;
}

export function subscribeTimeSliderDate(cb: () => void): () => void {
  _listeners.add(cb);
  return () => { _listeners.delete(cb); };
}

/** Update the current date and notify all subscribers. */
export function setTimeSliderDate(date: Date | null): void {
  _current = date;
  _listeners.forEach((cb) => cb());
}
