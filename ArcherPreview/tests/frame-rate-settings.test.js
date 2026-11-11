import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {NullEngine} from '@babylonjs/core';
import {RenderActivity,renderPixelRatio} from '../src/render-policy.js';
import {readFrameRate,setupFrameRateControl,FRAME_RATE_KEY} from '../src/frame-rate-settings.js';
import {setupSettingsPanel} from '../src/settings-panel.js';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
test('actual settings expose 30/60 with default 60; explicit choices persist without resizing assets',t=>{
 const {document}=parseHTML(html),previous=globalThis.document;globalThis.document=document;t.after(()=>globalThis.document=previous);setupSettingsPanel();
 const select=document.getElementById('frame-rate-select');assert.ok(select.closest('.settings-display-options'));assert.deepEqual([...select.options].map(o=>o.value),['30','60']);
 // linkedom has no select value setter; use its real event surface with a form-value shim.
 Object.defineProperty(select,'value',{configurable:true,writable:true,value:'30'});
 const stored=new Map(),storage={getItem:k=>stored.get(k),setItem:(k,v)=>stored.set(k,v)},engine=new NullEngine();t.after(()=>engine.dispose());
 const activity=new RenderActivity(true),ratio=renderPixelRatio(3,'high',true);let changes=0;
 const control=setupFrameRateControl({select,storage,activity,onChange:fps=>{engine.maxFPS=fps;changes++;}});
 assert.equal(engine.maxFPS,60);select.value='30';select.dispatchEvent(new document.defaultView.Event('change'));assert.equal(engine.maxFPS,30);assert.equal(stored.get(FRAME_RATE_KEY),'30');select.value='60';select.dispatchEvent(new document.defaultView.Event('change'));assert.equal(engine.maxFPS,60);assert.equal(stored.get(FRAME_RATE_KEY),'60');
 const sources=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');assert.match(sources,/setupFrameRateControl\(\{select:[\s\S]*?onChange:fps=>\{if\(engine\)engine.maxFPS=fps;\}/);
 for(let map=0;map<12;map++){engine.maxFPS=activity.limit({quality:'high',busy:true});assert.equal(engine.maxFPS,60);assert.equal(renderPixelRatio(3,'high',true),ratio);}
 control.dispose();const count=changes;select.dispatchEvent(new document.defaultView.Event('change'));assert.equal(changes,count);
 const reconnected=new RenderActivity(true),next=setupFrameRateControl({select,storage,activity:reconnected});assert.equal(reconnected.limit(),60);assert.equal(select.value,'60');
 select.value='30';select.dispatchEvent(new document.defaultView.Event('change'));assert.equal(readFrameRate(storage),30);next.dispose();
});
test('unavailable or malformed storage safely defaults to 60 and a denied write preserves session 30',()=>{
 for(const value of [null,'undefined','120','0','NaN','{"fps":60}'])assert.equal(readFrameRate({getItem:()=>value}),60);
 const storage={getItem(){throw Error('denied');},setItem(){throw Error('denied');}},select=Object.assign(new EventTarget(),{value:''}),activity=new RenderActivity(true);
 const control=setupFrameRateControl({select,storage,activity});assert.equal(activity.limit(),60);select.value='30';select.dispatchEvent(new Event('change'));assert.equal(activity.limit(),30);control.dispose();
});
test('actual Babylon limiter accepts selected 30/60 on 60, 90 and 120 Hz schedules without changing simulation duration',t=>{
 const engine=new NullEngine();t.after(()=>engine.dispose());
 for(const hz of [60,90,120])for(const target of [30,60]){
  const activity=new RenderActivity(true);activity.setTargetFps(target);engine.maxFPS=activity.limit();engine._lastFrameTime=1000;engine._renderAccumulator=0;
  let frames=0,last=1000,simulated=0;
  for(let i=1;i<=hz*5;i++){const now=1000+i*1000/hz;if(!engine._isOverFrameTime(now)){frames++;simulated+=(now-last)/1000;last=now;}}
  assert.ok(Math.abs(frames-target*5)<=1,`${hz}Hz target ${target}: ${frames}`);assert.ok(Math.abs(simulated-5)<=1/target+.001);
 }
});
