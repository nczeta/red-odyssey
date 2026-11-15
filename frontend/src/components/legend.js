import { asString } from 'ol/color.js';
import { escapeHtml, icon } from './icons.js';

const color = value => escapeHtml(asString(value));
const number = value => String(value).replace(/^-/, '−');
const rendered = new WeakMap();

function symbolMarkup(symbol) {
  if (symbol.type === 'swatch') {
    return `<svg class="legend-swatch legend-swatch-square" viewBox="0 0 20 20" aria-hidden="true"><rect width="20" height="20" fill="${color(symbol.fill)}"/></svg>`;
  }
  if (symbol.type === 'line') {
    // A color chip makes the low-contrast contour palette readable at legend
    // size. Use the stroke's exact RGBA once, over the actual black background.
    return `<svg class="legend-swatch" viewBox="0 0 32 20" data-line-width="${symbol.width}" aria-hidden="true"><rect width="32" height="20" fill="${color(symbol.background || '#000000')}"/><rect class="legend-color" width="32" height="20" fill="${color(symbol.stroke)}"/></svg>`;
  }
  const dash = symbol.dash?.length ? ` stroke-dasharray="${symbol.dash.join(' ')}"` : '';
  return `<svg class="legend-swatch" viewBox="0 0 32 20" aria-hidden="true"><rect x="1" y="2" width="30" height="16" fill="${color(symbol.fill)}" stroke="${color(symbol.stroke)}" stroke-width="${symbol.width}" stroke-linejoin="round"${dash}/></svg>`;
}

function itemMarkup(item) {
  const label = item.range ? (item.range[0] === item.range[1] ? `${number(item.range[0])} ${item.units}`
    : `[${number(item.range[0])}, ${number(item.range[1])}${item.upperInclusive ? ']' : ')'} ${item.units}`) : item.label;
  return `<li>${symbolMarkup(item.symbol)}<div class="legend-item-label"><span>${escapeHtml(label)}</span>${item.detail ? `<small>${escapeHtml(item.detail)}</small>` : ''}</div></li>`;
}

export function renderMapLegend(manager, target = document.querySelector('#legend-content')) {
  const active = [...manager.entries].filter(([, entry]) => entry.config.visible && (!entry.layer || entry.layer.getVisible()) && (entry.layer?.get('legendDefinition') || entry.config.legendDefinition));
  const markup = active.length ? active.map(([id, entry]) => {
    const definition = entry.layer?.get('legendDefinition') || entry.config.legendDefinition;
    const pending = !entry.layer || ['loading', 'configured'].includes(entry.state);
    const status = entry.error || (pending ? 'Loading map data…' : '');
    const notes = definition.notes || [];
    return `<section class="map-legend-section" data-legend="${escapeHtml(id)}" aria-labelledby="legend-title-${escapeHtml(id)}"><h4 id="legend-title-${escapeHtml(id)}">${escapeHtml(entry.config.name)}</h4>${status ? `<p class="legend-status${entry.error ? ' error-copy' : ''}">${escapeHtml(status)}</p>` : ''}${notes.map(note => `<p class="legend-note">${escapeHtml(note)}</p>`).join('')}${(definition.groups || []).map(group => `<div class="legend-group">${group.title ? `<h5>${escapeHtml(group.title)}</h5>` : ''}${group.note ? `<p class="legend-note">${escapeHtml(group.note)}</p>` : ''}<ul class="legend-items">${group.items.map(itemMarkup).join('')}</ul></div>`).join('')}</section>`;
  }).join('') : `<div class="legend-empty">${icon('layers')}<p>No legend needed</p><span>Enable a thematic map to see its legend.</span></div>`;
  // Tile events can fire frequently. Keep the current DOM and scroll position
  // when the legend itself has not changed.
  const ids = active.map(([id]) => id).join(',');
  const previous = rendered.get(target);
  if (previous?.markup !== markup) {
    const scroll = target.scrollTop;
    target.innerHTML = markup;
    target.scrollTop = previous?.ids === ids ? scroll : 0;
    rendered.set(target, { markup, ids });
  }
  document.querySelector('#legend-summary').textContent = active.length ? `${active.length} visible thematic ${active.length === 1 ? 'layer' : 'layers'}` : 'No thematic layers visible';
}

export function initializeLegend(manager) {
  const render = () => renderMapLegend(manager);
  manager.addEventListener('change', render);
  render();
  return () => manager.removeEventListener('change', render);
}
