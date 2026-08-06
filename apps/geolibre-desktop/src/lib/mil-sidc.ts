/**
 * mil-sidc.ts
 * Utilities for decomposing and assembling APP-6D 20-character number-based SIDCs.
 *
 * Structure (1-indexed positions):
 *  01-02  Version        "10"
 *  03     Context        0=Reality  1=Exercise  2=Simulation
 *  04     Identity       1=Unknown  2=AssumedFriend  3=Friend  4=Neutral  5=Suspect  6=Hostile
 *  05-06  Symbol set     10=LandUnit  11=LandCiv  15=LandEquip  20=LandInstall
 *                        01=Air  02=AirMissile  05=Space  06=SpaceMissile
 *                        30=SeaSurface  35=SeaSubsurface  36=MineSurface
 *                        25=ControlMeasure  40=Activities
 *  07     Status         0=Present  1=Anticipated  2=FullyCapable  3=Damaged
 *                        4=Destroyed  5=FullToCapacity
 *  08     HQ/TF/Dummy    0=None  1=HQ  2=TF  3=Dummy  4=HQTF  5=HQDummy  6=TFDummy  7=All
 *  09-10  Echelon        00=None  11=Team  12=Squad  13=Section  14=Platoon  15=Company
 *                        16=Battalion  17=Regiment  18=Brigade  19=Division  20=Corps
 *                        21=Army  22=ArmyGroup  23=Region  24=Command
 *  11-16  Entity code    6-digit code (symbol-set specific)
 *  17-18  Modifier 1     2-digit code (symbol-set specific)
 *  19-20  Modifier 2     2-digit code (symbol-set specific)
 */

import modifierLabelsData from "./milsymbol-modifier-labels.json";

export const SIDC_BLANK = "10031000000000000000";

// ─── Decompose ────────────────────────────────────────────────────────────────

export interface SidcParts {
  version:    string;  // 2 chars "10"
  context:    string;  // 1 char
  identity:   string;  // 1 char
  symbolSet:  string;  // 2 chars
  status:     string;  // 1 char
  hqTfDummy:  string;  // 1 char
  echelon:    string;  // 2 chars
  entity:     string;  // 6 chars
  modifier1:  string;  // 2 chars
  modifier2:  string;  // 2 chars
}

export function parseSidc(sidc: string): SidcParts {
  const s = (sidc + "0".repeat(20)).slice(0, 20);
  return {
    version:   s.slice(0, 2),
    context:   s.slice(2, 3),
    identity:  s.slice(3, 4),
    symbolSet: s.slice(4, 6),
    status:    s.slice(6, 7),
    hqTfDummy: s.slice(7, 8),
    echelon:   s.slice(8, 10),
    entity:    s.slice(10, 16),
    modifier1: s.slice(16, 18),
    modifier2: s.slice(18, 20),
  };
}

export function buildSidc(p: Partial<SidcParts>): string {
  const d = parseSidc(SIDC_BLANK);
  const m = { ...d, ...p };
  return (
    m.version +
    m.context +
    m.identity +
    m.symbolSet +
    m.status +
    m.hqTfDummy +
    m.echelon +
    m.entity +
    m.modifier1 +
    m.modifier2
  );
}

// ─── Lookup tables ─────────────────────────────────────────────────────────────

export interface SidcOption { code: string; label: string; }

export const IDENTITY_OPTIONS: SidcOption[] = [
  { code: "0", label: "Pending" },
  { code: "1", label: "Unknown" },
  { code: "2", label: "Assumed Friend" },
  { code: "3", label: "Friend" },
  { code: "4", label: "Neutral" },
  { code: "5", label: "Suspect" },
  { code: "6", label: "Hostile" },
];

export const CONTEXT_OPTIONS: SidcOption[] = [
  { code: "0", label: "Reality" },
  { code: "1", label: "Exercise" },
  { code: "2", label: "Simulation" },
];

export const SYMBOL_SET_OPTIONS: SidcOption[] = [
  { code: "01", label: "Air" },
  { code: "02", label: "Air Missile" },
  { code: "05", label: "Space" },
  { code: "06", label: "Space Missile" },
  { code: "10", label: "Land Unit" },
  { code: "11", label: "Land Civilian Org" },
  { code: "15", label: "Land Equipment" },
  { code: "20", label: "Land Installation" },
  { code: "25", label: "Control Measure" },
  { code: "30", label: "Sea Surface" },
  { code: "35", label: "Sea Subsurface" },
  { code: "36", label: "Mine Countermeasure" },
  { code: "40", label: "Activities" },
];

export const STATUS_OPTIONS: SidcOption[] = [
  { code: "0", label: "Present" },
  { code: "1", label: "Anticipated / Planned" },
  { code: "2", label: "Fully Capable" },
  { code: "3", label: "Damaged" },
  { code: "4", label: "Destroyed" },
  { code: "5", label: "Full to Capacity" },
];

export const HQTF_OPTIONS: SidcOption[] = [
  { code: "0", label: "None" },
  { code: "1", label: "Feint / Dummy" },
  { code: "2", label: "Headquarters (HQ)" },
  { code: "3", label: "HQ + Feint/Dummy" },
  { code: "4", label: "Task Force (TF)" },
  { code: "5", label: "TF + Feint/Dummy" },
  { code: "6", label: "HQ + Task Force" },
  { code: "7", label: "HQ + TF + Feint/Dummy" },
];

export const ECHELON_OPTIONS: SidcOption[] = [
  { code: "00", label: "None" },
  { code: "11", label: "Team / Crew" },
  { code: "12", label: "Squad" },
  { code: "13", label: "Section" },
  { code: "14", label: "Platoon / Detachment" },
  { code: "15", label: "Company / Battery / Troop" },
  { code: "16", label: "Battalion / Squadron" },
  { code: "17", label: "Regiment / Group" },
  { code: "18", label: "Brigade" },
  { code: "19", label: "Division" },
  { code: "20", label: "Corps / MEF" },
  { code: "21", label: "Army" },
  { code: "22", label: "Army Group / Front" },
  { code: "23", label: "Region / Theater" },
  { code: "24", label: "Command" },
];

// ─── Modifier labels by symbol set ────────────────────────────────────────────
// Source: extracted from the installed milsymbol APP-6D data tables.

export interface ModifierSet { m1: Record<string, string>; m2: Record<string, string>; }

const NONE_MODS: ModifierSet = {
  m1: { "00": "None" },
  m2: { "00": "None" },
};

export const MODIFIER_LABELS: Record<string, ModifierSet> = modifierLabelsData as Record<string, ModifierSet>;

const normalizedModifierCache: Record<string, ModifierSet> = {};

function normalizeModifierLabel(label: string): string {
  return label
    .replace(/^.*\.M[12]\./, "")
    .replace(/^[A-Z]{2}\.[A-Z]{2}\.[A-Z]{2}\./, "")
    .replace(/\s*\/\s*/g, " / ")
    .replace(/\./g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeModifierSet(set: ModifierSet): ModifierSet {
  const m1 = Object.fromEntries(
    Object.entries(set.m1).map(([code, label]) => [code, normalizeModifierLabel(String(label))])
  );
  const m2 = Object.fromEntries(
    Object.entries(set.m2).map(([code, label]) => [code, normalizeModifierLabel(String(label))])
  );
  return { m1, m2 };
}

export function getModifierSet(symbolSet: string): ModifierSet {
  if (!MODIFIER_LABELS[symbolSet]) return NONE_MODS;
  if (!normalizedModifierCache[symbolSet]) {
    normalizedModifierCache[symbolSet] = normalizeModifierSet(MODIFIER_LABELS[symbolSet]);
  }
  return normalizedModifierCache[symbolSet];
}

// ─── Label helpers ────────────────────────────────────────────────────────────

export function identityLabel(code: string): string {
  return IDENTITY_OPTIONS.find((o) => o.code === code)?.label ?? code;
}

export function symbolSetLabel(code: string): string {
  return SYMBOL_SET_OPTIONS.find((o) => o.code === code)?.label ?? code;
}

export function echelonLabel(code: string): string {
  return ECHELON_OPTIONS.find((o) => o.code === code)?.label ?? code;
}
