import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { fromFile } from 'geotiff';
import proj4 from 'proj4';
import { equivalent, get as getProjection, transform } from 'ol/proj.js';
import { appConfig, layerConfig } from '../src/config/app.js';
import { IMAGERY_EXTENT, MARS_CRS, MARS_PROJ4, registerMarsProjection } from '../src/map/marsProjection.js';
import { LayerManager } from '../src/layers/manager.js';

const file = new URL('../public/maps/rasters/01_Mars_Imagery_20m_COG.tif', import.meta.url);

test('Mars projection uses the raster sphere and equidistant cylindrical parameters', () => {
  const projection = registerMarsProjection();
  assert.equal(projection.getCode(), MARS_CRS);
  assert.equal(MARS_CRS, 'MARS:JEZERO');
  assert.equal(equivalent(projection, getProjection('MARS')), true);
  assert.deepEqual(transform(appConfig.spatial.center, 'MARS', MARS_CRS), appConfig.spatial.center);
  assert.equal(projection.getUnits(), 'm');
  assert.equal(projection.canWrapX(), false);
  assert.equal(proj4.defs('MARS').a, 3396190);
  assert.equal(proj4.defs('MARS').b, 3396190);
  const coordinate = proj4(MARS_PROJ4).forward([77.4, 18.4663]);
  assert.ok(coordinate[0] > IMAGERY_EXTENT[0] && coordinate[0] < IMAGERY_EXTENT[2]);
  assert.ok(coordinate[1] > IMAGERY_EXTENT[1] && coordinate[1] < IMAGERY_EXTENT[3]);
});

test('configured imagery matches actual COG coverage, RGBA, alpha and overviews', async () => {
  const tiff = await fromFile(fileURLToPath(file));
  try {
    const image = await tiff.getImage();
    const directory = image.getFileDirectory();
    assert.deepEqual(image.getBoundingBox(), appConfig.spatial.extent);
    assert.deepEqual(image.getResolution(), [20, -20, 0]);
    assert.equal(image.getSamplesPerPixel(), 4);
    assert.equal(directory.getValue('PhotometricInterpretation'), 2);
    assert.deepEqual(Array.from(directory.getValue('ExtraSamples')), [2]);
    assert.deepEqual(Array.from(directory.getValue('BitsPerSample')), [8, 8, 8, 8]);
    const keys = image.getGeoKeys();
    assert.equal(keys.GTCitationGeoKey, 'Jezero_Crater_Projection');
    assert.equal(keys.GeogSemiMajorAxisGeoKey, 3396190);
    assert.equal(keys.GeogSemiMinorAxisGeoKey, 3396190);
    assert.equal(keys.ProjCoordTransGeoKey, 17);
    assert.equal(keys.ProjStdParallel1GeoKey, 18.4663);
    assert.equal(keys.ProjCenterLongGeoKey, 0);
    assert.equal(keys.ProjCenterLatGeoKey, 0);
    assert.equal(await tiff.getImageCount(), 5);
    for (let index = 0; index < 5; index++) {
      assert.equal((await tiff.getImage(index)).getResolution(image)[0], 20 * 2 ** index);
    }
    assert.deepEqual(Array.from(await image.readRasters({ window: [2304, 2560, 2305, 2561], interleave: true })), [159, 113, 89, 255]);
    assert.equal((await image.readRasters({ window: [0, 0, 1, 1], interleave: true }))[3], 0);
  } finally {
    await tiff.close();
  }
});

for (const [id, filename, center] of [
  ['elevation', '02_Elevation_20m_COG.tif', [207, 151, 90, 255]],
  ['slope', '05_Slope_20m_COG.tif', [243, 237, 218, 255]],
]) {
  test(`${id} preserves the independently verified QGIS RGBA raster and planetary georeferencing`, async () => {
    const config = layerConfig.find(config => config.id === id);
    const tiff = await fromFile(fileURLToPath(new URL(`../public/maps/rasters/${filename}`, import.meta.url)));
    try {
      const image = await tiff.getImage();
      const directory = image.getFileDirectory();
      const keys = image.getGeoKeys();
      assert.equal(config.type, 'cog');
      assert.equal(config.crs, MARS_CRS);
      assert.equal(config.visible, false, 'imagery stays the default visible map');
      assert.deepEqual(image.getBoundingBox(), config.extent);
      assert.deepEqual([image.getWidth(), image.getHeight()], [4608, 5120]);
      assert.deepEqual(image.getResolution(), [20, -20, 0]);
      assert.equal(image.getSamplesPerPixel(), 4);
      assert.equal(directory.getValue('PhotometricInterpretation'), 2);
      assert.deepEqual(Array.from(directory.getValue('SampleFormat')), [1, 1, 1, 1]);
      assert.deepEqual(Array.from(directory.getValue('BitsPerSample')), [8, 8, 8, 8]);
      assert.deepEqual(Array.from(directory.getValue('ExtraSamples')), [2]);
      assert.equal(image.getGDALNoData(), null);
      assert.deepEqual(await image.getGDALMetadata(), { OVERVIEW_RESAMPLING: 'AVERAGE' });
      assert.equal(keys.GTCitationGeoKey, 'Jezero_Crater_Projection');
      assert.equal(keys.GeogSemiMajorAxisGeoKey, 3396190);
      assert.equal(keys.GeogSemiMinorAxisGeoKey, 3396190);
      assert.equal(keys.ProjCoordTransGeoKey, 17);
      assert.equal(keys.ProjStdParallel1GeoKey, 18.4663);
      assert.equal(keys.ProjCenterLongGeoKey, 0);
      assert.equal(keys.ProjCenterLatGeoKey, 0);
      assert.equal(keys.ProjFalseEastingGeoKey, 0);
      assert.equal(keys.ProjFalseNorthingGeoKey, 0);
      assert.equal(keys.ProjLinearUnitsGeoKey, 9001);
      assert.equal(await tiff.getImageCount(), 5);
      for (let index = 0; index < 5; index++) {
        assert.equal((await tiff.getImage(index)).getResolution(image)[0], 20 * 2 ** index);
      }
      assert.deepEqual(Array.from(await image.readRasters({ window: [2300, 2500, 2301, 2501], interleave: true })), center);
      assert.equal((await image.readRasters({ window: [0, 0, 1, 1], interleave: true }))[3], 0);
      assert.equal(config.units, 'RGBA (8-bit)');
      assert.match(config.legend, /not encoded/);
    } finally {
      await tiff.close();
    }
  });
}

test('all three real COGs load over HTTP ranges and reuse the registry without changing its view', async t => {
  const configs = layerConfig.filter(config => config.type === 'cog');
  assert.deepEqual(configs.map(config => config.id), ['imagery', 'elevation', 'slope']);
  const files = new Map(await Promise.all(configs.map(async config => {
    const filename = config.sourceUrl.split('/').at(-1);
    return [`/${filename}`, await readFile(new URL(`../public/maps/rasters/${filename}`, import.meta.url))];
  })));
  const ranges = [];
  const server = createServer((request, response) => {
    const bytes = files.get(request.url);
    if (!bytes) { response.writeHead(404).end(); return; }
    const match = /^bytes=(\d+)-(\d+)$/.exec(request.headers.range || '');
    if (!match) { response.writeHead(400).end(); return; }
    const start = Number(match[1]);
    const end = Math.min(Number(match[2]), bytes.length - 1);
    ranges.push([request.url, start, end]);
    response.writeHead(206, { 'Content-Type': 'image/tiff', 'Content-Range': `bytes ${start}-${end}/${bytes.length}`, 'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes' });
    response.end(bytes.subarray(start, end + 1));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  registerMarsProjection();
  const map = { layers: [], addLayer(layer) { this.layers.push(layer); }, getView() { assert.fail('Loading or toggling a layer must not modify the view'); } };
  const manager = new LayerManager(map, configs.map(config => ({ ...config, sourceUrl: `http://127.0.0.1:${server.address().port}/${config.sourceUrl.split('/').at(-1)}` })), MARS_CRS);
  await manager.loadConfigured();
  assert.equal(map.layers.length, 3);
  assert.equal(new Set(map.layers.map(layer => layer.getSource())).size, 3);
  for (const config of configs) {
    const entry = manager.get(config.id);
    assert.equal(entry.error, null);
    assert.equal(entry.state, config.visible ? 'loading' : 'configured');
    const source = entry.layer.getSource();
    t.after(() => { entry.layer.dispose(); source.dispose(); });
    const view = await source.getView();
    assert.equal(source.getProjection().getCode(), MARS_CRS);
    assert.deepEqual(view.extent, config.extent);
    assert.deepEqual(view.center, appConfig.spatial.center);
    assert.deepEqual(view.resolutions, [320, 160, 80, 40, 20]);
    assert.equal(source.bandCount, 4);
    assert.equal(source.getWrapX(), false);
    assert.ok(ranges.some(([url]) => url.endsWith(config.sourceUrl.split('/').at(-1))));
    manager.setVisible(config.id, true);
    source.dispatchEvent('tileloadend');
    assert.equal(entry.state, 'ready');
    manager.setOpacity(config.id, 0.4);
    assert.equal(entry.layer.getOpacity(), 0.4);
    await manager.load(config.id);
    assert.equal(map.layers.length, 3, 'repeated activation must not duplicate layers/sources');
  }
  const entry = manager.get('imagery');
  const source = entry.layer.getSource();
  manager.setVisible('imagery', false);
  assert.equal(entry.layer.getVisible(), false);
  assert.equal(manager.get('elevation').layer.getVisible(), true);
  assert.equal(manager.get('slope').layer.getVisible(), true);
  source.dispatchEvent('tileloaderror');
  assert.equal(entry.state, 'error');
  assert.match(entry.error, /HTTP range/);
});
