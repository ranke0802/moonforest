import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createSlowFx,mountSlowFxSettings,SLOW_FX_DEFAULT,SLOW_FX_KEY,SLOW_FX_RANGE} from '../src/v03/slow-fx.js';
import {createLoadingLore,shuffled,LOAD_PLACES,LOAD_TIPS,LOAD_STORIES} from '../src/v03/loading-lore.js';
import ko from '../src/v03/locales/ko.js';

const store=(seed={})=>{const map=new Map(Object.entries(seed));return {getItem:key=>map.has(key)?map.get(key):null,setItem:(key,value)=>map.set(key,String(value)),map};};

test('slow-motion settings: off by default, kept per browser, clamped',()=>{
 assert.deepEqual(SLOW_FX_DEFAULT,{on:false,everywhere:true,lines:false,zoom:.32,seconds:.7},'off until optimised (user, 2026-11-21)');
 assert.equal(SLOW_FX_KEY,'moonforest:slow-fx:v2','a choice stored under the old default is not read');
 const storage=store(),fx=createSlowFx(storage);
 assert.equal(fx.value,SLOW_FX_DEFAULT,'nothing stored: the defaults, one shared object');
 const before=fx.value;fx.set({zoom:.44});
 assert.notEqual(fx.value,before,'a change replaces the object');assert.equal(fx.value.zoom,.44);assert.equal(fx.value.on,false);
 assert.equal(JSON.parse(storage.map.get(SLOW_FX_KEY)).zoom,.44);
 fx.set({zoom:9,seconds:-1});assert.equal(fx.value.zoom,SLOW_FX_RANGE.zoom[1]);assert.equal(fx.value.seconds,SLOW_FX_RANGE.seconds[0]);
 fx.set({on:true,everywhere:false,lines:true});
 const again=createSlowFx(storage);assert.equal(again.value.on,true,'the player\'s own choice is kept');assert.equal(again.value.everywhere,false);assert.equal(again.value.lines,true);
 assert.equal(createSlowFx(store({[SLOW_FX_KEY]:'{broken'})).value,SLOW_FX_DEFAULT,'unreadable storage falls back');
 assert.equal(createSlowFx(null).value.on,false);
});

test('slow-motion settings: one section in the settings dialog',()=>{
 const {document}=parseHTML('<div class="settings-sections"><details class="settings-section"></details><details class="settings-section"></details><details class="settings-section"></details></div>');
 const host=document.querySelector('.settings-sections'),fx=createSlowFx(store()),t=key=>ko.ui[key]??key;
 const section=mountSlowFxSettings({doc:document,host,fx,t});
 assert.equal(host.children[2],section,'after the first two sections');assert.equal(section.querySelector('summary').textContent,'전투 연출');
 assert.equal(mountSlowFxSettings({doc:document,host,fx,t}),null,'mounted once');
 const [on,everywhere,lines]=section.querySelectorAll('input[type=checkbox]'),[zoom,seconds]=section.querySelectorAll('input[type=range]');
 assert.equal(on.checked,false,'off by default');assert.equal(lines.checked,false,'focus lines off by default');assert.equal(everywhere.checked,true);assert.equal(+zoom.value,.32);assert.equal(+seconds.value,.7);
 on.checked=true;on.dispatchEvent(new document.defaultView.Event('change'));assert.equal(fx.value.on,true);
 lines.checked=true;lines.dispatchEvent(new document.defaultView.Event('change'));assert.equal(fx.value.lines,true,'the player can still turn them on');
 on.checked=false;on.dispatchEvent(new document.defaultView.Event('change'));
 assert.equal(fx.value.on,false);assert.equal(everywhere.disabled,true);assert.equal(lines.disabled,true);assert.equal(zoom.disabled,true);
 zoom.value='.4';zoom.dispatchEvent(new document.defaultView.Event('input'));assert.equal(fx.value.zoom,.4);assert.equal(section.querySelector('output').textContent,'40%');
});

test('loading lore: every place, tip and story hint has its text',()=>{
 for(const id of LOAD_PLACES){assert.ok(ko.ui['load.place.'+id],id);assert.ok(ko.ui['load.about.'+id],id);}
 for(const id of LOAD_TIPS)assert.ok(ko.ui['load.tip.'+id],id);
 for(const id of LOAD_STORIES)assert.ok(ko.ui['load.story.'+id],id);
 let n=0;const order=shuffled(18,()=>((n=(n*31+7)%97)/97));
 assert.deepEqual([...order].sort((a,b)=>a-b),Array.from({length:18},(_,i)=>i),'a shuffle keeps every card once');
});

test('loading lore: the place and one tip while the card shows, the next tip on a tap',()=>{
 const {document,window}=parseHTML('<section id="loading" hidden><div id="loading-info"></div></section>');
 const observers=[],Observer=class{constructor(fn){this.fn=fn;observers.push(this);}observe(){}disconnect(){this.off=true;}};
 const overlay=document.getElementById('loading'),t=key=>ko.ui[key]??key;let seed=3;
 const lore=createLoadingLore({doc:document,t,Observer,random:()=>((seed=(seed*17+5)%89)/89)});
 const place=overlay.querySelector('.v03-lore'),tip=overlay.querySelector('.v03-loadtip');
 assert.equal(overlay.lastElementChild.id,'loading-info','the blocks sit above the loading text');
 assert.equal(place.hidden,true);assert.equal(tip.hidden,true);assert.equal(createLoadingLore({doc:document,t}),null,'mounted once');
 // The words wait for the picture: nothing while the art is still on its way.
 overlay.hidden=false;overlay.dataset.place='great-plains';overlay.dataset.art='pending';observers[0].fn();
 assert.equal(place.hidden,true,'no words before the picture');assert.equal(tip.hidden,true);assert.equal(lore.inspect().visible,false);
 overlay.dataset.art='ready';observers[0].fn();
 assert.equal(place.hidden,false);assert.equal(overlay.querySelector('.v03-lore-place').textContent,'윈드몬 대평원');assert.match(overlay.querySelector('.v03-lore-about').textContent,/초원/);
 assert.equal(tip.hidden,false);const first=overlay.querySelector('.v03-loadtip-text').textContent;assert.ok(first.length>5);
 assert.match(overlay.querySelector('.v03-loadtip-kind').textContent,/^(도움말|이야기)$/);
 observers[0].fn();assert.equal(overlay.querySelector('.v03-loadtip-text').textContent,first,'the same tip while the card stays up');
 // A tap: the next card; all of them come once before any repeats.
 const seen=new Set([first]);for(let i=1;i<LOAD_TIPS.length+LOAD_STORIES.length;i++){tip.dispatchEvent(new window.Event('click',{bubbles:true,cancelable:true}));seen.add(overlay.querySelector('.v03-loadtip-text').textContent);}
 assert.equal(seen.size,LOAD_TIPS.length+LOAD_STORIES.length);
 // An error card and a hidden card show neither; an unknown place shows the tip only.
 overlay.classList.add('error');observers[0].fn();assert.equal(place.hidden,true);assert.equal(tip.hidden,true);
 overlay.classList.remove('error');delete overlay.dataset.place;observers[0].fn();assert.equal(place.hidden,true);assert.equal(tip.hidden,false);
 overlay.hidden=true;observers[0].fn();assert.equal(tip.hidden,true);assert.equal(lore.inspect().visible,false);
 lore.dispose();assert.equal(observers[0].off,true);assert.equal(overlay.querySelector('.v03-lore'),null);
});
