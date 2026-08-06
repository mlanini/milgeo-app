import type { MilAffiliation } from "@geolibre/core";

export type TacticalGeometryType = "LineString" | "Polygon";

export interface TacticalCatalogEntry {
  sidc: string;
  name: string;
  family: string;
  geometryType: TacticalGeometryType;
  directional?: boolean;
}

const AFF_LETTER: Record<MilAffiliation, string> = {
  FRIENDLY: "F",
  HOSTILE: "H",
  NEUTRAL: "N",
  UNKNOWN: "U",
};

/**
 * Build a display SIDC from ODIN's parameterized key (e.g. G*G*GLF---).
 * We keep storage SIDC as-is and only use this for preview rendering.
 */
export function odinDisplaySidc(parameterizedSidc: string, affiliation: MilAffiliation): string {
  const sidc = parameterizedSidc.toUpperCase();
  if (sidc.length < 10) return sidc;
  const scheme = sidc[0] ?? "G";
  const battleDimension = sidc[2] ?? "G";
  const functionId = sidc.slice(4, 10);
  const identity = AFF_LETTER[affiliation] ?? "U";
  return `${scheme}${identity}${battleDimension}P${functionId}----`; // 15-char legacy SIDC
}

export const TACTICAL_FAMILIES = [
  "Fires",
  "Command & Control",
  "Mobility/Obstacles",
  "Protection",
  "Sustainment",
  "Tasks",
] as const;

export const TACTICAL_CATALOG: TacticalCatalogEntry[] = [
  // ODINv2 linestring styles
  { sidc: "G*F*LT----", name: "Linear Target", family: "Fires", geometryType: "LineString" },
  { sidc: "G*F*LTF---", name: "Final Protective Fire (FPF)", family: "Fires", geometryType: "LineString" },
  { sidc: "G*F*LTS---", name: "Linear Smoke Target", family: "Fires", geometryType: "LineString" },
  { sidc: "G*G*GLC---", name: "Line of Contact", family: "Command & Control", geometryType: "LineString" },
  { sidc: "G*G*GLF---", name: "Forward Line of Own Troops (FLOT)", family: "Command & Control", geometryType: "LineString" },
  { sidc: "G*G*OLKA--", name: "Direction of Attack (Aviation)", family: "Command & Control", geometryType: "LineString", directional: true },
  { sidc: "G*G*OLKGM-", name: "Direction of Attack (Main)", family: "Command & Control", geometryType: "LineString", directional: true },
  { sidc: "G*G*OLKGS-", name: "Direction of Attack (Supporting)", family: "Command & Control", geometryType: "LineString", directional: true },
  { sidc: "G*G*PF----", name: "Direction of Attack for Feint", family: "Command & Control", geometryType: "LineString", directional: true },
  { sidc: "G*M*BCF---", name: "Ferry", family: "Mobility/Obstacles", geometryType: "LineString" },
  { sidc: "G*M*BCL---", name: "Lane", family: "Mobility/Obstacles", geometryType: "LineString" },
  { sidc: "G*M*BCR---", name: "Raft Site", family: "Mobility/Obstacles", geometryType: "LineString" },
  { sidc: "G*M*OADC--", name: "Antitank Ditch (Complete)", family: "Mobility/Obstacles", geometryType: "LineString" },
  { sidc: "G*M*OADU--", name: "Antitank Ditch (Under Construction)", family: "Mobility/Obstacles", geometryType: "LineString" },
  { sidc: "G*M*OAR---", name: "Antitank Ditch Reinforced", family: "Mobility/Obstacles", geometryType: "LineString" },
  { sidc: "G*M*OEF---", name: "Obstacle Effect / Fix", family: "Mobility/Obstacles", geometryType: "LineString" },
  { sidc: "G*M*OAW---", name: "Antitank Wall", family: "Mobility/Obstacles", geometryType: "LineString" },
  { sidc: "G*M*OGL---", name: "Obstacles / General / Line", family: "Mobility/Obstacles", geometryType: "LineString" },
  { sidc: "G*M*OMC---", name: "Mine Cluster", family: "Mobility/Obstacles", geometryType: "LineString" },
  { sidc: "G*M*OS----", name: "Abatis", family: "Mobility/Obstacles", geometryType: "LineString" },
  { sidc: "G*M*OWA---", name: "Double Apron Fence", family: "Mobility/Obstacles", geometryType: "LineString" },
  { sidc: "G*M*OWCD--", name: "Double Strand Concertina", family: "Mobility/Obstacles", geometryType: "LineString" },
  { sidc: "G*M*OWCS--", name: "Single Concertina", family: "Mobility/Obstacles", geometryType: "LineString" },
  { sidc: "G*M*OWCT--", name: "Triple Strand Concertina", family: "Mobility/Obstacles", geometryType: "LineString" },
  { sidc: "G*M*OWD---", name: "Double Fence", family: "Mobility/Obstacles", geometryType: "LineString" },
  { sidc: "G*M*OWH---", name: "High Wire Fence", family: "Mobility/Obstacles", geometryType: "LineString" },
  { sidc: "G*M*OWL---", name: "Low Wire Fence", family: "Mobility/Obstacles", geometryType: "LineString" },
  { sidc: "G*M*OWS---", name: "Single Fence", family: "Mobility/Obstacles", geometryType: "LineString" },
  { sidc: "G*M*OWU---", name: "Unspecified Fence", family: "Mobility/Obstacles", geometryType: "LineString" },
  { sidc: "G*M*SL----", name: "Fortified Line", family: "Protection", geometryType: "LineString" },
  { sidc: "G*M*SW----", name: "Foxhole / Emplacement / Weapon Site", family: "Protection", geometryType: "LineString" },
  { sidc: "G*O*HN----", name: "Hazard / Navigational", family: "Sustainment", geometryType: "LineString" },
  { sidc: "G*S*LCH---", name: "Halted Convoy", family: "Sustainment", geometryType: "LineString", directional: true },
  { sidc: "G*S*LCM---", name: "Moving Convoy", family: "Sustainment", geometryType: "LineString", directional: true },
  { sidc: "G*T*A-----", name: "Follow and Assume", family: "Tasks", geometryType: "LineString", directional: true },
  { sidc: "G*T*AS----", name: "Follow and Support", family: "Tasks", geometryType: "LineString", directional: true },
  { sidc: "G*T*F-----", name: "Tasks / Fix", family: "Tasks", geometryType: "LineString", directional: true },

  // ODINv2 polygon styles
  { sidc: "G*G*GAF---", name: "Fortified Area", family: "Command & Control", geometryType: "Polygon" },
  { sidc: "G*G*PY----", name: "Decoy Mined Area, Fenced", family: "Mobility/Obstacles", geometryType: "Polygon" },
  { sidc: "G*G*SAE---", name: "Encirclement", family: "Command & Control", geometryType: "Polygon" },
  { sidc: "G*M*OGB---", name: "Obstacles / General / Belt", family: "Mobility/Obstacles", geometryType: "Polygon" },
  { sidc: "G*M*OGF---", name: "Obstacle Free Area", family: "Mobility/Obstacles", geometryType: "Polygon" },
  { sidc: "G*M*OGR---", name: "Obstacle Restricted Area", family: "Mobility/Obstacles", geometryType: "Polygon" },
  { sidc: "G*M*OGZ---", name: "Obstacles / General / Zone", family: "Mobility/Obstacles", geometryType: "Polygon" },
  { sidc: "G*M*SP----", name: "Strong Point", family: "Protection", geometryType: "Polygon" },
  { sidc: "G*F*ACNI--", name: "No-Fire Area (Irregular)", family: "Fires", geometryType: "Polygon" },
  { sidc: "G*F*ACNR--", name: "No-Fire Area (Rectangular)", family: "Fires", geometryType: "Polygon" },
  { sidc: "G*F*AKBI--", name: "Kill Box Blue (Irregular)", family: "Fires", geometryType: "Polygon" },
  { sidc: "G*F*AKBR--", name: "Kill Box Blue (Rectangular)", family: "Fires", geometryType: "Polygon" },
  { sidc: "G*F*AKPI--", name: "Kill Box Purple (Irregular)", family: "Fires", geometryType: "Polygon" },
  { sidc: "G*F*AKPR--", name: "Kill Box Purple (Rectangular)", family: "Fires", geometryType: "Polygon" },
  { sidc: "G*G*AAW---", name: "Weapons Free Zone", family: "Command & Control", geometryType: "Polygon" },
  { sidc: "G*G*GAY---", name: "Limited Access Area", family: "Command & Control", geometryType: "Polygon" },
  { sidc: "G*M*NB----", name: "Biologically Contaminated Area", family: "Protection", geometryType: "Polygon" },
  { sidc: "G*M*NC----", name: "Chemically Contaminated Area", family: "Protection", geometryType: "Polygon" },
  { sidc: "G*M*NR----", name: "Radiological/Nuclear Contaminated Area", family: "Protection", geometryType: "Polygon" },
];

export function filterTacticalCatalog(query: string, family?: string): TacticalCatalogEntry[] {
  const q = query.trim().toLowerCase();
  return TACTICAL_CATALOG.filter((entry) => {
    if (family && family !== "All" && entry.family !== family) return false;
    if (!q) return true;
    return (
      entry.name.toLowerCase().includes(q) ||
      entry.sidc.toLowerCase().includes(q) ||
      entry.family.toLowerCase().includes(q)
    );
  });
}
