import { icon, escapeHtml } from './icons.js';

export const formatPoint = point => point ? `${point[0].toFixed(1)}, ${point[1].toFixed(1)}` : null;

export function initializeLayers(manager) {
  const list = document.querySelector('#layer-list');
  const rows = new Map();
  for (const [id, { config }] of manager.entries) {
    const row = document.createElement('div');
    row.className = 'layer-row';
    row.innerHTML = `<label class="layer-label" for="layer-${id}"><span class="layer-icon">${icon(config.icon)}</span><span class="layer-name">${escapeHtml(config.name)}<small id="layer-status-${id}">Not connected</small></span><input id="layer-${id}" type="checkbox" role="switch" aria-describedby="layer-status-${id}" disabled><span class="layer-switch" aria-hidden="true"></span></label><div class="layer-opacity" hidden><label for="opacity-${id}">Opacity <output for="opacity-${id}">100%</output></label><input id="opacity-${id}" type="range" min="0" max="100" step="1" value="100" aria-label="${escapeHtml(config.name)} opacity"></div><p class="layer-error" hidden></p><p class="layer-legend" hidden></p>`;
    row.querySelector('input[type="checkbox"]').addEventListener('change', event => manager.setVisible(id, event.target.checked));
    row.querySelector('input[type="range"]').addEventListener('input', event => manager.setOpacity(id, Number(event.target.value) / 100));
    rows.set(id, row);
    list.append(row);
  }
  const render = () => {
    let count = 0;
    for (const [id, entry] of manager.entries) {
      const row = rows.get(id);
      const { config, state, layer, error } = entry;
      const available = Boolean(layer);
      if (state === 'ready') count++;
      const checkbox = row.querySelector('input[type="checkbox"]');
      checkbox.disabled = !available;
      checkbox.checked = available && config.visible;
      row.classList.toggle('available', available);
      row.querySelector('small').textContent = { unavailable: 'Not connected', loading: 'Loading data…', configured: 'Configured · not yet loaded', ready: config.dataSource || 'Dataset loaded', error: 'Data unavailable' }[state];
      const opacity = row.querySelector('.layer-opacity');
      opacity.hidden = !available || config.type !== 'xyz';
      opacity.querySelector('input').value = String(Math.round(config.opacity * 100));
      opacity.querySelector('output').textContent = `${Math.round(config.opacity * 100)}%`;
      const errorNode = row.querySelector('.layer-error');
      errorNode.hidden = !error;
      errorNode.textContent = error || '';
      const legend = row.querySelector('.layer-legend');
      legend.hidden = !available || !config.legend;
      legend.textContent = typeof config.legend === 'string' ? config.legend : '';
    }
    document.querySelector('#layer-count').textContent = `${count} / ${manager.entries.size}`;
  };
  manager.addEventListener('change', render);
  render();
}

export function renderAnalysis(state, config) {
  const local = config.spatial.local;
  const coordinates = formatPoint(state.selected);
  const metrics = state.route.metrics;
  const metricRows = metrics && typeof metrics === 'object' ? Object.entries(metrics)
    .filter(([, metric]) => Number.isFinite(metric?.value) && typeof metric?.units === 'string' && metric.units.length)
    .map(([name, metric]) => `<div class="metric-row"><span>${escapeHtml(name)}</span><strong>${escapeHtml(metric.value)} <small>${escapeHtml(metric.units)}</small></strong></div>`).join('') : '';
  const scientific = state.feature?.id === 'sites' ? state.feature.properties : null;
  const properties = scientific ? Object.entries(scientific).filter(([key, value]) => key !== 'geometry' && ['string', 'number', 'boolean'].includes(typeof value)).slice(0, 10) : [];
  document.querySelector('#location-result').innerHTML = `${coordinates ? `<div class="coordinate-display"><div><span>X</span><strong>${escapeHtml(state.selected[0].toFixed(1))}</strong></div><div><span>Y</span><strong>${escapeHtml(state.selected[1].toFixed(1))}</strong></div></div><p class="location-help">${local ? 'Abstract local units · Not georeferenced' : escapeHtml(config.spatial.code)}</p>` : `<div class="selection-empty">${icon('target')}<span>Select a location</span></div><p class="location-help">Click anywhere in the workspace to inspect.</p>`}`;
  document.querySelector('#route-result').innerHTML = `${state.route.start || state.route.end ? `<div class="route-summary"><div><span class="point-label">A</span><span>${escapeHtml(formatPoint(state.route.start) || 'Select starting point')}</span></div><div><span class="point-label end">B</span><span>${escapeHtml(formatPoint(state.route.end) || 'Select destination')}</span></div></div><p class="small-copy ${state.route.status === 'error' ? 'error-copy' : ''}">${escapeHtml(state.route.error || ({ selecting: 'Local endpoints only. No route calculated.', loading: 'Requesting route from the configured service…', ready: 'Route supplied by the configured service.', idle: 'No route selected.' }[state.route.status]))}</p>${metricRows}` : `<p class="empty-line">No route selected</p><p class="small-copy">Set your endpoints in Route Planner.</p>`}`;
  document.querySelector('#scientific-result').innerHTML = `${properties.length ? `<dl class="scientific-properties">${properties.map(([key, value]) => `<div><dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl>` : `<p class="empty-line">No site selected</p><p class="small-copy">Scientific context will appear when a site dataset is connected and a feature is selected.</p>`}`;
}
