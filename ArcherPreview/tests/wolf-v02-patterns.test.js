import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {BossPatternSettings,BOSS_PATTERN_KEY,bossPatternCatalog,setupBossPatternPanel} from '../src/boss-pattern-settings.js';
import {releaseStorage} from '../src/release-storage.js';
const storage=()=>{const rows=new Map();return {getItem:k=>rows.get(k)??null,setItem:(k,v)=>rows.set(k,v),removeItem:k=>rows.delete(k)};};
test('versioned wolf catalog and saved patterns cannot replace 0.1 settings',()=>{
 const raw=storage(),old=new BossPatternSettings(raw);old.set('wolf',{custom:true,sequence:['Pin_Throat_Bite_R5'],speed:1.3});const before=raw.getItem(BOSS_PATTERN_KEY);
 const next=new BossPatternSettings(releaseStorage(raw,'moonforest-0.2'),{release:'moonforest-0.2'});
 assert.equal(next.value.wolf.custom,false);assert.equal(bossPatternCatalog('moonforest-0.1').wolf.patterns.length,2);assert.equal(next.catalog.wolf.patterns.length,4);
 next.set('wolf',{custom:true,sequence:['quick-bite','chain-bite','pin','lunge'],speed:1.7});assert.equal(raw.getItem(BOSS_PATTERN_KEY),before);
 assert.deepEqual(new BossPatternSettings(releaseStorage(raw,'moonforest-0.2'),{release:'moonforest-0.2'}).value.wolf.sequence,['quick-bite','chain-bite','pin','lunge']);
 next.reset('wolf');assert.equal(raw.getItem(BOSS_PATTERN_KEY),before);assert.equal(old.value.wolf.speed,1.3);
});
test('0.2 pattern panel exposes all four actions and saves actual add/reorder/speed/reset controls',t=>{
 const {document,window}=parseHTML('<main id="app"><button id="open-boss-patterns"></button></main>'),old=globalThis.document;globalThis.document=document;t.after(()=>globalThis.document=old);
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return this.querySelector('option[selected]')?.getAttribute('value')??this.querySelector('option')?.getAttribute('value')??'';},set(value){for(const option of this.querySelectorAll('option'))option.toggleAttribute('selected',option.getAttribute('value')===value);}});
 window.HTMLElement.prototype.showModal=function(){this.setAttribute('open','');};window.HTMLElement.prototype.close=function(){this.removeAttribute('open');};
 const q=s=>document.querySelector(s),event=(s,name)=>q(s).dispatchEvent(new window.Event(name,{bubbles:true})),raw=storage(),panel=setupBossPatternPanel({release:'moonforest-0.2',storage:releaseStorage(raw,'moonforest-0.2')});
 q('#pattern-boss-kind').value='wolf';event('#pattern-boss-kind','change');assert.deepEqual([...q('#pattern-add-kind').options].map(o=>o.value),['quick-bite','chain-bite','lunge','pin']);
 q('#pattern-add-kind').value='quick-bite';event('#pattern-add','click');q('#pattern-add-kind').value='pin';event('#pattern-add','click');event('#pattern-stack button[data-action="down"]','click');assert.deepEqual(panel.settings.value.wolf.sequence,['pin','quick-bite']);
 q('#boss-attack-speed').value='1.4';event('#boss-attack-speed','input');assert.equal(panel.settings.value.wolf.speed,1.4);assert.equal(raw.getItem(BOSS_PATTERN_KEY),null);
 event('#reset-boss-patterns','click');assert.deepEqual(panel.settings.value.wolf,{custom:false,sequence:[],speed:1});
});
