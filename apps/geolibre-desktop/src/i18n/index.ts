import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import { DESKTOP_SETTINGS_STORAGE_KEY } from "../lib/storage-keys";
import { DEFAULT_LANGUAGE, languageDirection, resolveLanguage } from "./languages";
import enTranslation from "./locales/en.json";

const localeLoaders = import.meta.glob<{ default: Record<string, unknown> }>([
  "./locales/*.json",
  "!./locales/en.json",
]);

const loaders: Record<string, () => Promise<{ default: Record<string, unknown> }>> = {};
for (const [path, loader] of Object.entries(localeLoaders)) {
  const code = path.replace(/^\.\/locales\//, "").replace(/\.json$/, "");
  loaders[code] = loader;
}

/** Catalog codes we actually ship, e.g. `["en", "zh"]`. */
export const AVAILABLE_LANGUAGES: string[] = [DEFAULT_LANGUAGE, ...Object.keys(loaders)].sort();

const resources: Record<string, { translation: Record<string, unknown> }> = {
  [DEFAULT_LANGUAGE]: { translation: enTranslation as Record<string, unknown> },
};

/** Ensure a locale's catalog is registered with i18next before switching to it. */
export async function loadCatalog(code: string): Promise<void> {
  if (code === DEFAULT_LANGUAGE) return;
  if (i18n.hasResourceBundle(code, "translation")) return;
  const loader = loaders[code];
  if (!loader) return;
  const mod = await loader();
  i18n.addResourceBundle(code, "translation", mod.default, true, true);
}

let languageRequestToken = 0;
let languageSwitchQueue: Promise<void> = Promise.resolve();

export async function setActiveLanguage(code: string): Promise<boolean> {
  const token = ++languageRequestToken;
  try {
    await loadCatalog(code);
  } catch (error) {
    if (token === languageRequestToken) throw error;
    return false;
  }
  if (token !== languageRequestToken) return false;

  let failure: unknown;
  const run = languageSwitchQueue.then(async () => {
    if (token !== languageRequestToken) return;
    try {
      await i18n.changeLanguage(code);
    } catch (error) {
      if (token === languageRequestToken) failure = error;
    }
  });
  languageSwitchQueue = run;
  await run;

  if (failure) throw failure;
  return token === languageRequestToken;
}

const QUERY_PARAM_KEYS = ["locale", "lang"];

/**
 * Read the persisted language from the desktop-settings blob in localStorage
 * without importing the settings store (i18n initializes before React, and we
 * want to avoid an import cycle). Returns `null` if absent or unparseable.
 */
function persistedLanguage(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(DESKTOP_SETTINGS_STORAGE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as { language?: unknown };
    return typeof parsed.language === "string" ? parsed.language : null;
  } catch {
    return null;
  }
}

/**
 * Resolve the initial UI language, in priority order:
 *   1. `?locale=` / `?lang=` query param (for embeds, consistent with `theme`)
 *   2. the language persisted in desktop settings
 *   3. the browser's preferred languages (`navigator.languages`)
 *   4. the default (`en`)
 * Only languages we ship a catalog for are honored; anything else falls through.
 */
export function getInitialLanguage(): string {
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    for (const key of QUERY_PARAM_KEYS) {
      const fromQuery = resolveLanguage(params.get(key), AVAILABLE_LANGUAGES);
      if (fromQuery) return fromQuery;
    }

    const fromSettings = resolveLanguage(
      persistedLanguage(),
      AVAILABLE_LANGUAGES,
    );
    if (fromSettings) return fromSettings;

    const navigatorLanguages =
      typeof navigator !== "undefined"
        ? (navigator.languages ?? [navigator.language])
        : [];
    for (const candidate of navigatorLanguages) {
      const fromNavigator = resolveLanguage(candidate, AVAILABLE_LANGUAGES);
      if (fromNavigator) return fromNavigator;
    }
  }

  return DEFAULT_LANGUAGE;
}

function applyDocumentDirection(code: string) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = code;
  document.documentElement.dir = languageDirection(code);
}

i18n.on("languageChanged", applyDocumentDirection);

const initialLanguage = getInitialLanguage();

export const i18nReady: Promise<unknown> = (async () => {
  let effectiveLanguage = initialLanguage;
  if (initialLanguage !== DEFAULT_LANGUAGE && loaders[initialLanguage]) {
    try {
      const mod = await loaders[initialLanguage]();
      resources[initialLanguage] = { translation: mod.default };
    } catch (error) {
      console.error("[MilGeo.app] Failed to load initial locale catalog; using English", error);
      effectiveLanguage = DEFAULT_LANGUAGE;
    }
  }

  return i18n.use(initReactI18next).init({
    resources,
    lng: effectiveLanguage,
    fallbackLng: DEFAULT_LANGUAGE,
    defaultNS: "translation",
    interpolation: {
      escapeValue: false,
    },
    react: { useSuspense: false },
    returnNull: false,
  });
})();

export default i18n;
