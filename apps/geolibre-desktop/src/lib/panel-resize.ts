/**
 * Shared custom events emitted while resizable panels are being dragged.
 *
 * Consumers pause expensive interactions during resize and resume when drag ends.
 */
export const PANEL_RESIZE_START_EVENT = "geolibre:panel-resize-start";
export const PANEL_RESIZE_END_EVENT = "geolibre:panel-resize-end";
