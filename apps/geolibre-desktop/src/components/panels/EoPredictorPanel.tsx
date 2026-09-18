import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import maplibregl from "maplibre-gl";
import booleanIntersects from "@turf/boolean-intersects";
import type { Feature, FeatureCollection, Geometry, MultiPolygon, Polygon, Position } from "geojson";
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
type AoiFeature = Feature<Polygon | MultiPolygon>;
type FilterDimension = "constellation" | "operator" | "sensorType" | "resolution" | "access" | "tasking" | "daylight";

interface FilterOption<T extends string> {
  value: T;
  label: string;
  disabled: boolean;
  count: number;
}

const SENSOR_VALUES: SensorType[] = ["all", "optical", "SAR", "hyperspectral"];
const RESOLUTION_VALUES: ResolutionBucket[] = ["all", "high", "medium", "low"];
const ACCESS_VALUES: AccessType[] = ["all", "open", "commercial"];
const TASKING_VALUES: TaskingType[] = ["all", "yes", "no"];
const DAYLIGHT_VALUES: DaylightType[] = ["all", "day", "night"];

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

function parseEoFeatureCollection(
  raw: unknown,
  t: (key: string, options?: Record<string, unknown>) => string,
): FeatureCollection<Geometry, EoFeatureProperties> {
  if (!raw || typeof raw !== "object") {
    throw new Error(t("eoPredictor.error.datasetNotJson", { defaultValue: "EO dataset is not valid JSON." }));
  }
  const maybe = raw as { type?: string; features?: unknown[] };
  if (maybe.type !== "FeatureCollection" || !Array.isArray(maybe.features)) {
    throw new Error(t("eoPredictor.error.datasetNotFeatureCollection", {
      defaultValue: "EO dataset must be a GeoJSON FeatureCollection.",
    }));
  }
  const features: EoFeature[] = maybe.features
    .filter((item): item is EoFeature => Boolean(item && typeof item === "object" && (item as { type?: string }).type === "Feature"))
    .map((feature) => ({
      ...feature,
      properties: (feature.properties ?? {}) as EoFeatureProperties,
    }));

  if (features.length === 0) {
    throw new Error(t("eoPredictor.error.datasetNoFeatures", {
      defaultValue: "No features found in EO dataset.",
    }));
  }

  return {
    type: "FeatureCollection",
    features,
  };
}

function parseAoiFeatureCollection(
  raw: unknown,
  t: (key: string, options?: Record<string, unknown>) => string,
): FeatureCollection<Geometry> {
  if (!raw || typeof raw !== "object") {
    throw new Error(t("eoPredictor.error.aoiNotJson", { defaultValue: "AOI file is not valid JSON." }));
  }
  const maybe = raw as { type?: string; features?: unknown[] };
  if (maybe.type !== "FeatureCollection" || !Array.isArray(maybe.features)) {
    throw new Error(t("eoPredictor.error.aoiNotFeatureCollection", {
      defaultValue: "AOI must be a GeoJSON FeatureCollection.",
    }));
  }
  return maybe as FeatureCollection<Geometry>;
}

function isPolygonFeature(feature: Feature<Geometry>): feature is AoiFeature {
  const geometry = feature.geometry;
  return Boolean(geometry) && (geometry.type === "Polygon" || geometry.type === "MultiPolygon");
}

function sanitizeAoiFeatures(collection: FeatureCollection<Geometry>): AoiFeature[] {
  return collection.features.filter(isPolygonFeature);
}

function uniq(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.filter((v): v is string => typeof v === "string" && v.trim().length > 0))).sort(
    (a, b) => a.localeCompare(b),
  );
}

function buildPopupHtml(
  props: EoFeatureProperties,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const resolution = getSpatialResolutionMeters(props);
  const na = t("eoPredictor.na", { defaultValue: "n/a" });
  const start = props.start_time ? new Date(props.start_time).toUTCString() : na;
  const end = props.end_time ? new Date(props.end_time).toUTCString() : na;
  const tasking = typeof props.tasking === "boolean"
    ? props.tasking
      ? t("eoPredictor.yes", { defaultValue: "Yes" })
      : t("eoPredictor.no", { defaultValue: "No" })
    : na;
  const daylight = typeof props.is_daytime === "boolean"
    ? props.is_daytime
      ? t("eoPredictor.day", { defaultValue: "Day" })
      : t("eoPredictor.night", { defaultValue: "Night" })
    : na;
  return [
    `<div style=\"min-width:230px;font-size:12px;line-height:1.4\">`,
    `<div style=\"font-weight:600;margin-bottom:4px\">${props.satellite ?? t("eoPredictor.popup.unknownSatellite", { defaultValue: "Unknown satellite" })}</div>`,
    `<div><strong>${t("eoPredictor.constellation", { defaultValue: "Constellation" })}:</strong> ${props.constellation ?? na}</div>`,
    `<div><strong>${t("eoPredictor.operator", { defaultValue: "Operator" })}:</strong> ${props.operator ?? na}</div>`,
    `<div><strong>${t("eoPredictor.sensor", { defaultValue: "Sensor" })}:</strong> ${props.sensor_type ?? na}</div>`,
    `<div><strong>${t("eoPredictor.resolution", { defaultValue: "Resolution" })}:</strong> ${resolution !== null ? `${resolution} m` : na}</div>`,
    `<div><strong>${t("eoPredictor.dataAccess", { defaultValue: "Data access" })}:</strong> ${props.data_access ?? na}</div>`,
    `<div><strong>${t("eoPredictor.taskable", { defaultValue: "Taskable" })}:</strong> ${tasking}</div>`,
    `<div><strong>${t("eoPredictor.daylight", { defaultValue: "Daylight" })}:</strong> ${daylight}</div>`,
    `<div style=\"margin-top:6px\"><strong>${t("eoPredictor.start", { defaultValue: "Start" })}:</strong> ${start}</div>`,
    `<div><strong>${t("eoPredictor.end", { defaultValue: "End" })}:</strong> ${end}</div>`,
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
  const { t } = useTranslation();
  const eoInputRef = useRef<HTMLInputElement | null>(null);
  const aoiInputRef = useRef<HTMLInputElement | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);

  const [rawData, setRawData] = useState<FeatureCollection<Geometry, EoFeatureProperties> | null>(null);
  const [aoiData, setAoiData] = useState<FeatureCollection<Geometry> | null>(null);
  const [aoiFeatures, setAoiFeatures] = useState<AoiFeature[]>([]);
  const [aoiBounds, setAoiBounds] = useState<[number, number, number, number] | null>(null);
  const [filters, setFilters] = useState<EoFilters>(DEFAULT_FILTERS);
  const [message, setMessage] = useState<string>(
    t("eoPredictor.message.initial", {
      defaultValue: "Upload an EO-predictor compatible GeoJSON dataset to start.",
    }),
  );
  const [isLoading, setIsLoading] = useState(false);
  const [visibleInViewCount, setVisibleInViewCount] = useState<number>(0);
  const [zoom, setZoom] = useState<number>(1);

  const allFeatures = useMemo<EoFeature[]>(() => {
    if (!rawData) return [];
    return rawData.features as EoFeature[];
  }, [rawData]);

  const uniqueConstellations = useMemo(() => uniq(allFeatures.map((f) => f.properties?.constellation)), [allFeatures]);
  const uniqueOperators = useMemo(() => uniq(allFeatures.map((f) => f.properties?.operator)), [allFeatures]);

  const intersectsAoiPrecisely = useMemo(
    () => (feature: EoFeature): boolean => {
      if (aoiFeatures.length === 0) return true;
      if (aoiBounds) {
        const candidateBounds = featureBounds(feature);
        if (!candidateBounds || !intersectsBounds(candidateBounds, aoiBounds)) {
          return false;
        }
      }
      return aoiFeatures.some((aoiFeature) => {
        try {
          return booleanIntersects(feature as Feature<Geometry>, aoiFeature as Feature<Polygon | MultiPolygon>);
        } catch {
          return false;
        }
      });
    },
    [aoiBounds, aoiFeatures],
  );

  const featureMatches = useMemo(
    () => (
      feature: EoFeature,
      activeFilters: EoFilters,
      ignoreDimension?: FilterDimension,
    ): boolean => {
      const props = feature.properties ?? {};

      if (ignoreDimension !== "constellation" && activeFilters.constellation !== "all" && props.constellation !== activeFilters.constellation) {
        return false;
      }
      if (ignoreDimension !== "operator" && activeFilters.operator !== "all" && props.operator !== activeFilters.operator) {
        return false;
      }

      const sensor = normalizeSensor(props.sensor_type);
      if (ignoreDimension !== "sensorType" && activeFilters.sensorType !== "all") {
        const wanted = activeFilters.sensorType === "SAR" ? "SAR" : activeFilters.sensorType;
        if (sensor !== wanted) return false;
      }

      const res = getSpatialResolutionMeters(props);
      if (ignoreDimension !== "resolution") {
        if (activeFilters.resolution === "high" && (res === null || res >= 5)) return false;
        if (activeFilters.resolution === "medium" && (res === null || res < 5 || res > 30)) return false;
        if (activeFilters.resolution === "low" && (res === null || res <= 30)) return false;
      }

      if (ignoreDimension !== "access" && activeFilters.access !== "all" && props.data_access !== activeFilters.access) {
        return false;
      }

      if (ignoreDimension !== "tasking") {
        if (activeFilters.tasking === "yes" && props.tasking !== true) return false;
        if (activeFilters.tasking === "no" && props.tasking !== false) return false;
      }

      if (ignoreDimension !== "daylight") {
        if (activeFilters.daylight === "day" && props.is_daytime !== true) return false;
        if (activeFilters.daylight === "night" && props.is_daytime !== false) return false;
      }

      const now = Date.now();
      const maxTs = now + activeFilters.hoursAhead * 60 * 60 * 1000;
      const start = toIsoTime(props.start_time);
      const end = toIsoTime(props.end_time) ?? start;
      if (start !== null) {
        const effectiveEnd = end ?? start;
        if (start > maxTs || effectiveEnd < now) return false;
      }

      if (activeFilters.aoiOnly && !intersectsAoiPrecisely(feature)) {
        return false;
      }

      return true;
    },
    [intersectsAoiPrecisely],
  );

  const optionAvailability = useMemo(() => {
    const countByDimension = <T extends string>(dimension: FilterDimension, values: T[], getValue: (feature: EoFeature) => T): Record<T, number> => {
      const result = Object.fromEntries(values.map((value) => [value, 0])) as Record<T, number>;
      for (const feature of allFeatures) {
        if (!featureMatches(feature, filters, dimension)) continue;
        const value = getValue(feature);
        if (value in result) {
          result[value] += 1;
        }
      }
      // Keep `all` enabled when at least one feature matches other dimensions.
      if ("all" in result) {
        result.all = allFeatures.reduce((acc, feature) => acc + (featureMatches(feature, filters, dimension) ? 1 : 0), 0) as Record<T, number>[T];
      }
      return result;
    };

    const constellationCounts = countByDimension("constellation", ["all", ...uniqueConstellations], (feature) =>
      (feature.properties?.constellation ?? "") as string,
    );
    const operatorCounts = countByDimension("operator", ["all", ...uniqueOperators], (feature) =>
      (feature.properties?.operator ?? "") as string,
    );
    const sensorCounts = countByDimension("sensorType", SENSOR_VALUES, (feature) => {
      const sensor = normalizeSensor(feature.properties?.sensor_type);
      if (sensor === "SAR") return "SAR";
      if (sensor === "optical") return "optical";
      if (sensor === "hyperspectral") return "hyperspectral";
      return "all";
    });
    const resolutionCounts = countByDimension("resolution", RESOLUTION_VALUES, (feature) => {
      const res = getSpatialResolutionMeters(feature.properties ?? {});
      if (res === null) return "all";
      if (res < 5) return "high";
      if (res <= 30) return "medium";
      return "low";
    });
    const accessCounts = countByDimension("access", ACCESS_VALUES, (feature) => {
      const access = feature.properties?.data_access;
      if (access === "open") return "open";
      if (access === "commercial") return "commercial";
      return "all";
    });
    const taskingCounts = countByDimension("tasking", TASKING_VALUES, (feature) => {
      if (feature.properties?.tasking === true) return "yes";
      if (feature.properties?.tasking === false) return "no";
      return "all";
    });
    const daylightCounts = countByDimension("daylight", DAYLIGHT_VALUES, (feature) => {
      if (feature.properties?.is_daytime === true) return "day";
      if (feature.properties?.is_daytime === false) return "night";
      return "all";
    });

    return {
      constellationCounts,
      operatorCounts,
      sensorCounts,
      resolutionCounts,
      accessCounts,
      taskingCounts,
      daylightCounts,
    };
  }, [allFeatures, featureMatches, filters, uniqueConstellations, uniqueOperators]);

  const constellationOptions = useMemo<FilterOption<string>[]>(() => {
    const allLabel = t("eoPredictor.all", { defaultValue: "All" });
    return [
      {
        value: "all",
        label: allLabel,
        disabled: false,
        count: optionAvailability.constellationCounts.all ?? 0,
      },
      ...uniqueConstellations.map((value) => ({
        value,
        label: value,
        disabled: (optionAvailability.constellationCounts[value] ?? 0) === 0,
        count: optionAvailability.constellationCounts[value] ?? 0,
      })),
    ];
  }, [optionAvailability.constellationCounts, t, uniqueConstellations]);

  const operatorOptions = useMemo<FilterOption<string>[]>(() => {
    const allLabel = t("eoPredictor.all", { defaultValue: "All" });
    return [
      {
        value: "all",
        label: allLabel,
        disabled: false,
        count: optionAvailability.operatorCounts.all ?? 0,
      },
      ...uniqueOperators.map((value) => ({
        value,
        label: value,
        disabled: (optionAvailability.operatorCounts[value] ?? 0) === 0,
        count: optionAvailability.operatorCounts[value] ?? 0,
      })),
    ];
  }, [optionAvailability.operatorCounts, t, uniqueOperators]);

  const sensorOptions = useMemo<FilterOption<SensorType>[]>(() => [
    {
      value: "all",
      label: t("eoPredictor.all", { defaultValue: "All" }),
      disabled: false,
      count: optionAvailability.sensorCounts.all,
    },
    {
      value: "optical",
      label: t("eoPredictor.sensorValues.optical", { defaultValue: "Optical" }),
      disabled: optionAvailability.sensorCounts.optical === 0,
      count: optionAvailability.sensorCounts.optical,
    },
    {
      value: "SAR",
      label: t("eoPredictor.sensorValues.sar", { defaultValue: "SAR" }),
      disabled: optionAvailability.sensorCounts.SAR === 0,
      count: optionAvailability.sensorCounts.SAR,
    },
    {
      value: "hyperspectral",
      label: t("eoPredictor.sensorValues.hyperspectral", { defaultValue: "Hyperspectral" }),
      disabled: optionAvailability.sensorCounts.hyperspectral === 0,
      count: optionAvailability.sensorCounts.hyperspectral,
    },
  ], [optionAvailability.sensorCounts, t]);

  const resolutionOptions = useMemo<FilterOption<ResolutionBucket>[]>(() => [
    {
      value: "all",
      label: t("eoPredictor.all", { defaultValue: "All" }),
      disabled: false,
      count: optionAvailability.resolutionCounts.all,
    },
    {
      value: "high",
      label: t("eoPredictor.resolutionValues.high", { defaultValue: "High (<5m)" }),
      disabled: optionAvailability.resolutionCounts.high === 0,
      count: optionAvailability.resolutionCounts.high,
    },
    {
      value: "medium",
      label: t("eoPredictor.resolutionValues.medium", { defaultValue: "Medium (5-30m)" }),
      disabled: optionAvailability.resolutionCounts.medium === 0,
      count: optionAvailability.resolutionCounts.medium,
    },
    {
      value: "low",
      label: t("eoPredictor.resolutionValues.low", { defaultValue: "Low (>30m)" }),
      disabled: optionAvailability.resolutionCounts.low === 0,
      count: optionAvailability.resolutionCounts.low,
    },
  ], [optionAvailability.resolutionCounts, t]);

  const accessOptions = useMemo<FilterOption<AccessType>[]>(() => [
    {
      value: "all",
      label: t("eoPredictor.all", { defaultValue: "All" }),
      disabled: false,
      count: optionAvailability.accessCounts.all,
    },
    {
      value: "open",
      label: t("eoPredictor.accessValues.open", { defaultValue: "Open" }),
      disabled: optionAvailability.accessCounts.open === 0,
      count: optionAvailability.accessCounts.open,
    },
    {
      value: "commercial",
      label: t("eoPredictor.accessValues.commercial", { defaultValue: "Commercial" }),
      disabled: optionAvailability.accessCounts.commercial === 0,
      count: optionAvailability.accessCounts.commercial,
    },
  ], [optionAvailability.accessCounts, t]);

  const taskingOptions = useMemo<FilterOption<TaskingType>[]>(() => [
    {
      value: "all",
      label: t("eoPredictor.all", { defaultValue: "All" }),
      disabled: false,
      count: optionAvailability.taskingCounts.all,
    },
    {
      value: "yes",
      label: t("eoPredictor.yes", { defaultValue: "Yes" }),
      disabled: optionAvailability.taskingCounts.yes === 0,
      count: optionAvailability.taskingCounts.yes,
    },
    {
      value: "no",
      label: t("eoPredictor.no", { defaultValue: "No" }),
      disabled: optionAvailability.taskingCounts.no === 0,
      count: optionAvailability.taskingCounts.no,
    },
  ], [optionAvailability.taskingCounts, t]);

  const daylightOptions = useMemo<FilterOption<DaylightType>[]>(() => [
    {
      value: "all",
      label: t("eoPredictor.all", { defaultValue: "All" }),
      disabled: false,
      count: optionAvailability.daylightCounts.all,
    },
    {
      value: "day",
      label: t("eoPredictor.day", { defaultValue: "Day" }),
      disabled: optionAvailability.daylightCounts.day === 0,
      count: optionAvailability.daylightCounts.day,
    },
    {
      value: "night",
      label: t("eoPredictor.night", { defaultValue: "Night" }),
      disabled: optionAvailability.daylightCounts.night === 0,
      count: optionAvailability.daylightCounts.night,
    },
  ], [optionAvailability.daylightCounts, t]);

  useEffect(() => {
    const isValid = (options: Array<FilterOption<string>>, value: string) =>
      value === "all" || options.some((option) => option.value === value && !option.disabled);

    setFilters((prev) => {
      let changed = false;
      const next = { ...prev };
      if (!isValid(constellationOptions, next.constellation)) {
        next.constellation = "all";
        changed = true;
      }
      if (!isValid(operatorOptions, next.operator)) {
        next.operator = "all";
        changed = true;
      }
      if (!isValid(sensorOptions, next.sensorType)) {
        next.sensorType = "all";
        changed = true;
      }
      if (!isValid(resolutionOptions, next.resolution)) {
        next.resolution = "all";
        changed = true;
      }
      if (!isValid(accessOptions, next.access)) {
        next.access = "all";
        changed = true;
      }
      if (!isValid(taskingOptions, next.tasking)) {
        next.tasking = "all";
        changed = true;
      }
      if (!isValid(daylightOptions, next.daylight)) {
        next.daylight = "all";
        changed = true;
      }
      if (!aoiBounds && next.aoiOnly) {
        next.aoiOnly = false;
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [
    accessOptions,
    aoiBounds,
    constellationOptions,
    daylightOptions,
    operatorOptions,
    resolutionOptions,
    sensorOptions,
    taskingOptions,
  ]);

  const filteredFeatures = useMemo<EoFeature[]>(() => {
    if (!rawData) return [];
    return (rawData.features as EoFeature[]).filter((feature) => featureMatches(feature, filters));
  }, [featureMatches, filters, rawData]);

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
        .setHTML(buildPopupHtml(feature.properties ?? {}, t))
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
  }, [app, t]);

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
    if (!rawData) {
      return t("eoPredictor.summary.noDataset", { defaultValue: "No dataset loaded." });
    }
    if (filteredFeatures.length === 0) {
      return t("eoPredictor.summary.noPasses", { defaultValue: "No predicted passes for current filters." });
    }
    if (filteredFeatures.length === 1) {
      return t("eoPredictor.summary.single", { defaultValue: "1 predicted pass for current filters." });
    }
    return t("eoPredictor.summary.multiple", {
      defaultValue: "{{count}} predicted passes for current filters.",
      count: filteredFeatures.length,
    });
  }, [filteredFeatures.length, rawData, t]);

  const handleUploadEo = async (file: File | null) => {
    if (!file) return;
    setIsLoading(true);
    setMessage(t("eoPredictor.message.loadingDataset", { defaultValue: "Loading EO dataset..." }));
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const collection = parseEoFeatureCollection(parsed, t);
      setRawData(collection);
      setMessage(t("eoPredictor.message.datasetLoaded", {
        defaultValue: "Loaded {{count}} EO pass features from {{name}}.",
        count: collection.features.length,
        name: file.name,
      }));
      const map = app.getMap?.();
      if (map) {
        ensureMapArtifacts(map);
        const b = computeCollectionBounds(collection);
        if (b) {
          map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 36, duration: 600 });
        }
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("eoPredictor.error.parseDataset", {
        defaultValue: "Failed to parse EO dataset.",
      }));
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
      const collection = parseAoiFeatureCollection(parsed, t);
      const polygonFeatures = sanitizeAoiFeatures(collection);
      if (polygonFeatures.length === 0) {
        throw new Error(t("eoPredictor.error.aoiNoPolygon", {
          defaultValue: "AOI has no Polygon or MultiPolygon features.",
        }));
      }
      const b = computeCollectionBounds(collection);
      if (!b) {
        throw new Error(t("eoPredictor.error.aoiNoGeometry", {
          defaultValue: "AOI has no valid geometry.",
        }));
      }
      setAoiData(collection);
      setAoiFeatures(polygonFeatures);
      setAoiBounds(b);
      setMessage(t("eoPredictor.message.aoiLoaded", {
        defaultValue: "AOI loaded from {{name}}.",
        name: file.name,
      }));
      const map = app.getMap?.();
      if (map) {
        ensureMapArtifacts(map);
        map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 30, duration: 600 });
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("eoPredictor.error.parseAoi", {
        defaultValue: "Failed to parse AOI file.",
      }));
      setAoiData(null);
      setAoiFeatures([]);
      setAoiBounds(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setRawData(null);
    setAoiData(null);
    setAoiFeatures([]);
    setAoiBounds(null);
    setFilters(DEFAULT_FILTERS);
    setVisibleInViewCount(0);
    setMessage(t("eoPredictor.message.reset", { defaultValue: "EO Predictor state reset." }));
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
        <div className="text-sm font-semibold">{t("eoPredictor.title", { defaultValue: "EO Predictor" })}</div>
        <p className="text-muted-foreground">
          {t("eoPredictor.description", {
            defaultValue: "Satellite pass filtering inspired by developmentseed/eo-predictor. Upload a pass GeoJSON to visualize predicted coverage on the current map.",
          })}
        </p>

        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant="outline" onClick={() => eoInputRef.current?.click()}>
            <Upload className="mr-1 h-3.5 w-3.5" />
            {t("eoPredictor.actions.loadPasses", { defaultValue: "Load EO Passes" })}
          </Button>
          <Button size="sm" variant="outline" onClick={() => aoiInputRef.current?.click()}>
            <Upload className="mr-1 h-3.5 w-3.5" />
            {t("eoPredictor.actions.loadAoi", { defaultValue: "Load AOI" })}
          </Button>
          <Button size="sm" variant="ghost" onClick={handleReset}>
            <X className="mr-1 h-3.5 w-3.5" />
            {t("eoPredictor.actions.clear", { defaultValue: "Clear" })}
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
        <div className="font-medium">{t("eoPredictor.filters.title", { defaultValue: "Filters" })}</div>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-muted-foreground">
            {t("eoPredictor.filters.predictionWindow", {
              defaultValue: "Prediction window: {{hours}}h",
              hours: filters.hoursAhead,
            })}
          </span>
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
            <span className="text-[11px] text-muted-foreground">{t("eoPredictor.constellation", { defaultValue: "Constellation" })}</span>
            <select
              className="h-7 rounded border border-input bg-background px-1.5"
              value={filters.constellation}
              onChange={(e) => setFilters((prev) => ({ ...prev, constellation: e.target.value }))}
            >
              {constellationOptions.map((option) => (
                <option key={option.value} value={option.value} disabled={option.disabled}>
                  {option.label}{option.value !== "all" ? ` (${option.count})` : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">{t("eoPredictor.operator", { defaultValue: "Operator" })}</span>
            <select
              className="h-7 rounded border border-input bg-background px-1.5"
              value={filters.operator}
              onChange={(e) => setFilters((prev) => ({ ...prev, operator: e.target.value }))}
            >
              {operatorOptions.map((option) => (
                <option key={option.value} value={option.value} disabled={option.disabled}>
                  {option.label}{option.value !== "all" ? ` (${option.count})` : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">{t("eoPredictor.sensor", { defaultValue: "Sensor" })}</span>
            <select
              className="h-7 rounded border border-input bg-background px-1.5"
              value={filters.sensorType}
              onChange={(e) => setFilters((prev) => ({ ...prev, sensorType: e.target.value as SensorType }))}
            >
              {sensorOptions.map((option) => (
                <option key={option.value} value={option.value} disabled={option.disabled}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">{t("eoPredictor.resolution", { defaultValue: "Resolution" })}</span>
            <select
              className="h-7 rounded border border-input bg-background px-1.5"
              value={filters.resolution}
              onChange={(e) => setFilters((prev) => ({ ...prev, resolution: e.target.value as ResolutionBucket }))}
            >
              {resolutionOptions.map((option) => (
                <option key={option.value} value={option.value} disabled={option.disabled}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">{t("eoPredictor.dataAccess", { defaultValue: "Data access" })}</span>
            <select
              className="h-7 rounded border border-input bg-background px-1.5"
              value={filters.access}
              onChange={(e) => setFilters((prev) => ({ ...prev, access: e.target.value as AccessType }))}
            >
              {accessOptions.map((option) => (
                <option key={option.value} value={option.value} disabled={option.disabled}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">{t("eoPredictor.taskable", { defaultValue: "Taskable" })}</span>
            <select
              className="h-7 rounded border border-input bg-background px-1.5"
              value={filters.tasking}
              onChange={(e) => setFilters((prev) => ({ ...prev, tasking: e.target.value as TaskingType }))}
            >
              {taskingOptions.map((option) => (
                <option key={option.value} value={option.value} disabled={option.disabled}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">{t("eoPredictor.daylight", { defaultValue: "Daylight" })}</span>
            <select
              className="h-7 rounded border border-input bg-background px-1.5"
              value={filters.daylight}
              onChange={(e) => setFilters((prev) => ({ ...prev, daylight: e.target.value as DaylightType }))}
            >
              {daylightOptions.map((option) => (
                <option key={option.value} value={option.value} disabled={option.disabled}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2 pt-5">
            <input
              type="checkbox"
              checked={filters.aoiOnly}
              disabled={aoiFeatures.length === 0}
              onChange={(e) => setFilters((prev) => ({ ...prev, aoiOnly: e.target.checked }))}
            />
            <span className="text-[11px] text-muted-foreground">
              {t("eoPredictor.filters.aoiOnly", { defaultValue: "Only AOI-intersecting passes" })}
            </span>
          </label>
        </div>
      </div>

      <div className={cards}>
        <div className="font-medium">{t("eoPredictor.predictedPasses", { defaultValue: "Predicted passes" })}</div>
        <div className="text-[11px] text-muted-foreground">{passSummary}</div>
        <div className="text-[11px] text-muted-foreground">
          {t("eoPredictor.inView", {
            defaultValue: "In current map view: {{count}}",
            count: visibleInViewCount,
          })}
        </div>
        {zoom < 2.5 ? (
          <div className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
            {t("eoPredictor.zoomPrompt", { defaultValue: "Zoom in to inspect predicted passes in detail." })}
          </div>
        ) : null}
        <div className="max-h-44 overflow-auto rounded border">
          <table className="w-full text-left text-[11px]">
            <thead className="sticky top-0 bg-muted/60">
              <tr>
                <th className="px-2 py-1">{t("eoPredictor.satellite", { defaultValue: "Satellite" })}</th>
                <th className="px-2 py-1">{t("eoPredictor.start", { defaultValue: "Start" })}</th>
                <th className="px-2 py-1">{t("eoPredictor.sensor", { defaultValue: "Sensor" })}</th>
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
                      <td className="px-2 py-1">{props.satellite ?? t("eoPredictor.na", { defaultValue: "n/a" })}</td>
                      <td className="px-2 py-1">
                        {props.start_time
                          ? new Date(props.start_time).toISOString().slice(0, 16).replace("T", " ")
                          : t("eoPredictor.na", { defaultValue: "n/a" })}
                      </td>
                      <td className="px-2 py-1">{props.sensor_type ?? t("eoPredictor.na", { defaultValue: "n/a" })}</td>
                    </tr>
                  );
                })}
              {filteredFeatures.length === 0 ? (
                <tr>
                  <td className="px-2 py-2 text-muted-foreground" colSpan={3}>
                    {t("eoPredictor.summary.noPasses", { defaultValue: "No predicted passes for current filters." })}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
