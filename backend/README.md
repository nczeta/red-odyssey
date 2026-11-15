# Routing integration

`main.py` exposes `GET /api/health` and `POST /api/route` using the existing functions in `pathfinder.py`. Health is a liveness check: it does not load or validate the DEM. The first route request loads the terrain; subsequent requests reuse it in the same process.

## Run on Windows

From the repository root, with Python 3.12 or newer (tested with 3.14.6):

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --reload --reload-dir backend --host 127.0.0.1 --port 8000
```

No activation or PowerShell execution-policy change is required. Keep the original numerical DEM at `assets/M20_JezeroCrater_CTXDEM_20m.tif` (90,345,300 bytes). The frontend's colorized elevation TIFF cannot replace it. If missing, download the [original USGS DEM](https://planetarymaps.usgs.gov/mosaic/mars2020_trn/CTX/ScienceInvestigationMaps_JPL/M20_JezeroCrater_CTXDEM_20m.tif). `DEM_PATH` optionally selects a different file; relative paths resolve from the repository root. Its CRS must match the configured Martian projection. Restart the backend after changing terrain data or configuration.

In a second terminal, also from the repository root:

```powershell
cd frontend
npm.cmd install
npm.cmd run dev -- --host 127.0.0.1
```

Open `http://127.0.0.1:5173/app.html` (use the port Vite prints). Open Map Layers, select Route Planner, place A and B on the map, then Calculate route. Move an endpoint and calculate again, or clear both endpoints. The existing layer manager replaces the route. Loading, errors, cancellation and route metrics use the existing controls and styles.

Vite dev and preview proxy `/api` to port 8000. For production with separate origins, set the public frontend build variable `VITE_ROUTE_API_URL=https://your-backend.example/api/route` and set `CORS_ORIGINS=https://your-frontend.example` on the backend. Multiple origins are comma-separated, without trailing slashes. Same-origin hosting can keep `/api/route` and forward `/api` to FastAPI. A static production build has no Vite proxy.

## Existing execution flow

The API follows the numerical part of the original `__main__` block:

1. `load_dem(path)` reads the original masked raster and its georeferencing.
2. `compute_slope(dem)` computes the original gradient.
3. `get_valid_map(g)` applies the original maximum slope.
4. `compute_mult(g, valid_map, G0)` computes the original terrain costs.
5. `reorder_points(valid_map, [start_cell, *waypoint_cells, end_cell])` reorders intermediate stops when `reorder` is true; when false, the supplied order is retained. Start and destination stay fixed in both modes.
6. `find_path(points, mult, dem.res[0])` returns the original path and cost.

Steps 1–4 run once per process after a successful load. Steps 5–6 run per request. There is one full-raster search at a time per process; concurrent requests receive 503 and can retry. Client cancellation stops waiting for a result; a running Python search finishes on the server.

`pathfinder.py` has only two integration adjustments: its eager module-level DEM load was removed so imports work without loading terrain, and the DEM path inside `__main__` now resolves relative to the source file. All function definitions, parameters, calculations, constants and existing comments are unchanged. `dem.py` is unchanged. The original example, including its existing smoothing and plotting comparison, remains available:

```powershell
.\.venv\Scripts\python.exe -m backend.pathfinder
```

The API returns the original `find_path` result; it does not call `smooth_path`, plot, print or export files. Matplotlib is retained as a dependency because the existing module imports it; the API configures its noninteractive backend and puts its font cache in the temporary directory.

## Coordinates and errors

Requests contain `[x, y]` in projected Martian meters, never latitude/longitude or Earth coordinates:

```json
{
  "start": [4333010, 1139410],
  "end": [4355010, 1137410],
  "waypoints": [],
  "reorder": true,
  "crs": "MARS:JEZERO"
}
```

The actual DEM is 4,456 columns × 5,067 rows with 20 m pixels. Its bounds are approximately `[4329000, 1042080, 4418120, 1143420]`, smaller than the map imagery. The API verifies the DEM's own CRS against:

```text
+proj=eqc +lat_ts=18.4663 +lat_0=0 +lon_0=0 +x_0=0 +y_0=0 +R=3396190 +units=m +no_defs +type=crs
```

`rasterio.transform.rowcol` maps each input to its containing cell using the DEM's affine transform. Bounds, masked/NoData elevations and the original validity map are checked before calling routing functions. `rasterio.transform.xy(..., offset="center")` converts every returned cell back into map coordinates. No reprojection, smoothing or endpoint-to-cell straight segments are added. Returned endpoints are cell centers, at most about 14.14 m from their original clicks on this raster. Two endpoints in the same cell are rejected.

`waypoints` accepts up to 8 intermediate coordinates (default empty). `reorder` defaults to true, retaining the existing function's behavior. The limit bounds the factorial permutation search inside the unchanged `reorder_points`. Every route point must occupy a different DEM cell. The frontend's **Add stop** places a numbered stop; select a stop to move it or use its remove button. **Reorder stops** switches between reordering and insertion order without moving A or B. Changing points or this toggle clears the previous result and cancels the pending client request.

The response contains `crs`, a `route` FeatureCollection with one LineString, `waypointOrder` (zero-based indices into the submitted intermediate stops), and `metrics.Distance` in meters. All original path legs are joined, omitting only duplicate vertices at their common endpoints. `features[0].properties.cost` is the sum of the unchanged weighted costs from `find_path`, distinct from the geometric distance shown in the planner. The route summary follows the returned visit order while numbered map markers keep their original stop labels. This is projected planetary JSON geometry for the existing OpenLayers adapter, not longitude/latitude RFC 7946 interchange data.

Route contrast follows the top visible map (including layer order and zero opacity): cyan over Imagery/Slope, magenta over Elevation, yellow over Contours, white over Geology, each with a dark outline. Changing a map updates the existing route style immediately and does not request or calculate a new route.

- 422: malformed/nonfinite coordinates, unsupported CRS, outside DEM, NoData, blocked terrain, same cell or no connecting route.
- 503: unavailable/mismatched DEM or a search already running in the process.
- 500: unexpected calculation failure, with details in the backend logs.

The map projection, imagery bounds, existing layers and visual design are unchanged.

## Test the integration

With FastAPI running, test health and the original example cells `(200, 200)` → `(300, 1300)` through Vite:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/health
$routeBody = @{ start = @(4333010, 1139410); end = @(4355010, 1137410); crs = 'MARS:JEZERO' } | ConvertTo-Json
$routeResult = Invoke-RestMethod http://127.0.0.1:5173/api/route -Method Post -ContentType 'application/json' -Body $routeBody
$routeResult.route.features[0].geometry.coordinates.Count
$routeResult.metrics
```

Automated tests (from the root, no running server needed):

```powershell
.\.venv\Scripts\python.exe -m pip install httpx
.\.venv\Scripts\python.exe -m unittest discover -s backend/tests -v
cd frontend
npm.cmd test
npm.cmd run build
```

The backend suite includes a comparison against a fresh standalone run of the original function sequence on the real DEM. It compares every vertex and the exact cost before any smoothing. Other cases cover obstacles, disconnected regions, CRS, bounds, NoData, invalid input and unavailable/busy service. The real DEM must be present; it is not silently replaced or skipped.

For a visual check, calculate a route in the explorer and confirm the line joins A/B within one pixel, then recalculate with a new endpoint and clear it. Also check an endpoint outside DEM coverage gives an error, and existing map-layer controls and the 2D/3D switch still work. Browser visual verification remains manual if automation cannot access the browser.

Initial integration validation on Windows with the original DEM: 7 backend tests and 47 frontend tests passed; the three-page production build passed with its existing large-chunk warning. The API and a fresh standalone execution returned exactly 1,206 identical vertices, cost `30268.483421794`, and distance `27471.7 m` for the sample above. A live test through the Vite proxy exercised the real frontend adapter and OpenLayers vector objects: every geometry coordinate was preserved in `MARS:JEZERO`, replacing/clearing the route worked, and an outside-coverage request returned the terrain error. All original algorithm function signatures and bodies were also compared through Python's AST and were identical. The initial automated visual browser check was stopped by the Windows tool because it could not establish the current browser URL with sufficient confidence. The later multi-stop browser check below completed successfully.

The multi-stop extension passes 9 backend and 50 frontend tests, including both order modes against the original functions on the real DEM, full-route cost/distance, fixed endpoints, invalid intermediate stops, returned visit order, and automatic contrast when visibility/order/opacity changes. The production build passes with the existing large-chunk warning. The browser check of the initial integration described above was limited; the multi-stop extension has also been exercised in the actual explorer. Browser checks confirmed A ? 2 ? 1 ? B with reordering enabled and A ? 1 ? 2 ? B with it disabled, plus cyan/magenta/yellow/white route contrast on Imagery/Elevation/Contours/Geology.

## Vercel preparation and limits

No deployment, commit or push is performed. The root `pyproject.toml` selects `backend.main:app`; `vercel.json` selects FastAPI, explicitly includes the original DEM, excludes frontend/test/virtualenv files from the Python bundle, and sets a 300 s function duration. These settings are for a backend project rooted at the repository root. Deploy the existing Vite app separately with `frontend/` as its project root, then configure the URL and CORS origins above. Vercel documents [custom FastAPI entrypoints](https://vercel.com/docs/frameworks/backend/fastapi) and [function bundle inclusion](https://vercel.com/docs/functions/runtimes/python).

Native Linux wheels for NumPy, Rasterio/GDAL, scikit-image/SciPy and Matplotlib, the included DEM, final bundle size, cold-start cost and peak memory still need validation in an actual Vercel build. A local Windows run is not proof of Linux deployment compatibility. The [documented limits](https://vercel.com/docs/functions/limitations) include a 500 MB uncompressed standard Python bundle, 2 GB memory on Hobby, and 300 s maximum duration on Hobby (with larger limits/options on other plans). Long or disconnected routes can explore much of the 22.6-million-cell raster; cached maps consume memory in every worker and cold instance. Test representative long routes and the final build before using this backend there. If it exceeds those limits, host this same FastAPI application on a Python service with sufficient memory and point the Vite frontend to it.

In the live local sample, the first HTTP route took 14.338 s, the next 8.252 s, and the API process reached a peak Windows working set of 1,744,080,896 bytes (about 1.62 GiB). Installed Windows packages occupied about 421.7 MiB including pip and test dependencies, plus the 86.2 MiB DEM; this is not the final Linux function bundle size, but indicates that the standard bundle limit needs close attention. The timings and memory figures describe this machine and sample only.

## Files changed

- Created: `backend/main.py`, `backend/tests/test_api.py`, this README, root `requirements.txt`, `pyproject.toml` and `vercel.json`; the multi-stop extension adds `frontend/src/layers/routes.js`.
- Modified: the DEM import/path handling in `backend/pathfinder.py`; `frontend/src/config/app.js`, `frontend/src/services/api.js`, `frontend/vite.config.js`, `frontend/tests/core.test.js`, `frontend/README.md`; the multi-stop extension also touches `frontend/app.html`, `frontend/src/main.js`, `frontend/src/components/panels.js`, `frontend/src/map/createMap.js`, `frontend/src/layers/manager.js`, `frontend/src/style.css` and `frontend/tests/site.test.js`.
- The pre-existing user changes to the root `README.md` were preserved. No datasets or unrelated source files were edited; CSS additions use the existing planner controls, and map layers retain their original data and behavior.
