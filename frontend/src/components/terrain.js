const CAMERA_ORBIT = '0deg 55deg 110%';

/** Keep both viewports mounted: switching views never recreates the map or its View. */
export function initializeTerrain({ root, sourceUrl, onMapResize, announce, loadViewer = () => import('@google/model-viewer') }) {
  const $ = selector => root.querySelector(selector);
  const map = $('#map');
  const terrain = $('#terrain-view');
  const host = $('#terrain-model');
  const status = $('#terrain-status');
  const progress = $('#terrain-progress');
  const reset = $('#terrain-reset');
  const buttons = [...root.querySelectorAll('[data-view-mode]')];
  const skipLink = document.querySelector('.skip-link');
  const listeners = new AbortController();
  let mode = '2d';
  let phase = 'idle';
  let viewer;
  let disposed = false;

  const showStatus = (next, message) => {
    phase = next;
    status.hidden = next === 'ready';
    host.setAttribute('aria-busy', String(next === 'loading'));
    $('#terrain-status-title').textContent = next === 'error' ? 'Terrain unavailable' : 'Loading terrain';
    $('#terrain-status-message').textContent = message;
    progress.hidden = next !== 'loading';
    $('#terrain-error-actions').hidden = next !== 'error';
    reset.disabled = next !== 'ready';
    if (mode === '3d') announce(message);
  };

  const load = async () => {
    if (phase === 'loading' || disposed) return;
    showStatus('loading', 'Loading the Jezero Crater terrain model.');
    progress.removeAttribute('value');
    viewer?.remove();
    viewer = null;
    try {
      await loadViewer();
      if (disposed) return;
      viewer = document.createElement('model-viewer');
      const current = viewer;
      const attributes = {
        tabindex: '0',
        alt: 'Textured 3D terrain of Jezero Crater with a synthetic display base.',
        'camera-controls': '',
        'camera-target': 'auto auto auto',
        'camera-orbit': CAMERA_ORBIT,
        'environment-image': 'neutral',
        exposure: '1',
        'shadow-intensity': '0.4',
        'interaction-prompt': 'none',
        'touch-action': 'none',
        loading: 'eager',
        reveal: 'auto',
      };
      for (const [key, value] of Object.entries(attributes)) viewer.setAttribute(key, value);
      // The surrounding status provides our loading UI instead of the default bar.
      const bar = document.createElement('span');
      bar.slot = 'progress-bar';
      viewer.append(bar);
      viewer.addEventListener('progress', event => {
        if (viewer !== current || phase !== 'loading') return;
        const value = event.detail?.totalProgress;
        if (Number.isFinite(value)) progress.value = value;
      }, { signal: listeners.signal });
      viewer.addEventListener('load', () => {
        if (viewer === current) showStatus('ready', 'Jezero Crater 3D terrain ready.');
      }, { signal: listeners.signal });
      viewer.addEventListener('error', () => {
        if (viewer === current) showStatus('error', 'The 3D model could not be displayed. Try again or return to the 2D map.');
      }, { signal: listeners.signal });
      host.replaceChildren(viewer);
      viewer.setAttribute('src', sourceUrl);
    } catch {
      if (!disposed) showStatus('error', 'The 3D viewer could not start. Check your connection and WebGL support, then try again.');
    }
  };

  const setMode = next => {
    if (!['2d', '3d'].includes(next) || next === mode || disposed) return;
    const active = document.activeElement;
    mode = next;
    const is3D = mode === '3d';
    root.classList.toggle('is-3d', is3D);
    map.inert = is3D;
    map.setAttribute('aria-hidden', String(is3D));
    terrain.hidden = !is3D;
    terrain.inert = !is3D;
    reset.hidden = !is3D;
    for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.viewMode === mode));
    if (skipLink) {
      skipLink.setAttribute('href', is3D ? '#terrain-view' : '#map');
      skipLink.textContent = is3D ? 'Skip to 3D terrain' : 'Skip to map';
    }
    // Move focus out of a viewport (or control) that just became inaccessible.
    if ((is3D && (map.contains(active) || active?.closest('.map-controls'))) || (!is3D && (terrain.contains(active) || active === reset))) {
      buttons.find(button => button.dataset.viewMode === mode).focus({ preventScroll: true });
    }
    announce(is3D ? '3D terrain view. Map layers and routes remain in 2D.' : '2D map restored.');
    if (is3D && phase === 'idle') void load();
    // OpenLayers measures the restored viewport on the next animation frame.
    if (!is3D) onMapResize();
  };

  for (const button of buttons) button.addEventListener('click', () => setMode(button.dataset.viewMode), { signal: listeners.signal });
  $('#terrain-retry').addEventListener('click', () => { terrain.focus({ preventScroll: true }); void load(); }, { signal: listeners.signal });
  $('#terrain-back').addEventListener('click', () => setMode('2d'), { signal: listeners.signal });
  reset.addEventListener('click', () => {
    if (phase !== 'ready') return;
    viewer.cameraTarget = 'auto auto auto';
    viewer.cameraOrbit = CAMERA_ORBIT;
    viewer.fieldOfView = 'auto';
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) viewer.jumpCameraToGoal();
  }, { signal: listeners.signal });

  return { setMode, dispose() { disposed = true; listeners.abort(); viewer?.remove(); } };
}
