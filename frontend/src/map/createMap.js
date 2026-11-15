import Map from 'ol/Map.js';
import View from 'ol/View.js';
import Projection from 'ol/proj/Projection.js';
import { addProjection, get as getProjection } from 'ol/proj.js';
import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import Feature from 'ol/Feature.js';
import { Point, LineString } from 'ol/geom.js';
import { Circle as CircleStyle, Fill, Stroke, Style, Text } from 'ol/style.js';
import { defaults as defaultInteractions } from 'ol/interaction/defaults.js';
import Attribution from 'ol/control/Attribution.js';

export function createMap(config, onSelect) {
  config.registerProjections();
  const spatial = config.spatial;
  let projection = getProjection(spatial.code);
  if (!projection && spatial.local) {
    projection = new Projection({ code: spatial.code, units: spatial.units, extent: spatial.extent, global: false });
    addProjection(projection);
  }
  if (!projection) throw new Error(`Register the verified projection ${spatial.code} in config/app.js first.`);
  const view = new View({ projection, center: spatial.center, zoom: spatial.zoom, minZoom: spatial.minZoom, maxZoom: spatial.maxZoom, maxResolution: spatial.maxResolution, minResolution: spatial.minResolution, extent: spatial.extent, constrainOnlyCenter: !spatial.local, showFullExtent: true });
  const technical = new VectorSource({ wrapX: false });
  if (spatial.local) {
    const [minX, minY, maxX, maxY] = spatial.extent;
    for (let x = minX; x <= maxX; x += 256) technical.addFeature(new Feature(new LineString([[x, minY], [x, maxY]])));
    for (let y = minY; y <= maxY; y += 256) technical.addFeature(new Feature(new LineString([[minX, y], [maxX, y]])));
    const origin = new Feature(new Point([0, 0]));
    origin.setStyle(new Style({ image: new CircleStyle({ radius: 3, fill: new Fill({ color: '#748078' }) }) }));
    technical.addFeature(origin);
  }
  const grid = new VectorLayer({ source: technical, zIndex: -100, style: new Style({ stroke: new Stroke({ color: 'rgba(148,159,155,0.065)', width: 1 }) }) });
  const selectionSource = new VectorSource({ wrapX: false });
  const selections = new VectorLayer({ source: selectionSource, zIndex: 10000 });
  const map = new Map({
    target: 'map', view,
    controls: [new Attribution({ collapsible: false })],
    interactions: defaultInteractions({ altShiftDragRotate: false, pinchRotate: false, onFocusOnly: true }),
    layers: [grid, selections],
  });
  map.on('singleclick', event => {
    const hit = map.forEachFeatureAtPixel(event.pixel, (feature, layer) => ({ feature, layer }), { layerFilter: layer => Boolean(layer.get('registryId')), hitTolerance: 6 });
    onSelect(event.coordinate, hit);
  });
  const target = document.querySelector('#map');
  target.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); onSelect(view.getCenter()); }
  });
  document.querySelector('#map-region').addEventListener('pointerdown', event => {
    if (!event.target.closest('button, input, a')) target.focus({ preventScroll: true });
  });
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const zoom = delta => view.animate({ zoom: Math.max(view.getMinZoom(), Math.min(view.getMaxZoom(), view.getZoom() + delta)), duration: motion.matches ? 0 : 180 });
  document.querySelector('#zoom-in').addEventListener('click', () => zoom(1));
  document.querySelector('#zoom-out').addEventListener('click', () => zoom(-1));
  const fitCoverage = (duration = 0) => {
    view.setRotation(0);
    view.fit(spatial.extent, { size: map.getSize(), padding: [64, 48, 64, 48], duration });
  };
  if (!spatial.local) fitCoverage();
  document.querySelector('#reset-view').addEventListener('click', () => {
    const duration = motion.matches ? 0 : 220;
    if (!spatial.local) fitCoverage(duration);
    else view.animate({ center: spatial.center, zoom: spatial.zoom, rotation: 0, duration });
  });
  let frame;
  const updateSize = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => map.updateSize());
  };
  const observer = new ResizeObserver(updateSize);
  observer.observe(document.querySelector('#map-region'));
  const setMarkers = (selected, start, end) => {
    selectionSource.clear();
    for (const [coordinate, label, color] of [[selected, '', '#D9C4AC'], [start, 'A', '#D38B6E'], [end, 'B', '#D9C4AC']]) {
      if (!coordinate) continue;
      const feature = new Feature(new Point(coordinate));
      feature.setStyle(new Style({
        image: new CircleStyle({ radius: label ? 13 : 6, fill: new Fill({ color: label ? '#252927' : color }), stroke: new Stroke({ color, width: label ? 1.5 : 2 }) }),
        text: label ? new Text({ text: label, font: '500 11px Inter, sans-serif', fill: new Fill({ color }) }) : undefined,
      }));
      selectionSource.addFeature(feature);
    }
  };
  return { map, updateSize, setMarkers, dispose() { observer.disconnect(); cancelAnimationFrame(frame); map.setTarget(undefined); } };
}
