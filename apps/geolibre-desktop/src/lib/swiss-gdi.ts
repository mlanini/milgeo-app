export type SwissGdiLanguage = "de" | "fr" | "it" | "rm" | "en";

export interface SwissGdiCatalogLayer {
  name: string;
  title: string;
  abstract?: string;
  tileTemplate?: string;
  format?: string;
  tileMatrixSet?: string;
}

export const SWISS_GDI_PLUGIN_ID = "geolibre-swiss-gdi";
export const SWISS_GDI_DOCS_URL =
  "https://docs.geo.admin.ch/visualize-data/wmts.html";
export const SWISS_GDI_WMS_BASE_URL = "https://wms.geo.admin.ch";
export const SWISS_GDI_WMTS_CAPABILITIES_URL =
  "https://wmts.geo.admin.ch/1.0.0/WMTSCapabilities.xml";

const SUPPORTED_SWISS_GDI_LANGUAGES: readonly SwissGdiLanguage[] = [
  "de",
  "fr",
  "it",
  "rm",
  "en",
];

export function normalizeSwissGdiLanguage(value?: string | null): SwissGdiLanguage {
  const normalized = value?.trim().toLowerCase().split(/[-_]/)[0];
  return SUPPORTED_SWISS_GDI_LANGUAGES.includes(
    normalized as SwissGdiLanguage,
  )
    ? (normalized as SwissGdiLanguage)
    : "en";
}

export function buildSwissGdiWmsEndpoint(language: SwissGdiLanguage): string {
  return `${SWISS_GDI_WMS_BASE_URL}/${language}/`;
}

export function buildSwissGdiCapabilitiesUrl(language: SwissGdiLanguage): string {
  const url = new URL(SWISS_GDI_WMTS_CAPABILITIES_URL);
  url.searchParams.set("lang", language);
  return url.toString();
}

export function buildSwissGdiWmtsTileUrl(
  layer: SwissGdiCatalogLayer,
  language: SwissGdiLanguage,
): string {
  const format = (layer.format ?? "image/png").toLowerCase();
  const extension = format.includes("jpeg") || format.includes("jpg")
    ? "jpeg"
    : "png";
  const matrixSet = layer.tileMatrixSet ?? "3857";
  const template =
    layer.tileTemplate ??
    `https://wmts.geo.admin.ch/1.0.0/${layer.name}/default/current/${matrixSet}/{TileMatrix}/{TileCol}/{TileRow}.${extension}`;

  const tileUrl = template
    .replaceAll("{Layer}", layer.name)
    .replaceAll("{Style}", "default")
    .replaceAll("{TileMatrixSet}", matrixSet);

  const separator = tileUrl.includes("?") ? "&" : "?";
  return tileUrl.includes("lang=")
    ? tileUrl
    : `${tileUrl}${separator}lang=${encodeURIComponent(language)}`;
}

export function buildSwissGdiLegendGraphicUrl(
  layerName: string,
  language: SwissGdiLanguage,
): string {
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
    if (child.tagName === name) {
      return child.textContent?.trim() ?? "";
    }
  }
  return "";
}

function localName(node: Element): string {
  return node.localName || node.tagName.split(":").at(-1) || node.tagName;
}

function findDirectChildByLocalName(
  element: Element,
  name: string,
): Element | null {
  for (const child of Array.from(element.children)) {
    if (localName(child) === name) return child;
  }
  return null;
}

function directChildTextByLocalName(element: Element, name: string): string {
  const node = findDirectChildByLocalName(element, name);
  return node?.textContent?.trim() ?? "";
}

export function parseSwissGdiCapabilities(xmlText: string): SwissGdiCatalogLayer[] {
  if (typeof DOMParser === "undefined") {
    throw new Error("DOMParser is not available in this runtime.");
  }

  const document = new DOMParser().parseFromString(xmlText, "text/xml");
  if (document.querySelector("parsererror")) {
    throw new Error("The Swiss GDI capabilities response is not valid XML.");
  }

  const byName = new Map<string, SwissGdiCatalogLayer>();
  for (const layer of Array.from(document.getElementsByTagName("Layer"))) {
    const name =
      directChildTextByLocalName(layer, "Identifier") ||
      directChildText(layer, "Name");
    const title =
      directChildTextByLocalName(layer, "Title") || directChildText(layer, "Title");
    if (!name || !title) continue;

    const resourceUrl = Array.from(layer.getElementsByTagName("ResourceURL")).find(
      (node) => node.getAttribute("resourceType")?.toLowerCase() === "tile",
    );
    const format =
      resourceUrl?.getAttribute("format") ||
      directChildTextByLocalName(layer, "Format") ||
      undefined;
    const tileTemplate = resourceUrl?.getAttribute("template") || undefined;

    const matrixSetLink = findDirectChildByLocalName(layer, "TileMatrixSetLink");
    const tileMatrixSet = matrixSetLink
      ? directChildTextByLocalName(matrixSetLink, "TileMatrixSet") || undefined
      : undefined;

    byName.set(name, {
      name,
      title,
      abstract:
        directChildTextByLocalName(layer, "Abstract") ||
        directChildText(layer, "Abstract") ||
        undefined,
      ...(tileTemplate ? { tileTemplate } : {}),
      ...(format ? { format } : {}),
      ...(tileMatrixSet ? { tileMatrixSet } : {}),
    });
  }

  return Array.from(byName.values()).sort((left, right) =>
    left.title.localeCompare(right.title),
  );
}