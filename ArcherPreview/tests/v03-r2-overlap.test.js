// 2026-11-27 R2 review (astra-full-play-ecc7b154): quick hits' damage numbers overlapped each other, and a
// calm tip shown when the bear arrived covered the top of its health bar.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {Vector3} from '@babylonjs/core';
import {createDamageNumbers,SPREAD_RECENT} from '../src/damage-numbers.js';
import * as chapter1 from '../src/v03/data/chapter1.js';

function setup(options){
 const {document}=parseHTML('<html><body><div id="n"></div></body></html>');globalThis.document=document;
 const host=document.getElementById('n'),numbers=createDamageNumbers(null,host,options);
 const projection={project:()=>({x:100,y:100,visible:true})};
 const owner={active:true,brain:{},damageNumberPosition:()=>new Vector3(0,1,0)};
 const transforms=()=>[...host.children].map(e=>e.style.transform);
 return {numbers,projection,owner,transforms};
}

test('0.3: a burst sits one number-width apart, quick follow-ups on one target step aside',()=>{
 const s=setup({spread:true});
 for(let i=1;i<=3;i++)s.numbers.show(new Vector3(0,1,0),34,i===3,'enemy',i,false,s.owner);
 s.numbers.update(.016,s.projection);
 const [a,b,c]=s.transforms();
 assert.match(a,/translateX\(-2\.6ch\)$/);assert.doesNotMatch(b,/translateX/);assert.match(c,/translateX\(2\.6ch\)$/);
 const t=setup({spread:true});
 t.numbers.show(new Vector3(0,1,0),8,false,'enemy',0,false,t.owner);t.numbers.update(.1,t.projection);
 t.numbers.show(new Vector3(0,1,0),12,false,'enemy',0,false,t.owner);t.numbers.update(.1,t.projection);
 t.numbers.show(new Vector3(0,1,0),120,false,'enemy',0,false,t.owner);t.numbers.update(.016,t.projection);
 const [x,y,z]=t.transforms();
 assert.doesNotMatch(x,/translateX/);assert.match(y,/translateX\(2\.6ch\)$/);assert.match(z,/translateX\(-3\.6ch\)$/,'third goes to the other side');
 t.numbers.update(SPREAD_RECENT+.1,t.projection);t.numbers.show(new Vector3(0,1,0),9,false,'enemy',0,false,t.owner);t.numbers.update(.016,t.projection);
 assert.doesNotMatch(t.transforms().at(-1),/translateX/,'an older number no longer pushes a new one aside');
});

test('0.2 keeps its 24px burst offsets and no ch shift',()=>{
 const s=setup({});
 for(let i=1;i<=3;i++)s.numbers.show(new Vector3(0,1,0),34,false,'enemy',i,false,s.owner);
 s.numbers.update(.016,s.projection);
 const [a,,c]=s.transforms();
 assert.equal(a,'translate3d(76px,100px,0) translate(-50%,-100%)');assert.equal(c,'translate3d(124px,100px,0) translate(-50%,-100%)');
});

test('fight lessons are marked; calm tips wait for the fight; no tip while a boss bar is fixed at the top',()=>{
 const combat=chapter1.TIPS.filter(t=>t.combat===true).map(t=>t.id).sort();
 assert.deepEqual(combat,['boss','counter','heavy-hunt','potion','stamina']);
 const story=readFileSync(new URL('../src/v03/story.js',import.meta.url),'utf8');
 assert.match(story,/boss=engaged&&\(tips\.showing!==null\|\|tips\.queue\.length>0\)&&hud\.bossBarUp\?\.\(\)===true/);
 assert.match(story,/if\(boss\|\|engaged&&tips\.showing\.combat!==true\)\{tips\.queue\.unshift\(tips\.showing\)/);
 assert.match(story,/if\(!tips\.queue\.length\|\|dialogue\.open\|\|boss\)return;/);
 assert.match(story,/tips\.engaged=engaged/,'the one combat read per frame is shared');
});

test('the HUD sees a boss bar fixed at the top, not one under a boss\'s feet or hidden',async()=>{
 const {document}=parseHTML('<html><body><main id="app"><section class="boss-hud" id="boss-hud" hidden></section></main></body></html>');
 const {createPlayHud}=await import('../src/v03/play-hud.js');
 const hud=createPlayHud({doc:document,mount:document.getElementById('app')});
 const bar=document.getElementById('boss-hud');
 assert.equal(hud.bossBarUp(),false);
 bar.dataset.hud='world';bar.hidden=false;assert.equal(hud.bossBarUp(),false,'a bar under the feet leaves the top free');
 bar.dataset.hud='fixed';assert.equal(hud.bossBarUp(),true);
 bar.hidden=true;assert.equal(hud.bossBarUp(),false);
 // The bear's arrival line wins over a region name still up (both sit in the upper middle).
 hud.showPlace('윈드몬 대평원');const place=document.querySelector('.v03-place'),banner=document.querySelector('.v03-banner');assert.equal(place.hidden,false);
 hud.flash('대평원의 곰이 모습을 드러냈다');assert.equal(place.hidden,true);assert.equal(banner.hidden,false);
});
