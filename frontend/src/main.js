import { appConfig, layerConfig } from './config/app.js';
import { initializeLayout } from './components/layout.js';
import { initializeLayers, renderAnalysis, formatPoint } from './components/panels.js';
import { createMap } from './map/createMap.js';
import { LayerManager } from './layers/manager.js';
import { requestRoute } from './services/api.js';
import { initializeLegend } from './components/legend.js';

const root = document.querySelector('#app');
const state = {
  tool: null, selected: null, feature: null,
  route: { start: null, end: null, choosing: null, status: 'idle', metrics: null, error: null },
};
const $ = selector => document.querySelector(selector);
const announce = message => { $('#live-status').textContent = message; };
let requestController;
let manager;

const mapController = createMap(appConfig, (coordinate, hit) => {
  if (state.tool === 'route' && state.route.choosing) {
    cancelRoute();
    const endpoint = state.route.choosing;
    state.route[endpoint] = [...coordinate];
    state.route.status = 'selecting';
    state.route.choosing = endpoint === 'start' && !state.route.end ? 'end' : null;
    announce(`${endpoint === 'start' ? 'Starting point' : 'Destination'} placed. ${state.route.choosing ? 'Select a destination.' : `Endpoints are in ${appConfig.spatial.code}.`}`);
  } else if (hit?.layer.get('registryId') === 'geology') {
    state.selected = [...coordinate];
    state.feature = hit ? { id: hit.layer.get('registryId'), properties: hit.feature.getProperties(), sourceName: hit.layer.get('datasetName') } : null;
    announce('Geological unit selected.');
    render();
    if (!$('#selection-dialog').open) $('#selection-dialog').showModal();
    return;
  } else {
    return;
  }
  render();
});

manager = new LayerManager(mapController.map, layerConfig, appConfig.spatial.code);
initializeLayers(manager);
const disposeLegend = initializeLegend(manager);
const layout = initializeLayout({ root, onResize: mapController.updateSize, announce });

function cancelRoute() {
  requestController?.abort();
  requestController = null;
  state.route.metrics = null;
  state.route.error = null;
  if (manager.get('routes').layer && !manager.get('routes').config.sourceUrl) manager.clear('routes');
}

function render() {
  const { route } = state;
  for (const button of document.querySelectorAll('[data-tool]')) {
    const active = button.dataset.tool === state.tool;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  }
  $('#route-planner').hidden = state.tool !== 'route';
  for (const endpoint of ['start', 'end']) {
    $(`#${endpoint}-value`).textContent = formatPoint(route[endpoint]) || 'Click to place on map';
    $(`#set-${endpoint}`).setAttribute('aria-pressed', String(route.choosing === endpoint));
  }
  $('#clear-route').disabled = !route.start && !route.end;
  const connected = !appConfig.spatial.local && appConfig.api.routeUrl && appConfig.api.responseCrs;
  $('#calculate-route').disabled = !connected || !route.start || !route.end || route.status === 'loading';
  $('#route-help').textContent = connected ? 'Coordinates are sent in the configured map CRS.' : 'Routing requires verified terrain data and a connected backend.';
  const hint = $('#map-action-hint');
  hint.hidden = state.tool !== 'route' || !route.choosing;
  hint.textContent = `Select ${route.choosing === 'start' ? 'starting point A' : 'destination B'} · Click the map or press Enter at its center`;
  $('#map').classList.toggle('placing-endpoint', state.tool === 'route' && Boolean(route.choosing));
  // Make space for the selection marker while no visible data layer is ready.
  $('#map-empty').classList.toggle('has-selection', Boolean(state.selected || route.start || route.end));
  mapController.setMarkers(state.selected, route.start, route.end);
  renderAnalysis(state, appConfig);
}

for (const button of document.querySelectorAll('[data-tool]')) button.addEventListener('click', () => {
  state.tool = state.tool === button.dataset.tool ? null : button.dataset.tool;
  state.selected = null;
  state.feature = null;
  state.route.choosing = state.tool === 'route' ? (!state.route.start ? 'start' : !state.route.end ? 'end' : null) : null;
  render();
  if (state.tool === 'route' && state.route.choosing) layout.closeDrawers();
  announce(state.tool ? `${button.textContent.trim()} selected.` : 'Route Planner closed.');
});
for (const endpoint of ['start', 'end']) $(`#set-${endpoint}`).addEventListener('click', () => {
  state.route.choosing = state.route.choosing === endpoint ? null : endpoint;
  render();
  layout.closeDrawers();
  $('#map').focus({ preventScroll: true });
});
$('#clear-route').addEventListener('click', () => {
  cancelRoute();
  state.route = { start: null, end: null, choosing: 'start', status: 'idle', metrics: null, error: null };
  render();
  layout.closeDrawers();
  announce('Endpoints cleared. Select a new starting point.');
});
$('#calculate-route').addEventListener('click', async () => {
  if ($('#calculate-route').disabled) return;
  cancelRoute();
  const controller = new AbortController();
  requestController = controller;
  state.route.status = 'loading';
  render();
  try {
    const result = await requestRoute({ start: state.route.start, end: state.route.end, crs: appConfig.spatial.code, api: appConfig.api, signal: controller.signal });
    if (controller.signal.aborted) return;
    manager.setGeoJSON('routes', result.route, result.crs);
    state.route.metrics = result.metrics;
    state.route.status = 'ready';
    announce('Route loaded from the configured service.');
  } catch (error) {
    if (controller.signal.aborted) return;
    state.route.status = 'error';
    state.route.error = error.name === 'TimeoutError' ? 'The route service timed out. Try again.' : error.message;
    announce(state.route.error);
  } finally {
    if (requestController === controller) { requestController = null; render(); }
  }
});

manager.addEventListener('change', () => {
  if (state.feature?.id === 'geology' && !manager.get('geology').config.visible) { state.feature = null; render(); }
  const connected = [...manager.entries.values()].some(entry => entry.state === 'ready');
  const visible = [...manager.entries.values()].some(entry => entry.state === 'ready' && entry.config.visible);
  $('#map-empty').hidden = visible;
  const activeRasters = [...manager.entries.values()].filter(entry => ['cog', 'contours', 'geology'].includes(entry.config.type) && entry.config.visible);
  const loading = activeRasters.find(entry => ['loading', 'configured'].includes(entry.state));
  const failed = activeRasters.find(entry => entry.state === 'error');
  const empty = $('#map-empty');
  empty.querySelector('h3').textContent = loading ? 'Loading Jezero map' : failed ? 'Map unavailable' : 'Explore Jezero Crater';
  empty.querySelector('p').textContent = loading ? `Loading ${loading.config.name}.` : failed?.error || 'Enable a map in Map Layers to view the surface.';
  $('.tag-secondary').textContent = connected ? 'DATA CONNECTED' : 'NO DATA CONNECTED';
  $('.left-sidebar .sidebar-footer > span:last-child').textContent = connected ? 'Geospatial data connected' : 'Awaiting geospatial data';
  if (!appConfig.spatial.local) $('#map-spatial-label').textContent = appConfig.spatial.code;
});

const dialog = $('#info-dialog');
const selectionDialog = $('#selection-dialog');
$('#close-selection').addEventListener('click', () => selectionDialog.close());
$('#project-info').addEventListener('click', () => dialog.showModal());
$('#close-info').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => { if (event.target === dialog) { const bounds = dialog.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close(); } });

render();
manager.loadConfigured();
if (!appConfig.spatial.local) {
  $('.workspace-tag > span:nth-child(2)').textContent = 'SPATIAL WORKSPACE';
  $('#map-spatial-label').textContent = appConfig.spatial.code;
  $('.tool-tag').textContent = 'GIS';
  $('#map').setAttribute('aria-label', `Map in ${appConfig.spatial.code}. Arrow keys to pan. Plus and minus to zoom. Enter to place an active route endpoint.`);
  $('#map-instructions').textContent = 'Drag to pan; use zoom controls or scroll to zoom. Use Route Planner to place endpoints or click a geological unit to inspect it.';
}
if (import.meta.hot) import.meta.hot.dispose(() => { requestController?.abort(); disposeLegend(); mapController.dispose(); });
