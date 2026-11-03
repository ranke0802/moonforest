import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import postcss from 'postcss';
import {setupSettingsPanel} from '../src/settings-panel.js';
import {setupSummonPanel} from '../src/summon-panel.js';
import {setupCommercialUi,COMMERCIAL_UI_ART} from '../src/commercial-ui.js';
import {setupChapterQuests} from '../src/chapter-quest.js';
import {CHAPTER_QUESTS} from '../src/chapter-quest-data.js';
import {lootRarity} from '../src/loot-rarity.js';

const facts=[];
function fixture(t,{hp=300}={}){
 const {document,window}=parseHTML(readFileSync(new URL('../index.html',import.meta.url),'utf8')),old=globalThis.document;globalThis.document=document;t.after(()=>globalThis.document=old);
 const create=document.createElement.bind(document),modal=node=>{Object.defineProperty(node,'open',{get(){return this.hasAttribute('open');},configurable:true});node.showModal=()=>node.setAttribute('open','');node.close=()=>{node.removeAttribute('open');node.dispatchEvent(new window.Event('close'));};return node;};document.createElement=(name,...args)=>name==='dialog'?modal(create(name,...args)):create(name,...args);for(const node of document.querySelectorAll('dialog'))modal(node);
 setupSettingsPanel();setupSummonPanel();
 const root=document.getElementById('app'),saved=new Map(),state={ready:true,map:'village',position:{x:0,z:0},combat:false,busy:false,dead:false},storage={getItem:k=>saved.get(k),setItem:(k,v)=>saved.set(k,v)};let health=hp,equipmentOpens=0;
 const api=setupChapterQuests({root,world:{scene:{onDisposeObservable:{addOnce(){}}},navigation:{findFree:p=>p,segmentClear:()=>true},terrain:{heightAt:()=>0}},getState:()=>state,storage,heal:amount=>{const restored=Math.min(amount,500-health);health+=restored;return restored;},openEquipment:()=>equipmentOpens++,createProps:()=>({load:async()=>true,update(){},release(){},dispose(){}})});t.after(()=>api.dispose());
 const click=(action,id)=>{const button=root.querySelector(`[data-chapter="${action}"]${id?`[data-id="${id}"]`:''}`);assert.ok(button,action+':'+id);button.dispatchEvent(new window.Event('click',{bubbles:true}));};
 return {root,document,window,api,click,state,get health(){return health;},set health(value){health=value;},get equipmentOpens(){return equipmentOpens;}};
}
test('production art decorates existing controls without replacing input nodes, hit-area styles, labels or live FPS values',t=>{
 const f=fixture(t),ids=['attack-button','guard-button','dodge-button','potion-button'],nodes=ids.map(id=>f.root.querySelector('#'+id)),before=nodes.map(node=>({style:node.getAttribute('style'),disabled:node.disabled,label:node.querySelector('span')}));let presses=0,diagnostics=0;nodes[0].addEventListener('pointerdown',()=>presses++);
 const api=setupCommercialUi({root:f.root,onDiagnostics:()=>diagnostics++});t.after(()=>api.dispose());assert.strictEqual(setupCommercialUi({root:f.root}),api);for(let i=0;i<20;i++)api.refresh();
 assert.equal(f.root.querySelectorAll('.commercial-action-art').length,4);nodes.forEach((node,i)=>{assert.strictEqual(f.root.querySelector('#'+ids[i]),node);assert.equal(node.getAttribute('style'),before[i].style);assert.equal(node.disabled,before[i].disabled);assert.strictEqual(node.querySelector('span'),before[i].label);});nodes[0].dispatchEvent(new f.window.Event('pointerdown'));assert.equal(presses,1);
 assert.deepEqual([...f.root.querySelector('.top-actions').children].filter(n=>!n.hidden).map(n=>n.dataset.topAction),['fps','bag','journal','summon','fullscreen','settings']);
 const fps=f.root.querySelector('#live-fps');fps.textContent='47 FPS';fps.dispatchEvent(new f.window.Event('click'));assert.equal(diagnostics,1);assert.equal(fps.textContent,'47 FPS');const enter=new f.window.Event('keydown');enter.key='Enter';fps.dispatchEvent(enter);assert.equal(diagnostics,2);
 const fullscreen=f.root.querySelector('#fullscreen-button');fullscreen.textContent='화면 축소';api.refresh();assert.equal(fullscreen.textContent,'화면 축소');assert.ok(fullscreen.classList.contains('commercial-top-fullscreen'));
 api.dispose();assert.equal(f.root.querySelectorAll('.commercial-action-art').length,0);assert.equal(f.root.dataset.commercialUi,undefined);assert.equal(fps.getAttribute('role'),null);assert.equal(fps.getAttribute('aria-label'),'현재 게임 프레임');facts.push({case:'existing-control-identity',refreshes:20,combatNodes:4,combatInlineStylesChanged:0,artNodesAfterDispose:0,actualFPSValuePreserved:true});
});
test('actual chapter inventory uses saved items and authored healing, selection/filter, no fake equipment or growth stats',t=>{
 const f=fixture(t),j=f.api.journey;j.collect('pie',2);j.collect('apple',4);j.collect('church-seal');j.openChest({id:'commercial-real-loot',key:'chest:commercial-real-loot',tier:5});f.click('bag');
 const dialog=f.root.querySelector('#chapter-dialog');assert.equal(dialog.open,true);assert.equal(dialog.querySelectorAll('.chapter-item-slot').length,4);assert.equal(dialog.querySelectorAll('.chapter-dialog-content').length,1);assert.doesNotMatch(dialog.textContent,/성장 단계|장착 중인 검/);assert.equal(dialog.querySelector('[data-chapter=item][data-id=gold]'),null);
 f.click('item','pie');f.click('use','pie');assert.equal(f.health,420);assert.equal(j.value.bag.pie,1);assert.match(dialog.querySelector('.chapter-dialog-feedback').textContent,/체력을 회복/);
 f.click('bag-filter','quest');assert.equal(dialog.querySelectorAll('.chapter-item-slot').length,1);assert.ok(dialog.querySelector('[data-chapter=item][data-id=apple]'));assert.equal(dialog.querySelector('[data-chapter=use]'),null);
 f.click('bag-filter','all');f.click('item','restoration-water');const article=dialog.querySelector('.chapter-item-detail');assert.equal(article.style.getPropertyValue('--rarity-color'),lootRarity(5).color);assert.match(article.textContent,/최대 500/);f.health=500;f.click('use','restoration-water');assert.equal(j.value.bag['restoration-water'],1);assert.match(dialog.querySelector('.chapter-dialog-feedback').textContent,/체력이 가득/);
 f.click('equipment');assert.equal(f.equipmentOpens,1);assert.equal(dialog.open,false);facts.push({case:'actual-inventory-data',actualItemKinds:4,healed:120,fullHealthItemNotConsumed:true,itemFilter:true,realEquipmentNavigation:true});
});
test('journal presentation retains authored quest text, progress, prerequisites and reward values',t=>{
 const f=fixture(t),quest=CHAPTER_QUESTS.find(q=>q.id===f.api.journey.value.tracked);f.click('journal');const dialog=f.root.querySelector('#chapter-dialog');assert.equal(dialog.open,true);assert.match(dialog.querySelector('.chapter-paper').textContent,new RegExp(quest.name));for(const objective of quest.objectives)assert.ok(dialog.querySelector('.chapter-objectives').textContent.includes(objective.label));for(const count of Object.values(quest.rewards))assert.ok(dialog.querySelector('.chapter-reward').textContent.includes(String(count)));assert.ok(dialog.querySelector('.chapter-reward').textContent.includes(String(quest.xp)));assert.equal(dialog.parentNode,f.root);facts.push({case:'authored-journal',quest:quest.id,objectives:quest.objectives.length,actualRewardCounts:true,fullscreenRootParent:true});
});
test('commercial CSS adds no combat box/anchor transforms and all art references remain local, with no persistent frame work',()=>{
 const source=readFileSync(new URL('../src/commercial-ui.js',import.meta.url),'utf8'),css=readFileSync(new URL('../src/commercial-ui.css',import.meta.url),'utf8'),ast=postcss.parse(css);let combatBoxRules=0;
 ast.walkRules(rule=>{for(const selector of rule.selectors)if(/(?:\.action-controls(?:\[[^\]]+\])?|\.action-button|#(?:attack|guard|dodge|potion)-button)(?::[\w()-]+)?$/.test(selector.trim())){combatBoxRules++;for(const decl of rule.nodes.filter(n=>n.type==='decl'))assert.ok(!/^(?:position|inset|top|right|bottom|left|width|height|min-width|min-height|padding|margin|transform|scale)(?:-|$)/.test(decl.prop),selector+':'+decl.prop);}});
 assert.doesNotMatch(source,/requestAnimationFrame|setInterval|MutationObserver|ResizeObserver|pointerdown|pointerup/);for(const url of Object.values(COMMERCIAL_UI_ART))assert.ok(existsSync(new URL(url)),url);for(const match of css.matchAll(/url\(['"]?([^'"\)]+)['"]?\)/g))assert.ok(existsSync(new URL('../src/'+match[1],import.meta.url)));assert.doesNotMatch(css,/https?:|@import|blur\(/);facts.push({case:'cost-and-input-boundary',combatBoxRules,newFrameObservers:0,newFrameTimers:0,localArtOnly:true});
});
test.after(()=>{const dir=new URL('../reports/commercial-ui-2026-11-03/',import.meta.url);mkdirSync(dir,{recursive:true});writeFileSync(new URL('integration-validation.json',dir),JSON.stringify({scope:'Actual DOM/state/CSS declarations. No browser/GPU visual or mobile performance claim.',facts},null,2)+'\n');});
