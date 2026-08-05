import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const packageJsonPath = path.join(root, "package.json");
const manifestPath = path.join(root, "geolibre-plugin", "plugin.json");
const registryEntryPath = path.join(root, "publish", "registry-entry.json");
const sourceEntryPath = path.join(root, "src", "index.ts");

function fail(message) {
  throw new Error(`[validate-geolibre-plugin] ${message}`);
}

const [packageJson, manifest, registryEntry, sourceEntry] = await Promise.all([
  readFile(packageJsonPath, "utf8").then(JSON.parse),
  readFile(manifestPath, "utf8").then(JSON.parse),
  readFile(registryEntryPath, "utf8").then(JSON.parse),
  readFile(sourceEntryPath, "utf8"),
]);

for (const field of ["id", "name", "version", "entry"]) {
  if (!manifest[field]) fail(`plugin.json is missing required field "${field}".`);
}

for (const field of ["id", "name", "version", "manifestUrl"]) {
  if (!registryEntry[field]) fail(`registry-entry.json is missing required field "${field}".`);
}

if (manifest.id !== registryEntry.id) {
  fail(`plugin id mismatch: plugin.json=${manifest.id} registry-entry.json=${registryEntry.id}`);
}

if (manifest.name !== registryEntry.name) {
  fail(`plugin name mismatch: plugin.json=${manifest.name} registry-entry.json=${registryEntry.name}`);
}

if (manifest.version !== packageJson.version || manifest.version !== registryEntry.version) {
  fail(
    `version mismatch: package.json=${packageJson.version}, plugin.json=${manifest.version}, registry-entry.json=${registryEntry.version}`,
  );
}

if (typeof registryEntry.homepage !== "string" || !/^https?:\/\//.test(registryEntry.homepage)) {
  fail(`registry homepage must be an absolute http(s) URL, got ${String(registryEntry.homepage)}`);
}

const expectedManifestUrl = `plugins/${manifest.id}/plugin.json`;
if (registryEntry.manifestUrl !== expectedManifestUrl) {
  fail(`registry manifestUrl must be ${expectedManifestUrl}, got ${registryEntry.manifestUrl}`);
}

if (!sourceEntry.includes("export const plugin = createSwissGdiPlugin();")) {
  fail(`src/index.ts must export a named plugin constant.`);
}

if (!sourceEntry.includes("export default plugin;")) {
  fail(`src/index.ts must export the plugin as default.`);
}

if (sourceEntry.includes("activeByDefault")) {
  fail(`external plugins must not set activeByDefault.`);
}

console.log("Swiss GDI plugin metadata and export contract look ready for plugins.geolibre.app.");