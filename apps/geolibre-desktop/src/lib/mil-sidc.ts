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

import ms from "milsymbol";

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
  { code: "1", label: "Headquarters (HQ)" },
  { code: "2", label: "Task Force (TF)" },
  { code: "3", label: "Feint / Dummy" },
  { code: "4", label: "HQ + Task Force" },
  { code: "5", label: "HQ + Feint/Dummy" },
  { code: "6", label: "TF + Feint/Dummy" },
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
// The modifier code → label tables are derived AT RUNTIME from the milsymbol
// library itself, so they always match exactly what the installed milsymbol
// version can render (single source of truth: spatialillusions/milsymbol).
//
// milsymbol stores, per symbol set, builder functions in `ms._iconSIDC.number`.
// Each builder fills `sIdm1` / `sIdm2` maps (modifier code → icon reference).
// We invoke them with stub arguments and an `icn` proxy that returns the icon
// key string, then turn that key into a human-readable label.

export interface ModifierSet { m1: Record<string, string>; m2: Record<string, string>; }

const NONE_MODS: ModifierSet = {
  m1: { "00": "None" },
  m2: { "00": "None" },
};

interface MsInternal {
  _iconSIDC?: { number?: Array<(...args: unknown[]) => void> };
  _scale?: (...a: unknown[]) => unknown;
  _translate?: (...a: unknown[]) => unknown;
  _STD2525?: boolean;
}

const msInternal = ms as unknown as MsInternal;

/** Proxy that returns the requested property name — used as a stub `icn` table. */
const ICN_PROXY = new Proxy(
  {},
  { get: (_t, prop) => (typeof prop === "string" ? prop : "") },
) as Record<string, string>;

/** Acronyms that must stay upper-cased in generated labels. */
const ACRONYMS = new Set([
  "CBRN", "EOD", "RFID", "SOF", "NATO", "UAV", "MISO", "MSE", "SWAT", "CDR",
  "SIC", "HQ", "TF", "RHIB", "C2", "NBC", "CP", "MP", "EW", "AAA", "SAM",
]);

/** Connective words kept lower-case in the middle of a label. */
const MINOR_WORDS = new Set(["and", "or", "of", "the", "to", "for", "with"]);

/** Convert an ALL-CAPS milsymbol modifier name to a readable Title Case label. */
function titleCaseModifier(raw: string): string {
  return raw
    .split(" ")
    .map((word, i) => {
      if (!word) return word;
      const alnum = word.replace(/[^A-Za-z0-9]/g, "");
      const upper = alnum.toUpperCase();
      if (upper && ACRONYMS.has(upper)) return word.replace(alnum, upper);
      const lower = word.toLowerCase();
      if (i > 0 && MINOR_WORDS.has(lower)) return lower;
      // Capitalise the first letter of each sub-token (handles "/" and "-").
      return lower.replace(/(^|[/-])([a-z0-9])/g, (_m, sep, ch) => sep + ch.toUpperCase());
    })
    .join(" ");
}

/** Flatten a (possibly nested) icn-proxy value to the first string found. */
function firstString(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const v of value) {
      const s = firstString(v);
      if (s) return s;
    }
  }
  return null;
}

/**
 * Pick the best icon key from a sIdm entry and turn it into a label.
 * Prefers the key that carries the ".M1."/".M2." modifier segment.
 */
function iconKeyToLabel(value: unknown): string | null {
  // Gather all candidate strings.
  const candidates: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") candidates.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
  };
  walk(value);
  if (candidates.length === 0) return null;

  const modKey = candidates.find((c) => /\.M[12]\./.test(c)) ?? candidates[0];
  const seg = modKey.split(/\.M[12]\./);
  const name = seg.length > 1 ? seg[1] : modKey.slice(modKey.lastIndexOf(".") + 1);
  const cleaned = name.trim();
  return cleaned ? titleCaseModifier(cleaned) : null;
}

/** Memoised extraction results, keyed by symbol set. */
const MODIFIER_CACHE = new Map<string, ModifierSet>();

/**
 * Extract the modifier-1 / modifier-2 tables for a symbol set straight from
 * milsymbol. Falls back to a "None"-only set if the internals are unavailable.
 */
function extractModifierSet(symbolSet: string): ModifierSet {
  const m1: Record<string, string> = { "00": "None" };
  const m2: Record<string, string> = { "00": "None" };

  const builders = msInternal._iconSIDC?.number;
  if (!Array.isArray(builders)) return { m1, m2 };

  // The icon builders use ms._scale / ms._translate on real geometry; replace
  // them with pass-throughs so they tolerate our string-returning icn proxy.
  const origScale = msInternal._scale;
  const origTranslate = msInternal._translate;
  msInternal._scale = (_factor: unknown, instr: unknown) => instr;
  msInternal._translate = (_x: unknown, _y: unknown, instr: unknown) => instr;
  const std2525 = msInternal._STD2525 ?? false;

  try {
    for (const build of builders) {
      const sIdm1: Record<string, unknown> = {};
      const sIdm2: Record<string, unknown> = {};
      try {
        // Signature: (sId, sIdm1, sIdm2, bbox, symbolSet, icn, STD2525, edition)
        build.call(undefined, {}, sIdm1, sIdm2, {}, symbolSet, ICN_PROXY, std2525, "D");
      } catch {
        continue; // a builder for another symbol set / unexpected shape
      }
      for (const code in sIdm1) {
        if (code === "00") continue;
        const label = iconKeyToLabel(sIdm1[code]);
        if (label) m1[code] = label;
      }
      for (const code in sIdm2) {
        if (code === "00") continue;
        const label = iconKeyToLabel(sIdm2[code]);
        if (label) m2[code] = label;
      }
    }
  } finally {
    msInternal._scale = origScale;
    msInternal._translate = origTranslate;
  }

  return { m1, m2 };
}

export function getModifierSet(symbolSet: string): ModifierSet {
  const cached = MODIFIER_CACHE.get(symbolSet);
  if (cached) return cached;
  let result: ModifierSet;
  try {
    result = extractModifierSet(symbolSet);
  } catch {
    result = NONE_MODS;
  }
  MODIFIER_CACHE.set(symbolSet, result);
  return result;
}

/**
 * Turn a modifier record (code → label) into dropdown options sorted
 * alphabetically by label, with "None" (code "00") always pinned first.
 */
export function modifierOptions(record: Record<string, string>): SidcOption[] {
  const entries = Object.entries(record)
    .filter(([code]) => code !== "00")
    .map(([code, label]) => ({ code, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const none = record["00"] ?? "None";
  return [{ code: "00", label: none }, ...entries];
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
