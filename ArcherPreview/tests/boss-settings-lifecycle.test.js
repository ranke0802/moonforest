import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FrameLoop} from '../src/frame-loop.js';
import {createMapTransition} from '../src/map-transition.js';
import {ElenaBrain} from '../src/elena-spec.js';

// Exercise the application callbacks themselves with injected DOM/engine
// boundaries. main.js initializes WebGL at import time, so importing it directly
// cannot run in a Node test. No browser or duplicated pause implementation.
const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8').replaceAll('\r\n','\n');
const syncStart=main.indexOf('const syncPlayback='),syncEnd=main.indexOf('\n  const dialogObserver',syncStart);
const syncSource=main.slice(syncStart+'const syncPlayback='.length,syncEnd).trim().replace(/;$/,'');
const transitionStart=main.indexOf('mapTransition=createMapTransition('),finishStart=main.indexOf('finish:async()=>{',transitionStart),finishEnd=main.indexOf('\n    onError:',finishStart);
const finishSource=main.slice(finishStart+'finish:'.length,finishEnd).trim().replace(/,$/,'');
function compile(source,environment){assert.ok(source.length>20);return Function(...Object.keys(environment),'let ready=false,loadingAsset=true;return ('+source+');')(...Object.values(environment));}

function fixture(){
  let wall=0;const callbacks=new Set(),nodes=Object.fromEntries(['motion-speed-dialog','help-dialog','summon-dialog','boss-pattern-dialog','character-style-dialog','death-dialog'].map(id=>[id,{open:false}]));
  const brain=new ElenaBrain({cast:3,walk:2.4,idle:6},{mourning:true});brain.cast();
  const frameLoop=new FrameLoop({runRenderLoop:cb=>callbacks.add(cb),stopRenderLoop:cb=>callbacks.delete(cb)},dt=>{if(dt>0)brain.update(dt,4,true,{manual:true});},()=>wall);
  const audio={suspended:false,resumes:0,setSuspended(v){if(this.suspended&&!v)this.resumes++;this.suspended=v;},setEnvironment(){},play(){}};
  const document={hidden:false},transition={busy:false};
  const env={assertFrameHealthy(){},audio,document,frameLoop,mapDeparture:{departing:false},mapTransition:transition,motionSpeedControls:{isOpen:()=>nodes['motion-speed-dialog'].open},deathScreen:{isOpen:()=>nodes['death-dialog'].open},$:selector=>nodes[selector.slice(1)],input:{reset(){}},cancelAttackInput(){},text(){},frameDiagnostics:{suspend(){}},character:'warrior-v5',updateButtons(){},requestAnimationFrame:callback=>callback(),applyRenderQuality(){},loadingView:{reveal(){}},world:{villageStreaming:{}},loadDiagnostics:{finish(){}},canvas:{focus(){}}};
  const sync=compile(syncSource,env),finish=compile(finishSource,env);
  return {brain,frameLoop,audio,document,nodes,transition,sync,finish,tick:ms=>{wall+=ms;for(const cb of [...callbacks])cb();}};
}

test('nested settings/pattern/style dialogs pause actual cast time until the final modal closes, with no resume time jump',()=>{
 for(const modal of ['boss-pattern-dialog','character-style-dialog']){
  const f=fixture();f.sync();f.tick(0);f.tick(100);const before=f.brain.castWarningElapsed;
  f.nodes['motion-speed-dialog'].open=true;f.sync();f.nodes[modal].open=true;f.sync();f.tick(10000);assert.equal(f.brain.castWarningElapsed,before);assert.equal(f.audio.suspended,true);
  f.nodes[modal].open=false;f.sync();f.tick(10000);assert.equal(f.brain.castWarningElapsed,before);assert.equal(f.frameLoop.running,false);assert.equal(f.audio.suspended,true);
  f.nodes['motion-speed-dialog'].open=false;f.sync();assert.equal(f.frameLoop.running,true);assert.equal(f.audio.suspended,false);f.tick(10000);assert.equal(f.brain.castWarningElapsed,before,'first resumed frame has dt=0');f.tick(100);assert.ok(f.brain.castWarningElapsed>before);assert.equal(f.audio.resumes,1);
 }
});

test('map completion reconciles audio and rendering after a modal closes or visibility changes during loading',async()=>{
  for(const modal of ['motion-speed-dialog','character-style-dialog'])for(const hidden of [false,true])for(const remainsOpen of [false,true]){
    const f=fixture();f.nodes[modal].open=true;f.sync();assert.equal(f.audio.suspended,true);
    const travel=createMapTransition({prepare:()=>{f.transition.busy=true;f.frameLoop.setPaused(true);},frame:async()=>{},release:async()=>{},load:async()=>{
      f.nodes[modal].open=remainsOpen;f.document.hidden=hidden;f.sync();assert.equal(f.audio.suspended,true,'busy transition defers event-driven synchronization');
    },finish:f.finish});
    assert.equal(await travel.travel('cave'),true);f.transition.busy=false;
    assert.equal(f.frameLoop.running,!hidden&&!remainsOpen);assert.equal(f.audio.suspended,hidden||remainsOpen,`hidden=${hidden}, modal=${remainsOpen}`);
  }
});
