/** Proposed frontend adapter contract, not an existing backend implementation.
 * POST { start: [x,y], end: [x,y], crs: string }
 * Response: { route: GeoJSON FeatureCollection, metrics?: object }
 */
export async function requestRoute({ start, end, crs, api, signal }, fetcher = fetch) {
  if (!api.routeUrl || !api.responseCrs) throw new Error('Route service URL and response CRS must be configured.');
  if (![start, end].every(point => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite))) throw new Error('Two valid endpoints are required.');
  const timeout = AbortSignal.timeout(api.timeoutMs ?? 30000);
  const response = await fetcher(api.routeUrl, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ start, end, crs }),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  if (!response.ok) throw new Error(`Route service failed (HTTP ${response.status}).`);
  const data = await response.json();
  if (data?.route?.type !== 'FeatureCollection' || !Array.isArray(data.route.features) || !data.route.features.length) throw new Error('The route service returned no route features.');
  if (data.route.features.some(feature => !['LineString', 'MultiLineString'].includes(feature.geometry?.type))) throw new Error('Route features must contain line geometries.');
  return { route: data.route, metrics: data.metrics || null, crs: api.responseCrs };
}
