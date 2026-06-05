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
  callbackRef.current = onPick;

  const enable = useCallback(() => {
    const map = mapControllerRef.current?.getMap();
    if (!map || activeRef.current) return;
    activeRef.current = true;
    map.getCanvas().style.cursor = "crosshair";
  }, [mapControllerRef]);

  const disable = useCallback(() => {
    const map = mapControllerRef.current?.getMap();
    if (!map) return;
    activeRef.current = false;
    map.getCanvas().style.cursor = "";
  }, [mapControllerRef]);

  useEffect(() => {
    const map = mapControllerRef.current?.getMap();
    if (!map) return;

    const handler = (e: MapMouseEvent) => {
      if (!activeRef.current) return;
      const { lng, lat } = e.lngLat;
      if (oneShot) disable();
      callbackRef.current(lng, lat);
    };

    map.on("click", handler);
    return () => {
      map.off("click", handler);
      disable();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { enable, disable };
}
