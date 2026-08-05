import { access } from "node:fs/promises";
import path from "node:path";

const OUTPUT_DIR = path.resolve(process.cwd(), "apps/geolibre-desktop/dist");

async function main() {
  try {
    await access(OUTPUT_DIR);
    console.log(`[render-check] OK: static output found at ${OUTPUT_DIR}`);
  } catch {
    console.error(`[render-check] ERROR: missing static output at ${OUTPUT_DIR}`);
    process.exitCode = 1;
  }
}

void main();
