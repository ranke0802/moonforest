import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {NullEngine,Scene,FreeCamera,Vector3,MeshBuilder,PBRMaterial} from '@babylonjs/core';
import {renderPixelRatio,RenderActivity} from '../src/render-policy.js';
import {readRenderScale,setupRenderScaleControl,renderResolutionSnapshot,RENDER_SCALE_KEY} from '../src/render-scale-settings.js';
import {setupSettingsPanel} from '../src/settings-panel.js';
import {ScreenProjection} from '../src/screen-projection.js';
import {attachCharacterOutlines} from '../src/character-outlines.js';
import {AuthoredCharacterInk,characterStyleFor} from '../src/character-style.js';
import {createFrameDiagnostics} from '../src/frame-diagnostics.js';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8').replaceAll('\r\n','\n');
const storage=()=>{const values=new Map();return {values,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};};

test('explicit 3D percentages multiply each existing quality cap, including below one CSS pixel, without changing FPS',()=>{
 for(const touch of [true,false])for(const [quality,cap] of Object.entries(touch?{high:2,balanced:1.5,battery:1}:{high:3,balanced:2,battery:1}))for(const percent of [75,85,100]){
  assert.equal(renderPixelRatio(4,quality,touch,percent),cap*percent/100);
  assert.equal(renderPixelRatio(1,quality,touch,percent),percent/100);
  const activity=new RenderActivity(touch);assert.equal(activity.limit({quality}),30);activity.setTargetFps(60);assert.equal(activity.limit({quality}),60);
 }
 assert.equal(renderPixelRatio(3,'battery',true,75),.75);
 assert.equal(renderPixelRatio(NaN,'unknown',true,85),.85);
 for(const value of [0,50,150,NaN,'broken'])assert.equal(renderPixelRatio(3,'high',true,value),2);
});

test('device defaults, saved percentages, malformed storage and denied writes survive control recreation',()=>{
 for(const touch of [true,false]){
  const saved=storage(),select=Object.assign(new EventTarget(),{value:''});let applied;
  let control=setupRenderScaleControl({select,storage:saved,touchDevice:touch,onChange:value=>applied=value});
  assert.equal(control.value,touch?85:100);assert.equal(applied,control.value);
  for(const percent of [75,100,85]){select.value=String(percent);select.dispatchEvent(new Event('change'));assert.equal(applied,percent);assert.equal(saved.values.get(RENDER_SCALE_KEY),String(percent));}
  control.dispose();select.value='75';select.dispatchEvent(new Event('change'));assert.equal(applied,85);
  control=setupRenderScaleControl({select,storage:saved,touchDevice:touch});assert.equal(control.value,85);control.dispose();
  for(const value of [null,'','0','90','NaN','{"percent":75}'])assert.equal(readRenderScale({getItem:()=>value},touch),touch?85:100);
 }
 const denied={getItem(){throw Error('denied');},setItem(){throw Error('denied');}},select=Object.assign(new EventTarget(),{value:''});
 const control=setupRenderScaleControl({select,storage:denied,touchDevice:true});assert.equal(control.value,85);select.value='75';select.dispatchEvent(new Event('change'));assert.equal(control.value,75);control.dispose();
});

test('new control lives beside the actual quality and 30/60 controls and never replaces existing HUD nodes',t=>{
 const {document}=parseHTML(html),previous=globalThis.document;globalThis.document=document;t.after(()=>globalThis.document=previous);setupSettingsPanel();
 const quality=document.getElementById('quality-select'),fps=document.getElementById('frame-rate-select'),canvas=document.getElementById('viewport'),hud=document.getElementById('attack-button');
 const canvasStyle=canvas.getAttribute('style'),host=document.querySelector('.settings-display-options');
 // linkedom lacks a select.value setter; preserve its real DOM/event behavior.
 const prototype=Object.getPrototypeOf(fps);Object.defineProperty(prototype,'value',{configurable:true,get(){return this._value??this.options[0]?.value;},set(value){this._value=value;}});
 const control=setupRenderScaleControl({host,storage:storage(),touchDevice:true});t.after(()=>control.dispose());
 assert.deepEqual([...control.select.options].map(option=>option.value),['75','85','100']);assert.equal(control.select.value,'85');assert.equal(control.select.closest('.settings-display-options'),host);
 assert.match(document.getElementById('render-scale-help').textContent,/글자와 버튼 크기는 같습니다/);assert.equal(control.select.getAttribute('aria-describedby'),'render-scale-help');
 control.select.value='75';control.select.dispatchEvent(new document.defaultView.Event('change'));assert.equal(control.value,75);
 for(const [id,node] of [['quality-select',quality],['frame-rate-select',fps],['viewport',canvas],['attack-button',hud]])assert.equal(document.getElementById(id),node);
 assert.deepEqual([...fps.options].map(option=>option.value),['30','60']);assert.equal(canvas.getAttribute('style'),canvasStyle);
});

test('actual main resize path applies selected scale only when dimensions or ratio change and preserves FPS across map reapplication',()=>{
 const start=main.indexOf('function applyRenderQuality()'),end=main.indexOf('\nfunction toast(',start),applySource=main.slice(start,end);
 const canvas={clientWidth:800,clientHeight:400},activity=new RenderActivity(true);activity.setTargetFps(60);
 let level=1,resizes=0,projections=0,lighting=0,wakes=0;
 const env={engine:{getHardwareScalingLevel:()=>level,setHardwareScalingLevel(value){level=value;resizes++;},resize(){resizes++;},maxFPS:30},canvas,window:{devicePixelRatio:3},qualityMode:'high',touchDevice:true,renderScaleControl:{value:85},renderViewportKey:'',renderPixelRatio,resizeScreenProjection(){projections++;},renderActivity:activity,world:{lighting:{setQuality(){lighting++;}}},$:()=>({value:''}),document:{hidden:false},frameLoop:{invalidate(){wakes++;}}};
 const apply=Function('env','with(env){'+applySource+';return applyRenderQuality;}')(env);
 apply();assert.equal(level,1/1.7);assert.equal(resizes,1);assert.equal(env.engine.maxFPS,60);
 for(let map=0;map<12;map++)apply();assert.equal(resizes,1);assert.equal(env.engine.maxFPS,60);assert.equal(lighting,13);
 env.renderScaleControl.value=75;apply();assert.equal(level,1/1.5);assert.equal(resizes,2);
 canvas.clientWidth=400;canvas.clientHeight=800;apply();assert.equal(resizes,3);apply();assert.equal(resizes,3);
 env.qualityMode='battery';apply();assert.equal(level,1/.75);assert.equal(resizes,4);assert.equal(env.engine.maxFPS,60);assert.equal(projections,17);assert.equal(wakes,17);
 assert.match(main,/setupRenderScaleControl\(\{host:\$\('\.settings-display-options'\),storage:equipmentStorage,touchDevice,onChange:\(\)=>applyRenderQuality\(\)\}\)/);
 assert.match(main,/const mapWorkDiagnostics=\(\)=>\(\{\n\s*renderResolution:renderResolution\(\)/);
 assert.match(main,/metadata:\(\)=>\(\{\.\.\.mapWorkDiagnostics\(\)/);assert.match(main,/context:\(\)=>\(\{\.\.\.mapWorkDiagnostics\(\)/);
});

test('HUD projection and both pixel-outline paths retain CSS coordinates at every selected backing resolution',t=>{
 const canvas={clientWidth:800,clientHeight:400};let expected;
 for(const quality of ['high','battery'])for(const percent of [75,85,100]){
  const ratio=renderPixelRatio(3,quality,true,percent),engine=new NullEngine({renderWidth:canvas.clientWidth*ratio,renderHeight:canvas.clientHeight*ratio}),scene=new Scene(engine);
  t.after(()=>{scene.dispose();engine.dispose();});engine.getRenderingCanvas=()=>canvas;
  const camera=new FreeCamera('camera',new Vector3(0,2,-6),scene);camera.setTarget(new Vector3(0,1,0));scene.render();
  const projection=new ScreenProjection(scene);projection.resize(canvas.clientWidth,canvas.clientHeight);projection.beginFrame();const point={...projection.project(new Vector3(1,1.4,0))};
  expected??=point;assert.ok(Math.abs(point.x-expected.x)<1e-5);assert.ok(Math.abs(point.y-expected.y)<1e-5);
  const body=MeshBuilder.CreateSphere('elena',{},scene),asset={meshes:[body]},shell=attachCharacterOutlines(asset,'elena')[0],values={};
  shell.material.getEffect=()=>({isReady:()=>true,setTexture(){},setFloat:(name,value)=>values[name]=value,setFloat2:(name,x,y)=>values[name]=[x,y]});shell.material.onBindObservable.notifyObservers(shell);
  assert.deepEqual(values.outlineViewport,[800,400]);
  const displayPixels=values.outlinePixels*2/values.outlineViewport[0]*engine.getRenderWidth()/2*canvas.clientWidth/engine.getRenderWidth();assert.equal(displayPixels,values.outlinePixels);
  const authored=MeshBuilder.CreateBox('authored-player',{},scene);authored.metadata={characterStyleGroup:'player'};authored.material=new PBRMaterial('paint',scene);
  const plugin=new AuthoredCharacterInk(authored.material),uniforms={};plugin.hardBindForSubMesh({updateFloat4:(name,...value)=>uniforms[name]=value},scene,engine,authored.subMeshes[0]);
  assert.deepEqual(uniforms.characterInk.slice(2),[800,400]);assert.equal(Math.abs(uniforms.characterInk[0]),characterStyleFor(authored).outlineWidth);
 }
});

test('existing diagnostic JSON contains selected percent and effective integer pixel count',async t=>{
 const {document:doc}=parseHTML(html),engine=new NullEngine({renderWidth:674,renderHeight:331}),canvas={clientWidth:393,clientHeight:193};t.after(()=>engine.dispose());
 const renderResolution=()=>renderResolutionSnapshot({engine,canvas,deviceRatio:3,quality:'high',touchDevice:true,percent:85});let copied;
 const diagnostics=createFrameDiagnostics({doc,storage:{getItem:()=> '1'},metadata:()=>({renderResolution:renderResolution()}),clipboard:{writeText:async value=>copied=JSON.parse(value)}});
 doc.getElementById('copy-frame-diagnostics').dispatchEvent(new doc.defaultView.Event('click'));await Promise.resolve();
 assert.equal(copied.renderResolution.selectedPercent,85);assert.equal(copied.renderResolution.basePixelRatio,2);assert.equal(copied.renderResolution.requestedPixelRatio,1.7);assert.deepEqual(copied.renderResolution.renderSize,[674,331]);assert.equal(copied.renderResolution.pixels,674*331);assert.deepEqual(copied.renderResolution.effectivePixelRatio,[674/393,331/193]);
});
