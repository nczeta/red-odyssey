import GeoTIFF from 'ol/source/GeoTIFF.js';
import WebGLTileLayer from 'ol/layer/WebGLTile.js';

export async function createCogLayer(config, projection) {
  if (!config.sourceUrl) throw new Error('A COG URL is required.');
  const source = new GeoTIFF({
    sources: [{ url: config.sourceUrl, ...config.raster }],
    // The file uses a user-defined planetary CRS (GeoKey 32767).
    // Supply the verified projection; never look it up as an Earth EPSG code.
    projection,
    normalize: true,
    convertToRGB: false,
    wrapX: false,
    interpolate: true,
    attributions: config.attribution || undefined,
  });
  try {
    // getView() alone does not reject all metadata/HTTP errors in OL 10.
    // Observe the source state too, so the existing sidebar reports failures.
    await new Promise((resolve, reject) => {
      const check = () => {
        const state = source.getState();
        if (state !== 'ready' && state !== 'error') return;
        source.un('change', check);
        if (state === 'error') reject(source.getError() || new Error('COG metadata could not be loaded.'));
        else resolve();
      };
      source.on('change', check);
      check();
    });
    const metadata = await source.getView();
    if (config.extent && metadata.extent.some((value, index) => Math.abs(value - config.extent[index]) > 0.01)) {
      throw new Error(`COG coverage differs from the verified extent for ${config.name || config.id}. Check the dataset configuration.`);
    }
    const layer = new WebGLTileLayer({ source, style: config.style });
    layer.setExtent(metadata.extent);
    return layer;
  } catch (error) {
    source.dispose();
    throw error;
  }
}
