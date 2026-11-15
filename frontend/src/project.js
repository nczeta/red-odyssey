import { layerConfig } from './config/app.js';

export function initializeProjectPage(root = document, view = window) {
  // Update only delivery metadata. Scientific provenance stays in the document.
  for (const entry of root.querySelectorAll('#layer-catalog [data-layer]')) {
    const config = layerConfig.find(layer => layer.id === entry.dataset.layer);
    if (!config) continue;
    for (const field of entry.querySelectorAll('[data-config-field]')) {
      const value = config[field.dataset.configField];
      if (value != null) field.textContent = typeof value === 'object' ? JSON.stringify(value) : value;
    }
  }

  const links = [...root.querySelectorAll('.project-index ol a[href^="#"]')];
  const sections = links.map(link => root.getElementById(link.hash.slice(1))).filter(Boolean);
  if (!sections.length) return () => {};

  const setActive = id => {
    for (const link of links) {
      const active = link.hash === `#${id}`;
      link.classList.toggle('is-active', active);
      if (active) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    }
  };
  const fromHash = () => {
    const id = view.location.hash.slice(1);
    setActive(sections.some(section => section.id === id) ? id : sections[0].id);
  };
  const updateFromScroll = () => {
    frame = null;
    const active = sections.filter(section => section.getBoundingClientRect().top <= view.innerHeight * 0.25).at(-1);
    const atBottom = view.scrollY > 0 && view.scrollY + view.innerHeight >= root.documentElement.scrollHeight - 2;
    setActive(atBottom ? sections.at(-1).id : (active ?? sections[0]).id);
  };
  let frame = null;
  const scheduleUpdate = () => {
    if (frame === null) frame = view.requestAnimationFrame(updateFromScroll);
  };
  const onClick = event => {
    const link = event.target.closest('a[href^="#"]');
    if (links.includes(link)) setActive(link.hash.slice(1));
  };
  fromHash();
  const index = root.querySelector('.project-index');
  index.addEventListener('click', onClick);
  view.addEventListener('hashchange', fromHash);
  view.addEventListener('scroll', scheduleUpdate, { passive: true });
  view.addEventListener('resize', scheduleUpdate);
  view.addEventListener('pageshow', scheduleUpdate);
  return () => {
    if (frame !== null) view.cancelAnimationFrame(frame);
    index.removeEventListener('click', onClick);
    view.removeEventListener('hashchange', fromHash);
    view.removeEventListener('scroll', scheduleUpdate);
    view.removeEventListener('resize', scheduleUpdate);
    view.removeEventListener('pageshow', scheduleUpdate);
  };
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  const dispose = initializeProjectPage();
  if (import.meta.hot) import.meta.hot.dispose(dispose);
}
