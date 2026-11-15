import VectorLayer from 'ol/layer/Vector.js';
import TileLayer from 'ol/layer/Tile.js';
import VectorSource from 'ol/source/Vector.js';
import XYZ from 'ol/source/XYZ.js';
import TileGrid from 'ol/tilegrid/TileGrid.js';
import { createXYZ } from 'ol/tilegrid.js';
import GeoJSON from 'ol/format/GeoJSON.js';
import { get as getProjection, getTransformFromProjections } from 'ol/proj.js';
import { Style, Stroke, Fill, Circle as CircleStyle } from 'ol/style.js';
import { createCogLayer } from './cog.js';
import { createContourLayer } from './contours.js';
import { createGeologyLayer } from './geology.js';
import { getRouteStyle } from './routes.js';

export function spatialPair(crs, viewCrs) {
  if (!crs) throw new Error('A source CRS must be configured explicitly.');
  const source = getProjection(crs);
  const destination = getProjection(viewCrs);
  if (!source || !destination) throw new Error(`CRS not registered: ${!source ? crs : viewCrs}.`);
  if (source.getCode() !== destination.getCode() && !getTransformFromProjections(source, destination)) {
    throw new Error(`No registered transformation from ${crs} to ${viewCrs}.`);
  }
  return { source, destination };
}

const vectorStyle = new Style({
  stroke: new Stroke({ color: '#D38B6E', width: 2 }),
  fill: new Fill({ color: 'rgba(211,139,110,0.12)' }),
  image: new CircleStyle({ radius: 5, fill: new Fill({ color: '#D9C4AC' }), stroke: new Stroke({ color: '#101417', width: 2 }) }),
});

export function readGeoJSON(data, crs, viewCrs) {
  const { source, destination } = spatialPair(crs, viewCrs);
  if (!data || !['FeatureCollection', 'Feature'].includes(data.type)) throw new Error('Expected a GeoJSON Feature or FeatureCollection.');
  // Legacy in-file CRS declarations cannot override the verified layer configuration.
  const { crs: ignoredCrs, ...geometry } = data;
  return new GeoJSON({ dataProjection: source, featureProjection: destination }).readFeatures(geometry, {
    dataProjection: source, featureProjection: destination,
  });
}

export async function createLayer(config, viewCrs, fetcher = fetch) {
  const { source } = spatialPair(config.crs, viewCrs);
  if (config.type === 'cog') return createCogLayer(config, source);
  if (['contours', 'geology'].includes(config.type)) {
    const urls = config.type === 'contours' ? [config.vectorUrl] : config.vectors?.map(vector => vector.url);
    if (!urls?.length || urls.some(url => !url)) throw new Error('A GeoJSON URL is required for each vector layer.');
    const datasets = await Promise.all(urls.map(async url => {
      const response = await fetcher(url);
      if (!response.ok) throw new Error(`Vector request failed (HTTP ${response.status}).`);
      return readGeoJSON(await response.json(), config.crs, viewCrs);
    }));
    return config.type === 'contours' ? createContourLayer(config, source, datasets[0]) : createGeologyLayer(config, source, datasets);
  }
  if (config.type === 'geojson') {
    let data = config.data;
    if (!data) {
      const response = await fetcher(config.sourceUrl);
      if (!response.ok) throw new Error(`Dataset request failed (HTTP ${response.status}).`);
      data = await response.json();
    }
    return new VectorLayer({
      source: new VectorSource({ features: readGeoJSON(data, config.crs, viewCrs), wrapX: false }),
      style: config.style || vectorStyle,
    });
  }
  if (config.type === 'xyz') {
    if (!config.sourceUrl) throw new Error('A tile URL is required.');
    if (!config.tileGrid && !config.extent) throw new Error('Tiles require an explicit extent or tile grid.');
    const tileGrid = config.tileGrid ? new TileGrid(config.tileGrid) : createXYZ({ extent: config.extent, maxZoom: config.maxZoom ?? 18 });
    return new TileLayer({ source: new XYZ({
      url: config.sourceUrl,
      projection: source,
      tileGrid,
      // The tile grid uses the dataset extent, never an implicit terrestrial grid.
      maxZoom: config.maxZoom ?? 18,
      wrapX: false,
      crossOrigin: 'anonymous',
      attributions: config.attribution || undefined,
    }) });
  }
  throw new Error(`Adapter not implemented: ${config.type}.`);
}

export class LayerManager extends EventTarget {
  constructor(map, configs, viewCrs, fetcher = fetch) {
    super();
    this.map = map;
    this.viewCrs = viewCrs;
    this.fetcher = fetcher;
    this.entries = new Map();
    configs.forEach(config => this.register(config));
  }
  register(config) {
    if (!config.id || this.entries.has(config.id)) throw new Error(`Missing or duplicate layer ID: ${config.id}.`);
    this.entries.set(config.id, {
      config: { visible: true, opacity: 1, order: this.entries.size, ...config },
      layer: null, state: config.lazy && config.sourceUrl ? 'configured' : 'unavailable', error: null,
    });
  }
  notify() {
    const route = this.entries.get('routes')?.layer;
    if (route) {
      const style = getRouteStyle(this.entries.values());
      if (route.getStyle() !== style) route.setStyle(style);
    }
    this.dispatchEvent(new Event('change'));
  }
  get(id) {
    const entry = this.entries.get(id);
    if (!entry) throw new Error(`Unknown layer: ${id}.`);
    return entry;
  }
  async load(id) {
    const entry = this.get(id);
    if (entry.state === 'loading' || entry.layer) return;
    if (!entry.config.sourceUrl && !entry.config.data) return;
    entry.state = 'loading';
    entry.error = null;
    this.notify();
    try {
      const layer = await createLayer(entry.config, this.viewCrs, this.fetcher);
      entry.layer = layer;
      if (layer.get('legend')) entry.config.legend = layer.get('legend');
      layer.set('registryId', id);
      layer.setVisible(entry.config.visible);
      layer.setOpacity(entry.config.opacity);
      layer.setZIndex(entry.config.order);
      if (entry.config.extent) {
        // Extents are only applied as view clipping when already in the view CRS.
        if (entry.config.crs === this.viewCrs) layer.setExtent(layer.get('renderExtent') || entry.config.extent);
      }
      if (['xyz', 'cog', 'contours', 'geology'].includes(entry.config.type)) {
        entry.state = 'loading';
        const source = layer.get('rasterSource') || layer.getSource();
        let failed = false;
        source.on('tileloaderror', () => {
          failed = true;
          entry.state = 'error';
          entry.error = 'One or more tiles could not be loaded. Check URL, CRS, HTTP range support and CORS.';
          this.notify();
        });
        source.on('tileloadend', () => {
          if (!failed) { entry.state = 'ready'; this.notify(); }
        });
        // A hidden raster cannot trigger tile requests; its adapter is configured but unverified.
        if (!entry.config.visible) entry.state = 'configured';
      } else entry.state = 'ready';
      // Install tile listeners before the first render can request data.
      this.map.addLayer(layer);
    } catch (error) {
      entry.state = 'error';
      entry.error = error.message;
    }
    this.notify();
  }
  setVisible(id, visible) {
    const entry = this.get(id);
    if (!entry.layer && !entry.config.lazy) return;
    const mapTypes = ['xyz', 'cog', 'contours', 'geology'];
    if (visible && mapTypes.includes(entry.config.type)) {
      for (const [otherId, other] of this.entries) {
        if (otherId !== id && mapTypes.includes(other.config.type) && (entry.config.exclusiveMap || other.config.exclusiveMap)) {
          other.config.visible = false;
          other.layer?.setVisible(false);
        }
      }
    }
    entry.config.visible = Boolean(visible);
    entry.layer?.setVisible(entry.config.visible);
    this.notify();
    if (!entry.layer && entry.config.visible) void this.load(id);
  }
  setOpacity(id, opacity) {
    const entry = this.get(id);
    if (!entry.layer || !Number.isFinite(opacity)) return;
    entry.config.opacity = Math.max(0, Math.min(1, opacity));
    entry.layer.setOpacity(entry.config.opacity);
    this.notify();
  }
  setOrder(id, order) {
    const entry = this.get(id);
    if (!Number.isFinite(order)) throw new Error('Layer order must be finite.');
    entry.config.order = order;
    entry.layer?.setZIndex(order);
    this.notify();
  }
  setGeoJSON(id, data, crs) {
    const entry = this.get(id);
    const features = readGeoJSON(data, crs, this.viewCrs);
    if (entry.layer) this.map.removeLayer(entry.layer);
    entry.config = { ...entry.config, data, crs, visible: true };
    entry.layer = new VectorLayer({ source: new VectorSource({ features, wrapX: false }), style: entry.config.style || vectorStyle, opacity: entry.config.opacity, zIndex: entry.config.order });
    entry.layer.set('registryId', id);
    this.map.addLayer(entry.layer);
    entry.state = 'ready';
    entry.error = null;
    this.notify();
  }
  clear(id) {
    const entry = this.get(id);
    if (entry.layer) this.map.removeLayer(entry.layer);
    entry.layer = null;
    entry.config.data = null;
    entry.state = 'unavailable';
    entry.error = null;
    this.notify();
  }
  async loadConfigured() { await Promise.all([...this.entries].filter(([, entry]) => !entry.config.lazy || entry.config.visible).map(([id]) => this.load(id))); }
}
