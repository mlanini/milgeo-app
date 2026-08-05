/**
 * OrbatPanel.tsx
 * ORBAT (Order of Battle) hierarchy manager.
 *
 * Features:
 * – Tree view of OrbatUnit nodes (parent–child hierarchy)
 * – Inline milsymbol preview for each unit
 * – Add root / add child / rename / delete actions
 * – Edit unit SIDC via MilSymbolEditor
 * – "Place on map" button: switches to map-click mode and places symbol
 *
 * Layout: designed to be embedded inside MilLayerPanel as a tab.
 */
import { useState, useMemo, useCallback } from "react";
import maplibregl from "maplibre-gl";
import ms from "milsymbol";
import { cn } from "@geolibre/ui";
import { DEFAULT_LAYER_STYLE, useAppStore } from "@geolibre/core";
import type { MilAffiliation, OrbatUnit } from "@geolibre/core";
import { useMilLayerStore } from "../../hooks/useMilLayerStore";
import { MilSymbolEditor, type MilSymbolPatch } from "./MilSymbolEditor";
import {
  DEFAULT_MIL_SYMBOL_SIZE_PX,
  parseMilSymbolLayerSource,
  serializeMilSymbolLayerSource,
  type MilSymbolLayerItem,
} from "../../lib/milsymbol-layer-source";

import {
  ChevronRight,
  ChevronDown,
  Plus,
  Pencil,
  Trash2,
  MapPin,
  X,
} from "lucide-react";
import type { MapController } from "@geolibre/map";
import { parseSidc } from "../../lib/mil-sidc";

const MilSymbol = ms.Symbol;
const TREE_ICON = 24;

// ─── Props ────────────────────────────────────────────────────────────────────

interface OrbatPanelProps {
  mapControllerRef: React.RefObject<MapController | null>;
}

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

function buildUnitLayer(unit: OrbatUnit, lon: number, lat: number) {
  const symbol: MilSymbolLayerItem = {
    id: crypto.randomUUID(),
    name: unit.name,
    SIDC: unit.sidc,
    lon,
    lat,
    affiliation: affiliationFromSidc(unit.sidc),
    uniqueDesignation: unit.name,
  };

  return {
    id: crypto.randomUUID(),
    name: unit.name,
    type: "mil-symbol" as const,
    visible: true,
    opacity: 1,
    style: { ...DEFAULT_LAYER_STYLE },
    metadata: { milgeoManaged: true, orbatUnitId: unit.id },
    source: serializeMilSymbolLayerSource([symbol], DEFAULT_MIL_SYMBOL_SIZE_PX),
    createdSymbolId: symbol.id,
  };
}

// ─── Mini symbol preview for tree row ────────────────────────────────────────

function UnitIcon({ sidc }: { sidc: string }) {
  const svg = useMemo(() => {
    try {
      const sym = new MilSymbol(sidc, { size: TREE_ICON });
      if (!sym.isValid()) return null;
      return sym.asSVG();
    } catch { return null; }
  }, [sidc]);

  if (!svg) return <div className="w-6 h-6 rounded bg-muted flex-shrink-0" />;
  return (
    <div
      className="w-6 h-6 flex-shrink-0 overflow-hidden [&>svg]:w-full [&>svg]:h-full [&>svg]:block"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

// ─── Tree node ────────────────────────────────────────────────────────────────

interface TreeNodeProps {
  unit: OrbatUnit;
  children: OrbatUnit[];
  depth: number;
  editingId: string | null;
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onAddChild: (parentId: string) => void;
  onPlace: (id: string) => void;
}

function TreeNode({
  unit, children, depth, editingId, expandedIds,
  onToggle, onEdit, onDelete, onAddChild, onPlace,
}: TreeNodeProps) {
  const hasChildren = children.length > 0;
  const expanded = expandedIds.has(unit.id);

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-1 px-1 py-0.5 rounded hover:bg-muted/60 group select-none",
          editingId === unit.id && "bg-muted",
        )}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
      >
        {/* Expand toggle */}
        <button
          className="w-4 h-4 flex items-center justify-center text-muted-foreground flex-shrink-0"
          onClick={() => hasChildren && onToggle(unit.id)}
        >
          {hasChildren ? (
            expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />
          ) : (
            <span className="w-3 border-l border-muted-foreground/30 h-3" />
          )}
        </button>

        <UnitIcon sidc={unit.sidc} />

        <span className="flex-1 text-xs truncate leading-5">{unit.name}</span>

        {/* Actions (visible on hover) */}
        <div className="hidden group-hover:flex items-center gap-0.5">
          <button title="Aggiungi figlio" onClick={() => onAddChild(unit.id)} className="p-0.5 rounded hover:bg-muted">
            <Plus size={11} />
          </button>
          <button title="Modifica SIDC" onClick={() => onEdit(unit.id)} className="p-0.5 rounded hover:bg-muted">
            <Pencil size={11} />
          </button>
          <button title="Posiziona su mappa" onClick={() => onPlace(unit.id)} className="p-0.5 rounded hover:bg-muted text-blue-500">
            <MapPin size={11} />
          </button>
          <button title="Elimina" onClick={() => onDelete(unit.id)} className="p-0.5 rounded hover:bg-muted text-destructive">
            <Trash2 size={11} />
          </button>
        </div>
      </div>

      {/* Children */}
      {hasChildren && expanded &&
        children.map((child) => (
          <OrbatSubTree
            key={child.id}
            unitId={child.id}
            depth={depth + 1}
            editingId={editingId}
            expandedIds={expandedIds}
            onToggle={onToggle}
            onEdit={onEdit}
            onDelete={onDelete}
            onAddChild={onAddChild}
            onPlace={onPlace}
          />
        ))
      }
    </div>
  );
}

// Separate component to read children from store (avoids prop-drilling full list)
interface OrbatSubTreeProps {
  unitId: string;
  depth: number;
  editingId: string | null;
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onAddChild: (parentId: string) => void;
  onPlace: (id: string) => void;
}

function OrbatSubTree(props: OrbatSubTreeProps) {
  const orbatUnits = useMilLayerStore((s) => s.orbatUnits);
  const unit     = useMemo(() => orbatUnits.find((u) => u.id === props.unitId), [orbatUnits, props.unitId]);
  const children = useMemo(() => orbatUnits.filter((u) => u.parentId === props.unitId), [orbatUnits, props.unitId]);
  if (!unit) return null;
  return (
    <TreeNode
      unit={unit}
      children={children}
      depth={props.depth}
      editingId={props.editingId}
      expandedIds={props.expandedIds}
      onToggle={props.onToggle}
      onEdit={props.onEdit}
      onDelete={props.onDelete}
      onAddChild={props.onAddChild}
      onPlace={props.onPlace}
    />
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function OrbatPanel({ mapControllerRef }: OrbatPanelProps) {
  const orbatUnits   = useMilLayerStore((s) => s.orbatUnits);
  const addOrbatUnit = useMilLayerStore((s) => s.addOrbatUnit);
  const removeOrbatUnit = useMilLayerStore((s) => s.removeOrbatUnit);
  const updateOrbatUnit = useMilLayerStore((s) => s.updateOrbatUnit);
  const appLayers = useAppStore((s) => s.layers);
  const addLayer = useAppStore((s) => s.addLayer);
  const updateLayer = useAppStore((s) => s.updateLayer);

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [editingId,   setEditingId]   = useState<string | null>(null);
  const [placingId,   setPlacingId]   = useState<string | null>(null);

  const rootUnits = useMemo(
    () => orbatUnits.filter((u) => u.parentId === null),
    [orbatUnits]
  );

  const handleToggle = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const handleAddRoot = useCallback(() => {
    const unit = addOrbatUnit({
      name:     "Nuova unità",
      sidc:     "10031000000000000000",
      parentId: null,
    });
    setEditingId(unit.id);
    setExpandedIds((prev) => new Set([...prev]));
  }, [addOrbatUnit]);

  const handleAddChild = useCallback((parentId: string) => {
    const unit = addOrbatUnit({
      name:     "Nuova unità",
      sidc:     "10031000000000000000",
      parentId,
    });
    setEditingId(unit.id);
    setExpandedIds((prev) => new Set([...prev, parentId]));
  }, [addOrbatUnit]);

  const handleDelete = useCallback((id: string) => {
    if (editingId === id) setEditingId(null);
    removeOrbatUnit(id);
  }, [editingId, removeOrbatUnit]);

  const handleSaveEdit = useCallback((patch: MilSymbolPatch) => {
    if (!editingId) return;
    const currentUnit = orbatUnits.find((unit) => unit.id === editingId);
    const nextName = patch.name ?? currentUnit?.name ?? "Symbol";
    const nextSidc = patch.sidc ?? currentUnit?.sidc ?? "10031000000000000000";
    updateOrbatUnit(editingId, {
      name: nextName,
      sidc: nextSidc,
    });

    const linkedSymbolId = currentUnit?.symbolId;
    if (linkedSymbolId) {
      const linkedLayer = appLayers.find((layer) => {
        if (layer.type !== "mil-symbol") return false;
        return parseMilSymbolLayerSource(layer.source).symbols.some((symbol) => symbol.id === linkedSymbolId);
      });

      if (linkedLayer) {
        const parsed = parseMilSymbolLayerSource(linkedLayer.source);
        const symbols = parsed.symbols.map((symbol) =>
          symbol.id === linkedSymbolId
            ? {
                ...symbol,
                name: nextName,
                SIDC: nextSidc,
                affiliation: affiliationFromSidc(nextSidc),
                uniqueDesignation: nextName,
              }
            : symbol
        );

        updateLayer(linkedLayer.id, {
          source: serializeMilSymbolLayerSource(symbols, parsed.symbolSize),
        });
      }
    }

    setEditingId(null);
  }, [appLayers, editingId, orbatUnits, updateLayer, updateOrbatUnit]);

  // Place on map: register a one-shot map click
  const handlePlace = useCallback((unitId: string) => {
    const map = mapControllerRef.current?.getMap();
    if (!map) return;
    setPlacingId(unitId);
    const onClick = (e: maplibregl.MapMouseEvent) => {
      const { lng, lat } = e.lngLat;
      const unit = useMilLayerStore.getState().orbatUnits.find((item) => item.id === unitId);
      if (unit) {
        const appState = useAppStore.getState();
        const milSymbolLayers = appState.layers.filter((layer) => layer.type === "mil-symbol");
        const linkedLayer = unit.symbolId
          ? milSymbolLayers.find((layer) =>
              parseMilSymbolLayerSource(layer.source).symbols.some((symbol) => symbol.id === unit.symbolId)
            )
          : null;

        if (linkedLayer && unit.symbolId) {
          const parsed = parseMilSymbolLayerSource(linkedLayer.source);
          const symbols = parsed.symbols.map((symbol) =>
            symbol.id === unit.symbolId
              ? {
                  ...symbol,
                  name: unit.name,
                  SIDC: unit.sidc,
                  lon: lng,
                  lat,
                  affiliation: affiliationFromSidc(unit.sidc),
                  uniqueDesignation: unit.name,
                }
              : symbol
          );
          appState.updateLayer(linkedLayer.id, {
            source: serializeMilSymbolLayerSource(symbols, parsed.symbolSize),
          });
        } else {
          const preferredLayer = appState.selectedLayerId
            ? milSymbolLayers.find((layer) => layer.id === appState.selectedLayerId)
            : null;
          const targetLayer = preferredLayer
            ?? milSymbolLayers.find((layer) => layer.metadata.milgeoManaged === true)
            ?? milSymbolLayers[0]
            ?? null;

          const symbol: MilSymbolLayerItem = {
            id: crypto.randomUUID(),
            name: unit.name,
            SIDC: unit.sidc,
            lon: lng,
            lat,
            affiliation: affiliationFromSidc(unit.sidc),
            uniqueDesignation: unit.name,
          };

          if (!targetLayer) {
            const created = buildUnitLayer(unit, lng, lat);
            appState.addLayer({
              id: created.id,
              name: created.name,
              type: created.type,
              visible: created.visible,
              opacity: created.opacity,
              style: created.style,
              metadata: created.metadata,
              source: created.source,
            });
            useMilLayerStore.getState().updateOrbatUnit(unitId, {
              symbolId: created.createdSymbolId,
            });
          } else {
            const parsed = parseMilSymbolLayerSource(targetLayer.source);
            appState.updateLayer(targetLayer.id, {
              source: serializeMilSymbolLayerSource([...parsed.symbols, symbol], parsed.symbolSize),
            });
            useMilLayerStore.getState().updateOrbatUnit(unitId, { symbolId: symbol.id });
          }
        }
      }
      setPlacingId(null);
      map.off("click", onClick);
      map.getCanvas().style.cursor = "";
    };
    map.getCanvas().style.cursor = "crosshair";
    map.once("click", onClick);
  }, [mapControllerRef]);

  const editingUnit = editingId ? orbatUnits.find((u) => u.id === editingId) : null;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">ORBAT</span>
        <button
          className="flex items-center gap-1 px-2 h-6 rounded text-xs bg-primary text-primary-foreground hover:bg-primary/90"
          onClick={handleAddRoot}
        >
          <Plus size={11} /> Unità
        </button>
      </div>

      {placingId && (
        <div className="px-3 py-1.5 bg-blue-500/10 border-b border-blue-500/30 text-xs text-blue-700 dark:text-blue-300 flex items-center gap-2">
          <MapPin size={12} /> Clicca sulla mappa per posizionare…
          <button className="ml-auto" onClick={() => { setPlacingId(null); mapControllerRef.current?.getMap()?.getCanvas() && (mapControllerRef.current.getMap()!.getCanvas().style.cursor = ""); }}>
            <X size={12} />
          </button>
        </div>
      )}

      {/* Tree */}
      <div className="flex-1 overflow-y-auto py-1">
        {rootUnits.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-muted-foreground">
            Nessuna unità. Clicca "Unità" per aggiungere.
          </div>
        ) : (
          rootUnits.map((unit) => (
            <OrbatSubTree
              key={unit.id}
              unitId={unit.id}
              depth={0}
              editingId={editingId}
              expandedIds={expandedIds}
              onToggle={handleToggle}
              onEdit={(id) => setEditingId(editingId === id ? null : id)}
              onDelete={handleDelete}
              onAddChild={handleAddChild}
              onPlace={handlePlace}
            />
          ))
        )}
      </div>

      {/* Editor drawer */}
      {editingUnit && (
        <div className="border-t bg-background">
          <MilSymbolEditor
            initial={{ name: editingUnit.name, sidc: editingUnit.sidc }}
            onSave={handleSaveEdit}
            onCancel={() => setEditingId(null)}
          />
        </div>
      )}
    </div>
  );
}
