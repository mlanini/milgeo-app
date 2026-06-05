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
  },
  {
    baseSidc: "10031000110000000000",
    name: "Command & Control",
    category: "Command & Control",
    description: "Generic C2 unit",
  },
  {
    baseSidc: "10031000110200000000",
    name: "Civil Affairs",
    category: "Command & Control",
  },
  {
    baseSidc: "10031000110300000000",
    name: "Civil-Military Cooperation",
    category: "Command & Control",
  },
  {
    baseSidc: "10031000110400000000",
    name: "Information Operations",
    category: "Command & Control",
  },
  {
    baseSidc: "10031000111000000000",
    name: "Signal / Communications",
    category: "Command & Control",
    subcategory: "Communications",
  },
  {
    baseSidc: "10031000111400000000",
    name: "Special Troops",
    category: "Command & Control",
  },
  {
    baseSidc: "10031000111500000000",
    name: "Multi-Domain",
    category: "Command & Control",
  },

  // ── Land Maneuver (Land Unit, SymSet 10) ──────────────────────────────
  {
    baseSidc: "10031000120000000000",
    name: "Maneuver (generic)",
    category: "Land",
    subcategory: "Maneuver",
  },
  {
    baseSidc: "10031000121100000000",
    name: "Infantry",
    category: "Land",
    subcategory: "Maneuver",
  },
  {
    baseSidc: "10031000121102000000",
    name: "Armored Infantry",
    category: "Land",
    subcategory: "Maneuver",
  },
  {
    baseSidc: "10031000121104000000",
    name: "Motorized Infantry",
    category: "Land",
    subcategory: "Maneuver",
  },
  {
    baseSidc: "10031000120500000000",
    name: "Armor",
    category: "Land",
    subcategory: "Maneuver",
  },
  {
    baseSidc: "10031000121300000000",
    name: "Reconnaissance",
    category: "Land",
    subcategory: "Maneuver",
  },
  {
    baseSidc: "10031000121700000000",
    name: "Special Forces",
    category: "Land",
    subcategory: "Maneuver",
  },
  {
    baseSidc: "10031000121800000000",
    name: "Special Operations Forces",
    category: "Land",
    subcategory: "Maneuver",
  },
  {
    baseSidc: "10031000122000000000",
    name: "Ranger",
    category: "Land",
    subcategory: "Maneuver",
  },
  {
    baseSidc: "10031000121400000000",
    name: "Sea-Air-Land (SEAL)",
    category: "Land",
    subcategory: "Maneuver",
  },
  {
    baseSidc: "10031000120100000000",
    name: "Air Assault (organic lift)",
    category: "Land",
    subcategory: "Maneuver",
  },
  {
    baseSidc: "10031000120300000000",
    name: "Amphibious",
    category: "Land",
    subcategory: "Maneuver",
  },
  {
    baseSidc: "10031000120400000000",
    name: "Antitank / Antiarmour",
    category: "Land",
    subcategory: "Maneuver",
  },
  {
    baseSidc: "10031000120600000000",
    name: "Aviation Rotary Wing",
    category: "Land",
    subcategory: "Maneuver",
  },
  {
    baseSidc: "10031000120800000000",
    name: "Aviation Fixed Wing",
    category: "Land",
    subcategory: "Maneuver",
  },
  {
    baseSidc: "10031000121900000000",
    name: "Unmanned Systems",
    category: "Land",
    subcategory: "Maneuver",
  },
  {
    baseSidc: "10031000121000000000",
    name: "Combined Arms",
    category: "Land",
    subcategory: "Maneuver",
  },

  // ── Land Fires (Land Unit, SymSet 10) ────────────────────────────────
  {
    baseSidc: "10031000130000000000",
    name: "Fires (generic)",
    category: "Land",
    subcategory: "Fires",
  },
  {
    baseSidc: "10031000130100000000",
    name: "Air Defense",
    category: "Land",
    subcategory: "Fires",
  },
  {
    baseSidc: "10031000130300000000",
    name: "Field Artillery",
    category: "Land",
    subcategory: "Fires",
  },
  {
    baseSidc: "10031000130400000000",
    name: "Field Artillery Observer",
    category: "Land",
    subcategory: "Fires",
  },
  {
    baseSidc: "10031000130500000000",
    name: "Joint Fire Support",
    category: "Land",
    subcategory: "Fires",
  },
  {
    baseSidc: "10031000130700000000",
    name: "Missile",
    category: "Land",
    subcategory: "Fires",
  },
  {
    baseSidc: "10031000130800000000",
    name: "Mortar",
    category: "Land",
    subcategory: "Fires",
  },
  {
    baseSidc: "10031000130200000000",
    name: "Rocket Artillery",
    category: "Land",
    subcategory: "Fires",
  },

  // ── Land Combat Support ───────────────────────────────────────────────
  {
    baseSidc: "10031000140000000000",
    name: "Combat Support (generic)",
    category: "Land",
    subcategory: "Combat Support",
  },
  {
    baseSidc: "10031000140100000000",
    name: "CBRN",
    category: "Land",
    subcategory: "Combat Support",
  },
  {
    baseSidc: "10031000140700000000",
    name: "Engineer",
    category: "Land",
    subcategory: "Combat Support",
  },
  {
    baseSidc: "10031000140800000000",
    name: "EOD (Explosive Ordnance Disposal)",
    category: "Land",
    subcategory: "Combat Support",
  },
  {
    baseSidc: "10031000141200000000",
    name: "Military Police",
    category: "Land",
    subcategory: "Combat Support",
  },
  {
    baseSidc: "10031000141700000000",
    name: "Security",
    category: "Land",
    subcategory: "Combat Support",
  },

  // ── Land Intelligence ─────────────────────────────────────────────────
  {
    baseSidc: "10031000150000000000",
    name: "Intelligence (generic)",
    category: "Land",
    subcategory: "Intelligence",
  },
  {
    baseSidc: "10031000150500000000",
    name: "Electronic Warfare",
    category: "Land",
    subcategory: "Intelligence",
  },
  {
    baseSidc: "10031000151000000000",
    name: "Military Intelligence",
    category: "Land",
    subcategory: "Intelligence",
  },

  // ── Land CSS (Combat Service Support) ────────────────────────────────
  {
    baseSidc: "10031000160000000000",
    name: "Sustainment (generic)",
    category: "Land",
    subcategory: "CSS",
  },
  {
    baseSidc: "10031000160400000000",
    name: "Ammunition",
    category: "Land",
    subcategory: "CSS",
  },
  {
    baseSidc: "10031000161100000000",
    name: "Maintenance",
    category: "Land",
    subcategory: "CSS",
  },
  {
    baseSidc: "10031000161300000000",
    name: "Medical",
    category: "Land",
    subcategory: "CSS",
  },
  {
    baseSidc: "10031000161400000000",
    name: "Medical Treatment Facility",
    category: "Land",
    subcategory: "CSS",
  },
  {
    baseSidc: "10031000163400000000",
    name: "Supply",
    category: "Land",
    subcategory: "CSS",
  },
  {
    baseSidc: "10031000163600000000",
    name: "Transportation",
    category: "Land",
    subcategory: "CSS",
  },
  {
    baseSidc: "10031000162300000000",
    name: "Ordnance",
    category: "Land",
    subcategory: "CSS",
  },
  {
    baseSidc: "10031000162900000000",
    name: "Quartermaster",
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
    baseSidc: "10031500110900000000",
    name: "Howitzer",
    category: "Land Equipment",
    subcategory: "Artillery",
  },
  {
    baseSidc: "10031500111400000000",
    name: "Mortar",
    category: "Land Equipment",
    subcategory: "Artillery",
  },
  {
    baseSidc: "10031500111000000000",
    name: "Missile Launcher",
    category: "Land Equipment",
    subcategory: "Artillery",
  },
  {
    baseSidc: "10031500110500000000",
    name: "Air Defence Gun",
    category: "Land Equipment",
    subcategory: "Air Defense",
  },
  {
    baseSidc: "10031500110600000000",
    name: "Antitank Gun",
    category: "Land Equipment",
    subcategory: "Armor",
  },
  {
    baseSidc: "10031500110200000000",
    name: "Machine Gun",
    category: "Land Equipment",
    subcategory: "Weapons",
  },
  {
    baseSidc: "10031500110100000000",
    name: "Rifle",
    category: "Land Equipment",
    subcategory: "Weapons",
  },

  // ── Air (SymSet 01) ───────────────────────────────────────────────────
  {
    baseSidc: "10030100110000000000",
    name: "Military Aircraft (generic)",
    category: "Air",
  },
  {
    baseSidc: "10030100110100000000",
    name: "Fixed Wing",
    category: "Air",
    subcategory: "Fixed Wing",
  },
  {
    baseSidc: "10030100110102000000",
    name: "Attack / Strike",
    category: "Air",
    subcategory: "Fixed Wing",
  },
  {
    baseSidc: "10030100110103000000",
    name: "Bomber",
    category: "Air",
    subcategory: "Fixed Wing",
  },
  {
    baseSidc: "10030100110104000000",
    name: "Fighter",
    category: "Air",
    subcategory: "Fixed Wing",
  },
  {
    baseSidc: "10030100110107000000",
    name: "Cargo",
    category: "Air",
    subcategory: "Fixed Wing",
  },
  {
    baseSidc: "10030100110109000000",
    name: "Tanker",
    category: "Air",
    subcategory: "Fixed Wing",
  },
  {
    baseSidc: "10030100110111000000",
    name: "Reconnaissance",
    category: "Air",
    subcategory: "Fixed Wing",
  },
  {
    baseSidc: "10030100110116000000",
    name: "Airborne Early Warning",
    category: "Air",
    subcategory: "Fixed Wing",
  },
  {
    baseSidc: "10030100110126000000",
    name: "Special Operations",
    category: "Air",
    subcategory: "Fixed Wing",
  },
  {
    baseSidc: "10030100110200000000",
    name: "Rotary Wing (Helicopter)",
    category: "Air",
    subcategory: "Rotary Wing",
  },
  {
    baseSidc: "10030100110101000000",
    name: "Medical Evacuation",
    category: "Air",
    subcategory: "Rotary Wing",
  },
  {
    baseSidc: "10030100110300000000",
    name: "UAV / UAS",
    category: "Air",
    subcategory: "Unmanned",
  },
  {
    baseSidc: "10030100120000000000",
    name: "Civilian Aircraft (generic)",
    category: "Air",
    subcategory: "Civilian",
  },

  // ── Sea Surface (SymSet 30) ───────────────────────────────────────────
  {
    baseSidc: "10033000110000000000",
    name: "Military Vessel (generic)",
    category: "Maritime",
    subcategory: "Sea Surface",
  },
  {
    baseSidc: "10033000120000000000",
    name: "Combatant",
    category: "Maritime",
    subcategory: "Surface",
  },
  {
    baseSidc: "10033000120100000000",
    name: "Aircraft Carrier",
    category: "Maritime",
    subcategory: "Surface",
  },
  {
    baseSidc: "10033000120200000000",
    name: "Surface Combatant (Line)",
    category: "Maritime",
    subcategory: "Surface",
  },
  {
    baseSidc: "10033000120203000000",
    name: "Destroyer",
    category: "Maritime",
    subcategory: "Surface",
  },
  {
    baseSidc: "10033000120204000000",
    name: "Frigate",
    category: "Maritime",
    subcategory: "Surface",
  },
  {
    baseSidc: "10033000120300000000",
    name: "Amphibious Warfare Ship",
    category: "Maritime",
    subcategory: "Surface",
  },
  {
    baseSidc: "10033000120400000000",
    name: "Mine Warfare Vessel",
    category: "Maritime",
    subcategory: "Surface",
  },
  {
    baseSidc: "10033000120500000000",
    name: "Patrol Vessel",
    category: "Maritime",
    subcategory: "Surface",
  },
  {
    baseSidc: "10033000120700000000",
    name: "Unmanned Surface Vehicle",
    category: "Maritime",
    subcategory: "Surface",
  },
  {
    baseSidc: "10033000121000000000",
    name: "Navy Task Organization Unit",
    category: "Maritime",
    subcategory: "Surface",
  },

  // ── Sea Subsurface (SymSet 35) ────────────────────────────────────────
  {
    baseSidc: "10033500110000000000",
    name: "Submarine (military, generic)",
    category: "Maritime",
    subcategory: "Subsurface",
  },
  {
    baseSidc: "10033500110100000000",
    name: "Submarine",
    category: "Maritime",
    subcategory: "Subsurface",
  },
  {
    baseSidc: "10033500110500000000",
    name: "Diver (Military)",
    category: "Maritime",
    subcategory: "Subsurface",
  },

  // ── Activities (SymSet 40) ────────────────────────────────────────────
  {
    baseSidc: "10034000110000000000",
    name: "Activity (generic)",
    category: "Activities",
  },
  {
    baseSidc: "10034000110300000000",
    name: "IED",
    category: "Activities",
    subcategory: "Threat",
  },
  {
    baseSidc: "10034000110200000000",
    name: "Bomb",
    category: "Activities",
    subcategory: "Threat",
  },
  {
    baseSidc: "10034000110400000000",
    name: "Shooting",
    category: "Activities",
    subcategory: "Threat",
  },
  {
    baseSidc: "10034000110600000000",
    name: "Explosion",
    category: "Activities",
    subcategory: "Threat",
  },

  // ── Dismounted Individual (SymSet 80) ─────────────────────────────────
  {
    baseSidc: "10038000110000000000",
    name: "Dismounted Individual (generic)",
    category: "Dismounted",
  },
  {
    baseSidc: "10038000110101000000",
    name: "Dismounted Infantry",
    category: "Dismounted",
  },
  {
    baseSidc: "10038000110102000000",
    name: "Dismounted Medic",
    category: "Dismounted",
  },
  {
    baseSidc: "10038000110103000000",
    name: "Dismounted Reconnaissance",
    category: "Dismounted",
  },
  {
    baseSidc: "10038000110209000000",
    name: "Dismounted Sniper",
    category: "Dismounted",
  },
  {
    baseSidc: "10038000110210000000",
    name: "Dismounted Special Operations",
    category: "Dismounted",
  },
  {
    baseSidc: "10038000110206000000",
    name: "Dismounted Military Police",
    category: "Dismounted",
  },
  {
    baseSidc: "10038000110202000000",
    name: "Dismounted Fire Observer",
    category: "Dismounted",
  },
];

// --- Category helpers ---

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
      (e.description ?? '').toLowerCase().includes(q) ||
      (e.subcategory ?? '').toLowerCase().includes(q) ||
      e.baseSidc.includes(q);
    return matchesCategory && matchesQuery;
  });
}
