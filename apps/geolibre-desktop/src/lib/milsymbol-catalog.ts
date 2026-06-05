// ─── APP-6D / MIL-STD-2525D Symbol Catalog ───────────────────────────────────
//
// 20-character Number-based SIDC (APP-6D Ed. 4 / MIL-STD-2525D):
//   Chars  1-2 : Version "10"
//   Char   3   : Context  0=Reality  1=Exercise
//   Char   4   : Affiliation  1=Unknown  3=Friend  4=Neutral  6=Hostile
//   Chars  5-6 : Symbol set  10=LandUnit  15=LandEquip  20=LandInstall
//                             01=Air  30=SeaSurface  35=SeaSubsurface
//                             25=ControlMeasure  40=Activities
//   Char   7   : Status       0=Present  1=Anticipated
//   Chars  8-9 : HQ/TF/Dummy  00=None  11=HQ  12=TF
//   Chars 10-15: Entity code (6 digits)
//   Chars 16-17: Modifier 1
//   Chars 18-19: Modifier 2
//   Char   20  : Reserved "0"
//
// Base SIDCs use affiliation "3" (Friend) – call sidcWithAffiliation() to swap.

import type { MilAffiliation } from "@geolibre/core";
export type { MilAffiliation };

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CatalogEntry {
  /** 20-character APP-6D SIDC (friendly affiliation, context Reality). */
  baseSidc: string;
  name: string;
  category: string;
  subcategory?: string;
  description?: string;
}

// ─── Affiliation helpers ──────────────────────────────────────────────────────

/** Single-character APP-6D affiliation codes (char at SIDC index 3). */
const AFF_CHAR: Record<MilAffiliation, string> = {
  FRIENDLY: "3",
  HOSTILE: "6",
  NEUTRAL: "4",
  UNKNOWN: "1",
};

/**
 * Returns a new SIDC with the affiliation substituted at position 4 (index 3).
 * Works correctly for any 20-character number-based APP-6D SIDC.
 */
export function sidcWithAffiliation(baseSidc: string, aff: MilAffiliation): string {
  return baseSidc.slice(0, 3) + AFF_CHAR[aff] + baseSidc.slice(4);
}

// ─── Catalog ─────────────────────────────────────────────────────────────────
// Entity codes sourced from APP-6D Ed. 4 as implemented by milsymbol 3.x.
// All SIDCs are friendly (char 4 = "3"), context Reality (char 3 = "0").

export const SYMBOL_CATALOG: CatalogEntry[] = [

  // ── Command & Control (Land Unit, SymSet 10) ──────────────────────────
  {
    baseSidc: "10031000000000000000",
    name: "Unit (generic)",
    category: "Command & Control",
    description: "Generic military unit",
  },
  {
    baseSidc: "10031011000000000000",
    name: "Headquarters",
    category: "Command & Control",
    subcategory: "HQ",
    description: "Unit headquarters",
  },
  {
    baseSidc: "10031000110000000000",
    name: "Command Post",
    category: "Command & Control",
    subcategory: "HQ",
  },
  {
    baseSidc: "10031000160000000000",
    name: "Civil-Military Cooperation",
    category: "Command & Control",
    subcategory: "Civil Affairs",
  },
  {
    baseSidc: "10031000170000000000",
    name: "Public Affairs",
    category: "Command & Control",
    subcategory: "Civil Affairs",
  },

  // ── Land Maneuver (Land Unit, SymSet 10) ──────────────────────────────
  {
    baseSidc: "10031000141200000000",
    name: "Infantry",
    category: "Land",
    subcategory: "Maneuver",
    description: "Infantry unit",
  },
  {
    baseSidc: "10031000140000000000",
    name: "Armor",
    category: "Land",
    subcategory: "Maneuver",
    description: "Armored / tank unit",
  },
  {
    baseSidc: "10031000120000000000",
    name: "Mechanized Infantry",
    category: "Land",
    subcategory: "Maneuver",
  },
  {
    baseSidc: "10031000130000000000",
    name: "Motorized Infantry",
    category: "Land",
    subcategory: "Maneuver",
  },
  {
    baseSidc: "10031000161200000000",
    name: "Airborne Infantry",
    category: "Land",
    subcategory: "Maneuver",
  },
  {
    baseSidc: "10031000171200000000",
    name: "Air Assault Infantry",
    category: "Land",
    subcategory: "Maneuver",
  },
  {
    baseSidc: "10031000181200000000",
    name: "Special Forces",
    category: "Land",
    subcategory: "Maneuver",
  },
  {
    baseSidc: "10031000190000000000",
    name: "Reconnaissance",
    category: "Land",
    subcategory: "Maneuver",
  },
  {
    baseSidc: "10031000200000000000",
    name: "Ranger",
    category: "Land",
    subcategory: "Maneuver",
  },
  {
    baseSidc: "10031000210000000000",
    name: "Mountain Infantry",
    category: "Land",
    subcategory: "Maneuver",
  },
  {
    baseSidc: "10031000220000000000",
    name: "Marine",
    category: "Land",
    subcategory: "Maneuver",
  },

  // ── Land Fires (Land Unit, SymSet 10) ────────────────────────────────
  {
    baseSidc: "10031000211200000000",
    name: "Field Artillery",
    category: "Land",
    subcategory: "Fires",
  },
  {
    baseSidc: "10031000212000000000",
    name: "Rocket Artillery",
    category: "Land",
    subcategory: "Fires",
  },
  {
    baseSidc: "10031000220000000000",
    name: "Air Defense",
    category: "Land",
    subcategory: "Fires",
  },
  {
    baseSidc: "10031000230000000000",
    name: "Missile (surface-to-surface)",
    category: "Land",
    subcategory: "Fires",
  },

  // ── Land Combat Support ───────────────────────────────────────────────
  {
    baseSidc: "10031000310000000000",
    name: "Engineer",
    category: "Land",
    subcategory: "Combat Support",
  },
  {
    baseSidc: "10031000320000000000",
    name: "CBRN",
    category: "Land",
    subcategory: "Combat Support",
  },
  {
    baseSidc: "10031000330000000000",
    name: "Signal / Communications",
    category: "Land",
    subcategory: "Combat Support",
  },
  {
    baseSidc: "10031000340000000000",
    name: "Intelligence",
    category: "Land",
    subcategory: "Combat Support",
  },
  {
    baseSidc: "10031000350000000000",
    name: "Electronic Warfare",
    category: "Land",
    subcategory: "Combat Support",
  },
  {
    baseSidc: "10031000360000000000",
    name: "Civil Affairs",
    category: "Land",
    subcategory: "Combat Support",
  },
  {
    baseSidc: "10031000370000000000",
    name: "Psychological Operations",
    category: "Land",
    subcategory: "Combat Support",
  },
  {
    baseSidc: "10031000380000000000",
    name: "Information Operations",
    category: "Land",
    subcategory: "Combat Support",
  },

  // ── Land CSS (Combat Service Support) ────────────────────────────────
  {
    baseSidc: "10031000411200000000",
    name: "Logistics",
    category: "Land",
    subcategory: "CSS",
  },
  {
    baseSidc: "10031000420000000000",
    name: "Medical",
    category: "Land",
    subcategory: "CSS",
  },
  {
    baseSidc: "10031000430000000000",
    name: "Supply",
    category: "Land",
    subcategory: "CSS",
  },
  {
    baseSidc: "10031000440000000000",
    name: "Transportation",
    category: "Land",
    subcategory: "CSS",
  },
  {
    baseSidc: "10031000450000000000",
    name: "Maintenance",
    category: "Land",
    subcategory: "CSS",
  },
  {
    baseSidc: "10031000460000000000",
    name: "Ordnance",
    category: "Land",
    subcategory: "CSS",
  },
  {
    baseSidc: "10031000470000000000",
    name: "Military Police",
    category: "Land",
    subcategory: "CSS",
  },

  // ── Land Equipment (SymSet 15) ────────────────────────────────────────
  {
    baseSidc: "10031500000000000000",
    name: "Equipment (generic)",
    category: "Land Equipment",
  },
  {
    baseSidc: "10031500110000000000",
    name: "Tank",
    category: "Land Equipment",
    subcategory: "Armored Vehicle",
  },
  {
    baseSidc: "10031500120000000000",
    name: "Armored Personnel Carrier",
    category: "Land Equipment",
    subcategory: "Armored Vehicle",
  },
  {
    baseSidc: "10031500130000000000",
    name: "Infantry Fighting Vehicle",
    category: "Land Equipment",
    subcategory: "Armored Vehicle",
  },
  {
    baseSidc: "10031500210000000000",
    name: "Field Gun / Howitzer",
    category: "Land Equipment",
    subcategory: "Artillery",
  },
  {
    baseSidc: "10031500220000000000",
    name: "Multiple Rocket Launcher",
    category: "Land Equipment",
    subcategory: "Artillery",
  },
  {
    baseSidc: "10031500310000000000",
    name: "SAM System",
    category: "Land Equipment",
    subcategory: "Air Defense",
  },

  // ── Air (SymSet 01) ───────────────────────────────────────────────────
  {
    baseSidc: "10030100000000000000",
    name: "Aircraft (generic)",
    category: "Air",
  },
  {
    baseSidc: "10030100110000000000",
    name: "Fixed Wing",
    category: "Air",
    subcategory: "Fixed Wing",
  },
  {
    baseSidc: "10030100120000000000",
    name: "Rotary Wing (Helicopter)",
    category: "Air",
    subcategory: "Rotary Wing",
  },
  {
    baseSidc: "10030100130000000000",
    name: "UAV / UAS",
    category: "Air",
    subcategory: "Unmanned",
  },
  {
    baseSidc: "10030100141000000000",
    name: "Attack Helicopter",
    category: "Air",
    subcategory: "Rotary Wing",
  },
  {
    baseSidc: "10030100150000000000",
    name: "Airborne Early Warning",
    category: "Air",
    subcategory: "Fixed Wing",
  },
  {
    baseSidc: "10030100160000000000",
    name: "Tanker Aircraft",
    category: "Air",
    subcategory: "Fixed Wing",
  },

  // ── Sea Surface (SymSet 30) ───────────────────────────────────────────
  {
    baseSidc: "10033000000000000000",
    name: "Vessel (generic)",
    category: "Maritime",
    subcategory: "Sea Surface",
  },
  {
    baseSidc: "10033000110000000000",
    name: "Combatant",
    category: "Maritime",
    subcategory: "Surface",
  },
  {
    baseSidc: "10033000120000000000",
    name: "Patrol Vessel",
    category: "Maritime",
    subcategory: "Surface",
  },
  {
    baseSidc: "10033000130000000000",
    name: "Amphibious Vessel",
    category: "Maritime",
    subcategory: "Surface",
  },
  {
    baseSidc: "10033000140000000000",
    name: "Mine Countermeasure Vessel",
    category: "Maritime",
    subcategory: "Surface",
  },
  {
    baseSidc: "10033000210000000000",
    name: "Aircraft Carrier",
    category: "Maritime",
    subcategory: "Surface",
  },

  // ── Sea Subsurface (SymSet 35) ────────────────────────────────────────
  {
    baseSidc: "10033500000000000000",
    name: "Submarine (generic)",
    category: "Maritime",
    subcategory: "Subsurface",
  },
  {
    baseSidc: "10033500110000000000",
    name: "Attack Submarine (SSN)",
    category: "Maritime",
    subcategory: "Subsurface",
  },
  {
    baseSidc: "10033500120000000000",
    name: "Ballistic Missile Submarine (SSBN)",
    category: "Maritime",
    subcategory: "Subsurface",
  },

  // ── Activities (SymSet 40) ────────────────────────────────────────────
  {
    baseSidc: "10034000000000000000",
    name: "Activity (generic)",
    category: "Activities",
  },
  {
    baseSidc: "10034000110000000000",
    name: "Checkpoint",
    category: "Activities",
    subcategory: "Control",
  },
  {
    baseSidc: "10034000120000000000",
    name: "Observation Post / Listening Post",
    category: "Activities",
    subcategory: "Observation",
  },
  {
    baseSidc: "10034000130000000000",
    name: "Sniper",
    category: "Activities",
    subcategory: "Observation",
  },

  // ── Dismounted Individual (SymSet 80) ─────────────────────────────────
  {
    baseSidc: "10038000000000000000",
    name: "Dismounted Individual",
    category: "Dismounted",
  },
  {
    baseSidc: "10038000110000000000",
    name: "Dismounted Leader",
    category: "Dismounted",
    subcategory: "Leader",
  },
  {
    baseSidc: "10038000120000000000",
    name: "Dismounted Rifleman",
    category: "Dismounted",
  },
  {
    baseSidc: "10038000130000000000",
    name: "Dismounted Medic",
    category: "Dismounted",
  },
];

// ─── Category helpers ─────────────────────────────────────────────────────────

/** All unique categories in the catalog (insertion order). */
export const CATEGORIES = [...new Set(SYMBOL_CATALOG.map((e) => e.category))];

/** Filter catalog entries by text query and optionally category. */
export function filterCatalog(query: string, category?: string): CatalogEntry[] {
  const q = query.trim().toLowerCase();
  return SYMBOL_CATALOG.filter((e) => {
    const matchesCategory = !category || e.category === category;
    const matchesQuery =
      !q ||
      e.name.toLowerCase().includes(q) ||
      (e.description ?? "").toLowerCase().includes(q) ||
      (e.subcategory ?? "").toLowerCase().includes(q) ||
      e.baseSidc.includes(q);
    return matchesCategory && matchesQuery;
  });
}
