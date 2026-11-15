/** FastAPI routing contract. Coordinates are projected meters in MARS:JEZERO.
 * POST { start: [x,y], end: [x,y], waypoints?: [[x,y]], reorder?: boolean, crs: string }
 * Response: { route: GeoJSON FeatureCollection, metrics?: object }
 */
export async function requestRoute({ start, end, waypoints = [], reorder = true, crs, api, signal }, fetcher = fetch) {
  if (!api.routeUrl || !api.responseCrs) throw new Error('Route service URL and response CRS must be configured.');
  if (![start, end].every(point => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite))) throw new Error('Two valid endpoints are required.');
  if (!Array.isArray(waypoints) || waypoints.length > 8 || !waypoints.every(point => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite))) throw new Error('Use up to 8 valid intermediate stops.');
  const timeout = AbortSignal.timeout(api.timeoutMs ?? 30000);
  const response = await fetcher(api.routeUrl, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ start, end, waypoints, reorder, crs }),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  if (!response.ok) {
    const error = await response.json?.().catch(() => null);
    const detail = typeof error?.detail === 'string' ? ` ${error.detail}` : '';
    throw new Error(`Route service failed (HTTP ${response.status}).${detail}`);
  }
  const data = await response.json();
  if (data?.route?.type !== 'FeatureCollection' || !Array.isArray(data.route.features) || !data.route.features.length) throw new Error('The route service returned no route features.');
  if (data.route.features.some(feature => !['LineString', 'MultiLineString'].includes(feature.geometry?.type))) throw new Error('Route features must contain line geometries.');
  if (data.crs && data.crs !== api.responseCrs) throw new Error('The route service returned an unexpected CRS.');
  return { route: data.route, metrics: data.metrics || null, crs: api.responseCrs, waypointOrder: data.waypointOrder || null };
}
