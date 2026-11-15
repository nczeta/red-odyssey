export const STORAGE_KEY = 'red-odyssey.panels.v2';

export function readPanels(storage) {
  try {
    const value = JSON.parse(storage?.getItem(STORAGE_KEY) ?? 'null');
    if (typeof value?.left === 'boolean' && typeof value?.right === 'boolean') return { left: value.left, right: value.right };
  } catch { /* Private browsing and invalid storage must never prevent startup. */ }
  return { left: false, right: false };
}

export function savePanels(storage, panels) {
  try { storage?.setItem(STORAGE_KEY, JSON.stringify(panels)); } catch { /* Session-only preferences. */ }
}

export class LayoutState {
  constructor(panels, compact = false) {
    this.panels = { ...panels };
    this.compact = compact;
    this.drawer = null;
    this.focus = false;
  }
  toggle(side) {
    if (this.focus) return;
    if (this.compact) this.drawer = this.drawer === side ? null : side;
    else this.panels[side] = !this.panels[side];
  }
  visible(side) { return !this.focus && (this.compact ? this.drawer === side : this.panels[side]); }
  setFocus(value) { this.focus = value; }
}

/** Lock an embedded explorer without losing its document position. */
export function lockPageScroll(win = window, doc = document) {
  const position = { left: win.scrollX, top: win.scrollY };
  const bodyStyle = doc.body.getAttribute('style');
  const overflow = doc.documentElement.style.overflow;
  const scrollBehavior = doc.documentElement.style.scrollBehavior;
  const scrollbarGutter = doc.documentElement.style.scrollbarGutter;
  Object.assign(doc.body.style, { position: 'fixed', top: `${-position.top}px`, left: `${-position.left}px`, right: '0', width: '100%', overflow: 'hidden' });
  doc.documentElement.style.overflow = 'hidden';
  doc.documentElement.style.scrollbarGutter = 'auto';
  let restored = false;
  return () => {
    if (restored) return;
    restored = true;
    if (bodyStyle === null) doc.body.removeAttribute('style');
    else doc.body.setAttribute('style', bodyStyle);
    doc.documentElement.style.overflow = overflow;
    doc.documentElement.style.scrollbarGutter = scrollbarGutter;
    doc.documentElement.style.scrollBehavior = 'auto';
    win.scrollTo({ ...position, behavior: 'instant' });
    doc.documentElement.style.scrollBehavior = scrollBehavior;
  };
}

export function initializeLayout({ root, onResize, announce }) {
  let storage;
  try { storage = window.localStorage; } catch { /* Storage can be denied. */ }
  const media = matchMedia('(max-width: 1099px)');
  const state = new LayoutState(readPanels(storage), media.matches);
  const map = document.querySelector('#map');
  let focusOrigin;
  let restoreScroll;
  let chromeState = [];
  const render = () => {
    root.classList.toggle('is-focus', state.focus);
    for (const side of ['left', 'right']) {
      const visible = state.visible(side);
      root.classList.toggle(`${side}-closed`, !visible);
      const panel = document.querySelector(`#${side}-panel`);
      panel.inert = !visible;
      panel.setAttribute('aria-hidden', String(!visible));
      const opener = document.querySelector(`#open-${side}`);
      opener.hidden = visible || state.focus;
      opener.setAttribute('aria-expanded', String(visible));
    }
    document.querySelector('#focus-map').setAttribute('aria-pressed', String(state.focus));
    document.querySelector('#focus-map').hidden = state.focus;
    document.querySelector('#exit-focus').hidden = !state.focus;
    document.querySelector('#project-info').hidden = state.focus;
    onResize();
  };
  const toggle = side => {
    const active = document.activeElement;
    state.toggle(side);
    if (!state.compact) savePanels(storage, state.panels);
    render();
    if (!state.visible(side) && document.querySelector(`#${side}-panel`).contains(active)) document.querySelector(`#open-${side}`).focus({ preventScroll: true });
    else if (state.visible(side)) document.querySelector(`#close-${side}`).focus({ preventScroll: true });
    announce(`${side === 'left' ? 'Map layers' : 'Map legend'} ${state.visible(side) ? 'opened' : 'closed'}.`);
  };
  for (const side of ['left', 'right']) {
    document.querySelector(`#open-${side}`).addEventListener('click', () => toggle(side));
    document.querySelector(`#close-${side}`).addEventListener('click', () => toggle(side));
  }
  const setFocus = value => {
    if (value === state.focus) return;
    if (value) {
      focusOrigin = document.activeElement;
      restoreScroll = lockPageScroll();
      chromeState = [...document.querySelectorAll('.site-chrome')].map(element => ({ element, inert: element.inert, ariaHidden: element.getAttribute('aria-hidden') }));
      for (const { element } of chromeState) { element.inert = true; element.setAttribute('aria-hidden', 'true'); }
    }
    document.body.classList.toggle('has-map-focus', value);
    state.setFocus(value);
    render();
    if (value) document.querySelector('#exit-focus').focus({ preventScroll: true });
    else {
      for (const { element, inert, ariaHidden } of chromeState) {
        element.inert = inert;
        if (ariaHidden === null) element.removeAttribute('aria-hidden');
        else element.setAttribute('aria-hidden', ariaHidden);
      }
      chromeState = [];
      restoreScroll?.();
      restoreScroll = null;
      if (focusOrigin?.isConnected && !focusOrigin.closest('[inert]')) focusOrigin.focus({ preventScroll: true });
      else map.focus({ preventScroll: true });
      onResize();
    }
    announce(value ? 'Map focus mode. Press Escape to return.' : 'Dashboard restored.');
  };
  document.querySelector('#focus-map').addEventListener('click', () => setFocus(true));
  document.querySelector('#exit-focus').addEventListener('click', () => setFocus(false));
  document.addEventListener('keydown', event => {
    if (document.querySelector('dialog[open]')) return;
    if (event.key === 'Escape') {
      if (state.focus) { event.preventDefault(); setFocus(false); }
      else if (state.compact && state.drawer) toggle(state.drawer);
    }
    if (event.key === 'Tab' && state.focus) {
      const controls = [...root.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), [tabindex]:not([tabindex="-1"])')].filter(element => !element.closest('[hidden], [inert], dialog:not([open])'));
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !root.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
    }
  });
  media.addEventListener('change', event => {
    const active = document.activeElement;
    state.compact = event.matches;
    state.drawer = null;
    render();
    if (active?.closest('[inert]')) map.focus({ preventScroll: true });
  });
  document.querySelector('.workspace').addEventListener('transitionend', onResize);
  render();
  return {
    state,
    closeDrawers() {
      if (!state.compact || !state.drawer) return;
      state.drawer = null;
      render();
      map.focus({ preventScroll: true });
    },
  };
}
