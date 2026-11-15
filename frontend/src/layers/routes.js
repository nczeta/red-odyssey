import { Style, Stroke } from 'ol/style.js';

const colors = {
  imagery: '#5EF0FF',
  elevation: '#FF59ED',
  slope: '#5EF0FF',
  contours: '#FFE66D',
  geology: '#FFFFFF',
};
const styles = new Map();

export function getRouteStyle(entries) {
  // Follow the top visible map when several backgrounds are enabled.
  const background = [...entries]
    .filter(({ config, layer }) => colors[config.id] && layer?.getVisible() && layer.getOpacity() > 0)
    .sort((a, b) => (b.layer.getZIndex() ?? b.config.order) - (a.layer.getZIndex() ?? a.config.order))[0];
  const color = colors[background?.config.id] || colors.imagery;
  if (!styles.has(color)) styles.set(color, [
    new Style({ stroke: new Stroke({ color: 'rgba(10,14,18,0.9)', width: 7 }), zIndex: 0 }),
    new Style({ stroke: new Stroke({ color, width: 3.5 }), zIndex: 1 }),
  ]);
  return styles.get(color);
}
