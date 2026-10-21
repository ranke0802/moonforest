let initialized;
export function initializeResourceCache() {
  return initialized ||= (async () => {
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return false;
    try {
      await navigator.serviceWorker.register(new URL(`${import.meta.env.BASE_URL}resource-cache.js`, location.href), { updateViaCache:'none' });
      if (!navigator.serviceWorker.controller) await new Promise(resolve => {
        const done = () => { clearTimeout(timer); navigator.serviceWorker.removeEventListener('controllerchange', done); resolve(); };
        const timer = setTimeout(done, 4000);
        navigator.serviceWorker.addEventListener('controllerchange', done);
        if (navigator.serviceWorker.controller) done();
      });
      return Boolean(navigator.serviceWorker.controller);
    } catch { return false; }
  })();
}

/** Reuse the pre-upgrade GLB only if it is already in the browser HTTP cache. */
export async function migrateCachedGlb(config, manifestUrl) {
  if (!config.legacyCacheMap || !('caches' in window) || !crypto.subtle) return;
  try {
    const cache = await caches.open('moonforest-resources-v1');
    if (await cache.match(new URL(config.model, manifestUrl).href)) return;
    const mapResponse = await fetch(new URL(config.legacyCacheMap, manifestUrl), { cache:'force-cache' });
    if (!mapResponse.ok) return;
    const map = await mapResponse.json();
    const old = await fetch(new URL(map.url, manifestUrl), { cache:'only-if-cached', mode:'same-origin' });
    if (old.status !== 200) return;
    const bytes = await old.arrayBuffer();
    const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
    if (digest !== map.sha256) return;
    const needed = new Set(config.resources.map(path => new URL(path, manifestUrl).href));
    for (const file of map.files) {
      const url = new URL(`./content/${file.name}`, manifestUrl).href;
      if (!needed.has(url) || await cache.match(url)) continue;
      const data = new Uint8Array(file.size); let cursor = 0;
      for (const [offset, length] of file.parts) {
        if (offset !== null) data.set(new Uint8Array(bytes, offset, length), cursor);
        cursor += length;
      }
      await cache.put(url, new Response(data, { headers:{'Content-Type':file.type} }));
    }
  } catch { /* An absent/evicted old HTTP cache needs only the missing resources. */ }
}
