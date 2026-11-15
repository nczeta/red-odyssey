import test from 'node:test';
import assert from 'node:assert/strict';
import Projection from 'ol/proj/Projection.js';
import { addProjection, addCoordinateTransforms } from 'ol/proj.js';
import { LayerManager, createLayer, readGeoJSON } from '../src/layers/manager.js';
import { LayoutState, readPanels, savePanels, STORAGE_KEY } from '../src/components/layout.js';
import { requestRoute } from '../src/services/api.js';

// Technical fixtures only. These are deliberately arbitrary local drawing coordinates.
const CRS = 'TEST:LOCAL';
addProjection(new Projection({ code: CRS, units: 'pixels', extent: [-1024, -1024, 1024, 1024], global: false }));
const pointData = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { name: '<technical fixture>' }, geometry: { type: 'Point', coordinates: [17, -31] } }] };
const vectorConfig = { id: 'sites', name: 'Test', type: 'geojson', sourceUrl: '/test-only.geojson', crs: CRS, visible: true, opacity: 1, order: 4 };
const api = { routeUrl: '/api/route', responseCrs: CRS, timeoutMs: 1000 };
const routeData = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[0, 0], [10, 10]] } }] };
const fakeMap = () => ({ layers: [], addLayer(layer) { this.layers.push(layer); }, removeLayer(layer) { this.layers = this.layers.filter(item => item !== layer); } });

test('all four panel configurations survive focus mode and independent toggles', () => {
  for (const left of [false, true]) for (const right of [false, true]) {
    const layout = new LayoutState({ left, right });
    assert.equal(layout.visible('left'), left);
    assert.equal(layout.visible('right'), right);
    layout.setFocus(true);
    layout.toggle('left');
    assert.equal(layout.visible('left'), false);
    assert.equal(layout.visible('right'), false);
    layout.setFocus(false);
    assert.deepEqual(layout.panels, { left, right });
    layout.toggle('left');
    assert.deepEqual(layout.panels, { left: !left, right });
  }
});

test('compact drawers are exclusive and never overwrite desktop preferences', () => {
  const layout = new LayoutState({ left: true, right: false }, true);
  assert.equal(layout.visible('left'), false);
  layout.toggle('left');
  assert.equal(layout.visible('left'), true);
  layout.toggle('right');
  assert.equal(layout.visible('left'), false);
  assert.equal(layout.visible('right'), true);
  layout.setFocus(true);
  layout.setFocus(false);
  assert.equal(layout.visible('right'), true);
  layout.compact = false;
  assert.deepEqual(layout.panels, { left: true, right: false });
});

test('preferences tolerate missing, malformed, denied and partially valid storage', () => {
  assert.deepEqual(readPanels(undefined), { left: false, right: false });
  for (const value of ['bad json', '{}', '{"left":true,"right":"false"}']) {
    assert.deepEqual(readPanels({ getItem: () => value }), { left: false, right: false });
  }
  const denied = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  assert.deepEqual(readPanels(denied), { left: false, right: false });
  assert.doesNotThrow(() => savePanels(denied, { left: false, right: true }));
  let saved;
  savePanels({ setItem: (key, value) => { assert.equal(key, STORAGE_KEY); saved = value; } }, { left: false, right: true });
  assert.deepEqual(readPanels({ getItem: () => saved }), { left: false, right: true });
});

test('GeoJSON preserves local coordinates, including when an in-file Earth CRS is present', () => {
  const features = readGeoJSON({ ...pointData, crs: { type: 'name', properties: { name: 'EPSG:4326' } } }, CRS, CRS);
  assert.deepEqual(features[0].getGeometry().getCoordinates(), [17, -31]);
  assert.throws(() => readGeoJSON(pointData, null, CRS), /explicitly/);
  assert.throws(() => readGeoJSON(pointData, 'UNREGISTERED:MARS', CRS), /not registered/);
  assert.throws(() => readGeoJSON(pointData, 'EPSG:4326', CRS), /No registered transformation/);
});

test('GeoJSON transforms only when a transformation has been registered', () => {
  const other = new Projection({ code: 'TEST:SHIFTED', units: 'pixels', extent: [-2000, -2000, 2000, 2000] });
  addProjection(other);
  addCoordinateTransforms(CRS, other, ([x, y]) => [x + 100, y + 200], ([x, y]) => [x - 100, y - 200]);
  assert.deepEqual(readGeoJSON(pointData, CRS, 'TEST:SHIFTED')[0].getGeometry().getCoordinates(), [117, 169]);
});

test('layer loading manages visibility, opacity and order on actual OL layer objects', async () => {
  const map = fakeMap();
  let requests = 0;
  const manager = new LayerManager(map, [vectorConfig], CRS, async () => { requests++; return { ok: true, json: async () => pointData }; });
  await manager.load('sites');
  assert.equal(requests, 1);
  assert.equal(manager.get('sites').state, 'ready');
  assert.equal(map.layers.length, 1);
  manager.setVisible('sites', false);
  manager.setOpacity('sites', 0.3);
  manager.setOrder('sites', 12);
  assert.equal(map.layers[0].getVisible(), false);
  assert.equal(map.layers[0].getOpacity(), 0.3);
  assert.equal(map.layers[0].getZIndex(), 12);
  assert.deepEqual(map.layers[0].getSource().getFeatures()[0].getGeometry().getCoordinates(), [17, -31]);
  manager.setOpacity('sites', 4);
  assert.equal(map.layers[0].getOpacity(), 1);
  await manager.load('sites');
  assert.equal(requests, 1);
  assert.throws(() => manager.register(vectorConfig), /duplicate/);
});

test('unconfigured layers never fetch and failures never report data loaded', async () => {
  const map = fakeMap();
  const manager = new LayerManager(map, [{ ...vectorConfig, sourceUrl: null }], CRS, () => { throw new Error('must not fetch'); });
  await manager.loadConfigured();
  assert.equal(manager.get('sites').state, 'unavailable');
  assert.equal(map.layers.length, 0);
  const failed = new LayerManager(map, [vectorConfig], CRS, async () => ({ ok: false, status: 404 }));
  await failed.loadConfigured();
  assert.equal(failed.get('sites').state, 'error');
  assert.match(failed.get('sites').error, /404/);
  assert.equal(map.layers.length, 0);
});

test('XYZ uses the explicit local CRS and dataset tile extent, not Earth defaults', async () => {
  const config = { ...vectorConfig, type: 'xyz', sourceUrl: '/technical-fixture/{z}/{x}/{y}.png', extent: [-512, -256, 512, 256], maxZoom: 3 };
  const layer = await createLayer(config, CRS);
  assert.equal(layer.getSource().getProjection().getCode(), CRS);
  assert.deepEqual(layer.getSource().getTileGrid().getExtent(), config.extent);
  assert.equal(layer.getSource().getWrapX(), false);
  assert.equal(layer.getSource().getTileGrid().getMaxZoom(), 3);
  await assert.rejects(() => createLayer({ ...config, extent: null }, CRS), /extent or tile grid/);
  await assert.rejects(() => createLayer({ ...config, type: 'cog' }, CRS), /not implemented/);
});

test('raster state follows tile completion and surfaces failures', async () => {
  const map = fakeMap();
  const config = { ...vectorConfig, type: 'xyz', sourceUrl: '/technical-fixture/{z}/{x}/{y}.png', extent: [-512, -512, 512, 512] };
  const manager = new LayerManager(map, [config], CRS);
  await manager.loadConfigured();
  assert.equal(manager.get('sites').state, 'loading');
  const source = manager.get('sites').layer.getSource();
  source.dispatchEvent('tileloadend');
  assert.equal(manager.get('sites').state, 'ready');
  source.dispatchEvent('tileloaderror');
  source.dispatchEvent('tileloadend');
  assert.equal(manager.get('sites').state, 'error');
});

test('returned route replaces the previous route and clears without leftover features', () => {
  const map = fakeMap();
  const manager = new LayerManager(map, [{ ...vectorConfig, id: 'routes', sourceUrl: null }], CRS);
  manager.setGeoJSON('routes', routeData, CRS);
  manager.setGeoJSON('routes', routeData, CRS);
  assert.equal(map.layers.length, 1);
  assert.equal(manager.get('routes').state, 'ready');
  manager.clear('routes');
  assert.equal(map.layers.length, 0);
  assert.equal(manager.get('routes').state, 'unavailable');
});

test('route API sends declared coordinates and CRS, without inventing absent metrics', async () => {
  const result = await requestRoute({ start: [0, 0], end: [10, 10], crs: CRS, api }, async (url, options) => {
    assert.equal(url, '/api/route');
    assert.equal(options.method, 'POST');
    assert.deepEqual(JSON.parse(options.body), { start: [0, 0], end: [10, 10], crs: CRS });
    return { ok: true, json: async () => ({ route: routeData }) };
  });
  assert.equal(result.metrics, null);
  assert.equal(result.crs, CRS);
});

test('route API rejects missing configuration, malformed routes, and HTTP errors', async () => {
  await assert.rejects(() => requestRoute({ start: [0, 0], end: [1, 1], crs: CRS, api: {} }, () => { throw new Error('must not fetch'); }), /must be configured/);
  const params = { start: [0, 0], end: [1, 1], crs: CRS, api };
  await assert.rejects(() => requestRoute(params, async () => ({ ok: false, status: 503 })), /503/);
  await assert.rejects(() => requestRoute(params, async () => ({ ok: true, json: async () => ({ route: pointData }) })), /line geometries/);
  await assert.rejects(() => requestRoute(params, async () => ({ ok: true, json: async () => ({ route: { type: 'FeatureCollection', features: [] } }) })), /no route features/);
});

test('changing endpoints can abort an in-flight route request', async () => {
  const controller = new AbortController();
  const pending = requestRoute({ start: [0, 0], end: [1, 1], crs: CRS, api, signal: controller.signal }, async (_url, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
  }));
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
});
