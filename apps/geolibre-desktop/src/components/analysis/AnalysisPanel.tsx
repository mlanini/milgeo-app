/**
 * AnalysisPanel.tsx
 *
 * Floating non-modal Analysis panel with 10 geospatial tools.
 * Receives the MapController ref so it can attach/detach draw event listeners
 * directly on the underlying MapLibre GL map instance.
 */
import { useAppStore } from "@geolibre/core";
import { Button, Input, Label, ScrollArea, cn } from "@geolibre/ui";
import type { MapController } from "@geolibre/map";
import type { Map as MaplibreMap, GeoJSONSource } from "maplibre-gl";
import {
  Activity,
  AreaChart,
  Compass,
  Database,
  Download,
  Eye,
  Layers,
  MapPin,
  Mountain,
  Ruler,
  Sun,
  TrendingUp,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type RefObject,
} from "react";
import {
  formatArea,
  formatBearing,
  formatDistance,
  haversineDistance,
  lineOfSight,
  polylineLength,
  polygonArea,
  samplePolyline,
  cumulativeDistances,
  bearing as computeBearing,
} from "../../lib/analysis-measure";
import {
  queryElevations,
  elevationStats,
  gridSamplePolygon,
} from "../../lib/analysis-elevation";
import {
  solarEphemeris,
  lunarEphemeris,
  formatTimeUtc,
} from "../../lib/analysis-ephemeris";
import { useDesktopSettingsStore } from "../../hooks/useDesktopSettings";
import type { DemSource } from "../../hooks/useDesktopSettings";

/** Mirror the sidecar base-URL logic from @geolibre/processing/sidecar-client. */
const SIDECAR_BASE_URL: string =
  (typeof import.meta !== "undefined" &&
    // @ts-expect-error — Vite replaces import.meta.env at build time
    (import.meta.env as Record<string, string>).VITE_SIDECAR_URL) ||
  "http://127.0.0.1:8765";

async function fetchSidecarUrl(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(`${SIDECAR_BASE_URL}${path}`, init);
}

// ─── Tool definitions ─────────────────────────────────────────────────────────

type DrawMode = "none" | "point" | "line" | "polygon" | "rectangle";

interface ToolDef {
  id: string;
  label: string;
  icon: typeof Ruler;
  drawMode: DrawMode;
  description: string;
}

const TOOLS: ToolDef[] = [
  {
    id: "distance",
    label: "Distance",
    icon: Ruler,
    drawMode: "line",
    description: "Measure the total length of a path drawn on the map.",
  },
  {
    id: "azimuth",
    label: "Azimuth",
    icon: Compass,
    drawMode: "line",
    description: "Measure the azimuth / bearing between two points.",
  },
  {
    id: "area",
    label: "Area",
    icon: AreaChart,
    drawMode: "polygon",
    description: "Measure the area of a polygon drawn on the map.",
  },
  {
    id: "profile",
    label: "Elevation Profile",
    icon: TrendingUp,
    drawMode: "line",
    description: "Draw a transect line and plot the elevation profile along it.",
  },
  {
    id: "los",
    label: "Line of Sight",
    icon: Eye,
    drawMode: "line",
    description:
      "Check visibility between observer (first click) and target (last click) along a transect.",
  },
  {
    id: "minmax",
    label: "Min/Max Elevation",
    icon: Mountain,
    drawMode: "polygon",
    description:
      "Sample elevations inside a polygon and report min, max and mean.",
  },
  {
    id: "slope",
    label: "Slope Map",
    icon: Activity,
    drawMode: "rectangle",
    description:
      "Generate a slope-gradient map for a selected area (requires Python sidecar).",
  },
  {
    id: "hillshade",
    label: "Hillshade",
    icon: Layers,
    drawMode: "rectangle",
    description:
      "Generate a hillshade map for a selected area (requires Python sidecar).",
  },
  {
    id: "viewshed",
    label: "Viewshed",
    icon: MapPin,
    drawMode: "point",
    description:
      "Compute the visible area from an observer point (requires Python sidecar).",
  },
  {
    id: "ephemeris",
    label: "Ephemeris",
    icon: Sun,
    drawMode: "point",
    description:
      "Compute sun & moon position and rise/set times for a location and date/time.",
  },
];

// ─── Types ────────────────────────────────────────────────────────────────────

type LonLat = [number, number];

interface AnalysisResult {
  toolId: string;
  // Distance / Azimuth / Area
  distanceM?: number;
  azimuthDeg?: number;
  areaM2?: number;
  // Elevation profile / LOS
  profilePoints?: LonLat[];
  profileElevations?: number[];
  losVisible?: boolean[];
  // Min/Max
  elevStats?: ReturnType<typeof elevationStats>;
  // Ephemeris
  solarPos?: ReturnType<typeof solarEphemeris>;
  lunarPos?: ReturnType<typeof lunarEphemeris>;
  // Raster tools (sidecar)
  overlayImageUrl?: string;
  error?: string;
}

// ─── Drawing layer IDs ────────────────────────────────────────────────────────
const DRAW_SOURCE_ID = "analysis-draw-source";
const DRAW_LINE_LAYER_ID = "analysis-draw-line";
const DRAW_FILL_LAYER_ID = "analysis-draw-fill";
const DRAW_CIRCLE_LAYER_ID = "analysis-draw-circle";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function coordsToGeoJson(coords: LonLat[], mode: DrawMode) {
  if (coords.length === 0) return { type: "FeatureCollection", features: [] };
  if (mode === "point") {
    return {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: coords[0] },
          properties: {},
        },
      ],
    };
  }
  if (mode === "line") {
    return {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: coords,
          },
          properties: {},
        },
        ...coords.map((c, i) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: c },
          properties: { idx: i },
        })),
      ],
    };
  }
  // polygon / rectangle
  const ring =
    coords.length >= 3 &&
    (coords[0][0] !== coords[coords.length - 1][0] ||
      coords[0][1] !== coords[coords.length - 1][1])
      ? [...coords, coords[0]]
      : coords;
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [ring] },
        properties: {},
      },
      ...coords.map((c, i) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: c },
        properties: { idx: i },
      })),
    ],
  };
}

function setupDrawLayer(map: MaplibreMap) {
  if (map.getSource(DRAW_SOURCE_ID)) return;
  map.addSource(DRAW_SOURCE_ID, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });
  map.addLayer({
    id: DRAW_FILL_LAYER_ID,
    type: "fill",
    source: DRAW_SOURCE_ID,
    filter: ["==", "$type", "Polygon"],
    paint: { "fill-color": "#3b82f6", "fill-opacity": 0.15 },
  });
  map.addLayer({
    id: DRAW_LINE_LAYER_ID,
    type: "line",
    source: DRAW_SOURCE_ID,
    filter: ["in", "$type", "LineString", "Polygon"],
    paint: { "line-color": "#3b82f6", "line-width": 2, "line-dasharray": [4, 2] },
  });
  map.addLayer({
    id: DRAW_CIRCLE_LAYER_ID,
    type: "circle",
    source: DRAW_SOURCE_ID,
    filter: ["==", "$type", "Point"],
    paint: {
      "circle-radius": 5,
      "circle-color": "#ffffff",
      "circle-stroke-width": 2,
      "circle-stroke-color": "#3b82f6",
    },
  });
}

function teardownDrawLayer(map: MaplibreMap) {
  [DRAW_CIRCLE_LAYER_ID, DRAW_LINE_LAYER_ID, DRAW_FILL_LAYER_ID].forEach(
    (id) => {
      if (map.getLayer(id)) map.removeLayer(id);
    },
  );
  if (map.getSource(DRAW_SOURCE_ID)) map.removeSource(DRAW_SOURCE_ID);
}

function updateDrawSource(map: MaplibreMap, coords: LonLat[], mode: DrawMode) {
  const src = map.getSource(DRAW_SOURCE_ID) as GeoJSONSource | undefined;
  if (src) {
    src.setData(coordsToGeoJson(coords, mode) as Parameters<typeof src.setData>[0]);
  }
}

// ─── Elevation profile SVG chart ──────────────────────────────────────────────

function ProfileChart({
  distances,
  elevations,
  losVisible,
}: {
  distances: number[];
  elevations: number[];
  losVisible?: boolean[];
}) {
  const W = 320;
  const H = 120;
  const PAD = { top: 8, right: 8, bottom: 24, left: 40 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const validElev = elevations.filter((e) => Number.isFinite(e));
  if (validElev.length < 2) {
    return (
      <p className="text-xs text-muted-foreground py-2 text-center">
        Not enough elevation data to plot profile.
      </p>
    );
  }

  const minElev = Math.min(...validElev);
  const maxElev = Math.max(...validElev);
  const elevRange = maxElev - minElev || 1;
  const maxDist = distances[distances.length - 1] || 1;

  const scaleX = (d: number) => PAD.left + (d / maxDist) * innerW;
  const scaleY = (e: number) => PAD.top + innerH - ((e - minElev) / elevRange) * innerH;

  // Build path points
  const pts: string[] = [];
  for (let i = 0; i < distances.length; i++) {
    if (!Number.isFinite(elevations[i])) continue;
    const x = scaleX(distances[i]);
    const y = scaleY(elevations[i]);
    pts.push(`${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`);
  }

  // LOS colour segments
  const segments: Array<{ pts: string; visible: boolean }> = [];
  if (losVisible) {
    let segPts: string[] = [];
    let segVis = losVisible[0];
    for (let i = 0; i < distances.length; i++) {
      if (!Number.isFinite(elevations[i])) continue;
      const x = scaleX(distances[i]);
      const y = scaleY(elevations[i]);
      if (i > 0 && losVisible[i] !== segVis) {
        segments.push({ pts: segPts.join(" "), visible: segVis });
        segPts = [`M${scaleX(distances[i - 1]).toFixed(1)},${scaleY(elevations[i - 1]).toFixed(1)}`];
        segVis = losVisible[i];
      }
      segPts.push(`${segPts.length === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`);
    }
    if (segPts.length > 0) segments.push({ pts: segPts.join(" "), visible: segVis });
  }

  // Grid labels
  const yLabels = [minElev, (minElev + maxElev) / 2, maxElev];
  const distKm = maxDist / 1000;
  const xLabel = distKm < 1 ? `${maxDist.toFixed(0)} m` : `${distKm.toFixed(2)} km`;

  return (
    <svg
      width={W}
      height={H}
      className="overflow-visible text-muted-foreground"
      aria-label="Elevation profile chart"
    >
      {/* Grid lines */}
      {yLabels.map((v, i) => {
        const y = scaleY(v);
        return (
          <g key={i}>
            <line
              x1={PAD.left}
              y1={y}
              x2={PAD.left + innerW}
              y2={y}
              stroke="currentColor"
              strokeOpacity={0.15}
            />
            <text
              x={PAD.left - 4}
              y={y + 4}
              textAnchor="end"
              fontSize={9}
              fill="currentColor"
            >
              {v.toFixed(0)}
            </text>
          </g>
        );
      })}

      {/* Elevation area fill */}
      {pts.length > 0 && (
        <path
          d={`${pts.join(" ")} L${scaleX(distances[distances.length - 1]).toFixed(1)},${(PAD.top + innerH).toFixed(1)} L${PAD.left.toFixed(1)},${(PAD.top + innerH).toFixed(1)} Z`}
          fill="#3b82f6"
          fillOpacity={0.12}
        />
      )}

      {/* LOS segments or plain profile */}
      {losVisible && segments.length > 0
        ? segments.map((s, i) => (
            <path
              key={i}
              d={s.pts}
              fill="none"
              stroke={s.visible ? "#22c55e" : "#ef4444"}
              strokeWidth={2}
              strokeLinecap="round"
            />
          ))
        : pts.length > 0 && (
            <path
              d={pts.join(" ")}
              fill="none"
              stroke="#3b82f6"
              strokeWidth={2}
              strokeLinecap="round"
            />
          )}

      {/* Axes */}
      <line
        x1={PAD.left}
        y1={PAD.top}
        x2={PAD.left}
        y2={PAD.top + innerH}
        stroke="currentColor"
        strokeOpacity={0.4}
      />
      <line
        x1={PAD.left}
        y1={PAD.top + innerH}
        x2={PAD.left + innerW}
        y2={PAD.top + innerH}
        stroke="currentColor"
        strokeOpacity={0.4}
      />

      {/* X-axis label */}
      <text
        x={PAD.left + innerW / 2}
        y={H - 4}
        textAnchor="middle"
        fontSize={9}
        fill="currentColor"
        fillOpacity={0.7}
      >
        {xLabel}
      </text>
      <text
        x={10}
        y={PAD.top + innerH / 2}
        textAnchor="middle"
        fontSize={9}
        fill="currentColor"
        fillOpacity={0.7}
        transform={`rotate(-90, 10, ${PAD.top + innerH / 2})`}
      >
        m asl
      </text>
    </svg>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface AnalysisPanelProps {
  mapControllerRef: RefObject<MapController | null>;
}

type RunState = "idle" | "drawing" | "loading" | "done" | "error";

export function AnalysisPanel({ mapControllerRef }: AnalysisPanelProps) {
  const open = useAppStore((s) => s.ui.analysisOpen);
  const setAnalysisOpen = useAppStore((s) => s.setAnalysisOpen);
  const desktopSettings = useDesktopSettingsStore((s) => s.desktopSettings);
  const setDesktopSettings = useDesktopSettingsStore((s) => s.setDesktopSettings);
  const demSource = desktopSettings.demSource;
  const localDtmPath = desktopSettings.localDtmPath;

  const [selectedToolId, setSelectedToolId] = useState<string>("distance");
  const [runState, setRunState] = useState<RunState>("idle");
  const [drawnCoords, setDrawnCoords] = useState<LonLat[]>([]);
  const [progress, setProgress] = useState<string>("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  // Ephemeris date/time
  const [ephDate, setEphDate] = useState<string>(
    () => new Date().toISOString().slice(0, 16),
  );
  // Profile sample count
  const [profileSamples, setProfileSamples] = useState(64);
  const [demPickerOpen, setDemPickerOpen] = useState(false);
  // Local file path input (only used inside DEM picker, before save)
  const [localDtmDraft, setLocalDtmDraft] = useState("");

  // Show DEM picker whenever the panel opens without a source configured
  useEffect(() => {
    if (open && demSource === "") {
      setDemPickerOpen(true);
    }
  }, [open, demSource]);

  const selectedTool = useMemo(
    () => TOOLS.find((t) => t.id === selectedToolId)!,
    [selectedToolId],
  );

  // ─── Reset when tool changes ────────────────────────────────────────────────
  useEffect(() => {
    setDrawnCoords([]);
    setResult(null);
    setRunState("idle");
    setProgress("");
  }, [selectedToolId]);

  // ─── Clean up draw layer when panel closes ──────────────────────────────────
  useEffect(() => {
    if (!open) {
      const map = mapControllerRef.current?.getMap?.();
      if (map) teardownDrawLayer(map);
    }
  }, [open, mapControllerRef]);

  // ─── Map drawing event listeners ────────────────────────────────────────────
  useEffect(() => {
    if (runState !== "drawing") return;

    const map = mapControllerRef.current?.getMap?.();
    if (!map) return;

    setupDrawLayer(map);
    const prevCursor = map.getCanvas().style.cursor;
    map.getCanvas().style.cursor = "crosshair";

    const onMapClick = (e: { lngLat: { lng: number; lat: number }; originalEvent: MouseEvent }) => {
      const pt: LonLat = [e.lngLat.lng, e.lngLat.lat];

      setDrawnCoords((prev) => {
        const next: LonLat[] =
          selectedTool.drawMode === "point" ? [pt] : [...prev, pt];
        updateDrawSource(map, next, selectedTool.drawMode);
        return next;
      });

      // Single-point tools finish drawing immediately after first click
      if (selectedTool.drawMode === "point") {
        setRunState("idle");
      }
    };

    const onMapDblClick = (e: { originalEvent: MouseEvent }) => {
      // Prevent default map zoom-in on double-click while drawing
      e.originalEvent.preventDefault();
      setRunState("idle");
    };

    // Disable the built-in double-click zoom while drawing
    map.doubleClickZoom.disable();
    map.on("click", onMapClick);
    map.on("dblclick", onMapDblClick);

    return () => {
      map.off("click", onMapClick);
      map.off("dblclick", onMapDblClick);
      map.doubleClickZoom.enable();
      map.getCanvas().style.cursor = prevCursor;
    };
  }, [runState, selectedTool, mapControllerRef]);

  // ─── Handlers ────────────────────────────────────────────────────────────────

  const handleStartDraw = useCallback(() => {
    setDrawnCoords([]);
    setResult(null);
    setRunState("drawing");
    const map = mapControllerRef.current?.getMap?.();
    if (map) updateDrawSource(map, [], selectedTool.drawMode);
  }, [mapControllerRef, selectedTool]);

  const handleClearDraw = useCallback(() => {
    setDrawnCoords([]);
    setResult(null);
    setRunState("idle");
    const map = mapControllerRef.current?.getMap?.();
    if (map) updateDrawSource(map, [], selectedTool.drawMode);
  }, [mapControllerRef, selectedTool]);

  const handleFinishDraw = useCallback(() => {
    setRunState("idle");
  }, []);

  const handleRunAnalysis = useCallback(async () => {
    setRunState("loading");
    setProgress("");
    setResult(null);

    try {
      const id = selectedTool.id;

      // ─ Distance ─────────────────────────────────────────────────────────────
      if (id === "distance") {
        const dist = polylineLength(drawnCoords);
        setResult({ toolId: id, distanceM: dist });
        setRunState("done");
        return;
      }

      // ─ Azimuth ──────────────────────────────────────────────────────────────
      if (id === "azimuth") {
        if (drawnCoords.length < 2) {
          setResult({ toolId: id, error: "Draw at least 2 points." });
          setRunState("error");
          return;
        }
        const az = computeBearing(
          drawnCoords[0],
          drawnCoords[drawnCoords.length - 1],
        );
        const dist = haversineDistance(
          drawnCoords[0],
          drawnCoords[drawnCoords.length - 1],
        );
        setResult({
          toolId: id,
          azimuthDeg: az,
          distanceM: dist,
        });
        setRunState("done");
        return;
      }

      // ─ Area ──────────────────────────────────────────────────────────────────
      if (id === "area") {
        const area = polygonArea(drawnCoords);
        setResult({ toolId: id, areaM2: area });
        setRunState("done");
        return;
      }

      // ─ Elevation profile ─────────────────────────────────────────────────────
      if (id === "profile" || id === "los") {
        if (drawnCoords.length < 2) {
          setResult({ toolId: id, error: "Draw at least 2 points." });
          setRunState("error");
          return;
        }
        const samples = samplePolyline(drawnCoords, profileSamples);
        const elevSamples = await queryElevations(
          samples,
          (done, total) => { setProgress(`Querying elevation… ${done}/${total}`); },
          demSource === "local" ? { source: "local", localDtmPath } : { source: "online" },
        );
        const distances = cumulativeDistances(samples);
        const elevations = elevSamples.map((s) => s.elevationM ?? NaN);

        let losVisible: boolean[] | undefined;
        if (id === "los") {
          const validElevs = elevations.map((e) => (Number.isFinite(e) ? e : 0));
          losVisible = lineOfSight(validElevs);
        }

        setStoredElevations(elevations);
        setStoredDistances(distances);
        setResult({
          toolId: id,
          profilePoints: elevSamples.map((s) => [s.lon, s.lat]),
          profileElevations: distances,
          losVisible,
        });
        setRunState("done");
        return;
      }

      // ─ Min/Max Elevation ─────────────────────────────────────────────────────
      if (id === "minmax") {
        if (drawnCoords.length < 3) {
          setResult({ toolId: id, error: "Draw at least 3 points to define a polygon." });
          setRunState("error");
          return;
        }
        const gridPts = gridSamplePolygon(drawnCoords, 64);
        setProgress(`Querying ${gridPts.length} sample points…`);
        const samples = await queryElevations(
          gridPts,
          (done, total) => { setProgress(`Querying elevation… ${done}/${total}`); },
          demSource === "local" ? { source: "local", localDtmPath } : { source: "online" },
        );
        const stats = elevationStats(samples);
        setResult({ toolId: id, elevStats: stats });
        setRunState("done");
        return;
      }

      // ─ Ephemeris ─────────────────────────────────────────────────────────────
      if (id === "ephemeris") {
        const coords =
          drawnCoords.length > 0 ? drawnCoords[0] : ([0, 0] as LonLat);
        const dt = ephDate ? new Date(ephDate) : new Date();
        const solar = solarEphemeris(dt, coords[1], coords[0]);
        const lunar = lunarEphemeris(dt, coords[1], coords[0]);
        setResult({ toolId: id, solarPos: solar, lunarPos: lunar });
        setRunState("done");
        return;
      }

      // ─ Sidecar tools (Slope, Hillshade, Viewshed) ────────────────────────────
      if (id === "slope" || id === "hillshade" || id === "viewshed") {
        const apiKey = desktopSettings.openTopographyApiKey;
        if (!apiKey) {
          setResult({
            toolId: id,
            error:
              "No OpenTopography API key configured. Go to Settings → Map to add one.",
          });
          setRunState("error");
          return;
        }

        // Derive bounding box from drawn coords
        const lons = drawnCoords.map((c) => c[0]);
        const lats = drawnCoords.map((c) => c[1]);
        const bbox = {
          west: Math.min(...lons),
          east: Math.max(...lons),
          south: Math.min(...lats),
          north: Math.max(...lats),
        };

        setProgress("Requesting DEM from OpenTopography…");

        try {
          const demUrl = `https://portal.opentopography.org/API/globaldem?demtype=SRTMGL1&south=${bbox.south}&north=${bbox.north}&west=${bbox.west}&east=${bbox.east}&outputFormat=GTiff&API_Key=${apiKey}`;

          const toolName =
            id === "slope"
              ? "SlopeVs"
              : id === "hillshade"
                ? "Hillshade"
                : "Viewshed";

          // Route through Python sidecar
          const response = await fetchSidecarUrl(
            `/analysis/${toolName}`,
            {
              method: "POST",
              body: JSON.stringify({ dem_url: demUrl, bbox }),
              headers: { "Content-Type": "application/json" },
            },
          );

          if (!response.ok) {
            const err = await response.text().catch(() => response.statusText);
            setResult({ toolId: id, error: `Sidecar error: ${err}` });
            setRunState("error");
            return;
          }

          const json = (await response.json()) as { image_data_url?: string };
          setResult({ toolId: id, overlayImageUrl: json.image_data_url });
          setRunState("done");
        } catch (err) {
          setResult({
            toolId: id,
            error: `Failed to contact sidecar: ${err instanceof Error ? err.message : String(err)}`,
          });
          setRunState("error");
        }
        return;
      }
    } catch (err) {
      setResult({
        toolId: selectedTool.id,
        error: err instanceof Error ? err.message : String(err),
      });
      setRunState("error");
    }
  }, [selectedTool, drawnCoords, ephDate, profileSamples, desktopSettings, demSource, localDtmPath]);

  // Extra state for elevation profile
  const [storedElevations, setStoredElevations] = useState<number[]>([]);
  const [storedDistances, setStoredDistances] = useState<number[]>([]);

  // Helper to get bearing (already imported as computeBearing, kept for reference)
  // No inline require_bearing needed

  // ─── Download result as GeoJSON ─────────────────────────────────────────────
  const handleDownload = useCallback(() => {
    const data: Record<string, unknown> = {
      tool: selectedTool.id,
      coordinates: drawnCoords,
      result: result ?? {},
    };
    if (storedElevations.length > 0) {
      data.elevations = storedElevations;
      data.distances = storedDistances;
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `analysis-${selectedTool.id}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [selectedTool, drawnCoords, result, storedElevations, storedDistances]);

  // ─── Render ───────────────────────────────────────────────────────────────────

  const isDrawMode = runState === "drawing";
  const isLoading = runState === "loading";
  const hasDraw = drawnCoords.length > 0;
  const canRun =
    hasDraw &&
    !isLoading &&
    (selectedTool.drawMode === "none" ||
      drawnCoords.length >= (selectedTool.drawMode === "point" ? 1 : 2));

  return (
    <div
      className="relative flex flex-col h-full"
      role="complementary"
      aria-label="Analysis panel"
    >
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
        <Activity className="size-4 text-primary" />
        <span className="flex-1 text-sm font-semibold">Analysis</span>
        {/* DEM source indicator */}
        <button
          type="button"
          onClick={() => {
            setLocalDtmDraft(localDtmPath);
            setDemPickerOpen(true);
          }}
          className="flex items-center gap-1 rounded border bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          title="Change DEM source"
        >
          <Database className="size-3" />
          {demSource === "local" ? "Local DTM" : "Online API"}
        </button>
        <Button
          size="icon"
          variant="ghost"
          className="size-6"
          onClick={() => setAnalysisOpen(false)}
          aria-label="Close Analysis panel"
        >
          <X className="size-3.5" />
        </Button>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Tool list */}
        <div className="w-[130px] shrink-0 border-r">
          <ScrollArea className="h-full">
            <nav className="flex flex-col gap-0.5 p-1">
              {TOOLS.map((tool) => {
                const Icon = tool.icon;
                const active = selectedToolId === tool.id;
                return (
                  <button
                    key={tool.id}
                    type="button"
                    onClick={() => setSelectedToolId(tool.id)}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded px-1 py-2 text-center text-xs transition-colors hover:bg-accent",
                      active && "bg-primary/10 text-primary font-medium",
                    )}
                  >
                    <Icon className="size-4" />
                    {tool.label}
                  </button>
                );
              })}
            </nav>
          </ScrollArea>
        </div>

        {/* Tool content */}
        <ScrollArea className="flex-1">
          <div className="flex flex-col gap-3 p-3">
            {/* Tool header */}
            <div>
              <p className="text-xs font-semibold">{selectedTool.label}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {selectedTool.description}
              </p>
            </div>

            {/* Draw controls */}
            {selectedTool.drawMode !== "none" && (
              <div className="flex flex-col gap-1.5">
                <p className="text-[11px] text-muted-foreground">
                  {isDrawMode
                    ? selectedTool.drawMode === "point"
                      ? "Click on the map to place a point."
                      : selectedTool.drawMode === "line"
                        ? "Click to add points. Double-click to finish."
                        : "Click to add polygon vertices. Double-click to close."
                    : `${drawnCoords.length} point${drawnCoords.length !== 1 ? "s" : ""} drawn.`}
                </p>
                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    variant={isDrawMode ? "secondary" : "outline"}
                    className="h-7 flex-1 text-xs"
                    onClick={isDrawMode ? handleFinishDraw : handleStartDraw}
                  >
                    {isDrawMode ? "Finish Drawing" : "Draw on Map"}
                  </Button>
                  {hasDraw && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-muted-foreground"
                      onClick={handleClearDraw}
                    >
                      Clear
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Ephemeris date/time picker */}
            {selectedTool.id === "ephemeris" && (
              <div className="flex flex-col gap-1">
                <Label className="text-[11px]">Date &amp; Time (UTC)</Label>
                <Input
                  type="datetime-local"
                  value={ephDate}
                  onChange={(e) => setEphDate(e.target.value)}
                  className="h-7 text-xs"
                />
              </div>
            )}

            {/* Profile sample count */}
            {(selectedTool.id === "profile" || selectedTool.id === "los") && (
              <div className="flex items-center gap-2">
                <Label className="text-[11px] whitespace-nowrap">Samples</Label>
                <Input
                  type="number"
                  min={10}
                  max={200}
                  value={profileSamples}
                  onChange={(e) =>
                    setProfileSamples(
                      Math.max(10, Math.min(200, Number(e.target.value))),
                    )
                  }
                  className="h-7 w-20 text-xs"
                />
              </div>
            )}

            {/* Run button */}
            {(canRun || selectedTool.id === "ephemeris") && (
              <Button
                size="sm"
                className="h-7 text-xs"
                disabled={isLoading}
                onClick={() => void handleRunAnalysis()}
              >
                {isLoading ? "Computing…" : "Run Analysis"}
              </Button>
            )}

            {/* Progress */}
            {isLoading && progress && (
              <p className="text-[11px] text-muted-foreground">{progress}</p>
            )}

            {/* Results */}
            {result && runState === "done" && (
              <ResultsPane
                result={result}
                elevations={storedElevations}
                distances={storedDistances}
                onDownload={handleDownload}
              />
            )}

            {/* Error */}
            {result?.error && runState === "error" && (
              <div className="rounded border border-destructive/40 bg-destructive/10 p-2 text-[11px] text-destructive">
                {result.error}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Drawing overlay hint */}
      {isDrawMode && (
        <div className="shrink-0 border-t bg-primary/5 px-3 py-1.5 text-center text-[11px] text-primary">
          Drawing active — click on the map to add points
        </div>
      )}

      {/* DEM picker overlay */}
      {demPickerOpen && (
        <DemPickerOverlay
          currentSource={demSource}
          currentLocalPath={localDtmPath}
          localDtmDraft={localDtmDraft}
          onLocalDtmDraftChange={setLocalDtmDraft}
          onConfirm={(source, path) => {
            setDesktopSettings({
              ...desktopSettings,
              demSource: source,
              localDtmPath: path,
            });
            setDemPickerOpen(false);
          }}
        />
      )}
    </div>
  );
}

// ─── DEM Picker Overlay ───────────────────────────────────────────────────────

function DemPickerOverlay({
  currentSource,
  currentLocalPath,
  localDtmDraft,
  onLocalDtmDraftChange,
  onConfirm,
}: {
  currentSource: DemSource;
  currentLocalPath: string;
  localDtmDraft: string;
  onLocalDtmDraftChange: (v: string) => void;
  onConfirm: (source: DemSource, localPath: string) => void;
}) {
  const [selected, setSelected] = useState<DemSource>(
    currentSource !== "" ? currentSource : "online",
  );
  const [localPath, setLocalPath] = useState(localDtmDraft || currentLocalPath);

  const canConfirm = selected === "online" || (selected === "local" && localPath.trim() !== "");

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    // In a browser context we can only get the file name, not the full path.
    // The sidecar needs the real FS path, so we show an additional text input.
    const file = files[0];
    // Prefer the webkitRelativePath or name as a hint; user can correct it.
    const name = (file as File & { path?: string }).path ?? file.name;
    setLocalPath(name);
    onLocalDtmDraftChange(name);
  };

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/90 backdrop-blur-sm">
      <div className="mx-4 flex w-full max-w-[340px] flex-col gap-4 rounded-lg border bg-background p-4 shadow-lg">
        <div className="flex items-center gap-2">
          <Database className="size-4 text-primary" />
          <span className="text-sm font-semibold">Choose Elevation Source</span>
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Select which Digital Elevation Model (DEM) to use for profile, line-of-sight and
          min/max elevation tools.
        </p>

        {/* Option A — Online */}
        <label
          className={cn(
            "flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors hover:bg-accent/50",
            selected === "online" && "border-primary bg-primary/5",
          )}
        >
          <input
            type="radio"
            name="dem-source"
            value="online"
            checked={selected === "online"}
            onChange={() => setSelected("online")}
            className="mt-0.5 accent-primary"
          />
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-medium">OpenTopography API (online)</span>
            <span className="text-[11px] text-muted-foreground">
              Uses swisstopo (sub-metre, CH only) and OpenTopoData SRTM 90 m (global).
              No API key required for point queries.
            </span>
          </div>
        </label>

        {/* Option B — Local DTM */}
        <label
          className={cn(
            "flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors hover:bg-accent/50",
            selected === "local" && "border-primary bg-primary/5",
          )}
        >
          <input
            type="radio"
            name="dem-source"
            value="local"
            checked={selected === "local"}
            onChange={() => setSelected("local")}
            className="mt-0.5 accent-primary"
          />
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium">Local DTM raster file</span>
            <span className="text-[11px] text-muted-foreground">
              GeoTIFF, ASCII grid or any GDAL-supported raster. Queries are processed by
              the local Python sidecar at <code>127.0.0.1:8765</code>.
            </span>
            {selected === "local" && (
              <div className="mt-1 rounded border border-amber-500/40 bg-amber-500/10 p-2 text-[10px] text-amber-300 leading-relaxed">
                ⚠️ Requires the <strong>local sidecar</strong> to be running
                (<code>geolibre-server</code> on port 8765). Not available in the
                hosted web version — use <strong>Online API</strong> instead.
              </div>
            )}
              <div className="mt-1.5 flex flex-col gap-1.5">
                <input
                  type="file"
                  accept=".tif,.tiff,.asc,.img,.hgt"
                  onChange={handleFileChange}
                  className="text-[11px] file:mr-2 file:rounded file:border file:border-border file:bg-muted file:px-2 file:py-0.5 file:text-[11px]"
                />
                <Input
                  placeholder="Full path to raster file…"
                  value={localPath}
                  onChange={(e) => {
                    setLocalPath(e.target.value);
                    onLocalDtmDraftChange(e.target.value);
                  }}
                  className="h-7 text-xs font-mono"
                />
                <p className="text-[10px] text-muted-foreground">
                  Enter or paste the absolute file-system path if the browser cannot
                  resolve it automatically.
                </p>
              </div>
            )}
          </div>
        </label>

        <div className="flex gap-2">
          {currentSource !== "" && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 flex-1 text-xs"
              onClick={() => onConfirm(currentSource, currentLocalPath)}
            >
              Cancel
            </Button>
          )}
          <Button
            size="sm"
            className="h-7 flex-1 text-xs"
            disabled={!canConfirm}
            onClick={() => onConfirm(selected, selected === "local" ? localPath.trim() : "")}
          >
            Confirm
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Results pane ──────────────────────────────────────────────────────────────

function ResultsPane({
  result,
  elevations,
  distances,
  onDownload,
}: {
  result: AnalysisResult;
  elevations: number[];
  distances: number[];
  onDownload: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
          Results
        </p>
        <Button
          size="sm"
          variant="outline"
          className="h-6 gap-1 px-2 text-[10px]"
          onClick={onDownload}
        >
          <Download className="size-3" />
          Export
        </Button>
      </div>

      {/* Distance */}
      {result.distanceM !== undefined && (
        <ResultRow label="Distance" value={formatDistance(result.distanceM)} />
      )}

      {/* Azimuth */}
      {result.azimuthDeg !== undefined && (
        <ResultRow label="Azimuth" value={formatBearing(result.azimuthDeg)} />
      )}

      {/* Area */}
      {result.areaM2 !== undefined && (
        <ResultRow label="Area" value={formatArea(result.areaM2)} />
      )}

      {/* Elevation stats */}
      {result.elevStats && (
        <>
          <ResultRow label="Min elevation" value={`${result.elevStats.minM.toFixed(1)} m`} />
          <ResultRow label="Max elevation" value={`${result.elevStats.maxM.toFixed(1)} m`} />
          <ResultRow label="Mean elevation" value={`${result.elevStats.meanM.toFixed(1)} m`} />
          <ResultRow label="Sample count" value={String(result.elevStats.count)} />
        </>
      )}

      {/* Profile chart */}
      {elevations.length > 1 && distances.length > 1 && (
        <div className="overflow-x-auto rounded border p-2">
          <ProfileChart
            distances={distances}
            elevations={elevations}
            losVisible={result.losVisible}
          />
          {result.losVisible && (
            <div className="mt-1 flex gap-3 text-[10px]">
              <span className="flex items-center gap-1">
                <span className="inline-block size-2 rounded-full bg-green-500" />
                Visible
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block size-2 rounded-full bg-red-500" />
                Hidden
              </span>
            </div>
          )}
          <p className="mt-1 text-[10px] text-muted-foreground">
            {elevations.filter((e) => Number.isFinite(e)).length} of{" "}
            {elevations.length} samples with valid elevation.
          </p>
        </div>
      )}

      {/* Solar ephemeris */}
      {result.solarPos && (
        <>
          <p className="text-[11px] font-medium mt-1">☀ Sun</p>
          <ResultRow label="Azimuth" value={formatBearing(result.solarPos.azimuth)} />
          <ResultRow label="Elevation" value={`${result.solarPos.elevation.toFixed(1)}°`} />
          <ResultRow label="Sunrise" value={formatTimeUtc(result.solarPos.sunriseUtc)} />
          <ResultRow label="Solar noon" value={formatTimeUtc(result.solarPos.solarNoonUtc)} />
          <ResultRow label="Sunset" value={formatTimeUtc(result.solarPos.sunsetUtc)} />
          <ResultRow label="Day length" value={`${result.solarPos.dayLengthMin.toFixed(0)} min`} />
        </>
      )}

      {/* Lunar ephemeris */}
      {result.lunarPos && (
        <>
          <p className="text-[11px] font-medium mt-1">🌕 Moon</p>
          <ResultRow label="Phase" value={result.lunarPos.phaseName} />
          <ResultRow label="Illumination" value={`${(result.lunarPos.illumination * 100).toFixed(0)}%`} />
          <ResultRow label="Azimuth" value={formatBearing(result.lunarPos.azimuth)} />
          <ResultRow label="Elevation" value={`${result.lunarPos.elevation.toFixed(1)}°`} />
          <ResultRow label="Moonrise" value={formatTimeUtc(result.lunarPos.moonriseUtc)} />
          <ResultRow label="Moonset" value={formatTimeUtc(result.lunarPos.moonsetUtc)} />
        </>
      )}

      {/* Sidecar raster overlay */}
      {result.overlayImageUrl && (
        <div className="rounded border overflow-hidden">
          <img
            src={result.overlayImageUrl}
            alt="Analysis result overlay"
            className="w-full"
          />
        </div>
      )}
    </div>
  );
}

function ResultRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 rounded-sm bg-muted/40 px-2 py-1">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="text-[11px] font-medium tabular-nums">{value}</span>
    </div>
  );
}
