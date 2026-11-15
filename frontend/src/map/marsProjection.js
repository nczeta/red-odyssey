import proj4 from 'proj4';
import { register } from 'ol/proj/proj4.js';
import { get as getProjection } from 'ol/proj.js';

export const MARS_CRS = 'MARS:JEZERO';
export const MARS_LEGACY_CRS = 'MARS';
export const MARS_RADIUS = 3396190;
export const MARS_PROJ4 = '+proj=eqc +lat_ts=18.4663 +lat_0=0 +lon_0=0 +x_0=0 +y_0=0 +R=3396190 +units=m +no_defs +type=crs';

// Verified against raster 01's ModelTiepoint, ModelPixelScale and dimensions.
// This is the imagery coverage, not the (smaller) DEM extent.
export const IMAGERY_EXTENT = [4329000, 1041020, 4421160, 1143420];

export function registerMarsProjection() {
  proj4.defs(MARS_CRS, MARS_PROJ4);
  // Keep the working imagery CRS identifier as an equivalent alias.
  // Sharing the definition object registers identity transforms in OpenLayers.
  proj4.defs(MARS_LEGACY_CRS, proj4.defs(MARS_CRS));
  register(proj4);
  const legacy = getProjection(MARS_LEGACY_CRS);
  legacy.setGlobal(false);
  legacy.setExtent(IMAGERY_EXTENT);
  const projection = getProjection(MARS_CRS);
  projection.setGlobal(false);
  projection.setExtent(IMAGERY_EXTENT);
  return projection;
}
