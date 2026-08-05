/**
 * mil-export-json.ts
 * Export and import the MilGeo layer model as a .milgeo.json document.
 */
import type { MilGeoJson } from "@geolibre/core";
import { MILGEO_FORMAT_VERSION } from "@geolibre/core";

/** Serialise a MilGeoJson document to a downloadable file. */
export function exportMilGeoJson(doc: MilGeoJson, filename?: string): void {
  const json = JSON.stringify(doc, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = filename ?? "milgeo-export.milgeo.json";
  a.click();
  URL.revokeObjectURL(url);
}

/** Parse a MilGeoJson from a JSON string (File / FileReader result). */
export function parseMilGeoJson(text: string): MilGeoJson {
  const doc = JSON.parse(text) as MilGeoJson;
  if (!doc.layers || !Array.isArray(doc.layers)) {
    throw new Error("Formato non valido: campo 'layers' mancante.");
  }
  if (doc.version && doc.version !== MILGEO_FORMAT_VERSION) {
    console.warn("[mil-export-json] Versione formato:", doc.version, "— atteso:", MILGEO_FORMAT_VERSION);
  }
  // Normalise missing orbat field
  if (!doc.orbat) doc.orbat = [];
  return doc;
}

/** Load a MilGeoJson from a File object (returns a Promise). */
export function readMilGeoJsonFile(file: File): Promise<MilGeoJson> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => {
      try { resolve(parseMilGeoJson(reader.result as string)); }
      catch (e) { reject(e); }
    };
    reader.onerror = () => reject(new Error("Impossibile leggere il file."));
    reader.readAsText(file);
  });
}
