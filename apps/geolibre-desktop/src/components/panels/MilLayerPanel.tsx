/**
 * MilLayerPanel.tsx
 * Embedded MilGeo workspace panel.
 *
 * The main Layers panel is the single place where milsymbol layers are managed
 * (visibility, order, rename, delete). This panel only exposes symbol creation
 * via the APP-6D catalog and ORBAT authoring.
 */
import {
  useState,
  useCallback,
  useMemo,
  useEffect,
} from "react";
import { DEFAULT_LAYER_STYLE, useAppStore, type GeoLibreLayer } from "@geolibre/core";
import { cn } from "@geolibre/ui";
import ms from "milsymbol";
import {
  Check,
  MapPin,
  Pencil,
  X,
} from "lucide-react";
import type { MapController } from "@geolibre/map";
import type { MilAffiliation } from "@geolibre/core";
import { useMapClick } from "../../hooks/useMapClick";
import { OrbatPanel } from "./OrbatPanel";
import { MilSymbolEditor, type MilSymbolPatch } from "./MilSymbolEditor";
import {
  CATEGORIES,
  filterCatalog,
  sidcWithAffiliation,
  type CatalogEntry,
} from "../../lib/milsymbol-catalog";
import { parseSidc, buildSidc, ECHELON_OPTIONS } from "../../lib/mil-sidc";
import {
  DEFAULT_MIL_SYMBOL_SIZE_PX,
  parseMilSymbolLayerSource,
  serializeMilSymbolLayerSource,
  type MilSymbolLayerItem,
} from "../../lib/milsymbol-layer-source";

const MilSymbol = ms.Symbol;
const CATALOG_ICON = 32;

// ─── Types ────────────────────────────────────────────────────────────────────

type TabId = "catalog" | "orbat";

interface MilLayerPanelProps {
  mapControllerRef: React.RefObject<MapController | null>;
}

// ─── Mini symbol preview ──────────────────────────────────────────────────────

function SymPreview({ sidc, size = CATALOG_ICON }: { sidc: string; size?: number }) {
  const svg = useMemo(() => {
    try {
      const sym = new MilSymbol(sidc, { size });
      return sym.isValid() ? sym.asSVG() : null;
    } catch { return null; }
  }, [sidc, size]);

  if (!svg) return <div className="flex-shrink-0 rounded bg-muted" style={{ width: size, height: size }} />;
  return (
    <div
      className="flex-shrink-0 overflow-hidden [&>svg]:w-full [&>svg]:h-full [&>svg]:block"
      style={{ width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

// ─── AFFILIATION bar ──────────────────────────────────────────────────────────

const AFF_OPTIONS: { id: MilAffiliation; label: string; color: string }[] = [
  { id: "FRIENDLY", label: "Amico",    color: "#4A7FCE" },
  { id: "HOSTILE",  label: "Ostile",   color: "#CE4A4A" },
  { id: "NEUTRAL",  label: "Neutrale", color: "#4ACE8C" },
  { id: "UNKNOWN",  label: "Ignoto",   color: "#AAAAAA" },
];

// ─── CATALOG tab ──────────────────────────────────────────────────────────────

interface CatalogTabProps {
  mapControllerRef: React.RefObject<MapController | null>;
}

function createMilSymbolLayer(name: string, symbol: MilSymbolLayerItem, symbolSize: number): GeoLibreLayer {
  return {
    id: crypto.randomUUID(),
    name,
    type: "mil-symbol",
    visible: true,
    opacity: 1,
    style: { ...DEFAULT_LAYER_STYLE },
    metadata: { milgeoManaged: true },
    source: serializeMilSymbolLayerSource([symbol], symbolSize),
  };
}

function CatalogTab({ mapControllerRef }: CatalogTabProps) {
  const layers = useAppStore((s) => s.layers);
  const selectedLayerId = useAppStore((s) => s.selectedLayerId);
  const addLayer = useAppStore((s) => s.addLayer);
  const updateLayer = useAppStore((s) => s.updateLayer);
  const selectLayer = useAppStore((s) => s.selectLayer);

  const [search,      setSearch]      = useState("");
  const [category,    setCategory]    = useState("All");
  const [affiliation, setAffiliation] = useState<MilAffiliation>("FRIENDLY");
  const [echelon,     setEchelon]     = useState("00");
  const [symbolSizePx, setSymbolSizePx] = useState(DEFAULT_MIL_SYMBOL_SIZE_PX);
  const [placingSidc, setPlacingSidc] = useState<string | null>(null);
  const [pendingPatch, setPendingPatch] = useState<MilSymbolPatch | null>(null);
  const [editingEntry, setEditingEntry] = useState<CatalogEntry | null>(null);
  const [editingPatch, setEditingPatch] = useState<MilSymbolPatch | null>(null);

  const milSymbolLayers = useMemo(
    () => layers.filter((layer) => layer.type === "mil-symbol"),
    [layers]
  );

  const resolveTargetLayer = useCallback(() => {
    if (selectedLayerId) {
      const selected = milSymbolLayers.find((layer) => layer.id === selectedLayerId);
      if (selected) return selected;
    }

    return milSymbolLayers.find((layer) => layer.metadata.milgeoManaged === true)
      ?? milSymbolLayers[0]
      ?? null;
  }, [milSymbolLayers, selectedLayerId]);

  const filtered = useMemo(
    () => filterCatalog(search, category === "All" ? undefined : category),
    [search, category]
  );

  useEffect(() => {
    const target = resolveTargetLayer();
    if (!target) return;
    const parsed = parseMilSymbolLayerSource(target.source);
    setSymbolSizePx(parsed.symbolSize);
  }, [resolveTargetLayer]);

  // Applies echelon to the SIDC before placing, preserving catalog modifiers.
  function applyEchelon(baseSidc: string): string {
    const p = parseSidc(baseSidc);
    return buildSidc({
      ...p,
      echelon:   echelon !== "00" ? echelon : p.echelon,
    });
  }

  function buildDefaultPatch(entry: CatalogEntry): MilSymbolPatch {
    return {
      name: entry.name,
      sidc: applyEchelon(sidcWithAffiliation(entry.baseSidc, affiliation)),
      uniqueDesignation: undefined,
      higherFormation: undefined,
    };
  }

  function queuePlacement(patch: MilSymbolPatch) {
    if (!patch.sidc) return;
    setPendingPatch(patch);
    setPlacingSidc(patch.sidc);
    enableClick();
  }

  const { enable: enableClick, disable: disableClick } = useMapClick(
    mapControllerRef,
    useCallback((lon, lat) => {
      if (!pendingPatch?.sidc) return;

      const target = resolveTargetLayer();
      const symbol: MilSymbolLayerItem = {
        id: crypto.randomUUID(),
        name: pendingPatch.name || pendingPatch.uniqueDesignation || "Symbol",
        SIDC: pendingPatch.sidc,
        lon,
        lat,
        affiliation,
        uniqueDesignation: pendingPatch.uniqueDesignation,
        higherFormation: pendingPatch.higherFormation,
        direction: pendingPatch.direction,
      };

      if (!target) {
        const created = createMilSymbolLayer("Mil Symbols", symbol, symbolSizePx);
        addLayer(created);
        selectLayer(created.id);
      } else {
        const parsed = parseMilSymbolLayerSource(target.source);
        updateLayer(target.id, {
          source: serializeMilSymbolLayerSource([...parsed.symbols, symbol], symbolSizePx),
        });
        selectLayer(target.id);
      }

      setPlacingSidc(null);
      setPendingPatch(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pendingPatch, affiliation, symbolSizePx, addLayer, resolveTargetLayer, updateLayer, selectLayer]),
    true,
  );

  function handleSelectEntry(entry: CatalogEntry) {
    queuePlacement(buildDefaultPatch(entry));
  }

  function handleEditEntry(entry: CatalogEntry) {
    setEditingEntry(entry);
    setEditingPatch(buildDefaultPatch(entry));
  }

  function handleSaveEditedEntry(patch: MilSymbolPatch) {
    queuePlacement(patch);
    setEditingEntry(null);
    setEditingPatch(null);
  }

  function handleChangeSymbolSize(value: number) {
    setSymbolSizePx(value);
    const target = resolveTargetLayer();
    if (!target) return;
    const parsed = parseMilSymbolLayerSource(target.source);
    updateLayer(target.id, {
      source: serializeMilSymbolLayerSource(parsed.symbols, value),
    });
  }

  function cancelPlace() {
    setPendingPatch(null);
    setPlacingSidc(null);
    disableClick();
  }

  return (
    <div className="flex flex-col h-full">
      <div className="border-b bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
        I simboli vengono aggiunti nel layer milsymbol selezionato nel pannello Layers principale.
      </div>

      {/* Affiliation bar */}
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

      {/* Echelon selector */}
      <div className="px-3 pb-1 grid grid-cols-1 gap-1.5">
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] font-medium text-muted-foreground">Echelon</span>
          <select
            className="h-6 rounded border border-input bg-background px-1 text-xs focus:outline-none"
            value={echelon}
            onChange={(e) => setEchelon(e.target.value)}
          >
            {ECHELON_OPTIONS.map((o) => (
              <option key={o.code} value={o.code}>{o.code === "00" ? "—" : o.label}</option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] font-medium text-muted-foreground">
            Scale Symbols Size: {symbolSizePx}px
          </span>
          <input
            type="range"
            min={18}
            max={96}
            step={1}
            value={symbolSizePx}
            onChange={(e) => handleChangeSymbolSize(Number(e.target.value))}
          />
        </label>
      </div>

      {/* Search + category */}
      <div className="flex gap-1.5 px-3 pb-1">
        <input
          className="flex-1 h-6 rounded border border-input bg-background px-1.5 text-xs focus:outline-none"
          placeholder="Cerca simbolo…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="h-6 rounded border border-input bg-background px-1 text-xs focus:outline-none"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="All">Tutte</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {/* Placing banner */}
      {placingSidc && (
        <div className="mx-3 mb-1 px-2 py-1 bg-blue-500/10 rounded border border-blue-500/30 flex items-center gap-2 text-xs text-blue-700 dark:text-blue-300">
          <MapPin size={11} /> Clicca sulla mappa per posizionare…
          <button className="ml-auto" onClick={cancelPlace}><X size={11} /></button>
        </div>
      )}

      {/* Catalog list */}
      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-0.5">
        {filtered.map((entry) => {
          const previewSidc = applyEchelon(sidcWithAffiliation(entry.baseSidc, affiliation));
          const isActive = placingSidc === entry.baseSidc;
          return (
            <div
              key={entry.baseSidc}
              className={cn(
                "flex items-center gap-2 px-2 py-1 rounded cursor-pointer hover:bg-muted/60 transition-colors",
                isActive && "bg-primary/10 ring-1 ring-primary"
              )}
              onClick={() => handleSelectEntry(entry)}
            >
              <SymPreview sidc={previewSidc} size={CATALOG_ICON} />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate">{entry.name}</div>
                <div className="text-[10px] text-muted-foreground truncate">{entry.category}</div>
              </div>
              <button
                className="p-1 rounded hover:bg-muted"
                onClick={(e) => {
                  e.stopPropagation();
                  handleEditEntry(entry);
                }}
                title="Modifica prima del posizionamento"
              >
                <Pencil size={12} />
              </button>
              {isActive && <Check size={13} className="text-primary flex-shrink-0" />}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="py-4 text-center text-xs text-muted-foreground">
            Nessun risultato.
          </div>
        )}
      </div>

      {editingEntry && editingPatch && (
        <div className="border-t bg-background">
          <MilSymbolEditor
            initial={editingPatch}
            onSave={handleSaveEditedEntry}
            onCancel={() => {
              setEditingEntry(null);
              setEditingPatch(null);
            }}
          />
        </div>
      )}
    </div>
  );
}

// ─── MAIN PANEL ───────────────────────────────────────────────────────────────

export function MilLayerPanel({ mapControllerRef }: MilLayerPanelProps) {
  const [tab, setTab] = useState<TabId>("catalog");

  const tabCls = (t: TabId) =>
    cn(
      "flex-1 py-1.5 text-[11px] font-medium border-b-2 transition-colors",
      t === tab
        ? "border-primary text-primary"
        : "border-transparent text-muted-foreground hover:text-foreground"
    );

  return (
    <div className="flex flex-col h-full bg-background text-foreground text-sm">
      {/* Tabs */}
      <div className="flex border-b">
        <button className={tabCls("catalog")} onClick={() => setTab("catalog")}>Catalogo</button>
        <button className={tabCls("orbat")}   onClick={() => setTab("orbat")}>ORBAT</button>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {tab === "catalog" && <CatalogTab mapControllerRef={mapControllerRef} />}
        {tab === "orbat"   && <OrbatPanel mapControllerRef={mapControllerRef} />}
      </div>
    </div>
  );
}
