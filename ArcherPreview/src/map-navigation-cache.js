// Cache only immutable grid decisions, not navigators, routes, scene objects or
// the large node/edge object graph. Each arrival restores independently owned
// nodes with exactly the original coordinates, neighbour order and edge costs.
export const MAP_NAVIGATION_CACHE_BYTES=512*1024;
const pools=new WeakMap(),directions=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
const sameBytes=(a,b)=>a.length===b.length&&a.every((value,i)=>value===b[i]);
const methodKeys=['constructor','grid','free','segmentClear','clearanceAt'],methods=nav=>methodKeys.map(key=>nav[key]);
function poolFor(engine){
 let pool=pools.get(engine);if(pool)return pool;
 pool={entries:new Map(),bytes:0,hits:0,misses:0,evictions:0,disposed:false,last:null};pools.set(engine,pool);
 engine.onDisposeObservable.addOnce(()=>{pool.disposed=true;pool.entries.clear();pool.bytes=0;pools.delete(engine);});return pool;
}
function encode(nodes,radius,limit){
 const step=limit>12?.75:.5,n=Math.floor(limit*2/step)+1;
 if(nodes.length!==n*n||n<3)return null;
 const free=new Uint8Array(Math.ceil(nodes.length/8)),edges=new Uint8Array(nodes.length);
 const offsets=directions.map(([x,z])=>z*n+x),costs=directions.map(([x,z])=>step*Math.hypot(x,z));
 for(let i=0;i<nodes.length;i++){
  const node=nodes[i];if(node.x!==(i%n)*step-limit||node.z!==Math.floor(i/n)*step-limit||typeof node.free!=='boolean')return null;
  if(node.free)free[i>>3]|=1<<(i&7);else if(node.edges.length)return null;
  let previous=-1;
  for(const [next,cost]of node.edges){const direction=offsets.indexOf(next-i);if(direction<=previous||direction<0||cost!==costs[direction])return null;edges[i]|=1<<direction;previous=direction;}
 }
 return {radius,limit,step,n,free,edges,bytes:free.byteLength+edges.byteLength};
}
function restore(grid){
 const {n,step,limit,free,edges}=grid,offsets=directions.map(([x,z])=>z*n+x),costs=directions.map(([x,z])=>step*Math.hypot(x,z));
 return Array.from({length:n*n},(_,i)=>{const adjacent=[];for(let direction=0;direction<8;direction++)if(edges[i]&(1<<direction))adjacent.push([i+offsets[direction],costs[direction]]);return {x:(i%n)*step-limit,z:Math.floor(i/n)*step-limit,free:!!(free[i>>3]&(1<<(i&7))),edges:adjacent};});
}
export function warmMapNavigation(engine,navigation,mapId,limit,{radii=[.34,.7],now=()=>performance.now()}={}){
 const started=now();
 if(!['village','great-plains','monster-forest','witch-cave'].includes(mapId)){for(const radius of radii)navigation.grid(radius,limit);return;}
 const pool=poolFor(engine),signature=new TextEncoder().encode(JSON.stringify([navigation.obstacles,radii,limit])),hooks=methods(navigation),old=pool.entries.get(mapId);
 // Instance-bound callbacks may capture a scene or mutable collision state.
 // Only the authored prototype methods may enter the cross-map snapshot.
 const canonical=methodKeys.every(key=>!Object.hasOwn(navigation,key));
 const hit=canonical&&old&&sameBytes(signature,old.signature)&&hooks.every((method,i)=>method===old.hooks[i]);
 if(hit){
  pool.hits++;pool.entries.delete(mapId);pool.entries.set(mapId,old);
  for(const grid of old.grids){const key=`${grid.radius}:${grid.limit}`;if(!navigation.grids.has(key))navigation.grids.set(key,restore(grid));navigation.grid(grid.radius,grid.limit);}
 }else{
  pool.misses++;if(old){pool.bytes-=old.bytes;pool.entries.delete(mapId);}
  const grids=radii.map(radius=>{const nodes=navigation.grid(radius,limit);return canonical?encode(nodes,radius,limit):null;});
  if(grids.every(Boolean)){
   const bytes=signature.byteLength+grids.reduce((sum,grid)=>sum+grid.bytes,0);
   if(bytes<=MAP_NAVIGATION_CACHE_BYTES){
    while(pool.entries.size&&(pool.bytes+bytes>MAP_NAVIGATION_CACHE_BYTES||pool.entries.size>=3)){const key=pool.entries.keys().next().value;pool.bytes-=pool.entries.get(key).bytes;pool.entries.delete(key);pool.evictions++;}
    pool.entries.set(mapId,{signature,hooks,grids,bytes});pool.bytes+=bytes;
   }
  }
 }
 pool.last={map:mapId,hit:!!hit,milliseconds:Math.max(0,now()-started)};
}
export function inspectMapNavigationCache(engine){const pool=engine&&pools.get(engine);return pool?{bytes:pool.bytes,limit:MAP_NAVIGATION_CACHE_BYTES,entries:pool.entries.size,hits:pool.hits,misses:pool.misses,evictions:pool.evictions,last:pool.last?{...pool.last}:null}:null;}
