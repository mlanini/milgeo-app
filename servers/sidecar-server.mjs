#!/usr/bin/env node
/**
 * sidecar-server.mjs
 *
 * Minimal GeoLibre processing sidecar implemented in Node.js with zero
 * external dependencies — uses only Node.js built-in modules.
 *
 * Designed for environments where Python / pip are blocked by group policy.
 * Provides the same HTTP contract as the FastAPI backend (geolibre_server)
 * so the Processing dialog in the UI connects successfully and the Whitebox
 * GitHub catalog loads, while execution requests return a descriptive error
 * rather than a silent connection-refused failure.
 *
 * Endpoints
 * ─────────
 *   GET  /health               → { status: "ok" }
 *   GET  /whitebox/status      → { available: false, message: "…" }
 *   GET  /whitebox/tools       → proxied from the GitHub snapshot URL
 *   GET  /whitebox/tools/:id   → tool detail from the snapshot (cached)
 *   POST /whitebox/run         → 503 with clear error message
 *   GET  /whitebox/jobs/:id    → 404
 *   GET  /whitebox/output      → 404
 *   POST /shutdown             → graceful shutdown
 *
 * Configuration (environment variables)
 * ──────────────────────────────────────
 *   GEOLIBRE_SIDECAR_PORT    TCP port (default: 8765)
 *   GEOLIBRE_SIDECAR_HOST    Bind address (default: 127.0.0.1)
 *
 * Usage
 * ─────
 *   node servers/sidecar-server.mjs
 *   # or via package.json script:
 *   npm run sidecar
 */

import http from "node:http";
import https from "node:https";

// ─── Config ──────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.GEOLIBRE_SIDECAR_PORT ?? "8765", 10);
const HOST = process.env.GEOLIBRE_SIDECAR_HOST ?? "127.0.0.1";

const WHITEBOX_SNAPSHOT_URL =
  "https://raw.githubusercontent.com/opengeos/Whitebox-Next-Gen-ArcGIS/main/WNG/data/catalog_snapshot.json";

const ALLOWED_ORIGINS = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "tauri://localhost",
  "http://tauri.localhost",
]);

// ─── Whitebox catalog cache ───────────────────────────────────────────────────

/** @type {{ tools: unknown[]; fetched_at: number } | null} */
let _catalogCache = null;
let _catalogFetchPromise = null;

async function fetchCatalog() {
  if (_catalogCache && Date.now() - _catalogCache.fetched_at < 3_600_000) {
    return _catalogCache.tools;
  }
  if (_catalogFetchPromise) return _catalogFetchPromise;

  _catalogFetchPromise = new Promise((resolve, reject) => {
    https.get(WHITEBOX_SNAPSHOT_URL, { headers: { accept: "application/json" } }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        try {
          const json = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          const tools = json.tools ?? [];
          _catalogCache = { tools, fetched_at: Date.now() };
          resolve(tools);
        } catch (e) {
          reject(e);
        } finally {
          _catalogFetchPromise = null;
        }
      });
    }).on("error", (e) => {
      _catalogFetchPromise = null;
      reject(e);
    });
  });

  return _catalogFetchPromise;
}

// ─── Response helpers ─────────────────────────────────────────────────────────

function cors(res, origin) {
  if (ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("access-control-allow-origin", origin);
  } else {
    res.setHeader("access-control-allow-origin", "http://localhost:5173");
  }
  res.setHeader("vary", "Origin");
}

function sendJson(res, status, body, origin) {
  cors(res, origin);
  const buf = Buffer.from(JSON.stringify(body), "utf8");
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": buf.byteLength,
  });
  res.end(buf);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

// ─── Route handlers ───────────────────────────────────────────────────────────

async function handleRequest(req, res) {
  const origin = req.headers.origin ?? "";
  const url = new URL(req.url ?? "/", `http://${HOST}:${PORT}`);
  const path = url.pathname;
  const method = req.method ?? "GET";

  // CORS preflight
  if (method === "OPTIONS") {
    cors(res, origin);
    res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
    res.setHeader("access-control-allow-headers", "content-type");
    res.writeHead(204);
    res.end();
    return;
  }

  // ── GET /health ────────────────────────────────────────────────────────────
  if (path === "/health" && method === "GET") {
    sendJson(res, 200, { status: "ok" }, origin);
    return;
  }

  // ── POST /shutdown ─────────────────────────────────────────────────────────
  if (path === "/shutdown" && method === "POST") {
    sendJson(res, 200, { status: "shutting_down" }, origin);
    setTimeout(shutdown, 100);
    return;
  }

  // ── GET /whitebox/status ───────────────────────────────────────────────────
  if (path === "/whitebox/status" && method === "GET") {
    sendJson(res, 200, {
      available: false,
      message:
        "Python runtime not available (pip/conda blocked by group policy). " +
        "Tool execution is disabled. The GitHub catalog is available for reference.",
      python: null,
    }, origin);
    return;
  }

  // ── GET /whitebox/tools ────────────────────────────────────────────────────
  if (path === "/whitebox/tools" && method === "GET") {
    try {
      const tools = await fetchCatalog();
      sendJson(res, 200, { tools, tool_count: tools.length }, origin);
    } catch (err) {
      sendJson(res, 502, {
        detail: `Could not fetch Whitebox catalog from GitHub: ${err?.message ?? err}`,
      }, origin);
    }
    return;
  }

  // ── GET /whitebox/tools/:id ────────────────────────────────────────────────
  const toolDetailMatch = path.match(/^\/whitebox\/tools\/(.+)$/);
  if (toolDetailMatch && method === "GET") {
    const toolId = decodeURIComponent(toolDetailMatch[1]);
    try {
      const tools = await fetchCatalog();
      const tool = tools.find((t) => t.id === toolId);
      if (!tool) {
        sendJson(res, 404, { detail: `Tool not found: ${toolId}` }, origin);
      } else {
        sendJson(res, 200, tool, origin);
      }
    } catch (err) {
      sendJson(res, 502, { detail: `Catalog unavailable: ${err?.message ?? err}` }, origin);
    }
    return;
  }

  // ── POST /whitebox/run ─────────────────────────────────────────────────────
  if (path === "/whitebox/run" && method === "POST") {
    sendJson(res, 503, {
      detail:
        "Tool execution is not available: Python runtime is blocked by group policy. " +
        "To run Whitebox tools, install Python and start the GeoLibre Python sidecar: " +
        "cd backend/geolibre_server && uvicorn geolibre_server.app.main:app --port 8765",
    }, origin);
    return;
  }

  // ── GET /whitebox/jobs/:id ─────────────────────────────────────────────────
  if (path.startsWith("/whitebox/jobs/") && method === "GET") {
    sendJson(res, 404, { detail: "No active jobs: Python runtime not available." }, origin);
    return;
  }

  // ── GET /whitebox/output ───────────────────────────────────────────────────
  if (path === "/whitebox/output" && method === "GET") {
    sendJson(res, 404, { detail: "No output files: Python runtime not available." }, origin);
    return;
  }

  // ── 404 ───────────────────────────────────────────────────────────────────
  sendJson(res, 404, { detail: `Unknown endpoint: ${path}` }, origin);
}

// ─── Server ───────────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  try {
    await handleRequest(req, res);
  } catch (err) {
    const origin = req.headers.origin ?? "";
    if (!res.headersSent) {
      sendJson(res, 500, { detail: err?.message ?? "Internal server error" }, origin);
    }
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[geolibre-sidecar] Listening on http://${HOST}:${PORT}`);
  console.log(`[geolibre-sidecar] Mode: Node.js stub (Python runtime not available)`);
  console.log(`[geolibre-sidecar] Whitebox catalog: proxied from GitHub`);
  console.log(`[geolibre-sidecar] Whitebox execution: disabled`);
  console.log();
  console.log("  To enable tool execution, install the Python backend:");
  console.log("  cd backend/geolibre_server");
  console.log("  pip install -e .");
  console.log("  uvicorn geolibre_server.app.main:app --port 8765");
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `[geolibre-sidecar] Port ${PORT} is already in use. ` +
      `Is the Python sidecar already running? If so, no action needed.`
    );
  } else {
    console.error("[geolibre-sidecar] Fatal error:", err.message);
  }
  process.exit(1);
});

function shutdown() {
  server.close(() => {
    console.log("[geolibre-sidecar] Stopped.");
    process.exit(0);
  });
}
process.on("SIGINT",  shutdown);
process.on("SIGTERM", shutdown);
