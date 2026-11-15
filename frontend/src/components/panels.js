import { icon, escapeHtml } from './icons.js';

export const formatPoint = point => point ? `${point[0].toFixed(1)}, ${point[1].toFixed(1)}` : null;

export function renderWaypoints(route) {
  const list = document.querySelector('#route-waypoints');
  const markup = route.waypoints.map((point, index) => `<div class="waypoint-row"><button class="endpoint-button" data-waypoint="${index}" aria-pressed="${route.choosing === `waypoint:${index}`}"><span class="point-label">${index + 1}</span><span><strong>Stop ${index + 1}</strong><small>${escapeHtml(formatPoint(point))}</small></span>${icon('target')}</button><button class="waypoint-remove" data-remove-waypoint="${index}" aria-label="Remove stop ${index + 1}">${icon('close')}</button></div>`).join('');
  if (list.innerHTML !== markup) list.innerHTML = markup;
}

export function initializeLayers(manager) {
  const list = document.querySelector('#layer-list');
  const rows = new Map();
  const entries = [...manager.entries].filter(([, entry]) => entry.config.showInLayerPanel !== false);
  for (const [id, { config }] of entries) {
    const row = document.createElement('div');
    row.className = 'layer-row';
    row.innerHTML = `<div class="layer-header"><label class="layer-label" for="layer-${id}"><span class="layer-icon">${icon(config.icon)}</span><span class="layer-name">${escapeHtml(config.name)}<small id="layer-status-${id}">Not connected</small></span><input id="layer-${id}" type="checkbox" role="switch" aria-describedby="layer-status-${id}" disabled><span class="layer-switch" aria-hidden="true"></span></label></div><p class="layer-error" hidden></p>`;
    row.querySelector('input[type="checkbox"]').addEventListener('change', event => manager.setVisible(id, event.target.checked));
    rows.set(id, row);
    list.append(row);
  }
  const render = () => {
    for (const [id, entry] of entries) {
      const row = rows.get(id);
      const { config, state, layer, error } = entry;
      const available = Boolean(layer) || Boolean(config.lazy && config.sourceUrl);
      const checkbox = row.querySelector('input[type="checkbox"]');
      checkbox.disabled = !available;
      checkbox.checked = available && config.visible;
      row.classList.toggle('available', available);
      row.querySelector('small').textContent = { unavailable: 'Not connected', loading: 'Loading data…', configured: layer ? 'Ready to display' : 'Select to load', ready: config.resolution || 'Dataset loaded', error: 'Data unavailable' }[state];
      const errorNode = row.querySelector('.layer-error');
      errorNode.hidden = !error;
      errorNode.textContent = error || '';
    }
  };
  manager.addEventListener('change', render);
  render();
}

export function renderAnalysis(state, config) {
  const local = config.spatial.local;
  const coordinates = formatPoint(state.selected);
  const metrics = state.route.metrics;
  const waypoints = state.route.waypoints || [];
  const order = state.route.order || waypoints.map((_, index) => index);
  const stops = order.map(index => `<div><span class="point-label">${index + 1}</span><span>${escapeHtml(formatPoint(waypoints[index]))}</span></div>`).join('');
  const metricRows = metrics && typeof metrics === 'object' ? Object.entries(metrics)
    .filter(([, metric]) => Number.isFinite(metric?.value) && typeof metric?.units === 'string' && metric.units.length)
    .map(([name, metric]) => `<div class="metric-row"><span>${escapeHtml(name)}</span><strong>${escapeHtml(metric.value)} <small>${escapeHtml(metric.units)}</small></strong></div>`).join('') : '';
  const scientific = state.feature?.id === 'geology' ? state.feature.properties : null;
  const properties = scientific ? Object.entries(scientific).filter(([key, value]) => key !== 'geometry' && ['string', 'number', 'boolean'].includes(typeof value)) : [];
  if (state.feature?.id === 'geology') {
    const priority = ['Unit_Name', 'name', 'symbol', 'unit', 'symbol_noSub', 'subscript'];
    const rank = key => priority.includes(key) ? priority.indexOf(key) : priority.length;
    properties.sort(([first], [second]) => rank(first) - rank(second));
  }
  document.querySelector('#location-result').innerHTML = `${coordinates ? `<div class="coordinate-display"><div><span>X</span><strong>${escapeHtml(state.selected[0].toFixed(1))}</strong></div><div><span>Y</span><strong>${escapeHtml(state.selected[1].toFixed(1))}</strong></div></div><p class="location-help">${local ? 'Abstract local units · Not georeferenced' : escapeHtml(config.spatial.code)}</p>` : `<div class="selection-empty">${icon('target')}<span>Select a location</span></div><p class="location-help">Select a geological unit on the map to inspect.</p>`}`;
  document.querySelector('#route-result').innerHTML = `${state.route.start || state.route.end || waypoints.length ? `<div class="route-summary"><div><span class="point-label">A</span><span>${escapeHtml(formatPoint(state.route.start) || 'Select starting point')}</span></div>${stops}<div><span class="point-label end">B</span><span>${escapeHtml(formatPoint(state.route.end) || 'Select destination')}</span></div></div><p class="small-copy ${state.route.status === 'error' ? 'error-copy' : ''}">${escapeHtml(state.route.error || ({ selecting: local ? 'Local endpoints only. No route calculated.' : `Endpoints in ${config.spatial.code}. No route calculated.`, loading: 'Requesting route from the configured service…', ready: 'Route supplied by the configured service.', idle: 'No route selected.' }[state.route.status]))}</p>${metricRows}` : `<p class="empty-line">No route selected</p><p class="small-copy">Set your endpoints in Route Planner.</p>`}`;
  document.querySelector('#scientific-result').innerHTML = `${properties.length ? `${state.feature.sourceName ? `<p class="small-copy">${escapeHtml(state.feature.sourceName)}</p>` : ''}<dl class="scientific-properties">${properties.map(([key, value]) => `<div><dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl>` : `<p class="empty-line">No feature selected</p><p class="small-copy">Select a geological unit to inspect its attributes.</p>`}`;
}
