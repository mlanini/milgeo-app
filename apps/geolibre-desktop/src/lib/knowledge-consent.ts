/**
 * Shared consent gate for Wikipedia knowledge-card lookups.
 *
 * Opening a knowledge card sends clicked coordinates to the public Wikipedia API,
 * so users must acknowledge a one-time privacy notice before first use.
 */
export const KNOWLEDGE_CARD_CONSENT_KEY = "geolibre:knowledge-card-wikipedia-notice";

/** Whether the user has acknowledged the knowledge-card privacy notice. */
export function hasKnowledgeCardConsent(): boolean {
  try {
    return localStorage.getItem(KNOWLEDGE_CARD_CONSENT_KEY) === "1";
  } catch {
    // localStorage unavailable (private mode): require notice.
    return false;
  }
}

/** Record that the user acknowledged the knowledge-card privacy notice. */
export function recordKnowledgeCardConsent(): void {
  try {
    localStorage.setItem(KNOWLEDGE_CARD_CONSENT_KEY, "1");
  } catch {
    // Ignore: the notice will show again next time.
  }
}
