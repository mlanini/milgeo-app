export interface NormalizedTacticalSidc {
  original: string;
  canonical20: string | null;
}

/**
 * Milestone A: canonical SIDC is accepted only when already provided as 20 digits.
 * Future milestones can add deterministic conversions for additional SIDC dialects.
 */
export function normalizeTacticalSidc(rawSidc: string): NormalizedTacticalSidc {
  const original = rawSidc.trim().toUpperCase();
  const canonical20 = /^\d{20}$/.test(original) ? original : null;
  return { original, canonical20 };
}
