// This cache is shared by archer and warrior, and survives application deployments.
const CACHE_NAME = 'moonforest-resources-v1';
const inFlight = new Map();
const stats = {hits:0,downloads:0};
self.addEventListener('message', event => {
  if(event.data?.type === 'RESOURCE_CACHE_STATS') event.ports?.[0]?.postMessage({...stats});
});
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  const base = new URL('./assets/content/', self.registration.scope);
  if (request.method !== 'GET' || url.origin !== base.origin || !url.href.startsWith(base.href) ||
      !/^[a-f0-9]{64}\.(bin|gltf|png|jpg|webp|wav|mp3)$/.test(url.pathname.split('/').pop())) return;
  event.respondWith((async () => {
    let cache;
    try { cache = await caches.open(CACHE_NAME); const hit = await cache.match(request); if (hit) {stats.hits++;return hit;} } catch { /* Storage denied: normal network fallback. */ }
    if (!inFlight.has(request.url)) {
      const pending = (async () => {
        stats.downloads++;
        const response = await fetch(request);
        // Failed/partial responses must never poison the persistent cache.
        if (cache && response.status === 200) {
          try { await cache.put(request, response.clone()); } catch { /* Quota failure must not break playback. */ }
        }
        return response;
      })();
      inFlight.set(request.url, pending);
      pending.finally(() => inFlight.delete(request.url)).catch(() => {});
    }
    return (await inFlight.get(request.url)).clone();
  })());
});
