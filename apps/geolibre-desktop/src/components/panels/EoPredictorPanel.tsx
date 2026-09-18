import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import type { Feature, FeatureCollection, Geometry, Position } from "geojson";
import type { GeoLibreAppAPI } from "@geolibre/plugins";
import { Button, cn } from "@geolibre/ui";
import { Check, Loader2, Upload, X } from "lucide-react";

const EO_SOURCE_ID = "geolibre-eo-predictor-source";
const EO_FILL_LAYER_ID = "geolibre-eo-predictor-fill";
const EO_LINE_LAYER_ID = "geolibre-eo-predictor-line";
const EO_AOI_SOURCE_ID = "geolibre-eo-predictor-aoi-source";
const EO_AOI_LAYER_ID = "geolibre-eo-predictor-aoi-line";

type SensorType = "all" | "optical" | "SAR" | "hyperspectral";
type ResolutionBucket = "all" | "high" | "medium" | "low";
type AccessType = "all" | "open" | "commercial";
type TaskingType = "all" | "yes" | "no";
type DaylightType = "all" | "day" | "night";

interface EoFilters {
  constellation: string;
  operator: string;
  sensorType: SensorType;
  resolution: ResolutionBucket;
  access: AccessType;
  tasking: TaskingType;
  daylight: DaylightType;
  hoursAhead: number;
  aoiOnly: boolean;
}

interface EoFeatureProperties {
  satellite?: string;
  constellation?: string;
  operator?: string;
  sensor_type?: string;
  spatial_res_m?: number;
  spatial_res_cm?: number;
  data_access?: string;
  tasking?: boolean;
  start_time?: string;
  end_time?: string;
  is_daytime?: boolean;
  data_repo_type?: string;
  data_repo_url?: string;
}

type EoFeature = Feature<Geometry, EoFeatureProperties>;

const DEFAULT_FILTERS: EoFilters = {
  constellation: "all",
  operator: "all",
  sensorType: "all",
  resolution: "all",
  access: "all",
  tasking: "all",
  daylight: "all",
  hoursAhead: 24,
  aoiOnly: false,
};

function toFeatureCollection(features: EoFeature[]): FeatureCollection {
  return {
    type: "FeatureCollection",
    features,
  };
}

function flattenPositions(geometry: Geometry): Position[] {
  switch (geometry.type) {
    case "Point":
      return [geometry.coordinates];
    case "MultiPoint":
    case "LineString":
      return geometry.coordinates;
    case "MultiLineString":
    case "Polygon":
      return geometry.coordinates.flat();
    case "MultiPolygon":
      return geometry.coordinates.flat(2);
    case "GeometryCollection":
      return geometry.geometries.flatMap(flattenPositions);
    default:
      return [];
  }
}

function geometryBounds(geometry: Geometry): [number, number, number, number] | null {
  const positions = flattenPositions(geometry);
  if (positions.length === 0) return null;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const pos of positions) {
    const [x, y] = pos;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  if (!Number.isFinite(minX)) return null;
  return [minX, minY, maxX, maxY];
}

function featureBounds(feature: EoFeature): [number, number, number, number] | null {
  if (!feature.geometry) return null;
  return geometryBounds(feature.geometry);
}

function intersectsBounds(
  a: [number, number, number, number],
  b: [number, number, number, number],
): boolean {
  return !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3]);
}

function toIsoTime(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getSpatialResolutionMeters(props: EoFeatureProperties): number | null {
  if (typeof props.spatial_res_m === "number" && Number.isFinite(props.spatial_res_m)) {
    return props.spatial_res_m;
  }
  if (typeof props.spatial_res_cm === "number" && Number.isFinite(props.spatial_res_cm)) {
    return props.spatial_res_cm / 100;
  }
  return null;
}

function normalizeSensor(value: string | undefined): string {
  if (!value) return "";
  return value.toLowerCase() === "sar" ? "SAR" : value.toLowerCase();
}

function parseEoFeatureCollection(raw: unknown): FeatureCollection<Geometry, EoFeatureProperties> {
  if (!raw || typeof raw !== "object") {
    throw new Error("EO dataset is not valid JSON.");
  }
  const maybe = raw as { type?: string; features?: unknown[] };
  if (maybe.type !== "FeatureCollection" || !Array.isArray(maybe.features)) {
    throw new Error("EO dataset must be a GeoJSON FeatureCollection.");
  }
  const features: EoFeature[] = maybe.features
    .filter((item): item is EoFeature => Boolean(item && typeof item === "object" && (item as { type?: string }).type === "Feature"))
    .map((feature) => ({
      ...feature,
      properties: (feature.properties ?? {}) as EoFeatureProperties,
    }));

  if (features.length === 0) {
    throw new Error("No features found in EO dataset.");
  }

  return {
    type: "FeatureCollection",
    features,
  };
}

function parseAoiFeatureCollection(raw: unknown): FeatureCollection<Geometry> {
  if (!raw || typeof raw !== "object") {
    throw new Error("AOI file is not valid JSON.");
  }
  const maybe = raw as { type?: string; features?: unknown[] };
  if (maybe.type !== "FeatureCollection" || !Array.isArray(maybe.features)) {
    throw new Error("AOI must be a GeoJSON FeatureCollection.");
  }
  return maybe as FeatureCollection<Geometry>;
}

function uniq(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.filter((v): v is string => typeof v === "string" && v.trim().length > 0))).sort(
    (a, b) => a.localeCompare(b),
  );
}

function buildPopupHtml(props: EoFeatureProperties): string {
  const resolution = getSpatialResolutionMeters(props);
  const start = props.start_time ? new Date(props.start_time).toUTCString() : "n/a";
  const end = props.end_time ? new Date(props.end_time).toUTCString() : "n/a";
  return [
    `<div style=\"min-width:230px;font-size:12px;line-height:1.4\">`,
    `<div style=\"font-weight:600;margin-bottom:4px\">${props.satellite ?? "Unknown satellite"}</div>`,
    `<div><strong>Constellation:</strong> ${props.constellation ?? "n/a"}</div>`,
    `<div><strong>Operator:</strong> ${props.operator ?? "n/a"}</div>`,
    `<div><strong>Sensor:</strong> ${props.sensor_type ?? "n/a"}</div>`,
    `<div><strong>Resolution:</strong> ${resolution !== null ? `${resolution} m` : "n/a"}</div>`,
    `<div><strong>Access:</strong> ${props.data_access ?? "n/a"}</div>`,
    `<div><strong>Taskable:</strong> ${typeof props.tasking === "boolean" ? (props.tasking ? "yes" : "no") : "n/a"}</div>`,
    `<div><strong>Daylight:</strong> ${typeof props.is_daytime === "boolean" ? (props.is_daytime ? "day" : "night") : "n/a"}</div>`,
    `<div style=\"margin-top:6px\"><strong>Start:</strong> ${start}</div>`,
    `<div><strong>End:</strong> ${end}</div>`,
    `</div>`,
  ].join("");
}

function ensureMapArtifacts(map: maplibregl.Map): void {
  if (!map.getSource(EO_SOURCE_ID)) {
    map.addSource(EO_SOURCE_ID, {
      type: "geojson",
      data: toFeatureCollection([]),
    });
  }

  if (!map.getLayer(EO_FILL_LAYER_ID)) {
    map.addLayer({
      id: EO_FILL_LAYER_ID,
      type: "fill",
      source: EO_SOURCE_ID,
      paint: {
        "fill-color": [
          "match",
          ["get", "sensor_type"],
          "optical",
          "#3b82f6",
          "SAR",
          "#eab308",
          "hyperspectral",
          "#22c55e",
          "#ef4444",
        ],
        "fill-opacity": ["interpolate", ["linear"], ["zoom"], 1.5, 0.02, 5, 0.09, 8, 0.14],
      },
    });
  }

  if (!map.getLayer(EO_LINE_LAYER_ID)) {
    map.addLayer({
      id: EO_LINE_LAYER_ID,
      type: "line",
      source: EO_SOURCE_ID,
      paint: {
        "line-color": [
          "match",
          ["get", "sensor_type"],
          "optical",
          "#1d4ed8",
          "SAR",
          "#ca8a04",
          "hyperspectral",
          "#15803d",
          "#b91c1c",
        ],
        "line-width": ["interpolate", ["linear"], ["zoom"], 2, 0.3, 6, 1.4],
        "line-opacity": 0.8,
      },
    });
  }

  if (!map.getSource(EO_AOI_SOURCE_ID)) {
    map.addSource(EO_AOI_SOURCE_ID, {
      type: "geojson",
      data: toFeatureCollection([]),
    });
  }

  if (!map.getLayer(EO_AOI_LAYER_ID)) {
    map.addLayer({
      id: EO_AOI_LAYER_ID,
      type: "line",
      source: EO_AOI_SOURCE_ID,
      paint: {
        "line-color": "#2563eb",
        "line-width": 2,
        "line-opacity": 0.9,
      },
    });
  }
}

function updateSourceData(map: maplibregl.Map, sourceId: string, data: FeatureCollection): void {
  const source = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
  source?.setData(data);
}

function computeCollectionBounds(collection: FeatureCollection<Geometry>): [number, number, number, number] | null {
  let merged: [number, number, number, number] | null = null;
  for (const feature of collection.features) {
    const geom = feature.geometry;
    if (!geom) continue;
    const b = geometryBounds(geom);
    if (!b) continue;
    if (!merged) {
      merged = b;
    } else {
      merged = [
        Math.min(merged[0], b[0]),
        Math.min(merged[1], b[1]),
        Math.max(merged[2], b[2]),
        Math.max(merged[3], b[3]),
      ];
    }
  }
  return merged;
}

export function clearEoPredictorArtifacts(map: maplibregl.Map | null): void {
  if (!map) return;
  if (map.getLayer(EO_FILL_LAYER_ID)) map.removeLayer(EO_FILL_LAYER_ID);
  if (map.getLayer(EO_LINE_LAYER_ID)) map.removeLayer(EO_LINE_LAYER_ID);
  if (map.getLayer(EO_AOI_LAYER_ID)) map.removeLayer(EO_AOI_LAYER_ID);
  if (map.getSource(EO_SOURCE_ID)) map.removeSource(EO_SOURCE_ID);
  if (map.getSource(EO_AOI_SOURCE_ID)) map.removeSource(EO_AOI_SOURCE_ID);
}

export function EoPredictorPanel({ app }: { app: GeoLibreAppAPI }) {
  const eoInputRef = useRef<HTMLInputElement | null>(null);
  const aoiInputRef = useRef<HTMLInputElement | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);

  const [rawData, setRawData] = useState<FeatureCollection<Geometry, EoFeatureProperties> | null>(null);
  const [aoiData, setAoiData] = useState<FeatureCollection<Geometry> | null>(null);
  const [aoiBounds, setAoiBounds] = useState<[number, number, number, number] | null>(null);
  const [filters, setFilters] = useState<EoFilters>(DEFAULT_FILTERS);
  const [message, setMessage] = useState<string>("Upload an EO-predictor compatible GeoJSON dataset to start.");
  const [isLoading, setIsLoading] = useState(false);
  const [visibleInViewCount, setVisibleInViewCount] = useState<number>(0);
  const [zoom, setZoom] = useState<number>(1);

  const allFeatures = useMemo<EoFeature[]>(() => {
    if (!rawData) return [];
    return rawData.features as EoFeature[];
  }, [rawData]);

  const uniqueConstellations = useMemo(() => uniq(allFeatures.map((f) => f.properties?.constellation)), [allFeatures]);
  const uniqueOperators = useMemo(() => uniq(allFeatures.map((f) => f.properties?.operator)), [allFeatures]);

  const filteredFeatures = useMemo<EoFeature[]>(() => {
    if (!rawData) return [];
    const now = Date.now();
    const maxTs = now + filters.hoursAhead * 60 * 60 * 1000;
    return (rawData.features as EoFeature[]).filter((feature) => {
      const props = feature.properties ?? {};

      if (filters.constellation !== "all" && props.constellation !== filters.constellation) {
        return false;
      }
      if (filters.operator !== "all" && props.operator !== filters.operator) {
        return false;
      }

      const sensor = normalizeSensor(props.sensor_type);
      if (filters.sensorType !== "all") {
        const wanted = filters.sensorType === "SAR" ? "SAR" : filters.sensorType;
        if (sensor !== wanted) return false;
      }

      const res = getSpatialResolutionMeters(props);
      if (filters.resolution === "high" && (res === null || res >= 5)) return false;
      if (filters.resolution === "medium" && (res === null || res < 5 || res > 30)) return false;
      if (filters.resolution === "low" && (res === null || res <= 30)) return false;

      if (filters.access !== "all" && props.data_access !== filters.access) {
        return false;
      }

      if (filters.tasking === "yes" && props.tasking !== true) return false;
      if (filters.tasking === "no" && props.tasking !== false) return false;

      if (filters.daylight === "day" && props.is_daytime !== true) return false;
      if (filters.daylight === "night" && props.is_daytime !== false) return false;

      const start = toIsoTime(props.start_time);
      const end = toIsoTime(props.end_time) ?? start;
      if (start !== null) {
        const effectiveEnd = end ?? start;
        if (start > maxTs || effectiveEnd < now) return false;
      }

      if (filters.aoiOnly && aoiBounds) {
        const bounds = featureBounds(feature);
        if (!bounds || !intersectsBounds(bounds, aoiBounds)) return false;
      }

      return true;
    });
  }, [rawData, filters, aoiBounds]);

  useEffect(() => {
    const map = app.getMap?.();
    if (!map) return;

    ensureMapArtifacts(map);
    setZoom(map.getZoom());

    const clickHandler = (event: maplibregl.MapMouseEvent & maplibregl.EventData) => {
      const feature = event.features?.[0] as EoFeature | undefined;
      if (!feature) return;
      popupRef.current?.remove();
      popupRef.current = new maplibregl.Popup({ closeButton: true, maxWidth: "280px" })
        .setLngLat(event.lngLat)
        .setHTML(buildPopupHtml(feature.properties ?? {}))
        .addTo(map);
    };

    const pointerEnter = () => {
      map.getCanvas().style.cursor = "pointer";
    };
    const pointerLeave = () => {
      map.getCanvas().style.cursor = "";
    };

    map.on("click", EO_FILL_LAYER_ID, clickHandler);
    map.on("mouseenter", EO_FILL_LAYER_ID, pointerEnter);
    map.on("mouseleave", EO_FILL_LAYER_ID, pointerLeave);

    return () => {
      map.off("click", EO_FILL_LAYER_ID, clickHandler);
      map.off("mouseenter", EO_FILL_LAYER_ID, pointerEnter);
      map.off("mouseleave", EO_FILL_LAYER_ID, pointerLeave);
      map.getCanvas().style.cursor = "";
      popupRef.current?.remove();
      popupRef.current = null;
    };
  }, [app]);

  useEffect(() => {
    const map = app.getMap?.();
    if (!map) return;
    ensureMapArtifacts(map);
    updateSourceData(map, EO_SOURCE_ID, toFeatureCollection(filteredFeatures));

    const nextAoi = aoiData ?? toFeatureCollection([]);
    updateSourceData(map, EO_AOI_SOURCE_ID, nextAoi);

    const updateVisible = () => {
      if (!map) return;
      setZoom(map.getZoom());
      const bounds = map.getBounds();
      const mapBounds: [number, number, number, number] = [
        bounds.getWest(),
        bounds.getSouth(),
        bounds.getEast(),
        bounds.getNorth(),
      ];
      const count = filteredFeatures.reduce((acc, feature) => {
        const b = featureBounds(feature);
        return b && intersectsBounds(mapBounds, b) ? acc + 1 : acc;
      }, 0);
      setVisibleInViewCount(count);
    };

    updateVisible();
    map.on("moveend", updateVisible);
    map.on("zoomend", updateVisible);
    return () => {
      map.off("moveend", updateVisible);
      map.off("zoomend", updateVisible);
    };
  }, [app, filteredFeatures, aoiData]);

  const passSummary = useMemo(() => {
    if (!rawData) return "No dataset loaded.";
    if (filteredFeatures.length === 0) return "No predicted passes for current filters.";
    if (filteredFeatures.length === 1) return "1 predicted pass for current filters.";
    return `${filteredFeatures.length} predicted passes for current filters.`;
  }, [rawData, filteredFeatures.length]);

  const handleUploadEo = async (file: File | null) => {
    if (!file) return;
    setIsLoading(true);
    setMessage("Loading EO dataset...");
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const collection = parseEoFeatureCollection(parsed);
      setRawData(collection);
      setMessage(`Loaded ${collection.features.length} EO pass features from ${file.name}.`);
      const map = app.getMap?.();
      if (map) {
        ensureMapArtifacts(map);
        const b = computeCollectionBounds(collection);
        if (b) {
          map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 36, duration: 600 });
        }
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to parse EO dataset.");
      setRawData(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUploadAoi = async (file: File | null) => {
    if (!file) return;
    setIsLoading(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const collection = parseAoiFeatureCollection(parsed);
      const b = computeCollectionBounds(collection);
      if (!b) {
        throw new Error("AOI has no valid geometry.");
      }
      setAoiData(collection);
      setAoiBounds(b);
      setMessage(`AOI loaded from ${file.name}.`);
      const map = app.getMap?.();
      if (map) {
        ensureMapArtifacts(map);
        map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 30, duration: 600 });
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to parse AOI file.");
      setAoiData(null);
      setAoiBounds(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setRawData(null);
    setAoiData(null);
    setAoiBounds(null);
    setFilters(DEFAULT_FILTERS);
    setVisibleInViewCount(0);
    setMessage("EO Predictor state reset.");
    const map = app.getMap?.();
    if (map) {
      ensureMapArtifacts(map);
      updateSourceData(map, EO_SOURCE_ID, toFeatureCollection([]));
      updateSourceData(map, EO_AOI_SOURCE_ID, toFeatureCollection([]));
    }
  };

  const cards = cn(
    "rounded-md border bg-background/80 p-2.5 text-xs space-y-2",
    "backdrop-blur-sm",
  );

  return (
    <div className="flex h-full flex-col gap-2 overflow-y-auto p-2.5">
      <div className={cards}>
        <div className="text-sm font-semibold">EO Predictor</div>
        <p className="text-muted-foreground">
          Satellite pass filtering inspired by developmentseed/eo-predictor.
          Upload a pass GeoJSON to visualize predicted coverage on the current map.
        </p>

        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant="outline" onClick={() => eoInputRef.current?.click()}>
            <Upload className="mr-1 h-3.5 w-3.5" />
            Load EO Passes
          </Button>
          <Button size="sm" variant="outline" onClick={() => aoiInputRef.current?.click()}>
            <Upload className="mr-1 h-3.5 w-3.5" />
            Load AOI
          </Button>
          <Button size="sm" variant="ghost" onClick={handleReset}>
            <X className="mr-1 h-3.5 w-3.5" />
            Clear
          </Button>
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : <Check className="h-4 w-4 text-emerald-600" />}
        </div>

        <input
          ref={eoInputRef}
          type="file"
          accept=".json,.geojson"
          className="hidden"
          onChange={(e) => void handleUploadEo(e.target.files?.[0] ?? null)}
        />
        <input
          ref={aoiInputRef}
          type="file"
          accept=".json,.geojson"
          className="hidden"
          onChange={(e) => void handleUploadAoi(e.target.files?.[0] ?? null)}
        />

        <div className="rounded border bg-muted/30 px-2 py-1.5 text-[11px] text-muted-foreground">{message}</div>
      </div>

      <div className={cards}>
        <div className="font-medium">Filters</div>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-muted-foreground">Prediction window: {filters.hoursAhead}h</span>
          <input
            type="range"
            min={1}
            max={48}
            step={1}
            value={filters.hoursAhead}
            onChange={(e) => setFilters((prev) => ({ ...prev, hoursAhead: Number(e.target.value) }))}
          />
        </label>

        <div className="grid grid-cols-2 gap-1.5">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">Constellation</span>
            <select
              className="h-7 rounded border border-input bg-background px-1.5"
              value={filters.constellation}
              onChange={(e) => setFilters((prev) => ({ ...prev, constellation: e.target.value }))}
            >
              <option value="all">All</option>
              {uniqueConstellations.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">Operator</span>
            <select
              className="h-7 rounded border border-input bg-background px-1.5"
              value={filters.operator}
              onChange={(e) => setFilters((prev) => ({ ...prev, operator: e.target.value }))}
            >
              <option value="all">All</option>
              {uniqueOperators.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">Sensor</span>
            <select
              className="h-7 rounded border border-input bg-background px-1.5"
              value={filters.sensorType}
              onChange={(e) => setFilters((prev) => ({ ...prev, sensorType: e.target.value as SensorType }))}
            >
              <option value="all">All</option>
              <option value="optical">Optical</option>
              <option value="SAR">SAR</option>
              <option value="hyperspectral">Hyperspectral</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">Resolution</span>
            <select
              className="h-7 rounded border border-input bg-background px-1.5"
              value={filters.resolution}
              onChange={(e) => setFilters((prev) => ({ ...prev, resolution: e.target.value as ResolutionBucket }))}
            >
              <option value="all">All</option>
              <option value="high">High (&lt;5m)</option>
              <option value="medium">Medium (5-30m)</option>
              <option value="low">Low (&gt;30m)</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">Data access</span>
            <select
              className="h-7 rounded border border-input bg-background px-1.5"
              value={filters.access}
              onChange={(e) => setFilters((prev) => ({ ...prev, access: e.target.value as AccessType }))}
            >
              <option value="all">All</option>
              <option value="open">Open</option>
              <option value="commercial">Commercial</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">Taskable</span>
            <select
              className="h-7 rounded border border-input bg-background px-1.5"
              value={filters.tasking}
              onChange={(e) => setFilters((prev) => ({ ...prev, tasking: e.target.value as TaskingType }))}
            >
              <option value="all">All</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">Daylight</span>
            <select
              className="h-7 rounded border border-input bg-background px-1.5"
              value={filters.daylight}
              onChange={(e) => setFilters((prev) => ({ ...prev, daylight: e.target.value as DaylightType }))}
            >
              <option value="all">All</option>
              <option value="day">Day</option>
              <option value="night">Night</option>
            </select>
          </label>

          <label className="flex items-center gap-2 pt-5">
            <input
              type="checkbox"
              checked={filters.aoiOnly}
              disabled={!aoiBounds}
              onChange={(e) => setFilters((prev) => ({ ...prev, aoiOnly: e.target.checked }))}
            />
            <span className="text-[11px] text-muted-foreground">Only AOI-intersecting passes</span>
          </label>
        </div>
      </div>

      <div className={cards}>
        <div className="font-medium">Predicted passes</div>
        <div className="text-[11px] text-muted-foreground">{passSummary}</div>
        <div className="text-[11px] text-muted-foreground">In current map view: {visibleInViewCount}</div>
        {zoom < 2.5 ? (
          <div className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
            Zoom in to inspect predicted passes in detail.
          </div>
        ) : null}
        <div className="max-h-44 overflow-auto rounded border">
          <table className="w-full text-left text-[11px]">
            <thead className="sticky top-0 bg-muted/60">
              <tr>
                <th className="px-2 py-1">Satellite</th>
                <th className="px-2 py-1">Start</th>
                <th className="px-2 py-1">Sensor</th>
              </tr>
            </thead>
            <tbody>
              {filteredFeatures
                .slice()
                .sort((a, b) => {
                  const aTs = toIsoTime(a.properties?.start_time) ?? Number.POSITIVE_INFINITY;
                  const bTs = toIsoTime(b.properties?.start_time) ?? Number.POSITIVE_INFINITY;
                  return aTs - bTs;
                })
                .slice(0, 120)
                .map((feature, index) => {
                  const props = feature.properties ?? {};
                  return (
                    <tr key={`${props.satellite ?? "sat"}-${index}`} className="border-t">
                      <td className="px-2 py-1">{props.satellite ?? "n/a"}</td>
                      <td className="px-2 py-1">{props.start_time ? new Date(props.start_time).toISOString().slice(0, 16).replace("T", " ") : "n/a"}</td>
                      <td className="px-2 py-1">{props.sensor_type ?? "n/a"}</td>
                    </tr>
                  );
                })}
              {filteredFeatures.length === 0 ? (
                <tr>
                  <td className="px-2 py-2 text-muted-foreground" colSpan={3}>No pass for current filters.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
