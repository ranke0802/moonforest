// 2026-11-26, user: talking to the smith offers "talk / shop / temper", the herbalist
// "talk / shop"; the last entry of every such menu ends the talk. Second pass the same day:
// the same window as any talk (art, name, one greeting line) with the choices as a row of
// small buttons where Next/Close sits; A/D or the arrows move on a keyboard.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {createDialogue,CHOICE_ARM_MS} from '../src/v03/dialogue.js';
import {SERVICE_MENUS,serviceMenu} from '../src/v03/service-menu.js';
import {createStory} from '../src/v03/story.js';
import {QUESTS,NPCS,DIALOGUES} from '../src/v03/data/chapter1.js';
import {setPack} from '../src/v03/i18n.js';
import {portraitFor,PORTRAITS} from '../src/v03/portraits.js';
import ko from '../src/v03/locales/ko.js';
import en from '../src/v03/locales/en.js';
import ja from '../src/v03/locales/ja.js';
import vi from '../src/v03/locales/vi.js';
import zh from '../src/v03/locales/zh.js';

const PACKS={ko,en,ja,vi,zh};
function stage({typing=false,coarse=false}={}){
 const {document,window}=parseHTML('<html><body></body></html>');
 let time=0,pending=false;
 // The window closes before the next paint: frames are run by hand here (s.frame()).
 const frames=new Set();
 const later=fn=>{const job={fn};frames.add(job);return ()=>frames.delete(job);};
 // typing: start() leaves the line half shown until complete() (the real typewriter's contract).
 const typewriter={start(node,text){if(typing){node.textContent=text.slice(0,1);pending=text;}else node.textContent=text;return Promise.resolve();},
  complete(){if(!pending)return false;document.querySelector('.v03-dialogue-text').textContent=pending;pending=false;return true;},stop(){pending=false;},get typing(){return !!pending;}};
 const dialogue=createDialogue({doc:document,blip:null,typewriter,portraitFor:who=>who?'art/'+who+'.webp':null,now:()=>time,later,coarse:()=>coarse});
 const press=(code,extra={})=>{
  const event=new window.Event('keydown',{bubbles:true,cancelable:true});
  Object.defineProperty(event,'code',{value:code});Object.defineProperty(event,'repeat',{value:!!extra.repeat});
  document.dispatchEvent(event);return event;
 };
 const entries=()=>[...document.querySelectorAll('.v03-dialogue-choice')];
 const selected=()=>entries().findIndex(node=>node.classList.contains('is-selected'));
 const frame=()=>{const jobs=[...frames];frames.clear();for(const job of jobs)job.fn();};
 return {document,window,dialogue,press,entries,selected,frame,wait(ms=CHOICE_ARM_MS){time+=ms;},layer:document.querySelector('.v03-dialogue')};
}
const SMITH=[{id:'talk',label:'대화하기'},{id:'shop',label:'상점'},{id:'forge',label:'장비 재련'},{id:'leave',label:'대화 종료'}];
const HELLO='왔구나. 사러 왔냐, 손보러 왔냐?';
const $=(s,sel)=>s.document.querySelector(sel);
const css=readFileSync(new URL('../src/v03/v03.css',import.meta.url),'utf8').replace(/\/\*[\s\S]*?\*\//g,'');

test('the choices sit in the actions row under the greeting, the first one selected, and a tap picks one',async()=>{
 const s=stage();
 const picked=s.dialogue.choose(SMITH,{who:'대장장이',line:HELLO});
 assert.equal(s.dialogue.open,true);assert.equal(s.layer.hidden,false);
 assert.equal($(s,'.v03-dialogue-who').textContent,'대장장이');
 // The greeting stays readable together with the buttons.
 assert.equal($(s,'.v03-dialogue-text').hidden,false);assert.equal($(s,'.v03-dialogue-text').textContent,HELLO);
 assert.equal($(s,'.v03-sr-only').textContent,HELLO);
 const row=$(s,'.v03-dialogue-choices'),actions=$(s,'.v03-dialogue-actions');
 assert.equal(row.hidden,false);assert.equal(row.getAttribute('role'),'menu');
 assert.equal(row.parentNode,actions,'the buttons live in the actions row');assert.equal(actions.hidden,false);
 assert.ok(s.entries().every(node=>node.parentNode===row));
 assert.equal($(s,'.v03-dialogue-menu'),null,'the stacked list is gone');
 assert.equal($(s,'.v03-dialogue-next').hidden,true,'Next/Close steps aside for the choices');
 assert.equal($(s,'.v03-dialogue-key'),null,'the boxed E is gone');
 assert.equal($(s,'.v03-dialogue-hint').textContent,'WASD 이동 · E 선택');assert.equal($(s,'.v03-dialogue-hint').getAttribute('aria-hidden'),'true');
 assert.equal($(s,'.v03-dialogue-hint').parentNode,$(s,'.v03-dialogue-who').parentNode,'the hint shares the name line');
 assert.ok($(s,'.v03-dialogue-choices').classList.contains('is-keyed'),'on PC the first button shows selected at once');
 assert.ok($(s,'.v03-dialogue-box').classList.contains('is-choosing'));
 assert.deepEqual(s.entries().map(node=>node.textContent),['대화하기','상점','장비 재련','대화 종료']);
 assert.ok(s.entries().every(node=>node.getAttribute('role')==='menuitem'&&node.type==='button'));
 assert.equal(s.selected(),0);assert.equal(s.entries()[0].getAttribute('aria-current'),'true');
 assert.equal(s.document.querySelector('.v03-dialogue-portrait').getAttribute('src'),'art/대장장이.webp');
 assert.ok('v03Talk' in s.document.documentElement.dataset,'the play HUD steps back');
 s.wait();s.entries()[2].click();
 assert.equal(await picked,'forge');
 assert.equal(s.dialogue.open,false);assert.equal(s.entries().length,0);
 assert.equal(s.layer.hidden,false,'closing waits for the next frame');s.frame();assert.equal(s.layer.hidden,true);
 assert.equal($(s,'.v03-dialogue-next').hidden,false);assert.equal($(s,'.v03-dialogue-text').hidden,false);
 assert.equal($(s,'.v03-dialogue-box').classList.contains('is-choosing'),false);
 assert.equal('v03Talk' in s.document.documentElement.dataset,false);
 s.dialogue.dispose();
});

test('A and D, the arrows (and W/S) move without wrapping; Enter, Space or E picks; Escape ends the talk',async()=>{
 for(const [down,up] of [['KeyD','KeyA'],['ArrowRight','ArrowLeft'],['KeyS','KeyW'],['ArrowDown','ArrowUp']]){
  const s=stage(),picked=s.dialogue.choose(SMITH,{who:'대장장이'});
  assert.equal(s.press(up).defaultPrevented,true);assert.equal(s.selected(),0,'stays on the first');
  s.press(down);assert.equal(s.selected(),1);s.press(down);s.press(down);assert.equal(s.selected(),3);
  s.press(down);assert.equal(s.selected(),3,'stays on the last');
  s.press(up);assert.equal(s.selected(),2);
  assert.deepEqual(s.entries().map(node=>node.getAttribute('aria-current')),[null,null,'true',null]);
  s.wait();s.press('Enter');assert.equal(await picked,'forge');s.dialogue.dispose();
 }
 for(const [code,moves,expected] of [['Space',1,'shop'],['KeyE',0,'talk'],['Escape',1,'leave']]){
  const s=stage(),picked=s.dialogue.choose(SMITH);
  assert.equal(s.document.querySelector('.v03-dialogue-who').hidden,true,'no speaker given');
  for(let i=0;i<moves;i++)s.press('KeyS');
  s.wait();const event=s.press(code);assert.equal(event.defaultPrevented,true);
  assert.equal(await picked,expected,code);s.dialogue.dispose();
 }
 // Other keys pass through untouched; a held key does not pick.
 const s=stage(),picked=s.dialogue.choose(SMITH);let settled=false;picked.then(()=>{settled=true;});
 s.wait();assert.equal(s.press('KeyQ').defaultPrevented,false);
 s.press('Enter',{repeat:true});await Promise.resolve();assert.equal(settled,false);
 s.dialogue.cancel();assert.equal(await picked,null);assert.equal(s.dialogue.open,false);
 s.dialogue.dispose();
});

test('a pick within a quarter second of the menu appearing is ignored (the tap that closed the last line)',async()=>{
 const s=stage(),picked=s.dialogue.choose(SMITH);let value;picked.then(v=>{value=v;});
 assert.equal(CHOICE_ARM_MS,250);
 s.entries()[0].click();s.press('Enter');s.press('Escape');await Promise.resolve();
 assert.equal(value,undefined);assert.equal(s.dialogue.open,true);
 s.press('KeyS');assert.equal(s.selected(),1,'moving is allowed at once');
 s.wait(249);s.entries()[1].click();await Promise.resolve();assert.equal(value,undefined);
 s.wait(1);s.entries()[1].click();assert.equal(await picked,'shop');
 s.dialogue.dispose();
});

test('a menu and a conversation never overlap, and a waiting quest line marks the talk entry',async()=>{
 const s=stage();
 const lines=[{who:'대장장이',text:'어서 오게.'}];
 // Without a line only the name shows above the buttons.
 {const t=stage(),p=t.dialogue.choose(SMITH,{who:'대장장이'});assert.equal($(t,'.v03-dialogue-text').hidden,true);t.dialogue.cancel();assert.equal(await p,null);t.dialogue.dispose();}
 const talk=s.dialogue.play(lines);
 assert.equal(await s.dialogue.choose(SMITH),null,'no menu over a line');
 s.document.querySelector('.v03-dialogue-next').click();assert.equal(await talk,lines);
 const picked=s.dialogue.choose([{id:'talk',label:'대화하기',mark:true},{id:'leave',label:'대화 종료'}]);
 assert.equal(await s.dialogue.play(lines),null,'no line over a menu');
 assert.equal(await s.dialogue.choose(SMITH),null,'one menu at a time');
 assert.deepEqual(s.entries().map(node=>'mark' in node.dataset),[true,false]);
 // Clicking outside the box does nothing while choosing.
 s.wait();s.layer.dispatchEvent(new s.window.Event('click',{bubbles:true}));assert.equal(s.dialogue.open,true);
 s.dialogue.dispose();assert.equal(await picked,null,'disposing settles the pick');
 assert.equal(await s.dialogue.choose([]),null);
});

// Records every write that would close, reset or re-enter the window.
function spy(s){
 const log=[],layer=s.layer,portrait=$(s,'.v03-dialogue-portrait'),box=$(s,'.v03-dialogue-box');
 const hidden=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Object.getPrototypeOf(layer)),'hidden')??Object.getOwnPropertyDescriptor(s.window.HTMLElement.prototype,'hidden');
 Object.defineProperty(layer,'hidden',{configurable:true,get(){return hidden.get.call(this);},set(v){if(v)log.push('layer hidden');hidden.set.call(this,v);}});
 const src=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(portrait),'src')??Object.getOwnPropertyDescriptor(s.window.HTMLImageElement.prototype,'src');
 Object.defineProperty(portrait,'src',{configurable:true,get(){return src.get.call(this);},set(v){log.push('portrait src');src.set.call(this,v);}});
 const removeAttribute=portrait.removeAttribute.bind(portrait);portrait.removeAttribute=name=>{log.push('portrait remove '+name);removeAttribute(name);};
 const remove=box.classList.remove.bind(box.classList);box.classList.remove=(...names)=>{if(names.includes('is-in'))log.push('box re-enter');remove(...names);};
 return log;
}

test('talk after a pick, and the choices after the lines, keep the same window up (no hide, no new picture, no re-entrance)',async()=>{
 const s=stage();
 const first=s.dialogue.choose(SMITH,{who:'대장장이',line:HELLO});
 const art=$(s,'.v03-dialogue-portrait').getAttribute('src');assert.equal(art,'art/대장장이.webp');
 const log=spy(s);
 s.wait();s.entries()[0].click();
 assert.equal(await first,'talk');
 // The caller plays the talk at once (story.js interact: no frame in between).
 const lines=[{who:'대장장이',text:'어서 오게.'},{who:'대장장이',text:'날 보자.'}];
 const talk=s.dialogue.play(lines);
 assert.equal(s.layer.hidden,false);assert.equal($(s,'.v03-dialogue-text').textContent,'어서 오게.');
 s.frame();assert.equal(s.layer.hidden,false,'the cancelled close does not run later');
 assert.deepEqual(log,[],'nothing closed, reset or re-entered between the pick and the first line');
 assert.equal($(s,'.v03-dialogue-portrait').getAttribute('src'),art);
 $(s,'.v03-dialogue-next').click();log.length=0;// the second line re-enters as lines always do
 $(s,'.v03-dialogue-next').click();assert.equal(await talk,lines);
 const again=s.dialogue.choose(SMITH,{who:'대장장이',line:HELLO});
 s.frame();assert.equal(s.layer.hidden,false);assert.deepEqual(log,[],'back to the choices without a close');
 assert.equal($(s,'.v03-dialogue-portrait').getAttribute('src'),art);assert.equal(s.entries().length,4);
 // Ending the talk closes the window (before the next paint).
 s.wait();s.entries()[3].click();assert.equal(await again,'leave');
 s.frame();assert.equal(s.layer.hidden,true);assert.deepEqual(log,['layer hidden','portrait remove src']);
 assert.equal('v03Talk' in s.document.documentElement.dataset,false);
 s.dialogue.dispose();
});

test('the key hint: "E 다음"/"E 닫기" on lines, "WASD 이동 · E 선택" on the choices, in every language',async()=>{
 try{
  for(const [lang,pack] of Object.entries(PACKS)){
   setPack(lang,pack);
   const s=stage(),hint=()=>$(s,'.v03-dialogue-hint').textContent,ui=key=>pack.ui[key];
   const talk=s.dialogue.play([{who:'대장장이',text:'a'},{who:'대장장이',text:'b'}]);
   assert.equal(hint(),'E '+ui('dialogue.next'),lang);assert.equal($(s,'.v03-dialogue-next').textContent,ui('dialogue.next'));
   $(s,'.v03-dialogue-next').click();assert.equal(hint(),'E '+ui('dialogue.close'),lang+': follows the last-line switch');
   $(s,'.v03-dialogue-next').click();await talk;
   const p=s.dialogue.choose(SMITH,{who:'대장장이',line:HELLO});
   assert.equal(hint(),`WASD ${ui('talk.hint.move')} · E ${ui('talk.hint.pick')}`,lang);
   assert.ok(ui('talk.hint.move')&&ui('talk.hint.pick'),lang);
   assert.ok(s.entries().every(node=>!node.textContent.includes('WASD')),'not in the buttons\' names');
   s.dialogue.cancel();await p;s.dialogue.dispose();
  }
 }finally{setPack('ko',ko);}
 // CSS: hidden on touch screens, small text with no box.
 assert.match(css,/@media \(pointer:coarse\)\{\.v03-dialogue-hint\{display:none\}\}/);
 assert.doesNotMatch(css,/v03-dialogue-key/,'no rule for the old badge');
});

test('touch: no highlight until a key is used; the first pick key only shows it',async()=>{
 const s=stage({coarse:true}),p=s.dialogue.choose(SMITH,{who:'대장장이',line:HELLO});s.wait();
 const row=$(s,'.v03-dialogue-choices');
 assert.equal(row.classList.contains('is-keyed'),false);
 s.press('KeyE');assert.equal(row.classList.contains('is-keyed'),true);
 let got;p.then(v=>{got=v;});await Promise.resolve();assert.equal(got,undefined,'the blind E did not pick');
 s.press('KeyD');assert.equal(s.selected(),1);s.press('KeyE');assert.equal(await p,'shop');s.dialogue.dispose();
 // A tap needs no highlight.
 const t=stage({coarse:true}),q=t.dialogue.choose(SMITH,{who:'대장장이'});t.wait();t.entries()[2].click();assert.equal(await q,'forge');t.dialogue.dispose();
});

test('CSS: the stacked list is gone and the choice buttons share every size rule with Next/Close',()=>{
 assert.doesNotMatch(css,/\.v03-dialogue-menu/);
 const rules=[...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([,selector,body])=>({selector:selector.trim(),body}));
 const shared=rules.filter(rule=>/:is\(\.v03-dialogue-next,\.v03-dialogue-choice\)/.test(rule.selector));
 assert.ok(shared.some(rule=>/min-height:clamp\(36px/.test(rule.body)&&/padding:/.test(rule.body)&&/font-size:/.test(rule.body)),'the main size rule is shared');
 assert.ok(shared.some(rule=>/min-height:44px/.test(rule.body)),'the touch height is shared');
 for(const rule of rules)if(/\.v03-dialogue-choice(?![s\w-])/.test(rule.selector)&&!/\.v03-dialogue-next/.test(rule.selector))
  assert.doesNotMatch(rule.body,/(^|;)\s*(width|min-width|max-width|height|min-height|padding|font-size|letter-spacing|flex|border-radius)\s*:/,rule.selector+' sizes the choice on its own');
 assert.doesNotMatch(css,/grid-auto-columns|calc\(25%|calc\(50%/,'no stretched or equal-width layout');
});

test('a tap on the box or the picture never picks: it only completes the greeting; keys complete it first too',async()=>{
 const s=stage({typing:true});
 const picked=s.dialogue.choose(SMITH,{who:'대장장이',line:HELLO});let value;picked.then(v=>{value=v;});
 s.wait();
 assert.equal($(s,'.v03-dialogue-text').textContent,HELLO.slice(0,1),'still typing');
 $(s,'.v03-dialogue-box').dispatchEvent(new s.window.Event('click',{bubbles:true}));await Promise.resolve();
 assert.equal($(s,'.v03-dialogue-text').textContent,HELLO,'the tap shows the whole greeting');assert.equal(value,undefined);
 $(s,'.v03-dialogue-box').dispatchEvent(new s.window.Event('click',{bubbles:true}));
 $(s,'.v03-dialogue-text').dispatchEvent(new s.window.Event('click',{bubbles:true}));
 $(s,'.v03-dialogue-portrait').dispatchEvent(new s.window.Event('click',{bubbles:true}));
 s.layer.dispatchEvent(new s.window.Event('click',{bubbles:true}));await Promise.resolve();
 assert.equal(value,undefined);assert.equal(s.dialogue.open,true);
 s.dialogue.cancel();assert.equal(await picked,null);s.dialogue.dispose();
 // A key while the greeting types shows it whole; the next one picks.
 const k=stage({typing:true}),p=k.dialogue.choose(SMITH,{who:'대장장이',line:HELLO});k.wait();
 k.press('KeyD');k.press('KeyE');let got;p.then(v=>{got=v;});await Promise.resolve();
 assert.equal(got,undefined);assert.equal($(k,'.v03-dialogue-text').textContent,HELLO);
 k.press('KeyE');assert.equal(await p,'shop');k.dialogue.dispose();
});

test('the smith has a picture of his own (the blacksmith sheet, shared with the driver for now)',()=>{
 assert.notEqual(portraitFor('대장장이'),null);
 assert.equal(portraitFor('대장장이'),PORTRAITS.driver);assert.equal(portraitFor('마부'),PORTRAITS.driver);
 assert.equal(portraitFor('약초사'),PORTRAITS.herbalist);
});

test('the service people greet in one short line of their own, in every language',()=>{
 for(const id of ['smith','herbalist']){
  const npc=NPCS.find(row=>row.id===id),lines=DIALOGUES[npc.menu];
  assert.equal(lines?.length,1,id);assert.equal(lines[0].who,npc.name);
  for(const [lang,pack] of Object.entries(PACKS)){
   const text=lang==='ko'?lines[0].text:pack.story.dialogues[npc.menu]?.[0];
   assert.ok(text&&text.length<=48,lang+': '+id+' greeting is short');
  }
 }
});

test('the smith offers talk, shop and tempering, the herbalist talk and shop; ending the talk is always last',()=>{
 assert.deepEqual(SERVICE_MENUS,{smith:['shop','forge'],herbalist:['shop']});
 assert.equal(serviceMenu('driver'),null);assert.equal(serviceMenu('elder'),null);
 try{
  for(const [lang,pack] of Object.entries(PACKS)){
   setPack(lang,pack);
   const smith=serviceMenu('smith'),herbalist=serviceMenu('herbalist',true);
   assert.deepEqual(smith.map(entry=>entry.id),['talk','shop','forge','leave']);
   assert.deepEqual(herbalist.map(entry=>entry.id),['talk','shop','leave']);
   assert.deepEqual(smith.map(entry=>entry.label),['talk','shop','forge','leave'].map(id=>pack.ui['talk.menu.'+id]),lang);
   assert.ok(smith.every(entry=>entry.label&&!entry.label.startsWith('talk.')),lang+': every entry has its text');
   assert.equal(new Set(smith.map(entry=>entry.label)).size,4,lang+': four different entries');
   assert.equal(smith[0].mark,false);assert.equal(herbalist[0].mark,true);
  }
  setPack('ko',ko);
  assert.deepEqual(serviceMenu('smith').map(entry=>entry.label),['대화하기','상점','장비 재련','대화 종료']);
  assert.deepEqual(serviceMenu('herbalist').map(entry=>entry.label),['대화하기','상점','대화 종료']);
 }finally{setPack('ko',ko);}
});

const tick=async(n=4)=>{for(let i=0;i<n;i++)await new Promise(resolve=>setTimeout(resolve,0));};
const armed=()=>new Promise(resolve=>setTimeout(resolve,CHOICE_ARM_MS+30));
function village(npc){
 const {document}=parseHTML('<html><body><main id="app"></main></body></html>');
 const values=new Map(),journey={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};
 const index=QUESTS.findIndex(quest=>quest.id==='M05');
 journey.setItem('v03-story-v1',JSON.stringify({quest:index,step:1,count:0,done:[]}));
 const player={position:{x:0,z:0}},visits=[],suspended=[];let leaveShop=null;
 const world={scene:{isDisposed:false},mapId:'village',terrain:{heightAt:()=>0},navigation:{free:()=>true,path:()=>null}};
 const api={world,battle:{encounters:[],combatCount:0},input:{setSuspended:on=>suspended.push(on)},getPlayer:()=>player,getController:()=>null,
  creditGold:(_source,n)=>n,addPotions:n=>n,toast(){},
  openTownShop:(id,view)=>{visits.push([id,view]);return new Promise(resolve=>{leaveShop=resolve;});}};
 const story=createStory({api,doc:document,save:{journey,touch:()=>true},content:{QUESTS,NPCS,DIALOGUES},
  createVisual:()=>({place(x,y,z){this.position={x,y,z};},dispose(){}})});
 story.start();
 const frame=()=>story.update(1/60,{ready:true,mapId:'village',character:'warrior-v3'});
 frame();
 const stand=story.castVisual(npc);Object.assign(player.position,{x:stand.position.x,z:stand.position.z});frame();
 const menu=()=>document.querySelector('.v03-dialogue-choices');
 return {document,story,visits,suspended,menu,entries:()=>[...menu().querySelectorAll('.v03-dialogue-choice')],closeShop:()=>leaveShop?.()};
}

test('the smith: talk, shop and tempering each return to the menu, and only "end the talk" leaves it',async()=>{
 setPack('ko',ko);
 const v=village('smith');
 try{
  assert.equal(v.story.near,true);
  v.document.querySelector('.v03-prompt').click();
  assert.equal(v.story.dialogueOpen,true);assert.equal(v.menu().hidden,false);
  assert.deepEqual(v.entries().map(node=>node.textContent),['대화하기','상점','장비 재련','대화 종료']);
  const hello=DIALOGUES['smith-menu'][0].text,said=()=>v.document.querySelector('.v03-sr-only').textContent;
  assert.equal(said(),hello,'the greeting is said above the buttons');assert.equal(v.document.querySelector('.v03-dialogue-text').hidden,false);
  assert.equal(v.document.querySelector('.v03-dialogue-who').textContent,'대장장이');
  assert.match(v.document.querySelector('.v03-dialogue-portrait').getAttribute('src')??'',/portraits\/driver\.webp$/,'the smith is pictured');
  assert.deepEqual(v.suspended,[true],'play input waits while the menu is up');assert.deepEqual(v.visits,[],'no shop opens by itself');
  // Shop, then back to the menu when it closes.
  await armed();v.entries()[1].click();await tick();
  assert.deepEqual(v.visits,[['smith','shop']]);assert.equal(v.menu().hidden,true,'the menu is away while the shop is open');
  v.closeShop();await tick();assert.equal(v.menu().hidden,false);assert.equal(v.entries().length,4);assert.equal(said(),hello,'the same greeting again');
  // Tempering.
  await armed();v.entries()[2].click();await tick();
  assert.deepEqual(v.visits,[['smith','shop'],['smith','forge']]);
  v.closeShop();await tick();assert.equal(v.menu().hidden,false);
  // Talk: the lines play, then the menu again; the shop does not follow.
  // story.js plays the talk right after the pick and asks again right after the lines:
  // the window never closes in between.
  const layer=v.document.querySelector('.v03-dialogue'),hides=[];
  const own=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Object.getPrototypeOf(layer)),'hidden')??Object.getOwnPropertyDescriptor(v.document.defaultView.HTMLElement.prototype,'hidden');
  Object.defineProperty(layer,'hidden',{configurable:true,get(){return own.get.call(this);},set(value){if(value)hides.push('hidden');own.set.call(this,value);}});
  await armed();v.entries()[0].click();await tick();
  assert.equal(v.menu().hidden,true);assert.ok(v.document.querySelector('.v03-dialogue-text').textContent.length>0,'a line is shown');
  for(let i=0;i<40&&v.menu().hidden;i++){v.document.querySelector('.v03-dialogue-next').click();await tick(1);}
  assert.equal(v.menu().hidden,false,'back at the menu after the talk');assert.equal(v.visits.length,2);assert.equal(said(),hello);
  await tick();assert.deepEqual(hides,[],'no close between the pick, the lines and the choices');assert.equal(layer.hidden,false);
  // The last entry ends it.
  await armed();v.entries()[3].click();await tick();
  assert.equal(v.story.dialogueOpen,false);assert.equal(v.suspended.at(-1),false,'play input is back');
  assert.equal(v.visits.length,2);
 }finally{v.story.dispose();}
});

test('the herbalist: talk, shop, end; Escape ends the talk from the keyboard',async()=>{
 setPack('ko',ko);
 const v=village('herbalist');
 try{
  v.document.querySelector('.v03-prompt').click();
  assert.deepEqual(v.entries().map(node=>node.textContent),['대화하기','상점','대화 종료']);
  assert.equal(v.document.querySelector('.v03-sr-only').textContent,DIALOGUES['herbalist-menu'][0].text);
  await armed();v.entries()[1].click();await tick();
  assert.deepEqual(v.visits,[['herbalist','shop']]);v.closeShop();await tick();
  await armed();
  const event=new (v.document.defaultView.Event)('keydown',{bubbles:true,cancelable:true});Object.defineProperty(event,'code',{value:'Escape'});
  v.document.dispatchEvent(event);await tick();
  assert.equal(v.story.dialogueOpen,false);assert.equal(v.suspended.at(-1),false);
 }finally{v.story.dispose();}
});

test('someone with no services talks at once, as before; leaving the map closes an open menu',async()=>{
 setPack('ko',ko);
 const plain=village('youth');
 try{
  plain.document.querySelector('.v03-prompt').click();
  assert.equal(plain.story.dialogueOpen,true);assert.equal(plain.menu().hidden,true,'no menu for the youth');
  assert.ok(plain.document.querySelector('.v03-dialogue-text').textContent.length>0);
 }finally{plain.story.dispose();}
 const v=village('smith');
 v.document.querySelector('.v03-prompt').click();assert.equal(v.menu().hidden,false);
 v.story.dispose();await tick();
 assert.deepEqual(v.visits,[]);
});

test('main.js and the town services pass the chosen view through to the shop',()=>{
 const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 assert.match(main,/openTownShop:\(id,view\)=>townServices\?\.openShop\(id,view\)/);
 const services=readFileSync(new URL('../src/v03/town-services.js',import.meta.url),'utf8');
 assert.match(services,/shop\.show\(id,view\)/);
});
