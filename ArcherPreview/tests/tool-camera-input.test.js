import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {NullEngine,Scene,ArcRotateCamera,Vector3} from '@babylonjs/core';
import {createToolCameraInput} from '../src/tool-camera-input.js';
test('camera controls move the actual view from focused canvas while typing/detached controls do nothing',t=>{
 const {document,window}=parseHTML('<canvas tabindex="0"></canvas><input>'),canvas=document.querySelector('canvas'),field=document.querySelector('input'),engine=new NullEngine(),scene=new Scene(engine),camera=new ArcRotateCamera('tool',Math.PI/2,1.1,12,Vector3.Zero(),scene);t.after(()=>engine.dispose());engine.getDeltaTime=()=>1000/30;
 let active=canvas;Object.defineProperty(document,'activeElement',{get:()=>active});const input=createToolCameraInput(canvas);input.camera=camera;input.attachControl();camera.getViewMatrix(true);const start=camera.position.clone(),target=camera.getTarget().clone(),angles=[camera.alpha,camera.beta,camera.radius];
 const key=code=>{const event=new window.Event('keydown',{cancelable:true});event.code=code;window.dispatchEvent(event);};key('KeyW');input.checkInputs();camera.getViewMatrix(true);assert.ok(Vector3.Distance(camera.position,start)>.1);assert.ok(Vector3.Distance(camera.getTarget(),target)>.1);assert.deepEqual([camera.alpha,camera.beta,camera.radius],angles,'panning preserves orbit angles/radius');
 active=field;const p=camera.getTarget().clone();input.checkInputs();key('KeyW');input.checkInputs();assert.ok(camera.getTarget().equals(p));active=canvas;input.checkInputs();assert.ok(camera.getTarget().equals(p));key('KeyE');input.checkInputs();assert.ok(camera.getTarget().y>p.y);input.detachControl();const ended=camera.getTarget().clone();key('KeyW');input.checkInputs();assert.ok(camera.getTarget().equals(ended));
});
