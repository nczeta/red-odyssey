import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Window } from 'happy-dom';
import { renderAnalysis } from '../src/components/panels.js';
import { initializeLayout, STORAGE_KEY, lockPageScroll } from '../src/components/layout.js';
import { appConfig, layerConfig } from '../src/config/app.js';
import { initializeLegend } from '../src/components/legend.js';
import { LayerManager } from '../src/layers/manager.js';
import VectorLayer from 'ol/layer/Vector.js';

// DOM integration tests, not browser/canvas or screenshot tests.
const homeHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const appHtml = await readFile(new URL('../app.html', import.meta.url), 'utf8');
const projectHtml = await readFile(new URL('../project.html', import.meta.url), 'utf8');

function setup(t, { compact = false, panels, html = homeHtml } = {}) {
  const win = new Window({ url: `http://localhost/${html === homeHtml ? 'index' : 'project'}.html`, width: compact ? 390 : 1440, settings: { enableJavaScriptEvaluation: false, disableJavaScriptFileLoading: true } });
  const original = { window: globalThis.window, document: globalThis.document, matchMedia: globalThis.matchMedia };
  globalThis.window = win;
  globalThis.document = win.document;
  win.document.write(html);
  const media = new win.EventTarget();
  media.matches = compact;
  globalThis.matchMedia = () => media;
  if (panels) win.localStorage.setItem(STORAGE_KEY, JSON.stringify(panels));
  t.after(async () => {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
    await win.happyDOM.close();
  });
  return { win, doc: win.document, media };
}

function explorer(t, options) {
  const environment = setup(t, { html: appHtml, ...options });
  const root = environment.doc.querySelector('#app');
  let resizes = 0;
  const layout = initializeLayout({ root, onResize: () => resizes++, announce: () => {} });
  return { ...environment, root, layout, resizes: () => resizes };
}

test('shared navigation uses real links, between the landing, Project and standalone app', t => {
  const { doc } = setup(t, { html: projectHtml });
  assert.equal(doc.querySelector('.nav-launch').getAttribute('href'), './app.html');
  assert.equal(doc.querySelector('.site-nav [aria-current="page"]').textContent, 'The Project');
  assert.equal(doc.querySelectorAll('a[href="mailto:null"], a[href="#github"]').length, 0);
  assert.equal(doc.querySelector('.footer-contact a').getAttribute('href'), 'https://github.com/nczeta/red-odyssey');
  assert.equal(doc.querySelectorAll('main').length, 1);
});

test('public chrome and official logo are present without running JavaScript', async t => {
  const logo = await readFile(new URL('../public/images/red-odyssey-logo.svg', import.meta.url), 'utf8');
  assert.match(logo, /<svg\b/);
  assert.match(logo, /viewBox="0 0 180 180"/);
  for (const html of [homeHtml, projectHtml, appHtml]) {
    const { doc } = setup(t, { html });
    const ids = [...doc.querySelectorAll('[id]')].map(element => element.id);
    assert.equal(new Set(ids).size, ids.length, 'IDs must be unique');
    assert.equal(doc.querySelectorAll('main').length, 1);
    assert.equal(doc.querySelectorAll('h1').length, 1);
    assert.ok(doc.querySelectorAll('img.official-logo').length > 0);
    for (const image of doc.querySelectorAll('img.official-logo')) {
      assert.equal(image.getAttribute('src'), html === projectHtml ? '/images/red-odyssey-logo.svg' : '/images/red-odyssey-logo-white-isolines.svg');
    }
    assert.equal(doc.querySelectorAll('.site-header').length, html === appHtml ? 0 : 1);
    assert.equal(doc.querySelectorAll('.site-footer').length, html === appHtml ? 0 : 1);
    assert.equal(doc.querySelector('link[rel="icon"][type="image/svg+xml"]').getAttribute('href'), '/images/red-odyssey-logo.svg');
    assert.equal(doc.querySelectorAll('[data-icon], [data-site-header], [data-site-footer]').length, 0);
  }
  const png = await readFile(new URL('../public/favicon.png', import.meta.url));
  assert.equal(png.readUInt32BE(16), 32);
  assert.equal(png.readUInt32BE(20), 32);
  const ico = await readFile(new URL('../public/favicon.ico', import.meta.url));
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(ico.readUInt16LE(4), 3);
  const apple = await readFile(new URL('../public/apple-touch-icon.png', import.meta.url));
  assert.equal(apple.readUInt32BE(16), 180);
});

test('sidebar DOM supports all four states without nested main or duplicate H1', t => {
  const { root, doc } = explorer(t, { panels: { left: true, right: true } });
  const left = doc.querySelector('#left-panel');
  const right = doc.querySelector('#right-panel');
  assert.equal(left.inert, false);
  assert.equal(right.inert, false);
  doc.querySelector('#close-left').click();
  assert.equal(left.inert, true);
  assert.equal(right.inert, false);
  assert.equal(doc.querySelector('#open-left').hidden, false);
  doc.querySelector('#close-right').click();
  assert.equal(root.classList.contains('left-closed'), true);
  assert.equal(root.classList.contains('right-closed'), true);
  doc.querySelector('#open-left').click();
  assert.equal(left.inert, false);
  assert.equal(right.inert, true);
  assert.equal(doc.querySelectorAll('main').length, 1);
  assert.equal(doc.querySelectorAll('h1').length, 1);
});

test('Map Focus preserves scroll, sidebar states, chrome accessibility and the map element', t => {
  const { win, doc, root, resizes } = explorer(t, { panels: { left: false, right: true } });
  const map = doc.querySelector('#map');
  const originalBodyStyle = 'background-color: black;';
  doc.body.setAttribute('style', originalBodyStyle);
  win.scrollTo({ top: 431, left: 0, behavior: 'instant' });
  const trigger = doc.querySelector('#focus-map');
  trigger.focus();
  trigger.click();
  assert.equal(root.classList.contains('is-focus'), true);
  assert.equal(doc.body.style.position, 'fixed');
  assert.equal(doc.body.style.top, '-431px');
  assert.equal(doc.querySelector('.site-header'), null);
  assert.equal(doc.querySelector('.site-footer'), null);
  assert.equal(doc.querySelector('#right-panel').inert, true);
  assert.equal(doc.activeElement, doc.querySelector('#exit-focus'));
  doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(root.classList.contains('is-focus'), false);
  assert.equal(root.classList.contains('left-closed'), true);
  assert.equal(root.classList.contains('right-closed'), false);
  assert.equal(doc.body.getAttribute('style'), originalBodyStyle);
  assert.equal(doc.querySelector('.workspace-home').getAttribute('href'), './index.html');
  assert.equal(win.scrollY, 431);
  assert.equal(doc.activeElement, trigger);
  assert.equal(doc.querySelector('#map'), map);
  assert.ok(resizes() >= 3);
});

test('Map Focus exit button and keyboard loop remain usable across repeated entries', t => {
  const { win, doc, root } = explorer(t);
  for (let index = 0; index < 3; index++) {
    doc.querySelector('#focus-map').click();
    doc.querySelector('#exit-focus').focus();
    const tab = new win.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    doc.dispatchEvent(tab);
    assert.equal(tab.defaultPrevented, true);
    assert.equal(doc.activeElement.id, 'map');
    const reverseTab = new win.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    doc.dispatchEvent(reverseTab);
    assert.equal(doc.activeElement.id, 'exit-focus');
    doc.querySelector('#exit-focus').click();
    assert.equal(root.classList.contains('is-focus'), false);
    assert.equal(doc.body.style.position, '');
  }
});

test('mobile drawer survives Focus while desktop preferences remain independent', t => {
  const { doc, layout, win } = explorer(t, { compact: true, panels: { left: false, right: true } });
  doc.querySelector('#open-left').click();
  assert.equal(layout.state.drawer, 'left');
  doc.querySelector('#focus-map').click();
  doc.querySelector('#exit-focus').click();
  assert.equal(doc.querySelector('#left-panel').inert, false);
  layout.closeDrawers();
  assert.equal(doc.querySelector('#left-panel').inert, true);
  assert.deepEqual(JSON.parse(win.localStorage.getItem(STORAGE_KEY)), { left: false, right: true });
});

test('scroll lock restores absent inline styles and is idempotent', t => {
  const { win, doc } = setup(t);
  doc.body.removeAttribute('style');
  doc.documentElement.style.scrollBehavior = 'smooth';
  win.scrollTo({ top: 712, left: 8, behavior: 'instant' });
  const restore = lockPageScroll(win, doc);
  restore();
  restore();
  assert.equal(doc.body.getAttribute('style'), null);
  assert.equal(doc.documentElement.style.scrollBehavior, 'smooth');
  assert.equal(win.scrollY, 712);
  assert.equal(win.scrollX, 8);
});

test('every static local link resolves to an existing page and fragment', async t => {
  const { doc } = setup(t);
  const projectWindow = new Window({ url: 'http://localhost/project.html' });
  t.after(() => projectWindow.happyDOM.close());
  projectWindow.document.write(projectHtml);
  const appWindow = new Window({ url: 'http://localhost/app.html' });
  t.after(() => appWindow.happyDOM.close());
  appWindow.document.write(appHtml);
  for (const document of [doc, projectWindow.document, appWindow.document]) for (const link of document.querySelectorAll('a[href]')) {
    const url = new URL(link.getAttribute('href'), document.URL);
    if (url.origin !== 'http://localhost') continue;
    assert.ok(['/index.html', '/project.html', '/app.html', '/'].includes(url.pathname), url.href);
    const target = url.pathname === '/project.html' ? projectWindow.document : url.pathname === '/app.html' ? appWindow.document : doc;
    if (url.hash) assert.ok(target.getElementById(url.hash.slice(1)), `Missing fragment ${url.href}`);
  }
});

test('Project contains five scientific records and real team contacts before JavaScript', t => {
  const { doc } = setup(t, { html: projectHtml });
  assert.equal(doc.querySelectorAll('.catalog-entry').length, 5);
  assert.equal(doc.querySelectorAll('.catalog-entry details').length, 5);
  assert.equal(doc.querySelectorAll('#team-list li').length, 6);
  assert.equal(doc.querySelectorAll('.catalog-availability').length, 0);
  assert.match(doc.querySelector('#catalog-title').textContent, /Five ways to read it/);
  assert.match(doc.querySelector('.catalog-intro').textContent, /Five complementary perspectives/);
  assert.equal(doc.querySelector('[data-layer="geology"]'), null);
  assert.ok([...doc.querySelectorAll('.catalog-entry')].every(entry => entry.querySelector('p') && entry.querySelectorAll('dd').length >= 3));
  assert.deepEqual([...doc.querySelectorAll('#team-list h3')].map(element => element.textContent), [
    'Niccolò Zampini', 'Karim Omar Zoubir', 'Filippo Pavone', 'Pietro Adami Martinez',
    'Shenal Ferdin Croos Warnakulasuriya', 'Alessio Parolini',
  ]);
  assert.equal(doc.querySelector('#photography'), null);
  assert.equal(doc.querySelector('#route-planning .editorial-note'), null);
  assert.equal(doc.querySelector('#route-planning .technical-caption'), null);
  assert.equal(doc.querySelectorAll('#reference-links a').length, 2);
});

test('Project enhances delivery metadata without replacing scientific provenance or links', async t => {
  const { doc } = setup(t, { html: projectHtml });
  const entry = doc.querySelector('[data-layer="imagery"]');
  const previous = { ...layerConfig[0] };
  t.after(() => Object.assign(layerConfig[0], previous));
  Object.assign(layerConfig[0], { sourceUrl: '/tiles/{z}/{x}/{y}.png', dataSource: '<verified source>', resolution: '10 m', units: 'reflectance' });
  const provenance = entry.querySelector('dl').textContent;
  const source = entry.querySelector('details a').getAttribute('href');
  const { initializeProjectPage } = await import('../src/project.js');
  t.after(initializeProjectPage(doc, window));
  assert.equal(doc.querySelector('[data-layer="imagery"]'), entry);
  assert.equal(entry.querySelector('.catalog-availability'), null);
  assert.equal(entry.querySelector('[data-config-field="resolution"]').textContent, '10 m');
  assert.equal(entry.querySelector('[data-config-field="units"]').textContent, 'reflectance');
  assert.equal(entry.querySelector('details a').getAttribute('href'), source);
  assert.match(provenance, /5 metres per pixel/);
  assert.match(entry.querySelector('dl').textContent, /5 metres per pixel/);
  assert.equal(entry.querySelector('verified'), null);
});

test('Project index tracks fragments, clicks, tall sections and the document end', async t => {
  const { doc, win } = setup(t, { html: projectHtml });
  const { initializeProjectPage } = await import('../src/project.js');
  let nextFrame;
  win.requestAnimationFrame = callback => { nextFrame = callback; return 1; };
  win.cancelAnimationFrame = () => { nextFrame = null; };
  const sections = [...doc.querySelectorAll('.document-section')];
  const positions = [0, 800, 1600, 4200, 5000, 5800, 6600, 7400];
  sections.forEach((section, index) => {
    section.getBoundingClientRect = () => ({ top: positions[index] - win.scrollY });
  });
  Object.defineProperty(doc.documentElement, 'scrollHeight', { value: 8500 });
  win.location.hash = '#sources';
  const dispose = initializeProjectPage(doc, win);
  t.after(dispose);
  const active = () => doc.querySelector('.project-index [aria-current="location"]');
  assert.equal(active().hash, '#sources');
  const link = doc.querySelector('.project-index a[href="#maps-layers"]');
  link.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  assert.equal(active(), link);
  assert.ok(active().classList.contains('is-active'));
  win.scrollTo({ top: 3000 });
  win.dispatchEvent(new win.Event('scroll'));
  nextFrame();
  assert.equal(active().hash, '#maps-layers', 'a tall section stays active throughout its content');
  win.scrollTo({ top: 8500 - win.innerHeight });
  win.dispatchEvent(new win.Event('scroll'));
  nextFrame();
  assert.equal(active().hash, '#team');
  assert.equal(doc.querySelectorAll('.project-index [aria-current]').length, 1);
  dispose();
  nextFrame = null;
  win.dispatchEvent(new win.Event('scroll'));
  assert.equal(nextFrame, null);
});

test('selection and route details remain available outside the map legend', t => {
  const { doc } = setup(t, { html: appHtml });
  assert.equal(doc.querySelector('#right-panel h3').textContent,'MAP LEGEND');
  assert.equal(doc.querySelector('#right-panel #location-result'),null);
  assert.ok(doc.querySelector('#selection-dialog #location-result'));
  assert.ok(doc.querySelector('#route-planner #route-result'));
  const legend = doc.querySelector('#legend-content');
  const state = { selected: [17, -31], feature: { id: 'geology', properties: { name: '<img src=x onerror=alert(1)>' } }, route: { start: [0, 0], end: [10, 10], status: 'ready', metrics: { distance: { value: 42, units: 'm' } }, error: null } };
  renderAnalysis(state, appConfig);
  assert.match(doc.querySelector('#location-result').textContent, /17.0/);
  assert.match(doc.querySelector('#route-result').textContent, /42 m/);
  assert.equal(doc.querySelector('#scientific-result dd').textContent, state.feature.properties.name);
  assert.equal(doc.querySelector('#scientific-result img'), null);
  state.selected = null;
  state.feature = null;
  state.route = { start: null, end: null, status: 'idle', metrics: null, error: null };
  renderAnalysis(state, appConfig);
  assert.match(doc.querySelector('#location-result').textContent, /Select a location/);
  assert.match(doc.querySelector('#route-result').textContent, /No route selected/);
  assert.equal(doc.querySelector('#legend-content'),legend);
});

test('legend follows actual visibility and renders supplied qualitative raster color keys', t => {
  const {doc}=setup(t,{html:appHtml});
  const manager=new LayerManager({addLayer(){}},layerConfig,appConfig.spatial.code);
  for(const id of ['elevation','slope']) manager.get(id).layer=new VectorLayer({visible:false});
  t.after(initializeLegend(manager));
  assert.ok(doc.querySelector('.legend-empty'));
  manager.setVisible('elevation',true);
  assert.ok(doc.querySelector('[data-legend="elevation"]'));
  assert.equal(doc.querySelectorAll('[data-legend="elevation"] .legend-swatch-square').length,5);
  assert.deepEqual([...doc.querySelectorAll('[data-legend="elevation"] .legend-item-label small')].map(node=>node.textContent),['#d7191c','#fdae61','#ffffbf','#abdda4','#2b83ba']);
  assert.match(doc.querySelector('[data-legend="elevation"]').textContent,/Lowest elevation/);
  manager.setVisible('slope',true);
  assert.equal(doc.querySelectorAll('.map-legend-section').length,2);
  assert.equal(doc.querySelectorAll('[data-legend="slope"] .legend-swatch-square').length,7);
  assert.deepEqual([...doc.querySelectorAll('[data-legend="slope"] .legend-item-label small')].map(node=>node.textContent),['#f2ecdd','#c8a37d','#9e9b63','#b56e4f','#b77257','#6a4346','#4f3237']);
  assert.match(doc.querySelector('[data-legend="slope"]').textContent,/Least steep/);
  assert.match(doc.querySelector('[data-legend="slope"]').textContent,/Steepest/);
  const elevationNode=doc.querySelector('[data-legend="elevation"]');
  manager.notify();
  assert.equal(doc.querySelector('[data-legend="elevation"]'),elevationNode,'tile notifications must not rebuild unchanged legends');
  manager.setVisible('elevation',false);
  assert.equal(doc.querySelector('[data-legend="elevation"]'),null);
  manager.setVisible('slope',false);
  assert.ok(doc.querySelector('.legend-empty'));
});

test('legend renders line symbols, exact interval units and escaped categorical names', t => {
  const {doc}=setup(t,{html:appHtml});
  const manager=new LayerManager({addLayer(){}},[{id:'fixture',name:'<layer>',visible:true,legendDefinition:{notes:[],groups:[{title:'<source>',items:[
    {range:[-1160,-600],units:'m',upperInclusive:true,symbol:{type:'line',stroke:[217,214,209,0.65],width:1}},
    {label:'<img src=x>',detail:'<unit>',symbol:{type:'polygon',fill:[216,146,114,0.14],stroke:'rgba(217,196,172,0.65)',width:1.25,dash:[4,3]}},
  ]}]}}],appConfig.spatial.code);
  t.after(initializeLegend(manager));
  assert.match(doc.querySelector('.legend-items').textContent,/\[−1160, −600\] m/);
  assert.equal(doc.querySelector('.legend-color').getAttribute('fill'),'rgba(217,214,209,0.65)');
  assert.equal(doc.querySelector('.legend-swatch').getAttribute('data-line-width'),'1');
  assert.equal(doc.querySelectorAll('.legend-swatch')[1].querySelector('rect').getAttribute('fill'),'rgba(216,146,114,0.14)');
  assert.equal(doc.querySelector('#legend-content img'),null);
  assert.equal(doc.querySelector('.map-legend-section h4').textContent,'<layer>');
});

test('geological selection shows only supplied attributes and escapes source names', t => {
  const {doc}=setup(t,{html:appHtml});
  const properties={name:'Upper etched unit',symbol:'Nue',Color_ID:74,subscript:null,description:'<img src=x onerror=alert(1)>'};
  const state={selected:[4332815,1049347],feature:{id:'geology',sourceName:'<USGS geology>',properties},route:{start:null,end:null,status:'idle',metrics:null,error:null}};
  renderAnalysis(state,appConfig);
  assert.equal(doc.querySelector('#scientific-result > p').textContent,'<USGS geology>');
  assert.match(doc.querySelector('#scientific-result').textContent,/Upper etched unit/);
  assert.match(doc.querySelector('#scientific-result').textContent,/Color_ID/);
  assert.equal(doc.querySelectorAll('#scientific-result dl > div').length,4);
  assert.equal(doc.querySelector('#scientific-result img'),null);
});

test('landing is independent from GIS and app starts with both panels closed', t => {
  const { doc, root } = explorer(t);
  assert.equal(doc.querySelector('#left-panel').inert, true);
  assert.equal(doc.querySelector('#right-panel').inert, true);
  doc.querySelector('#open-left').click();
  assert.equal(doc.querySelector('#left-panel').inert, false);
  assert.equal(doc.querySelector('#right-panel').inert, true);
  doc.querySelector('#open-right').click();
  assert.equal(doc.querySelector('#left-panel').inert, false);
  assert.equal(doc.querySelector('#right-panel').inert, false);
  assert.ok(root.classList.contains('left-closed') === false);
  assert.ok(!homeHtml.includes('id="app"'));
  assert.ok(!homeHtml.includes('/src/main.js'));
  assert.ok(homeHtml.includes('href="./app.html"'));
});
