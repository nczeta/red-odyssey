import logging
import math
import os
from functools import lru_cache
from pathlib import Path
from tempfile import gettempdir
from threading import Lock
from typing import Annotated, Literal

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from rasterio.crs import CRS
from rasterio.transform import rowcol, xy

from backend.dem import load_dem

# keep plotting and its cache separate from the API
os.environ.setdefault("MPLBACKEND", "Agg")
os.environ.setdefault("MPLCONFIGDIR", str(Path(gettempdir()) / "red-odyssey-matplotlib"))
from backend.pathfinder import compute_slope, get_valid_map, compute_mult, reorder_points, find_path, G0

MARS_CRS = "MARS:JEZERO"
MARS_PROJ4 = "+proj=eqc +lat_ts=18.4663 +lat_0=0 +lon_0=0 +x_0=0 +y_0=0 +R=3396190 +units=m +no_defs +type=crs"
ROOT = Path(__file__).resolve().parents[1]
logger = logging.getLogger(__name__)
routing_lock = Lock()

app = FastAPI(title="Red Odyssey routing")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in os.getenv("CORS_ORIGINS", "").split(",") if origin.strip()],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

Coordinate = tuple[Annotated[float, Field(strict=True, allow_inf_nan=False)], Annotated[float, Field(strict=True, allow_inf_nan=False)]]


class RouteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    start: Coordinate
    end: Coordinate
    waypoints: list[Coordinate] = Field(default_factory=list, max_length=8)
    reorder: bool = Field(default=True, strict=True)
    crs: Literal["MARS:JEZERO"] = MARS_CRS


@app.exception_handler(RequestValidationError)
async def invalid_request(_request, error):
    # invalid coordinates can contain NaN or infinity, which cannot be returned as JSON
    details = [{key: item[key] for key in ("loc", "msg", "type")} for item in error.errors()]
    return JSONResponse(status_code=422, content={"detail": details})


@lru_cache(maxsize=1)
def get_routing_data():
    """
    load the dem and compute the routing maps once per process
    """
    dem_path = Path(os.getenv("DEM_PATH", "assets/M20_JezeroCrater_CTXDEM_20m.tif"))
    if not dem_path.is_absolute():
        dem_path = ROOT / dem_path
    dem = load_dem(dem_path)
    if dem.crs != CRS.from_string(MARS_PROJ4):
        raise ValueError("The DEM must use the configured Martian projection")
    g = compute_slope(dem)
    valid_map = get_valid_map(g)
    mult = compute_mult(g, valid_map, G0)
    return dem, valid_map, mult


def to_cell(coordinate, dem, valid_map, name):
    """
    convert a map coordinate into a valid row and column of the dem
    """
    row, col = rowcol(dem.transform, *coordinate)
    row, col = int(row), int(col)
    if not (0 <= row < dem.z.shape[0] and 0 <= col < dem.z.shape[1]):
        raise HTTPException(422, f"{name} is outside the routing DEM coverage.")
    if np.ma.is_masked(dem.z[row, col]) or not np.isfinite(dem.z[row, col]):
        raise HTTPException(422, f"{name} is on a NoData cell in the DEM.")
    if not valid_map[row, col]:
        raise HTTPException(422, f"{name} is not traversable under the existing slope limit.")
    return row, col


@app.get("/api/health")
def health():
    return {"status": "ok", "crs": MARS_CRS}


@app.post("/api/route")
def route(request: RouteRequest):
    # avoid simultaneous full-raster searches in the same process
    if not routing_lock.acquire(blocking=False):
        raise HTTPException(503, "The route service is busy. Try again shortly.")
    try:
        try:
            dem, valid_map, mult = get_routing_data()
        except Exception:
            logger.exception("Could not prepare routing data")
            raise HTTPException(503, "Routing terrain data is unavailable. Check the backend DEM configuration.")

        start = to_cell(request.start, dem, valid_map, "Starting point")
        end = to_cell(request.end, dem, valid_map, "Destination")
        waypoints = [to_cell(point, dem, valid_map, f"Stop {i + 1}") for i, point in enumerate(request.waypoints)]
        points = [start, *waypoints, end]
        if len(set(points)) != len(points):
            raise HTTPException(422, "Choose all route points in different DEM cells.")

        try:
            if request.reorder:
                points = reorder_points(valid_map, points)
            paths, costs = find_path(points, mult, dem.res[0])
        except ValueError:
            raise HTTPException(422, "No route connects these endpoints under the existing terrain constraints.")

        if len(paths) != len(points) - 1 or any(not path for path in paths) or not all(math.isfinite(cost) for cost in costs):
            raise HTTPException(422, "No route connects these endpoints under the existing terrain constraints.")
        # join the original legs without repeating their shared endpoint
        cells = [*paths[0]]
        for path in paths[1:]:
            cells.extend(path[1:])
        rows, cols = zip(*cells)
        xs, ys = xy(dem.transform, rows, cols, offset="center")
        coordinates = [[float(x), float(y)] for x, y in zip(xs, ys)]
        distance = sum(math.dist(a, b) for a, b in zip(coordinates, coordinates[1:]))
        return {
            "crs": MARS_CRS,
            "waypointOrder": [waypoints.index(point) for point in points[1:-1]],
            "route": {
                "type": "FeatureCollection",
                "features": [{
                    "type": "Feature",
                    "properties": {"cost": float(sum(costs))},
                    "geometry": {"type": "LineString", "coordinates": coordinates},
                }],
            },
            "metrics": {"Distance": {"value": round(distance, 1), "units": "m"}},
        }
    except HTTPException:
        raise
    except Exception:
        logger.exception("Routing failed")
        raise HTTPException(500, "The route could not be calculated. Check the backend logs.")
    finally:
        routing_lock.release()
