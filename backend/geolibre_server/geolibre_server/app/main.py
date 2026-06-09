"""
GeoLibre processing sidecar (FastAPI).

Future integrations (v0.9+):
- GDAL / Rasterio — raster I/O, warping, COG
- GeoPandas — vector operations, reproject, buffer
- DuckDB Spatial — SQL on GeoParquet, spatial joins
- WhiteboxTools — hydrology, terrain analysis
- Leafmap — interactive mapping helpers
- GeoAI / SamGeo — segmentation and ML workflows
"""

from __future__ import annotations

import os
import signal
import threading
import time

import httpx
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .whitebox import router as whitebox_router

app = FastAPI(title="GeoLibre Server", version="0.8.0")

# Base allowed origins: local dev server + Tauri webview.
_CORS_ORIGINS = [
    r"http://localhost:\d+",
    r"http://127\.0\.0\.1:\d+",
    r"tauri://localhost",
    r"http://tauri\.localhost",
    # Any *.onrender.com subdomain (covers both the frontend and preview deploys).
    r"https://[a-zA-Z0-9-]+\.onrender\.com",
    # intelligeo.net deployments (Traccar + any co-hosted frontend).
    r"https://[a-zA-Z0-9-]+\.intelligeo\.net",
    # milgeo.app custom domain (dev / staging / production subdomains).
    r"https://[a-zA-Z0-9-]+\.milgeo\.app",
    r"https://milgeo\.app",
]
# Optional extra origin injected via environment variable (e.g. custom domain).
_extra_origin = os.environ.get("GEOLIBRE_CORS_ORIGIN", "").strip()
if _extra_origin:
    import re as _re
    _CORS_ORIGINS.append(_re.escape(_extra_origin))

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex="^(" + "|".join(_CORS_ORIGINS) + ")$",
    allow_credentials=False,
    # PUT and DELETE are required by the Traccar REST API
    # (e.g. update device, delete positions) when routed through this proxy.
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)
app.include_router(whitebox_router)


class RunRequest(BaseModel):
    algorithm_id: str
    parameters: dict = {}


@app.get("/health")
def health():
    return {"status": "ok"}


# ─── Traccar CORS proxy ───────────────────────────────────────────────────────

_SKIP_PROXY_HEADERS = frozenset(
    [
        "host",
        "x-traccar-target",
        "content-length",
        "transfer-encoding",
        "connection",
    ]
)


@app.api_route(
    "/traccar-proxy/{path:path}",
    methods=["GET", "POST", "DELETE", "PUT", "OPTIONS"],
)
async def traccar_proxy(request: Request, path: str) -> Response:
    """
    CORS proxy for Traccar API.

    The browser-side TraccarClient sends requests here when the Traccar server
    does not have the required Access-Control-Allow-Origin header.
    The X-Traccar-Target header must contain the full base URL of the Traccar
    server (e.g. https://traccar.example.com).
    """
    target = request.headers.get("X-Traccar-Target", "").strip().rstrip("/")
    if not target or not (
        target.startswith("http://") or target.startswith("https://")
    ):
        raise HTTPException(
            status_code=400,
            detail="Missing or invalid X-Traccar-Target header",
        )

    # Security: only forward to explicitly trusted Traccar origins.
    # Add more entries via the TRACCAR_ALLOWED_ORIGINS env var (comma-separated).
    _ALLOWED_TRACCAR_ORIGINS = {
        "https://traccar.intelligeo.net",
    }
    _extra_traccar = os.environ.get("TRACCAR_ALLOWED_ORIGINS", "").strip()
    if _extra_traccar:
        _ALLOWED_TRACCAR_ORIGINS.update(
            o.strip().rstrip("/") for o in _extra_traccar.split(",") if o.strip()
        )
    from urllib.parse import urlparse as _urlparse
    _parsed = _urlparse(target)
    _origin  = f"{_parsed.scheme}://{_parsed.netloc}"

    if _origin not in _ALLOWED_TRACCAR_ORIGINS:
        # Still allow any origin when running in dev/local mode
        # (i.e. when the request comes from localhost).
        _referer = request.headers.get("origin", request.headers.get("referer", ""))
        _is_local = any(
            _referer.startswith(p)
            for p in ("http://localhost", "http://127.0.0.1", "tauri://")
        )
        if not _is_local:
            raise HTTPException(
                status_code=403,
                detail=f"Traccar target not in allowed list: {_origin}",
            )

    forward_url = f"{target}/{path.lstrip('/')}"
    forward_headers = {
        k: v
        for k, v in request.headers.items()
        if k.lower() not in _SKIP_PROXY_HEADERS
    }
    body = await request.body()
    params = dict(request.query_params)

    try:
        async with httpx.AsyncClient(
            timeout=30.0, follow_redirects=True
        ) as client:
            proxy_resp = await client.request(
                method=request.method,
                url=forward_url,
                headers=forward_headers,
                content=body or None,
                params=params,
            )
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Traccar proxy upstream error: {exc}",
        ) from exc

    # Strip hop-by-hop headers that must not be forwarded
    skip_response = frozenset(["content-encoding", "transfer-encoding", "connection"])
    return Response(
        content=proxy_resp.content,
        status_code=proxy_resp.status_code,
        headers={
            k: v
            for k, v in proxy_resp.headers.items()
            if k.lower() not in skip_response
        },
    )


@app.post("/shutdown")
def shutdown():
    """Request graceful shutdown of the local sidecar process."""
    threading.Thread(target=_terminate_current_process, daemon=True).start()
    return {"status": "shutting_down"}


def _terminate_current_process() -> None:
    """Terminate the current process after the response is returned.

    Raises ``SIGINT`` rather than ``SIGTERM`` so uvicorn runs its graceful
    shutdown on every platform. On Windows ``os.kill`` with ``SIGTERM`` maps to
    an uncatchable ``TerminateProcess`` that would bypass lifespan shutdown.
    """
    time.sleep(0.2)
    signal.raise_signal(signal.SIGINT)


@app.get("/algorithms")
def algorithms():
    return {
        "algorithms": [
            {
                "id": "calculate-bounds",
                "name": "Calculate layer bounds",
                "description": "GDAL/GeoPandas-backed bounds (placeholder)",
            },
            {
                "id": "buffer",
                "name": "Buffer",
                "description": "GeoPandas buffer (placeholder)",
            },
            {
                "id": "reproject",
                "name": "Reproject",
                "description": "GDAL warp (placeholder)",
            },
        ]
    }


@app.post("/run")
def run_algorithm(req: RunRequest):
    # TODO(v0.5): Dispatch to GDAL, GeoPandas, WhiteboxTools, etc.
    raise HTTPException(
        status_code=501,
        detail={
            "message": "Sidecar /run not implemented yet",
            "algorithm_id": req.algorithm_id,
            "planned": [
                "GDAL",
                "Rasterio",
                "GeoPandas",
                "DuckDB Spatial",
                "WhiteboxTools",
                "Leafmap",
                "GeoAI",
                "SamGeo",
            ],
        },
    )


def run():
    import uvicorn

    uvicorn.run("geolibre_server.app.main:app", host="127.0.0.1", port=8765, reload=True)


if __name__ == "__main__":
    run()
