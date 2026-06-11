"""Raster processing sidecar endpoints (rasterio / numpy / contourpy).

QGIS-inspired raster tools that run on the managed conversion runtime with a
file path in and a file path out, mirroring the ``/conversion`` jobs. They reuse
the conversion job store and background runner, so the client polls results with
the same ``GET /conversion/jobs/{id}`` endpoint.

rasterio and numpy already ship in the managed runtime (pulled in transitively
by ``rio-cogeo``); ``contourpy`` is added for the Contour tool. When the runtime
cannot be resolved, ``/raster/status`` reports ``available: false`` and the
desktop app disables the Run button.
"""

from __future__ import annotations

import logging
import subprocess
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/raster", tags=["raster"])
logger = logging.getLogger(__name__)

_RESULT_MARKER = "GEOLIBRE_RESULT:"

RUNTIME_DISCOVERY_TIMEOUT_SECS = 10


class RuntimeBootstrapError(Exception):
    pass


def _clean_env() -> dict[str, str]:
    import os
    env = os.environ.copy()
    # Remove Python path hints that could interfere with the managed runtime.
    env.pop("PYTHONPATH", None)
    env.pop("PYTHONHOME", None)
    return env


def _subprocess_startup_kwargs() -> dict[str, Any]:
    import sys
    kwargs: dict[str, Any] = {}
    if sys.platform == "win32":
        import subprocess as sp
        kwargs["creationflags"] = sp.CREATE_NO_WINDOW
    return kwargs


def _is_within_roots(path: Path) -> bool:
    """Check if path is within allowed roots (GEOLIBRE_CONVERSION_ROOTS env var or /data)."""
    import os
    roots_env = os.environ.get("GEOLIBRE_CONVERSION_ROOTS", "")
    if roots_env:
        roots = [Path(r).resolve() for r in roots_env.split(os.pathsep) if r.strip()]
    else:
        roots = [Path("/data").resolve()]
    # Also allow the system temp dir for desktop usage.
    import tempfile
    roots.append(Path(tempfile.gettempdir()).resolve())
    resolved = path.resolve()
    return any(
        resolved == root or resolved.is_relative_to(root)
        for root in roots
        if root.exists()
    )


def _runtime_python() -> str:
    import os
    override = os.environ.get("GEOLIBRE_CONVERSION_PYTHON", "").strip()
    if override:
        return override
    import sys
    return sys.executable


def _validate_paths(input_path: str, output_path: str) -> tuple[str, str]:
    """Validate and resolve input/output file paths."""
    if not input_path.strip():
        raise HTTPException(status_code=400, detail="input_path is required")
    if not output_path.strip():
        raise HTTPException(status_code=400, detail="output_path is required")

    source = Path(input_path).expanduser()
    dest = Path(output_path).expanduser()

    if not source.is_file():
        raise HTTPException(
            status_code=400,
            detail=f"Input file not found: {input_path}",
        )
    if not _is_within_roots(source):
        raise HTTPException(
            status_code=403,
            detail="Input path is outside the allowed conversion directories",
        )
    if not _is_within_roots(dest) and not _is_within_roots(dest.parent):
        raise HTTPException(
            status_code=403,
            detail="Output path is outside the allowed conversion directories",
        )
    dest.parent.mkdir(parents=True, exist_ok=True)
    return str(source.resolve()), str(dest.resolve())


# ---------------------------------------------------------------------------
# Job store (shared with conversion module when available, else standalone)
# ---------------------------------------------------------------------------

import asyncio
import json
import threading
import uuid
from dataclasses import dataclass, field


@dataclass
class _RasterJob:
    id: str
    status: str
    tool_id: str
    created_at: str
    updated_at: str
    messages: list[str] = field(default_factory=list)
    outputs: dict[str, Any] = field(default_factory=dict)
    error: str | None = None


_RASTER_JOBS: dict[str, _RasterJob] = {}
_RASTER_JOBS_LOCK = threading.Lock()


def _now_iso() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()


def _start_job(
    tool_id: str,
    script: str,
    params: dict[str, Any],
    output_name: str,
) -> dict[str, Any]:
    job_id = str(uuid.uuid4())
    now = _now_iso()
    job = _RasterJob(
        id=job_id,
        status="pending",
        tool_id=tool_id,
        created_at=now,
        updated_at=now,
    )
    with _RASTER_JOBS_LOCK:
        _RASTER_JOBS[job_id] = job

    def _run() -> None:
        python = _runtime_python()
        try:
            proc = subprocess.Popen(
                [python, "-c", script, json.dumps(params)],
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
                env=_clean_env(),
                **_subprocess_startup_kwargs(),
            )
            with _RASTER_JOBS_LOCK:
                job.status = "running"
                job.updated_at = _now_iso()

            result_data: dict[str, Any] | None = None
            assert proc.stdout is not None
            for line in proc.stdout:
                line = line.rstrip("\n")
                if line.startswith(_RESULT_MARKER):
                    try:
                        result_data = json.loads(line[len(_RESULT_MARKER):])
                    except json.JSONDecodeError:
                        pass
                else:
                    with _RASTER_JOBS_LOCK:
                        job.messages.append(line)
                        job.updated_at = _now_iso()

            proc.wait()
            with _RASTER_JOBS_LOCK:
                job.updated_at = _now_iso()
                if proc.returncode == 0:
                    job.status = "succeeded"
                    if result_data:
                        job.outputs[output_name] = result_data.get(
                            "output_path", result_data
                        )
                else:
                    job.status = "failed"
                    job.error = f"Process exited with code {proc.returncode}"
        except Exception as exc:
            with _RASTER_JOBS_LOCK:
                job.status = "failed"
                job.error = str(exc)
                job.updated_at = _now_iso()

    thread = threading.Thread(target=_run, daemon=True)
    thread.start()

    with _RASTER_JOBS_LOCK:
        return _job_to_dict(job)


def _job_to_dict(job: _RasterJob) -> dict[str, Any]:
    return {
        "id": job.id,
        "status": job.status,
        "tool_id": job.tool_id,
        "created_at": job.created_at,
        "updated_at": job.updated_at,
        "messages": list(job.messages),
        "outputs": dict(job.outputs),
        "error": job.error,
    }


# ---------------------------------------------------------------------------
# Embedded tool scripts
# ---------------------------------------------------------------------------

_HILLSHADE_SCRIPT = r"""
import json, sys
import numpy as np
import rasterio

params = json.loads(sys.argv[1])
input_path = params["input_path"]
output_path = params["output_path"]
azimuth = float(params.get("azimuth", 315))
altitude = float(params.get("altitude", 45))
_z = params.get("z_factor", 1)
z_factor = float(1 if _z is None else _z)

with rasterio.open(input_path) as src:
    elev = src.read(1, masked=True).astype("float64")
    xres, yres = src.res
    profile = src.profile.copy()

elev = np.ma.filled(elev, np.nan) * z_factor
dy, dx = np.gradient(elev, yres, xres)
slope = np.pi / 2.0 - np.arctan(np.sqrt(dx * dx + dy * dy))
aspect = np.arctan2(-dx, dy)
az = np.radians(360.0 - azimuth + 90.0)
alt = np.radians(altitude)
shaded = np.sin(alt) * np.sin(slope) + np.cos(alt) * np.cos(slope) * np.cos(az - aspect)
shaded = np.clip(shaded * 255.0, 0, 255)
shaded = np.where(np.isnan(shaded), 0, shaded).astype("uint8")
profile.update(dtype="uint8", count=1, nodata=0, compress="deflate")
with rasterio.open(output_path, "w", **profile) as dst:
    dst.write(shaded, 1)
print(f"Wrote hillshade to {output_path}")
print("GEOLIBRE_RESULT:" + json.dumps({"output_path": output_path}))
"""

_SLOPE_SCRIPT = r"""
import json, sys
import numpy as np
import rasterio

params = json.loads(sys.argv[1])
input_path = params["input_path"]
output_path = params["output_path"]
units = str(params.get("units", "degrees"))
_z = params.get("z_factor", 1)
z_factor = float(1 if _z is None else _z)
nodata = -9999.0

with rasterio.open(input_path) as src:
    elev = src.read(1, masked=True).astype("float64")
    xres, yres = src.res
    profile = src.profile.copy()

elev = np.ma.filled(elev, np.nan) * z_factor
dy, dx = np.gradient(elev, yres, xres)
rise_run = np.sqrt(dx * dx + dy * dy)
if units == "percent":
    out = rise_run * 100.0
else:
    out = np.degrees(np.arctan(rise_run))
out = np.where(np.isnan(out), nodata, out).astype("float32")
profile.update(dtype="float32", count=1, nodata=nodata, compress="deflate")
with rasterio.open(output_path, "w", **profile) as dst:
    dst.write(out, 1)
print(f"Wrote slope ({units}) to {output_path}")
print("GEOLIBRE_RESULT:" + json.dumps({"output_path": output_path}))
"""

_ASPECT_SCRIPT = r"""
import json, sys
import numpy as np
import rasterio

params = json.loads(sys.argv[1])
input_path = params["input_path"]
output_path = params["output_path"]
nodata = -9999.0

with rasterio.open(input_path) as src:
    elev = src.read(1, masked=True).astype("float64")
    xres, yres = src.res
    profile = src.profile.copy()

elev = np.ma.filled(elev, np.nan)
dy, dx = np.gradient(elev, yres, xres)
aspect = np.degrees(np.arctan2(dy, -dx))
aspect = np.where(
    aspect < 0,
    90.0 - aspect,
    np.where(aspect > 90.0, 360.0 - aspect + 90.0, 90.0 - aspect),
)
flat = np.hypot(dx, dy) < 1e-10
aspect = np.where(flat | np.isnan(aspect), nodata, aspect).astype("float32")
profile.update(dtype="float32", count=1, nodata=nodata, compress="deflate")
with rasterio.open(output_path, "w", **profile) as dst:
    dst.write(aspect, 1)
print(f"Wrote aspect to {output_path}")
print("GEOLIBRE_RESULT:" + json.dumps({"output_path": output_path}))
"""

_REPROJECT_SCRIPT = r"""
import json, sys
import rasterio
from rasterio.warp import Resampling, calculate_default_transform, reproject

params = json.loads(sys.argv[1])
input_path = params["input_path"]
output_path = params["output_path"]
dst_crs = str(params.get("dst_crs", "") or "").strip()
if not dst_crs:
    raise SystemExit("Target CRS (dst_crs) is required")
resampling_name = str(params.get("resampling", "nearest"))
if not hasattr(Resampling, resampling_name):
    raise SystemExit(f"Unsupported resampling method: {resampling_name}")
method = getattr(Resampling, resampling_name)

with rasterio.open(input_path) as src:
    transform, width, height = calculate_default_transform(
        src.crs, dst_crs, src.width, src.height, *src.bounds
    )
    profile = src.profile.copy()
    profile.update(crs=dst_crs, transform=transform, width=width, height=height, compress="deflate")
    with rasterio.open(output_path, "w", **profile) as dst:
        for i in range(1, src.count + 1):
            reproject(
                source=rasterio.band(src, i),
                destination=rasterio.band(dst, i),
                src_transform=src.transform,
                src_crs=src.crs,
                dst_transform=transform,
                dst_crs=dst_crs,
                resampling=method,
            )
print(f"Reprojected to {dst_crs} -> {output_path}")
print("GEOLIBRE_RESULT:" + json.dumps({"output_path": output_path}))
"""

_RESAMPLE_SCRIPT = r"""
import json, sys
import rasterio
from rasterio.transform import from_origin
from rasterio.warp import Resampling, reproject

params = json.loads(sys.argv[1])
input_path = params["input_path"]
output_path = params["output_path"]
resolution = float(params.get("resolution", 0) or 0)
if resolution <= 0:
    raise SystemExit("Target pixel size (resolution) must be > 0")
resampling_name = str(params.get("resampling", "bilinear"))
if not hasattr(Resampling, resampling_name):
    raise SystemExit(f"Unsupported resampling method: {resampling_name}")
method = getattr(Resampling, resampling_name)

with rasterio.open(input_path) as src:
    bounds = src.bounds
    width = max(1, int(round((bounds.right - bounds.left) / resolution)))
    height = max(1, int(round((bounds.top - bounds.bottom) / resolution)))
    transform = from_origin(bounds.left, bounds.top, resolution, resolution)
    profile = src.profile.copy()
    profile.update(transform=transform, width=width, height=height, compress="deflate")
    with rasterio.open(output_path, "w", **profile) as dst:
        for i in range(1, src.count + 1):
            reproject(
                source=rasterio.band(src, i),
                destination=rasterio.band(dst, i),
                src_transform=src.transform,
                src_crs=src.crs,
                dst_transform=transform,
                dst_crs=src.crs,
                resampling=method,
            )
print(f"Resampled to {resolution} units/pixel ({width}x{height}) -> {output_path}")
print("GEOLIBRE_RESULT:" + json.dumps({"output_path": output_path}))
"""

_CLIP_EXTENT_SCRIPT = r"""
import json, sys
import rasterio
from rasterio.errors import WindowError
from rasterio.windows import Window, from_bounds

params = json.loads(sys.argv[1])
input_path = params["input_path"]
output_path = params["output_path"]
minx = float(params["minx"])
miny = float(params["miny"])
maxx = float(params["maxx"])
maxy = float(params["maxy"])
if minx >= maxx or miny >= maxy:
    raise SystemExit("Extent must satisfy minx < maxx and miny < maxy")

with rasterio.open(input_path) as src:
    window = from_bounds(minx, miny, maxx, maxy, src.transform)
    window = window.round_offsets().round_lengths()
    try:
        window = window.intersection(Window(0, 0, src.width, src.height))
    except WindowError:
        raise SystemExit("Extent does not overlap the raster")
    data = src.read(window=window)
    if data.shape[1] == 0 or data.shape[2] == 0:
        raise SystemExit("Extent does not overlap the raster")
    transform = src.window_transform(window)
    profile = src.profile.copy()
    profile.update(height=data.shape[1], width=data.shape[2], transform=transform, compress="deflate")
    with rasterio.open(output_path, "w", **profile) as dst:
        dst.write(data)
print(f"Clipped to extent -> {output_path}")
print("GEOLIBRE_RESULT:" + json.dumps({"output_path": output_path}))
"""

_CLIP_MASK_SCRIPT = r"""
import json, re, sys
import rasterio
from rasterio.crs import CRS
from rasterio.mask import mask as rio_mask
from rasterio.warp import transform_geom

params = json.loads(sys.argv[1])
input_path = params["input_path"]
output_path = params["output_path"]
mask_path = params["mask_path"]
crop = bool(params.get("crop", True))
all_touched = bool(params.get("all_touched", False))

with open(mask_path) as f:
    gj = json.load(f)
gtype = gj.get("type")
if gtype == "FeatureCollection":
    shapes = [feat["geometry"] for feat in gj.get("features", []) if feat.get("geometry")]
elif gtype == "Feature":
    shapes = [gj["geometry"]] if gj.get("geometry") else []
else:
    shapes = [gj]
if not shapes:
    raise SystemExit("Mask layer has no geometries")

mask_crs = CRS.from_epsg(4326)
crs_member = gj.get("crs")
if isinstance(crs_member, dict):
    name = crs_member.get("properties", {}).get("name", "")
    digits = re.search(r"(\d+)$", str(name))
    if digits:
        try:
            mask_crs = CRS.from_epsg(int(digits.group(1)))
        except Exception:
            pass

with rasterio.open(input_path) as src:
    if src.crs is None:
        raise SystemExit("Input raster has no CRS; clip-by-mask requires a georeferenced raster.")
    if mask_crs != src.crs:
        shapes = [transform_geom(mask_crs, src.crs, geom) for geom in shapes]
    out_image, out_transform = rio_mask(src, shapes, crop=crop, all_touched=all_touched)
    profile = src.profile.copy()
    profile.update(height=out_image.shape[1], width=out_image.shape[2], transform=out_transform, compress="deflate")
    with rasterio.open(output_path, "w", **profile) as dst:
        dst.write(out_image)
print(f"Clipped by {len(shapes)} mask geometry(ies) -> {output_path}")
print("GEOLIBRE_RESULT:" + json.dumps({"output_path": output_path}))
"""

_POLYGONIZE_SCRIPT = r"""
import json, math, sys
import numpy as np
import rasterio
from rasterio.features import shapes as rio_shapes

params = json.loads(sys.argv[1])
input_path = params["input_path"]
output_path = params["output_path"]
band = int(params.get("band", 1))
connectivity = int(params.get("connectivity", 4))
field = str(params.get("field", "value"))

with rasterio.open(input_path) as src:
    arr = src.read(band)
    valid = None
    if src.nodata is not None:
        if isinstance(src.nodata, float) and math.isnan(src.nodata):
            valid = (~np.isnan(arr)).astype("uint8")
        else:
            valid = (arr != src.nodata).astype("uint8")
    transform = src.transform
    crs = src.crs

features = []
for geom, value in rio_shapes(arr, mask=valid, connectivity=connectivity, transform=transform):
    features.append({"type": "Feature", "properties": {field: value}, "geometry": geom})
fc = {"type": "FeatureCollection", "features": features}
if crs is not None and crs.to_epsg() and crs.to_epsg() != 4326:
    fc["crs"] = {"type": "name", "properties": {"name": f"urn:ogc:def:crs:EPSG::{crs.to_epsg()}"}}
with open(output_path, "w") as f:
    json.dump(fc, f)
print(f"Polygonized into {len(features)} feature(s) -> {output_path}")
print("GEOLIBRE_RESULT:" + json.dumps({"output_path": output_path}))
"""

_CONTOUR_SCRIPT = r"""
import json, sys
import numpy as np
import rasterio
from contourpy import contour_generator

params = json.loads(sys.argv[1])
input_path = params["input_path"]
output_path = params["output_path"]
band = int(params.get("band", 1))
interval = float(params.get("interval", 0) or 0)
if interval <= 0:
    raise SystemExit("Contour interval must be > 0")
base = float(params.get("base", 0) or 0)
attribute = str(params.get("attribute", "elev"))

with rasterio.open(input_path) as src:
    arr = src.read(band, masked=True).astype("float64")
    transform = src.transform
    crs = src.crs

data = np.ma.masked_invalid(np.ma.filled(arr, np.nan))
filled = data.filled(np.nan)
if not np.isfinite(filled).any():
    raise SystemExit("Raster band has no valid data to contour")
zmin = float(np.nanmin(filled))
zmax = float(np.nanmax(filled))
start = base + np.ceil((zmin - base) / interval) * interval
n_levels = int(np.floor((zmax - start) / interval + 1e-9)) + 1
levels = [round(start + i * interval, 6) for i in range(max(0, n_levels))]
if not levels:
    raise SystemExit(f"No contour levels fall within the data range [{zmin:.6g}, {zmax:.6g}]")

gen = contour_generator(z=data, line_type="Separate")
features = []
for value in levels:
    for line in gen.lines(value):
        coords = [[float(transform * (float(col), float(row)))[0],
                   float((transform * (float(col), float(row)))[1])]
                  for col, row in line]
        if len(coords) >= 2:
            features.append({"type": "Feature", "properties": {attribute: value}, "geometry": {"type": "LineString", "coordinates": coords}})
fc = {"type": "FeatureCollection", "features": features}
if crs is not None and crs.to_epsg() and crs.to_epsg() != 4326:
    fc["crs"] = {"type": "name", "properties": {"name": f"urn:ogc:def:crs:EPSG::{crs.to_epsg()}"}}
with open(output_path, "w") as f:
    json.dump(fc, f)
print(f"Generated {len(features)} contour line(s) -> {output_path}")
print("GEOLIBRE_RESULT:" + json.dumps({"output_path": output_path}))
"""

_RASTER_TOOL_SCRIPTS: dict[str, str] = {
    "hillshade": _HILLSHADE_SCRIPT,
    "slope": _SLOPE_SCRIPT,
    "aspect": _ASPECT_SCRIPT,
    "reproject": _REPROJECT_SCRIPT,
    "resample": _RESAMPLE_SCRIPT,
    "clip-extent": _CLIP_EXTENT_SCRIPT,
    "clip-mask": _CLIP_MASK_SCRIPT,
    "polygonize": _POLYGONIZE_SCRIPT,
    "contour": _CONTOUR_SCRIPT,
}

_OUTPUT_NAMES: dict[str, str] = {
    "polygonize": "vector",
    "contour": "vector",
}


class RasterToolRequest(BaseModel):
    tool_id: str
    input_path: str
    output_path: str
    parameters: dict[str, Any] = {}


def _validate_extra_input(
    path: str, label: str, allowed_extensions: set[str] | None = None
) -> str:
    if not path.strip():
        raise HTTPException(status_code=400, detail=f"{label} is required")
    source = Path(path).expanduser()
    if not source.is_file():
        raise HTTPException(status_code=400, detail=f"{label} not found: {path}")
    if not _is_within_roots(source):
        raise HTTPException(
            status_code=403,
            detail="Path is outside the allowed conversion directories",
        )
    if allowed_extensions and source.suffix.lower() not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=(
                f"{label} must be one of {sorted(allowed_extensions)}, "
                f"got '{source.suffix}'"
            ),
        )
    return str(source.resolve())


def _check_raster_import(python_executable: str) -> None:
    try:
        completed = subprocess.run(
            [python_executable, "-c", "import rasterio, numpy, contourpy"],
            check=False,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            env=_clean_env(),
            timeout=RUNTIME_DISCOVERY_TIMEOUT_SECS,
            **_subprocess_startup_kwargs(),
        )
    except subprocess.TimeoutExpired as exc:
        raise RuntimeBootstrapError(
            f"{python_executable}: import timed out after "
            f"{RUNTIME_DISCOVERY_TIMEOUT_SECS} seconds"
        ) from exc
    if completed.returncode != 0:
        detail = (
            completed.stderr.strip()
            or completed.stdout.strip()
            or "rasterio / contourpy import failed"
        )
        raise RuntimeBootstrapError(f"{python_executable}: {detail}")


@router.get("/status")
def raster_status() -> dict[str, Any]:
    """Return raster (rasterio + contourpy) runtime availability."""
    try:
        python = _runtime_python()
        _check_raster_import(python)
        return {
            "available": True,
            "message": "Raster runtime (rasterio + contourpy) is available.",
        }
    except RuntimeBootstrapError as exc:
        logger.warning("Raster runtime unavailable: %s", exc)
        return {
            "available": False,
            "message": "Raster runtime is unavailable. Install rasterio, numpy, and contourpy.",
        }
    except Exception:
        logger.exception("Unexpected error while checking raster runtime")
        return {
            "available": False,
            "message": "Raster runtime status check failed.",
        }


@router.post("/run")
def raster_run(request: RasterToolRequest) -> dict[str, Any]:
    """Run a single raster processing tool as a background job."""
    script = _RASTER_TOOL_SCRIPTS.get(request.tool_id)
    if script is None:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown raster tool: {request.tool_id}",
        )

    input_path, output_path = _validate_paths(request.input_path, request.output_path)
    params: dict[str, Any] = {
        **request.parameters,
        "input_path": input_path,
        "output_path": output_path,
    }

    if request.tool_id == "clip-mask":
        params["mask_path"] = _validate_extra_input(
            str(request.parameters.get("mask_path", "")),
            "Mask layer",
            allowed_extensions={".geojson", ".json"},
        )

    output_name = _OUTPUT_NAMES.get(request.tool_id, "raster")
    return _start_job(request.tool_id, script, params, output_name)


@router.get("/jobs/{job_id}")
def raster_job(job_id: str) -> dict[str, Any]:
    """Get the status of a raster job."""
    with _RASTER_JOBS_LOCK:
        job = _RASTER_JOBS.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"Job not found: {job_id}")
    with _RASTER_JOBS_LOCK:
        return _job_to_dict(job)
