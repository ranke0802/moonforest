// 2026-11-26 (audit "화면·조작", idea 12): first-run title clarity, the
// accessibility group (text size, reduced motion, vibration), dev-only test
// buttons and the HUD blur A/B switch.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {setTimeout as delay} from 'node:timers/promises';
import ko from '../src/v03/locales/ko.js';
import en from '../src/v03/locales/en.js';
import ja from '../src/v03/locales/ja.js';
import vi from '../src/v03/locales/vi.js';
import zh from '../src/v03/locales/zh.js';
import {useLanguage,t,writeLanguage} from '../src/v03/i18n.js';
import {createTitleScreen} from '../src/v03/title-screen.js';
import {A11Y_KEY,setupAccessibility,setAccessibility,disposeAccessibility,reducedMotion,vibrationAllowed,textScale,vibrate,mountAccessibilitySettings,readAccessibility} from '../src/v03/accessibility.js';
import {createHudBlurDiagnostic,HUD_BLUR_KEY} from '../src/v03/hud-blur-diagnostic.js';
import {mountDevControls,devControlsHidden} from '../src/v03/dev-controls.js';
import {setupSummonPanel} from '../src/summon-panel.js';
import {createDrawingVeil} from '../src/v03/drawing-veil.js';
import {setupV03} from '../src/v03/boot.js';
import {createSaveSession,writeSlotMeta,slotStorage} from '../src/v03/save-slots.js';
import {questKey} from '../src/v03/chapter-progress.js';
import {setTypewriterEnabled} from '../src/v03/typewriter.js';

const PACKS={ko,en,ja,vi,zh};
const KEYS=['menu.continue','menu.continueAria','settings.a11y','settings.a11yText','settings.a11yTextNormal','settings.a11yTextLarge','settings.a11yMotion','settings.a11yMotionSystem','settings.a11yOn','settings.a11yOff','settings.a11yMotionNote','settings.a11yVibration','settings.hudBlurOff','settings.hudBlurNote'];
const edition='moonforest-0.3',noop=()=>{},turn=()=>new Promise(resolve=>setImmediate(resolve));
function memory(){const data=new Map();return {get length(){return data.size;},key:i=>[...data.keys()][i],getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k),snapshot:()=>Object.fromEntries(data)};}
// A media query the test can flip.
function device(reduce=false){const query=new EventTarget();query.matches=reduce;return {query,view:{matchMedia:()=>query,location:{search:''}},flip(matches){query.matches=matches;query.dispatchEvent(Object.assign(new Event('change'),{matches}));}};}
const page=(markup='<main id="app"></main>')=>parseHTML('<html lang="ko"><head></head><body>'+markup+'</body></html>');
const click=(node,window)=>node.dispatchEvent(new window.Event('click',{bubbles:true}));
const change=(node,window,value)=>{if(value!==undefined){if(node.type==='checkbox')node.checked=value;else for(const option of node.options)if(option.value===value)option.selected=true;}node.dispatchEvent(new window.Event('change',{bubbles:true}));};

test('every new text exists in all five languages',()=>{
 for(const [lang,pack] of Object.entries(PACKS))for(const key of KEYS)assert.ok(typeof pack.ui[key]==='string'&&pack.ui[key].length,lang+': '+key);
 for(const [lang,pack] of Object.entries(PACKS))assert.ok(pack.ui['menu.continueAria'].includes('{record}'),lang);
 // Every title entry says something different (en/ja/vi/zh had 불러오기 as "Continue" before 이어하기 existed).
 for(const [lang,pack] of Object.entries(PACKS)){const words=['continue','new','load','gallery','settings','quit'].map(k=>pack.ui['menu.'+k]??ko.ui['menu.'+k]);assert.equal(new Set(words).size,words.length,lang+': '+words.join(' / '));}
});

for(const id of ['ko','vi']){
 test('title menu in '+id+': no record → 새로하기 first and no continue; a record → 이어하기 first, naming it',async t0=>{
  await useLanguage(id);t0.after(()=>useLanguage('ko'));
  const {document}=page();let record=null;
  const title=createTitleScreen({doc:document,wait:()=>Promise.resolve(),continued:()=>record,describe:()=>({title:'Q-'+id,place:t('place.warrior-v3')})});
  title.show();
  const items=()=>[...title.element.querySelectorAll('.v03-menu-item')];
  assert.equal(items()[0].dataset.action,'new');assert.equal(items()[0].textContent,t('menu.new'));
  assert.equal(title.element.querySelector('[data-action="continue"]'),null,'no record: nothing to continue');
  assert.deepEqual(items().map(b=>b.dataset.action),['new','load','gallery','settings','quit'],'chapter select is never first');
  record={slot:2,used:true,chapter:1,level:3,playSeconds:60};title.show();
  const first=items()[0];
  assert.equal(first.dataset.action,'continue');
  assert.equal(first.querySelector('.v03-menu-label').textContent,t('menu.continue'));
  const detail=first.querySelector('.v03-menu-detail').textContent;
  assert.ok(detail.includes('Q-'+id)&&detail.includes(t('place.warrior-v3'))&&detail.includes('1'),detail);
  assert.equal(first.getAttribute('aria-label'),t('menu.continueAria',{record:detail}));
  assert.deepEqual(items().map(b=>b.dataset.action),['continue','new','load','gallery','settings','quit']);
  // The record is gone (wiped): continue goes away again on the next show.
  record=null;title.show();assert.equal(items()[0].dataset.action,'new');
  title.dispose();
 });
}

test('reducedMotion() follows the device by default; on/off override it; cached, no storage reads per call',t0=>{
 const {document}=page(),root=document.documentElement,d=device(false),store=memory();
 let reads=0;const counted={getItem:k=>{reads++;return store.getItem(k);},setItem:store.setItem};
 setupAccessibility({doc:document,view:d.view,storage:counted});t0.after(disposeAccessibility);
 assert.equal(reducedMotion(),false);assert.equal(root.dataset.mfMotion,undefined);
 d.flip(true);assert.equal(reducedMotion(),true);assert.equal(root.dataset.mfMotion,'reduce');
 setAccessibility({motion:'off'});assert.equal(reducedMotion(),false,'explicit off wins over the device');assert.equal(root.dataset.mfMotion,undefined);
 d.flip(false);setAccessibility({motion:'on'});assert.equal(reducedMotion(),true,'explicit on wins over the device');
 setAccessibility({motion:'system'});assert.equal(reducedMotion(),false);
 const before=reads;for(let i=0;i<1000;i++){reducedMotion();vibrationAllowed();textScale();}
 assert.equal(reads,before,'no storage reads per frame');
});

test('settings round-trip: set → stored in one key → re-applied at the next boot → root carries the variable',t0=>{
 const {document,window}=page('<div class="settings-sections"><details class="settings-section"><summary>화면</summary><div class="settings-section-body"><div class="settings-display-options"></div></div></details><details class="settings-section"><summary>성능 진단</summary></details></div>');
 const store=memory(),host=document.querySelector('.settings-sections');
 setupAccessibility({doc:document,view:device(false).view,storage:store});t0.after(disposeAccessibility);
 const group=mountAccessibilitySettings({doc:document,host,t,vibration:true});
 assert.equal(host.children[1],group.element,'접근성 comes right after 화면');
 assert.equal(group.element.querySelector('summary').textContent,'접근성');
 assert.equal(group.element.className,'settings-section mf-a11y','same look as the other groups');
 const text=group.element.querySelector('select[data-a11y="text"]'),motion=group.element.querySelector('select[data-a11y="motion"]'),buzz=group.element.querySelector('input[data-a11y="vibration"]');
 assert.deepEqual([...text.options].map(o=>o.textContent),['보통','크게']);
 assert.deepEqual([...motion.options].map(o=>o.textContent),['기기 설정 따름','켜짐','꺼짐']);
 assert.equal(motion.value,'system');assert.equal(buzz.checked,true);
 change(text,window,'large');change(motion,window,'on');change(buzz,window,false);
 assert.deepEqual(JSON.parse(store.getItem(A11Y_KEY)),{text:'large',motion:'on',vibration:false});
 assert.deepEqual(Object.keys(store.snapshot()),[A11Y_KEY],'one key');
 assert.equal(document.documentElement.dataset.mfText,'large');assert.equal(document.documentElement.style.getPropertyValue('--mf-text-scale'),'1.15');
 group.dispose();disposeAccessibility();
 assert.equal(document.documentElement.dataset.mfText,undefined);
 // Next page: read back before anything is drawn.
 const next=page();setupAccessibility({doc:next.document,view:device(false).view,storage:store});
 assert.equal(next.document.documentElement.dataset.mfText,'large');assert.equal(next.document.documentElement.style.getPropertyValue('--mf-text-scale'),'1.15');
 assert.equal(next.document.documentElement.dataset.mfMotion,'reduce');assert.equal(textScale(),1.15);assert.equal(vibrationAllowed(),false);
 // A broken value falls back to the defaults.
 store.setItem(A11Y_KEY,'{"text":"huge","motion":7}');assert.deepEqual(readAccessibility(store),{text:'normal',motion:'system',vibration:true});
});

test('vibration: every call goes through vibrate(), which honours the switch',t0=>{
 const {document}=page(),calls=[],nav={vibrate:p=>{calls.push(p);return true;}};
 setupAccessibility({doc:document,view:device(false).view,storage:memory()});t0.after(disposeAccessibility);
 assert.equal(vibrate(30,nav),true);setAccessibility({vibration:false});assert.equal(vibrate(30,nav),false);assert.deepEqual(calls,[30]);
 assert.equal(vibrate(30,{}),false,'no vibration API: nothing happens');
 // No game code calls navigator.vibrate directly (also not as navigator?.vibrate?.()).
 for(const file of ['src/main.js','src/v03/boot.js','src/v03/story.js','src/v03/play-hud.js','src/v03/great-attack-fx.js'])assert.doesNotMatch(readFileSync(file,'utf8'),/navigator\??\.vibrate/,file);
 // The Starfall impact buzz goes through vibrate() (great-attack-fx.js).
 assert.match(readFileSync('src/v03/great-attack-fx.js','utf8'),/vibrate\(55,view\.navigator\)/);
 // The switch is in the group, on by default, and turning it off silences vibrate().
 setAccessibility({vibration:true});calls.length=0;
 const {document:d2,window:w2}=page('<div class="settings-sections"></div>'),host=d2.querySelector('.settings-sections');
 const group=mountAccessibilitySettings({doc:d2,host,t});const box=group.element.querySelector('input[data-a11y="vibration"]');
 assert.ok(box);assert.equal(box.checked,true);
 change(box,w2,false);assert.equal(vibrationAllowed(),false);assert.equal(vibrate(55,nav),false);assert.deepEqual(calls,[]);
 change(box,w2,true);assert.equal(vibrate(55,nav),true);assert.deepEqual(calls,[55]);group.dispose();
});

test('reduced motion: the title veil tap is one soft glow (no ring, no motes); full motion keeps them',t0=>{
 const {document,window}=page('<section id="t"></section>');
 const animated=[];window.HTMLElement.prototype.animate=function(frames){animated.push({node:this,frames});return {cancel(){}};};
 setupAccessibility({doc:document,view:device(false).view,storage:memory()});t0.after(disposeAccessibility);
 const veil=createDrawingVeil({doc:document,mount:document.getElementById('t'),random:()=>.5});t0.after(()=>veil.dispose());
 veil.start();
 const tap=()=>{const e=new window.Event('pointerdown');e.pointerType='mouse';e.button=0;e.clientX=50;e.clientY=40;veil.element.dispatchEvent(e);};
 tap();const full=animated.length;assert.ok(full>2,'flash, ring and motes');
 animated.length=0;setAccessibility({motion:'on'});tap();
 assert.equal(animated.length,1,'only the glow');assert.ok(Math.max(...animated[0].frames.map(f=>f.opacity))<=.45,'soft, not a flash');
 delete window.HTMLElement.prototype.animate;
});

test('reduced motion: Starfall windup keeps its slow motion but no zoom and no focus lines',async t0=>{
 const {createStory}=await import('../src/v03/story.js');
 const {WarriorV2Controller,V2_HOLD_SECONDS}=await import('../src/warrior-v2.js');
 const {GREAT_ATTACK_SLOW}=await import('../src/v03/great-attack.js');
 const durations={idle:2,run:1,attack:3,slash:1.5,judgment:4.33,shieldPush:2.37,dodge:2.46,knockdown:1.7,getUp:2};
 const heavy=()=>{const c=new WarriorV2Controller({durations});c.greatAttackLevel=1;c.setAttackHeld(true);c.update(V2_HOLD_SECONDS);return c;};
 const {document}=parseHTML('<main id="app"></main>');
 setupAccessibility({doc:document,view:device(false).view,storage:memory()});t0.after(disposeAccessibility);
 setAccessibility({motion:'on'});
 const camera=Object.assign(Object.create({get screenArea(){return 10;}}),{fov:.85,alpha:1,beta:2,radius:8});
 const controller=heavy(),world={mapId:'great-plains',camera},battle={encounters:[],combatCount:0};
 const save={journey:{getItem(){return null;},setItem(){}},touch(){}};
 const story=createStory({api:{world,battle,input:{setSuspended(){}},getPlayer:()=>null,getController:()=>controller},doc:document,save,content:{QUESTS:[],NPCS:[],DIALOGUES:{}},createGuide:null,createMarkers:null,slowFx:{value:{on:true,everywhere:true,zoom:.3,lines:true,seconds:.7}}});
 t0.after(()=>story.dispose());
 let now=1000;t0.mock.method(performance,'now',()=>now);
 story.start();for(let i=0;i<8;i++){now+=50;story.update(.05,{ready:true,mapId:'great-plains'});}
 assert.ok(Math.abs(story.timeScale-GREAT_ATTACK_SLOW)<1e-7,'slow motion is gameplay: it stays');
 assert.equal(camera.fov,.85,'no push-in');
 assert.equal(document.querySelector('.v03-focus')?.classList.contains('is-on')??false,false,'no focus lines');
 // Back to full motion: the push-in returns on the same windup.
 setAccessibility({motion:'off'});for(let i=0;i<4;i++){now+=50;story.update(.05,{ready:true,mapId:'great-plains'});}
 assert.ok(camera.fov<.85);
});

test('reduced motion: the wagon jolt, the slow push-in and the focus lines are gated in story.js; CSS covers the flashes',()=>{
 const story=readFileSync('src/v03/story.js','utf8');
 assert.match(story,/const jolt=scene\.shake>0&&!reducedMotion\(\)\?/);
 assert.match(story,/hud\.setFocus\(target===1&&!calm&&/);
 assert.match(story,/camera\.fov=calm\?zoom\.base:/);
 const css=readFileSync('src/v03/accessibility.css','utf8');
 for(const rule of ['.v03-opening.is-flash .v03-opening-flash{opacity:.3}','.v03-opening .v03-opening-flash{transition:opacity 1.2s ease!important}','.v03-opening-focus{display:none!important}','.v03-wake-veil{animation:mf-soft-fade','.v03-focus{display:none}','.v03-veil-dot{animation:none','transition-duration:.01s!important'])assert.ok(css.includes(rule),rule);
 assert.match(readFileSync('src/v03/index.js','utf8'),/import '\.\/accessibility\.css';/);
 assert.match(readFileSync('src/v03/riding-gallop-trail.js','utf8'),/onAccessibilityChange\(motionChanged\)/);
});

test('text size: one root variable drives the zoom rule; nested text is not zoomed twice',()=>{
 const css=readFileSync('src/v03/accessibility.css','utf8');
 assert.equal((css.match(/zoom:var\(--mf-text-scale,1\)/g)||[]).length,2);
 assert.match(css,/:not\(:is\(p,span,small,strong,b,em,label,summary,button,h1,h2,h3,h4,li,dt,dd,output,select,legend,th,td,a,cite\) \*\)/);
});

test('dev-only test buttons: absent from a public 0.3 page, present with ?dev=1; 0.2 keeps its buttons',()=>{
 const markup=readFileSync('moonforest-0.3.html','utf8');
 const make=search=>{const {document,window}=parseHTML(markup);Object.defineProperty(window,'location',{value:{search},configurable:true});return {document,window};};
 const pub=make('');mountDevControls(pub.document,pub.window);
 for(const id of ['hit-button','death-button','death-label','death-key'])assert.equal(pub.document.getElementById(id),null,id);
 assert.equal(pub.document.querySelector('.secondary-actions'),null);assert.equal(pub.document.querySelector('template[data-dev-only]'),null);
 assert.equal(devControlsHidden(),true,'public page: the summon button is not built either');
 // The summon dialog stays (boss controls), without its open button.
 {const {document:d}=parseHTML('<main id="app"><div class="top-actions"><button id="motion-speed-toggle"></button></div><div class="right-tools"></div><div id="boss-controls"></div></main>');
  const saved=globalThis.document;globalThis.document=d;try{setupSummonPanel({openButton:false});}finally{globalThis.document=saved;}
  assert.equal(d.getElementById('open-summon'),null);assert.ok(d.getElementById('summon-dialog')?.querySelector('#boss-controls'));}
 const dev=make('?dev=1');assert.equal(mountDevControls(dev.document,dev.window),1);
 assert.ok(dev.document.getElementById('hit-button'));assert.ok(dev.document.getElementById('death-button'));assert.equal(devControlsHidden(),false);
 assert.equal(dev.document.querySelector('.action-controls .secondary-actions')?.parentElement?.className,'action-controls');
 const v02=readFileSync('moonforest-0.2.html','utf8');assert.match(v02,/id="hit-button"/);assert.doesNotMatch(v02,/data-dev-only/);
 // The shared code tolerates their absence.
 const main=readFileSync('src/main.js','utf8');
 assert.match(main,/^import \{devControlsHidden\} from '\.\/v03\/dev-controls\.js';/);
 assert.match(main,/setupSummonPanel\(\{openButton:!devControlsHidden\(\)\}\)/);
 assert.match(main,/if\(\$\('#open-summon'\)\)\{/);
 assert.match(main,/'#guard-button', '#dodge-button'\]\.map\(\$\)\.filter\(Boolean\)/);
 assert.match(main,/\$\('#hit-button'\)\?\.addEventListener/);assert.match(main,/\$\('#death-button'\)\?\.addEventListener/);
 assert.match(main,/if\(\$\('#death-button'\)\)\{/);assert.match(main,/if\(\$\('\.secondary-actions'\)\)\{/);
 assert.match(readFileSync('src/settings-panel.js','utf8'),/body\.append\(\.\.\.nodes\.filter\(Boolean\)\)/);
});

test('HUD blur A/B: the switch and ?hudblur=0 set the attribute; the record metadata tells the two apart',()=>{
 const {document,window}=page('<div id="frame-diagnostics-options"><label><input id="frame-diagnostics-toggle" type="checkbox"> FPS</label></div>');
 const store=memory(),view={location:{search:''}};
 const blur=createHudBlurDiagnostic({doc:document,view,storage:store});
 assert.equal(document.documentElement.dataset.mfHudBlur,undefined);assert.deepEqual(blur.metadata(),{hudBlur:'on'});
 blur.mount({host:document.getElementById('frame-diagnostics-options'),t});
 const box=document.getElementById('v03-hud-blur-toggle');assert.equal(box.parentElement.textContent.trim(),'조작 버튼 뒤 흐림 끄기 (진단)');
 change(box,window,true);assert.equal(document.documentElement.dataset.mfHudBlur,'off');assert.deepEqual(blur.metadata(),{hudBlur:'off'});assert.equal(store.getItem(HUD_BLUR_KEY),'1');
 change(box,window,false);assert.equal(document.documentElement.dataset.mfHudBlur,undefined);
 const url=page();createHudBlurDiagnostic({doc:url.document,view:{location:{search:'?hudblur=0'}},storage:memory()});assert.equal(url.document.documentElement.dataset.mfHudBlur,'off');
 const css=readFileSync('src/v03/accessibility.css','utf8');
 assert.ok(css.includes('html[data-edition="moonforest-0.3"][data-mf-hud-blur="off"] #app :is(.action-controls .action-button,.joystick-rim,.joystick-ghost){-webkit-backdrop-filter:none!important;backdrop-filter:none!important}'));
 assert.match(readFileSync('src/main.js','utf8'),/previousRun:world\?\.v03\?\.previousRun\?\?null,\.\.\.world\?\.v03\?\.recordMetadata\?\.\(\),/);
});

// ----- through the real 0.3 boot -----
async function game(t0,{local=memory(),prefs=memory(),search=''}={}){
 const {document,window}=parseHTML('<html><body><main id="app"><canvas id="viewport"></canvas><dialog id="motion-speed-dialog"><header></header><div class="settings-sections"><details class="settings-section"><summary>화면</summary><div class="settings-section-body"><div class="settings-display-options"></div></div></details><details class="settings-section"><summary>성능 진단</summary><div class="settings-section-body"><div id="frame-diagnostics-options"><label><input id="frame-diagnostics-toggle" type="checkbox"></label></div></div></details></div></dialog></main></body></html>');
 // linkedom's <select> has no value setter (the language row sets it).
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return [...this.options].find(o=>o.selected)?.value??this.options[0]?.value??'';},set(v){for(const o of this.options)if(o.value===v)o.selected=true;}});
 Object.defineProperty(window,'location',{value:{search,href:'http://x/moonforest-0.3.html'+search,replace(){},reload(){}},configurable:true});
 const session=memory(),languageStore=memory();writeLanguage(languageStore,'ko');
 const save=createSaveSession({edition,local,session,now:()=>120});
 const state={ready:true,character:'warrior-v3',mapId:'village'},player={position:{x:0,z:0}};
 setTypewriterEnabled(false);
 const shell=setupV03({root:document.getElementById('app'),languageStorage:languageStore,a11yStorage:prefs,save,
  battle:{encounters:[],combat:{maxHp:500,hp:500},combatCount:0,livingCount:0,summon:async()=>true,resetBattle:noop},
  world:{camera:{alpha:1,beta:1,radius:14},scene:{isDisposed:false},terrain:{heightAt:()=>0},navigation:{free:()=>true,path:()=>[]}},
  getState:()=>state,getPlayer:()=>player,getController:()=>({}),wait:async()=>{},input:{setSuspended:noop},actions:{move:noop,attack:noop,dodge:noop,guard:noop},
  createVisual:()=>({place:noop,dispose:noop}),createGuide:null,createMarkers:null,placeProps:async()=>true,resetStage:noop,startWorld:noop,stopWorld:noop,
  reloadProgress:()=>true,restartProgress:()=>true,openSettings:noop,travel:async()=>true});
 shell.story.prepareOpeningCast=async map=>shell.story.prepare(map);
 t0.after(()=>shell.dispose());
 for(let i=0;i<5;i++){await turn();shell.update(.4);}await turn();
 assert.equal(shell.screen,'title');
 return {shell,document,window,save};
}

test('boot: the stored choices are on the root when the title shows; the settings group and the blur switch are mounted',async t0=>{
 await useLanguage('ko');
 const prefs=memory();prefs.setItem(A11Y_KEY,JSON.stringify({text:'large',motion:'on',vibration:true}));
 const h=await game(t0,{prefs,search:'?hudblur=0'}),root=h.document.documentElement;
 assert.equal(root.dataset.mfText,'large');assert.equal(root.style.getPropertyValue('--mf-text-scale'),'1.15');assert.equal(root.dataset.mfMotion,'reduce');
 assert.equal(root.dataset.mfHudBlur,'off');assert.deepEqual(h.shell.recordMetadata(),{hudBlur:'off'});
 const dialog=h.document.getElementById('motion-speed-dialog');
 // The game's settings dialog gets the language row, the combat FX, the accessibility group and the blur switch.
 assert.ok(dialog.querySelector('#v03-accessibility-settings'),'접근성 group');
 assert.ok(dialog.querySelector('#v03-hud-blur-toggle'),'blur switch in 성능 진단');
 h.shell.dispose();assert.equal(root.dataset.mfText,undefined);assert.equal(root.dataset.mfHudBlur,undefined);
});

test('boot: no record → 새로하기 first; a record → 이어하기 first, and it continues that record without the pickers',async t0=>{
 await useLanguage('ko');
 const empty=await game(t0);
 assert.equal(empty.document.querySelector('.v03-menu-item').dataset.action,'new');assert.equal(empty.document.querySelector('[data-action="continue"]'),null);
 empty.shell.dispose();
 const local=memory();
 writeSlotMeta(local,edition,2,{chapter:1,character:'warrior-v3',titleKey:'M00',playSeconds:500,savedAt:30,createdAt:10});
 slotStorage(local,edition,2).setItem(questKey(1),JSON.stringify({quest:1,step:0,count:0,done:[]}));
 const h=await game(t0,{local});
 const first=h.document.querySelector('.v03-menu-item');
 assert.equal(first.dataset.action,'continue');assert.match(first.textContent,/^이어하기1장 · /);assert.match(first.textContent,/숲의 경계 마을|몬트하임/);
 click(first,h.window);
 for(let i=0;i<150&&h.shell.screen!=='play';i++){await delay(4);h.shell.update(.1);}
 assert.equal(h.document.querySelector('.v03-panel').hidden,true,'no slot or chapter picker');
 assert.equal(h.shell.screen,'play');assert.equal(h.save.slot,2);
});
