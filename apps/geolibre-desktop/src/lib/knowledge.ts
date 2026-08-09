/**
 * Normalize the current UI language to a Wikipedia language code.
 */
export function wikipediaLang(language: string | null | undefined): string {
  const normalized = (language ?? "").trim().toLowerCase();
  if (!normalized) return "en";
  const [base] = normalized.split("-");
  return base || "en";
}
