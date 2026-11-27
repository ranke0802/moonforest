import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {NullEngine,Observable} from '@babylonjs/core';
import {prepareFixedLayouts} from '../src/fixed-layouts.js';
import {createWorld,mapNavigation} from '../src/world.js';
import {VillageNavigation} from '../src/village-navigation.js';
import {linksOf,navigationWork} from '../src/navigation.js';
import {warmMapNavigation} from '../src/map-navigation-cache.js';
import * as limits from '../src/world-limits.js';

// 2026-11-28 (navgrid): 0.3 builds route grids on VillageNavigation.buildRouteGrid.
// It must make exactly the decisions of ArenaNavigation.grid with the class's own
// free/segmentClear: same node objects, edge bytes and connected components.
globalThis.matchMedia ??= () => ({matches: true});
{
 const ctx = new Proxy({}, {get: (t, k) => k === 'measureText' ? () => ({width: 10}) : k === 'getImageData' ? (x, y, w, h) => ({data: new Uint8ClampedArray(w * h * 4), width: w, height: h}) : typeof k === 'string' ? (t[k] ?? (() => {})) : undefined, set: (t, k, v) => { t[k] = v; return true; }});
 globalThis.OffscreenCanvas ??= class { constructor(w, h) { this.width = w; this.height = h; } getContext() { return ctx; } };
}
function gridDigest(nav,nodes){
 const h=createHash('sha256'),n=nodes.length,xz=new Float64Array(n*2),free=new Uint8Array(n);
 for(let i=0;i<n;i++){const node=nodes[i];assert.deepEqual(Object.keys(node),['x','z','free']);xz[i*2]=node.x;xz[i*2+1]=node.z;free[i]=node.free?1:0;}
 const links=linksOf(nodes);h.update(new Uint8Array(xz.buffer));h.update(free);h.update(links.mask);h.update(new Uint8Array(links.costs.buffer));h.update(new Uint8Array(links.offsets.buffer));
 h.update(new Uint8Array(nav.gridMetadata.get(nodes).component.buffer));return h.digest('hex');
}
function compare(obstacles,radii,limit,label){
 const fast=new VillageNavigation(obstacles),slow=new VillageNavigation(obstacles);fast.fastRouteGrids=true;
 for(const radius of radii){
  const a=fast.grid(radius,limit),b=slow.grid(radius,limit);
  assert.equal(gridDigest(fast,a),gridDigest(slow,b),`${label} r=${radius} limit=${limit}`);
 }
 assert.ok(fast.routeCells&&!slow.routeCells,`${label}: the fast builder ran`);
}
function random(seed){return()=>((seed=Math.imul(seed^seed>>>15,1|seed)+0x6d2b79f5|0)>>>0)/2**32;}

test('0.3 plains route grids are byte-identical to the original builder and the cheap path is taken',async t=>{
 await prepareFixedLayouts(['village','great-plains']);
 const engine=new NullEngine(),world=createWorld(engine,{plains:true,village:true,gameplayV03:true,touchDevice:true});t.after(()=>engine.dispose());
 assert.equal(world.navigation.fastRouteGrids,true);assert.ok(world.navigation.routeCells,'the fast builder ran');
 const obstacles=world.navigation.obstacles,limit=limits.ENEMY_ARENA_RADIUS;assert.ok(limit>100);
 const slow=new VillageNavigation(obstacles);
 for(const radius of [.34,.7,1.7]){
  const key=`${radius}:${limit}`;assert.ok(world.navigation.grids.has(key),'warmed while the map loaded');
  const began=navigationWork.gridMs,a=world.navigation.grids.get(key),b=slow.grid(radius,limit);
  assert.ok(navigationWork.gridMs>began);
  assert.equal(gridDigest(world.navigation,a),gridDigest(slow,b),`plains r=${radius}`);
 }
 // A second arrival restores from the cache with the same bytes.
 const again=mapNavigation(world);warmMapNavigation({onDisposeObservable:new Observable()},again,'great-plains',limit,{radii:[.34,.7,1.7]});
 for(const radius of [.34,.7,1.7])assert.equal(gridDigest(again,again.grids.get(`${radius}:${limit}`)),gridDigest(slow,slow.grid(radius,limit)));
});

test('0.3 village and forest navigators match the original builder; 0.2 keeps the original path',()=>{
 for(const [label,options] of [['village',{village:true}],['forest',{village:true,forest:true}]]){
  const nav=mapNavigation({...options,gameplayV03:true});assert.equal(nav.fastRouteGrids,true);
  const legacy=mapNavigation(options);assert.equal(legacy.fastRouteGrids,undefined,'0.2 navigator is unchanged');
  compare(nav.obstacles,[.34,.7,1.7],40,label);compare(nav.obstacles,[.34],10,label+' small arena');
 }
});

test('random circles and rotated boxes, with a travel rule and odd radii, match the original builder',()=>{
 const next=random(1128);
 for(let round=0;round<6;round++){
  const obstacles=[];
  for(let i=0;i<70;i++){
   const x=(next()-.5)*44,z=(next()-.5)*44;
   if(next()<.5)obstacles.push({id:'c'+i,x,z,radius:.1+next()*2.4,height:2});
   else{const w=.2+next()*4,d=.2+next()*4;obstacles.push({id:'b'+i,shape:'box',x,z,halfWidth:w/2,halfDepth:d/2,yaw:next()*7,radius:Math.hypot(w,d)/2,height:2});}
  }
  // Grid points that land exactly on an obstacle's edge or a cell border.
  obstacles.push({id:'edge',x:2,z:0,radius:1.25-.035-.002,height:2},{id:'border',x:4,z:4,radius:.5,height:2});
  if(round===3)limits.setEnemyTravelRule({limit:(p,normal)=>normal,clamp(){},outside:p=>p.x>15&&Math.abs(p.z)>3,warmLimits:()=>[]});
  try{compare(obstacles,[0,.34,.7,1.2,1.7,2.3],round%2?11.5:21.5,'random '+round);}finally{limits.setEnemyTravelRule(null);}
 }
});

test('overridden rules and unsafe legacy boxes use the original builder',()=>{
 const unsafe=new VillageNavigation([{id:'thin',shape:'box',x:0,z:0,halfWidth:5,halfDepth:5,yaw:0,radius:.5,height:2}]);unsafe.fastRouteGrids=true;
 assert.equal(unsafe.fastRouteGridReady(.34,10),false);
 class Custom extends VillageNavigation{free(){return true;}}
 const custom=new Custom([{id:'a',x:0,z:0,radius:1,height:2}]);custom.fastRouteGrids=true;assert.equal(custom.fastRouteGridReady(.34,10),false);
 assert.ok(custom.grid(.34,10).every(node=>node.free));
 const plain=new VillageNavigation([{id:'a',x:0,z:0,radius:1,height:2}]);plain.fastRouteGrids=true;assert.equal(plain.fastRouteGridReady(.34,10),true);
 assert.equal(plain.fastRouteGridReady(NaN,10),false);
});
