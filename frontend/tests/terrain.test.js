import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Window } from 'happy-dom';
import { initializeTerrain } from '../src/components/terrain.js';

const html = await readFile(new URL('../app.html', import.meta.url), 'utf8');
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };

function setup(t, loadViewer = async () => {}) {
  const win = new Window({ settings: { enableJavaScriptEvaluation: false, disableJavaScriptFileLoading: true } });
  const previous = { document: globalThis.document, matchMedia: globalThis.matchMedia };
  globalThis.document = win.document;
  globalThis.matchMedia = () => ({ matches: true });
  win.document.write(html);
  const root = win.document.querySelector('#app');
  let resizes = 0;
  let imports = 0;
  const announcements = [];
  const controller = initializeTerrain({
    root, sourceUrl: '/models/jezero-crater-3d.glb',
    onMapResize: () => resizes++, announce: message => announcements.push(message),
    loadViewer: () => { imports++; return loadViewer(); },
  });
  t.after(async () => {
    controller.dispose();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
    await win.happyDOM.close();
  });
  return { win, root, controller, announcements, $: selector => win.document.querySelector(selector), resizes: () => resizes, imports: () => imports };
}

test('3D is lazy and repeated switches preserve both viewports and restore map sizing', async t => {
  const env = setup(t);
  const { $, win, root } = env;
  const map = $('#map');
  const canvas = win.document.createElement('canvas');
  map.append(canvas);
  const layerControl = win.document.createElement('input');
  layerControl.type = 'checkbox';
  layerControl.checked = true;
  $('#layer-list').append(layerControl);
  $('#start-value').textContent = '17.0, -31.0';
  assert.equal(env.imports(), 0);
  assert.equal($('#terrain-view').hidden, true);
  $('[data-view-mode="3d"]').click();
  assert.ok(root.classList.contains('is-3d'));
  assert.equal(map.inert, true);
  assert.equal(map.hidden, false, 'map keeps its dimensions while visually hidden by CSS');
  assert.equal($('.skip-link').getAttribute('href'), '#terrain-view');
  await settle();
  const viewer = $('model-viewer');
  assert.equal(viewer.getAttribute('src'), '/models/jezero-crater-3d.glb');
  assert.ok(viewer.hasAttribute('camera-controls'));
  assert.equal(viewer.hasAttribute('disable-pan'), false);
  assert.equal(viewer.hasAttribute('disable-zoom'), false);
  viewer.dispatchEvent(new win.Event('load'));
  assert.equal($('#terrain-status').hidden, true);
  assert.equal($('#terrain-reset').disabled, false);
  viewer.cameraOrbit = '23deg 30deg 150%';
  for (let index = 0; index < 3; index++) {
    $('[data-view-mode="2d"]').click();
    assert.equal(map.inert, false);
    assert.equal(map.getAttribute('aria-hidden'), 'false');
    assert.equal($('#terrain-view').inert, true);
    assert.equal($('[data-view-mode="2d"]').getAttribute('aria-pressed'), 'true');
    assert.equal($('#map'), map);
    assert.equal(map.firstChild, canvas);
    assert.equal(layerControl.checked, true);
    assert.equal($('#start-value').textContent, '17.0, -31.0');
    $('[data-view-mode="3d"]').click();
    assert.equal($('model-viewer'), viewer);
    assert.equal(viewer.cameraOrbit, '23deg 30deg 150%');
  }
  assert.equal(env.imports(), 1);
  assert.equal(env.resizes(), 3);
  assert.equal($('#terrain-status').hidden, true);
});

test('model errors allow recovery, ignore events from replaced viewers and restore focus', async t => {
  const { $, win, controller } = setup(t);
  controller.setMode('3d');
  await settle();
  const failed = $('model-viewer');
  failed.dispatchEvent(new win.CustomEvent('progress', { detail: { totalProgress: 0.42 } }));
  assert.equal($('#terrain-progress').value, 0.42);
  failed.dispatchEvent(new win.Event('error'));
  assert.equal($('#terrain-error-actions').hidden, false);
  assert.equal($('#terrain-reset').disabled, true);
  $('#terrain-retry').focus();
  $('#terrain-retry').click();
  assert.equal(win.document.activeElement, $('#terrain-view'));
  await settle();
  const retry = $('model-viewer');
  assert.notEqual(retry, failed);
  failed.dispatchEvent(new win.Event('load'));
  assert.equal($('#terrain-status').hidden, false);
  retry.dispatchEvent(new win.Event('load'));
  assert.equal($('#terrain-status').hidden, true);
  retry.focus();
  controller.setMode('2d');
  assert.equal(win.document.activeElement, $('[data-view-mode="2d"]'));
});

test('switching back during import never reveals 3D or announces a hidden load', async t => {
  let resolve;
  const { $, win, controller, announcements } = setup(t, () => new Promise(done => { resolve = done; }));
  controller.setMode('3d');
  controller.setMode('2d');
  const count = announcements.length;
  resolve();
  await settle();
  $('model-viewer').dispatchEvent(new win.Event('load'));
  assert.equal($('#terrain-view').hidden, true);
  assert.equal($('#map').inert, false);
  assert.equal(announcements.length, count);
});

test('viewer import failure offers retry and disposal prevents late mounting', async t => {
  let reject = true;
  const env = setup(t, async () => { if (reject) throw new Error('offline'); });
  env.controller.setMode('3d');
  await settle();
  assert.equal(env.$('#terrain-error-actions').hidden, false);
  assert.match(env.$('#terrain-status-message').textContent, /could not start/);
  reject = false;
  env.$('#terrain-retry').click();
  env.controller.dispose();
  await settle();
  assert.equal(env.$('model-viewer'), null);
});
