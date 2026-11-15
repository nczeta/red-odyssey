import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import { Style, Fill, Stroke } from 'ol/style.js';
import { intersects } from 'ol/extent.js';
import { createRasterGroup } from './rasterGroup.js';

// Provisional categorical colors, not a recovered QGIS/USGS color standard.
const COLORS = ['#d89272', '#98aaa1', '#c7b276', '#a49bae', '#9fb6bd', '#ba9583', '#b9bd94', '#c2a6ad', '#91a4b8', '#c9bb9d', '#a9b080', '#b0a091', '#8ca69d', '#bbab78', '#a3909c', '#9aadaf', '#bd9f70'];

export function geologyStyles(features, field, dashed) {
  const keys = [...new Set(features.map(feature => String(feature.get(field) ?? 'Unspecified')))].sort((a, b) => a.localeCompare(b, 'en'));
  const styles = new Map(keys.map((key, index) => {
    const hex = COLORS[index % COLORS.length];
    const rgb = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16));
    return [key, { color: hex, style: new Style({
      fill: new Fill({ color: [...rgb, 0.14] }),
      stroke: new Stroke({ color: dashed ? 'rgba(217,196,172,0.65)' : 'rgba(151,187,194,0.75)', width: dashed ? 1.25 : 1, lineDash: dashed ? [4, 3] : undefined }),
    }) }];
  }));
  return { styles, style: feature => styles.get(String(feature.get(field) ?? 'Unspecified'))?.style };
}

export async function createGeologyLayer(config, projection, datasets) {
  const layers = [];
  const legends = ['Provisional vector symbology; original QGIS styles were not supplied. Raster colors are preserved. Fills: 14%. Colors distinguish recorded units, without ranking scientific importance.'];
  const stats = [];
  const legendGroups = [];
  try {
    for (const [index, features] of datasets.entries()) {
      const definition = config.vectors[index];
      // Both supplied datasets contain geological MultiPolygons, not POI points.
      if (features.some(feature => !['Polygon', 'MultiPolygon'].includes(feature.getGeometry()?.getType()))) {
        throw new Error(`Unexpected geometry in ${definition.name}; verify the dataset before styling it.`);
      }
      const source = new VectorSource({ features, wrapX: false });
      const styling = geologyStyles(features, definition.categoryField, index === 0);
      const layer = new VectorLayer({ source, style: styling.style, updateWhileAnimating: false, updateWhileInteracting: false });
      layers.push(layer);
      const extent = source.getExtent();
      if (!features.length || !extent.every(Number.isFinite) || !intersects(config.extent, extent)) {
        throw new Error(`${definition.name} does not overlap the verified Martian raster coverage. Check its CRS.`);
      }
      layer.set('datasetName', definition.name);
      layer.set('categoryStyles', styling.styles);
      legendGroups.push({
        title: definition.name,
        note: `Polygon fills 14% · ${index === 0 ? 'Dashed' : 'Solid'} boundaries`,
        items: [...styling.styles].map(([key, value]) => {
          const names = index === 1 ? [...new Set(features.filter(feature => String(feature.get(definition.categoryField)) === key).map(feature => feature.get('name')).filter(Boolean))] : [];
          return { label: key, detail: names.join(' / '), symbol: {
            type: 'polygon', fill: value.style.getFill().getColor(), stroke: value.style.getStroke().getColor(),
            width: value.style.getStroke().getWidth(), dash: value.style.getStroke().getLineDash(),
          } };
        }),
      });
      stats.push({ name: definition.name, count: features.length, extent: extent.slice(), categories: styling.styles.size, pointCount: 0 });
      legends.push(`${definition.name}: ${index === 0 ? 'dashed' : 'solid'} boundaries; categories from ${definition.categoryField}.\n` + [...styling.styles].map(([key, value]) => `${value.color} — ${key}`).join('\n'));
    }
  } catch (error) {
    for (const layer of layers) { layer.getSource().dispose(); layer.dispose(); }
    throw error;
  }
  const group = await createRasterGroup(config, projection, layers);
  group.set('legend', legends.join('\n\n') + '\n\nBoth datasets contain polygons only. No point POI records were supplied. Click a geological unit to inspect its original attributes in Location details. Color_ID has no documented color lookup and is not interpreted as a color.');
  group.set('geologyStats', stats);
  group.set('legendDefinition', {
    notes: ['Provisional vector symbology. The swatches below describe the polygon overlays.', 'The raster color-to-unit key is not supplied; its original QGIS colors are preserved.'],
    groups: legendGroups,
  });
  return group;
}
