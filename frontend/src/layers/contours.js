import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import { Style, Stroke } from 'ol/style.js';
import { createRasterGroup } from './rasterGroup.js';

export const CONTOUR_COLORS = ['#6E6862', '#8B847D', '#A9A39C', '#C5C0BA', '#D9D6D1'];

export function elevationValue(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function classifyContours(features) {
  let min = Infinity;
  let max = -Infinity;
  let invalidCount = 0;
  for (const feature of features) {
    const value = elevationValue(feature.get('ELEV'));
    if (value === null) { invalidCount++; continue; }
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  const valid = min !== Infinity;
  const width = valid ? (max - min) / 5 : 0;
  const bounds = valid ? Array.from({ length: 6 }, (_, index) => min + width * index) : [];
  // Exactly five shared styles. Alpha is applied here once; vector/group opacity is 1.
  const styles = CONTOUR_COLORS.map(hex => new Style({ stroke: new Stroke({
    color: [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), 0.65],
    width: 1,
  }) }));
  const indexFor = value => {
    const number = elevationValue(value);
    if (!valid || number === null) return null;
    // Constant datasets use the first style; the maximum is clamped into class 5.
    return width === 0 ? 0 : Math.max(0, Math.min(4, Math.floor((number - min) / width)));
  };
  const counts = [0, 0, 0, 0, 0];
  for (const feature of features) {
    const index = indexFor(feature.get('ELEV'));
    if (index !== null) counts[index]++;
  }
  return {
    min: valid ? min : null, max: valid ? max : null, width, bounds, counts, invalidCount,
    styles, indexFor,
    style: feature => {
      const index = indexFor(feature.get('ELEV'));
      return index === null ? undefined : styles[index];
    },
  };
}

export async function createContourLayer(config, projection, features) {
  if (features.some(feature => !['LineString', 'MultiLineString'].includes(feature.getGeometry()?.getType()))) {
    throw new Error('Contour data must contain line geometries.');
  }
  const classification = classifyContours(features);
  const vectors = new VectorLayer({ source: new VectorSource({ features, wrapX: false }), style: classification.style });
  // The GeoJSON has no declared CRS. Reject coordinates outside the verified
  // planetary raster coverage, rather than silently treating them as Earth degrees.
  const bounds = vectors.getSource().getExtent();
  const coverage = config.extent;
  if (features.length && coverage && (bounds[0] < coverage[0] - 0.01 || bounds[1] < coverage[1] - 0.01 || bounds[2] > coverage[2] + 0.01 || bounds[3] > coverage[3] + 0.01)) {
    vectors.getSource().dispose();
    vectors.dispose();
    throw new Error('Contour coordinates fall outside the verified Martian raster coverage. Check the source CRS.');
  }
  const group = await createRasterGroup(config, projection, [vectors]);
  group.set('classification', classification);
  group.set('legendDefinition', {
    notes: [classification.min === null ? 'No valid ELEV values are available.'
      : `ELEV in metres. Contours every 200 m; ${classification.width === 0 ? 'one recorded elevation' : `color classes span ${classification.width} m`}.`, 'Line width 1 px · Opacity 65%'],
    groups: [{ items: classification.bounds.length ? (classification.width === 0 ? [0] : [0, 1, 2, 3, 4]).map(index => ({
      range: [classification.bounds[index], classification.bounds[index + 1]], units: 'm', upperInclusive: index === 4 || classification.width === 0,
      symbol: { type: 'line', background: '#000000', stroke: classification.styles[index].getStroke().getColor(), width: classification.styles[index].getStroke().getWidth() },
    })) : [] }],
  });
  const intervals = !classification.bounds.length ? 'No valid ELEV values; no contours are drawn.'
    : classification.width === 0 ? `${CONTOUR_COLORS[0]}: ${classification.min} m (all valid contours have the same elevation).`
    : `Five equal elevation intervals (${classification.width} m per class):\n` + CONTOUR_COLORS.map((color, index) =>
      `${color}: [${classification.bounds[index]}, ${classification.bounds[index + 1]}${index === 4 ? ']' : ')'} m`).join('\n');
  group.set('legend', `ELEV in metres. Vertical contour interval: 200 m.\n${intervals}\nLines: 1 px, opacity 65%. Invalid elevations are not drawn.`);
  return group;
}
