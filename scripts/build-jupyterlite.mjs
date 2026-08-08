#!/usr/bin/env node

/**
 * Web-only repository compatibility shim.
 *
 * The upstream GeoLibre app can generate embedded JupyterLite assets before
 * dev/build. In this repository variant those assets and generator were removed,
 * but package scripts still invoke this entrypoint.
 */

const args = process.argv.slice(2);
const ifMissing = args.includes("--if-missing");

if (ifMissing) {
  console.log("[build-jupyterlite] Skipped (web-only repo variant, --if-missing).");
} else {
  console.log("[build-jupyterlite] No-op (web-only repo variant).");
}
