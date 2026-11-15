import LayerGroup from 'ol/layer/Group.js';
import { extend } from 'ol/extent.js';
import { createCogLayer } from './cog.js';

// Shared composition for Contour Lines and Geological Map. Children inherit the
// group z-index, and collection order keeps each vector above the raster.
export async function createRasterGroup(config, projection, vectors) {
  let background;
  try {
    background = await createCogLayer(config, projection);
  } catch (error) {
    for (const layer of vectors) { layer.getSource().dispose(); layer.dispose(); }
    throw error;
  }
  const group = new LayerGroup({ layers: [background, ...vectors] });
  group.set('rasterSource', background.getSource());
  const renderExtent = background.getExtent().slice();
  for (const layer of vectors) {
    layer.set('registryId', config.id);
    if (layer.getSource().getFeatures().length) extend(renderExtent, layer.getSource().getExtent());
  }
  group.set('renderExtent', renderExtent);
  return group;
}
