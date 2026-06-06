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

from fastapi import FastAPI, HTTPException
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
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)
app.include_router(whitebox_router)


class RunRequest(BaseModel):
    algorithm_id: str
    parameters: dict = {}


@app.get("/health")
def health():
    return {"status": "ok"}


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
