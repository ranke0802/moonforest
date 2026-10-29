import test from 'node:test';
import assert from 'node:assert/strict';
import {NullEngine,Scene,ArcRotateCamera,Vector3} from '@babylonjs/core';
import {CameraZoom,setupCameraZoomControls} from '../src/camera-zoom.js';
import {PlaygroundInput} from '../src/input.js';
import {createWorld,replaceWorldMap} from '../src/world.js';
import {carryPortalPose} from '../src/map-transition.js';

const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,`${a} != ${b}`);
function fixture(upper=56,storage){
  const engine=new NullEngine(),scene=new Scene(engine),camera=new ArcRotateCamera('test',1,.9,17,Vector3.Zero(),scene);
  camera.minZ=.05;camera.lowerRadiusLimit=.8;camera.upperRadiusLimit=upper;
  const zoom=new CameraZoom(camera,{storage});
  return {engine,scene,camera,zoom,input:{camera,zoom:PlaygroundInput.prototype.zoom}};
}
function controls(zoom){
  const ids=['camera-min-enabled','camera-max-enabled','camera-min-zoom','camera-max-zoom','camera-zoom-status','apply-camera-zoom','reset-camera-zoom'];
  const nodes=Object.fromEntries(ids.map(id=>[id,{value:'',checked:false,disabled:false,textContent:'',listeners:{},attributes:{},
    addEventListener(type,cb){this.listeners[type]=cb;},setAttribute(k,v){this.attributes[k]=v;}}]));
  let updates=0;
  setupCameraZoomControls(zoom,{doc:{getElementById:id=>nodes[id]},onChange:()=>updates++});
  return {nodes,updates:()=>updates,change:(id,value)=>{nodes[id].checked=value;nodes[id].listeners.change();},click:id=>nodes[id].listeners.click()};
}

test('zoom diagnostics use fixed magnification and keep both existing desktop/mobile bounds',()=>{
  for(const upper of [56,82]){
    const f=fixture(upper);
    try{
      assert.equal(f.zoom.snapshot().factor,1);assert.equal(f.camera.lowerRadiusLimit,.8);close(f.camera.upperRadiusLimit,upper);
      assert.equal(f.zoom.settings.minEnabled,true);assert.equal(f.zoom.settings.maxEnabled,true);
      f.input.zoom(.5);assert.equal(f.zoom.snapshot().factor,2);
      f.input.zoom(.001);f.scene.render();assert.equal(f.camera.radius,.8);assert.equal(f.zoom.snapshot().factor,21.25);
      f.input.zoom(1e6);f.scene.render();close(f.camera.radius,upper);
      for(const invalid of [0,-1,Infinity,NaN]){f.input.zoom(invalid);close(f.camera.radius,upper);}
    }finally{f.engine.dispose();}
  }
});

test('independent limit switches really release input/engine bounds, persist, and clamp when restored',()=>{
  const data=new Map(),storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)},f=fixture(56,storage);
  try{
    f.zoom.update({minZoom:.5,maxZoom:2});
    f.input.zoom(.01);f.scene.render();assert.equal(f.camera.radius,8.5);
    f.zoom.update({minEnabled:false});f.input.zoom(100);f.scene.render();assert.equal(f.camera.radius,850);assert.equal(f.camera.upperRadiusLimit,null);
    f.zoom.update({maxEnabled:false});f.input.zoom(.000001);f.scene.render();close(f.camera.radius,.1);assert.equal(f.camera.lowerRadiusLimit,null);
    const restored=fixture(56,storage);
    try{assert.deepEqual(restored.zoom.settings,f.zoom.settings);assert.equal(restored.camera.upperRadiusLimit,null);assert.equal(restored.camera.lowerRadiusLimit,null);}finally{restored.engine.dispose();}
    f.zoom.update({maxEnabled:true});f.scene.render();assert.equal(f.camera.radius,8.5);
    f.input.zoom(100);f.zoom.update({minEnabled:true});f.scene.render();assert.equal(f.camera.radius,34);
    f.zoom.update(f.zoom.defaults);assert.equal(f.camera.lowerRadiusLimit,.8);close(f.camera.upperRadiusLimit,56);
    for(const invalid of [{minZoom:0},{minZoom:30,maxZoom:2},{maxZoom:Infinity},{maxZoom:171}]){
      const before=data.get(f.zoom.key);assert.throws(()=>f.zoom.update(invalid),RangeError);assert.equal(data.get(f.zoom.key),before);
    }
  }finally{f.engine.dispose();}
});

test('camera settings validate edits, retain exact default values, reset, and survive unavailable storage',()=>{
  const storage={getItem(){throw Error('denied');},setItem(){throw Error('denied');}},f=fixture(56,storage);
  try{
    const ui=controls(f.zoom),{nodes}=ui;ui.click('apply-camera-zoom');close(f.camera.upperRadiusLimit,56);
    nodes['camera-min-zoom'].value='2';nodes['camera-max-zoom'].value='1';
    ui.click('apply-camera-zoom');assert.equal(nodes['camera-min-zoom'].attributes['aria-invalid'],'true');close(f.camera.upperRadiusLimit,56);
    nodes['camera-min-zoom'].value='.5';nodes['camera-max-zoom'].value='3';ui.click('apply-camera-zoom');
    assert.equal(f.zoom.settings.minZoom,.5);assert.equal(f.zoom.settings.maxZoom,3);
    ui.change('camera-min-enabled',false);assert.equal(nodes['camera-min-zoom'].disabled,true);assert.equal(f.camera.upperRadiusLimit,null);
    ui.change('camera-max-enabled',false);assert.equal(nodes['camera-max-zoom'].disabled,true);assert.equal(f.camera.lowerRadiusLimit,null);
    ui.click('reset-camera-zoom');assert.equal(nodes['camera-min-enabled'].checked,true);assert.equal(nodes['camera-max-enabled'].checked,true);
    assert.equal(nodes['camera-min-zoom'].disabled,false);assert.equal(nodes['camera-max-zoom'].disabled,false);close(f.camera.upperRadiusLimit,56);
    assert.equal(ui.updates(),5);
  }finally{f.engine.dispose();}
  for(const saved of ['{bad','null','{"minEnabled":false,"maxEnabled":false,"minZoom":0,"maxZoom":2}']){
    const f=fixture(56,{getItem:()=>saved});try{assert.equal(f.zoom.settings.minEnabled,true);assert.equal(f.zoom.settings.maxEnabled,true);}finally{f.engine.dispose();}
  }
});

test('real village, forest and cave round trips preserve magnification, chosen bounds and rear view',()=>{
  const engine=new NullEngine(),world=createWorld(engine,{village:true,touchDevice:true}),camera=world.camera;
  try{
    const zoom=new CameraZoom(camera);zoom.update({minZoom:.5,maxZoom:4});camera.radius=12;
    const actor={rotation:{y:1}},pan={x:0,y:0,z:0},initial=zoom.snapshot();
    for(const character of ['warrior-v4','warrior-v5','warrior-v4','warrior-v3','warrior-v4','warrior-v3']){
      replaceWorldMap(world,character);carryPortalPose(actor,camera,pan);world.scene.render();
      assert.equal(world.camera,camera);assert.deepEqual(zoom.snapshot(),initial);assert.equal(camera.lowerRadiusLimit,4.25);assert.equal(camera.upperRadiusLimit,34);
    }
  }finally{engine.dispose();}
});
