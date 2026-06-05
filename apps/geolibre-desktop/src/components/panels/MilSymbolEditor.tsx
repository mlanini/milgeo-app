/**
 * MilSymbolEditor.tsx
 * Compact editor for a single MilSymbolItem:
 *  – SIDC builder: Context / Identity / Symbol Set / Status / HQ-TF-Dummy /
 *    Echelon / Entity 6-digit code / Modifier 1 / Modifier 2
 *  – Text amplifiers: Unique Designation, Higher Formation, Staff Comments,
 *    Additional Info, DTG, Altitude/Depth, Direction, Quantity, Speed, Type,
 *    Reinforced/Reduced, Combat Effectiveness, Evaluation Rating
 *  – Live preview pane (milsymbol)
 *
 * The editor calls `onSave(patch)` when the user confirms.
 */
import { useState, useEffect, useMemo } from "react";
import ms from "milsymbol";
import { cn } from "@geolibre/ui";
import type { MilSymbolItem } from "@geolibre/core";
import {
  parseSidc,
  buildSidc,
  CONTEXT_OPTIONS,
  IDENTITY_OPTIONS,
  SYMBOL_SET_OPTIONS,
  STATUS_OPTIONS,
  HQTF_OPTIONS,
  ECHELON_OPTIONS,
  getModifierSet,
  type SidcOption,
} from "../../lib/mil-sidc";

const MilSymbol = ms.Symbol;
const PREVIEW_SIZE = 80;

// ─── Types ────────────────────────────────────────────────────────────────────

export type MilSymbolPatch = Partial<Omit<MilSymbolItem, "id" | "layerId">>;

interface MilSymbolEditorProps {
  /** Initial values. Supply at minimum { sidc }. */
  initial: MilSymbolPatch;
  /** Called with the edited patch when the user clicks Save. */
  onSave: (patch: MilSymbolPatch) => void;
  /** Optional cancel handler. */
  onCancel?: () => void;
  className?: string;
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function SelectField({
  label, value, options, onChange,
}: {
  label: string;
  value: string;
  options: SidcOption[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground font-medium">{label}</span>
      <select
        className="h-7 rounded border border-input bg-background px-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.code} value={o.code}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

function TextField({
  label, value, placeholder, onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground font-medium">{label}</span>
      <input
        type="text"
        className="h-7 rounded border border-input bg-background px-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function NumberField({
  label, value, placeholder, min, max, onChange,
}: {
  label: string;
  value: number | undefined;
  placeholder?: string;
  min?: number;
  max?: number;
  onChange: (v: number | undefined) => void;
}) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground font-medium">{label}</span>
      <input
        type="number"
        className="h-7 rounded border border-input bg-background px-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
        value={value ?? ""}
        placeholder={placeholder}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
      />
    </label>
  );
}

// ─── Live preview ─────────────────────────────────────────────────────────────

function SymbolPreview({ sidc, uniqueDesignation, higherFormation }: {
  sidc: string;
  uniqueDesignation?: string;
  higherFormation?: string;
}) {
  const svg = useMemo(() => {
    try {
      const sym = new MilSymbol(sidc, {
        size: PREVIEW_SIZE,
        uniqueDesignation,
        higherFormation,
        outlineColor: "white",
        outlineWidth: 6,
      });
      if (!sym.isValid()) return null;
      return sym.asSVG();
    } catch {
      return null;
    }
  }, [sidc, uniqueDesignation, higherFormation]);

  return (
    <div className="flex items-center justify-center w-full py-2">
      {svg ? (
        <div
          className="overflow-hidden [&>svg]:block"
          style={{ width: PREVIEW_SIZE + 40, height: PREVIEW_SIZE + 40 }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <div className="text-xs text-muted-foreground italic">Preview non disponibile</div>
      )}
    </div>
  );
}

// ─── Main editor ──────────────────────────────────────────────────────────────

export function MilSymbolEditor({ initial, onSave, onCancel, className }: MilSymbolEditorProps) {
  const initSidc = initial.sidc ?? "10031000000000000000";
  const parts = parseSidc(initSidc);

  // SIDC parts state
  const [context,   setContext]   = useState(parts.context);
  const [identity,  setIdentity]  = useState(parts.identity);
  const [symbolSet, setSymbolSet] = useState(parts.symbolSet);
  const [status,    setStatus]    = useState(parts.status);
  const [hqTf,      setHqTf]      = useState(parts.hqTfDummy);
  const [echelon,   setEchelon]   = useState(parts.echelon);
  const [entity,    setEntity]    = useState(parts.entity);
  const [mod1,      setMod1]      = useState(parts.modifier1);
  const [mod2,      setMod2]      = useState(parts.modifier2);

  // Amplifiers state
  const [name,                setName]                = useState(initial.name ?? "");
  const [uniqueDesignation,   setUniqueDesignation]   = useState(initial.uniqueDesignation ?? "");
  const [higherFormation,     setHigherFormation]     = useState(initial.higherFormation ?? "");
  const [staffComments,       setStaffComments]       = useState(initial.staffComments ?? "");
  const [additionalInfo,      setAdditionalInfo]      = useState(initial.additionalInformation ?? "");
  const [dtg,                 setDtg]                 = useState(initial.dtg ?? "");
  const [altitudeDepth,       setAltitudeDepth]       = useState(initial.altitudeDepth ?? "");
  const [direction,           setDirection]           = useState<number | undefined>(initial.direction);
  const [quantity,            setQuantity]            = useState(initial.quantity ?? "");
  const [speed,               setSpeed]               = useState(initial.speed ?? "");
  const [typeStr,             setTypeStr]             = useState(initial.typeStr ?? "");
  const [reinforcedReduced,   setReinforcedReduced]   = useState(initial.reinforcedReduced ?? "");
  const [combatEffectiveness, setCombatEffectiveness] = useState(initial.combatEffectiveness ?? "");
  const [evaluationRating,    setEvaluationRating]    = useState(initial.evaluationRating ?? "");

  // Active tab for amplifiers (SIDC | Amplifiers)
  const [tab, setTab] = useState<"sidc" | "amplifiers">("sidc");

  // Modifier options per symbol set
  const mods = useMemo(() => getModifierSet(symbolSet), [symbolSet]);
  const mod1Options: SidcOption[] = useMemo(
    () => Object.entries(mods.m1).map(([code, label]) => ({ code, label })),
    [mods]
  );
  const mod2Options: SidcOption[] = useMemo(
    () => Object.entries(mods.m2).map(([code, label]) => ({ code, label })),
    [mods]
  );

  // Reset mods when symbol set changes
  useEffect(() => {
    const newMods = getModifierSet(symbolSet);
    if (!(mod1 in newMods.m1)) setMod1("00");
    if (!(mod2 in newMods.m2)) setMod2("00");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbolSet]);

  const currentSidc = useMemo(() =>
    buildSidc({ context, identity, symbolSet, status, hqTfDummy: hqTf, echelon, entity, modifier1: mod1, modifier2: mod2 }),
    [context, identity, symbolSet, status, hqTf, echelon, entity, mod1, mod2]
  );

  function handleSave() {
    onSave({
      name: name || uniqueDesignation || "Symbol",
      sidc: currentSidc,
      uniqueDesignation:    uniqueDesignation   || undefined,
      higherFormation:      higherFormation     || undefined,
      staffComments:        staffComments       || undefined,
      additionalInformation: additionalInfo     || undefined,
      dtg:                  dtg                 || undefined,
      altitudeDepth:        altitudeDepth       || undefined,
      direction,
      quantity:             quantity            || undefined,
      speed:                speed               || undefined,
      typeStr:              typeStr             || undefined,
      reinforcedReduced:    reinforcedReduced   || undefined,
      combatEffectiveness:  combatEffectiveness || undefined,
      evaluationRating:     evaluationRating    || undefined,
    });
  }

  const tabCls = (t: typeof tab) =>
    cn("px-3 py-1.5 text-xs font-medium border-b-2 transition-colors",
      t === tab
        ? "border-primary text-primary"
        : "border-transparent text-muted-foreground hover:text-foreground"
    );

  return (
    <div className={cn("flex flex-col gap-0 bg-background text-foreground", className)}>
      {/* Preview */}
      <div className="border-b bg-muted/30 px-3">
        <SymbolPreview sidc={currentSidc} uniqueDesignation={uniqueDesignation} higherFormation={higherFormation} />
        <div className="pb-1 text-center font-mono text-[10px] text-muted-foreground">{currentSidc}</div>
      </div>

      {/* Tabs */}
      <div className="flex border-b">
        <button className={tabCls("sidc")} onClick={() => setTab("sidc")}>SIDC</button>
        <button className={tabCls("amplifiers")} onClick={() => setTab("amplifiers")}>Amplificatori</button>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5">
        {tab === "sidc" && (
          <>
            <TextField label="Nome simbolo" value={name} placeholder="es. 1° Battaglione" onChange={setName} />
            <SelectField label="Contesto"    value={context}   options={CONTEXT_OPTIONS}    onChange={setContext}   />
            <SelectField label="Identità"    value={identity}  options={IDENTITY_OPTIONS}   onChange={setIdentity}  />
            <SelectField label="Symbol Set"  value={symbolSet} options={SYMBOL_SET_OPTIONS} onChange={setSymbolSet} />
            <SelectField label="Status"      value={status}    options={STATUS_OPTIONS}      onChange={setStatus}    />
            <SelectField label="QG/TF/Dummy" value={hqTf}      options={HQTF_OPTIONS}       onChange={setHqTf}      />
            <SelectField label="Echelon"     value={echelon}   options={ECHELON_OPTIONS}     onChange={setEchelon}   />
            <TextField
              label="Codice entità (6 cifre)"
              value={entity}
              placeholder="000000"
              onChange={(v) => setEntity((v.replace(/\D/g, "") + "000000").slice(0, 6))}
            />
            {mod1Options.length > 1 && (
              <SelectField label="Modifier 1" value={mod1} options={mod1Options} onChange={setMod1} />
            )}
            {mod2Options.length > 1 && (
              <SelectField label="Modifier 2" value={mod2} options={mod2Options} onChange={setMod2} />
            )}
          </>
        )}

        {tab === "amplifiers" && (
          <>
            <TextField     label="Designazione unica (C2)" value={uniqueDesignation}   placeholder="es. 1-68 AR" onChange={setUniqueDesignation}  />
            <TextField     label="Formazione superiore (M)" value={higherFormation}    placeholder="es. 3 ID"     onChange={setHigherFormation}     />
            <TextField     label="Commenti di staff (G)"   value={staffComments}       placeholder=""             onChange={setStaffComments}        />
            <TextField     label="Info aggiuntive (H)"     value={additionalInfo}      placeholder=""             onChange={setAdditionalInfo}       />
            <TextField     label="DTG (W)"                 value={dtg}                 placeholder="DDHHMMSSZMONYYYY" onChange={setDtg}              />
            <TextField     label="Quota / Profondità (X)"  value={altitudeDepth}       placeholder="es. 2000m"    onChange={setAltitudeDepth}        />
            <NumberField   label="Direzione (Q) °"         value={direction}           min={0} max={360}          onChange={setDirection}            />
            <TextField     label="Quantità (C)"            value={quantity}            placeholder=""             onChange={setQuantity}             />
            <TextField     label="Velocità (Z)"            value={speed}               placeholder="es. 30 km/h"  onChange={setSpeed}                />
            <TextField     label="Tipo (T)"                value={typeStr}             placeholder=""             onChange={setTypeStr}              />
            <SelectField   label="Rinforzato / Ridotto (F)" value={reinforcedReduced}
              options={[
                { code: "", label: "–" },
                { code: "(+)", label: "Rinforzato (+)" },
                { code: "(-)", label: "Ridotto (–)" },
                { code: "(±)", label: "Rinforzato e ridotto (±)" },
              ]}
              onChange={setReinforcedReduced}
            />
            <TextField     label="Efficacia combattimento (AL)" value={combatEffectiveness} placeholder="" onChange={setCombatEffectiveness} />
            <TextField     label="Indice valutazione (AP)"      value={evaluationRating}    placeholder="" onChange={setEvaluationRating}    />
          </>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 border-t px-3 py-2">
        {onCancel && (
          <button
            className="flex-1 h-7 rounded text-xs border border-input hover:bg-muted transition-colors"
            onClick={onCancel}
          >
            Annulla
          </button>
        )}
        <button
          className="flex-1 h-7 rounded text-xs bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium"
          onClick={handleSave}
        >
          Salva
        </button>
      </div>
    </div>
  );
}
