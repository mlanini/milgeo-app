import { useCallback } from "react";
import ms from "milsymbol";
import type { SymbolOptions } from "milsymbol";

const MilSymbol = ms.Symbol;

// Initialise milsymbol to APP-6D standard once at module load.
ms.setStandard("APP6");

/**
 * useMilSymbol
 *
 * React hook that provides helpers to generate SVG / data-URLs from SIDC
 * strings using the milsymbol.js library (https://spatialillusions.com/milsymbol/).
 *
 * Standard: APP-6D Edition 4 (number-based 20-character SIDC).
 *
 * @example
 *   const { renderSVG, renderDataURL, isValid } = useMilSymbol();
 *   const svg = renderSVG("10031500141200000000", { size: 35 });
 */
export function useMilSymbol() {
  /** Returns SVG string for the given SIDC, or empty string if invalid. */
  const renderSVG = useCallback(
    (sidc: string, options: SymbolOptions = {}): string => {
      try {
        const sym = new MilSymbol(sidc, { size: 40, ...options });
        if (!sym.isValid()) return "";
        return sym.asSVG();
      } catch {
        return "";
      }
    },
    [],
  );

  /** Returns a data-URL (PNG) for use as MapLibre image sprite. */
  const renderDataURL = useCallback(
    (sidc: string, options: SymbolOptions = {}): string => {
      try {
        const sym = new MilSymbol(sidc, { size: 40, ...options });
        if (!sym.isValid()) return "";
        return sym.toDataURL();
      } catch {
        return "";
      }
    },
    [],
  );

  /** Returns true if the SIDC is recognised by milsymbol. */
  const isValid = useCallback((sidc: string): boolean => {
    try {
      const result = new MilSymbol(sidc).isValid();
      return result === true || (typeof result === "object" && result !== null);
    } catch {
      return false;
    }
  }, []);

  /** Returns the natural size of the rendered symbol. */
  const getSize = useCallback(
    (sidc: string, options: SymbolOptions = {}): { width: number; height: number } => {
      try {
        return new MilSymbol(sidc, { size: 40, ...options }).getSize();
      } catch {
        return { width: 0, height: 0 };
      }
    },
    [],
  );

  /** Returns the anchor point (for map marker positioning). */
  const getAnchor = useCallback(
    (sidc: string, options: SymbolOptions = {}): { x: number; y: number } => {
      try {
        const sym = new MilSymbol(sidc, { size: 40, ...options });
        // milsymbol 3.x does not expose a public getAnchor(); use symbolAnchor.
        const s3 = sym as unknown as { symbolAnchor?: { x: number; y: number } };
        if (s3.symbolAnchor) return s3.symbolAnchor;
        const { width, height } = sym.getSize();
        return { x: width / 2, y: height / 2 };
      } catch {
        return { x: 0, y: 0 };
      }
    },
    [],
  );

  return { renderSVG, renderDataURL, isValid, getSize, getAnchor };
}

// ─── Standalone helpers (usable outside React) ───────────────────────────────

/**
 * Builds a milsymbol SVG string from a SIDC code.
 * Returns a fallback grey square SVG if the SIDC is invalid.
 */
export function sidcToSVG(sidc: string, options: SymbolOptions = {}): string {
  try {
    const sym = new MilSymbol(sidc, { size: 40, ...options });
    if (sym.isValid()) return sym.asSVG();
  } catch {
    /* fall through */
  }
  return `<svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="2" width="36" height="36" rx="3" fill="#666" stroke="#fff" stroke-width="1.5"/>
    <text x="20" y="26" text-anchor="middle" font-size="9" fill="#fff" font-family="monospace">${sidc.slice(4, 10)}</text>
  </svg>`;
}

/**
 * Resolves the pixel anchor of a symbol (used for MapLibre Marker offset).
 */
export function sidcAnchor(sidc: string, size = 40): { x: number; y: number } {
  try {
    const sym = new MilSymbol(sidc, { size });
    // milsymbol 3.x does not expose a public getAnchor(); use symbolAnchor.
    const s3 = sym as unknown as { symbolAnchor?: { x: number; y: number } };
    return s3.symbolAnchor ?? { x: size / 2, y: size / 2 };
  } catch {
    return { x: size / 2, y: size / 2 };
  }
}
