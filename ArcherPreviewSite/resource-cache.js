// This cache is shared by archer and warrior, and survives application deployments.
const CACHE_NAME = 'moonforest-resources-v1';
const inFlight = new Map();
const stats = {hits:0,downloads:0,prunedFiles:0,cleanupDeferred:false,cleanupError:null};
const GRAPH_CACHE='moonforest-resource-graphs-v1';
const contentName=/^[a-f0-9]{64}\.(bin|gltf|png|jpg|jpeg|webp|ktx2|js|wasm|wav|mp3)$/;
const validGraph=data=>/^[a-f0-9]{64}$/.test(data?.revision)&&Array.isArray(data.files)&&data.files.length>0&&data.files.length<=20000&&data.files.every(name=>contentName.test(name));
let maintenance=Promise.resolve();

async function retainGraphAndPrune(source,data){
  const scope=self.registration.scope;
  if(!source?.id||!source.url?.startsWith(scope)||!validGraph(data))return;
  const graphs=await caches.open(GRAPH_CACHE),prefix=new URL('__resource_graph__/',scope).href;
  const key=id=>prefix+encodeURIComponent(id);
  // Persist per-document declarations across worker suspension/restart. An old
  // open tab keeps its own graph; it never has to fetch a new asset revision.
  await graphs.put(key(source.id),new Response(JSON.stringify({revision:data.revision,files:data.files}),{headers:{'Content-Type':'application/json'}}));
  const clients=(await self.clients.matchAll({type:'window',includeUncontrolled:true})).filter(c=>c.url.startsWith(scope));
  if(!clients.length)return;
  const keep=new Set(data.files),live=new Set(clients.map(c=>key(c.id)));
  for(const client of clients){
    const response=await graphs.match(key(client.id));
    const graph=response?await response.json():null;
    // A pre-upgrade or not-yet-ready tab has not declared its needs. Defer
    // deletion rather than forcing downloads or breaking its current map.
    if(!validGraph(graph)){stats.cleanupDeferred=true;return;}
    for(const name of graph.files)keep.add(name);
  }
  stats.cleanupDeferred=false;
  const cache=await caches.open(CACHE_NAME),contentBase=new URL('./assets/content/',scope).href;
  for(const request of await cache.keys()){
    const url=new URL(request.url),name=url.pathname.split('/').pop();
    if(url.href.startsWith(contentBase)&&contentName.test(name)&&!keep.has(name)&&!inFlight.has(url.href)){
      if(await cache.delete(request))stats.prunedFiles++;
    }
  }
  for(const request of await graphs.keys())if(request.url.startsWith(prefix)&&!live.has(request.url))await graphs.delete(request);
}
self.addEventListener('message', event => {
  if(event.data?.type === 'RESOURCE_CACHE_STATS') event.ports?.[0]?.postMessage({...stats});
  if(event.data?.type === 'RESOURCE_GRAPH_USE'){
    maintenance=maintenance.then(()=>retainGraphAndPrune(event.source,event.data)).catch(error=>{stats.cleanupError=String(error.message??error);});
    event.waitUntil?.(maintenance);
  }
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
