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
    baseSidc: "10031000001100000000",
    name: "Command & Control",
    category: "Command & Control",
    description: "Generic C2 unit",
  },
  {
    baseSidc: "10031000001102000000",
    name: "Civil Affairs",
    category: "Command & Control",
  },
  {
    baseSidc: "10031000001103000000",
    name: "Civil-Military Cooperation",
    category: "Command & Control",
  },
  {
    baseSidc: "10031000001104000000",
    name: "Information Operations",
    category: "Command & Control",
  },
  {
    baseSidc: "10031000001110000000",
    name: "Signal / Communications",
    category: "Command & Control",
    subcategory: "Communications",
  },
  {
    baseSidc: "10031000001114000000",
    name: "Special Troops",
    category: "Command & Control",
  },
  {
    baseSidc: "10031000001115000000",
    name: "Multi-Domain",
    category: "Command & Control",
  },

  // ── Land Maneuver (Land Unit, SymSet 10) ──────────────────────────────
  {
    baseSidc: "10031000001200000000",
    name: "Maneuver (generic)",
    category: "Land",
    subcategory: "Maneuver",
  },
  {
    baseSidc: "10031000001211000000",
    name: "Infantry",
    category: "Land",
    subcategory: "Maneuver",
  },
  {
    baseSidc: "10031000001211020000",
    name: "Armored Infantry",
    category: "Land",
    subcategory: "Maneuver",
  },
  {
    baseSidc: "10031000001211040000",
    name: "Motorized Infantry",
    category: "Land",
    subcategory: "Maneuver",
  },
  {
    baseSidc: "10031000001205000000",
    name: "Armor",
    category: "Land",
    subcategory: "Maneuver",
  },
  {
    baseSidc: "10031000001213000000",
    name: "Reconnaissance",
    category: "Land",
    subcategory: "Maneuver",
  },
  {
    baseSidc: "10031000001217000000",
    name: "Special Forces",
    category: "Land",
    subcategory: "Maneuver",
  },
  {
    baseSidc: "10031000001218000000",
    name: "Special Operations Forces",
    category: "Land",
    subcategory: "Maneuver",
  },
  {
    baseSidc: "10031000001220000000",
    name: "Ranger",
    category: "Land",
    subcategory: "Maneuver",
  },
  {
    baseSidc: "10031000001214000000",
    name: "Sea-Air-Land (SEAL)",
    category: "Land",
    subcategory: "Maneuver",
  },
  {
    baseSidc: "10031000001201000000",
    name: "Air Assault (organic lift)",
    category: "Land",
    subcategory: "Maneuver",
  },
  {
    baseSidc: "10031000001203000000",
    name: "Amphibious",
    category: "Land",
    subcategory: "Maneuver",
  },
  {
    baseSidc: "10031000001204000000",
    name: "Antitank / Antiarmour",
    category: "Land",
    subcategory: "Maneuver",
  },
  {
    baseSidc: "10031000001206000000",
    name: "Aviation Rotary Wing",
    category: "Land",
    subcategory: "Maneuver",
  },
  {
    baseSidc: "10031000001208000000",
    name: "Aviation Fixed Wing",
    category: "Land",
    subcategory: "Maneuver",
  },
  {
    baseSidc: "10031000001219000000",
    name: "Unmanned Systems",
    category: "Land",
    subcategory: "Maneuver",
  },
  {
    baseSidc: "10031000001210000000",
    name: "Combined Arms",
    category: "Land",
    subcategory: "Maneuver",
  },

  // ── Land Fires (Land Unit, SymSet 10) ────────────────────────────────
  {
    baseSidc: "10031000001300000000",
    name: "Fires (generic)",
    category: "Land",
    subcategory: "Fires",
  },
  {
    baseSidc: "10031000001301000000",
    name: "Air Defense",
    category: "Land",
    subcategory: "Fires",
  },
  {
    baseSidc: "10031000001303000000",
    name: "Field Artillery",
    category: "Land",
    subcategory: "Fires",
  },
  {
    baseSidc: "10031000001304000000",
    name: "Field Artillery Observer",
    category: "Land",
    subcategory: "Fires",
  },
  {
    baseSidc: "10031000001305000000",
    name: "Joint Fire Support",
    category: "Land",
    subcategory: "Fires",
  },
  {
    baseSidc: "10031000001307000000",
    name: "Missile",
    category: "Land",
    subcategory: "Fires",
  },
  {
    baseSidc: "10031000001308000000",
    name: "Mortar",
    category: "Land",
    subcategory: "Fires",
  },
  {
    baseSidc: "10031000001303004100",
    name: "Rocket Artillery (MLRS)",
    category: "Land",
    subcategory: "Fires",
    description: "Field artillery unit with multiple rocket launcher amplifier",
  },

  // ── Land Combat Support ───────────────────────────────────────────────
  {
    baseSidc: "10031000001400000000",
    name: "Combat Support (generic)",
    category: "Land",
    subcategory: "Combat Support",
  },
  {
    baseSidc: "10031000001401000000",
    name: "CBRN",
    category: "Land",
    subcategory: "Combat Support",
  },
  {
    baseSidc: "10031000001407000000",
    name: "Engineer",
    category: "Land",
    subcategory: "Combat Support",
  },
  {
    baseSidc: "10031000001408000000",
    name: "EOD (Explosive Ordnance Disposal)",
    category: "Land",
    subcategory: "Combat Support",
  },
  {
    baseSidc: "10031000001412000000",
    name: "Military Police",
    category: "Land",
    subcategory: "Combat Support",
  },
  {
    baseSidc: "10031000001417000000",
    name: "Security",
    category: "Land",
    subcategory: "Combat Support",
  },

  // ── Land Intelligence ─────────────────────────────────────────────────
  {
    baseSidc: "10031000001500000000",
    name: "Intelligence (generic)",
    category: "Land",
    subcategory: "Intelligence",
  },
  {
    baseSidc: "10031000001505000000",
    name: "Electronic Warfare",
    category: "Land",
    subcategory: "Intelligence",
  },
  {
    baseSidc: "10031000001510000000",
    name: "Military Intelligence",
    category: "Land",
    subcategory: "Intelligence",
  },

  // ── Land CSS (Combat Service Support) ────────────────────────────────
  {
    baseSidc: "10031000001600000000",
    name: "Sustainment (generic)",
    category: "Land",
    subcategory: "CSS",
  },
  {
    baseSidc: "10031000001604000000",
    name: "Ammunition",
    category: "Land",
    subcategory: "CSS",
  },
  {
    baseSidc: "10031000001611000000",
    name: "Maintenance",
    category: "Land",
    subcategory: "CSS",
  },
  {
    baseSidc: "10031000001613000000",
    name: "Medical",
    category: "Land",
    subcategory: "CSS",
  },
  {
    baseSidc: "10031000001614000000",
    name: "Medical Treatment Facility",
    category: "Land",
    subcategory: "CSS",
  },
  {
    baseSidc: "10031000001634000000",
    name: "Supply",
    category: "Land",
    subcategory: "CSS",
  },
  {
    baseSidc: "10031000001636000000",
    name: "Transportation",
    category: "Land",
    subcategory: "CSS",
  },
  {
    baseSidc: "10031000001623000000",
    name: "Ordnance",
    category: "Land",
    subcategory: "CSS",
  },
  {
    baseSidc: "10031000001629000000",
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
    baseSidc: "10031500001109000000",
    name: "Howitzer",
    category: "Land Equipment",
    subcategory: "Artillery",
  },
  {
    baseSidc: "10031500001114000000",
    name: "Mortar",
    category: "Land Equipment",
    subcategory: "Artillery",
  },
  {
    baseSidc: "10031500001110000000",
    name: "Missile Launcher",
    category: "Land Equipment",
    subcategory: "Artillery",
  },
  {
    baseSidc: "10031500001105000000",
    name: "Air Defence Gun",
    category: "Land Equipment",
    subcategory: "Air Defense",
  },
  {
    baseSidc: "10031500001106000000",
    name: "Antitank Gun",
    category: "Land Equipment",
    subcategory: "Armor",
  },
  {
    baseSidc: "10031500001102000000",
    name: "Machine Gun",
    category: "Land Equipment",
    subcategory: "Weapons",
  },
  {
    baseSidc: "10031500001101000000",
    name: "Rifle",
    category: "Land Equipment",
    subcategory: "Weapons",
  },

  // ── Air (SymSet 01) ───────────────────────────────────────────────────
  {
    baseSidc: "10030100001100000000",
    name: "Military Aircraft (generic)",
    category: "Air",
  },
  {
    baseSidc: "10030100001101000000",
    name: "Fixed Wing",
    category: "Air",
    subcategory: "Fixed Wing",
  },
  {
    baseSidc: "10030100001101020000",
    name: "Attack / Strike",
    category: "Air",
    subcategory: "Fixed Wing",
  },
  {
    baseSidc: "10030100001101030000",
    name: "Bomber",
    category: "Air",
    subcategory: "Fixed Wing",
  },
  {
    baseSidc: "10030100001101040000",
    name: "Fighter",
    category: "Air",
    subcategory: "Fixed Wing",
  },
  {
    baseSidc: "10030100001101070000",
    name: "Cargo",
    category: "Air",
    subcategory: "Fixed Wing",
  },
  {
    baseSidc: "10030100001101090000",
    name: "Tanker",
    category: "Air",
    subcategory: "Fixed Wing",
  },
  {
    baseSidc: "10030100001101110000",
    name: "Reconnaissance",
    category: "Air",
    subcategory: "Fixed Wing",
  },
  {
    baseSidc: "10030100001101160000",
    name: "Airborne Early Warning",
    category: "Air",
    subcategory: "Fixed Wing",
  },
  {
    baseSidc: "10030100001101260000",
    name: "Special Operations",
    category: "Air",
    subcategory: "Fixed Wing",
  },
  {
    baseSidc: "10030100001102000000",
    name: "Rotary Wing (Helicopter)",
    category: "Air",
    subcategory: "Rotary Wing",
  },
  {
    baseSidc: "10030100001101010000",
    name: "Medical Evacuation (Fixed Wing)",
    category: "Air",
    subcategory: "Fixed Wing",
  },
  {
    baseSidc: "10030100001103000000",
    name: "UAV / UAS",
    category: "Air",
    subcategory: "Unmanned",
  },
  {
    baseSidc: "10030100001200000000",
    name: "Civilian Aircraft (generic)",
    category: "Air",
    subcategory: "Civilian",
  },

  // ── Sea Surface (SymSet 30) ───────────────────────────────────────────
  {
    baseSidc: "10033000001100000000",
    name: "Military Vessel (generic)",
    category: "Maritime",
    subcategory: "Sea Surface",
  },
  {
    baseSidc: "10033000001200000000",
    name: "Combatant",
    category: "Maritime",
    subcategory: "Surface",
  },
  {
    baseSidc: "10033000001201000000",
    name: "Aircraft Carrier",
    category: "Maritime",
    subcategory: "Surface",
  },
  {
    baseSidc: "10033000001202000000",
    name: "Surface Combatant (Line)",
    category: "Maritime",
    subcategory: "Surface",
  },
  {
    baseSidc: "10033000001202030000",
    name: "Destroyer",
    category: "Maritime",
    subcategory: "Surface",
  },
  {
    baseSidc: "10033000001202040000",
    name: "Frigate",
    category: "Maritime",
    subcategory: "Surface",
  },
  {
    baseSidc: "10033000001203000000",
    name: "Amphibious Warfare Ship",
    category: "Maritime",
    subcategory: "Surface",
  },
  {
    baseSidc: "10033000001204000000",
    name: "Mine Warfare Vessel",
    category: "Maritime",
    subcategory: "Surface",
  },
  {
    baseSidc: "10033000001205000000",
    name: "Patrol Vessel",
    category: "Maritime",
    subcategory: "Surface",
  },
  {
    baseSidc: "10033000001207000000",
    name: "Unmanned Surface Vehicle",
    category: "Maritime",
    subcategory: "Surface",
  },
  {
    baseSidc: "10033000001210000000",
    name: "Navy Task Organization Unit",
    category: "Maritime",
    subcategory: "Surface",
  },

  // ── Sea Subsurface (SymSet 35) ────────────────────────────────────────
  {
    baseSidc: "10033500001100000000",
    name: "Submarine (military, generic)",
    category: "Maritime",
    subcategory: "Subsurface",
  },
  {
    baseSidc: "10033500001101000000",
    name: "Submarine",
    category: "Maritime",
    subcategory: "Subsurface",
  },
  {
    baseSidc: "10033500001105000000",
    name: "Diver (Military)",
    category: "Maritime",
    subcategory: "Subsurface",
  },

  // ── Activities (SymSet 40) ────────────────────────────────────────────
  {
    baseSidc: "10034000001100000000",
    name: "Activity (generic)",
    category: "Activities",
  },
  {
    baseSidc: "10034000001103000000",
    name: "IED",
    category: "Activities",
    subcategory: "Threat",
  },
  {
    baseSidc: "10034000001102000000",
    name: "Bomb",
    category: "Activities",
    subcategory: "Threat",
  },
  {
    baseSidc: "10034000001104000000",
    name: "Shooting",
    category: "Activities",
    subcategory: "Threat",
  },
  {
    baseSidc: "10034000001106000000",
    name: "Explosion",
    category: "Activities",
    subcategory: "Threat",
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
