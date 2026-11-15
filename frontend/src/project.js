import { layerConfig } from './config/app.js';

// The document is complete in HTML. Only live registry metadata is enhanced here.
for (const entry of document.querySelectorAll('#layer-catalog [data-layer]')) {
  const config = layerConfig.find(layer => layer.id === entry.dataset.layer);
  if (!config) continue;
  entry.querySelector('.catalog-availability').textContent = config.sourceUrl || config.data
    ? 'Source configured · verification pending' : 'Pending integration';
  for (const [label, value] of [['Data source', config.dataSource], ['Resolution', config.resolution], ['Units', config.units]]) {
    const row = [...entry.querySelectorAll('dl > div')].find(row => row.querySelector('dt').textContent === label);
    row.querySelector('dd').textContent = value
      ? (typeof value === 'object' ? JSON.stringify(value) : value) : 'To be documented';
  }
}

// Native anchors work before this enhancement and when JavaScript is unavailable.
const indexLinks = [...document.querySelectorAll('.project-index ol a')];
if ('IntersectionObserver' in window) {
  const visible = new Set();
  const observer = new window.IntersectionObserver(entries => {
    for (const entry of entries) entry.isIntersecting ? visible.add(entry.target.id) : visible.delete(entry.target.id);
    const first = indexLinks.find(link => visible.has(link.hash.slice(1)));
    if (first) for (const link of indexLinks) {
      if (link === first) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    }
  }, { rootMargin: '-5% 0px -45% 0px' });
  document.querySelectorAll('.document-section').forEach(section => observer.observe(section));
  if (import.meta.hot) import.meta.hot.dispose(() => observer.disconnect());
}
