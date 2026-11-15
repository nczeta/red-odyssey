/** All spatial assumptions live here. LOCAL:WORKSPACE is NOT a planetary CRS.
 * Register verified planetary projections/transforms in registerProjections before use.
 * GeoJSON exports must declare their coordinate CRS in their layer configuration.
 */
export const appConfig = {
  region: null,
  spatial: {
    local: true,
    code: 'LOCAL:WORKSPACE',
    units: 'pixels', // Abstract drawing units. Never interpreted as metres or degrees.
    extent: [-4096, -4096, 4096, 4096],
    center: [0, 0],
    zoom: 2,
    minZoom: 0,
    maxZoom: 8,
  },
  registerProjections() {
    // Add verified Projection definitions or proj4 registration here.
    // Do not substitute terrestrial EPSG codes for a Mars CRS.
  },
  api: {
    routeUrl: null,
    responseCrs: null,
    timeoutMs: 30000,
  },
};

const layer = (id, name, type, icon, order) => ({
  id, name, type, icon, order,
  sourceUrl: null,
  crs: null,
  extent: null,
  visible: true,
  opacity: 1,
  legend: null,
  units: null,
  dataSource: null,
  resolution: null,
});

export const layerConfig = [
  layer('imagery', 'Orbital Imagery', 'xyz', 'layers', 0),
  layer('elevation', 'Elevation', 'xyz', 'mountain', 1),
  layer('hillshade', 'Hillshade', 'xyz', 'sun', 2),
  layer('slope', 'Slope', 'xyz', 'slope', 3),
  layer('contours', 'Contour Lines', 'geojson', 'contours', 4),
  layer('difficulty', 'Terrain Difficulty', 'geojson', 'difficulty', 5),
  layer('sites', 'Scientific Sites', 'geojson', 'pin', 6),
  layer('routes', 'Routes', 'geojson', 'route', 7),
];
