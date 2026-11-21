import test from 'node:test';
import assert from 'node:assert/strict';
import {VillageNavigation} from '../src/village-navigation.js';
import {NavigationSearchWorkspace} from '../src/navigation-search-workspace.js';
import {gridEdges} from '../src/navigation.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
// The previous implementation's score initialization and stable sort/pop tie
// order serve as an independent result oracle, not a second production path.
function previousPath(nav,from,goal,radius,limit){
 const start=nav.findFree(from,radius,limit),target=nav.findFree(goal,radius,limit);
 if(nav.segmentClear(start,target,radius+.025))return [target];
 const nodes=nav.grid(radius,limit),s=nav.nearestNode(start,nodes,radius),g=nav.nearestNode(target,nodes,radius);
 if(s<0||g<0||nav.gridMetadata.get(nodes).component[s]!==nav.gridMetadata.get(nodes).component[g])return [];
 const scores=new Float64Array(nodes.length);scores.fill(Infinity);scores[s]=0;
 const parents=new Int32Array(nodes.length);parents.fill(-1);const closed=new Uint8Array(nodes.length),open=[{i:s,f:distance(start,target)}];
 while(open.length){
  open.sort((a,b)=>b.f-a.f);const {i}=open.pop();if(closed[i])continue;closed[i]=1;
  if(i===g){const route=[];for(let j=g;j>=0;j=parents[j])route.push(nodes[j]);route.reverse();route.push(target);return route;}
  for(const [j,cost]of gridEdges(nodes,i)){const next=scores[i]+cost;if(next>=scores[j])continue;scores[j]=next;parents[j]=i;open.push({i:j,f:next+distance(nodes[j],target)});}
 }
 return [];
}
const obstacles=()=>Array.from({length:5},(_,i)=>({id:'solid-'+i,x:0,z:i*1.7-3.4,radius:.7,height:2}));
test('reused A* buffers preserve exact route/tie order through repeated goals and actor radii',()=>{
 const nav=new VillageNavigation(obstacles()),reference=new VillageNavigation(obstacles());
 for(let repeat=0;repeat<4;repeat++)for(const radius of [.22,.34,.7,1.6])for(const z of [-5,-2,0,2,5]){
  const from={x:-6,z},to={x:6,z:-z};
  assert.deepEqual(nav.path(from,to,radius,10),previousPath(reference,from,to,radius,10));
 }
 assert.ok(nav.searchWorkspace.queries>10);assert.equal(nav.searchWorkspace.bufferAllocations,4);
 assert.equal(nav.searchWorkspace.busy,false);
});
test('generation changes avoid stale scores, grow once and reset safely on wrap',()=>{
 const work=new NavigationSearchWorkspace();work.begin(20);work.scores[4]=1;work.scoreEpoch[4]=work.epoch;work.closed[4]=work.epoch;work.end();
 const scores=work.scores,marks=work.scoreEpoch;work.begin(10);assert.equal(work.scores,scores);assert.equal(work.scoreEpoch,marks);assert.notEqual(work.scoreEpoch[4],work.epoch);assert.notEqual(work.closed[4],work.epoch);work.end();
 work.begin(30);assert.equal(work.capacity,30);assert.equal(work.bufferAllocations,8);work.end();
 work.epoch=0xffffffff;work.scoreEpoch.fill(1);work.closed.fill(1);work.begin(30);assert.equal(work.epoch,1);assert.equal(work.scoreEpoch[4],0);assert.equal(work.closed[4],0);assert.throws(()=>work.begin(30),/already in use/);work.end();
 assert.throws(()=>work.begin(0),/Invalid/);
});
test('one shared workspace removes per-route full-map buffer allocation',t=>{
 const nav=new VillageNavigation(obstacles()),from={x:-6,z:0},to={x:6,z:0},route=nav.path(from,to,.34,10);
 const work=nav.searchWorkspace,bytes=work.snapshot().allocatedBytes;
 for(let i=0;i<99;i++)assert.deepEqual(nav.path(from,to,.34,10),route);
 assert.equal(work.queries,100);assert.equal(work.bufferAllocations,4);assert.equal(work.allocatedBytes,bytes);
 t.diagnostic(JSON.stringify({searches:100,gridNodes:work.capacity,previousBufferAllocations:300,currentBufferAllocations:4,previousAllocatedBytes:work.capacity*13*100,currentAllocatedBytes:bytes,retainedScratchBytes:work.capacity*20,scope:'A* typed search buffers only, not total navigation/CPU/FPS'}));
});
