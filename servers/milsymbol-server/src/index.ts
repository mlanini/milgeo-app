/**
 * @deprecated Use the standalone script at servers/milsymbol-server.mjs instead.
 * This file is kept only for IDE navigation; it is no longer part of any workspace.
 *
 *   node servers/milsymbol-server.mjs
 */
export {};

 * Endpoints
 * ─────────
 *   GET /health
 *       Returns: { "status": "ok", "standard": "APP6", "version": "<pkg>" }
 *
 *   GET /symbol?sidc=<20-char SIDC>[&size=<px>][&uniqueDesignation=<text>]
 *              [&higherFormation=<text>][&outlineColor=<css>][&outlineWidth=<n>]
 *              [&standard=APP6|2525]
 *       Returns: SVG image (image/svg+xml) with CORS and long-term cache headers.
 *
 * Configuration (environment variables)
 * ──────────────────────────────────────
 *   MILSYMBOL_PORT      TCP port to listen on (default: 5180)
 *   MILSYMBOL_HOST      Bind address (default: 127.0.0.1)
 *   MILSYMBOL_STANDARD  Symbol standard: APP6 | 2525 (default: APP6)
 */

import http from "node:http";
import { URL } from "node:url";
import ms from "milsymbol";

// ─── Config ────────────────────────────────────────────────────────────────

const PORT     = parseInt(process.env.MILSYMBOL_PORT     ?? "5180", 10);
const HOST     = process.env.MILSYMBOL_HOST              ?? "127.0.0.1";
const STANDARD = (process.env.MILSYMBOL_STANDARD ?? "APP6") as "APP6" | "2525";

// Apply standard globally once at startup.
ms.setStandard(STANDARD);

// ─── Helpers ───────────────────────────────────────────────────────────────

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type":                "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "content-length":              Buffer.byteLength(payload),
  });
  res.end(payload);
}

function sendError(res: http.ServerResponse, status: number, message: string): void {
  sendJson(res, status, { error: message });
}

function sendSvg(res: http.ServerResponse, svg: string): void {
  const buf = Buffer.from(svg, "utf8");
  res.writeHead(200, {
    "content-type":                "image/svg+xml; charset=utf-8",
    "access-control-allow-origin": "*",
    "cache-control":               "public, max-age=86400, immutable",
    "content-length":              buf.byteLength,
  });
  res.end(buf);
}

function parseIntParam(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

// ─── Request handler ───────────────────────────────────────────────────────

function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
  // Only GET and HEAD.
  if (req.method !== "GET" && req.method !== "HEAD") {
    sendError(res, 405, "Method not allowed");
    return;
  }

  const raw = req.url ?? "/";
  let url: URL;
  try {
    url = new URL(raw, `http://${HOST}:${PORT}`);
  } catch {
    sendError(res, 400, "Malformed URL");
    return;
  }

  // ── GET /health ──────────────────────────────────────────────────────────
  if (url.pathname === "/health") {
    sendJson(res, 200, { status: "ok", standard: STANDARD });
    return;
  }

  // ── GET /symbol?sidc=… ───────────────────────────────────────────────────
  if (url.pathname === "/symbol") {
    const sidc = url.searchParams.get("sidc") ?? "";
    if (!sidc) {
      sendError(res, 400, "Missing required query parameter: sidc");
      return;
    }

    // Allow per-request standard override (useful for mixed datasets).
    const reqStandard = url.searchParams.get("standard");
    if (reqStandard === "APP6" || reqStandard === "2525") {
      ms.setStandard(reqStandard);
    }

    const size               = parseIntParam(url.searchParams.get("size"), 40);
    const uniqueDesignation  = url.searchParams.get("uniqueDesignation") ?? undefined;
    const higherFormation    = url.searchParams.get("higherFormation")   ?? undefined;
    const outlineColor       = url.searchParams.get("outlineColor")      ?? "white";
    const outlineWidth       = parseIntParam(url.searchParams.get("outlineWidth"), 6);

    try {
      const sym = new ms.Symbol(sidc, {
        size,
        uniqueDesignation,
        higherFormation,
        outlineColor,
        outlineWidth,
      });

      if (!sym.isValid()) {
        sendError(res, 422, `Invalid or unrecognised SIDC: "${sidc}"`);
        return;
      }

      const svg = sym.asSVG();
      if (req.method === "HEAD") {
        res.writeHead(200, {
          "content-type":                "image/svg+xml",
          "access-control-allow-origin": "*",
          "cache-control":               "public, max-age=86400, immutable",
        });
        res.end();
      } else {
        sendSvg(res, svg);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Symbol render error";
      sendError(res, 500, message);
    }

    // Restore global standard if it was overridden per-request.
    if (reqStandard && reqStandard !== STANDARD) {
      ms.setStandard(STANDARD);
    }
    return;
  }

  // ── 404 ──────────────────────────────────────────────────────────────────
  sendError(res, 404, `Unknown endpoint: ${url.pathname}`);
}

// ─── Server ────────────────────────────────────────────────────────────────

const server = http.createServer(handleRequest);

server.listen(PORT, HOST, () => {
  console.log(`[milsymbol-server] Listening on http://${HOST}:${PORT}`);
  console.log(`[milsymbol-server] Standard: ${STANDARD}`);
  console.log(`[milsymbol-server] Endpoints:`);
  console.log(`  GET http://${HOST}:${PORT}/health`);
  console.log(`  GET http://${HOST}:${PORT}/symbol?sidc=<20-char>&size=<px>`);
});

server.on("error", (err: NodeJS.ErrnoException) => {
  console.error("[milsymbol-server] Fatal error:", err.message);
  process.exit(1);
});

// Graceful shutdown on Ctrl+C / SIGTERM (e.g. when used as a Tauri sidecar).
function shutdown(): void {
  server.close(() => {
    console.log("[milsymbol-server] Stopped.");
    process.exit(0);
  });
}
process.on("SIGINT",  shutdown);
process.on("SIGTERM", shutdown);
