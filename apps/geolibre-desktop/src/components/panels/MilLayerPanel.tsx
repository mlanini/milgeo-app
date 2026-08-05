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
  Crosshair,
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
import { parseSidc, buildSidc } from "../../lib/mil-sidc";
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

function affiliationFromSidc(sidc: string): MilAffiliation {
  switch (parseSidc(sidc).identity) {
    case "2":
    case "3":
      return "FRIENDLY";
    case "4":
      return "NEUTRAL";
    case "5":
    case "6":
      return "HOSTILE";
    default:
      return "UNKNOWN";
  }
}

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
  const [symbolSizePx, setSymbolSizePx] = useState(DEFAULT_MIL_SYMBOL_SIZE_PX);
  const [placingSidc, setPlacingSidc] = useState<string | null>(null);
  const [pendingPatch, setPendingPatch] = useState<MilSymbolPatch | null>(null);
  const [pendingMove, setPendingMove] = useState<{ layerId: string; symbolId: string } | null>(null);
  const [editingEntry, setEditingEntry] = useState<CatalogEntry | null>(null);
  const [editingPatch, setEditingPatch] = useState<MilSymbolPatch | null>(null);
  const [editingSymbol, setEditingSymbol] = useState<{ layerId: string; symbolId: string } | null>(null);
  const [editingPlacedPatch, setEditingPlacedPatch] = useState<MilSymbolPatch | null>(null);

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

  const targetLayer = useMemo(() => resolveTargetLayer(), [resolveTargetLayer]);
  const targetSymbols = useMemo(
    () => (targetLayer ? parseMilSymbolLayerSource(targetLayer.source).symbols : []),
    [targetLayer]
  );

  useEffect(() => {
    if (!targetLayer) return;
    const parsed = parseMilSymbolLayerSource(targetLayer.source);
    setSymbolSizePx(parsed.symbolSize);
  }, [targetLayer]);

  // Applies echelon to the SIDC before placing, preserving catalog modifiers.
  function applyEchelon(baseSidc: string): string {
    return buildSidc({ ...parseSidc(baseSidc) });
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
      if (pendingMove) {
        const layer = layers.find((item) => item.id === pendingMove.layerId);
        if (layer?.type === "mil-symbol") {
          const parsed = parseMilSymbolLayerSource(layer.source);
          const symbols = parsed.symbols.map((symbol) =>
            symbol.id === pendingMove.symbolId
              ? { ...symbol, lon, lat }
              : symbol
          );
          updateLayer(layer.id, {
            source: serializeMilSymbolLayerSource(symbols, parsed.symbolSize),
          });
          selectLayer(layer.id);
        }
        setPendingMove(null);
        return;
      }

      if (!pendingPatch?.sidc) return;

      const target = resolveTargetLayer();
      const symbol: MilSymbolLayerItem = {
        id: crypto.randomUUID(),
        name: pendingPatch.name || pendingPatch.uniqueDesignation || "Symbol",
        SIDC: pendingPatch.sidc,
        lon,
        lat,
        affiliation: affiliationFromSidc(pendingPatch.sidc),
        uniqueDesignation: pendingPatch.uniqueDesignation,
        higherFormation: pendingPatch.higherFormation,
        staffComments: pendingPatch.staffComments,
        additionalInformation: pendingPatch.additionalInformation,
        dtg: pendingPatch.dtg,
        altitudeDepth: pendingPatch.altitudeDepth,
        direction: pendingPatch.direction,
        quantity: pendingPatch.quantity,
        iffSif: pendingPatch.iffSif,
        speed: pendingPatch.speed,
        typeStr: pendingPatch.typeStr,
        reinforcedReduced: pendingPatch.reinforcedReduced,
        combatEffectiveness: pendingPatch.combatEffectiveness,
        evaluationRating: pendingPatch.evaluationRating,
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
      setPendingMove(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pendingPatch, pendingMove, symbolSizePx, addLayer, resolveTargetLayer, updateLayer, selectLayer, layers]),
    true,
  );

  function handleSelectEntry(entry: CatalogEntry) {
    queuePlacement(buildDefaultPatch(entry));
  }

  function handleEditEntry(entry: CatalogEntry) {
    setEditingSymbol(null);
    setEditingPlacedPatch(null);
    setEditingEntry(entry);
    setEditingPatch(buildDefaultPatch(entry));
  }

  function handleSaveEditedEntry(patch: MilSymbolPatch) {
    queuePlacement(patch);
    setEditingEntry(null);
    setEditingPatch(null);
  }

  function handleEditPlacedSymbol(symbol: MilSymbolLayerItem) {
    if (!targetLayer) return;
    setEditingEntry(null);
    setEditingPatch(null);
    setEditingSymbol({ layerId: targetLayer.id, symbolId: symbol.id });
    setEditingPlacedPatch({
      name: symbol.name,
      sidc: symbol.SIDC,
      uniqueDesignation: symbol.uniqueDesignation,
      higherFormation: symbol.higherFormation,
      staffComments: symbol.staffComments,
      additionalInformation: symbol.additionalInformation,
      dtg: symbol.dtg,
      altitudeDepth: symbol.altitudeDepth,
      direction: symbol.direction,
      quantity: symbol.quantity,
      iffSif: symbol.iffSif,
      speed: symbol.speed,
      typeStr: symbol.typeStr,
      reinforcedReduced: symbol.reinforcedReduced,
      combatEffectiveness: symbol.combatEffectiveness,
      evaluationRating: symbol.evaluationRating,
    });
  }

  function handleSaveEditedPlacedSymbol(patch: MilSymbolPatch) {
    if (!editingSymbol) return;
    const layer = layers.find((item) => item.id === editingSymbol.layerId);
    if (layer?.type !== "mil-symbol") return;

    const parsed = parseMilSymbolLayerSource(layer.source);
    const symbols = parsed.symbols.map((symbol) => {
      if (symbol.id !== editingSymbol.symbolId) return symbol;
      const nextSidc = patch.sidc ?? symbol.SIDC;
      return {
        ...symbol,
        name: patch.name ?? symbol.name,
        SIDC: nextSidc,
        affiliation: affiliationFromSidc(nextSidc),
        uniqueDesignation: patch.uniqueDesignation,
        higherFormation: patch.higherFormation,
        staffComments: patch.staffComments,
        additionalInformation: patch.additionalInformation,
        dtg: patch.dtg,
        altitudeDepth: patch.altitudeDepth,
        direction: patch.direction,
        quantity: patch.quantity,
        iffSif: patch.iffSif,
        speed: patch.speed,
        typeStr: patch.typeStr,
        reinforcedReduced: patch.reinforcedReduced,
        combatEffectiveness: patch.combatEffectiveness,
        evaluationRating: patch.evaluationRating,
      };
    });

    updateLayer(layer.id, {
      source: serializeMilSymbolLayerSource(symbols, parsed.symbolSize),
    });
    setEditingSymbol(null);
    setEditingPlacedPatch(null);
  }

  function handleMovePlacedSymbol(symbol: MilSymbolLayerItem) {
    if (!targetLayer) return;
    setEditingEntry(null);
    setEditingPatch(null);
    setEditingSymbol(null);
    setEditingPlacedPatch(null);
    setPendingPatch(null);
    setPlacingSidc(null);
    setPendingMove({ layerId: targetLayer.id, symbolId: symbol.id });
    enableClick();
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
    setPendingMove(null);
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

      {/* Symbol size */}
      <div className="px-3 pb-1 grid grid-cols-1 gap-1.5">
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
      {(placingSidc || pendingMove) && (
        <div className="mx-3 mb-1 px-2 py-1 bg-blue-500/10 rounded border border-blue-500/30 flex items-center gap-2 text-xs text-blue-700 dark:text-blue-300">
          {pendingMove ? <Crosshair size={11} /> : <MapPin size={11} />}
          {pendingMove ? "Clicca nuova posizione per il simbolo…" : "Clicca sulla mappa per posizionare…"}
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

      {targetLayer && targetSymbols.length > 0 && (
        <div className="border-t px-3 py-2">
          <div className="mb-1 text-[10px] font-medium text-muted-foreground">
            Simboli nel layer selezionato ({targetSymbols.length})
          </div>
          <div className="max-h-28 overflow-y-auto space-y-0.5">
            {targetSymbols.map((symbol) => (
              <div key={symbol.id} className="flex items-center gap-1.5 px-1.5 py-1 rounded hover:bg-muted/50">
                <SymPreview sidc={symbol.SIDC} size={18} />
                <div className="flex-1 min-w-0 text-[10px]">
                  <div className="truncate font-medium">{symbol.name}</div>
                  <div className="truncate text-muted-foreground">{symbol.uniqueDesignation || symbol.SIDC}</div>
                </div>
                <button
                  className="p-1 rounded hover:bg-muted"
                  onClick={() => handleMovePlacedSymbol(symbol)}
                  title="Sposta simbolo"
                >
                  <Crosshair size={11} />
                </button>
                <button
                  className="p-1 rounded hover:bg-muted"
                  onClick={() => handleEditPlacedSymbol(symbol)}
                  title="Modifica simbolo"
                >
                  <Pencil size={11} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {editingEntry && editingPatch && (
        <div className="border-t bg-background">
          <MilSymbolEditor
            className="h-[56vh] min-h-[320px] max-h-[560px]"
            initial={editingPatch}
            onSave={handleSaveEditedEntry}
            onCancel={() => {
              setEditingEntry(null);
              setEditingPatch(null);
            }}
          />
        </div>
      )}

      {editingSymbol && editingPlacedPatch && (
        <div className="border-t bg-background">
          <MilSymbolEditor
            className="h-[56vh] min-h-[320px] max-h-[560px]"
            initial={editingPlacedPatch}
            onSave={handleSaveEditedPlacedSymbol}
            onCancel={() => {
              setEditingSymbol(null);
              setEditingPlacedPatch(null);
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
