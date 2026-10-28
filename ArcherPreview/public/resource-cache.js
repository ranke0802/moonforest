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
      !/^[a-f0-9]{64}\.(bin|gltf|png|jpg|jpeg|webp|ktx2|js|wasm|wav|mp3)$/.test(url.pathname.split('/').pop())) return;
  // A revision/query string cannot change bytes identified by a content hash.
  url.search='';url.hash='';const key={url:url.href};
  event.respondWith((async () => {
    let cache;
    try { cache = await caches.open(CACHE_NAME); const hit = await cache.match(url.href,{ignoreVary:true}); if (hit) {stats.hits++;return hit;} } catch { /* Storage denied: normal network fallback. */ }
    if(request.headers.get('X-Moonforest-Cache-Writer')==='page'){stats.downloads++;return fetch(url.href);}
    if (!inFlight.has(key.url)) {
      const pending = (async () => {
        stats.downloads++;
        const response = await fetch(url.href);
        // Failed/partial responses must never poison the persistent cache.
        // Return headers/stream immediately so byte progress is real. Keep the
        // shared response alive until the cache write completes to coalesce
        // a loader request arriving just after prefetch has finished reading.
        const saving=cache&&response.status===200?cache.put(url.href,response.clone()).catch(()=>{}):Promise.resolve();
        const finished=saving.finally(()=>inFlight.delete(key.url));
        event.waitUntil?.(finished);
        return response;
      })();
      inFlight.set(key.url, pending);
      pending.catch(()=>inFlight.delete(key.url));
    }
    return (await inFlight.get(key.url)).clone();
  })());
});
