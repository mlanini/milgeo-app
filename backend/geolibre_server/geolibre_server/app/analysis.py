"""Raster analysis endpoints: Slope, Hillshade, Viewshed, and elevation
point-sampling.

These endpoints back the Analysis panel tools that previously required a local
Python sidecar. They accept a DEM URL (typically an OpenTopography API request)
and return a PNG image as a base64 data URL, making the tools available from
the hosted web version when ``VITE_SIDECAR_URL`` points at this backend.

Requires the ``raster`` optional dependency group:
    pip install -e ".[raster]"
"""

from __future__ import annotations

import base64
import io
import logging
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/analysis", tags=["analysis"])
logger = logging.getLogger(__name__)

# ─── Dependency check ─────────────────────────────────────────────────────────

def _ensure_rasterio():
    """Import rasterio or raise a 503 if it is not installed."""
    try:
        import rasterio  # noqa: F401
    except ImportError:
        raise HTTPException(
            status_code=503,
            detail=(
                "Raster analysis tools require the 'raster' extra: "
                'pip install -e ".[raster]"'
            ),
        )


# ─── Request models ───────────────────────────────────────────────────────────


class AnalysisRasterRequest(BaseModel):
    """Bounding-box driven raster tool request.

    ``dem_url`` is a full OpenTopography (or compatible) API URL that returns a
    GeoTIFF.  ``bbox`` duplicates the bounding box for downstream metadata; the
    actual raster extent is authoritative.
    """

    dem_url: str
    bbox: dict[str, float]  # keys: west, east, south, north


class ElevationFromRasterRequest(BaseModel):
    dtm_path: str
    points: list[dict[str, float]]  # each dict has "lon" and "lat" keys


# ─── Helpers ──────────────────────────────────────────────────────────────────

_DEM_DOWNLOAD_TIMEOUT_S = 60


def _download_dem(url: str) -> bytes:
    """Fetch a DEM GeoTIFF from a URL (typically an OpenTopography API URL)."""
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "milgeo-analysis/1.0"},
    )
    try:
        with urllib.request.urlopen(req, timeout=_DEM_DOWNLOAD_TIMEOUT_S) as resp:
            return resp.read()
    except urllib.error.HTTPError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"DEM download failed (HTTP {exc.code}): {exc.reason}",
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"DEM download failed: {exc}",
        ) from exc


def _array_to_png_data_url(
    arr: "np.ndarray",  # uint8, shape (H, W) or (H, W, 3)
    crs: Any = None,
    transform: Any = None,
) -> str:
    """Encode a uint8 numpy array as a PNG data URL using rasterio MemoryFile."""
    import numpy as np
    import rasterio
    from rasterio.io import MemoryFile

    if arr.ndim == 2:
        count, data = 1, arr[np.newaxis, :, :]
    else:
        count = arr.shape[2]
        data = np.moveaxis(arr, -1, 0)

    h, w = arr.shape[:2]
    profile: dict[str, Any] = {
        "driver": "PNG",
        "dtype": "uint8",
        "count": count,
        "width": w,
        "height": h,
    }
    if crs is not None:
        profile["crs"] = crs
    if transform is not None:
        profile["transform"] = transform

    with MemoryFile() as memfile:
        with memfile.open(**profile) as ds:
            ds.write(data)
        png_bytes = memfile.read()

    return "data:image/png;base64," + base64.b64encode(png_bytes).decode()


# ─── Slope ────────────────────────────────────────────────────────────────────


@router.post("/SlopeVs")
async def compute_slope(req: AnalysisRasterRequest) -> dict[str, Any]:
    """Download a DEM and return a slope-degree map as a PNG data URL.

    Slope is computed with numpy gradient and normalised to 0–255 (0° flat →
    white; 90° vertical → black).  The result can be overlaid directly on the
    map canvas as a semi-transparent image.
    """
    _ensure_rasterio()
    import numpy as np
    import rasterio

    dem_bytes = _download_dem(req.dem_url)

    with rasterio.open(io.BytesIO(dem_bytes)) as src:
        elev = src.read(1, masked=True).astype("float64")
        xres, yres = src.res
        crs = src.crs
        transform = src.transform

    elev_filled = np.ma.filled(elev, np.nan)
    dy, dx = np.gradient(elev_filled, yres, xres)
    slope_deg = np.degrees(np.arctan(np.sqrt(dx ** 2 + dy ** 2)))

    # 0° (flat) → 0, 90° (vertical) → 255
    arr = np.clip(slope_deg / 90.0 * 255.0, 0, 255)
    arr = np.where(np.isnan(arr), 0, arr).astype("uint8")

    return {"image_data_url": _array_to_png_data_url(arr, crs, transform)}


# ─── Hillshade ────────────────────────────────────────────────────────────────


@router.post("/Hillshade")
async def compute_hillshade(req: AnalysisRasterRequest) -> dict[str, Any]:
    """Download a DEM and return a hillshade image as a PNG data URL.

    Uses standard ESRI/GDAL hillshade formula with azimuth=315° (NW sun) and
    altitude=45°.  The output matches the ``raster.py`` hillshade tool.
    """
    _ensure_rasterio()
    import numpy as np
    import rasterio

    dem_bytes = _download_dem(req.dem_url)

    with rasterio.open(io.BytesIO(dem_bytes)) as src:
        elev = src.read(1, masked=True).astype("float64")
        xres, yres = src.res
        crs = src.crs
        transform = src.transform

    elev_filled = np.ma.filled(elev, np.nan)
    dy, dx = np.gradient(elev_filled, yres, xres)

    azimuth, altitude = 315.0, 45.0
    az_rad = np.radians(360.0 - azimuth + 90.0)
    alt_rad = np.radians(altitude)

    slope_r = np.pi / 2.0 - np.arctan(np.sqrt(dx ** 2 + dy ** 2))
    aspect_r = np.arctan2(-dx, dy)

    shaded = (
        np.sin(alt_rad) * np.sin(slope_r)
        + np.cos(alt_rad) * np.cos(slope_r) * np.cos(az_rad - aspect_r)
    )
    shaded = np.clip(shaded * 255.0, 0, 255)
    arr = np.where(np.isnan(shaded), 0, shaded).astype("uint8")

    return {"image_data_url": _array_to_png_data_url(arr, crs, transform)}


# ─── Viewshed ─────────────────────────────────────────────────────────────────

_OBSERVER_HEIGHT_M = 1.5  # default eye height above terrain
_MIN_BBOX_DEG = 0.05  # minimum 5 km buffer when bbox is a degenerate point


@router.post("/Viewshed")
async def compute_viewshed(req: AnalysisRasterRequest) -> dict[str, Any]:
    """Download a DEM and return a binary viewshed as a PNG data URL.

    The observer is the centre of the supplied bounding box (which is typically
    a single clicked point on the map).  A radial sweep from the observer
    determines which pixels are unobstructed.

    White pixels (255) are visible; black pixels (0) are hidden behind terrain.
    """
    _ensure_rasterio()
    import numpy as np
    import rasterio

    bbox = req.bbox
    west, east = bbox["west"], bbox["east"]
    south, north = bbox["south"], bbox["north"]

    obs_lon = (west + east) / 2.0
    obs_lat = (south + north) / 2.0

    dem_bytes = _download_dem(req.dem_url)

    with rasterio.open(io.BytesIO(dem_bytes)) as src:
        elev = src.read(1, masked=True).astype("float64")
        xres, yres = src.res
        crs = src.crs
        transform = src.transform
        rows, cols = src.height, src.width
        obs_row, obs_col = src.index(obs_lon, obs_lat)

    obs_row = int(np.clip(obs_row, 0, rows - 1))
    obs_col = int(np.clip(obs_col, 0, cols - 1))

    elev_np = np.ma.filled(elev, np.nan)
    obs_terrain = elev_np[obs_row, obs_col]
    obs_elev = (
        float(obs_terrain) if np.isfinite(obs_terrain) else float(np.nanmax(elev_np))
    ) + _OBSERVER_HEIGHT_M

    visible = _radial_viewshed(elev_np, obs_row, obs_col, obs_elev, xres, yres)
    arr = (visible * 255).astype("uint8")

    return {"image_data_url": _array_to_png_data_url(arr, crs, transform)}


def _radial_viewshed(
    elev: "np.ndarray",
    obs_row: int,
    obs_col: int,
    obs_elev: float,
    xres: float,
    yres: float,
) -> "np.ndarray":
    """Radial sweep viewshed (boolean array, True = visible).

    Sweeps ``n_angles`` rays from the observer outward, tracking the maximum
    slope seen so far on each ray.  All cells whose elevation exceeds the
    maximum slope up to that point are marked visible.

    Uses a pure-numpy inner loop over sample distances along each ray; the
    outer loop is over angles (a few hundred iterations).  This is fast enough
    for typical DEM tiles (~300 × 300 pixels) from OpenTopography.
    """
    import numpy as np

    rows, cols = elev.shape
    max_dist = float(np.sqrt(rows ** 2 + cols ** 2))
    cell_size = (xres + yres) / 2.0

    visible = np.zeros((rows, cols), dtype=bool)
    visible[obs_row, obs_col] = True

    # Enough angular steps so every cell gets visited at least once.
    n_angles = max(rows, cols) * 4

    for angle in np.linspace(0, 2 * np.pi, n_angles, endpoint=False):
        cos_a = np.cos(angle)
        sin_a = np.sin(angle)
        max_slope = float("-inf")

        for d in np.arange(1.0, max_dist, 0.7):
            r = int(round(obs_row + d * sin_a))
            c = int(round(obs_col + d * cos_a))
            if not (0 <= r < rows and 0 <= c < cols):
                break
            h = elev[r, c]
            if not np.isfinite(h):
                continue
            dist_m = d * cell_size
            slope = (h - obs_elev) / dist_m
            if slope >= max_slope:
                max_slope = slope
                visible[r, c] = True

    return visible


# ─── Elevation from local raster ─────────────────────────────────────────────


@router.post("/elevation_from_raster")
async def elevation_from_raster(req: ElevationFromRasterRequest) -> dict[str, Any]:
    """Sample elevations from a local GeoTIFF / ASC / HGT raster file.

    This endpoint only works when the backend is running on the **same machine**
    as the file (i.e. the local desktop sidecar scenario).  In the hosted web
    version the file path refers to the user's local disk, which is not
    accessible to the server.

    The frontend guards against calling this endpoint in web mode by
    disabling the "Local DTM" option in the DEM picker when not running inside
    the Tauri desktop webview.
    """
    _ensure_rasterio()
    import numpy as np
    import rasterio

    path = Path(req.dtm_path)
    if not path.is_file():
        raise HTTPException(
            status_code=400,
            detail=f"DTM file not found or not accessible: {req.dtm_path}",
        )

    elevations: list[float | None] = []
    with rasterio.open(str(path)) as src:
        nodata = src.nodata
        for pt in req.points:
            try:
                row, col = src.index(pt["lon"], pt["lat"])
                row, col = int(row), int(col)
                if 0 <= row < src.height and 0 <= col < src.width:
                    val = float(src.read(1)[row, col])
                    if nodata is not None and val == nodata:
                        elevations.append(None)
                    else:
                        elevations.append(val)
                else:
                    elevations.append(None)
            except Exception:
                elevations.append(None)

    return {"elevations": elevations}
