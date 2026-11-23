let initialized;
const releaseGraph = typeof __MOONFOREST_CACHE_GRAPH__ === 'undefined' ? null : __MOONFOREST_CACHE_GRAPH__;
let registeredController, registeredRevision, declaration, listening = false, sharedRevision = null;

// Phones run the game in a frame of moonforest-shell.html. The worker defers all
// cleanup while any open page in its scope has not declared its files, and the
// outer shell never loads game code, so hand it the same declaration to
// register under its own name (same origin only; once per release and page).
function shareWithShell() {
  if (!declaration || sharedRevision === declaration.revision) return;
  let parent = null;
  try { parent = globalThis.parent && globalThis.parent !== globalThis ? globalThis.parent : null; } catch { parent = null; }
  if (!parent || !globalThis.location?.origin) return;
  try {
    parent.postMessage({type:'MOONFOREST_RESOURCE_GRAPH', revision:declaration.revision, files:declaration.files}, globalThis.location.origin);
    sharedRevision = declaration.revision;
  } catch { /* A closed or foreign parent keeps the worker's deferral. */ }
}

function publishGraph(worker) {
  const controller = worker.controller;
  if (!declaration || !controller || (registeredController === controller && registeredRevision === declaration.revision)) return;
  try {
    controller.postMessage(declaration);
    registeredController = controller;
    registeredRevision = declaration.revision;
  }catch{ /* A worker replaced during startup will receive the next declaration. */ }
}

export function registerResourceGraph(index, graph = releaseGraph) {
  const worker = globalThis.navigator?.serviceWorker;
  if (!worker) return;
  // Without a matching release inventory an incomplete declaration could
  // evict valid bytes. Undeclared clients already defer cleanup in the worker.
  if (!graph || graph.baseRevision !== index.revision) {
    declaration = null;
    return;
  }
  if (declaration?.revision !== graph.revision) {
    declaration = {type:'RESOURCE_GRAPH_USE', revision:graph.revision, files:[...Object.keys(index.files), ...graph.extraFiles]};
  }
  if (!listening && worker.addEventListener) {
    listening = true;
    worker.addEventListener('controllerchange', () => publishGraph(worker));
  }
  publishGraph(worker);
  shareWithShell();
}
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
