/**
 * MilLayerPanel.tsx
 * Main military symbol management panel — replaces the old MilSymbolPanel.
 *
 * Three tabs:
 *   Layers   – named layers with N symbols each; add/rename/delete layers;
 *              toggle visibility/opacity; list + edit/delete symbols.
 *   Catalogo – browse the APP-6D symbol catalog; select identity/echelon;
 *              click symbol → then click on map to place it.
 *   ORBAT    – hierarchical order-of-battle tree; place units on map.
 *
 * Import / Export toolbar at the top:
 *   Import: .milgeo.json
 *   Export: .milgeo.json | .kmz | .milxly
 */
import {
  useState,
  useCallback,
  useRef,
  useMemo,
  type ChangeEvent,
} from "react";
import { cn } from "@geolibre/ui";
import ms from "milsymbol";
import {
  Plus, Trash2, Eye, EyeOff, Pencil, Upload, Download,
  ChevronDown, ChevronRight, X, MapPin, Check, Tag,
} from "lucide-react";
import type { MapController } from "@geolibre/map";
import type { MilLayer, MilSymbolItem } from "@geolibre/core";
import { useMilLayerStore } from "../../hooks/useMilLayerStore";
import { useMapClick } from "../../hooks/useMapClick";
import { MilSymbolEditor, type MilSymbolPatch } from "./MilSymbolEditor";
import { OrbatPanel } from "./OrbatPanel";
import {
  CATEGORIES,
  filterCatalog,
  sidcWithAffiliation,
  type CatalogEntry,
} from "../../lib/milsymbol-catalog";
import { parseSidc, buildSidc, ECHELON_OPTIONS, getModifierSet, modifierOptions } from "../../lib/mil-sidc";
import { exportMilGeoJson, readMilGeoJsonFile } from "../../lib/mil-export-json";
import { exportMilGeoKmz } from "../../lib/mil-export-kmz";
import { exportMilGeoMilX } from "../../lib/mil-export-milx";
import { parseAnyMilFormatForStore } from "../../lib/milsymbol-import-to-store";
import { MILGEO_FORMAT_VERSION } from "@geolibre/core";
import type { MilAffiliation } from "@geolibre/core";

const MilSymbol = ms.Symbol;
const CATALOG_ICON = 32;
const LIST_ICON    = 22;

// ─── Types ────────────────────────────────────────────────────────────────────

type TabId = "layers" | "catalog" | "orbat";

interface MilLayerPanelProps {
  mapControllerRef: React.RefObject<MapController | null>;
}

// ─── Mini symbol preview ──────────────────────────────────────────────────────

function SymPreview({ sidc, size = LIST_ICON }: { sidc: string; size?: number }) {
  const svg = useMemo(() => {
    try {
      const sym = new MilSymbol(sidc, { size });
      const s = sym.asSVG();
      return s && s.length > 10 ? s : null;
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

// ─── LAYERS tab ───────────────────────────────────────────────────────────────

interface LayersTabProps {
  mapControllerRef: React.RefObject<MapController | null>;
}

function LayersTab({ mapControllerRef }: LayersTabProps) {
  const layers         = useMilLayerStore((s) => s.layers);
  const selectedLayerId = useMilLayerStore((s) => s.selectedLayerId);
  const addLayer       = useMilLayerStore((s) => s.addLayer);
  const removeLayer    = useMilLayerStore((s) => s.removeLayer);
  const updateLayer    = useMilLayerStore((s) => s.updateLayer);
  const selectLayer    = useMilLayerStore((s) => s.selectLayer);
  const removeSymbol   = useMilLayerStore((s) => s.removeSymbol);
  const updateSymbol   = useMilLayerStore((s) => s.updateSymbol);
  const editingSymbolId = useMilLayerStore((s) => s.editingSymbolId);
  const setEditingSymbol = useMilLayerStore((s) => s.setEditingSymbol);

  const [expandedLayerIds, setExpandedLayerIds] = useState<Set<string>>(new Set());
  const [renamingId, setRenamingId]   = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  function toggleLayer(id: string) {
    setExpandedLayerIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function startRename(layer: MilLayer) {
    setRenamingId(layer.id);
    setRenameValue(layer.name);
  }

  function commitRename(layerId: string) {
    if (renameValue.trim()) updateLayer(layerId, { name: renameValue.trim() });
    setRenamingId(null);
  }

  const editingSymbol = useMemo((): MilSymbolItem | null => {
    if (!editingSymbolId) return null;
    for (const l of layers) {
      const s = l.symbols.find((x) => x.id === editingSymbolId);
      if (s) return s;
    }
    return null;
  }, [editingSymbolId, layers]);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-3 py-2 border-b">
        <button
          className="flex items-center gap-1 px-2 h-6 rounded text-xs bg-primary text-primary-foreground hover:bg-primary/90"
          onClick={() => addLayer()}
        >
          <Plus size={11} /> Layer
        </button>
      </div>

      {/* Layer list */}
      <div className="flex-1 overflow-y-auto">
        {layers.length === 0 && (
          <div className="px-4 py-6 text-center text-xs text-muted-foreground">
            Nessun layer. Clicca "Layer" per crearne uno.
          </div>
        )}
        {layers.map((layer) => {
          const expanded = expandedLayerIds.has(layer.id);
          const isSelected = selectedLayerId === layer.id;
          return (
            <div key={layer.id}>
              {/* Layer row */}
              <div
                className={cn(
                  "flex items-center gap-1 px-2 py-1 cursor-pointer hover:bg-muted/60 group",
                  isSelected && "bg-muted"
                )}
                onClick={() => selectLayer(layer.id)}
              >
                <button onClick={(e) => { e.stopPropagation(); toggleLayer(layer.id); }} className="text-muted-foreground">
                  {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); updateLayer(layer.id, { visible: !layer.visible }); }}
                  className="text-muted-foreground"
                  title={layer.visible ? "Nascondi layer" : "Mostra layer"}
                >
                  {layer.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); updateLayer(layer.id, { showLabels: !layer.showLabels }); }}
                  className={cn("text-muted-foreground", layer.showLabels && "text-primary")}
                  title={layer.showLabels ? "Nascondi etichette" : "Mostra etichette"}
                >
                  <Tag size={13} />
                </button>
                {renamingId === layer.id ? (
                  <input
                    autoFocus
                    className="flex-1 h-5 text-xs border rounded px-1 bg-background"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => commitRename(layer.id)}
                    onKeyDown={(e) => { if (e.key === "Enter") commitRename(layer.id); if (e.key === "Escape") setRenamingId(null); }}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span className="flex-1 text-xs font-medium truncate">{layer.name}</span>
                )}
                <span className="text-[10px] text-muted-foreground">{layer.symbols.length}</span>
                <div className="hidden group-hover:flex gap-0.5">
                  <button onClick={(e) => { e.stopPropagation(); startRename(layer); }} className="p-0.5 rounded hover:bg-muted">
                    <Pencil size={11} />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); removeLayer(layer.id); }} className="p-0.5 rounded hover:bg-muted text-destructive">
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>

              {/* Symbol list */}
              {expanded && layer.symbols.map((sym) => (
                <div
                  key={sym.id}
                  className={cn("flex items-center gap-2 pl-8 pr-2 py-0.5 hover:bg-muted/40 group")}
                >
                  <SymPreview sidc={sym.sidc} size={LIST_ICON} />
                  <span className="flex-1 text-xs truncate">{sym.name || sym.uniqueDesignation || sym.sidc}</span>
                  <div className="hidden group-hover:flex gap-0.5">
                    <button onClick={() => setEditingSymbol(editingSymbolId === sym.id ? null : sym.id)} className="p-0.5 rounded hover:bg-muted">
                      <Pencil size={11} />
                    </button>
                    <button onClick={() => removeSymbol(sym.id)} className="p-0.5 rounded hover:bg-muted text-destructive">
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Symbol editor drawer */}
      {editingSymbol && (
        <div className="border-t bg-background max-h-[65%] overflow-y-auto">
          <MilSymbolEditor
            initial={editingSymbol}
            onSave={(patch) => {
              updateSymbol(editingSymbol.id, patch);
              setEditingSymbol(null);
            }}
            onCancel={() => setEditingSymbol(null)}
          />
        </div>
      )}
    </div>
  );
}

// ─── CATALOG tab ──────────────────────────────────────────────────────────────

interface CatalogTabProps {
  mapControllerRef: React.RefObject<MapController | null>;
}

function CatalogTab({ mapControllerRef }: CatalogTabProps) {
  const layers          = useMilLayerStore((s) => s.layers);
  const selectedLayerId = useMilLayerStore((s) => s.selectedLayerId);
  const addLayer        = useMilLayerStore((s) => s.addLayer);
  const addSymbol       = useMilLayerStore((s) => s.addSymbol);

  const [search,      setSearch]      = useState("");
  const [category,    setCategory]    = useState("All");
  const [affiliation, setAffiliation] = useState<MilAffiliation>("FRIENDLY");
  const [echelon,     setEchelon]     = useState("00");
  const [mod1,        setMod1]        = useState("00");
  const [mod2,        setMod2]        = useState("00");
  const [placingSidc, setPlacingSidc] = useState<string | null>(null);
  const [pendingEntry, setPendingEntry] = useState<CatalogEntry | null>(null);

  const filtered = useMemo(
    () => filterCatalog(search, category === "All" ? undefined : category),
    [search, category]
  );

  // Derive the active symbol set from the selected entry (or first visible entry)
  // to show the correct Modifier 1 / Modifier 2 options.
  const activeSymbolSet = useMemo(() => {
    if (pendingEntry) return parseSidc(pendingEntry.baseSidc).symbolSet;
    if (filtered.length > 0) return parseSidc(filtered[0].baseSidc).symbolSet;
    return "10";
  }, [pendingEntry, filtered]);

  const catalogMods = useMemo(() => getModifierSet(activeSymbolSet), [activeSymbolSet]);
  const mod1Options = useMemo(() => modifierOptions(catalogMods.m1), [catalogMods]);
  const mod2Options = useMemo(() => modifierOptions(catalogMods.m2), [catalogMods]);

  // Reset mods when symbol set changes so invalid codes are cleared.
  const prevSymbolSetRef = useRef(activeSymbolSet);
  if (prevSymbolSetRef.current !== activeSymbolSet) {
    prevSymbolSetRef.current = activeSymbolSet;
    if (!(mod1 in catalogMods.m1)) setMod1("00");
    if (!(mod2 in catalogMods.m2)) setMod2("00");
  }

  // Applies echelon + modifiers to the SIDC before placing.
  function applyEchelon(baseSidc: string): string {
    const p = parseSidc(baseSidc);
    return buildSidc({
      ...p,
      echelon:   echelon !== "00" ? echelon : p.echelon,
      modifier1: mod1    !== "00" ? mod1    : p.modifier1,
      modifier2: mod2    !== "00" ? mod2    : p.modifier2,
    });
  }

  const { enable: enableClick, disable: disableClick } = useMapClick(
    mapControllerRef,
    useCallback((lon, lat) => {
      if (!pendingEntry) return;
      const layerId =
        selectedLayerId ??
        (layers.length > 0 ? layers[0].id : addLayer("Layer 1").id);
      const finalLayerId = layerId ?? addLayer("Layer 1").id;
      const sidc = applyEchelon(sidcWithAffiliation(pendingEntry.baseSidc, affiliation));
      addSymbol(finalLayerId, {
        name: pendingEntry.name,
        sidc,
        lon,
        lat,
      });
      setPlacingSidc(null);
      setPendingEntry(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pendingEntry, selectedLayerId, layers, affiliation, echelon, mod1, mod2]),
    true,
  );

  function handleSelectEntry(entry: CatalogEntry) {
    setPendingEntry(entry);
    setPlacingSidc(entry.baseSidc);
    enableClick();
  }

  function cancelPlace() {
    setPendingEntry(null);
    setPlacingSidc(null);
    disableClick();
  }

  return (
    <div className="flex flex-col h-full">
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

      {/* Echelon + Modifier selectors */}
      <div className="px-3 pb-1 grid grid-cols-3 gap-1.5">
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
        {mod1Options.length > 1 ? (
          <label className="flex flex-col gap-0.5">
            <span className="text-[10px] font-medium text-muted-foreground">Mod 1</span>
            <select
              className="h-6 rounded border border-input bg-background px-1 text-xs focus:outline-none"
              value={mod1}
              onChange={(e) => setMod1(e.target.value)}
            >
              {mod1Options.map((o) => (
                <option key={o.code} value={o.code}>{o.code === "00" ? "—" : o.label}</option>
              ))}
            </select>
          </label>
        ) : <div />}
        {mod2Options.length > 1 ? (
          <label className="flex flex-col gap-0.5">
            <span className="text-[10px] font-medium text-muted-foreground">Mod 2</span>
            <select
              className="h-6 rounded border border-input bg-background px-1 text-xs focus:outline-none"
              value={mod2}
              onChange={(e) => setMod2(e.target.value)}
            >
              {mod2Options.map((o) => (
                <option key={o.code} value={o.code}>{o.code === "00" ? "—" : o.label}</option>
              ))}
            </select>
          </label>
        ) : <div />}
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
    </div>
  );
}

// ─── MAIN PANEL ───────────────────────────────────────────────────────────────

export function MilLayerPanel({ mapControllerRef }: MilLayerPanelProps) {
  const [tab, setTab] = useState<TabId>("layers");

  const exportDoc   = useMilLayerStore((s) => s.exportToMilGeoJson);
  const importDoc   = useMilLayerStore((s) => s.importFromMilGeoJson);
  const layers      = useMilLayerStore((s) => s.layers);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);

  async function handleImport(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    const sourceName = file.name.replace(/\..*$/, "");

    try {
      const text = await file.text();
      const nameLower = file.name.toLowerCase();

      // .milgeo.json → full project replace (existing behaviour)
      if (
        nameLower.endsWith(".milgeo.json") ||
        (!nameLower.endsWith(".orbat.json") &&
          !nameLower.endsWith(".milsymb.json") &&
          !nameLower.endsWith(".milxly") &&
          !nameLower.endsWith(".milx") &&
          (() => {
            try {
              const p = JSON.parse(text) as Record<string, unknown>;
              return p.version !== undefined && !("kadas_milsymb_version" in p) && !("units" in p);
            } catch { return false; }
          })())
      ) {
        const doc = await readMilGeoJsonFile(file);
        importDoc(doc);
        return;
      }

      // All other formats → parse + MERGE into current store
      let result;
      try {
        result = parseAnyMilFormatForStore(text, file.name, sourceName);
      } catch (e) {
        if (e instanceof Error && e.message === "__milgeo_json__") {
          // Detected as milgeo.json via content probe
          const doc = await readMilGeoJsonFile(file);
          importDoc(doc);
          return;
        }
        throw e;
      }

      // Merge: append new layers and orbat units to existing state
      const current = exportDoc();
      importDoc({
        version: MILGEO_FORMAT_VERSION,
        layers:  [...current.layers,       ...result.layers],
        orbat:   [...(current.orbat ?? []), ...result.orbat],
      });

      // After importing an ORBAT file switch to the ORBAT tab so the user
      // immediately sees the populated hierarchy.
      if (result.orbat.length > 0) setTab("orbat");
    } catch (err) {
      console.error("[MilLayerPanel] Import failed:", err);
      setImportError(err instanceof Error ? err.message : String(err));
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleExportKmz() {
    await exportMilGeoKmz(layers);
  }

  const tabCls = (t: TabId) =>
    cn(
      "flex-1 py-1.5 text-[11px] font-medium border-b-2 transition-colors",
      t === tab
        ? "border-primary text-primary"
        : "border-transparent text-muted-foreground hover:text-foreground"
    );

  return (
    <div className="flex flex-col h-full bg-background text-foreground text-sm">
      {/* Import/Export toolbar */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b bg-muted/20">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mr-1">MilSymb</span>

        <button
          title="Importa: .milgeo.json, .orbat.json, .milsymb.json, .milxly, .milx"
          className="flex items-center gap-1 px-1.5 h-6 rounded text-xs hover:bg-muted border border-input"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload size={11} /> Importa
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,.milgeo.json,.orbat.json,.milsymb.json,.milxly,.milx"
          className="hidden"
          onChange={handleImport}
        />
        {importError && (
          <span className="ml-1 text-[10px] text-destructive truncate max-w-[140px]" title={importError}>
            {importError}
          </span>
        )}

        <div className="ml-auto flex gap-1">
          <button
            title="Esporta .milgeo.json"
            className="flex items-center gap-1 px-1.5 h-6 rounded text-xs hover:bg-muted border border-input"
            onClick={() => exportMilGeoJson(exportDoc())}
          >
            <Download size={11} /> JSON
          </button>
          <button
            title="Esporta KMZ"
            className="flex items-center gap-1 px-1.5 h-6 rounded text-xs hover:bg-muted border border-input"
            onClick={handleExportKmz}
          >
            <Download size={11} /> KMZ
          </button>
          <button
            title="Esporta MILX"
            className="flex items-center gap-1 px-1.5 h-6 rounded text-xs hover:bg-muted border border-input"
            onClick={() => exportMilGeoMilX(layers)}
          >
            <Download size={11} /> MILX
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b">
        <button className={tabCls("layers")}  onClick={() => setTab("layers")}>Layer</button>
        <button className={tabCls("catalog")} onClick={() => setTab("catalog")}>Catalogo</button>
        <button className={tabCls("orbat")}   onClick={() => setTab("orbat")}>ORBAT</button>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {tab === "layers"  && <LayersTab  mapControllerRef={mapControllerRef} />}
        {tab === "catalog" && <CatalogTab mapControllerRef={mapControllerRef} />}
        {tab === "orbat"   && <OrbatPanel mapControllerRef={mapControllerRef} />}
      </div>
    </div>
  );
}
