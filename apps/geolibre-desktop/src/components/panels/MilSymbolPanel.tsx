import {
  useState,
  useCallback,
  useRef,
  type ChangeEvent,
} from "react";
import { useAppStore } from "@geolibre/core";
import type { GeoLibreLayer, MilAffiliation, MilSymbolLayerSource, MilGraphicLayerSource } from "@geolibre/core";
import { DEFAULT_LAYER_STYLE } from "@geolibre/core";
import { cn } from "@geolibre/ui";
import type { MapController } from "@geolibre/map";
import ms from "../../lib/milsymbol-runtime";
import {
  Search,
  Shield,
  Eye,
  EyeOff,
  Trash2,
  MapPin,
  ChevronDown,
  ChevronRight,
  Plus,
  X,
  Pencil,
  Download,
  Upload,
} from "lucide-react";
import {
  SYMBOL_CATALOG,
  CATEGORIES,
  filterCatalog,
  sidcWithAffiliation,
  type CatalogEntry,
} from "../../lib/milsymbol-catalog";
import { useMilSymbol } from "../../hooks/useMilSymbol";
import { useMapClick } from "../../hooks/useMapClick";
import {
  importMilSymbolsFromGeoJSON,
  importMilSymbolsFromKML,
} from "../../lib/milsymbol-import";
import { downloadMilLayersAsGeoJSON } from "../../lib/milsymbol-export";
import type { FeatureCollection } from "geojson";

// ─── Constants ────────────────────────────────────────────────────────────────

const MilSymbol = ms.Symbol;

const AFFILIATIONS: { id: MilAffiliation; label: string; color: string }[] = [
  { id: "FRIENDLY", label: "Friendly", color: "#4A7FCE" },
  { id: "HOSTILE", label: "Hostile", color: "#CE4A4A" },
  { id: "NEUTRAL", label: "Neutral", color: "#4ACE8C" },
  { id: "UNKNOWN", label: "Unknown", color: "#AAAAAA" },
];

const GRAPHIC_TYPES: { sidc: string; label: string; geometryType: "LineString" | "Polygon" }[] = [
  { sidc: "10032500110000000000", label: "Phase Line", geometryType: "LineString" },
  { sidc: "10032500120000000000", label: "FLOT / FEBA", geometryType: "LineString" },
  { sidc: "10032500130000000000", label: "Boundary", geometryType: "LineString" },
  { sidc: "10032500210000000000", label: "Fire Support Area", geometryType: "Polygon" },
  { sidc: "10032500220000000000", label: "Restricted Fire Area", geometryType: "Polygon" },
  { sidc: "10032500230000000000", label: "No-Fire Area", geometryType: "Polygon" },
  { sidc: "10032500310000000000", label: "Objective", geometryType: "Polygon" },
  { sidc: "10032500320000000000", label: "Target", geometryType: "Polygon" },
  { sidc: "10032500410000000000", label: "Minefield", geometryType: "Polygon" },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function SymbolPreview({ sidc, size = 36 }: { sidc: string; size?: number }) {
  const { renderSVG } = useMilSymbol();
  const svg = renderSVG(sidc, { size });
  if (!svg) return (
    <div
      className="flex-shrink-0 rounded bg-muted"
      style={{ width: size, height: size }}
    />
  );
  return (
    // overflow-hidden + [&>svg]:w-full [&>svg]:h-full forces the milsymbol SVG
    // (which carries its own width/height attrs) to scale into the container
    // instead of overflowing onto the adjacent text label.
    <div
      className="flex-shrink-0 overflow-hidden [&>svg]:w-full [&>svg]:h-full [&>svg]:block"
      style={{ width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface MilSymbolPanelProps {
  mapControllerRef: React.RefObject<MapController | null>;
}

type ActiveTab = "units" | "graphics";

export function MilSymbolPanel({ mapControllerRef }: MilSymbolPanelProps) {
  const layers = useAppStore((s) => s.layers);
  const addLayer = useAppStore((s) => s.addLayer);
  const removeLayer = useAppStore((s) => s.removeLayer);
  const updateLayer = useAppStore((s) => s.updateLayer);

  const milSymbolLayers = layers.filter((l) => l.type === "mil-symbol");
  const milGraphicLayers = layers.filter((l) => l.type === "mil-graphic");
  const allMilLayers = [...milSymbolLayers, ...milGraphicLayers];

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Shared state ────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<ActiveTab>("units");
  const [affiliation, setAffiliation] = useState<MilAffiliation>("FRIENDLY");

  // ── Unit catalog state ──────────────────────────────────────────────
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [catalogOpen, setCatalogOpen] = useState(true);
  const [selectedEntry, setSelectedEntry] = useState<CatalogEntry | null>(null);
  const [placing, setPlacing] = useState(false);
  const [unitDesig, setUnitDesig] = useState("");
  const [higherForm, setHigherForm] = useState("");

  // ── Edit state ──────────────────────────────────────────────────────
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [editDesig, setEditDesig] = useState("");
  const [editHigher, setEditHigher] = useState("");

  // ── Graphic drawing state ────────────────────────────────────────────
  const [selectedGraphic, setSelectedGraphic] = useState<
    (typeof GRAPHIC_TYPES)[0] | null
  >(null);
  const [drawingGraphic, setDrawingGraphic] = useState(false);
  const drawnPointsRef = useRef<[number, number][]>([]);
  const [drawnPoints, setDrawnPoints] = useState<[number, number][]>([]);
  const [graphicDesig, setGraphicDesig] = useState("");

  // ── Catalog filtering ────────────────────────────────────────────────
  const results = filterCatalog(query, category || undefined);
  const previewSidc = selectedEntry
    ? sidcWithAffiliation(selectedEntry.baseSidc, affiliation)
    : null;

  // ── Unit placement ────────────────────────────────────────────────────
  const onUnitMapClick = useCallback(
    (lon: number, lat: number) => {
      if (!selectedEntry) return;
      setPlacing(false);
      const sidc = sidcWithAffiliation(selectedEntry.baseSidc, affiliation);
      const name = unitDesig || selectedEntry.name;
      const source: MilSymbolLayerSource = {
        SIDC: sidc,
        lon,
        lat,
        affiliation,
        uniqueDesignation: unitDesig || undefined,
        higherFormation: higherForm || undefined,
      };
      addLayer({
        id: crypto.randomUUID(),
        name,
        type: "mil-symbol",
        visible: true,
        opacity: 1,
        style: { ...DEFAULT_LAYER_STYLE },
        metadata: {},
        source: source as unknown as Record<string, unknown>,
      });
    },
    [selectedEntry, affiliation, unitDesig, higherForm, addLayer],
  );

  const { enable: enableUnitPick, disable: disableUnitPick } = useMapClick(
    mapControllerRef,
    onUnitMapClick,
    true,
  );

  const startPlacing = () => {
    if (!selectedEntry) return;
    setPlacing(true);
    enableUnitPick();
  };

  const cancelPlacing = () => {
    setPlacing(false);
    disableUnitPick();
  };

  // ── Graphic drawing ────────────────────────────────────────────────
  const onGraphicMapClick = useCallback(
    (lon: number, lat: number) => {
      if (!drawingGraphic || !selectedGraphic) return;
      drawnPointsRef.current = [...drawnPointsRef.current, [lon, lat]];
      setDrawnPoints([...drawnPointsRef.current]);
    },
    [drawingGraphic, selectedGraphic],
  );

  const { enable: enableGraphicPick, disable: disableGraphicPick } = useMapClick(
    mapControllerRef,
    onGraphicMapClick,
    false,
  );

  const startDrawing = () => {
    if (!selectedGraphic) return;
    drawnPointsRef.current = [];
    setDrawnPoints([]);
    setDrawingGraphic(true);
    enableGraphicPick();
  };

  const finishDrawing = () => {
    if (!selectedGraphic) return;
    disableGraphicPick();
    setDrawingGraphic(false);
    const pts = drawnPointsRef.current;
    if (pts.length < 2) return;

    const sidc = sidcWithAffiliation(selectedGraphic.sidc, affiliation);
    const source: MilGraphicLayerSource = {
      SIDC: sidc,
      geometryType: selectedGraphic.geometryType,
      coordinates: pts,
      affiliation,
      uniqueDesignation: graphicDesig || undefined,
    };
    addLayer({
      id: crypto.randomUUID(),
      name: graphicDesig || selectedGraphic.label,
      type: "mil-graphic",
      visible: true,
      opacity: 1,
      style: { ...DEFAULT_LAYER_STYLE },
      metadata: {},
      source: source as unknown as Record<string, unknown>,
    });
    drawnPointsRef.current = [];
    setDrawnPoints([]);
  };

  const cancelDrawing = () => {
    disableGraphicPick();
    setDrawingGraphic(false);
    drawnPointsRef.current = [];
    setDrawnPoints([]);
  };

  // ── Editing ────────────────────────────────────────────────────────
  const startEditing = (layer: GeoLibreLayer) => {
    const src = layer.source as unknown as MilSymbolLayerSource;
    setEditingLayerId(layer.id);
    setEditDesig(src.uniqueDesignation ?? "");
    setEditHigher(src.higherFormation ?? "");
  };

  const saveEdit = (layerId: string) => {
    const layer = layers.find((l) => l.id === layerId);
    if (!layer) return;
    const src = layer.source as unknown as MilSymbolLayerSource;
    updateLayer(layerId, {
      name: editDesig || layer.name,
      source: {
        ...layer.source,
        uniqueDesignation: editDesig || undefined,
        higherFormation: editHigher || undefined,
      } as unknown as Record<string, unknown>,
    });
    // Update displayed name using designation
    const newName = editDesig || src.SIDC.slice(0, 8);
    updateLayer(layerId, { name: newName });
    setEditingLayerId(null);
  };

  // ── Import ────────────────────────────────────────────────────────
  const handleImportFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      let imported: GeoLibreLayer[];
      if (file.name.toLowerCase().endsWith(".kml")) {
        imported = importMilSymbolsFromKML(text, file.name.replace(/\.kml$/i, ""));
      } else {
        const fc = JSON.parse(text) as FeatureCollection;
        imported = importMilSymbolsFromGeoJSON(fc, file.name.replace(/\.geojson$/i, ""));
      }
      for (const layer of imported) addLayer(layer);
    } catch (err) {
      console.error("MilSymbol import failed", err);
    }
    // Reset input so the same file can be picked again
    e.target.value = "";
  };

  // ── Export ────────────────────────────────────────────────────────
  const handleExport = () => {
    downloadMilLayersAsGeoJSON(allMilLayers, "milgeo-symbols");
  };

  // ─────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-2 p-2 text-xs text-foreground select-none">

      {/* ── Tab bar ─────────────────────────────────────────────── */}
      <div className="flex rounded-md border overflow-hidden">
        {(["units", "graphics"] as ActiveTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "flex-1 py-1 text-[11px] font-medium capitalize transition-colors",
              activeTab === tab
                ? "bg-primary text-primary-foreground"
                : "bg-card hover:bg-muted",
            )}
          >
            {tab === "units" ? "Units" : "Graphics"}
          </button>
        ))}
      </div>

      {/* ── Affiliation bar ──────────────────────────────────────── */}
      <div className="flex gap-1">
        {AFFILIATIONS.map((a) => (
          <button
            key={a.id}
            onClick={() => setAffiliation(a.id)}
            title={a.label}
            style={{
              borderColor: a.color,
              color: affiliation === a.id ? "#fff" : a.color,
              backgroundColor: affiliation === a.id ? a.color : "transparent",
            }}
            className="flex-1 rounded border text-[10px] font-semibold py-0.5 transition-colors"
          >
            {a.label.slice(0, 4)}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════════════════════════════════ */}
      {activeTab === "units" && (
        <>
          {/* ── Symbol catalog browser ─────────────────────────── */}
          <div className="rounded-md border overflow-hidden">
            <button
              className="w-full flex items-center gap-2 px-3 py-2 text-[11px] font-semibold bg-muted hover:bg-muted/80 transition-colors"
              onClick={() => setCatalogOpen(!catalogOpen)}
            >
              <Shield size={13} />
              <span className="flex-1 text-left">Symbol Catalog</span>
              {catalogOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            </button>

            {catalogOpen && (
              <div className="p-2 space-y-2">
                {/* Search + Category */}
                <div className="flex gap-1">
                  <div className="relative flex-1">
                    <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search symbol…"
                      className="w-full pl-6 pr-2 py-1 rounded bg-background border text-[11px] placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="rounded bg-background border text-[11px] px-1.5 focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="">All</option>
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                {/* Symbol list — single column to avoid label/icon overlap */}
                <div className="flex flex-col gap-0.5 max-h-52 overflow-y-auto pr-0.5">
                  {results.map((entry) => {
                    const sidc = sidcWithAffiliation(entry.baseSidc, affiliation);
                    const isSelected = selectedEntry?.baseSidc === entry.baseSidc;
                    return (
                      <button
                        key={entry.baseSidc + entry.name}
                        onClick={() => setSelectedEntry(isSelected ? null : entry)}
                        className={cn(
                          "flex items-center gap-2 px-2 py-1 rounded border text-left transition-colors w-full",
                          isSelected
                            ? "border-primary bg-primary/10"
                            : "border-border hover:bg-muted",
                        )}
                      >
                        <SymbolPreview sidc={sidc} size={36} />
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="text-[11px] font-medium leading-tight truncate">
                            {entry.name}
                          </span>
                          {entry.subcategory && (
                            <span className="text-[9px] text-muted-foreground leading-tight">
                              {entry.subcategory}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                  {results.length === 0 && (
                    <p className="col-span-2 text-center text-muted-foreground py-3">
                      No symbols found
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── Selected symbol placement ─────────────────────── */}
          {selectedEntry && (
            <div className="rounded-md border border-primary/40 p-3 space-y-2 bg-primary/5">
              <div className="flex items-center gap-2">
                {previewSidc && <SymbolPreview sidc={previewSidc} size={40} />}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[11px] truncate">{selectedEntry.name}</p>
                  <p className="text-muted-foreground text-[10px]">{selectedEntry.category}</p>
                </div>
                <button onClick={() => setSelectedEntry(null)}>
                  <X size={13} className="text-muted-foreground hover:text-foreground" />
                </button>
              </div>
              <div className="space-y-1">
                <input
                  value={unitDesig}
                  onChange={(e) => setUnitDesig(e.target.value)}
                  placeholder="Unit designation (e.g. 2 INF)"
                  className="w-full px-2 py-1 rounded bg-background border text-[11px] placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <input
                  value={higherForm}
                  onChange={(e) => setHigherForm(e.target.value)}
                  placeholder="Higher formation (e.g. 1 BDE)"
                  className="w-full px-2 py-1 rounded bg-background border text-[11px] placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              {!placing ? (
                <button
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded bg-primary text-primary-foreground text-[11px] hover:opacity-90 transition-opacity"
                  onClick={startPlacing}
                >
                  <MapPin size={12} /> Place on map
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="flex-1 text-primary text-[11px] flex items-center gap-1 animate-pulse">
                    <MapPin size={12} /> Click on the map to place…
                  </span>
                  <button onClick={cancelPlacing}>
                    <X size={13} className="text-muted-foreground hover:text-foreground" />
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ════════════════════════════════════════════════════════════ */}
      {activeTab === "graphics" && (
        <>
          {/* ── Graphic type picker ──────────────────────────────── */}
          <div className="rounded-md border overflow-hidden">
            <div className="px-3 py-2 text-[11px] font-semibold bg-muted flex items-center gap-2">
              <Shield size={13} />
              <span>Tactical Graphic Types</span>
            </div>
            <div className="p-2 grid grid-cols-1 gap-0.5 max-h-48 overflow-y-auto">
              {GRAPHIC_TYPES.map((g) => (
                <button
                  key={g.sidc}
                  onClick={() =>
                    setSelectedGraphic(selectedGraphic?.sidc === g.sidc ? null : g)
                  }
                  className={cn(
                    "flex items-center gap-2 px-2 py-1 rounded text-left text-[11px] transition-colors",
                    selectedGraphic?.sidc === g.sidc
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted",
                  )}
                >
                  <span className="text-[9px] uppercase text-muted-foreground w-10 shrink-0">
                    {g.geometryType === "Polygon" ? "Area" : "Line"}
                  </span>
                  {g.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Drawing controls ────────────────────────────────── */}
          {selectedGraphic && (
            <div className="rounded-md border border-primary/40 p-3 space-y-2 bg-primary/5">
              <p className="text-[11px] font-semibold">{selectedGraphic.label}</p>
              <input
                value={graphicDesig}
                onChange={(e) => setGraphicDesig(e.target.value)}
                placeholder="Designation (optional)"
                className="w-full px-2 py-1 rounded bg-background border text-[11px] placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              {!drawingGraphic ? (
                <button
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded bg-primary text-primary-foreground text-[11px] hover:opacity-90 transition-opacity"
                  onClick={startDrawing}
                >
                  <Plus size={12} /> Start drawing ({selectedGraphic.geometryType === "Polygon" ? "click vertices, finish below" : "click points, finish below"})
                </button>
              ) : (
                <div className="space-y-1">
                  <p className="text-primary text-[11px] animate-pulse flex items-center gap-1">
                    <MapPin size={12} /> {drawnPoints.length} point{drawnPoints.length !== 1 ? "s" : ""} — click map to add
                  </p>
                  <div className="flex gap-1">
                    <button
                      className="flex-1 py-1 rounded bg-primary text-primary-foreground text-[11px] hover:opacity-90"
                      onClick={finishDrawing}
                      disabled={drawnPoints.length < 2}
                    >
                      Finish
                    </button>
                    <button
                      className="py-1 px-2 rounded border text-[11px] hover:bg-muted"
                      onClick={cancelDrawing}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── ORBAT / graphic list ──────────────────────────────────── */}
      {allMilLayers.length > 0 && (
        <div className="rounded-md border overflow-hidden">
          <div className="px-3 py-2 text-[11px] font-semibold bg-muted flex items-center gap-2">
            <Shield size={13} />
            <span className="flex-1">Order of Battle</span>
            <span className="text-muted-foreground">{allMilLayers.length}</span>
          </div>
          <ul className="divide-y">
            {allMilLayers.map((layer) => {
              const isSym = layer.type === "mil-symbol";
              const src = layer.source as unknown as
                | MilSymbolLayerSource
                | MilGraphicLayerSource;
              const sidc = src.SIDC ?? "";
              const isEditing = editingLayerId === layer.id;

              return (
                <li key={layer.id} className="px-2 py-1.5">
                  {isEditing ? (
                    <div className="space-y-1">
                      <input
                        value={editDesig}
                        onChange={(e) => setEditDesig(e.target.value)}
                        placeholder="Unit designation"
                        className="w-full px-2 py-0.5 rounded bg-background border text-[11px] focus:outline-none focus:ring-1 focus:ring-ring"
                        autoFocus
                      />
                      {isSym && (
                        <input
                          value={editHigher}
                          onChange={(e) => setEditHigher(e.target.value)}
                          placeholder="Higher formation"
                          className="w-full px-2 py-0.5 rounded bg-background border text-[11px] focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                      )}
                      <div className="flex gap-1">
                        <button
                          className="flex-1 py-0.5 rounded bg-primary text-primary-foreground text-[11px]"
                          onClick={() => saveEdit(layer.id)}
                        >
                          Save
                        </button>
                        <button
                          className="py-0.5 px-2 rounded border text-[11px]"
                          onClick={() => setEditingLayerId(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      {isSym ? (
                        <SymbolPreview sidc={sidc} size={24} />
                      ) : (
                        <span className="w-6 h-6 flex items-center justify-center text-[9px] text-muted-foreground border rounded">
                          {(src as MilGraphicLayerSource).geometryType === "Polygon" ? "A" : "L"}
                        </span>
                      )}
                      <span className="flex-1 truncate text-[11px]">{layer.name}</span>
                      {isSym && (
                        <button
                          title="Edit"
                          onClick={() => startEditing(layer)}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <Pencil size={12} />
                        </button>
                      )}
                      <button
                        title={layer.visible ? "Hide" : "Show"}
                        onClick={() => updateLayer(layer.id, { visible: !layer.visible })}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        {layer.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                      </button>
                      <button
                        title="Remove"
                        onClick={() => removeLayer(layer.id)}
                        className="text-muted-foreground hover:text-red-400"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* ── Import / Export actions ───────────────────────────────── */}
      <div className="flex gap-1 mt-1">
        <input
          ref={fileInputRef}
          type="file"
          accept=".geojson,.json,.kml"
          className="hidden"
          onChange={handleImportFile}
        />
        <button
          className="flex-1 flex items-center justify-center gap-1 py-1 rounded border text-[11px] hover:bg-muted transition-colors"
          onClick={() => fileInputRef.current?.click()}
          title="Import GeoJSON or KML with SIDC field"
        >
          <Upload size={12} /> Import
        </button>
        <button
          className="flex-1 flex items-center justify-center gap-1 py-1 rounded border text-[11px] hover:bg-muted transition-colors"
          onClick={handleExport}
          disabled={allMilLayers.length === 0}
          title="Export all mil-symbols as GeoJSON"
        >
          <Download size={12} /> Export
        </button>
      </div>

      {allMilLayers.length === 0 && !selectedEntry && !selectedGraphic && (
        <p className="text-center text-muted-foreground text-[11px] py-4">
          Select a symbol or graphic type and place it on the map.
        </p>
      )}
    </div>
  );
}
