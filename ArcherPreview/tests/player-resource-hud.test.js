import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {Observable,Vector3} from '@babylonjs/core';
import {PlayerHealthBar} from '../src/player-health-bar.js';
import {setupSettingsPanel} from '../src/settings-panel.js';
import {setupSummonPanel} from '../src/summon-panel.js';
import {setupChapterQuests} from '../src/chapter-quest.js';
import {setupUiTest} from '../src/ui-test.js';

function fixture(t){
  const {document,window}=parseHTML(readFileSync(new URL('../index.html',import.meta.url),'utf8')),previous=globalThis.document;globalThis.document=document;t.after(()=>{globalThis.document=previous;});
  const create=document.createElement.bind(document);
  function modal(node){Object.defineProperty(node,'open',{configurable:true,get(){return this.hasAttribute('open');}});node.showModal=function(){this.setAttribute('open','');};node.close=function(){this.removeAttribute('open');this.dispatchEvent(new window.Event('close'));};return node;}
  document.createElement=(name,...args)=>name==='dialog'?modal(create(name,...args)):create(name,...args);
  for(const node of document.querySelectorAll('dialog'))modal(node);
  return {document,window,root:document.getElementById('app')};
}

test('real main health update puts a cached yellow stamina line between HP and its unchanged numeric label',t=>{
  const f=fixture(t),bar=new PlayerHealthBar(f.document.getElementById('player-health'));
  const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8'),start=main.indexOf('function updateHealthBars()'),end=main.indexOf('\nfunction syncCaveFog',start);
  assert.ok(start>=0&&end>start);const actor={position:Vector3.Zero()},controller={stamina:65,maxStamina:100};
  const env={world:{scene:{},cave:false,terrain:{heightAt:()=>0}},boss:{encounters:[],playerHp:410,playerMaxHp:500},ready:true,isV2:()=>true,actor,controller,playerHealthBar:bar,bossHealthBars:{update(){}},screenProjection:{},playerHead:null};
  const update=Function(...Object.keys(env),main.slice(start,end)+';return updateHealthBars;')(...Object.values(env));update();
  assert.deepEqual([...bar.element.children],[bar.progress,bar.stamina,bar.label]);assert.equal(bar.label.textContent,'HP 410 / 500');assert.equal(bar.stamina.max,100);assert.equal(bar.stamina.value,65);
  let writes=0,value=65;Object.defineProperty(bar.stamina,'value',{configurable:true,get:()=>value,set:next=>{value=next;writes++;}});
  for(let frame=0;frame<100;frame++)update();assert.equal(writes,0,'unchanged stamina never rewrites the progress element');
  controller.stamina=20;update();assert.equal(writes,1);assert.equal(value,20);assert.equal(bar.label.textContent,'HP 410 / 500');assert.equal(f.document.getElementById('damage-numbers').children.length,0,'stamina has no floating numbers');
  const css=readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');assert.match(css,/#app #player-hud #player-stamina\{height:3px/);assert.match(css,/#player-stamina::-webkit-progress-value\{background:#f0ce55\}/);assert.match(css,/#player-stamina::-moz-progress-bar\{background:#f0ce55\}/);bar.dispose();
});

for(const mode of ['chapter','ui-test'])test(`actual ${mode} UI preserves existing controls and orders six top actions`,t=>{
  const f=fixture(t),fullscreen=f.document.getElementById('fullscreen-button'),settings=f.document.getElementById('motion-speed-toggle');let fullscreenClicks=0;fullscreen.addEventListener('click',()=>fullscreenClicks++);
  setupSettingsPanel();setupSummonPanel();
  const state={ready:true,map:'village',character:'warrior-v3',position:{x:0,z:0},combat:false,busy:false,dead:false},storage={getItem:()=>null,setItem(){}};
  const ui=mode==='chapter'?setupChapterQuests({root:f.root,world:{scene:{onDisposeObservable:new Observable()}},storage,getState:()=>state,createProps:()=>({dispose(){},release(){}})}):setupUiTest({root:f.root,storage,getState:()=>state});
  const nodes=[...f.root.querySelector('.top-actions').children].filter(node=>!node.hidden);
  assert.deepEqual(nodes.map(node=>node.dataset.topAction),['fps','bag','journal','summon','fullscreen','settings']);
  assert.equal(f.document.getElementById('fullscreen-button'),fullscreen);assert.equal(f.document.getElementById('motion-speed-toggle'),settings);fullscreen.dispatchEvent(new f.window.Event('click'));assert.equal(fullscreenClicks,1);
  const bag=nodes[1],dialog=f.root.querySelector(mode==='chapter'?'#chapter-dialog':'#ui-test-dialog');bag.dispatchEvent(new f.window.Event('click',{bubbles:true}));assert.equal(dialog.open,true,'reordered bag keeps its actual event handler');dialog.close();
  nodes[2].dispatchEvent(new f.window.Event('click',{bubbles:true}));assert.equal(dialog.open,true,'reordered journal keeps its actual event handler');ui.dispose();
  const css=readFileSync(new URL('../src/ui-test.css',import.meta.url),'utf8');assert.match(css,/\.top-actions #live-fps\{display:inline-block/);assert.match(css,/\.uit-top\[data-uit-action=inventory\]\{display:flex\}/);
});
