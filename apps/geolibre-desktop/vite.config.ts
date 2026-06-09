import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import type {
  RollupLog,
  RollupOptions,
  WarningHandlerWithDefault,
} from "rollup";
import { defineConfig, type Plugin } from "vite";

const GEOAGENT_BROWSER_BUNDLE = "maplibre-gl-geoagent/dist/browser-";
const EARTH_ENGINE_BROWSER_BUNDLE = "@google/earthengine/build/browser.js";
const GIS_CHUNK_WARNING_LIMIT_KB = 14000;
const APP_BASE = process.env.GEOLIBRE_APP_BASE;
const APP_VERSION = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
).version as string;
const WMS_PROXY_PATH = "/__geolibre_wms_proxy";
const WFS_PROXY_PATH = "/__geolibre_wfs_proxy";
const GPX_PROXY_PATH = "/__geolibre_gpx_proxy";
const RASTER_PROXY_PATH = "/__geolibre_raster_proxy";
/** Milsymbol local render server path (dev only — served by Vite middleware). */
const MILSYMBOL_PATH = "/__milsymbol";
/** Traccar proxy path (dev only — Vite server rewrites to traccar.intelligeo.net). */
const TRACCAR_DEV_PROXY_PATH = "/_traccar";
/** Default Traccar server for intelligeo.net deployments. */
const TRACCAR_INTELLIGEO_URL = "https://traccar.intelligeo.net";const DUCKDB_WORKER_PATH_PART = "/@duckdb/duckdb-wasm/dist/";
const DUCKDB_WORKER_SOURCE_MAP_RE =
  /\n?\/\/# sourceMappingURL=duckdb-browser-(?:eh|mvp)\.worker\.js\.map\s*$/;
const RADIX_OPTIMIZE_EXCLUDES = [
  "@developmentseed/geotiff",
  "@developmentseed/lzw-tiff-decoder",
  "@radix-ui/react-dialog",
  "@radix-ui/react-dropdown-menu",
  "@radix-ui/react-label",
  "@radix-ui/react-scroll-area",
  "@radix-ui/react-separator",
  "@radix-ui/react-slider",
  "@radix-ui/react-slot",
];

function manualChunks(id: string): string | undefined {
  if (!id.includes("node_modules")) return undefined;
  if (id.includes("@duckdb/duckdb-wasm")) return "duckdb";
  if (
    id.includes("maplibre-gl-geoagent") ||
    id.includes("@google/earthengine")
  ) {
    return "maplibre-geoagent";
  }
  if (id.includes("mapillary-js")) return "mapillary";
  if (id.includes("@geoman-io/maplibre-geoman-free")) return "maplibre-geoman";
  if (id.includes("maplibre-gl")) return "maplibre";
  if (id.includes("@turf/") || id.includes("turf")) return "turf";
  if (id.includes("proj4")) return "proj4";
  if (id.includes("geotiff") || id.includes("@developmentseed")) return "geotiff";
  if (id.includes("@radix-ui/")) return "radix-ui";
  if (id.includes("lucide-react")) return "lucide";
  if (id.includes("milsymbol")) return "milsymbol";
  if (
    id.includes("react-dom") ||
    id.includes("react/") ||
    id.includes("/react/")
  ) return "react";
  // Returning undefined hands remaining node_modules back to Rollup's default
  // chunking. We intentionally do not group them into a single "vendor" chunk:
  // that produced a circular manual-chunks warning. Do not re-add a catch-all
  // `return "vendor"` here without re-checking that warning.
  return undefined;
}

function onwarn(
  warning: RollupLog,
  defaultHandler: WarningHandlerWithDefault,
): void {
  if (
    warning.code === "EVAL" &&
    typeof warning.id === "string" &&
    (warning.id.includes(GEOAGENT_BROWSER_BUNDLE) ||
      warning.id.includes(EARTH_ENGINE_BROWSER_BUNDLE))
  ) {
    return;
  }

  defaultHandler(warning);
}

function wmsProxyPlugin(): Plugin {
  return {
    name: "geolibre-wms-proxy",
    configureServer(server) {
      server.middlewares.use(WMS_PROXY_PATH, async (req, res) => {
        try {
          await proxyWmsRequest(req, res);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "WMS proxy request failed";
          res.statusCode = 502;
          res.setHeader("content-type", "text/plain");
          res.end(message);
        }
      });
      server.middlewares.use(WFS_PROXY_PATH, async (req, res) => {
        try {
          await proxyBinaryRequest(req, res, WFS_PROXY_PATH);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "WFS proxy request failed";
          res.statusCode = 502;
          res.setHeader("content-type", "text/plain");
          res.end(message);
        }
      });
      server.middlewares.use(GPX_PROXY_PATH, async (req, res) => {
        try {
          await proxyBinaryRequest(req, res, GPX_PROXY_PATH);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "GPX proxy request failed";
          res.statusCode = 502;
          res.setHeader("content-type", "text/plain");
          res.end(message);
        }
      });
      server.middlewares.use(RASTER_PROXY_PATH, async (req, res) => {
        try {
          await proxyBinaryRequest(req, res, RASTER_PROXY_PATH);
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Raster proxy request failed";
          res.statusCode = 502;
          res.setHeader("content-type", "text/plain");
          res.end(message);
        }
      });
    },
  };
}

function stripDuckDbWorkerSourcemapPlugin(): Plugin {
  return {
    name: "geolibre-strip-duckdb-worker-sourcemap",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const requestUrl = new URL(req.url ?? "/", "http://localhost");
        const decodedPath = safeDecodeURIComponent(requestUrl.pathname);
        if (requestUrl.search || !isDuckDbWorkerRequest(decodedPath)) {
          next();
          return;
        }

        const workerFile = path.join(
          __dirname,
          "../../node_modules",
          decodedPath.slice(decodedPath.indexOf(DUCKDB_WORKER_PATH_PART) + 1),
        );
        const source = readFileSync(workerFile, "utf8").replace(
          DUCKDB_WORKER_SOURCE_MAP_RE,
          "",
        );
        res.statusCode = 200;
        res.setHeader("content-type", "application/javascript");
        res.end(source);
      });
    },
    generateBundle(_, bundle) {
      for (const asset of Object.values(bundle)) {
        if (
          asset.type === "asset" &&
          /duckdb-browser-(?:eh|mvp)\.worker-[\w-]+\.js$/.test(asset.fileName)
        ) {
          const source =
            typeof asset.source === "string"
              ? asset.source
              : Buffer.from(asset.source).toString("utf8");
          asset.source = source.replace(DUCKDB_WORKER_SOURCE_MAP_RE, "");
        }
      }
    },
  };
}

function isDuckDbWorkerRequest(pathname: string): boolean {
  return (
    pathname.includes(DUCKDB_WORKER_PATH_PART) &&
    /duckdb-browser-(?:eh|mvp)\.worker\.js$/.test(pathname)
  );
}

/**
 * milsymbolPlugin
 *
 * Vite dev-server middleware that renders APP-6D symbols to SVG on-the-fly.
 * Uses a global middleware (no connect path-prefix mounting) so that req.url
 * is always the full pathname and routing is unambiguous.
 *
 * Endpoints (relative to the Vite dev server):
 *   GET /__milsymbol/health
 *   GET /__milsymbol/symbol?sidc=<20-char>[&size=<px>]
 *                                         [&uniqueDesignation=<text>]
 *                                         [&higherFormation=<text>]
 *                                         [&outlineColor=<css>]
 *                                         [&outlineWidth=<n>]
 *                                         [&quantity=<text>]
 *                                         [&staffComments=<text>]
 *                                         [&additionalInformation=<text>]
 *                                         [&evaluationRating=<text>]
 *                                         [&combatEffectiveness=<text>]
 *                                         [&dtg=<text>]
 *                                         [&type=<text>]
 *                                         [&speed=<text>]
 *                                         [&altitudeDepth=<text>]
 */

/**
 * Post-process a milsymbol SVG string — mirrors KADAS milsymbol_engine.py.
 *
 *  1. stroke-linejoin="round" on the root <svg> so rectangular (Friend) frames
 *     don't show exaggerated miter spikes.
 *  2. Strip the "?" unknown-icon glyph milsymbol renders when an entity/modifier
 *     code is absent from its lookup tables.
 *  3. Strip the four small black corner-filler squares milsymbol draws on
 *     certain symbol sets (Activities, Installations, …).
 */
function postProcessMilsymbolSvg(svg: string): string {
  // 1. Inject stroke-linejoin="round" before the closing > of the opening <svg tag.
  const firstClose = svg.indexOf(">");
  if (firstClose !== -1 && !svg.slice(0, firstClose).includes("stroke-linejoin")) {
    svg = svg.slice(0, firstClose) + ' stroke-linejoin="round"' + svg.slice(firstClose);
  }
  // 2. Remove the "?" glyph (path d starting at m 94.8206,78.1372).
  svg = svg.replace(
    /<path\s[^>]*?d="m\s*94\.8206\s*,\s*78\.1372[^"]*"[^>]*>(?:<\/path>)?/g,
    "",
  );
  // 3. Remove corner filler squares: <path> with fill="black", stroke="none",
  //    whose d attribute contains exactly 4 'z'-closed sub-paths.
  svg = svg.replace(
    /<path\s(?:[^>]*?\s)?fill="black"(?:[^>]*?\s)?stroke="none"[^>]*d="[^"]*z[^"]*z[^"]*z[^"]*z[^"]*"[^>]*>(?:<\/path>)?/g,
    "",
  );
  return svg;
}

function milsymbolPlugin(): Plugin {
  // Load milsymbol once via CJS require so it runs in the Vite/Node.js server
  // context without any ESM-interop issues.  The package ships a CJS build at
  // its "main" entry which is always resolvable here.
  const _require = createRequire(import.meta.url);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const msRaw = _require("milsymbol") as any;
  const ms = (msRaw.default ?? msRaw) as typeof import("milsymbol").default;
  ms.setStandard("APP6");

  return {
    name: "geolibre-milsymbol",
    configureServer(server) {
      // Register as a global middleware — manually check the path prefix.
      // This avoids connect's path-prefix mounting which can strip/mangle
      // req.url in ways that differ between connect versions.
      server.middlewares.use((req, res, next) => {
        const raw = req.url ?? "/";
        if (!raw.startsWith(MILSYMBOL_PATH)) { next(); return; }

        (async () => {
          try {
            const url     = new URL(raw, "http://localhost");
            const subpath = url.pathname.slice(MILSYMBOL_PATH.length) || "/";

            // ── /health ────────────────────────────────────────────────────
            if (subpath === "/health" || subpath === "/") {
              res.statusCode = 200;
              res.setHeader("content-type",                "application/json");
              res.setHeader("access-control-allow-origin", "*");
              res.end(JSON.stringify({ status: "ok", standard: "APP6" }));
              return;
            }

            // ── /symbol ────────────────────────────────────────────────────
            if (subpath === "/symbol") {
              const sidc = url.searchParams.get("sidc") ?? "";
              if (!sidc) {
                res.statusCode = 400;
                res.setHeader("content-type", "application/json");
                res.end(JSON.stringify({ error: "Missing required parameter: sidc" }));
                return;
              }

              const p = url.searchParams;
              const size                 = parseInt(p.get("size") ?? "40", 10);
              const uniqueDesignation    = p.get("uniqueDesignation")    ?? undefined;
              const higherFormation      = p.get("higherFormation")      ?? undefined;
              const outlineColor         = p.get("outlineColor")         ?? "white";
              const outlineWidth         = parseInt(p.get("outlineWidth") ?? "6", 10);
              const quantity             = p.get("quantity")             ?? undefined;
              const staffComments        = p.get("staffComments")        ?? undefined;
              const additionalInformation= p.get("additionalInformation")?? undefined;
              const evaluationRating     = p.get("evaluationRating")     ?? undefined;
              const combatEffectiveness  = p.get("combatEffectiveness")  ?? undefined;
              const dtg                  = p.get("dtg")                  ?? undefined;
              const type                 = p.get("type")                 ?? undefined;
              const speed                = p.get("speed")                ?? undefined;
              const altitudeDepth        = p.get("altitudeDepth")        ?? undefined;

              const sym = new ms.Symbol(sidc, {
                size,
                uniqueDesignation,
                higherFormation,
                outlineColor,
                outlineWidth,
                quantity,
                staffComments,
                additionalInformation,
                evaluationRating,
                combatEffectiveness,
                dtg,
                type,
                speed,
                altitudeDepth,
              });

              // Do NOT gate on sym.isValid() — milsymbol 3.x returns falsy for
              // valid-but-partially-specified SIDCs (high echelon codes such as
              // Army/Corps/Army Group, and generic frame-only entities with
              // entity code 000000).  asSVG() is the authoritative render path:
              // if it produces a non-empty string the symbol can be displayed.
              const svg = postProcessMilsymbolSvg(sym.asSVG());
              if (!svg || svg.length < 10) {
                res.statusCode = 422;
                res.setHeader("content-type", "application/json");
                res.end(JSON.stringify({ error: `SIDC rendered empty: "${sidc}"` }));
                return;
              }
              const buf = Buffer.from(svg, "utf8");
              res.statusCode = 200;
              res.setHeader("content-type",                "image/svg+xml; charset=utf-8");
              res.setHeader("access-control-allow-origin", "*");
              res.setHeader("cache-control",               "public, max-age=86400, immutable");
              res.setHeader("content-length",              buf.byteLength);
              res.end(buf);
              return;
            }

            res.statusCode = 404;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ error: `Unknown milsymbol endpoint: ${subpath}` }));
          } catch (err) {
            const message = err instanceof Error ? err.message : "Milsymbol render error";
            res.statusCode = 500;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ error: message }));
          }
        })();
      });
    },
  };
}

function projectUrlQueryPlugin(): Plugin {
  return {
    name: "geolibre-project-url-query",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (isProjectUrlDocumentRequest(req)) {
          const requestUrl = new URL(req.url ?? "/", "http://localhost");
          req.url = requestUrl.pathname;
        }
        next();
      });
    },
  };
}

function isProjectUrlDocumentRequest(req: IncomingMessage): boolean {
  if (req.method !== "GET" && req.method !== "HEAD") return false;

  const accept = req.headers.accept ?? "";
  if (!accept.includes("text/html") && accept !== "*/*") return false;

  const requestUrl = new URL(req.url ?? "/", "http://localhost");
  if (requestUrl.pathname !== "/" && requestUrl.pathname !== "/index.html") {
    return false;
  }

  return (
    requestUrl.searchParams.has("url") ||
    requestUrl.searchParams.has("project") ||
    requestUrl.searchParams.has("projectUrl") ||
    requestUrl.searchParams.has("project_url") ||
    /^https?:\/\//i.test(safeDecodeURIComponent(requestUrl.search.slice(1)))
  );
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

async function proxyWmsRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  await proxyBinaryRequest(req, res, WMS_PROXY_PATH);
}

async function proxyBinaryRequest(
  req: IncomingMessage,
  res: ServerResponse,
  proxyPath: string,
): Promise<void> {
  const requestUrl = new URL(req.url ?? "", `http://localhost${proxyPath}`);
  const target = requestUrl.searchParams.get("url");
  if (!target || !/^https?:\/\//i.test(target)) {
    res.statusCode = 400;
    res.setHeader("content-type", "text/plain");
    res.end("Missing or invalid target URL");
    return;
  }

  const headers = new Headers();
  const range = req.headers.range;
  if (range) headers.set("range", range);

  const response = await fetch(target, { headers });
  const contentType =
    response.headers.get("content-type") ?? "application/octet-stream";
  const body = Buffer.from(await response.arrayBuffer());

  res.statusCode = response.status;
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("cache-control", "public, max-age=3600");
  res.setHeader("content-type", contentType);
  for (const header of ["accept-ranges", "content-length", "content-range"]) {
    const value = response.headers.get(header);
    if (value) res.setHeader(header, value);
  }
  res.end(body);
}

export default defineConfig({
  base: APP_BASE,
  plugins: [
    stripDuckDbWorkerSourcemapPlugin(),
    projectUrlQueryPlugin(),
    react(),
    wmsProxyPlugin(),
    milsymbolPlugin(),
  ],
  clearScreen: false,
  define: {
    __GEOLIBRE_VERSION__: JSON.stringify(APP_VERSION),
  },
  server: {
    port: 5173,
    strictPort: true,
    // Dev-only transparent proxy for Traccar intelligeo.net so the browser
    // doesn't hit CORS on direct-mode calls during development.
    // Requests to /_traccar/… are rewritten to https://traccar.intelligeo.net/…
    // In production the backend proxy (traccar-proxy endpoint) is used instead.
    proxy: {
      [TRACCAR_DEV_PROXY_PATH]: {
        target:       TRACCAR_INTELLIGEO_URL,
        changeOrigin: true,
        secure:       true,
        rewrite:      (p) => p.replace(new RegExp(`^${TRACCAR_DEV_PROXY_PATH}`), ""),
      },
    },
  },
  worker: {
    format: "es",
  },
  envPrefix: ["VITE_", "TAURI_"],
  optimizeDeps: {
    esbuildOptions: {
      target: "esnext",
    },
    exclude: RADIX_OPTIMIZE_EXCLUDES,
  },
  build: {
    target: "esnext",
    // Output to the monorepo root's build/ dir so Render's dashboard
    // "Publish directory: build" resolves correctly from the repo root.
    outDir: path.resolve(__dirname, "../../build"),
    emptyOutDir: true,
    minify: !process.env.TAURI_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_DEBUG,
    // Skip gzip-size calculation — saves ~200 MB of peak heap during bundling.
    reportCompressedSize: false,
    chunkSizeWarningLimit: GIS_CHUNK_WARNING_LIMIT_KB,
    rollupOptions: {
      onwarn,
      // Limit parallel file processing to reduce peak memory.
      maxParallelFileOps: 3,
      output: {
        manualChunks,
      },
    } satisfies RollupOptions,
  },
  resolve: {
    dedupe: ["react", "react-dom", "maplibre-gl", "three"],
    alias: {
      "@": path.resolve(__dirname, "./src"),
      module: path.resolve(__dirname, "./src/lib/browser-node-module.ts"),
    },
  },
});
