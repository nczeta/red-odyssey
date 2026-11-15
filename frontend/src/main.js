import { appConfig, layerConfig } from './config/app.js';
import { initializeLayout } from './components/layout.js';
import { initializeLayers, renderAnalysis, renderWaypoints, formatPoint } from './components/panels.js';
import { createMap } from './map/createMap.js';
import { LayerManager } from './layers/manager.js';
import { requestRoute } from './services/api.js';
import { initializeLegend } from './components/legend.js';
import { initializeTerrain } from './components/terrain.js';

const root = document.querySelector('#app');
const state = {
  tool: null, selected: null, feature: null,
  route: { start: null, end: null, waypoints: [], reorder: true, order: null, choosing: null, status: 'idle', metrics: null, error: null },
};
const $ = selector => document.querySelector(selector);
const announce = message => { $('#live-status').textContent = message; };
let requestController;
let manager;

const mapController = createMap(appConfig, (coordinate, hit) => {
  if (state.tool === 'route' && state.route.choosing) {
    cancelRoute();
    const endpoint = state.route.choosing;
    let label;
    if (endpoint.startsWith('waypoint:')) {
      const index = endpoint === 'waypoint:new' ? state.route.waypoints.length : Number(endpoint.split(':')[1]);
      state.route.waypoints[index] = [...coordinate];
      label = `Stop ${index + 1}`;
    } else {
      state.route[endpoint] = [...coordinate];
      label = endpoint === 'start' ? 'Starting point' : 'Destination';
    }
    state.route.status = 'selecting';
    state.route.choosing = endpoint === 'start' && !state.route.end ? 'end' : null;
    announce(`${label} placed. ${state.route.choosing ? 'Select a destination.' : `Points are in ${appConfig.spatial.code}.`}`);
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
const terrain = initializeTerrain({ root, sourceUrl: appConfig.terrain.sourceUrl, onMapResize: mapController.updateSize, announce });

function cancelRoute() {
  requestController?.abort();
  requestController = null;
  state.route.metrics = null;
  state.route.error = null;
  state.route.order = null;
  state.route.status = 'selecting';
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
  renderWaypoints(route);
  $('#add-waypoint').disabled = route.waypoints.length >= 8;
  $('#add-waypoint').setAttribute('aria-pressed', String(route.choosing === 'waypoint:new'));
  $('#reorder-waypoints').checked = route.reorder;
  $('#clear-route').disabled = !route.start && !route.end && !route.waypoints.length;
  const connected = !appConfig.spatial.local && appConfig.api.routeUrl && appConfig.api.responseCrs;
  $('#calculate-route').disabled = !connected || !route.start || !route.end || route.status === 'loading';
  $('#route-help').textContent = connected ? 'Coordinates are sent in the configured map CRS.' : 'Routing requires verified terrain data and a connected backend.';
  const hint = $('#map-action-hint');
  hint.hidden = state.tool !== 'route' || !route.choosing;
  const pointLabel = route.choosing?.startsWith('waypoint:') ? `stop ${route.choosing === 'waypoint:new' ? route.waypoints.length + 1 : Number(route.choosing.split(':')[1]) + 1}` : route.choosing === 'start' ? 'starting point A' : 'destination B';
  hint.textContent = `Select ${pointLabel} · Click the map or press Enter at its center`;
  $('#map').classList.toggle('placing-endpoint', state.tool === 'route' && Boolean(route.choosing));
  // Make space for the selection marker while no visible data layer is ready.
  $('#map-empty').classList.toggle('has-selection', Boolean(state.selected || route.start || route.end || route.waypoints.length));
  mapController.setMarkers(state.selected, route.start, route.end, route.waypoints);
  renderAnalysis(state, appConfig);
}

for (const button of document.querySelectorAll('[data-tool]')) button.addEventListener('click', () => {
  terrain.setMode('2d');
  state.tool = state.tool === button.dataset.tool ? null : button.dataset.tool;
  state.selected = null;
  state.feature = null;
  state.route.choosing = state.tool === 'route' ? (!state.route.start ? 'start' : !state.route.end ? 'end' : null) : null;
  render();
  if (state.tool === 'route' && state.route.choosing) layout.closeDrawers();
  announce(state.tool ? `${button.textContent.trim()} selected.` : 'Route Planner closed.');
});
for (const endpoint of ['start', 'end']) $(`#set-${endpoint}`).addEventListener('click', () => {
  terrain.setMode('2d');
  state.route.choosing = state.route.choosing === endpoint ? null : endpoint;
  render();
  layout.closeDrawers();
  $('#map').focus({ preventScroll: true });
});
$('#add-waypoint').addEventListener('click', () => {
  if (state.route.waypoints.length >= 8) return;
  terrain.setMode('2d');
  state.route.choosing = state.route.choosing === 'waypoint:new' ? null : 'waypoint:new';
  render();
  layout.closeDrawers();
  $('#map').focus({ preventScroll: true });
  announce(state.route.choosing ? 'Select an intermediate stop on the map.' : 'Stop placement cancelled.');
});
$('#route-waypoints').addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  terrain.setMode('2d');
  if (button.dataset.removeWaypoint !== undefined) {
    cancelRoute();
    state.route.waypoints.splice(Number(button.dataset.removeWaypoint), 1);
    state.route.choosing = null;
    render();
    $('#add-waypoint').focus();
    announce('Stop removed. Calculate the route again.');
  } else if (button.dataset.waypoint !== undefined) {
    const choosing = `waypoint:${button.dataset.waypoint}`;
    state.route.choosing = state.route.choosing === choosing ? null : choosing;
    render();
    layout.closeDrawers();
    $('#map').focus({ preventScroll: true });
  }
});
$('#reorder-waypoints').addEventListener('change', event => {
  cancelRoute();
  state.route.reorder = event.target.checked;
  render();
  announce(state.route.reorder ? 'Intermediate stops will be reordered. Start and destination stay fixed.' : 'Stops will be visited in the order you added them.');
});
$('#clear-route').addEventListener('click', () => {
  terrain.setMode('2d');
  cancelRoute();
  state.route = { start: null, end: null, waypoints: [], reorder: state.route.reorder, order: null, choosing: 'start', status: 'idle', metrics: null, error: null };
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
    const result = await requestRoute({ start: state.route.start, end: state.route.end, waypoints: state.route.waypoints, reorder: state.route.reorder, crs: appConfig.spatial.code, api: appConfig.api, signal: controller.signal });
    if (controller.signal.aborted) return;
    manager.setGeoJSON('routes', result.route, result.crs);
    state.route.metrics = result.metrics;
    state.route.order = result.waypointOrder;
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
  $('.left-sidebar .sidebar-footer > span:last-child').textContent = connected ? 'Geospatial data connected' : 'Awaiting geospatial data';
  if (!appConfig.spatial.local) $('#map-spatial-label').textContent = appConfig.spatial.code;
});

const selectionDialog = $('#selection-dialog');
$('#close-selection').addEventListener('click', () => selectionDialog.close());

render();
manager.loadConfigured();
if (!appConfig.spatial.local) {
  $('#map-spatial-label').textContent = appConfig.spatial.code;
  $('.tool-tag').textContent = 'GIS';
  $('#map').setAttribute('aria-label', `Map in ${appConfig.spatial.code}. Arrow keys to pan. Plus and minus to zoom. Enter to place an active route endpoint.`);
  $('#map-instructions').textContent = 'Drag to pan; use zoom controls or scroll to zoom. Use Route Planner to place endpoints or click a geological unit to inspect it.';
}
if (import.meta.hot) import.meta.hot.dispose(() => { requestController?.abort(); terrain.dispose(); disposeLegend(); mapController.dispose(); });
