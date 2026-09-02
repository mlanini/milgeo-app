import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GeoLibreLayer, MilAffiliation, MilGraphicLayerSource } from "@geolibre/core";
import { DEFAULT_LAYER_STYLE, useAppStore } from "@geolibre/core";
import { cn } from "@geolibre/ui";
import type { MapController } from "@geolibre/map";
import ms from "../../lib/milsymbol-runtime";
import type { Feature, FeatureCollection, LineString, Point, Polygon } from "geojson";
import { Crosshair, Eye, EyeOff, Pencil, Plus, Trash2, X } from "lucide-react";
import { useMapClick } from "../../hooks/useMapClick";
import {
  TACTICAL_FAMILIES,
  filterTacticalCatalog,
  odinDisplaySidc,
  type TacticalCatalogEntry,
} from "../../lib/mil-tactical-catalog";
import { isEditableTarget } from "../../lib/commands";
import {
  parseMilGraphicLayerSource,
  serializeMilGraphicLayerSource,
  type MilGraphicLayerItem,
} from "../../lib/milgraphic-layer-source";
import { milGraphicsToGeoJson } from "../../lib/milgraphic-geojson";

const MilSymbol = ms.Symbol;
const PREVIEW_SOURCE_ID = "mil-tactical-preview-source";
const PREVIEW_LINE_ID = "mil-tactical-preview-line";
const PREVIEW_FILL_ID = "mil-tactical-preview-fill";
const PREVIEW_POINT_ID = "mil-tactical-preview-point";
const TACTICAL_LAYER_ID = "mil-tactical-graphics-layer";
const TACTICAL_LAYER_NAME = "Grafiche tattiche";

const AFF_OPTIONS: { id: MilAffiliation; label: string; color: string }[] = [
  { id: "FRIENDLY", label: "Amico", color: "#4A7FCE" },
  { id: "HOSTILE", label: "Ostile", color: "#CE4A4A" },
  { id: "NEUTRAL", label: "Neutrale", color: "#4ACE8C" },
  { id: "UNKNOWN", label: "Ignoto", color: "#AAAAAA" },
];

function minPoints(entry: TacticalCatalogEntry): number {
  return entry.geometryType === "Polygon" ? 3 : 2;
}

function GraphicPreview({ sidc }: { sidc: string }) {
  const svg = useMemo(() => {
    try {
      const sym = new MilSymbol(sidc, { size: 30 });
      return sym.isValid() ? sym.asSVG() : null;
    } catch {
      return null;
    }
  }, [sidc]);

  if (!svg) {
    return <div className="h-8 w-8 rounded border border-border/60 bg-muted/40 text-[9px] grid place-items-center">TG</div>;
  }

  return (
    <div
      className="h-8 w-8 overflow-hidden [&>svg]:w-full [&>svg]:h-full [&>svg]:block"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

interface Props {
  mapControllerRef: React.RefObject<MapController | null>;
}

interface VertexPickTarget {
  layerId: string;
  vertexIndex: number;
}

interface SnapCandidate {
  layerId: string;
  vertexIndex: number;
  coordinate: [number, number];
}

function buildPreviewCollection(
  geometryType: "LineString" | "Polygon",
  points: [number, number][],
  hoverPoint: [number, number] | null,
): FeatureCollection<LineString | Polygon | Point> {
  const features: Feature<LineString | Polygon | Point>[] = [];
  const working = hoverPoint ? [...points, hoverPoint] : [...points];

  if (working.length >= 2) {
    features.push({
      type: "Feature",
      properties: { kind: "line" },
      geometry: { type: "LineString", coordinates: working },
    });
  }

  if (geometryType === "Polygon" && working.length >= 3) {
    const ring = [...working, working[0]];
    features.push({
      type: "Feature",
      properties: { kind: "fill" },
      geometry: { type: "Polygon", coordinates: [ring] },
    });
  }

  for (const [index, coordinate] of points.entries()) {
    features.push({
      type: "Feature",
      properties: { kind: "vertex", index },
      geometry: { type: "Point", coordinates: coordinate },
    });
  }

  return { type: "FeatureCollection", features };
}

export function MilTacticalGraphicsTab({ mapControllerRef }: Props) {
  const layers = useAppStore((s) => s.layers);
  const addLayer = useAppStore((s) => s.addLayer);
  const updateLayer = useAppStore((s) => s.updateLayer);
  const removeLayer = useAppStore((s) => s.removeLayer);

  const [search, setSearch] = useState("");
  const [family, setFamily] = useState("All");
  const [affiliation, setAffiliation] = useState<MilAffiliation>("FRIENDLY");
  const [selected, setSelected] = useState<TacticalCatalogEntry | null>(null);
  const [designation, setDesignation] = useState("");
  const [drawing, setDrawing] = useState(false);
  const [drawnPoints, setDrawnPoints] = useState<[number, number][]>([]);
  const [hoverPoint, setHoverPoint] = useState<[number, number] | null>(null);
  const [hoverSnapped, setHoverSnapped] = useState(false);
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [vertexPickTarget, setVertexPickTarget] = useState<VertexPickTarget | null>(null);
  const [appendVertexLayerId, setAppendVertexLayerId] = useState<string | null>(null);
  const [snapEnabled, setSnapEnabled] = useState(false);
  const [snapRadiusPx, setSnapRadiusPx] = useState(14);
  const drawnPointsRef = useRef<[number, number][]>([]);

  const tacticalLayer = useMemo(
    () =>
      layers.find(
        (layer) =>
          layer.type === "mil-graphic" &&
          (layer.id === TACTICAL_LAYER_ID ||
            (layer.metadata.milgeoManaged === true && layer.metadata.tacticalCollection === true)),
      ) ?? null,
    [layers],
  );

  const tacticalGraphics = useMemo(
    () => (tacticalLayer ? parseMilGraphicLayerSource(tacticalLayer.source).graphics : []),
    [tacticalLayer],
  );

  const entries = useMemo(
    () => filterTacticalCatalog(search, family),
    [search, family],
  );

  // Migrate pre-aggregation tactical graphics (one layer per graphic) into one shared layer.
  useEffect(() => {
    const legacyTacticalLayers = layers.filter(
      (layer) =>
        layer.type === "mil-graphic" &&
        layer.metadata.milgeoManaged === true &&
        layer.metadata.tacticalCollection !== true,
    );

    if (legacyTacticalLayers.length === 0) return;

    const migratedGraphics = legacyTacticalLayers
      .flatMap((layer) => {
        const parsed = parseMilGraphicLayerSource(layer.source);
        return parsed.graphics.map((graphic) => ({
          ...graphic,
          tacticalDirectional:
            graphic.tacticalDirectional || layer.metadata.tacticalDirectional === true,
          tacticalFamily:
            graphic.tacticalFamily ||
            (typeof layer.metadata.tacticalFamily === "string"
              ? layer.metadata.tacticalFamily
              : undefined),
        }));
      });

    if (migratedGraphics.length === 0) {
      legacyTacticalLayers.forEach((layer) => removeLayer(layer.id));
      return;
    }

    if (tacticalLayer) {
      const existing = parseMilGraphicLayerSource(tacticalLayer.source).graphics;
      const merged = [...existing, ...migratedGraphics];

      updateLayer(tacticalLayer.id, {
        source: serializeMilGraphicLayerSource(merged) as unknown as Record<string, unknown>,
        geojson: milGraphicsToGeoJson(merged),
        metadata: {
          ...tacticalLayer.metadata,
          milgeoManaged: true,
          tacticalCollection: true,
        },
      });

      legacyTacticalLayers.forEach((layer) => removeLayer(layer.id));
      return;
    }

    addLayer({
      id: TACTICAL_LAYER_ID,
      name: TACTICAL_LAYER_NAME,
      type: "mil-graphic",
      visible: true,
      opacity: 1,
      style: { ...DEFAULT_LAYER_STYLE },
      metadata: {
        milgeoManaged: true,
        tacticalCollection: true,
      },
      source: serializeMilGraphicLayerSource(migratedGraphics) as unknown as Record<string, unknown>,
      geojson: milGraphicsToGeoJson(migratedGraphics),
    });

    legacyTacticalLayers.forEach((layer) => removeLayer(layer.id));
  }, [addLayer, layers, removeLayer, tacticalLayer, updateLayer]);

  const updateTacticalGraphics = useCallback(
    (nextGraphics: MilGraphicLayerItem[]) => {
      if (tacticalLayer) {
        if (nextGraphics.length === 0) {
          removeLayer(tacticalLayer.id);
          setEditingLayerId(null);
          setVertexPickTarget(null);
          setAppendVertexLayerId(null);
          return;
        }

        updateLayer(tacticalLayer.id, {
          source: serializeMilGraphicLayerSource(nextGraphics) as unknown as Record<string, unknown>,
          geojson: milGraphicsToGeoJson(nextGraphics),
        });
        return;
      }

      if (nextGraphics.length === 0) return;

      const layer: GeoLibreLayer = {
        id: TACTICAL_LAYER_ID,
        name: TACTICAL_LAYER_NAME,
        type: "mil-graphic",
        visible: true,
        opacity: 1,
        style: { ...DEFAULT_LAYER_STYLE },
        metadata: {
          milgeoManaged: true,
          tacticalCollection: true,
        },
        source: serializeMilGraphicLayerSource(nextGraphics) as unknown as Record<string, unknown>,
        geojson: milGraphicsToGeoJson(nextGraphics),
      };

      addLayer(layer);
    },
    [addLayer, removeLayer, tacticalLayer, updateLayer],
  );

  const snapCandidates = useMemo<SnapCandidate[]>(() => {
    const candidates: SnapCandidate[] = [];
    for (const item of tacticalGraphics) {
      item.coordinates.forEach((coordinate, vertexIndex) => {
        candidates.push({
          layerId: item.id,
          vertexIndex,
          coordinate: [coordinate[0], coordinate[1]],
        });
      });
    }
    return candidates;
  }, [tacticalGraphics]);

  const applySnap = useCallback((
    lon: number,
    lat: number,
    exclude?: VertexPickTarget,
  ): { point: [number, number]; snapped: boolean } => {
    if (!snapEnabled) {
      return { point: [lon, lat], snapped: false };
    }

    const map = mapControllerRef.current?.getMap();
    if (!map) {
      return { point: [lon, lat], snapped: false };
    }

    const target = map.project({ lng: lon, lat });
    let best: [number, number] | null = null;
    let bestDistSq = snapRadiusPx * snapRadiusPx;

    for (const candidate of snapCandidates) {
      if (
        exclude &&
        candidate.layerId === exclude.layerId &&
        candidate.vertexIndex === exclude.vertexIndex
      ) {
        continue;
      }

      const point = map.project({ lng: candidate.coordinate[0], lat: candidate.coordinate[1] });
      const dx = point.x - target.x;
      const dy = point.y - target.y;
      const distSq = dx * dx + dy * dy;
      if (distSq <= bestDistSq) {
        bestDistSq = distSq;
        best = candidate.coordinate;
      }
    }

    if (best) {
      return { point: [best[0], best[1]], snapped: true };
    }
    return { point: [lon, lat], snapped: false };
  }, [mapControllerRef, snapCandidates, snapEnabled, snapRadiusPx]);

  const editingSource = useMemo(
    () => tacticalGraphics.find((item) => item.id === editingLayerId) ?? null,
    [editingLayerId, tacticalGraphics],
  );

  const updateGraphicCoordinates = useCallback(
    (layerId: string, nextCoordinates: [number, number][]) => {
      const target = tacticalGraphics.find((item) => item.id === layerId);
      if (!target) return;

      const min = target.geometryType === "Polygon" ? 3 : 2;
      if (nextCoordinates.length < min) return;

      const nextGraphics = tacticalGraphics.map((item) =>
        item.id === layerId ? { ...item, coordinates: nextCoordinates } : item,
      );
      updateTacticalGraphics(nextGraphics);
    },
    [tacticalGraphics, updateTacticalGraphics],
  );

  const onMapClick = useCallback((lon: number, lat: number) => {
    if (vertexPickTarget) {
      const source = tacticalGraphics.find((item) => item.id === vertexPickTarget.layerId);
      if (!source) return;
      const snapped = applySnap(lon, lat, vertexPickTarget);
      const next = source.coordinates.map((coord) => ([...coord] as [number, number]));
      if (!next[vertexPickTarget.vertexIndex]) return;
      next[vertexPickTarget.vertexIndex] = snapped.point;
      updateGraphicCoordinates(vertexPickTarget.layerId, next);
      setVertexPickTarget(null);
      return;
    }

    if (appendVertexLayerId) {
      const source = tacticalGraphics.find((item) => item.id === appendVertexLayerId);
      if (!source) return;
      const snapped = applySnap(lon, lat);
      const next = [...source.coordinates.map((coord) => ([...coord] as [number, number])), snapped.point];
      updateGraphicCoordinates(appendVertexLayerId, next);
      setAppendVertexLayerId(null);
      return;
    }

    if (!drawing || !selected) return;
    const snapped = applySnap(lon, lat);
    drawnPointsRef.current = [...drawnPointsRef.current, snapped.point];
    setDrawnPoints([...drawnPointsRef.current]);
  }, [appendVertexLayerId, applySnap, drawing, selected, tacticalGraphics, updateGraphicCoordinates, vertexPickTarget]);

  const { enable: enableDrawClick, disable: disableDrawClick } = useMapClick(
    mapControllerRef,
    onMapClick,
    false,
  );

  const pickModeActive = drawing || !!vertexPickTarget || !!appendVertexLayerId;

  useEffect(() => {
    if (pickModeActive) {
      enableDrawClick();
      return;
    }
    disableDrawClick();
  }, [appendVertexLayerId, disableDrawClick, drawing, enableDrawClick, pickModeActive, vertexPickTarget]);

  useEffect(() => {
    const map = mapControllerRef.current?.getMap();
    if (!map) return;

    if (!drawing) {
      setHoverPoint(null);
      setHoverSnapped(false);
      return;
    }

    const onMove = (event: { lngLat: { lng: number; lat: number } }) => {
      const snapped = applySnap(event.lngLat.lng, event.lngLat.lat);
      setHoverPoint(snapped.point);
      setHoverSnapped(snapped.snapped);
    };

    map.on("mousemove", onMove);
    return () => {
      map.off("mousemove", onMove);
    };
  }, [applySnap, drawing, mapControllerRef]);

  useEffect(() => {
    const map = mapControllerRef.current?.getMap();
    if (!map) return;

    const clearPreview = () => {
      if (map.getLayer(PREVIEW_POINT_ID)) map.removeLayer(PREVIEW_POINT_ID);
      if (map.getLayer(PREVIEW_LINE_ID)) map.removeLayer(PREVIEW_LINE_ID);
      if (map.getLayer(PREVIEW_FILL_ID)) map.removeLayer(PREVIEW_FILL_ID);
      if (map.getSource(PREVIEW_SOURCE_ID)) map.removeSource(PREVIEW_SOURCE_ID);
    };

    if (!drawing || !selected) {
      clearPreview();
      return;
    }

    const data = buildPreviewCollection(selected.geometryType, drawnPoints, hoverPoint);

    if (!map.getSource(PREVIEW_SOURCE_ID)) {
      map.addSource(PREVIEW_SOURCE_ID, { type: "geojson", data });

      map.addLayer({
        id: PREVIEW_FILL_ID,
        type: "fill",
        source: PREVIEW_SOURCE_ID,
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: {
          "fill-color": "#4A7FCE",
          "fill-opacity": 0.12,
        },
      });

      map.addLayer({
        id: PREVIEW_LINE_ID,
        type: "line",
        source: PREVIEW_SOURCE_ID,
        filter: ["==", ["geometry-type"], "LineString"],
        paint: {
          "line-color": "#4A7FCE",
          "line-width": 2,
          "line-dasharray": [2, 1],
        },
      });

      map.addLayer({
        id: PREVIEW_POINT_ID,
        type: "circle",
        source: PREVIEW_SOURCE_ID,
        filter: ["==", ["geometry-type"], "Point"],
        paint: {
          "circle-color": "#ffffff",
          "circle-stroke-color": "#4A7FCE",
          "circle-stroke-width": 2,
          "circle-radius": 4,
        },
      });
    } else {
      const src = map.getSource(PREVIEW_SOURCE_ID) as unknown as { setData: (value: FeatureCollection<LineString | Polygon | Point>) => void } | undefined;
      src?.setData(data);
    }

    return () => {
      if (!drawing) clearPreview();
    };
  }, [drawnPoints, drawing, hoverPoint, mapControllerRef, selected]);

  useEffect(() => {
    return () => {
      const map = mapControllerRef.current?.getMap();
      if (!map) return;
      if (map.getLayer(PREVIEW_POINT_ID)) map.removeLayer(PREVIEW_POINT_ID);
      if (map.getLayer(PREVIEW_LINE_ID)) map.removeLayer(PREVIEW_LINE_ID);
      if (map.getLayer(PREVIEW_FILL_ID)) map.removeLayer(PREVIEW_FILL_ID);
      if (map.getSource(PREVIEW_SOURCE_ID)) map.removeSource(PREVIEW_SOURCE_ID);
    };
  }, [mapControllerRef]);

  const cancelDrawing = useCallback(() => {
    setDrawing(false);
    drawnPointsRef.current = [];
    setDrawnPoints([]);
    setHoverPoint(null);
    setHoverSnapped(false);
  }, []);

  const startDrawing = useCallback(() => {
    if (!selected) return;
    drawnPointsRef.current = [];
    setDrawnPoints([]);
    setHoverPoint(null);
    setDrawing(true);
  }, [selected]);

  const undoLastVertex = useCallback(() => {
    if (!drawing) return;
    drawnPointsRef.current = drawnPointsRef.current.slice(0, -1);
    setDrawnPoints([...drawnPointsRef.current]);
  }, [drawing]);

  const finishDrawing = useCallback(() => {
    if (!selected) return;

    const coords = drawnPointsRef.current;
    if (coords.length < minPoints(selected)) return;

    const source: MilGraphicLayerSource = {
      SIDC: selected.sidc,
      geometryType: selected.geometryType,
      coordinates: coords,
      affiliation,
      uniqueDesignation: designation.trim() || undefined,
    };

    const graphicItem: MilGraphicLayerItem = {
      id: crypto.randomUUID(),
      name: designation.trim() || selected.name,
      SIDC: source.SIDC,
      geometryType: source.geometryType,
      coordinates: source.coordinates,
      affiliation: source.affiliation,
      uniqueDesignation: source.uniqueDesignation,
      additionalInfo: source.additionalInfo,
      tacticalDirectional: selected.directional === true,
      tacticalFamily: selected.family,
    };

    updateTacticalGraphics([...tacticalGraphics, graphicItem]);
    cancelDrawing();
  }, [affiliation, cancelDrawing, designation, selected, tacticalGraphics, updateTacticalGraphics]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;

      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === "z" && drawing) {
        event.preventDefault();
        undoLastVertex();
        return;
      }

      if (event.key === "Enter" && drawing && selected) {
        if (drawnPointsRef.current.length >= minPoints(selected)) {
          event.preventDefault();
          finishDrawing();
        }
        return;
      }

      if (event.key !== "Escape") return;
      if (drawing) {
        event.preventDefault();
        cancelDrawing();
        return;
      }

      if (vertexPickTarget || appendVertexLayerId || editingLayerId) {
        event.preventDefault();
        setVertexPickTarget(null);
        setAppendVertexLayerId(null);
        setEditingLayerId(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [appendVertexLayerId, cancelDrawing, drawing, editingLayerId, finishDrawing, selected, undoLastVertex, vertexPickTarget]);

  // Right-click while drawing → finish (if enough vertices) or cancel
  useEffect(() => {
    if (!drawing) return;
    const map = mapControllerRef.current?.getMap();
    if (!map) return;

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      if (!selected) return;
      if (drawnPointsRef.current.length >= minPoints(selected)) {
        finishDrawing();
      } else {
        cancelDrawing();
      }
    };

    const canvas = map.getCanvas();
    canvas.addEventListener("contextmenu", onContextMenu);
    return () => {
      canvas.removeEventListener("contextmenu", onContextMenu);
    };
  }, [cancelDrawing, drawing, finishDrawing, mapControllerRef, selected]);

  const removeVertex = useCallback((layerId: string, vertexIndex: number) => {
    const source = tacticalGraphics.find((item) => item.id === layerId) ?? null;
    if (!source) return;
    const next = source.coordinates.filter((_, idx) => idx !== vertexIndex);
    updateGraphicCoordinates(layerId, next);
  }, [tacticalGraphics, updateGraphicCoordinates]);

  const addVertexAfter = useCallback((layerId: string, vertexIndex: number) => {
    const source = tacticalGraphics.find((item) => item.id === layerId) ?? null;
    if (!source) return;

    const coords = source.coordinates;
    const current = coords[vertexIndex];
    if (!current) return;

    let nextIndex = vertexIndex + 1;
    if (source.geometryType === "Polygon") {
      nextIndex = (vertexIndex + 1) % coords.length;
    } else if (nextIndex >= coords.length) {
      return;
    }

    const nextPoint = coords[nextIndex];
    if (!nextPoint) return;
    const midpoint: [number, number] = [
      (current[0] + nextPoint[0]) / 2,
      (current[1] + nextPoint[1]) / 2,
    ];

    const updated = [
      ...coords.slice(0, vertexIndex + 1),
      midpoint,
      ...coords.slice(vertexIndex + 1),
    ];
    updateGraphicCoordinates(layerId, updated);
  }, [tacticalGraphics, updateGraphicCoordinates]);

  const updateVertexCoordinate = useCallback(
    (layerId: string, vertexIndex: number, axis: 0 | 1, value: string) => {
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) return;

      const source = tacticalGraphics.find((item) => item.id === layerId) ?? null;
      if (!source) return;
      const next = source.coordinates.map((coord) => ([...coord] as [number, number]));
      if (!next[vertexIndex]) return;
      next[vertexIndex][axis] = parsed;
      updateGraphicCoordinates(layerId, next);
    },
    [tacticalGraphics, updateGraphicCoordinates],
  );

  return (
    <div className="flex h-full flex-col">
      <div className="border-b bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
        Flusso in 2 step: 1) seleziona grafica tattica 2) disegna su mappa con vertici multipli.
      </div>

      <div className="flex gap-1 px-3 pt-2 pb-1">
        {AFF_OPTIONS.map((a) => (
          <button
            key={a.id}
            className={cn(
              "flex-1 h-6 rounded text-[10px] font-medium border transition-colors",
              affiliation === a.id
                ? "text-white border-transparent"
                : "border-border text-muted-foreground hover:border-foreground"
            )}
            style={affiliation === a.id ? { background: a.color } : {}}
            onClick={() => setAffiliation(a.id)}
          >
            {a.label}
          </button>
        ))}
      </div>

      <div className="px-3 pb-1 flex gap-1.5">
        <input
          className="flex-1 h-6 rounded border border-input bg-background px-1.5 text-xs focus:outline-none"
          placeholder="Cerca grafica tattica..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="h-6 rounded border border-input bg-background px-1 text-xs focus:outline-none"
          value={family}
          onChange={(e) => setFamily(e.target.value)}
        >
          <option value="All">Tutte</option>
          {TACTICAL_FAMILIES.map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>
      </div>

      <div className="px-3 pb-1 flex items-center gap-2 text-[10px] text-muted-foreground">
        <label className="inline-flex items-center gap-1">
          <input
            type="checkbox"
            checked={snapEnabled}
            onChange={(event) => setSnapEnabled(event.target.checked)}
          />
          Snap vertici
        </label>
        <label className="inline-flex items-center gap-1">
          <span>Raggio</span>
          <input
            type="range"
            min={6}
            max={30}
            step={1}
            value={snapRadiusPx}
            onChange={(event) => setSnapRadiusPx(Number(event.target.value))}
            disabled={!snapEnabled}
          />
          <span>{snapRadiusPx}px</span>
        </label>
      </div>

      {drawing && selected && (
        <div className="mx-3 mb-1 rounded border border-blue-500/30 bg-blue-500/10 px-2 py-1 text-xs text-blue-700 dark:text-blue-300">
          <div className="flex items-center gap-2">
            <Crosshair size={11} />
            <span>
              Disegno attivo: {drawnPoints.length} vertici, min {minPoints(selected)}
            </span>
            {snapEnabled && hoverSnapped && <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px]">Snap</span>}
            <button className="ml-auto" onClick={cancelDrawing} title="Annulla"><X size={11} /></button>
          </div>
          <div className="mt-1 flex gap-1">
            <button
              className="rounded border px-2 py-0.5"
              onClick={undoLastVertex}
              disabled={drawnPoints.length === 0}
            >
              Annulla ultimo
            </button>
            <button
              className="rounded bg-primary px-2 py-0.5 text-primary-foreground disabled:opacity-50"
              onClick={finishDrawing}
              disabled={drawnPoints.length < minPoints(selected)}
            >
              Completa
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-3 pb-2 space-y-0.5">
        {entries.map((entry) => {
          const isActive = selected?.sidc === entry.sidc;
          const displaySidc = odinDisplaySidc(entry.sidc, affiliation);
          return (
            <div
              key={entry.sidc}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded px-2 py-1 transition-colors hover:bg-muted/60",
                isActive && "bg-primary/10 ring-1 ring-primary"
              )}
              onClick={() => setSelected((prev) => (prev?.sidc === entry.sidc ? null : entry))}
            >
              <GraphicPreview sidc={displaySidc} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium">{entry.name}</div>
                <div className="truncate text-[10px] text-muted-foreground">{entry.family} - {entry.geometryType}</div>
              </div>
            </div>
          );
        })}

        {entries.length === 0 && (
          <div className="py-4 text-center text-xs text-muted-foreground">Nessuna grafica trovata.</div>
        )}
      </div>

      {selected && (
        <div className="border-t px-3 py-2 space-y-1.5">
          <div className="text-[11px] font-medium">Step 2: disegno</div>
          <input
            className="h-7 w-full rounded border border-input bg-background px-2 text-xs focus:outline-none"
            placeholder="Designazione (opzionale)"
            value={designation}
            onChange={(e) => setDesignation(e.target.value)}
          />
          {!drawing ? (
            <button
              className="h-7 w-full rounded bg-primary text-[11px] text-primary-foreground"
              onClick={startDrawing}
            >
              Inizia disegno ({selected.geometryType === "Polygon" ? "area" : "linea"})
            </button>
          ) : null}
        </div>
      )}

      {tacticalGraphics.length > 0 && (
        <div className="border-t px-3 py-2">
          <div className="mb-1 flex items-center gap-2 text-[10px] font-medium text-muted-foreground">
            <span>Grafiche tattiche ({tacticalGraphics.length})</span>
            {tacticalLayer && (
              <button
                title={tacticalLayer.visible ? "Nascondi layer" : "Mostra layer"}
                className="ml-auto text-muted-foreground hover:text-foreground"
                onClick={() => updateLayer(tacticalLayer.id, { visible: !tacticalLayer.visible })}
              >
                {tacticalLayer.visible ? <Eye size={12} /> : <EyeOff size={12} />}
              </button>
            )}
          </div>
          <div className="max-h-28 space-y-0.5 overflow-y-auto">
            {tacticalGraphics.map((graphic) => (
              <div key={graphic.id} className="flex items-center gap-1.5 rounded px-1.5 py-1 hover:bg-muted/50">
                <span className="grid h-5 w-5 place-items-center rounded border text-[9px] text-muted-foreground">
                  {graphic.geometryType === "Polygon" ? "A" : "L"}
                </span>
                <div className="min-w-0 flex-1 text-[10px]">
                  <div className="truncate font-medium">{graphic.name}</div>
                  <div className="truncate text-muted-foreground">{graphic.SIDC}</div>
                </div>
                <button
                  title="Modifica vertici"
                  onClick={() => {
                    setEditingLayerId((prev) => (prev === graphic.id ? null : graphic.id));
                    setVertexPickTarget(null);
                    setAppendVertexLayerId(null);
                  }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Pencil size={12} />
                </button>
                <button
                  title="Rimuovi"
                  onClick={() =>
                    updateTacticalGraphics(
                      tacticalGraphics.filter((item) => item.id !== graphic.id),
                    )
                  }
                  className="text-muted-foreground hover:text-red-400"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {editingSource && (
        <div className="border-t px-3 py-2">
          <div className="mb-1 flex items-center gap-2 text-[11px] font-medium">
            <Crosshair size={12} />
            <span>Editor vertici: {editingSource.name}</span>
            <button
              className="ml-auto text-muted-foreground hover:text-foreground"
              onClick={() => {
                setEditingLayerId(null);
                setVertexPickTarget(null);
                setAppendVertexLayerId(null);
              }}
              title="Chiudi"
            >
              <X size={12} />
            </button>
          </div>

          <div className="mb-1 flex gap-1">
            <button
              className="rounded border px-2 py-0.5 text-[10px]"
              onClick={() => {
                if (appendVertexLayerId === editingSource.id) {
                  setAppendVertexLayerId(null);
                } else {
                  setAppendVertexLayerId(editingSource.id);
                  setVertexPickTarget(null);
                }
              }}
            >
              <Plus size={10} className="inline mr-1" />
              {appendVertexLayerId === editingSource.id ? "Stop append" : "Aggiungi vertice (click mappa)"}
            </button>
            {vertexPickTarget?.layerId === editingSource.id && (
              <button
                className="rounded border px-2 py-0.5 text-[10px]"
                onClick={() => setVertexPickTarget(null)}
              >
                Annulla sposta vertice
              </button>
            )}
            {snapEnabled && <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[10px]">Snap {snapRadiusPx}px</span>}
          </div>

          <div className="max-h-40 space-y-1 overflow-y-auto">
            {editingSource.coordinates.map((coord, index) => {
              const min = editingSource.geometryType === "Polygon" ? 3 : 2;
              const canRemove = editingSource.coordinates.length > min;
              const isPickActive =
                vertexPickTarget?.layerId === editingSource.id &&
                vertexPickTarget.vertexIndex === index;

              return (
                <div key={`${editingSource.id}-${index}`} className="rounded border px-1.5 py-1 text-[10px]">
                  <div className="mb-1 flex items-center gap-1">
                    <span className="font-medium">V{index + 1}</span>
                    <button
                      className={cn(
                        "rounded border px-1 py-0.5",
                        isPickActive && "border-primary text-primary"
                      )}
                      onClick={() => {
                        setAppendVertexLayerId(null);
                        setVertexPickTarget(
                          isPickActive ? null : { layerId: editingSource.id, vertexIndex: index }
                        );
                      }}
                    >
                      {isPickActive ? "Pick attivo" : "Sposta con click"}
                    </button>
                    <button
                      className="rounded border px-1 py-0.5"
                      onClick={() => addVertexAfter(editingSource.id, index)}
                      disabled={editingSource.geometryType === "LineString" && index === editingSource.coordinates.length - 1}
                    >
                      + dopo
                    </button>
                    <button
                      className="ml-auto rounded border px-1 py-0.5 text-red-600 disabled:opacity-50"
                      onClick={() => removeVertex(editingSource.id, index)}
                      disabled={!canRemove}
                    >
                      Rimuovi
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    <input
                      className="h-6 rounded border px-1 text-[10px]"
                      defaultValue={coord[0].toFixed(6)}
                      onBlur={(event) => updateVertexCoordinate(editingSource.id, index, 0, event.currentTarget.value)}
                    />
                    <input
                      className="h-6 rounded border px-1 text-[10px]"
                      defaultValue={coord[1].toFixed(6)}
                      onBlur={(event) => updateVertexCoordinate(editingSource.id, index, 1, event.currentTarget.value)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
