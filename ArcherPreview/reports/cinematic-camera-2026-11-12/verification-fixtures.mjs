import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {parseHTML} from 'linkedom';
import {NullEngine,Scene,ArcRotateCamera,Vector3} from '@babylonjs/core';
import {createWorld,replaceWorldMap} from '../../src/world.js';
import {caveFogFallback} from '../../src/cave-fog-binding.js';
import '@babylonjs/loaders/glTF/index.js';
import {readRuntimeGltf} from '../../tests/helpers/read-runtime-gltf.js';
import {readMapContainer} from '../../src/map-container.js';

export const appRoot=new URL('../../',import.meta.url);
export const near=(assert,actual,expected,epsilon=1e-7)=>assert.ok(Math.abs(actual-expected)<=epsilon,`${actual} != ${expected}`);
export const hash=path=>createHash('sha256').update(readFileSync(new URL(path,appRoot))).digest('hex');
export async function loadActualGeometry(model,scene){
 const source=new URL(model,new URL('public/assets/',appRoot)),decoded=await readRuntimeGltf(source),gltf=structuredClone(decoded.gltf);
 for(const key of ['extensionsUsed','extensionsRequired'])gltf[key]=(gltf[key]??[]).filter(value=>value!=='EXT_meshopt_compression');
 for(const buffer of gltf.buffers??[])if(buffer.uri)buffer.uri='data:application/octet-stream;base64,'+decoded.files.get(buffer.uri).data.toString('base64');
 const container=await readMapContainer(scene,gltf,'',{skipMaterials:true});return {container,modelSha256:createHash('sha256').update(readFileSync(source)).digest('hex')};
}
export function reportRecorder(test,after,name,paths,scope){
 const initial=Object.fromEntries(paths.map(path=>[path,hash(path)])),cases=[];
 after(()=>{const final=Object.fromEntries(paths.map(path=>[path,hash(path)]));mkdirSync(new URL('.',import.meta.url),{recursive:true});writeFileSync(new URL(name,import.meta.url),JSON.stringify({generatedAt:new Date().toISOString(),passed:cases.length>0&&cases.every(row=>row.passed)&&paths.every(path=>initial[path]===final[path]),sourceUnchanged:paths.every(path=>initial[path]===final[path]),sourceHashes:initial,finalSourceHashes:final,cases,scope,limits:'Node/LinkeDOM/Babylon NullEngine evidence. No browser automation, rendered-pixel comparison, physical touch, GPU, FPS, or device claim.'},null,2)+'\n');});
 return (name,run)=>test(name,async t=>{try{const details=await run(t);cases.push({name,passed:true,...details});}catch(error){cases.push({name,passed:false,error:error.stack});throw error;}});
}

export function worldFixture(t,{touch=true}={}){
 const engine=new NullEngine({renderWidth:1280,renderHeight:720});engine.getCaps().instancedArrays=true;engine.createCanvas=(width,height)=>({width,height,getContext:()=>({fillRect(){},strokeRect(){},fillText(){}})});
 const world=createWorld(engine,{village:true,touchDevice:touch});world.scene.defaultMaterial;world.scene.getOutlineRenderer();caveFogFallback(world.scene).getInternalTexture().isReady=true;
 const change=character=>{replaceWorldMap(world,character);for(const texture of world.scene.textures)if(texture.getInternalTexture())texture.getInternalTexture().isReady=true;};
 t.after(()=>{world.releaseEnvironment?.();world.scene.dispose();engine.dispose();});return {engine,world,scene:world.scene,change};
}

// The DOM-to-Babylon stream is real: canvas events go through the installed
// WebDeviceInputSystem and SceneInputManager. Only browser platform boundaries
// (layout rectangles, focus, capture, and PointerEvent constructor) are supplied.
export function nativeCameraFixture(t){
 const {document,window}=parseHTML('<html><body><main id="app"><canvas tabindex="0"></canvas><input></main></body></html>'),root=document.querySelector('main'),canvas=root.querySelector('canvas'),field=root.querySelector('input'),saved=new Map();
 const contains=root.contains.bind(root);root.contains=node=>node===root||contains(node);
 class Pointer extends window.Event{constructor(type,value={}){super(type,{bubbles:true,cancelable:true});Object.assign(this,{button:type==='pointermove'?-1:0,buttons:['pointerup','pointercancel'].includes(type)?0:1,pointerId:1,pointerType:'mouse',clientX:0,clientY:0,ctrlKey:false,shiftKey:false,altKey:false,metaKey:false,...value});}}
 for(const [name,value]of Object.entries({window,document,navigator:{userAgent:'Independent native camera fixture',platform:'Win32',maxTouchPoints:4},PointerEvent:Pointer,MouseEvent:Pointer,matchMedia:()=>({matches:false})})){saved.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{configurable:true,writable:true,value});}window.PointerEvent=Pointer;window.MouseEvent=Pointer;window.matchMedia=globalThis.matchMedia;
 let active=canvas;canvas.focus=()=>active=canvas;Object.defineProperty(document,'activeElement',{configurable:true,get:()=>active});const capture=new Set();canvas.setPointerCapture=id=>capture.add(id);canvas.hasPointerCapture=id=>capture.has(id);canvas.releasePointerCapture=id=>capture.delete(id);
 const rect={left:37,top:29,width:640,height:420,right:677,bottom:449};canvas.getBoundingClientRect=()=>rect;
 const engine=new NullEngine({renderWidth:1280,renderHeight:840});engine._renderingCanvas=canvas;engine.getInputElement=()=>canvas;engine.getInputElementClientRect=()=>rect;engine.getRenderingCanvasClientRect=()=>rect;engine.getHostWindow=()=>window;engine.getHardwareScalingLevel=()=>.5;let delta=1000/60;engine.getDeltaTime=()=>delta;
 const scene=new Scene(engine);scene.useRightHandedSystem=true;scene.skipPointerMovePicking=scene.skipPointerDownPicking=scene.skipPointerUpPicking=true;scene.detachControl();const camera=new ArcRotateCamera('independent-camera',-Math.PI/2,1.1,12,new Vector3(1,2,3),scene);camera.inputs.clear();scene.activeCamera=camera;
 const world={scene,camera,mapId:'village',sceneInputMode:'manual-game',toolGeneration:0},state={ready:true,loading:false,dead:false,hidden:false,settings:false,failed:false},input={suspended:false,setSuspended(value){this.suspended=value;}},audio={suspended:false,voices:new Set(),beds:{desired:{},request(){}},stopAll(){},setSuspended(value){this.suspended=value;}};
 const capabilities={world,root,canvas,input,audio,getState:()=>state,setReady:value=>state.ready=value,resetInput(){},reconcile(){}};
 const render=()=>{camera.update();camera.getViewMatrix();camera.getProjectionMatrix();scene.render(false);},pointer=(type,x,y,extra={})=>{const event=new Pointer(type,{clientX:x+rect.left,clientY:y+rect.top,offsetX:x,offsetY:y,...extra});canvas.dispatchEvent(event);return event;},key=(type,code)=>{const event=new window.Event(type,{cancelable:true});event.code=code;window.dispatchEvent(event);return event;};
 let closed=false;const dispose=()=>{if(closed)return;closed=true;try{world.toolLease?.release();scene.dispose();engine.dispose();}finally{for(const [name,value]of saved)if(value)Object.defineProperty(globalThis,name,value);else delete globalThis[name];}};t.after(dispose);
 return {document,window,root,canvas,field,engine,scene,camera,world,state,input,audio,capabilities,render,pointer,key,setFocus(value){active=value;},setDelta(value){delta=value;},dispose};
}
