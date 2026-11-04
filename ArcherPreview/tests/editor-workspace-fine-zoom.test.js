import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createEditorWorkspace} from '../src/editor-workspace.js';

test('editor Ctrl-click zoom buttons use fine steps, retain normal steps and stop responding after disposal',t=>{
 const {document,window}=parseHTML('<main><canvas></canvas><details open></details></main>'),root=document.querySelector('main'),canvas=root.querySelector('canvas'),panel=root.querySelector('details');
 let focuses=0,editing=true;canvas.focus=()=>focuses++;root.getBoundingClientRect=()=>({left:0,top:0,width:1000,height:700});
 const camera={radius:10,lowerRadiusLimit:2,upperRadiusLimit:20,inertialRadiusOffset:0,getProjectionMatrix(){}},engine={getRenderingCanvas:()=>canvas,resize(){}},world={camera,scene:{getEngine:()=>engine}};
 const workspace=createEditorWorkspace({root,panel,world,isEditing:()=>editing});t.after(()=>workspace.dispose());
 const button=root.querySelector('[data-view="zoom-in"]'),press=(mode,ctrlKey=false)=>{const event=new window.Event('click',{bubbles:true});Object.defineProperty(event,'ctrlKey',{value:ctrlKey});root.querySelector(`[data-view="${mode}"]`).dispatchEvent(event);};
 press('zoom-in');assert.equal(camera.radius,8);press('zoom-out');assert.equal(camera.radius,10);
 camera.inertialRadiusOffset=1;press('zoom-in',true);assert.ok(camera.radius>9.8&&camera.radius<10,'Ctrl-click zooms by a small fraction rather than20%');assert.equal(camera.inertialRadiusOffset,0);const inward=camera.radius;press('zoom-out',true);assert.ok(camera.radius>inward&&camera.radius<10.02);
 camera.radius=2;press('zoom-in',true);assert.equal(camera.radius,2);camera.radius=20;press('zoom-out',true);assert.equal(camera.radius,20);
 editing=false;press('zoom-in',true);assert.equal(camera.radius,20);assert.equal(focuses,6);assert.match(root.textContent,/Ctrl \+ 휠: 미세 확대·축소/);
 workspace.dispose();editing=true;button.dispatchEvent(new window.Event('click',{bubbles:true}));assert.equal(camera.radius,20);
});
