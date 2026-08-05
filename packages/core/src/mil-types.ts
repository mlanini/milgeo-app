/**
 * mil-types.ts
 * New data model for MilGeo layer management.
 * 1 MilLayer = N MilSymbolItems + M MilGraphicItems
 */

// ─── Symbol item (point symbol with full SIDC + amplifiers) ──────────────────

export interface MilSymbolItem {
  id: string;
  name: string;
  /** Parent MilLayer id */
  layerId: string;
  /** 20-char APP-6D SIDC */
  sidc: string;
  /** WGS-84 longitude */
  lon: number;
  /** WGS-84 latitude */
  lat: number;
  // ── Text amplifiers (all optional) ──────────────────────────────────────────
  /** C2 - Unique Designation */
  uniqueDesignation?: string;
  /** M  - Higher Formation */
  higherFormation?: string;
  /** G  - Staff Comment */
  staffComments?: string;
  /** H  - Additional Information */
  additionalInformation?: string;
  /** W  - DTG */
  dtg?: string;
  /** X  - Altitude / Depth */
  altitudeDepth?: string;
  /** Q  - Direction of Movement (degrees 0-360) */
  direction?: number;
  /** C  - Quantity */
  quantity?: string;
  /** P  - IFF / SIF */
  iffSif?: string;
  /** Z  - Speed */
  speed?: string;
  /** T  - Type */
  typeStr?: string;
  /** F  - Reinforced / Reduced */
  reinforcedReduced?: string;
  /** AL - Combat Effectiveness */
  combatEffectiveness?: string;
  /** AP - Evaluation Rating */
  evaluationRating?: string;
}

// ─── Graphic item (line / area with geometry) ─────────────────────────────────

export type MilGeometryType = "LineString" | "Polygon";

export interface MilGraphicItem {
  id: string;
  name: string;
  layerId: string;
  sidc: string;
  geometryType: MilGeometryType;
  /** GeoJSON-style coordinate array */
  coordinates: number[][];
  uniqueDesignation?: string;
  additionalInformation?: string;
}

// ─── Layer ────────────────────────────────────────────────────────────────────

export interface MilLayer {
  id: string;
  name: string;
  visible: boolean;
  /** 0–1 */
  opacity: number;
  symbols: MilSymbolItem[];
  graphics: MilGraphicItem[];
}

// ─── ORBAT node ───────────────────────────────────────────────────────────────

export interface OrbatUnit {
  id: string;
  name: string;
  sidc: string;
  /** null = root node */
  parentId: string | null;
  /** Optional link to the placed symbol item id inside a main app mil-symbol layer */
  symbolId?: string;
  /** Arbitrary notes */
  remarks?: string;
}

// ─── Serialisable project snapshot ────────────────────────────────────────────

export const MILGEO_FORMAT_VERSION = "1.0";

export interface MilGeoJson {
  version: typeof MILGEO_FORMAT_VERSION;
  layers: MilLayer[];
  orbat: OrbatUnit[];
}
