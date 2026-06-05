import { useEffect, useRef } from "react";
import maplibregl, { type Marker } from "maplibre-gl";
import { useAppStore } from "@geolibre/core";
import type { MapController } from "@geolibre/map";
import ms from "milsymbol";
import type { MilSymbolLayerSource, MilGraphicLayerSource } from "@geolibre/core";

const MilSymbol = ms.Symbol;

interface MilSymbolRendererProps {
  mapControllerRef: React.RefObject<MapController | null>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildSymbolSVG(
  sidc: string,
  opts: { uniqueDesignation?: string; higherFormation?: string; size?: number },
): string {
  try {
    const sym = new MilSymbol(sidc, {
      size: opts.size ?? 38,
      uniqueDesignation: opts.uniqueDesignation,
      higherFormation: opts.higherFormation,
    });
    if (sym.isValid()) return sym.asSVG();
  } catch {
    /* fall through */
  }
  // Fallback: colored square with SIDC snippet
  return `<svg width="38" height="38" viewBox="0 0 38 38" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="2" width="34" height="34" rx="3" fill="#4A7FCE" stroke="#fff" stroke-width="1.5"/>
    <text x="19" y="24" text-anchor="middle" font-size="8" fill="#fff" font-family="monospace">${sidc.slice(4, 10)}</text>
  </svg>`;
}

function symbolAnchorOffset(sidc: string, size = 38): [number, number] {
  try {
    const sym = new MilSymbol(sidc, { size });
    const anchor = sym.getAnchor();
    const sz = sym.getSize();
    // MapLibre Marker with anchor:"center" places the element CENTER at the
    // coordinate. We need the milsymbol anchor point (ax, ay) to land on the
    // coordinate instead.
    //
    // With anchor:"center" and offset [dx, dy]:
    //   element_center = coordinate + [dx, dy]
    //   milsymbol_anchor_on_screen = element_center + [ax - w/2, ay - h/2]
    //   We want milsymbol_anchor_on_screen = coordinate
    //   => dx = w/2 - ax,  dy = h/2 - ay
    return [sz.width / 2 - anchor.x, sz.height / 2 - anchor.y];
  } catch {
    return [0, 0];
  }
}

// Mil-graphic: constant line colour per affiliation
const GRAPHIC_COLORS: Record<string, string> = {
  FRIENDLY: "#4A7FCE",
  HOSTILE: "#CE4A4A",
  NEUTRAL: "#4ACE8C",
  UNKNOWN: "#999999",
};

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * MilSymbolRenderer
 *
 * A render-less component that:
 *  • Keeps MapLibre HTML markers in sync with "mil-symbol" layers in the store.
 *  • Keeps GeoJSON sources + line/fill layers in sync with "mil-graphic" layers.
 *
 * Must be mounted inside DesktopShell (after MapCanvas is initialised).
 */
export default function MilSymbolRenderer({ mapControllerRef }: MilSymbolRendererProps) {
  const layers = useAppStore((s) => s.layers);
  const markersRef = useRef<Map<string, Marker>>(new Map());
  const graphicSourcesRef = useRef<Set<string>>(new Set());

  // ── Symbol markers ────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapControllerRef.current?.getMap();
    if (!map) return;

    const milLayers = layers.filter((l) => l.type === "mil-symbol");
    const milIds = new Set(milLayers.map((l) => l.id));

    // Remove stale markers
    for (const [id, marker] of markersRef.current.entries()) {
      if (!milIds.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    }

    // Add / update markers
    for (const layer of milLayers) {
      const src = layer.source as unknown as MilSymbolLayerSource;
      if (!src.SIDC || src.lon === undefined || src.lat === undefined) continue;

      const svgStr = buildSymbolSVG(src.SIDC, {
        uniqueDesignation: src.uniqueDesignation,
        higherFormation: src.higherFormation,
        size: 38,
      });
      const offset = symbolAnchorOffset(src.SIDC, 38);

      const existing = markersRef.current.get(layer.id);
      if (existing) {
        existing.setLngLat([src.lon, src.lat]);
        // Recompute offset in case SIDC/size changed
        existing.setOffset(offset);
        const el = existing.getElement();
        el.style.display = layer.visible ? "" : "none";
        el.style.opacity = String(layer.opacity ?? 1);
        el.innerHTML = svgStr;
        // Keep element size in sync with new SVG
        try {
          const sym2 = new MilSymbol(src.SIDC, { size: 38 });
          const sz2 = sym2.getSize();
          el.style.width = `${sz2.width}px`;
          el.style.height = `${sz2.height}px`;
        } catch { /* fallthrough */ }
      } else {
        const el = document.createElement("div");
        el.style.cursor = "pointer";
        el.style.userSelect = "none";
        el.style.lineHeight = "0"; // prevent extra inline-block spacing
        el.style.display = layer.visible ? "" : "none";
        el.style.opacity = String(layer.opacity ?? 1);
        el.title = layer.name;
        el.innerHTML = svgStr;
        // Set explicit element dimensions so MapLibre measures it correctly
        try {
          const sym2 = new MilSymbol(src.SIDC, { size: 38 });
          const sz2 = sym2.getSize();
          el.style.width = `${sz2.width}px`;
          el.style.height = `${sz2.height}px`;
        } catch { /* fallthrough */ }

        const marker = new maplibregl.Marker({
          element: el,
          anchor: "center",
          offset,
        })
          .setLngLat([src.lon, src.lat])
          .addTo(map);

        markersRef.current.set(layer.id, marker);
      }
    }
  }, [layers, mapControllerRef]);

  // ── Tactical graphics (line / area) ──────────────────────────────────
  useEffect(() => {
    const map = mapControllerRef.current?.getMap();
    if (!map || !map.isStyleLoaded()) return;

    const graphicLayers = layers.filter((l) => l.type === "mil-graphic");
    const graphicIds = new Set(graphicLayers.map((l) => l.id));

    // Remove stale sources/layers
    for (const id of graphicSourcesRef.current) {
      if (!graphicIds.has(id)) {
        const lineId = `mg-line-${id}`;
        const fillId = `mg-fill-${id}`;
        if (map.getLayer(lineId)) map.removeLayer(lineId);
        if (map.getLayer(fillId)) map.removeLayer(fillId);
        if (map.getSource(id)) map.removeSource(id);
        graphicSourcesRef.current.delete(id);
      }
    }

    // Add / update graphic sources
    for (const layer of graphicLayers) {
      const src = layer.source as unknown as MilGraphicLayerSource;
      if (!src.SIDC || !src.coordinates?.length) continue;

      const color = GRAPHIC_COLORS[src.affiliation] ?? "#4A7FCE";
      const lineId = `mg-line-${layer.id}`;
      const fillId = `mg-fill-${layer.id}`;

      const geojsonGeom =
        src.geometryType === "Polygon"
          ? { type: "Polygon" as const, coordinates: [src.coordinates] }
          : { type: "LineString" as const, coordinates: src.coordinates };

      const geojsonSource = {
        type: "geojson" as const,
        data: {
          type: "Feature" as const,
          geometry: geojsonGeom,
          properties: { name: layer.name, sidc: src.SIDC },
        },
      };

      if (graphicSourcesRef.current.has(layer.id)) {
        // Update existing source data
        (map.getSource(layer.id) as maplibregl.GeoJSONSource)?.setData(
          geojsonSource.data,
        );
        // Sync visibility
        const vis = layer.visible ? "visible" : "none";
        if (map.getLayer(lineId)) map.setLayoutProperty(lineId, "visibility", vis);
        if (map.getLayer(fillId)) map.setLayoutProperty(fillId, "visibility", vis);
      } else {
        // Add new source and layers
        map.addSource(layer.id, geojsonSource);

        if (src.geometryType === "Polygon") {
          map.addLayer({
            id: fillId,
            type: "fill",
            source: layer.id,
            paint: {
              "fill-color": color,
              "fill-opacity": (layer.opacity ?? 1) * 0.15,
            },
            layout: { visibility: layer.visible ? "visible" : "none" },
          });
        }

        map.addLayer({
          id: lineId,
          type: "line",
          source: layer.id,
          paint: {
            "line-color": color,
            "line-width": 2,
            "line-opacity": layer.opacity ?? 1,
            "line-dasharray": [4, 2],
          },
          layout: { visibility: layer.visible ? "visible" : "none" },
        });

        graphicSourcesRef.current.add(layer.id);
      }
    }
  }, [layers, mapControllerRef]);

  // ── Cleanup on unmount ────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      for (const marker of markersRef.current.values()) marker.remove();
      markersRef.current.clear();
    };
  }, []);

  return null;
}
