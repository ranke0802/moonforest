import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NullEngine,Scene,FreeCamera,Vector3} from '@babylonjs/core';
import {parseHTML} from 'linkedom';
import {EffectBudget,EFFECT_PROFILES} from '../src/effect-budget.js';
import {createEffectWorld} from '../src/effect-world.js';
import {setupEffectReviewSettings} from '../src/effect-review-settings.js';

test('optional effect presets bound live bursts, particles and lifetime',()=>{
 for(const mode of Object.keys(EFFECT_PROFILES)){
  const budget=new EffectBudget(mode),profile=EFFECT_PROFILES[mode];
  for(let i=0;i<100;i++)budget.acquire(0,{coverage:.05,duration:1});
  const current=budget.inspect();assert.equal(current.activeBursts,profile.bursts);assert.ok(current.activeSlots<=profile.particles);assert.equal(current.rejected,100-profile.bursts);
  budget.releaseExpired(.9);assert.equal(budget.inspect().activeBursts,profile.bursts);
  budget.releaseExpired(1);assert.equal(budget.inspect().activeSlots,0);assert.ok(budget.acquire(1));budget.clear();assert.equal(budget.inspect().activeBursts,0);
 }
});

test('coverage pressure reduces decoration while retaining each admitted impact core',()=>{
 const budget=new EffectBudget('rich'),first=budget.acquire(0,{coverage:10}),second=budget.acquire(0,{coverage:10});
 assert.ok(first.decorations<64);assert.equal(second.decorations,0);assert.equal(second.slots,4);assert.ok(budget.inspect().decorationReductions>0);
 budget.setMode('invalid');assert.equal(budget.mode,'rich');budget.setMode('compact');assert.equal(budget.mode,'compact');
});

function fixture(t,prepare=async()=>{}){
 const engine=new NullEngine(),scene=new Scene(engine);scene.activeCamera=new FreeCamera('test-camera',new Vector3(0,3,-8),scene);
 const world=createEffectWorld(scene,{prepare});t.after(()=>{world.dispose();scene.dispose();engine.dispose();});return {engine,scene,world};
}

test('preview is lazy warmed, single-flight and one mesh with no extra lights or targets',async t=>{
 let complete,calls=0;const f=fixture(t,()=>{calls++;return new Promise(resolve=>{complete=resolve;});});
 assert.equal(f.world.burst(new Vector3()),false);assert.equal(f.world.mesh.isEnabled(),false);
 const a=f.world.warm(),b=f.world.warm();assert.equal(a,b);await Promise.resolve();assert.equal(calls,1);complete();assert.equal(await a,true);
 assert.equal(await f.world.warm(),true);assert.equal(calls,1);assert.equal(f.scene.meshes.length,1);assert.equal(f.scene.lights.length,0);assert.equal(f.scene.customRenderTargets.length,0);
 assert.equal(f.world.mesh.getTotalIndices()/3,1536);assert.ok(f.world.burst(new Vector3(0,0,1)));assert.equal(f.world.inspect().active,true);
});

test('live animation updates only time; retirement and map clear release cosmetic slots',async t=>{
 const {world}=fixture(t);await world.warm();world.setMode('rich');assert.ok(world.burst(new Vector3(0,0,2),{coverage:.05}));
 const uploads=world.inspect().uploads;for(let i=0;i<6;i++)world.update(1/60);
 assert.equal(world.inspect().uploads,uploads);assert.equal(world.inspect().active,true);
 for(let i=0;i<80;i++)world.update(1/60);assert.equal(world.inspect().active,false);assert.equal(world.inspect().activeSlots,0);
 assert.ok(world.burst(new Vector3()));world.clear();assert.equal(world.inspect().active,false);assert.equal(world.inspect().activeSlots,0);assert.equal(world.burst({x:NaN,y:0,z:0}),false);
});

test('late warming cannot re-enable a disposed effect world; a failed warm can be retried manually',async t=>{
 let complete;const {world}=fixture(t,()=>new Promise(resolve=>{complete=resolve;}));const pending=world.warm();await Promise.resolve();world.dispose();complete();assert.equal(await pending,false);assert.equal(world.burst(new Vector3()),false);
 let attempts=0;const second=fixture(t,async()=>{if(++attempts===1)throw Error('compile failure');});await assert.rejects(second.world.warm(),/compile failure/);assert.equal(second.world.inspect().ready,false);assert.equal(await second.world.warm(),true);
});

test('settings preview is explicit, single-flight and removed on dispose',async()=>{
 const {document,Event}=parseHTML('<div id="host"></div>'),host=document.querySelector('#host');let calls=0,done;
 const control=setupEffectReviewSettings({host,release:'moonforest-0.2',onPreview:()=>{calls++;return new Promise(resolve=>{done=resolve;});}}),button=host.querySelector('button');
 assert.equal(calls,0);button.dispatchEvent(new Event('click'));button.dispatchEvent(new Event('click'));assert.equal(calls,1);assert.equal(button.disabled,true);done();await Promise.resolve();await Promise.resolve();assert.equal(button.disabled,false);
 control.dispose();assert.equal(host.children.length,0);const legacy=setupEffectReviewSettings({host,release:'moonforest-0.1'});assert.equal(host.children.length,0);legacy.dispose();
});

test('game integration clears preview on map/player reload and exposes manual original recovery',()=>{
 const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 assert.match(main,/await import\('\.\/effect-world.js'\)/);assert.match(main,/world\.effectWorld\?\.clear\(\);setFrameWorkContext/);
 assert.match(main,/originalTextureRetry\.hidden=!playerTextureSettings\.noteFailure/);assert.match(main,/playerTextureSettings\.restoreOriginal\(\);void retryLoading\(\)/);
 assert.match(main,/desktopPreference:playerTextureSettings\.value/);assert.match(main,/preparationBudget:world\?\.scene\?frameWorkSnapshot/);
});
