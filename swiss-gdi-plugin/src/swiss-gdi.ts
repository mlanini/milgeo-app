export type SwissGdiLanguage = "de" | "fr" | "it" | "rm" | "en";

export interface SwissGdiCatalogLayer {
  name: string;
  title: string;
  abstract?: string;
}

export const SWISS_GDI_PLUGIN_ID = "geolibre-swiss-gdi";
export const SWISS_GDI_DOCS_URL = "https://docs.geo.admin.ch/visualize-data/wms.html";
export const SWISS_GDI_WMS_BASE_URL = "https://wms.geo.admin.ch";

const SUPPORTED_SWISS_GDI_LANGUAGES: readonly SwissGdiLanguage[] = [
  "de",
  "fr",
  "it",
  "rm",
  "en",
];

export function normalizeSwissGdiLanguage(value?: string | null): SwissGdiLanguage {
  const normalized = value?.trim().toLowerCase().split(/[-_]/)[0];
  return SUPPORTED_SWISS_GDI_LANGUAGES.includes(normalized as SwissGdiLanguage)
    ? (normalized as SwissGdiLanguage)
    : "en";
}

export function buildSwissGdiWmsEndpoint(language: SwissGdiLanguage): string {
  return `${SWISS_GDI_WMS_BASE_URL}/${language}/`;
}

export function buildSwissGdiCapabilitiesUrl(language: SwissGdiLanguage): string {
  const url = new URL(buildSwissGdiWmsEndpoint(language));
  url.searchParams.set("SERVICE", "WMS");
  url.searchParams.set("REQUEST", "GetCapabilities");
  url.searchParams.set("VERSION", "1.3.0");
  return url.toString();
}

export function buildSwissGdiLegendGraphicUrl(layerName: string, language: SwissGdiLanguage): string {
  const url = new URL(buildSwissGdiWmsEndpoint(language));
  url.searchParams.set("SERVICE", "WMS");
  url.searchParams.set("REQUEST", "GetLegendGraphic");
  url.searchParams.set("VERSION", "1.3.0");
  url.searchParams.set("LAYERS", layerName);
  url.searchParams.set("STYLES", "default");
  url.searchParams.set("LANG", language);
  url.searchParams.set("FORMAT", "image/png");
  url.searchParams.set("CRS", "EPSG:3857");
  url.searchParams.set("BBOX", "664577,5753148,1167741,6075303");
  url.searchParams.set("WIDTH", "512");
  url.searchParams.set("HEIGHT", "512");
  return url.toString();
}

function directChildText(element: Element, name: string): string {
  for (const child of Array.from(element.children)) {
    if (child.tagName === name) return child.textContent?.trim() ?? "";
  }
  return "";
}

export function parseSwissGdiCapabilities(xmlText: string): SwissGdiCatalogLayer[] {
  const document = new DOMParser().parseFromString(xmlText, "text/xml");
  if (document.querySelector("parsererror")) {
    throw new Error("The Swiss GDI capabilities response is not valid XML.");
  }

  const byName = new Map<string, SwissGdiCatalogLayer>();
  for (const layer of Array.from(document.getElementsByTagName("Layer"))) {
    const name = directChildText(layer, "Name");
    const title = directChildText(layer, "Title");
    if (!name || !title) continue;
    byName.set(name, {
      name,
      title,
      abstract: directChildText(layer, "Abstract") || undefined,
    });
  }

  return Array.from(byName.values()).sort((left, right) =>
    left.title.localeCompare(right.title),
  );
}
