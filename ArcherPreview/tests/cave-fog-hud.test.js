import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {NullEngine,Scene,Vector3} from '@babylonjs/core';
import {createDamageNumbers} from '../src/damage-numbers.js';
import {createGoldLootView} from '../src/gold-loot-view.js';
import {updateBossHealthPosition} from '../src/boss-health-bar.js';
test('unseen damage text is not created; existing text and boss HP disappear with line of sight',t=>{
  const {document}=parseHTML('<div id="damage"></div>'),old=globalThis.document;globalThis.document=document;t.after(()=>{globalThis.document=old;});
  let visible=false;const host=document.querySelector('#damage'),numbers=createDamageNumbers(null,host,{visibleAt:()=>visible}),projection={project:()=>({visible:true,x:10,y:10})};
  numbers.show(new Vector3(),20);assert.equal(host.children.length,0);visible=true;numbers.show(new Vector3(),20);numbers.update(.1,projection);assert.equal(host.children.length,1);visible=false;numbers.update(.1,projection);assert.equal(host.firstElementChild.style.display,'none');
  const hp={hidden:false};updateBossHealthPosition(null,{active:true,fogVisible:false},hp,projection);assert.equal(hp.hidden,true);
});
test('unseen loot hides both geometry and label and reappears without allocating replacement meshes',t=>{
  const {document}=parseHTML('<div id="loot"></div>'),old=globalThis.document;globalThis.document=document;const engine=new NullEngine(),scene=new Scene(engine);let visible=true;
  const view=createGoldLootView(scene,document.querySelector('#loot'),{visibleAt:()=>visible}),projection={project:()=>({visible:true,x:10,y:10})},drop={id:1,position:new Vector3(),age:1,amount:15};t.after(()=>{view.dispose();scene.dispose();engine.dispose();globalThis.document=old;});
  view.sync([drop]);view.project(projection);const count=scene.meshes.length,root=scene.getTransformNodeByName('gold-pile-1');assert.equal(root.isEnabled(),true);visible=false;view.project(projection);assert.equal(root.isEnabled(),false);assert.equal(document.querySelector('.gold-drop-label').hidden,true);
  for(let i=0;i<20;i++){visible=!visible;view.sync([drop]);view.project(projection);assert.equal(root.isEnabled(),visible);assert.equal(scene.meshes.length,count);}
});
