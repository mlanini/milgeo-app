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
// Source: APP-6D Ed.4, Table A-V to A-XII (same as kadas-app6d-plugin _MOD_LABELS)

export interface ModifierSet { m1: Record<string, string>; m2: Record<string, string>; }

const NONE_MODS: ModifierSet = {
  m1: { "00": "None" },
  m2: { "00": "None" },
};

export const MODIFIER_LABELS: Record<string, ModifierSet> = {
  "01": { // Air
    m1: {
      "00": "None", "01": "Attack", "02": "Bomber", "03": "Cargo",
      "04": "Fighter", "05": "Interceptor", "06": "Tanker", "07": "Utility",
      "08": "VSTOL", "09": "Passenger", "10": "Ultra Light",
      "11": "Airborne Command Post", "12": "AEW", "13": "Government",
      "14": "Medevac", "15": "Escort", "16": "Jammer/ECM", "17": "Patrol",
      "18": "Reconnaissance", "19": "Trainer",
    },
    m2: {
      "00": "None", "01": "Airborne", "02": "Arctic", "03": "Fixed Wing",
      "04": "Multi-Rotor", "05": "Rotary Wing", "06": "VTOL",
      "07": "Tiltrotor", "08": "Unmanned", "09": "Lighter Than Air",
    },
  },
  "10": { // Land Unit
    m1: {
      "00": "None",
      "01": "Anti-armor/AT", "02": "Air Defense", "03": "Airborne", "04": "Aviation",
      "05": "Biological", "06": "Chemical", "07": "Combat Service Support",
      "08": "Combat Support", "09": "Civil Affairs", "10": "CBRN",
      "11": "Engineer", "12": "Field Artillery", "13": "Headquarters",
      "14": "Infantry", "15": "Maintenance", "16": "Medical",
      "17": "Military Intelligence", "18": "Military Police",
      "19": "Mortar", "20": "Nuclear", "21": "Psychological Operations",
      "22": "Reconnaissance", "23": "Signal", "24": "Special Operations",
      "25": "Transportation", "26": "Unmanned", "27": "Watercraft",
      "28": "Combat", "29": "CJTF", "30": "Fire Support",
    },
    m2: {
      "00": "None",
      "01": "Airborne", "02": "Arctic", "03": "Digital", "04": "Dismounted",
      "05": "Heavy", "06": "Light", "07": "Mechanized", "08": "Motorized",
      "09": "Mountain", "10": "Wheeled", "11": "Air Assault",
      "12": "Amphibious", "13": "Armored", "14": "Bicycle",
    },
  },
  "15": { // Land Equipment
    m1: {
      "00": "None",
      "01": "Air Defense", "02": "Ammunition", "03": "Bridge",
      "04": "Combat Engineer", "05": "Communication", "06": "Engineer",
      "07": "Fire Control", "08": "Launch", "09": "Medical",
      "10": "Missile", "11": "Radar", "12": "Rocket",
    },
    m2: {
      "00": "None",
      "01": "Airborne", "02": "Arctic", "03": "Armored", "04": "Armored Tracked",
      "05": "Armored Wheeled", "06": "Towed", "07": "Wheeled",
    },
  },
  "20": { // Land Installation
    m1: { "00": "None", "01": "Command Post", "02": "Communication", "03": "Maintenance" },
    m2: { "00": "None" },
  },
  "30": { // Sea Surface
    m1: {
      "00": "None", "01": "Amphibious", "02": "Carrier", "03": "Combatant",
      "04": "Medical", "05": "Mine Warfare", "06": "Patrol",
      "07": "Replenishment", "08": "Submarine", "09": "Support",
    },
    m2: { "00": "None", "01": "Auxiliary", "02": "Combat" },
  },
  "35": { // Sea Subsurface
    m1: {
      "00": "None", "01": "Attack", "02": "Ballistic Missile",
      "03": "Cruise Missile", "04": "Diesel", "05": "Nuclear",
    },
    m2: { "00": "None", "01": "Auxiliary" },
  },
  "40": { // Activities
    m1: { "00": "None", "01": "Air Activity", "02": "Land Activity", "03": "Sea Activity" },
    m2: { "00": "None" },
  },
};

export function getModifierSet(symbolSet: string): ModifierSet {
  return MODIFIER_LABELS[symbolSet] ?? NONE_MODS;
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
