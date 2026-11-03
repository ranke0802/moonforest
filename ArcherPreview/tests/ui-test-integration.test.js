import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {uiTestRoute,uiTestSelectionUrl,uiTestStorage} from '../src/ui-test-route.js';
import {UiTestJourney,UI_TEST_SAVE} from '../src/ui-test-state.js';
import {setupUiTest} from '../src/ui-test.js';
import {PlayerCombat} from '../src/player-combat.js';
import {travelUrl} from '../src/map-route.js';

const storage=()=>{const values=new Map();return {values,getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};};
test('UI-test alias enters the existing village; portals retain UI mode and production selection removes it',()=>{
 const alias=uiTestRoute('https://test.invalid/?character=ui-test&rev=123&arrival=portal&from=warrior-v5');
 assert.equal(alias.enabled,true);assert.equal(alias.character,'warrior-v3');assert.equal(alias.url.searchParams.get('rev'),'123');assert.equal(alias.url.searchParams.has('arrival'),false);
 let href=alias.url.href;for(let i=0;i<4;i++)for(const id of ['warrior-v4','warrior-v5','warrior-v4','warrior-v3']){href=travelUrl(href,id);const route=uiTestRoute(href);assert.equal(route.enabled,true);assert.equal(route.character,id);}
 const normal=uiTestSelectionUrl(href,'warrior-v5');assert.equal(uiTestRoute(normal).enabled,false);assert.equal(normal.searchParams.has('arrival'),false);
 assert.equal(uiTestRoute('https://test.invalid/?character=warrior-v5').enabled,false);
 assert.equal(uiTestSelectionUrl(normal,'ui-test').searchParams.get('character'),'warrior-v3');
});
test('test quests, gold and positions cannot overwrite production storage',()=>{
 const raw=storage();for(const key of [UI_TEST_SAVE,'moonforest-gold-v1','moonforest-map-position-v1'])raw.setItem(key,'production');
 const testStore=uiTestStorage(raw);assert.equal(testStore.getItem('moonforest-map-position-v1'),null);
 testStore.setItem('moonforest-map-position-v1','test position');testStore.setItem('moonforest-gold-v1','20');const journey=new UiTestJourney(testStore);journey.accept();journey.learn();journey.reset();
 for(const key of [UI_TEST_SAVE,'moonforest-gold-v1','moonforest-map-position-v1'])assert.equal(raw.getItem(key),'production');
 testStore.removeItem('moonforest-gold-v1');assert.equal(raw.getItem('moonforest-gold-v1'),'production');
});
test('quest rewards are one-time, reload safely, and invalid stored fields cannot inject markup',()=>{
 const saved=storage(),journey=new UiTestJourney(saved);assert.equal(journey.collect(),false);assert.equal(journey.turnIn(),false);journey.accept();
 for(let i=0;i<4;i++)assert.equal(journey.collect(),true);assert.equal(journey.collect(),false);assert.equal(journey.turnIn(),true);assert.equal(journey.turnIn(),false);
 assert.equal(journey.learn(),true);assert.equal(journey.learn(),false);journey.prepareIron();assert.equal(journey.turnInIron(),true);assert.equal(journey.turnInIron(),false);
 assert.equal(journey.value.xp,250);assert.equal(journey.value.pie,4);const restored=new UiTestJourney(saved);assert.deepEqual(restored.value,journey.value);assert.equal(restored.accept(),false);
 saved.setItem(UI_TEST_SAVE,JSON.stringify({version:1,pie:-3,apple:999,xp:'<img>',tracked:'__proto__',clue:'yes'}));const clean=new UiTestJourney(saved);assert.equal(clean.value.pie,0);assert.equal(clean.value.apple,4);assert.equal(clean.value.xp,0);assert.equal(clean.value.tracked,'main');assert.equal(clean.value.clue,false);
 assert.doesNotThrow(()=>{const j=new UiTestJourney({getItem(){throw Error();},setItem(){throw Error();}});j.accept();j.reset();});
});

function fixture(t){
 const {document,window}=parseHTML('<html><body><main id="app"><canvas id="viewport"></canvas><div class="top-actions"><button id="fullscreen-button">전체화면</button><button id="open-summon">소환</button></div><div class="action-controls"><button id="attack-button">공격</button><button id="dodge-button">회피</button></div><dialog id="motion-speed-dialog"><div class="settings-sections"></div></dialog></main></body></html>');
 const create=document.createElement.bind(document);
 function modal(node){Object.defineProperty(node,'open',{get(){return this.hasAttribute('open');}});node.showModal=function(){this.setAttribute('open','');};node.close=function(){this.removeAttribute('open');this.dispatchEvent(new window.Event('close'));};return node;}
 document.createElement=(name,...args)=>name==='dialog'?modal(create(name,...args)):create(name,...args);modal(document.getElementById('motion-speed-dialog'));
 const combat=new PlayerCombat(),state={ready:true,character:'warrior-v3'},counters={pause:0,reset:0,settings:0,heal:0};
 const root=document.getElementById('app'),attack=document.getElementById('attack-button'),saved=storage();
 const control=setupUiTest({root,storage:saved,getState:()=>state,heal(amount){counters.heal++;const gained=Math.min(amount,combat.maxHp-combat.hp);combat.hp+=gained;return gained;},prepareHealing(){combat.hp=Math.max(1,combat.hp-120);return true;},resetInput(){counters.reset++;},onPauseChange(){counters.pause++;},openSettings(){counters.settings++;document.getElementById('motion-speed-dialog').showModal();}});
 t.after(()=>control.dispose());
 const dialog=document.getElementById('ui-test-dialog');
 const click=(action,key)=>{const node=(dialog.open?dialog:root).querySelector(`[data-uit-action="${action}"]${key?`[data-key="${key}"]`:''}`);assert.ok(node,`button ${action}/${key}`);assert.equal(node.disabled,false);node.dispatchEvent(new window.Event('click',{bubbles:true}));};
 const key=code=>{const event=new window.Event('keydown',{bubbles:true,cancelable:true});event.code=code;root.dispatchEvent(event);return event;};
 return {control,root,document,window,dialog,combat,state,counters,saved,attack,click,key};
}
test('live DOM dialogue → four pickups → turn-in → clue → inventory heal uses a real health pool',t=>{
 const f=fixture(t);assert.equal(f.document.getElementById('attack-button'),f.attack);
 f.click('dialogue');assert.equal(f.control.isOpen(),true);assert.equal(f.counters.reset,1);f.click('accept');assert.equal(f.control.isOpen(),false);
 for(let i=0;i<4;i++)f.click('collect');assert.equal(f.control.inspect().apple,4);
 f.click('dialogue');f.click('turn-in');assert.equal(f.control.inspect().pie,4);assert.equal(f.control.inspect().xp,70);
 f.click('learn');assert.equal(f.control.inspect().clue,true);assert.match(f.dialog.textContent,/교회 문장 붕대/);f.click('close');
 f.click('menu');f.click('scenarios');f.click('prepare-heal');assert.equal(f.combat.hp,380);f.click('close');
 f.click('inventory');f.click('use-pie');assert.equal(f.combat.hp,500);assert.equal(f.control.inspect().pie,3);
 f.click('use-pie');assert.equal(f.control.inspect().pie,3,'full HP does not consume food');
 f.click('quick');assert.equal(f.control.inspect().quick,true);f.click('close');f.combat.hp=490;f.key('KeyZ');assert.equal(f.combat.hp,500);assert.equal(f.control.inspect().pie,2);
 assert.equal(f.control.inspect().xp,170);assert.equal(f.document.getElementById('attack-button'),f.attack);
});
test('inventory filters, quest tracking, smith delivery, title reset and settings are interactive',t=>{
 const f=fixture(t);f.click('inventory');f.click('filter','equipment');assert.match(f.dialog.textContent,/장착 중인 검/);f.click('settings');assert.equal(f.counters.settings,1);assert.equal(f.control.isOpen(),false);f.document.getElementById('motion-speed-dialog').close();
 f.click('menu');f.click('scenarios');f.click('prepare-iron');f.click('turn-in-iron');assert.equal(f.control.inspect().smithDone,true);f.click('quest','apple');f.click('track');assert.equal(f.control.inspect().tracked,'apple');
 f.click('menu');f.click('title');f.click('reset-confirm');assert.match(f.dialog.textContent,/기존 플레이 기록/);f.click('reset');assert.equal(f.control.inspect().xp,0);assert.equal(f.control.inspect().pie,2);
 const setting=f.document.getElementById('uit-large-text');setting.checked=true;setting.dispatchEvent(new f.window.Event('change'));assert.equal(f.root.dataset.uiText,'large');assert.equal(new UiTestJourney(f.saved).value.largeText,true);
});
test('dialogs reset held input, preserve J attack binding, guard loading/other modals, and do not replace combat nodes',t=>{
 const f=fixture(t);assert.equal(f.key('KeyJ').defaultPrevented,false);assert.equal(f.key('KeyQ').defaultPrevented,false);f.key('KeyL');assert.equal(f.control.isOpen(),true);assert.equal(f.key('KeyZ').defaultPrevented,false);f.key('Escape');assert.equal(f.control.isOpen(),false);
 f.state.ready=false;f.click('dialogue');assert.equal(f.control.isOpen(),false);f.state.ready=true;
 f.document.getElementById('motion-speed-dialog').showModal();f.key('KeyL');assert.equal(f.control.isOpen(),false);f.document.getElementById('motion-speed-dialog').close();
 for(let i=0;i<25;i++){f.click('inventory');f.click('close');f.state.character=i%2?'warrior-v5':'warrior-v4';f.control.update(i);}
 assert.equal(f.root.querySelectorAll('#ui-test-dialog').length,1);assert.equal(f.root.querySelectorAll('.uit-top').length,3);assert.ok(f.counters.pause>=52);assert.equal(f.document.getElementById('attack-button'),f.attack);
 f.control.dispose();assert.equal(f.root.querySelector('#ui-test-dialog'),null);assert.equal(f.root.dataset.uiTest,undefined);assert.equal(f.root.querySelectorAll('.uit-top').length,0);
});
test('UI art is used only by the isolated interface; no new async entry invalidates the engine split',()=>{
 const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8'),css=readFileSync(new URL('../src/ui-test.css',import.meta.url),'utf8');
 assert.match(main,/if\(uiTestEnabled\)\{\s*uiTest=setupUiTest/);assert.doesNotMatch(main,/import\('\.\/ui-test/);
 assert.match(main,/otherSettings=[^;\n]*uiTest\?\.isOpen\(\)/);assert.match(main,/readMapResume\(journeyStorage/);
 assert.match(css,/@media\(orientation:portrait\)/);assert.match(css,/safe-area-inset/);assert.match(css,/prefers-reduced-motion/);assert.doesNotMatch(css,/backdrop-filter/);
 const dir=new URL('../src/ui-test-art/',import.meta.url),names=readdirSync(dir),bytes=names.reduce((n,p)=>n+statSync(new URL(p,dir)).size,0);assert.ok(bytes<1_600_000);assert.ok(names.includes('LICENSE.txt'));assert.ok(!names.includes('world.webp'));
 assert.doesNotMatch(readFileSync(new URL('../src/ui-test.js',import.meta.url),'utf8'),/requestAnimationFrame|setInterval|new AudioContext|SceneLoader|new Engine/);
});
