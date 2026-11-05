import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {NullEngine,Scene,FreeCamera,TransformNode,Vector3,Viewport} from '@babylonjs/core';
import {ScreenProjection} from '../src/screen-projection.js';
import {StaminaNoticeAnchor} from '../src/stamina-notice-anchor.js';
import {configurePlayerSize,WARRIOR_DIMENSIONS} from '../src/player-dimensions.js';

function fixture(t,{width=1300,height=600,ratio=1,viewport}={}){
  const engine=new NullEngine({renderWidth:width*ratio,renderHeight:height*ratio}),scene=new Scene(engine);scene.useRightHandedSystem=true;
  const camera=new FreeCamera('notice-camera',new Vector3(0,2,-8),scene);camera.setTarget(new Vector3(0,1,0));if(viewport)camera.viewport=viewport;
  const actor=new TransformNode('player',scene);actor.position.set(.7,.3,0);configurePlayerSize(actor,{}, {warrior:true});
  const {document}=parseHTML('<div id="toast" class="stamina-notice" hidden>스테미나가 부족합니다.</div>'),element=document.getElementById('toast'),anchor=new StaminaNoticeAnchor(element),projection=new ScreenProjection(scene);
  projection.resize(width,height);const frame=()=>{scene.render();projection.beginFrame();};frame();
  let projects=0,writes=0;const project=projection.project.bind(projection),set=element.style.setProperty.bind(element.style);
  projection.project=point=>{projects++;return project(point);};element.style.setProperty=(...args)=>{writes++;return set(...args);};
  const expected=()=>({...project(actor.position.add(new Vector3(0,WARRIOR_DIMENSIONS.height,0)))});
  t.after(()=>{anchor.dispose();scene.dispose();engine.dispose();});
  return {engine,scene,camera,actor,element,anchor,projection,frame,expected,get projects(){return projects;},get writes(){return writes;}};
}
// Babylon keeps its projection matrices in Float32, including viewport scale.
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<.001,`${actual} != ${expected}`);
const position=f=>({x:parseFloat(f.element.style.getPropertyValue('--stamina-notice-x')),y:parseFloat(f.element.style.getPropertyValue('--stamina-notice-y'))});

test('notice centers on the real stable player projection across CSS viewports and render scales, without safe-area or viewport-center offsets',t=>{
  for(const [width,height]of [[1300,600],[832,384],[393,852]]){
    let first;
    for(const ratio of [1,1.7,2]){
      const f=fixture(t,{width,height,ratio}),expected=f.expected();
      f.projection.safeInsets={left:48,right:0,top:24,bottom:12};
      f.anchor.show();assert.equal(f.element.hidden,true,'never expose stale viewport coordinates before projection');
      assert.equal(f.anchor.update(f.projection,f.actor),true);const actual=position(f);
      near(actual.x,expected.x);near(actual.y,expected.y-12);assert.equal(f.element.hidden,false);
      assert.ok(Math.abs(actual.x-width/2)>10,'a panned/off-center character must not keep viewport-centered text');
      if(first){near(actual.x,first.x);near(actual.y,first.y);}else first=actual;
      assert.equal(f.element.textContent,'스테미나가 부족합니다.');
    }
  }
});

test('camera viewport and cached canvas-to-app offsets apply once, while actor motion updates the anchor exactly',t=>{
  const f=fixture(t,{width:832,height:384,ratio:1.7,viewport:new Viewport(.2,.1,.6,.8)});
  f.anchor.setOffset(23,17);f.anchor.show();f.anchor.update(f.projection,f.actor);
  let expected=f.expected(),actual=position(f);near(actual.x,expected.x+23);near(actual.y,expected.y+17-12);
  const projects=f.projects,writes=f.writes;f.anchor.update(f.projection,f.actor);
  assert.equal(f.projects,projects+1);assert.equal(f.writes,writes,'stationary frames never rewrite unchanged CSS coordinates');
  f.actor.position.addInPlaceFromFloats(.3,.7,.2);f.frame();f.anchor.update(f.projection,f.actor);expected=f.expected();actual=position(f);
  near(actual.x,expected.x+23);near(actual.y,expected.y+17-12);
});

test('offscreen/behind-camera warnings hide and clear their coordinates, then do zero projection work until a new warning',t=>{
  const f=fixture(t);f.anchor.show();f.anchor.update(f.projection,f.actor);f.actor.position.x=1000;
  assert.equal(f.anchor.update(f.projection,f.actor),false);assert.equal(f.anchor.active,false);assert.equal(f.element.hidden,true);
  assert.equal(f.element.style.getPropertyValue('--stamina-notice-x'),'');assert.equal(f.element.style.getPropertyValue('--stamina-notice-y'),'');
  const projects=f.projects;for(let i=0;i<100;i++)f.anchor.update(f.projection,f.actor);assert.equal(f.projects,projects);
  f.actor.position.set(.7,.3,0);f.anchor.show();assert.equal(f.anchor.update(f.projection,f.actor),true);
  f.actor.position.z=-20;f.frame();assert.equal(f.anchor.update(f.projection,f.actor),false);assert.equal(f.element.hidden,true);
});

test('a point outside a partial camera viewport cannot leave an on-screen stale warning',t=>{
  const f=fixture(t,{width:832,height:384,viewport:new Viewport(.3,0,.4,1)});
  const project=f.projection.project;
  f.projection.project=()=>({x:200,y:100,visible:true}); // Within canvas, outside the active viewport's x249.6..582.4.
  f.anchor.show();assert.equal(f.anchor.update(f.projection,f.actor),false);assert.equal(f.element.hidden,true);assert.equal(f.anchor.active,false);
  f.projection.project=project;
});

test('loading/death/map reset, external timeout hiding and disposal all stop work without owning a new timer or changing input',t=>{
  for(const lifecycle of ['visible-false','reset','external-hidden','dispose']){
    const f=fixture(t);f.anchor.show();f.anchor.update(f.projection,f.actor);
    if(lifecycle==='visible-false')f.anchor.update(f.projection,f.actor,{visible:false});
    else if(lifecycle==='reset')f.anchor.reset();
    else if(lifecycle==='external-hidden'){f.element.hidden=true;f.anchor.update(f.projection,f.actor);}
    else f.anchor.dispose();
    const projects=f.projects;for(let frame=0;frame<100;frame++)f.anchor.update(f.projection,f.actor);
    assert.equal(f.projects,projects,lifecycle);assert.equal(f.element.hidden,true,lifecycle);assert.equal(f.element.style.getPropertyValue('--stamina-notice-x'),'');
    if(lifecycle==='dispose')assert.equal(f.anchor.show(),false);
  }
});

test('an ordinary toast replacement clears the anchor without hiding or rewriting its new message',t=>{
  const f=fixture(t);f.anchor.show();f.anchor.update(f.projection,f.actor);
  f.element.classList.remove('stamina-notice');f.element.textContent='다시 움직일 수 있습니다.';f.element.hidden=false;
  const projects=f.projects;assert.equal(f.anchor.update(f.projection,f.actor),false);
  assert.equal(f.projects,projects);assert.equal(f.element.hidden,false);assert.equal(f.element.textContent,'다시 움직일 수 있습니다.');
  assert.equal(f.element.style.getPropertyValue('--stamina-notice-x'),'');assert.equal(f.anchor.active,false);
});

test('an uninitialized projection or invalid actor position cannot flash default or stale coordinates',t=>{
  const f=fixture(t);f.anchor.show();const projection=new ScreenProjection(f.scene);projection.resize(1300,600);
  assert.equal(f.anchor.update(projection,f.actor),false);assert.equal(f.element.hidden,true);assert.equal(f.projects,0);
  f.actor.position.x=NaN;f.anchor.show();assert.equal(f.anchor.update(f.projection,f.actor),false);assert.equal(f.projects,0);
  assert.equal(f.anchor.setOffset(Infinity,0),false);assert.equal(f.anchor.active,false);
});
