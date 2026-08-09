import { useCallback, useEffect, useRef } from "react";
import type { MapMouseEvent } from "maplibre-gl";
import type { MapController } from "@geolibre/map";

type ClickCallback = (lon: number, lat: number) => void;

/**
 * useMapClick
 *
 * Enables a "pick a point" mode on the MapLibre map controlled via the
 * GeoLibre MapController ref. While active, the cursor changes to crosshair
 * and the next click fires `onPick(lon, lat)`.
 *
 * If `oneShot` is true (default) the mode is automatically disabled after the
 * first click.
 *
 * @example
 *   const { enable, disable } = useMapClick(mapControllerRef, (lon, lat) => {
 *     console.log("picked:", lon, lat);
 *   });
 */
export function useMapClick(
  mapControllerRef: React.RefObject<MapController | null>,
  onPick: ClickCallback,
  oneShot = true,
) {
  const activeRef = useRef(false);
  const callbackRef = useRef(onPick);
  const attachedMapRef = useRef<ReturnType<MapController["getMap"]> | null>(null);
  const handlerRef = useRef<((e: MapMouseEvent) => void) | null>(null);
  callbackRef.current = onPick;

  const ensureHandlerAttached = useCallback(() => {
    const map = mapControllerRef.current?.getMap();
    if (!map) return false;
    if (attachedMapRef.current === map) return true;

    if (attachedMapRef.current && handlerRef.current) {
      attachedMapRef.current.off("click", handlerRef.current);
    }

    const handler = (e: MapMouseEvent) => {
      if (!activeRef.current) return;
      const { lng, lat } = e.lngLat;
      if (oneShot) disable();
      callbackRef.current(lng, lat);
    };

    map.on("click", handler);
    handlerRef.current = handler;
    attachedMapRef.current = map;
    return true;
  }, [mapControllerRef, oneShot]);

  const enable = useCallback(() => {
    if (!ensureHandlerAttached() || activeRef.current) return;
    const map = attachedMapRef.current;
    if (!map) return;
    activeRef.current = true;
    map.getCanvas().style.cursor = "crosshair";
  }, [ensureHandlerAttached]);

  const disable = useCallback(() => {
    const map = attachedMapRef.current ?? mapControllerRef.current?.getMap();
    if (!map) return;
    activeRef.current = false;
    map.getCanvas().style.cursor = "";
  }, [mapControllerRef]);

  useEffect(() => {
    ensureHandlerAttached();
    return () => {
      if (attachedMapRef.current && handlerRef.current) {
        attachedMapRef.current.off("click", handlerRef.current);
      }
      handlerRef.current = null;
      attachedMapRef.current = null;
      disable();
    };
  }, [disable, ensureHandlerAttached]);

  return { enable, disable };
}
