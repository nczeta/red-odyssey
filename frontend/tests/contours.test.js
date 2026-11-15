import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { fromFile } from 'geotiff';
import Feature from 'ol/Feature.js';
import LayerGroup from 'ol/layer/Group.js';
import { classifyContours, elevationValue, CONTOUR_COLORS } from '../src/layers/contours.js';
import { LayerManager, readGeoJSON } from '../src/layers/manager.js';
import { layerConfig } from '../src/config/app.js';
import { registerMarsProjection, MARS_CRS } from '../src/map/marsProjection.js';

const vectorFile = new URL('../public/maps/vectors/03_Contour_Lines.geojson', import.meta.url);
const rasterFile = new URL('../public/maps/rasters/03_Contour_Background_20m_COG.tif', import.meta.url);
const vectorBytes = await readFile(vectorFile);
const raw = JSON.parse(vectorBytes);
registerMarsProjection();
const feature = value => new Feature({ ELEV: value });

test('equal intervals include exact boundaries and maximum, with five reused styles and one alpha', () => {
  const features = [-3400, -2840, -2280, -1720, -1160, -600].map(feature);
  const classes = classifyContours(features);
  assert.deepEqual(classes.bounds, [-3400, -2840, -2280, -1720, -1160, -600]);
  assert.deepEqual(features.map(f => classes.indexFor(f.get('ELEV'))), [0, 1, 2, 3, 4, 4]);
  assert.equal(classes.width, 560);
  assert.equal(classes.styles.length, 5);
  assert.equal(classes.style(feature('-600')), classes.styles[4]);
  assert.equal(classes.style(feature(-600)), classes.style(feature(-600)));
  for (const [index, style] of classes.styles.entries()) {
    const color = style.getStroke().getColor();
    assert.equal(style.getStroke().getWidth(), 1);
    assert.equal(color[3], 0.65);
    assert.equal('#' + color.slice(0, 3).map(value => value.toString(16).padStart(2, '0')).join('').toUpperCase(), CONTOUR_COLORS[index]);
  }
});

test('missing, nonnumeric, nonfinite and constant elevations cannot crash rendering', () => {
  const invalid = [null, undefined, '', ' ', 'bad', NaN, Infinity, -Infinity, true, {}, []];
  for (const value of invalid) assert.equal(elevationValue(value), null);
  const classes = classifyContours([feature(10), feature('10'), ...invalid.map(feature)]);
  assert.equal(classes.min, 10);
  assert.equal(classes.max, 10);
  assert.equal(classes.invalidCount, invalid.length);
  assert.equal(classes.indexFor(10), 0);
  assert.equal(classes.style(feature(10)), classes.styles[0]);
  assert.equal(classes.style(feature(null)), undefined);
  const empty = classifyContours(invalid.map(feature));
  assert.equal(empty.min, null);
  assert.equal(empty.max, null);
  assert.deepEqual(empty.bounds, []);
  assert.equal(empty.style(feature(0)), undefined);
});

test('real contour geometries, elevations and black COG share the verified Martian grid', async () => {
  assert.equal(raw.crs, undefined, 'the GeoJSON does not explicitly identify its CRS');
  const features = readGeoJSON(raw, MARS_CRS, MARS_CRS);
  assert.equal(features.length, 4322);
  for (let index = 0; index < features.length; index++) {
    assert.deepEqual(features[index].getGeometry().getCoordinates(), raw.features[index].geometry.coordinates);
  }
  const classes = classifyContours(features);
  assert.equal(classes.min, -3400);
  assert.equal(classes.max, -600);
  assert.equal(classes.invalidCount, 0);
  assert.equal(classes.counts.reduce((sum, count) => sum + count, 0), 4322);
  assert.ok(classes.counts.every(count => count > 0));
  const values = [...new Set(features.map(f => f.get('ELEV')))].sort((a, b) => a - b);
  assert.ok(values.slice(1).every((value, index) => value - values[index] === 200));
  const tiff = await fromFile(fileURLToPath(rasterFile));
  try {
    const image = await tiff.getImage();
    const config = layerConfig.find(config => config.id === 'contours');
    assert.deepEqual(image.getBoundingBox(), config.extent);
    assert.deepEqual(image.getResolution(), [20, -20, 0]);
    const keys = image.getGeoKeys();
    assert.equal(keys.GTCitationGeoKey, 'Jezero_Crater_Projection');
    assert.equal(keys.GeogSemiMajorAxisGeoKey, 3396190);
    assert.equal(keys.GeogSemiMinorAxisGeoKey, 3396190);
    assert.equal(keys.ProjCoordTransGeoKey, 17);
    assert.equal(keys.ProjStdParallel1GeoKey, 18.4663);
    assert.equal(keys.ProjCenterLongGeoKey, 0);
    assert.equal(keys.ProjCenterLatGeoKey, 0);
    assert.deepEqual(Array.from(await image.readRasters({ window: [2304,2560,2305,2561], interleave: true })), [0,0,0,255]);
  } finally { await tiff.close(); }
});

test('registry loads both real resources once and controls their effective visibility as one group', async t => {
  const rasterBytes = await readFile(rasterFile);
  let vectorRequests = 0;
  const server = createServer((request, response) => {
    if (request.url === '/contours.geojson') {
      vectorRequests++;
      response.writeHead(200, { 'Content-Type': 'application/geo+json' }).end(vectorBytes);
      return;
    }
    const match = /^bytes=(\d+)-(\d+)$/.exec(request.headers.range || '');
    if (!match) { response.writeHead(400).end(); return; }
    const start = Number(match[1]), end = Math.min(Number(match[2]), rasterBytes.length - 1);
    response.writeHead(206, { 'Content-Range': `bytes ${start}-${end}/${rasterBytes.length}`, 'Content-Length': end-start+1 }).end(rasterBytes.subarray(start,end+1));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const url = `http://127.0.0.1:${server.address().port}`;
  const config = { ...layerConfig.find(config => config.id === 'contours'), sourceUrl: url+'/background.tif', vectorUrl: url+'/contours.geojson' };
  const map = { layers: [], addLayer(layer) { this.layers.push(layer); }, getView() { assert.fail('Contour loading must not change the view'); } };
  const manager = new LayerManager(map, [config], MARS_CRS);
  await manager.loadConfigured();
  const entry = manager.get('contours');
  assert.equal(entry.error, null);
  assert.equal(entry.state, 'configured');
  const group = entry.layer;
  assert.ok(group instanceof LayerGroup);
  const [background, vectors] = group.getLayers().getArray();
  t.after(() => { background.getSource().dispose(); background.dispose(); vectors.getSource().dispose(); vectors.dispose(); group.dispose(); });
  assert.equal(background.getSource(), group.get('rasterSource'));
  assert.equal(background.getSource().getProjection().getCode(), MARS_CRS);
  assert.equal(vectors.getSource().getFeatures().length, 4322);
  const legend=group.get('legendDefinition');
  const classes=group.get('classification');
  assert.equal(legend.groups[0].items.length,5);
  for (const [index,item] of legend.groups[0].items.entries()) {
    assert.deepEqual(item.range,[classes.bounds[index],classes.bounds[index+1]]);
    assert.equal(item.units,'m');
    assert.deepEqual(item.symbol.stroke,classes.styles[index].getStroke().getColor());
    assert.equal(item.symbol.width,classes.styles[index].getStroke().getWidth());
    assert.equal(item.upperInclusive,index===4);
  }
  assert.equal(group.getOpacity(), 1);
  assert.equal(vectors.getOpacity(), 1);
  assert.deepEqual(group.getLayerStatesArray().map(state => [state.visible, state.zIndex]), [[false,4],[false,4]]);
  manager.setVisible('contours', true);
  background.getSource().dispatchEvent('tileloadend');
  assert.equal(entry.state, 'ready');
  assert.deepEqual(group.getLayerStatesArray().map(state => [state.visible, state.opacity]), [[true,1],[true,1]]);
  manager.setVisible('contours', false);
  assert.ok(group.getLayerStatesArray().every(state => !state.visible));
  manager.setVisible('contours', true);
  await manager.load('contours');
  assert.equal(map.layers.length, 1);
  assert.equal(vectorRequests, 1);
  assert.match(entry.config.legend, /560 m/);
  background.getSource().dispatchEvent('tileloaderror');
  assert.equal(entry.state, 'error');
});
