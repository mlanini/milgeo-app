#!/usr/bin/env node
/**
 * milsymbol-server.mjs
 *
 * Standalone HTTP server that renders APP-6D / MIL-STD-2525D symbols to SVG
 * using the milsymbol library already present in the monorepo node_modules.
 *
 * Run:
 *   node servers/milsymbol-server.mjs
 *
 * Configuration (environment variables):
 *   MILSYMBOL_PORT      TCP port (default: 5180)
 *   MILSYMBOL_HOST      Bind address (default: 127.0.0.1)
 *   MILSYMBOL_STANDARD  APP6 | 2525 (default: APP6)
 *
 * Endpoints:
 *   GET /health
 *   GET /symbol?sidc=<20-char>[&size=<px>][&uniqueDesignation=<text>]
 *                             [&higherFormation=<text>][&outlineColor=<css>]
 *                             [&outlineWidth=<n>][&standard=APP6|2525]
 *
 * The Vite dev-server already provides the same endpoints via the built-in
 * milsymbolPlugin() middleware in vite.config.ts. Use this script only when
 * you need a standalone server (e.g. Tauri sidecar, Docker, CI preview).
 */

import http from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Resolve milsymbol from the monorepo root node_modules so this script works
// regardless of where node is invoked from.
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const require    = createRequire(import.meta.url);

let ms;
try {
  // Try ESM import first (milsymbol ≥ 3.x ships an ESM entry point).
  const milsymbolPath = path.resolve(__dirname, "../node_modules/milsymbol/src/milsymbol.js");
  ms = (await import(milsymbolPath)).default;
} catch {
  // Fallback to CJS require (milsymbol < 3.x or bundled UMD).
  ms = require("milsymbol");
  if (ms.default) ms = ms.default;
}

// ─── Config ─────────────────────────────────────────────────────────────────

const PORT     = parseInt(process.env.MILSYMBOL_PORT     ?? "5180", 10);
const HOST     =          process.env.MILSYMBOL_HOST     ?? "127.0.0.1";
const STANDARD =          process.env.MILSYMBOL_STANDARD ?? "APP6";

ms.setStandard(STANDARD);

// ─── Helpers ────────────────────────────────────────────────────────────────

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  const buf     = Buffer.from(payload, "utf8");
  res.writeHead(status, {
    "content-type":                "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "content-length":              buf.byteLength,
  });
  res.end(buf);
}

function sendSvg(res, svg) {
  const buf = Buffer.from(svg, "utf8");
  res.writeHead(200, {
    "content-type":                "image/svg+xml; charset=utf-8",
    "access-control-allow-origin": "*",
    "cache-control":               "public, max-age=86400, immutable",
    "content-length":              buf.byteLength,
  });
  res.end(buf);
}

function parseIntParam(value, fallback) {
  if (!value) return fallback;
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

// ─── Request handler ─────────────────────────────────────────────────────────

function handleRequest(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  let url;
  try {
    url = new URL(req.url ?? "/", `http://${HOST}:${PORT}`);
  } catch {
    sendJson(res, 400, { error: "Malformed URL" });
    return;
  }

  // ── GET /health ────────────────────────────────────────────────────────────
  if (url.pathname === "/health") {
    sendJson(res, 200, { status: "ok", standard: STANDARD, port: PORT });
    return;
  }

  // ── GET /symbol?sidc=… ────────────────────────────────────────────────────
  if (url.pathname === "/symbol") {
    const sidc = url.searchParams.get("sidc") ?? "";
    if (!sidc) {
      sendJson(res, 400, { error: "Missing required parameter: sidc" });
      return;
    }

    // Per-request standard override (useful for mixed APP-6 / 2525 datasets).
    const reqStandard = url.searchParams.get("standard");
    if (reqStandard === "APP6" || reqStandard === "2525") {
      ms.setStandard(reqStandard);
    }

    const size              = parseIntParam(url.searchParams.get("size"), 40);
    const uniqueDesignation = url.searchParams.get("uniqueDesignation") ?? undefined;
    const higherFormation   = url.searchParams.get("higherFormation")   ?? undefined;
    const outlineColor      = url.searchParams.get("outlineColor")      ?? "white";
    const outlineWidth      = parseIntParam(url.searchParams.get("outlineWidth"), 6);

    try {
      const sym = new ms.Symbol(sidc, {
        size,
        uniqueDesignation,
        higherFormation,
        outlineColor,
        outlineWidth,
      });

      if (!sym.isValid()) {
        sendJson(res, 422, { error: `Invalid or unrecognised SIDC: "${sidc}"` });
        return;
      }

      if (req.method === "HEAD") {
        res.writeHead(200, {
          "content-type":                "image/svg+xml",
          "access-control-allow-origin": "*",
          "cache-control":               "public, max-age=86400, immutable",
        });
        res.end();
      } else {
        sendSvg(res, sym.asSVG());
      }
    } catch (err) {
      sendJson(res, 500, { error: err?.message ?? "Symbol render error" });
    }

    // Restore global standard if it was overridden per-request.
    if (reqStandard && reqStandard !== STANDARD) {
      ms.setStandard(STANDARD);
    }
    return;
  }

  sendJson(res, 404, { error: `Unknown endpoint: ${url.pathname}` });
}

// ─── Server ──────────────────────────────────────────────────────────────────

const server = http.createServer(handleRequest);

server.listen(PORT, HOST, () => {
  console.log(`[milsymbol-server] http://${HOST}:${PORT}  standard=${STANDARD}`);
  console.log(`  GET /health`);
  console.log(`  GET /symbol?sidc=<20-char-SIDC>[&size=40][&uniqueDesignation=...][&higherFormation=...]`);
});

server.on("error", (err) => {
  console.error("[milsymbol-server] Fatal:", err.message);
  process.exit(1);
});

function shutdown() {
  server.close(() => { console.log("[milsymbol-server] Stopped."); process.exit(0); });
}
process.on("SIGINT",  shutdown);
process.on("SIGTERM", shutdown);
