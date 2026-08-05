import { cp, mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const bundleDir = path.join(root, "geolibre-plugin");
const manifestPath = path.join(bundleDir, "plugin.json");
const distDir = path.join(bundleDir, "dist");
const publishDir = path.join(root, "publish");
const publishPluginDir = path.join(
  publishDir,
  "plugins",
  "geolibre-swiss-gdi",
);

await mkdir(distDir, { recursive: true });
await mkdir(path.dirname(publishPluginDir), { recursive: true });
await readFile(manifestPath, "utf8");
await readFile(path.join(distDir, "index.js"), "utf8");
await rm(publishPluginDir, { recursive: true, force: true });

await cp(bundleDir, publishPluginDir, { recursive: true, force: true });
console.log(`Prepared ${publishPluginDir}`);
