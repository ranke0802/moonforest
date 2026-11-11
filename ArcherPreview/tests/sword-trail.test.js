import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {NullEngine,Scene,TransformNode,VertexBuffer} from '@babylonjs/core';
import {createSwordTrail,setupSwordTrailSettings,SWORD_TRAIL_KEY,SWORD_TRAIL_COLORS} from '../src/sword-trail.js';

test('sword ribbon participates in cave visibility masking and switches away from a retired cave mask',()=>{
 const engine=new NullEngine(),scene=new Scene(engine),trail=createSwordTrail(scene,{prepare:false});
 const material=trail.mesh.material;assert.ok(material.options.samplers.includes('caveFogMap'));
 assert.ok(material.options.uniforms.includes('caveFogActive'));
 assert.match(material.shaderPath.fragmentSource,/caveFogHidesInk\(trailWorldPosition\)/);
 let binds=0;scene.metadata={caveFogRuntime:{disposed:false,bind(){binds++;}}};material.onBindObservable.notifyObservers(trail.mesh);assert.equal(binds,1);
 scene.metadata.caveFogRuntime.disposed=true;material.onBindObservable.notifyObservers(trail.mesh);assert.equal(material._floats.caveFogActive,0);
 trail.dispose();scene.dispose();engine.dispose();
});
import {PlayerStrikeSampler} from '../src/player-strikes.js';

const contact={previous:[[0,1,0],[0,0,0]],blade:[[1,1,0],[1,0,0]],window:{id:'cut'}};
test('bounded sword trail follows strike samples, fades, excludes shield and releases its resources',()=>{
 const engine=new NullEngine(),scene=new Scene(engine),trail=createSwordTrail(scene,{prepare:false});
 const sample={contacts:[contact]},before=JSON.stringify(sample);
 trail.update(sample,'slash',1,'original');assert.equal(trail.inspect().visible,true);assert.equal(trail.inspect().activeSegments,1);assert.equal(JSON.stringify(sample),before);
 const colors=trail.mesh.getVerticesData(VertexBuffer.ColorKind);assert.deepEqual(Array.from(colors.slice(0,3)).map(n=>Number(n.toFixed(2))),SWORD_TRAIL_COLORS.original);
 trail.update(sample,'shieldPush',1.05,'original');assert.equal(trail.inspect().activeSegments,1);
 trail.update(null,'idle',1.20,'original');assert.equal(trail.inspect().visible,false);assert.equal(trail.inspect().activeSegments,0);
 for(let i=0;i<30;i++)trail.update(sample,'attack',2+i*.001,'teal-bronze');assert.equal(trail.inspect().activeSegments,12);
 trail.setEnabled(false);assert.equal(trail.inspect().visible,false);trail.update(sample,'slash',2.1);assert.equal(trail.inspect().activeSegments,0);
 trail.setEnabled(true);trail.update(sample,'judgment',3,'violet-silver');assert.equal(trail.inspect().activeSegments,1);trail.clear();assert.equal(trail.inspect().visible,false);
 trail.dispose();assert.equal(scene.meshes.some(mesh=>mesh.name==='player-sword-trail'),false);scene.dispose();engine.dispose();
});

test('trail option defaults on, persists off/on and survives unavailable storage',()=>{
 const {document,window}=parseHTML('<html><body><div id="settings"></div></body></html>'),host=document.querySelector('#settings'),values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)},seen=[];
 const control=setupSwordTrailSettings({host,storage,onChange:v=>seen.push(v)}),input=host.querySelector('#sword-trail-toggle');assert.equal(control.enabled,true);
 input.checked=false;input.dispatchEvent(new window.Event('change'));assert.equal(values.get(SWORD_TRAIL_KEY),'0');assert.deepEqual(seen,[false]);control.dispose();
 const other=setupSwordTrailSettings({host,storage});assert.equal(other.enabled,false);other.dispose();
 const blocked=setupSwordTrailSettings({host,storage:{getItem(){throw Error();},setItem(){throw Error();}}});assert.equal(blocked.enabled,true);blocked.dispose();
});

test('disabled trail never compiles and enabling waits for asynchronous preparation',async()=>{
 const engine=new NullEngine(),scene=new Scene(engine);let calls=0,finish;
 const trail=createSwordTrail(scene,{enabled:false,compile:()=>{calls++;return new Promise(resolve=>{finish=resolve;});}});
 await Promise.resolve();assert.equal(calls,0);trail.setEnabled(true);await Promise.resolve();assert.equal(calls,1);
 trail.update({contacts:[contact]},'slash',1);assert.equal(trail.inspect().visible,false);
 finish();for(let i=0;i<5;i++)await Promise.resolve();trail.update({contacts:[contact]},'slash',1.1);assert.equal(trail.inspect().visible,true);
 trail.setEnabled(false);assert.equal(trail.inspect().visible,false);trail.dispose();scene.dispose();engine.dispose();
});

test('real player strike sampler feeds the trail only inside an attack window',()=>{
 const engine=new NullEngine(),scene=new Scene(engine),sword=new TransformNode('sword',scene),sampler=new PlayerStrikeSampler(),trail=createSwordTrail(scene,{prepare:false});
 const result={actionId:1,state:'slash',clipTime:.3};let sample=sampler.sample(result,sword,null);trail.update(sample,result.state,0);assert.equal(trail.inspect().visible,false);
 sword.position.x=.5;result.clipTime=.45;sample=sampler.sample(result,sword,null);const before=JSON.stringify(sample);trail.update(sample,result.state,.05);assert.equal(trail.inspect().visible,true);assert.equal(JSON.stringify(sample),before);
 result.clipTime=.9;sword.position.x=1;sample=sampler.sample(result,sword,null);trail.update(sample,result.state,.1);trail.update(null,'idle',.3);assert.equal(trail.inspect().visible,false);
 trail.dispose();scene.dispose();engine.dispose();
});
