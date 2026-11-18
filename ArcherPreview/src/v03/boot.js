// MoonForest 0.3 shell: logo → title (attract battle) → prologue → play.
// It owns no engine, scene, frame loop or timer loop: main.js calls update(dt)
// from the existing game frame, and every stage change goes through `api`.
import {createTitleScreen} from './title-screen.js';
import {createOpening} from './opening.js';
import {createAttractPilot} from './attract-pilot.js';
import {crownBoxes,clearView} from './title-camera.js';
import {createStory} from './story.js';
import {createQuestMarkers} from './quest-markers.js';
import {createCursors} from './cursors.js';
import {createOrientationGate} from './orientation-gate.js';
import {createVitalityHud} from './vitality-hud.js';
import {createActorVisual} from './placeholder-actor.js';
import {createCastVisuals} from './cast-models.js';
import {createGuideWisp} from './guide-wisp.js';
import * as chapter1 from './data/chapter1.js';
import {LANGUAGES,readLanguage,writeLanguage,useLanguage,startLanguage,language,t,cloneChapter,localizeChapter,translateTree} from './i18n.js';

// Map character → place. Saved records keep the Korean name as a fallback and
// the key (placeKey) for display in any language.
export const PLACE_NAMES=Object.freeze({'warrior-v3':'숲의 경계 마을','warrior-plains':'대평원','warrior-v4':'마물의 숲','warrior-v5':'마녀의 동굴'});
// Session flag: a language change reloads the page straight to the title.
export const SKIP_LOGO_KEY='moonforest-0.3:skip-logo';
export const TITLE_FOE=Object.freeze({kind:'wolf',count:1,hpFloor:.45});
// The first fight is one wolf: enough to learn every basic without pressure.
export const AMBUSH=Object.freeze({kind:'gray-wolf',count:1});
const GALLERY=Object.freeze([{id:'scenes',total:12},{id:'bestiary',total:14},{id:'titles',total:10}]);
export const OPENING_STAGE=chapter1.OPENING_STAGE;
const TITLE_CAMERA=Object.freeze({radius:10.5,beta:1.24,orbit:.075});

// Real cast models stay behind ?cast=1 until the review captures are approved.
const castPreview=()=>{try{return new URLSearchParams(globalThis.location?.search??'').get('cast')==='1';}catch{return false;}};
export function setupV03(api){
 const {root,save,battle,input,actions}=api,doc=root.ownerDocument,view=doc.defaultView,html=doc.documentElement;
 const wait=api.wait??(ms=>new Promise(resolve=>setTimeout(resolve,ms)));
 const pilot=createAttractPilot({random:api.random});
 const opening=createOpening({doc,wait});
 const cursors=createCursors(doc);
 // Phones play in landscape only, from the moment the language is chosen.
 const gate=createOrientationGate({doc});
 // Tekken-style health (recoverable part) for the player and monsters, in play only.
 const vitality=createVitalityHud({doc,battle});
 // Game cursors start after the splash (and its language picker) is done.
 void Promise.resolve(view?.__moonforestSplash?.done).then(()=>{if(!state.disposed)cursors.enable();});
 // Language: chosen on the first launch (inline splash) or in Settings, kept
 // across editions in localStorage. Story text is laid over a copy of the
 // chapter data once the language pack has loaded; nothing player-facing
 // appears before that (title and play wait for langReady).
 const languageStore=api.languageStorage??view?.localStorage??null,source=api.content??chapter1,content=cloneChapter(source);
 const story=createStory({api,doc,save,content,createVisual:api.createVisual??(castPreview()?createCastVisuals({getWorld:()=>api.world}):createActorVisual),createGuide:api.createGuide===undefined?createGuideWisp:api.createGuide,createMarkers:api.createMarkers===undefined?createQuestMarkers:api.createMarkers});
 // The title is revealed only once its scene is fully drawn: the attract
 // battle is in place and scenery streaming has been quiet for a moment.
 const REVEAL_QUIET=1.2,REVEAL_LIMIT=25;
 const state={screen:'boot',revealed:false,prepareTime:0,quietTime:0,attract:false,sceneShown:false,summoning:false,busy:false,disposed:false,playSeconds:save.meta().playSeconds??0,sinceSave:0,ambush:false,worldStarted:false,failed:false,langReady:false};
 const screen=value=>{state.screen=value;html.dataset.v03Screen=value;};
 const questTitle=id=>content.QUESTS?.find(quest=>quest.id===id)?.title;
 // Records written before keys were saved carry Korean text only: map it back.
 const describe=meta=>{
  const titleKey=meta.titleKey??(meta.title==='꿈'?'dream':source.QUESTS?.find(quest=>quest.title===meta.title)?.id);
  const placeKey=meta.placeKey||Object.keys(PLACE_NAMES).find(key=>PLACE_NAMES[key]===meta.place);
  return {title:titleKey==='dream'?t('meta.dream'):titleKey?questTitle(titleKey):undefined,place:placeKey?t('place.'+placeKey):undefined};
 };
 const title=createTitleScreen({doc,wait,describe,version:doc.documentElement?.dataset?.world?'MoonForest '+doc.documentElement.dataset.world:undefined,onAction:action=>{void handle(action).catch(report);}});
 // The first-launch picker lives in the splash, so the choice is read after it.
 const langReady=(api.languageStorage?Promise.resolve(view?.__moonforestSplash?.done).then(()=>useLanguage(readLanguage(languageStore)??'ko',{doc})):startLanguage(view)).then(()=>{
  if(state.disposed)return;localizeChapter(content,source);title.relabel();mountLanguageSetting();gate.enable();translateTree(doc.getElementById('app'));translateTree(doc.getElementById('loading'));mountControlsGuide();state.langReady=true;
 }).catch(error=>{console.warn('[MoonForest 0.3] language setup failed',error);state.langReady=true;});
 const splash=view?.__moonforestSplash;
 function report(error){console.error('[MoonForest 0.3]',error);api.toast?.(t('toast.failed'));state.busy=false;}
 const gameState=()=>api.getState();

 // ----- attract battle (title background) -----
 function stopAttract(){
  state.attract=false;state.crowns=null;pilot.reset();
  if(state.savedCamera){const camera=api.world.camera,saved=state.savedCamera;camera.alpha=saved.alpha;camera.beta=saved.beta;camera.radius=saved.radius;state.savedCamera=null;}
 }
 async function startAttract(){
  if(state.summoning||state.attract||state.screen!=='title')return;
  state.summoning=true;
  try{
   input.setSuspended(true);
   const ok=await battle.summon(api.getPlayer(),TITLE_FOE.count,TITLE_FOE.kind);
   if(state.screen!=='title'||state.disposed){if(ok)battle.resetBattle();return;}
   if(ok){const camera=api.world.camera;state.savedCamera={alpha:camera.alpha,beta:camera.beta,radius:camera.radius};state.attract=true;}
  }catch(error){console.warn('[MoonForest 0.3] title battle unavailable',error);}
  finally{state.summoning=false;}
 }
 function driveAttract(dt){
  const player=api.getPlayer(),controller=api.getController();if(!player||!controller)return;
  // The showcase never ends: the player is topped up and the foe cannot die,
  // so no reward, quest or defeat event can come from the title screen.
  battle.combat.hp=battle.combat.maxHp;
  let target=null;
  for(const foe of battle.encounters){
   const brain=foe.brain;if(!foe.active||!brain)continue;
   const floor=brain.maxHp*TITLE_FOE.hpFloor;if(brain.hp<floor)brain.hp=floor;
   target??=foe;
  }
  const camera=api.world.camera;
  camera.alpha+=dt*TITLE_CAMERA.orbit;
  // Tree crowns near the fight: the arm shortens instead of passing through leaves.
  const spot=player.position,crowns=state.crowns;
  if(!crowns||Math.hypot(spot.x-crowns.x,spot.z-crowns.z)>6)state.crowns={x:spot.x,z:spot.z,boxes:crownBoxes(api.world.villageRenderRecords,spot)};
  const lower=camera.lowerRadiusLimit??1,upper=camera.upperRadiusLimit??60,arm=Math.max(lower,Math.min(upper,TITLE_CAMERA.radius)),k=Math.min(1,dt*1.5);
  // Looks a little ahead along the orbit so the arm is already short on arrival;
  // under a crown the view also drops level, below the leaves.
  let wanted=arm,pitch=TITLE_CAMERA.beta;
  for(const ahead of [0,.15,.3]){const view=clearView(state.crowns.boxes,camera.target??spot,camera.alpha+ahead,TITLE_CAMERA.beta,arm,Math.max(lower,2.5));wanted=Math.min(wanted,view.radius);pitch=Math.max(pitch,view.beta);}
  const quick=Math.min(1,k*2.5);
  camera.radius+=(wanted-camera.radius)*(wanted<camera.radius?quick:k);camera.beta+=(pitch-camera.beta)*(pitch>camera.beta?quick:k);
  pilot.update(dt,{player:player.position,target:target?.actor.position??null,targetRadius:target?.radius??1,targetAttacking:target?.brain.mode==='attack',
   cameraAlpha:camera.alpha,captured:controller.captured===true,busy:controller.groggy===true||controller.dead===true,actions});
 }

 // ----- starting a game -----
 function metaPatch(extra={}){const s=gameState();return {character:s.character,place:PLACE_NAMES[s.character]??'',placeKey:PLACE_NAMES[s.character]?s.character:'',playSeconds:state.playSeconds,level:1,...extra};}
 function startWorld(){if(state.worldStarted)return;state.worldStarted=true;api.startWorld?.();}
 // Roaming monsters appear only after the opening quest: the first walk to
 // the village is safe.
 function maybeStartWorld(){if(!state.worldStarted&&story.started&&story.log.quest()?.id!=='M00')startWorld();}
 async function enterPlay({resume=false}={}){
  screen('play');input.setSuspended(false);api.wake?.();story.start({fresh:!resume});
  maybeStartWorld();
 }
 const MAP_CHARACTERS=Object.freeze({'great-plains':'warrior-plains',village:'warrior-v3','monster-forest':'warrior-v4','witch-cave':'warrior-v5'});
 async function beginNewGame(){
  // Seamless path: the title already runs on the opening map.
  state.busy=true;await title.leave();
  stopAttract();
  // The title can be on another map (a record was resumed there): travel and let the opening run after the load.
  // Travel in place first: a page reload leaves fullscreen and drops the
  // landscape lock on phones. Reload only if the in-app trip fails.
  if(OPENING_STAGE.map&&gameState().mapId!==OPENING_STAGE.map){
   let moved=false;try{moved=await api.travel?.(MAP_CHARACTERS[OPENING_STAGE.map])===true;}catch(error){console.warn('[MoonForest 0.3] opening travel failed',error);}
   if(!moved||gameState().mapId!==OPENING_STAGE.map){save.commit(metaPatch({chapter:1,title:'꿈',titleKey:'dream',playSeconds:0}));reloadInto(save.slot,'new',null);return;}
  }
  api.resetStage(OPENING_STAGE);title.hide();story.prepare(gameState().mapId);
  screen('opening');save.commit(metaPatch({chapter:1,title:'꿈',titleKey:'dream',playSeconds:0}));state.playSeconds=0;
  // Prepare the ambush behind the black stage; the simulation stays frozen
  // (blocksGame) until the dream ends, so nothing can attack early.
  state.ambush=true;
  const ambush=battle.summon(api.getPlayer(),AMBUSH.count,AMBUSH.kind).catch(error=>{console.warn('[MoonForest 0.3] ambush unavailable',error);return false;});
  await opening.play();
  const ready=await Promise.race([ambush,wait(6000).then(()=>null)]);
  if(ready===false)state.ambush=false;
  save.touch(metaPatch({title:'늑대와 마차',titleKey:'M00'}));
  await enterPlay();state.busy=false;
  await opening.release();
 }
 async function continueHere(){
  state.busy=true;await title.leave();stopAttract();api.resetStage();opening.cover();title.hide();
  const meta=save.meta(),s=gameState();
  await enterPlay({resume:true});
  if(meta.character&&meta.character!==s.character&&PLACE_NAMES[meta.character])await api.travel(meta.character);
  state.busy=false;await opening.release();
 }
 function reloadInto(slot,mode,character){
  if(!save.request(slot,mode)){api.toast?.(t('toast.noStorage'));return false;}
  const url=new URL(view.location.href);for(const key of ['arrival','from'])url.searchParams.delete(key);
  if(character&&PLACE_NAMES[character])url.searchParams.set('character',character);else url.searchParams.delete('character');
  view.location.replace(url.href);return true;
 }
 async function handle(action){
  if(state.busy||state.screen!=='title'||!state.revealed)return;
  const index=save.index(),ready=gameState().ready;
  if(action==='new'){
   const anyUsed=index.some(meta=>meta.used);
   let slot=save.slot;
   if(anyUsed){slot=await title.chooseSlot({mode:'new',index,bootSlot:save.slot});if(slot===null)return;}
   const meta=index[slot-1];
   if(meta.used){
    const ok=await title.confirm({title:t('confirm.overwriteTitle'),message:t('confirm.overwrite',{slot}),accept:t('confirm.overwriteAccept')});if(!ok)return;
    if(!save.wipe(slot)){api.toast?.(t('toast.wipeFailed'));return;}
    reloadInto(slot,'new',null);return;
   }
   if(slot!==save.slot){reloadInto(slot,'new',null);return;}
   if(!ready){api.toast?.(t('toast.preparing'));return;}
   await beginNewGame();
  }else if(action==='load'){
   const slot=await title.chooseSlot({mode:'load',index,bootSlot:save.slot});if(slot===null)return;
   const meta=index[slot-1];if(!meta.used)return;
   if(slot!==save.slot){reloadInto(slot,'load',meta.character);return;}
   if(!ready){api.toast?.(t('toast.preparing'));return;}
   await continueHere();
  }else if(action==='gallery'){
   await title.showGallery({sections:GALLERY.map(section=>({...section,label:t('gallery.'+section.id),unlocked:0}))});
  }else if(action==='settings'){
   const choice=await title.showSettings({languages:LANGUAGES,current:language()});
   if(choice?.game)api.openSettings();
   else if(choice?.language)changeLanguage(choice.language);
  }else if(action==='quit'){
   const ok=await title.confirm({title:t('confirm.quitTitle'),message:t('confirm.quit'),accept:t('confirm.quitAccept')});if(!ok)return;
   stopAttract();title.hide();screen('exit');api.exit?.();
  }
 }

 // ----- language change -----
 // From the title: reload straight to the title. During play: save, then
 // reload straight back into this record (no logo, no title).
 function changeLanguage(id){
  if(id===language()||!writeLanguage(languageStore,id))return false;
  if(state.screen==='play'){save.touch(metaPatch());if(reloadInto(save.slot,'load',gameState().character))return true;}
  try{view.sessionStorage?.setItem(SKIP_LOGO_KEY,'1');}catch{/* the logo plays again */}
  stopAttract();view.location.reload();return true;
 }
 // The game's own settings dialog (opened from the title or in play) gets a
 // language row at the top.
 function mountLanguageSetting(){
  const dialog=doc.getElementById('motion-speed-dialog');if(!dialog||dialog.querySelector('.v03-language-row'))return;
  const row=doc.createElement('label');row.className='v03-language-row';
  const name=doc.createElement('span');name.textContent=t('settings.language');
  const select=doc.createElement('select');select.id='v03-language-select';
  for(const row of LANGUAGES){const option=doc.createElement('option');option.value=row.id;option.lang=row.html;option.textContent=row.label;select.append(option);}
  select.value=language();select.addEventListener('change',()=>{if(!changeLanguage(select.value))select.value=language();});
  const note=doc.createElement('small');note.textContent=t('settings.languageNote');
  row.append(name,select,note);dialog.querySelector('header')?.after(row);
  tidySettings(dialog);
 }
 // Controls guide for players, built from the lesson and tip text already
 // written per language. It replaces the review-era help text (v03.css).
 function mountControlsGuide(){
  const dialog=doc.getElementById('help-dialog');if(!dialog||dialog.querySelector('.v03-guide'))return;
  const hint=id=>content.COMBAT_HINTS?.find(row=>row.id===id),tip=id=>content.TIPS?.find(row=>row.id===id);
  const both=key=>({touch:t(key),keys:t(key)});
  const rows=[
   [hint('move')?.text,hint('move')],[hint('camera')?.text,hint('camera')],[hint('attack')?.text,hint('attack')],
   [t('guide.combo'),both('guide.comboText')],[tip('charge')?.title,tip('charge')],
   [t('guide.dodge'),hint('dodge')],[tip('sprint')?.title,tip('sprint')],
   [t('guide.guard'),hint('guard')],[t('guide.justGuard'),both('guide.justGuardText')],
   [tip('potion')?.title,tip('potion')],[tip('talk')?.title,tip('talk')],
  ].filter(([name,row])=>name&&row);
  const make=(tag,className,text)=>{const node=doc.createElement(tag);node.className=className;if(text!==undefined)node.textContent=text;return node;};
  const guide=make('section','v03-guide'),list=make('dl','v03-guide-list');
  guide.append(make('h2','v03-guide-title',t('settings.controls')),make('p','v03-guide-mode is-touch',t('guide.touch')),make('p','v03-guide-mode is-keys',t('guide.keys')));
  for(const [name,row] of rows){const item=make('div','v03-guide-row');item.append(make('dt','',name),make('dd','is-touch',row.touch),make('dd','is-keys',row.keys));list.append(item);}
  guide.append(list);dialog.append(guide);
 }
 function tidySettings(dialog){
  const host=dialog.querySelector('.settings-sections');if(!host)return;
  // Back to the title: saved first; a second tap within three seconds confirms.
  const leave=doc.createElement('button');leave.type='button';leave.className='v03-settings-leave';leave.dataset.ui='';leave.textContent=t('settings.toTitle');
  let armed=0;
  leave.addEventListener('click',()=>{
   if(state.screen!=='play')return;
   if(!armed){leave.textContent=t('settings.toTitleConfirm');leave.classList.add('is-armed');armed=view.setTimeout(()=>{armed=0;leave.textContent=t('settings.toTitle');leave.classList.remove('is-armed');},3000);return;}
   view.clearTimeout(armed);save.touch(metaPatch());
   try{view.sessionStorage?.setItem(SKIP_LOGO_KEY,'1');}catch{/* the logo plays again */}
   view.location.reload();
  });
  host.append(leave);
 }
 // ----- boot -----
 function showTitle(){
  if(state.disposed||state.screen!=='boot')return;
  if(!state.langReady){void langReady.then(showTitle);return;}
  screen('title');title.setEnabled('load',save.index().some(meta=>meta.used));title.show();
 }
 // After the logo, the game's own download/loading card shows progress; the
 // title (still black while its scene is prepared) appears when it closes.
 let loadingWait=null;
 function afterLoading(next){
  const Watch=view?.MutationObserver;
  if(!html.dataset.loading||!Watch){next();return;}
  loadingWait=new Watch(()=>{if(html.dataset.loading)return;loadingWait.disconnect();loadingWait=null;next();});
  loadingWait.observe(html,{attributes:true,attributeFilter:['data-loading']});
 }
 if(save.intent){
  // A slot was chosen on a previous document: skip logo and title.
  splash?.remove?.();screen(save.intent.mode==='new'?'opening':'resume');
  // Between the loading card and the dream, never show the raw camera (it
  // can start inside a tree crown): keep the prologue cover up.
  if(save.intent.mode==='new')opening.cover({art:true});
 }else if(splash?.done)splash.done.then(()=>{splash.remove?.();afterLoading(showTitle);});
 else afterLoading(showTitle);
 // A loading/frame failure owns the screen: its retry UI must be reachable.
 // The frame loop is paused in that state, so the loading card is watched too.
 function fail(){
  if(state.failed||state.disposed)return;
  state.failed=true;stopAttract();title.hide();opening.cancel();splash?.remove?.();input?.setSuspended(false);screen('failed');
 }
 const loadingCard=doc.getElementById('loading'),Observer=view?.MutationObserver;
 const loadingWatch=loadingCard&&Observer?new Observer(()=>{if(loadingCard.classList.contains('error'))fail();}):null;
 loadingWatch?.observe(loadingCard,{attributes:true,attributeFilter:['class']});
 const onPageHide=()=>{if(state.screen==='play')save.touch(metaPatch());};
 view?.addEventListener?.('pagehide',onPageHide);

 return {
  get screen(){return state.screen;},
  // Title/prologue never write progress, quests or map position.
  get blocksProgress(){return state.screen!=='play';},
  // The simulation is frozen while the prologue covers the stage.
  get blocksGame(){return state.screen==='opening'||state.screen==='exit'||story.dialogueOpen||gate.active;},
  // Called by the game when an enemy is defeated.
  defeat(event){if(state.screen==='play')story.defeat(event);},
  decorateFoeBar(element,foe){if(state.screen==='play')vitality.decorate(element,foe);},
  story,
  get pilotMovement(){return state.attract?pilot.movement:null;},
  // Tutorial gate for main.js actions; everything is allowed outside play.
  allows(kind){return state.screen!=='play'||story.allows(kind);},
  // Cutscene camera target and short slow motion (read by main.js each frame).
  get cameraFocus(){return state.screen==='play'?story.cameraFocus:null;},
  get timeScale(){return state.screen==='play'?story.timeScale:1;},
  get lunge(){return state.screen==='play'?story.lunge:null;},
  get questSpot(){return state.screen==='play'?story.questSpot:null;},
  get playing(){return state.screen==='play';},
  update(dt){
   if(state.disposed)return;
   if(state.screen!=='play')cursors.set('ui');
   const s=gameState();
   if(s.failed&&!state.failed){fail();return;}
   if(state.screen==='title'){
    if(s.ready&&!state.sceneShown){state.sceneShown=true;void startAttract();}
    if(state.sceneShown&&!state.revealed){
     state.prepareTime+=dt;
     state.quietTime=!state.summoning&&!(s.pending>0)?state.quietTime+dt:0;
     if(state.quietTime>=REVEAL_QUIET||state.prepareTime>=REVEAL_LIMIT){state.revealed=true;title.setSceneReady(true);}
    }
    if(state.attract&&s.ready)try{driveAttract(dt);}catch(error){console.warn('[MoonForest 0.3] title battle stopped',error);stopAttract();}
   }else if(state.screen==='opening'&&save.intent?.mode==='new'&&s.ready&&!state.busy&&state.langReady){
    // The opening is on the plains road; a document opened on another map goes there first.
    if(OPENING_STAGE.map&&s.mapId!==OPENING_STAGE.map&&!state.openingTravel){state.openingTravel=true;void Promise.resolve(api.travel?.('warrior-plains')).catch(report);return;}
    if(s.mapId!==OPENING_STAGE.map)return;
    state.busy=true;api.resetStage(OPENING_STAGE);story.prepare(s.mapId);
    void (async()=>{
     save.commit(metaPatch({chapter:1,title:'꿈',titleKey:'dream',playSeconds:0}));state.ambush=true;
     const ambush=battle.summon(api.getPlayer(),AMBUSH.count,AMBUSH.kind).catch(()=>false);
     await opening.play();const ok=await Promise.race([ambush,wait(6000).then(()=>null)]);if(ok===false)state.ambush=false;
     save.touch(metaPatch({title:'늑대와 마차',titleKey:'M00'}));await enterPlay();state.busy=false;await opening.release();
    })().catch(report);
   }else if(state.screen==='resume'&&s.ready&&state.langReady){
    void enterPlay({resume:true});
   }else if(state.screen==='play'&&s.ready){
    state.playSeconds+=dt;state.sinceSave+=dt;story.update(dt,s);
    if(!story.sceneActive)vitality.update(dt);
    cursors.set(story.dialogueOpen||story.sceneActive?'ui':battle.combatCount>0?'combat':story.near?'talk':'play');
    maybeStartWorld();
    if(state.sinceSave>=15){state.sinceSave=0;save.touch(metaPatch());}
   }
  },
  // QA helpers. main.js exposes this object on window only in development.
  debug:{
   skipFight(){battle.resetBattle();for(let i=0;i<AMBUSH.count;i++)story.defeat({kind:'wolf'});},
   teleport(x,z,yaw=0){return api.resetStage({x,z,yaw});},
   // Height/walkability samples for laying out story spots: [[x,z],...] → [{x,z,h,free}]
   probe(points){const w=api.world;return points.map(([x,z])=>({x,z,h:+(w.terrain?.heightAt?.(x,z)??0).toFixed(2),free:w.navigation?.free?.({x,z},.6)??null}));},
   travel:id=>api.travel(id),
   foes:()=>(battle.encounters??[]).map(foe=>({kind:foe.summonKind??foe.kind,active:!!foe.active,hp:Math.round(foe.brain?.hp??0),x:+(foe.actor?.position.x??0).toFixed(1),z:+(foe.actor?.position.z??0).toFixed(1)})),
  },
  inspect:()=>({story:story.inspect(),screen:state.screen,attract:state.attract,slot:save.slot,intent:save.intent,playSeconds:Math.floor(state.playSeconds),worldStarted:state.worldStarted}),
  dispose(){if(state.disposed)return;state.disposed=true;stopAttract();loadingWatch?.disconnect();loadingWait?.disconnect();view?.removeEventListener?.('pagehide',onPageHide);story.dispose();cursors.dispose();gate.dispose();vitality.dispose();title.dispose();opening.dispose();delete html.dataset.v03Screen;},
 };
}
