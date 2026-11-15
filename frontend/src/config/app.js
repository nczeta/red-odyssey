import { IMAGERY_EXTENT, MARS_CRS, registerMarsProjection } from '../map/marsProjection.js';

/** GeoJSON exports must declare their verified coordinate CRS per layer. */
export const appConfig = {
  region: 'Jezero Crater',
  spatial: {
    local: false,
    code: MARS_CRS,
    units: 'm',
    extent: IMAGERY_EXTENT,
    center: [4375080, 1092220],
    maxResolution: 1280,
    minResolution: 5, // Up to 4x overzoom of the native 20 m pixels.
    zoom: 2,
    minZoom: 0,
    maxZoom: 8,
  },
  registerProjections() {
    registerMarsProjection();
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

// Raster visualizations were independently verified as QGIS-rendered uint8 RGBA.
// Their bounds happen to match; each entry still declares its own coverage.
const rgbaCog = (id, name, icon, order, filename, extent, visible, legend = null) => ({
    ...layer(id, name, 'cog', icon, order),
    sourceUrl: `${import.meta.env?.BASE_URL ?? '/'}maps/rasters/${filename}`,
    crs: MARS_CRS,
    extent,
    visible,
    // PhotometricInterpretation=RGB, ExtraSamples=unassociated alpha, uint8.
    // Fixed byte range preserves the exported colors and transparent margins.
    raster: { bands: [1, 2, 3, 4], min: 0, max: 255 },
    style: { color: ['color', ['*', ['band', 1], 255], ['*', ['band', 2], 255], ['*', ['band', 3], 255], ['band', 4]] },
    dataSource: `${name} · 20 m/pixel`,
    resolution: '20 m/pixel',
    units: 'RGBA (8-bit)',
    legend,
});

export const layerConfig = [
  rgbaCog('imagery', 'Mars Imagery', 'layers', 0, '01_Mars_Imagery_20m_COG.tif', IMAGERY_EXTENT, true),
  rgbaCog('elevation', 'Elevation', 'mountain', 1, '02_Elevation_20m_COG.tif', [4329000, 1041020, 4421160, 1143420], false,
    'QGIS rendered colors. Elevation values, vertical units and vertical datum are not encoded in this RGBA file.'),
  rgbaCog('slope', 'Slope', 'slope', 3, '05_Slope_20m_COG.tif', [4329000, 1041020, 4421160, 1143420], false,
    'QGIS rendered colors. Slope values and units (degrees or percent) are not encoded in this RGBA file.'),
  { ...rgbaCog('contours', 'Contour Lines', 'contours', 4, '03_Contour_Background_20m_COG.tif', [4329000, 1041020, 4421160, 1143420], false),
    type: 'contours',
    vectorUrl: `${import.meta.env?.BASE_URL ?? '/'}maps/vectors/03_Contour_Lines.geojson`,
    units: 'ELEV (m)',
    description: 'Contour lines join locations at the same elevation, with a vertical interval of 200 metres. A black raster background and the contour lines are shown together. Five equal elevation intervals determine the line colors.',
  },
  { ...rgbaCog('geology', 'Geological Map', 'layers', 5, '04_Geology_20m_COG.tif', [4329000, 1041020, 4421160, 1143420], false),
    type: 'geology', lazy: true, exclusiveMap: true,
    vectors: [
      { name: 'Goudge geology', categoryField: 'Unit_Name', url: `${import.meta.env?.BASE_URL ?? '/'}maps/vectors/04_Goudge_Geology.geojson` },
      { name: 'USGS geology', categoryField: 'symbol', url: `${import.meta.env?.BASE_URL ?? '/'}maps/vectors/04_USGS_Geology.geojson` },
    ],
    units: 'Geological units',
    description: 'Georeferenced geology raster with Goudge and USGS geological polygons. Click a unit to inspect its recorded name, symbols and identifiers in Location details. Both vector datasets contain polygons only; point POIs were not supplied. Vector colors are provisional.',
  },
  // Routing remains an internal result layer, without a dataset toggle.
  { ...layer('routes', 'Routes', 'geojson', 'route', 7), showInLayerPanel: false },
];

const descriptions = {
  imagery: 'Orbital imagery of Jezero Crater at 20 metres per pixel. Use it to explore surface features and compare them with the terrain layers.',
  elevation: 'A color visualization of Jezero’s elevation, preserving the original QGIS appearance. Combine it with imagery to explore the terrain.',
  slope: 'A color visualization of terrain slope, preserving the original QGIS appearance. Combine it with imagery to examine changes in terrain steepness.',
};
// Qualitative color keys supplied for the rendered QGIS maps. No numeric
// elevations, slope thresholds or units are inferred from the RGBA rasters.
const rasterLegends = {
  elevation: {
    notes: ['Original QGIS-rendered colors · 20 m/pixel.', 'Elevation from lowest to highest.'],
    colors: ['#d7191c', '#fdae61', '#ffffbf', '#abdda4', '#2b83ba'],
    labels: ['Lowest elevation', 'Lower elevation', 'Intermediate elevation', 'Higher elevation', 'Highest elevation'],
  },
  slope: {
    notes: ['Original QGIS-rendered colors · 20 m/pixel.', 'Slope from least to most steep.'],
    colors: ['#f2ecdd', '#c8a37d', '#9e9b63', '#b56e4f', '#b77257', '#6a4346', '#4f3237'],
    labels: ['Least steep', 'Gentle slope', 'Moderately gentle slope', 'Intermediate slope', 'Moderately steep slope', 'Steep slope', 'Steepest'],
  },
};
for (const config of layerConfig) {
  if (descriptions[config.id]) config.description = descriptions[config.id];
  const key = rasterLegends[config.id];
  if (key) config.legendDefinition = {
    notes: key.notes,
    groups: [{ items: key.colors.map((fill, index) => ({
      label: key.labels[index], detail: fill, symbol: { type: 'swatch', fill },
    })) }],
  };
  if (config.id === 'geology') config.legendDefinition = { notes: ['Vector categories will appear after the map has loaded.', 'The raster color-to-unit key is not supplied.'], groups: [] };
}
