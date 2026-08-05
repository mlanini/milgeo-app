import type { MapController } from "@geolibre/map";
import {
  createContext,
  useContext,
  type PropsWithChildren,
  type RefObject,
} from "react";

const MapControllerContext = createContext<RefObject<MapController | null> | null>(null);

export function MapControllerProvider({
  value,
  children,
}: PropsWithChildren<{ value: RefObject<MapController | null> }>) {
  return (
    <MapControllerContext.Provider value={value}>
      {children}
    </MapControllerContext.Provider>
  );
}

export function useMapControllerRef(): RefObject<MapController | null> {
  const context = useContext(MapControllerContext);
  if (!context) {
    throw new Error("MapControllerProvider is required for MilGeo plugin UI.");
  }
  return context;
}
