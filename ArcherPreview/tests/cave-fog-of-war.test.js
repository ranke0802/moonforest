import test from 'node:test';
import assert from 'node:assert/strict';
import {CaveFogOfWar,CaveFogMemory,navigationSightBlocker,caveFogAllowsRecord,caveFogRootEnabled} from '../src/cave-fog-of-war.js';
import {buildCaveFogCover,CAVE_FOG_GLSL,CAVE_FOG_COVER_FRAGMENT} from '../src/cave-fog-cover.js';
const make=options=>new CaveFogOfWar({minX:0,minZ:0,width:32,depth:32,cellSize:1,radius:8,isOpaque:()=>false,...options});
const p=(x,z)=>({x,z});

test('three states distinguish unexplored, presently visible and remembered areas',()=>{
 const f=make();assert.equal(f.stateAt(3,3),0);f.update(p(3.5,3.5),0);
 assert.equal(f.stateAt(3.5,3.5),2);assert.equal(f.stateAt(29,29),0);
 f.update(p(22.5,22.5),.01);assert.equal(f.stateAt(3.5,3.5),1);assert.equal(f.stateAt(22.5,22.5),2);assert.equal(f.stateAt(2,29),0);
});
test('a wall is visible but its room behind is neither revealed nor submitted',()=>{
 const f=make({radius:24,isOpaque:(x)=>Math.floor(x)===10});f.update(p(5.5,12.5),0);
 assert.equal(f.stateAt(10.5,12.5),2);assert.equal(f.stateAt(11.5,12.5),0);
 assert.equal(f.boundsVisible(p(14,11),p(20,17)),false);
});
test('camera-only activity never reveals walls or causes recomputation',()=>{
 const f=make({isOpaque:x=>x>=8&&x<9});f.update(p(5.5,5.5),0);const before=f.rgba.slice();
 for(let i=1;i<=240;i++)assert.equal(f.update(p(5.5,5.5),i/30),false);
 assert.deepEqual(f.rgba,before);assert.equal(f.stats.updates,1);assert.equal(f.stateAt(11,5),0);
});
test('diagonal touching walls do not leak line of sight through their seam',()=>{
 const f=make({isOpaque:(x,z)=>(Math.floor(x)===6&&Math.floor(z)===5)||(Math.floor(x)===5&&Math.floor(z)===6)});
 f.update(p(5.5,5.5),0);assert.equal(f.stateAt(6.5,6.5),0);assert.equal(f.stateAt(7.5,7.5),0);
 assert.equal(f.stateAt(6.5,5.5),2);assert.equal(f.stateAt(5.5,6.5),2);
});
test('an open doorway reveals its sightline without illuminating an adjacent solid wall',()=>{
 const f=make({radius:18,isOpaque:(x,z)=>Math.floor(x)===10&&(z<12||z>=15)});
 f.update(p(6.5,13.5),0);assert.equal(f.stateAt(15.5,13.5),2);assert.equal(f.stateAt(15.5,22.5),0);
});
test('walking a bent corridor never masks the player or forward traversable cells',()=>{
 const open=(x,z)=>(x>=2&&x<23&&z>=3&&z<8)||(x>=18&&x<23&&z>=3&&z<26);
 const f=make({isOpaque:(x,z)=>!open(x,z)});let samples=0;
 const route=[...Array.from({length:76},(_,i)=>p(3.5+i*.2,5.5)),...Array.from({length:90},(_,i)=>p(20.5,5.5+i*.2))];
 for(const [i,pos]of route.entries()){
   f.update(pos,i/30);assert.equal(f.stateAt(pos.x,pos.z),2);
   assert.ok(f.boundsVisible(p(pos.x-.35,pos.z-.35),p(pos.x+.35,pos.z+.35)));
   samples++;
 }
 assert.equal(samples,166);assert.equal(f.stateAt(3.5,5.5),1);
});
test('a grid-centre obstruction never removes the player cell at a wall edge',()=>{
 const f=make({isOpaque:(x,z)=>x<6&&z<6});f.update(p(5.99,5.99),0);assert.equal(f.stateAt(5.99,5.99),2);assert.equal(f.stateAt(7.5,5.5),2);
});
test('movement throttling cannot keep the previous room visible after a teleport',()=>{
 const f=make();f.update(p(3.5,3.5),10);assert.equal(f.update(p(3.6,3.5),10.01),false);
 assert.equal(f.update(p(20.5,20.5),10.02),true);assert.equal(f.stateAt(3.5,3.5),1);
 assert.equal(f.boundsVisible(p(1,1),p(5,5)),false);assert.equal(f.stateAt(20.5,20.5),2);
});
test('memory survives an environment disposal and a different-map round trip',()=>{
 const memory=new CaveFogMemory();let f=make({memory});f.update(p(3.5,3.5),0);f.dispose();
 const forest=make({memory,mapKey:'forest'});forest.update(p(28.5,28.5),0);forest.dispose();
 f=make({memory});f.update(p(22.5,22.5),0);assert.equal(f.stateAt(3.5,3.5),1);assert.equal(f.stateAt(28.5,28.5),0);
});
test('memory map count is bounded and geometry signatures cannot misalign cells',()=>{
 const memory=new CaveFogMemory(2);for(let i=0;i<5;i++){const f=make({memory,mapKey:String(i)});f.update(p(3,3),0);}
 assert.equal(memory.maps.size,2);assert.equal(memory.maps.has('0'),false);
 const changed=make({memory,mapKey:'4',cellSize:.5});assert.equal(changed.stats.exploredCells,0);
});
test('serialized exploration restores only matching maps and rejects malformed runs atomically',()=>{
 const a=make();a.update(p(3.5,3.5),0);const saved=a.snapshot(),b=make();assert.equal(b.restore(saved),true);b.update(p(24,24),0);assert.equal(b.stateAt(3.5,3.5),1);
 const before=b.explored.slice();for(const runs of [[0],[-1,2],[5,-1],[1000,500],[8,5,2,1],[1.5,2]])assert.equal(b.restore({...saved,runs}),false);
 assert.deepEqual(before,b.explored);assert.equal(b.restore({...saved,mapKey:'forest'}),false);
});
test('occluder changes refresh visibility and preserve exploration',()=>{
 let closed=true;const f=make({radius:24,isOpaque:x=>closed&&x>=10&&x<11});f.update(p(5.5,12.5),0);assert.equal(f.stateAt(15,12),0);
 closed=false;f.rebuildOccluders();f.update(p(5.5,12.5),.01);assert.equal(f.stateAt(15,12),2);
 closed=true;f.rebuildOccluders();f.update(p(5.5,12.5),.02);assert.equal(f.stateAt(15,12),1);
});
test('complete bounds keep partially visible large assets even if their centres are hidden',()=>{
 const f=make({radius:5});f.update(p(4.5,4.5),0);
 assert.equal(f.stateAt(15,4.5),0);assert.equal(f.boundsVisible(p(7,3),p(23,6)),true);
 assert.equal(f.boundsVisible(p(17,3),p(23,6)),false);
});
test('all existing LODs share one conservative culling verdict',()=>{
 const f=make();f.update(p(4,4),0);
 for(const level of [0,1,2]){
  assert.equal(caveFogAllowsRecord(f,{min:p(3,3),max:p(8,8),level}),true);
  assert.equal(caveFogAllowsRecord(f,{bounds:{min:p(22,22),max:p(25,25)},level}),false);
 }
});
test('shadow retention, frustum activation and hardware occlusion cannot override fog',()=>{
 for(const cellActive of [true,false])for(const occluded of [true,false])for(const shadowCaster of [true,false])
   assert.equal(caveFogRootEnabled({fogVisible:false,cellActive,occluded,shadowCaster}),false);
 assert.equal(caveFogRootEnabled({fogVisible:true,cellActive:false,shadowCaster:true}),true);
 assert.equal(caveFogRootEnabled({fogVisible:true,cellActive:true,occluded:false}),true);
});
test('summed bounds queries match brute-force visible cells',()=>{
 const f=make({isOpaque:(x,z)=>Math.floor(x)===10&&z<18});f.update(p(7.5,9.5),0);
 for(let x=0;x<32;x+=2)for(let z=0;z<32;z+=2){let expected=false;
   for(let rz=z;rz<=Math.min(31,z+5);rz++)for(let cx=x;cx<=Math.min(31,x+5);cx++)expected ||= !!f.visible[rz*32+cx];
   assert.equal(f.boundsVisible(p(x,z),p(x+5,z+5),0),expected);
 }
});
test('out-of-map player does not retain old visibility or erase explored memory',()=>{
 const f=make();f.update(p(4,4),0);f.update(p(-100,200),.01);assert.equal(f.stats.visibleCells,0);assert.equal(f.stateAt(4,4),1);assert.equal(f.stateAt(-1,4),0);
});
test('fixed arrays and low-frequency field updates stay bounded during a long traversal',()=>{
 const f=new CaveFogOfWar({isOpaque:(x,z)=>Math.abs(x)<1&&Math.abs(z)>5});const arrays=[f.visible,f.explored,f.opaque,f.rgba,f.sums];
 for(let i=0;i<360;i++)f.update(p(Math.sin(i*.006)*30,Math.cos(i*.006)*30),i/30);
 [f.visible,f.explored,f.opaque,f.rgba,f.sums].forEach((array,i)=>assert.equal(array,arrays[i]));assert.ok(f.stats.arrayBytes<300000);assert.ok(f.stats.updates<150);
 assert.equal(f.stats.opaqueSamples,25600);assert.ok(f.stats.raySteps<200000);
});
test('navigation fallback is injectable; callers can distinguish water from opaque walls',()=>{
 const calls=[];const navigation={free(point,radius,limit){calls.push([point.x,point.z,radius,limit]);return point.x<10;}};
 const blocked=navigationSightBlocker(navigation,{limit:74});assert.equal(blocked(12,2),true);assert.deepEqual(calls[0],[12,2,0,74]);
 const f=make({navigation,isOpaque:(x,z)=>false});f.update(p(8,8),0);assert.equal(f.stateAt(12,8),2);
});
test('low-cost opaque cover is bounded and follows the injected terrain',()=>{
 const f=new CaveFogOfWar({isOpaque:()=>false});const cover=buildCaveFogCover(f,(x,z)=>x*.01+z*.02);
 assert.equal(cover.triangles,3200);assert.equal(cover.positions.length/3,1681);assert.deepEqual(cover.textureRect,[-80,-80,160,160]);
 assert.ok(Math.abs(cover.positions[1]-(-2.4+.035))<1e-5);
 assert.match(CAVE_FOG_COVER_FRAGMENT,/vec4\(caveFogMemoryColor\(fogWorldPosition,state.y\),1\.\)/);
 assert.match(CAVE_FOG_GLSL,/caveFogHidesInk/);
});
test('RGBA mask carries no stale current vision when memory remains',()=>{
 const f=make();f.update(p(3.5,3.5),0);const i=(3*32+3)*4;assert.deepEqual(Array.from(f.rgba.slice(i,i+4)),[255,255,0,255]);
 f.update(p(24.5,24.5),.01);assert.deepEqual(Array.from(f.rgba.slice(i,i+4)),[0,255,0,255]);
});
test('invalid budgets and invalid player inputs fail explicitly without allocating unbounded data',()=>{
 assert.throws(()=>make({cellSize:.01}),RangeError);assert.throws(()=>make({width:Infinity}),RangeError);
 const f=make();assert.throws(()=>f.update(p(NaN,2),0),TypeError);assert.equal(f.boundsVisible(p(0,0),p(1,1)),true);
 f.update(p(2,2),0);assert.equal(f.boundsVisible(p(NaN,2),p(3,3)),true);
});
