// MoonForest 0.3 shell: logo → title (attract battle) → prologue → play.
// It owns no engine, scene, frame loop or timer loop: main.js calls update(dt)
// from the existing game frame, and every stage change goes through `api`.
import {createTitleScreen} from './title-screen.js';
import {createSaveTransfer} from './save-transfer.js';
import {createGreatAttackFx} from './great-attack-fx.js';
import {createStarfallAura} from './starfall-aura.js';
import {createRewardCelebration} from './reward-celebration.js';
import {playRewardCue} from './reward-cues.js';
import {createGallery} from './gallery.js';
import {createOpening} from './opening.js';
import {createAttractPilot} from './attract-pilot.js';
import {crownBoxes,clearView} from './title-camera.js';
import {createStory} from './story.js';
import {createConfirmDialog} from './confirm-dialog.js';
import {createPlayerCombatLock} from './player-combat-lock.js';
import {createCombatFeel} from './combat-feel.js';
import {createSlowFx,mountSlowFxSettings} from './slow-fx.js';
import {createLoadingLore} from './loading-lore.js';
import {createQuestMarkers} from './quest-markers.js';
import {createCursors} from './cursors.js';
import {createOrientationGate,isIos} from './orientation-gate.js';
import {setupUiScale} from './ui-scale.js';
import {setupAccessibility,disposeAccessibility,mountAccessibilitySettings} from './accessibility.js';
import {mountPlayerTextureSettings} from './player-texture-choice.js';
import {createHudBlurDiagnostic} from './hud-blur-diagnostic.js';
import {createVitalityHud} from './vitality-hud.js';
import {createCombatTarget} from './combat-target.js';
import {createCapeSpring} from './cape-spring.js';
import {createActorVisual} from './placeholder-actor.js';
import {createCastVisuals} from './cast-models.js';
import {setupGameSelection} from '../game-selection.js';
import {createGuideWisp} from './guide-wisp.js';
import {runBeforePageReload} from '../page-reload-hooks.js';
import * as chapter1 from './data/chapter1.js';

import {recordedQuestIds} from './character-progression.js';
import {LEGACY_TITLE_IDS} from './quest-migration.js';
import {CHAPTERS,chapterProgress,questKey} from './chapter-progress.js';
import {chapterWords} from './chapter-select.js';
import {watchTranslations,translateLabels} from './live-translate.js';
import {createRunTrail} from './run-trail.js';
import {createDrawingProgress,drawStage} from './drawing-veil.js';
import {expectedPhaseMs,rememberPhaseMs} from '../phase-share.js';
import {setMonsterCombatLeashScale} from '../monster-territory.js';
import {setHitScale} from '../hit-scale.js';
import {LANGUAGES,readLanguage,writeLanguage,useLanguage,startLanguage,language,t,cloneChapter,localizeChapter,translateTree} from './i18n.js';

// Map character → place. Saved records keep the Korean name as a fallback and
// the key (placeKey) for display in any language.
export const PLACE_NAMES=Object.freeze({'warrior-v3':'숲의 경계 마을','warrior-plains':'대평원','warrior-v4':'마물의 숲','warrior-v5':'마녀의 동굴'});
// Session flag: a language change reloads the page straight to the title.
export const SKIP_LOGO_KEY='moonforest-0.3:skip-logo';
export const TITLE_FOE=Object.freeze({kind:'wolf',count:1,hpFloor:.45});
// The first fight is one wolf: enough to learn every basic without pressure.
export const AMBUSH=Object.freeze({kind:'gray-wolf',count:1});
export const OPENING_STAGE=chapter1.OPENING_STAGE;
const TITLE_CAMERA=Object.freeze({radius:10.5,beta:1.24,orbit:.075});

// Real cast models are the default (reviewed 2026-11-18); ?cast=0 brings back the blocks.
const castPreview=()=>{try{return new URLSearchParams(globalThis.location?.search??'').get('cast')!=='0';}catch{return true;}};
export function setupV03(api){
 const {root,save,battle,input,actions}=api,doc=root.ownerDocument,view=doc.defaultView,html=doc.documentElement;
 // The title wolf and the ambush wolf live in the battle for the whole page;
 // roaming placement actors of the same model reuse that one source model.
 battle?.shareModelKinds?.(TITLE_FOE.kind,AMBUSH.kind);
 const wait=api.wait??(ms=>new Promise(resolve=>setTimeout(resolve,ms)));
 // Text size and reduced motion are on the root before the title is drawn (accessibility.js).
 const prefs=(()=>{try{return api.a11yStorage??view?.localStorage??null;}catch{return null;}})();
 setupAccessibility({doc,view,storage:prefs});
 const hudBlur=createHudBlurDiagnostic({doc,view,storage:prefs});
 // A run of frames each under 40 ms, or the deadline (a hidden page draws nothing: it waits out the time).
 async function smoothFrames(until,run=12,slowMs=40){
  const raf=view?.requestAnimationFrame?.bind(view);if(!raf||doc.hidden)return;
  let last=null,smooth=0;
  while(smooth<run&&performance.now()<until&&!state.disposed){
   const at=await new Promise(resolve=>{const timer=setTimeout(()=>resolve(null),slowMs*2);raf(time=>{clearTimeout(timer);resolve(time);});});
   if(at===null){last=null;smooth=0;continue;}
   smooth=last!==null&&at-last<=slowMs?smooth+1:last===null?smooth:0;last=at;
  }
 }
 const pilot=createAttractPilot({random:api.random});
 const appleTouch=isIos(view);
 if(appleTouch)html.dataset.v03Ios='1';
 const trail=createRunTrail({storage:(()=>{try{return view?.localStorage??null;}catch{return null;}})()});
 const gallery=createGallery(save);
 const opening=createOpening({doc,wait,flat:appleTouch,onCut:cut=>{
  trail.mark('opening:'+cut);
  if(!doc.hidden)gallery.scene(cut==='wake'?'intro':cut);
 }});
 // 0.3's layers (dialogue, prompts, quest, tips, title) live on <body>, outside
 // #app: no right-click menu or text selection there either (inputs excepted).
 const selection=setupGameSelection(doc.body);
 const cursors=createCursors(doc);
 // Phones play in landscape only, from the moment the language is chosen.
 const gate=createOrientationGate({doc});
 const uiScale=view?.addEventListener?setupUiScale({view,doc}):null;
 // Tekken-style health (recoverable part) for the player and monsters, in play only.
 const vitality=createVitalityHud({doc,battle});
 // A fight that has begun holds out to three alert radii (user, 2026-11-21; monster-territory.js).
 setMonsterCombatLeashScale(3);
 // Hits land a little more generously: monster hurt volumes, the player's blade and the player's own body, 15 % each (user, 2026-11-21).
 setHitScale({monsterHurt:1.15,playerStrike:1.15,playerHurt:1.15});
 // The foe being fought: what an attack or the guard turns to without a direction (combat-target.js).
 const combatTarget=createCombatTarget();
 const playerCombatLock=createPlayerCombatLock();
 // Hit stop, camera kick, dodge counter and the heavy-attack lesson (combat-feel.js, 1127-combat).
 const combatFeel=createCombatFeel({camera:()=>api.world?.camera??null,controller:()=>api.getController?.()??null,battle:()=>battle,player:()=>api.getPlayer?.()??null,
  onTip:when=>story.tip(when),onFlash:text=>story.flash(text),sound:(cue,options)=>api.playSound?.(cue,options),text:key=>t(key),
  lessonsOpen:()=>story.started&&story.log?.quest?.()?.id!=='M00'});
 const combatLocksTravel=()=>api.world?.gameplayV03 ? playerCombatLock.active(api.world.mapId,battle) : battle.combatCount>0;
 let returnQuestion=null;
 // The cape's spring (cape-spring.js): bound to the warrior of the current scene, rebuilt when either changes.
 // A model without the cloth grid, or a world without a scene (tests), leaves a stub so it is not tried every frame.
 // Until it has been judged on screen it runs on the development server and with ?cape=1 only (2026-11-20).
 let cape=null, greatAttackFx=null, greatAttackMap=null;
 let starfallAura=null; // The whole warrior glows while Starfall charges (starfall-aura.js).
 function resetGreatAttackFx(){greatAttackFx?.reset();starfallAura?.reset();greatAttackMap=null;}
 function prepareGreatAttack(rank){
  const scene=api.world?.scene;
  const cave=!!api.world?.cave;
  if(greatAttackFx&&(!rank||greatAttackFx.scene!==scene||greatAttackFx.cave!==cave||scene?.isDisposed)){
   greatAttackFx.dispose();greatAttackFx=null;
  }
  if(starfallAura&&(!rank||starfallAura.scene!==scene||starfallAura.cave!==cave||scene?.isDisposed)){starfallAura.dispose();starfallAura=null;}
  if(rank>0&&!greatAttackFx&&scene?.getEngine&&!scene.isDisposed){
   greatAttackFx=createGreatAttackFx({scene,root,cave,project:api.projectFeet,
    ground:(x,z)=>api.world.terrain?.heightAt(x,z)});
  }
  if(rank>0&&!starfallAura&&scene?.getEngine&&!scene.isDisposed)starfallAura=createStarfallAura({scene,cave});
  starfallAura?.bind(api.getPlayer?.()??null);
 }
 function greatAttackFrame(cast,blade){
  if(cast){
   prepareGreatAttack(cast.level);
   if(greatAttackMap!==api.world?.mapId)resetGreatAttackFx();
   greatAttackMap=api.world?.mapId;
  }
  greatAttackFx?.update(cast,blade,api.getPlayer?.()?.position);
  starfallAura?.update(cast);
 }
 const capeWanted=(()=>{try{return !!import.meta.env?.DEV||new URLSearchParams(view?.location?.search??'').get('cape')==='1';}catch{return false;}})();
 function bindCape(){
  if(!capeWanted)return;
  const root=api.getPlayer?.()??null,scene=api.world?.scene??null;
  if(cape&&cape.root===root&&cape.scene===scene)return;
  cape?.dispose();cape=null;if(!root||!scene)return;
  let made=null;try{made=scene.onAfterAnimationsObservable&&root.getDescendants?createCapeSpring({scene,root,getScale:()=>state.screen==='play'?story.timeScale:1}):null;}catch(error){console.warn('[MoonForest 0.3] cape spring skipped',error);}
  cape=made??{root,scene,dispose(){},inspect:()=>null,takeCost:()=>0,setEnabled(){}};
 }
 // Game cursors start after the splash (and its language picker) is done.
 void Promise.resolve(view?.__moonforestSplash?.done).then(()=>{if(!state.disposed)cursors.enable();});
 // Language: chosen on the first launch (inline splash) or in Settings, kept
 // across editions in localStorage. Story text is laid over a copy of the
 // chapter data once the language pack has loaded; nothing player-facing
 // appears before that (title and play wait for langReady).
 const languageStore=api.languageStorage??view?.localStorage??null,source=api.content??chapter1,content=cloneChapter(source);
 let loadingLore=null;
 const sharedStory={...content};
 const questSets=Object.fromEntries(CHAPTERS.map(row=>[row.id,row.id===1?source.QUESTS:row.questIds]));
 const chapterContent=new Map();
 const chaptersFor=storage=>chapterProgress(storage,questSets);
 // A record that has cleared nothing (the chapter choice of a new game).
 const FRESH_RECORD=Object.freeze({getItem:()=>null,setItem(){},removeItem(){}});
 function setStoryChapter(id){
  const chapter=chapterContent.get(id);
  if(chapter)Object.assign(sharedStory,content,chapter,{DIALOGUES:{...content.DIALOGUES,...chapter.DIALOGUES}});
  else Object.assign(sharedStory,content);
 }
 // Level-up and quest-reward moments (reward-celebration.js): they wait for dialogue,
 // cutscenes, loading and open dialogs. allowed() is read only while one waits or plays.
 const rewards=createRewardCelebration({doc,playCue:cue=>playRewardCue(cue,api.playSound)});
 const rewardFrame={scene:null,player:null,mapId:null,s:null,
  allowed(){const s=this.s;return state.screen==='play'&&!!s?.ready&&!s.failed&&!doc.hidden&&!story.sceneActive&&!story.dialogueOpen&&!gate.active&&!opening.covering&&!doc.querySelector?.('dialog[open]');}};
 const slowFx=createSlowFx((()=>{try{return view.localStorage;}catch{return null;}})());
 const story=createStory({api,doc,save,content:sharedStory,combatLocksTravel,createVisual:api.createVisual??(castPreview()?createCastVisuals({getWorld:()=>api.world}):createActorVisual),createGuide:api.createGuide===undefined?createGuideWisp:api.createGuide,createMarkers:api.createMarkers===undefined?createQuestMarkers:api.createMarkers,slowFx,
  // Quest talk/reward/save stages into the run trail, only while frame diagnostics are on (Astra #211).
  stageMark:stage=>{if(api.world?.frameDiagnostics?.enabled===true)trail.mark(stage);},onScene:gallery.scene,onReward:summary=>rewards.reward(summary)});
 // The title is revealed only once its scene is fully drawn: the attract
 // battle is in place and scenery streaming has been quiet for a moment.
 const REVEAL_QUIET=1.2,REVEAL_LIMIT=25;
 // Progress shown on the black title while it is drawn (drawing-veil.js).
 const drawing=createDrawingProgress({quiet:REVEAL_QUIET,limit:REVEAL_LIMIT,expectedStart:expectedPhaseMs('title:start',4000)/1000,expectedPending:expectedPhaseMs('title:pending',5000)/1000,glide:.35});
 const state={screen:'boot',revealed:false,prepareTime:0,quietTime:0,attract:false,sceneShown:false,summoning:false,busy:false,disposed:false,playSeconds:save.meta().playSeconds??0,sinceSave:0,ambush:false,worldStarted:false,failed:false,langReady:false};
 // Each screen has its score: the title (and 'drawing the world') the saint's
 // theme with its demo fight silent, the prologue the quiet forest theme
 // (swapped 2026-11-19, user choice); play returns to the map's own music.
 const SCREEN_SCORE=Object.freeze({boot:'elena_saint',title:'elena_saint',resume:'elena_saint',opening:'forest'});
 const screen=value=>{state.screen=value;trail.mark(value);html.dataset.v03Screen=value;if(value!=='title')delete html.dataset.v03Veil;try{api.setScore?.(SCREEN_SCORE[value]??null);api.setSfxMuted?.(value==='boot'||value==='title'||value==='resume');}catch{}};
 const questTitle=id=>content.QUESTS?.find(quest=>quest.id===(LEGACY_TITLE_IDS[id]??id))?.title;
 // Records written before keys were saved carry Korean text only: map it back.
 const describe=meta=>{
  if(meta.chapter>1)return {title:chapterContent.get(meta.chapter)?.QUESTS.find(q=>q.id===meta.titleKey)?.title??chapterWords().chapters[meta.chapter-1],place:PLACE_NAMES[meta.character]?t('place.'+meta.character):undefined};
  const titleKey=meta.titleKey??(meta.title==='꿈'?'dream':source.QUESTS?.find(quest=>quest.title===meta.title)?.id);
  const placeKey=meta.placeKey||Object.keys(PLACE_NAMES).find(key=>PLACE_NAMES[key]===meta.place);
  // Records without a place name still know their map (character): named from it.
  const placeId=placeKey||(PLACE_NAMES[meta.character]?meta.character:null);
  return {title:titleKey==='dream'?t('meta.dream'):titleKey?questTitle(titleKey):undefined,place:placeId?t('place.'+placeId):undefined};
 };
 // "이어하기": the record this page has bound if it is used, else the last one saved.
 const continueSlot=()=>{const index=save.index();if(index[save.slot-1]?.used)return save.slot;return [...index].filter(meta=>meta.used).sort((a,b)=>(b.savedAt??0)-(a.savedAt??0))[0]?.slot??null;};
 const title=createTitleScreen({doc,wait,describe,continued:()=>{const slot=continueSlot();return slot?save.index()[slot-1]:null;},version:doc.documentElement?.dataset?.world?'MoonForest '+doc.documentElement.dataset.world:undefined,onAction:action=>{void handle(action).catch(report);}});
 // Slot export / restore on the slot screen. A slot restored into the one this
 // page is bound to is read again like another record when it is loaded.
 const transfer=save.local!==undefined?createSaveTransfer({doc,view,save,title,describe}):null,restoredHere=new Set();
 // 2026-11-26: with restore available, 불러오기 stays open on an empty device (a
 // player who lost their storage looks for the restore there).
 const canLoad=()=>!!transfer||save.index().some(meta=>meta.used);
 // The first-launch picker lives in the splash, so the choice is read after it.
 let liveText=null;
 const langReady=(api.languageStorage?Promise.resolve(view?.__moonforestSplash?.picked??view?.__moonforestSplash?.done).then(()=>useLanguage(readLanguage(languageStore)??'ko',{doc})).finally(()=>{try{view?.__moonforestSplash?.packReady?.();}catch{/* the splash is gone */}}):startLanguage(view)).then(()=>{
  if(state.disposed)return;localizeChapter(content,source);title.relabel();transfer?.mount();mountLanguageSetting();gate.enable();translateTree(doc.getElementById('app'));translateTree(doc.getElementById('loading'));translateLabels(doc.getElementById('app'));liveText=watchTranslations(doc);mountControlsGuide();loadingLore??=createLoadingLore({doc,t});state.langReady=true;
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
 // While a record is being continued on another map (state.arriving) the page still stands on
 // the map it left: the record keeps its own place until the trip is over. (2026-11-21: a save
 // in that gap wrote the wrong map into the record.)
 function metaPatch(extra={}){
  const s=gameState(),here=state.arriving?{}:{character:s.character,place:PLACE_NAMES[s.character]??'',placeKey:PLACE_NAMES[s.character]?s.character:''};
  return {...here,playSeconds:state.playSeconds,level:api.playerLevel?.()??1,...extra};
 }
 function startWorld(){if(state.worldStarted)return;state.worldStarted=true;api.startWorld?.();}
 // Behind the title / resume screen the map's monster species load ahead of
 // play (nothing is placed until startWorld).
 function prepareWorld(){if(state.worldPrepared||state.worldStarted)return;state.worldPrepared=true;api.prepareWorld?.();}
 // Roaming monsters appear only after the opening quest: the first walk to
 // the village is safe.
 function maybeStartWorld(){if(!state.worldStarted&&story.started&&story.log.quest()?.id!=='M00')startWorld();}
 async function enterPlay({resume=false}={}){
  const chapter=chaptersFor(save.journey);
  const entry=CHAPTERS.find(row=>row.id===chapter.id);
  if(entry.load&&!chapterContent.has(entry.id)){
   try{const episode=await entry.load(language());if(state.disposed)return;chapterContent.set(entry.id,episode);}
   catch(error){if(!state.disposed){screen('title');title.show();title.setEnabled('load',true);state.sceneShown=false;await opening.release();}throw error;}
  }
  setStoryChapter(chapter.id);
  if(!chapter.replay)api.creditQuestExperience?.(recordedQuestIds(save.journey,questSets),true,source);
  screen('play');input.setSuspended(false);api.wake?.();story.start({fresh:!resume,key:questKey(chapter.id,chapter.replay),replay:chapter.replay,onComplete:()=>chapter.markComplete()});
  maybeStartWorld();
  // ?bench: one fixed measurement after entering play (structure plan, phase 0).
  if(!state.bench&&new URLSearchParams(view?.location?.search??'').has('bench')){state.bench={dispose(){}};void import('./bench.js').then(({createBench})=>{if(state.disposed)return;const mode=new URLSearchParams(view?.location?.search??'').get('bench')==='roundtrip'?'roundtrip':'orbit';state.bench=createBench({doc,mode,travel:id=>api.travel(id),isReady:()=>api.getState?.().ready!==false,getWorld:()=>api.world,info:()=>({foes:(battle.encounters??[]).filter(foe=>foe.active).length})});return state.bench.run();}).catch(error=>console.error('[bench]',error));}
 }
 // The dream's black stage is released only once the opening scene runs
 // (2026-11-20, user: now and then the stage showed the warrior, the wagon
 // and the wolf standing about for a moment before the first shot). The scene
 // starts in the first play frame when the wolf and the driver are ready; if
 // they are not, the stage stays covered for up to five seconds.
 async function sceneUp(){for(let left=5000;left>0&&!state.disposed&&story.scenePending&&!story.sceneActive;left-=50)await wait(50);}
 const MAP_CHARACTERS=Object.freeze({'great-plains':'warrior-plains',village:'warrior-v3','monster-forest':'warrior-v4','witch-cave':'warrior-v5'});
 let openingAttempt=null;
 const OPENING_WAIT_STEPS=3;
 async function stageAmbush(dream){
  // A same-tab replay can arrive with chapter two's empty wagon list.
  setStoryChapter(1);
  const controller=new AbortController(),{signal}=controller;
  openingAttempt=controller;
  const cancelled=new Promise(resolve=>signal.addEventListener('abort',()=>resolve(false),{once:true}));
  const current=()=>!signal.aborted&&!state.disposed&&state.screen==='opening';
  let wolfJob=null,castJob=null;
  // The progress bar after the dream: wolf, cast, then the first scene frame (finishOpening).
  const ready={wolf:false,cast:false},report=()=>opening.progress?.((ready.wolf?1:0)+(ready.cast?1:0),OPENING_WAIT_STEPS);report();
  async function summonWolf(){
   // The title fight may still be unwinding after resetStage cancelled it.
   if(battle.summonPending)await battle.summonPending.catch(()=>{});
   if(!current())return;
   trail.mark('opening:ambush-load');
   if(!await battle.summon(api.getPlayer(),AMBUSH.count,AMBUSH.kind))throw new Error('Opening wolf unavailable');
  }
  async function prepareActors(){
   wolfJob??=summonWolf().then(()=>{ready.wolf=true;report();}).catch(error=>{wolfJob=null;throw error;});
   if(appleTouch)await wolfJob;
   if(!current())return;
   if(!castJob){
    trail.mark('opening:wagon-load');
    const map=gameState().mapId;
    // ?cast=0 explicitly selects block stand-ins for local development.
    castJob=Promise.resolve().then(()=>castPreview()?story.prepareOpeningCast(map,{signal}):story.prepare(map))
     .then(value=>{ready.cast=true;report();return value;}).catch(error=>{castJob=null;throw error;});
   }
   await Promise.all([wolfJob,castJob]);
  }
  function back(){
   if(!current())return;
   controller.abort();story.stop();battle.resetBattle();opening.cancel();
   state.ambush=false;state.busy=false;state.dream=null;state.sceneShown=false;
   screen('title');title.setEnabled('load',canLoad());title.show();
  }
  let staged=false;
  try{
   const art=Promise.resolve(dream);
   while(current()){
    let finished=false;
    const actors=prepareActors().then(()=>true,error=>{
     if(current()){console.warn('[MoonForest 0.3] opening preparation failed',error);trail.mark('opening:prepare-failed');}
     return false;
    }).finally(()=>{finished=true;});
    await Promise.race([art,cancelled]);
    if(!current())return false;
    if(!finished)opening.preparation({onBack:back});
    if(await Promise.race([actors,cancelled])){
     if(!current())return false;
     state.ambush=true;trail.mark('opening:cast-and-wolf-ready');staged=true;return true;
    }
    if(!current())return false;
    const retry=new Promise(resolve=>opening.preparation({failed:true,onRetry:resolve,onBack:back}));
    await Promise.race([retry,cancelled]);
   }
   return false;
  }finally{
   // A bar already up stays until the scene runs (release() takes it down).
   if(openingAttempt===controller){openingAttempt=null;opening.preparation(staged?{hold:true}:undefined);}
  }
 }
 async function finishOpening(dream){
  if(!await stageAmbush(dream))return;
  state.dream=null;save.touch(metaPatch({title:'늑대와 마차',titleKey:'M00'}));
  await enterPlay();await sceneUp();opening.progress?.(OPENING_WAIT_STEPS,OPENING_WAIT_STEPS);
  if(!state.disposed&&state.screen==='play')await opening.release();
  state.busy=false;
 }
 async function beginNewGame({replay=false}={}){
  gallery.reset();
  // Seamless path: the title already runs on the opening map.
  state.busy=true;await title.leave();
  stopAttract();
  // The title can be on another map (a record was resumed there): travel and let the opening run after the load.
  // Travel in place first: a page reload leaves fullscreen and drops the
  // landscape lock on phones. Reload only if the in-app trip fails.
  // The dream plays at once; when the title stood on another map, the trip to
  // the opening map loads underneath it (the dream layer covers everything).
  // Before 2026-11-19 the trip ran first behind a plain black screen (~10 s on
  // a phone when the last record was on the plains).
  const travelling=OPENING_STAGE.map&&gameState().mapId!==OPENING_STAGE.map
   ?Promise.resolve().then(()=>api.travel?.(MAP_CHARACTERS[OPENING_STAGE.map])).then(moved=>moved===true,error=>{console.warn('[MoonForest 0.3] opening travel failed',error);return false;})
   :null;
  screen('opening');if(!replay)state.playSeconds=0;save.commit(metaPatch({chapter:1,title:'꿈',titleKey:'dream'}));transfer?.saved();
  const dream=opening.play();
  if(travelling){
   const moved=await travelling;
   if(!moved||gameState().mapId!==OPENING_STAGE.map){reloadInto(save.slot,replay?'load':'new',replay?'warrior-plains':null);return;}
  }
  api.resetStage(OPENING_STAGE);title.hide();
  await finishOpening(dream);
 }
 async function continueHere(){
  const back=state.returnPose?.map===gameState().mapId?state.returnPose:undefined;state.returnPose=null;
  state.busy=true;await title.leave();stopAttract();api.resetStage(back);opening.cover();title.hide();
  const meta=save.meta(),s=gameState(),elsewhere=!!(meta.character&&meta.character!==s.character&&PLACE_NAMES[meta.character]);
  state.arriving=elsewhere;
  try{
   await enterPlay({resume:true});
   if(elsewhere){
    // If the trip does not get there, open the record on its own map in a clean document rather than play it on the wrong one.
    const moved=await Promise.resolve(api.travel(meta.character,{resume:true})).then(value=>value===true,error=>{console.warn('[MoonForest 0.3] could not travel to the record\'s map',error);return false;});
    if(!moved||gameState().character!==meta.character){if(reloadInto(save.slot,'load',meta.character))return;}
   }
  }finally{state.arriving=false;}
  state.busy=false;await opening.release();
 }
 function reloadInto(slot,mode,character){
  if(!save.request(slot,mode)){api.toast?.(t('toast.noStorage'));return false;}
  const url=new URL(view.location.href);for(const key of ['arrival','from'])url.searchParams.delete(key);
  if(character&&PLACE_NAMES[character])url.searchParams.set('character',character);else url.searchParams.delete('character');
  void runBeforePageReload().finally(()=>view.location.replace(url.href));return true;
 }
 // The slot list; export and restore run from it and return to it.
 async function pickSlot(mode){
  for(;;){
   const empty=mode==='load'&&!save.index().some(meta=>meta.used);
   const picked=await title.chooseSlot({mode,index:save.index(),bootSlot:save.slot,transfer:!!transfer,notice:transfer?.notice()??(empty&&transfer?{tone:'info',text:t('transfer.noRecords')}:null)});
   if(!picked||typeof picked!=='object')return picked;
   const done=await transfer.run(picked);if(state.disposed||state.screen!=='title')return null;
   if(done?.restored===save.slot)restoredHere.add(done.restored);
   title.setEnabled('load',canLoad());
  }
 }
 async function handle(action){
  if(state.busy||state.screen!=='title'||!state.revealed)return;
  const ready=gameState().ready;
  // 2026-11-24 21:07 (user): 새로하기 → slot (overwrite confirmed) → chapter → a new game;
  // 불러오기 → slot → chapter → that record (its current chapter continues where it was).
  if(action==='new'){
   const slot=await pickSlot('new');if(slot===null)return;
   const meta=save.index()[slot-1];
   if(meta.used){
    const ok=await title.confirm({title:t('confirm.overwriteTitle'),message:t('confirm.overwrite',{slot}),accept:t('confirm.overwriteAccept')});if(!ok)return;
   }
   // A new record has cleared nothing: the chapters open as it plays. Nothing is
   // wiped until a chapter is chosen, so backing out keeps the old record.
   const choice=await title.chooseChapter({progress:chaptersFor(FRESH_RECORD),used:false});
   if(!choice)return;
   if(!ready){api.toast?.(t('toast.preparing'));return;}
   // In place (2026-11-19, user): wipe and bind the slot on this page so the
   // click that started the game keeps its sound; reload only as a fallback.
   if(meta.used||slot!==save.slot){
    if(!api.restartProgress){if(meta.used&&!save.wipe(slot)){api.toast?.(t('toast.wipeFailed'));return;}reloadInto(slot,'new',null);return;}
    if(!save.restartIn(slot)){api.toast?.(t('toast.wipeFailed'));return;}
    api.restartProgress();
   }
   await beginNewGame();
  }else if(action==='load'||action==='continue'){
   // 이어하기 = 불러오기 of that record with its current chapter, without the two pickers.
   const slot=action==='continue'?continueSlot():await pickSlot('load');if(slot===null)return;
   const meta=save.index()[slot-1];if(!meta?.used)return;
   const preview=chaptersFor(save.inspectSlot?.(slot)??save.journey);
   const choice=action==='continue'?{id:preview.id}:await title.chooseChapter({progress:preview,used:true,reset:false});
   if(!choice)return;
   if(!ready){api.toast?.(t('toast.preparing'));return;}
   // The chapter the record is on (no replay asked) continues exactly where it was.
   const resume=choice.id===preview.id&&!choice.replay,changed=slot!==save.slot||restoredHere.has(slot);
   if(changed){
    restoredHere.delete(slot);
    // In place when the game can read a record again on this page (user, 2026-11-21: no
    // reload, the loaded world stays); otherwise a clean document as before.
    if(resume&&!api.reloadProgress){reloadInto(slot,'load',meta.character);return;}
    if(!save.bindTo?.(slot)){
     if(resume){reloadInto(slot,'load',meta.character);return;}
     api.toast?.(t('toast.noStorage'));return;
    }
    if(api.reloadProgress){
     api.reloadProgress();
     state.playSeconds=save.meta().playSeconds??0;state.sinceSave=0;state.returnPose=null;state.ambush=false;
     if(state.worldStarted){api.stopWorld?.();state.worldStarted=false;}
    }
   }
   if(!resume){
    const destination=preview.select(choice.id,{again:choice.replay===true,current:save.meta()});
    if(!destination){api.toast?.(t('toast.noStorage'));return;}
    state.returnPose=null;
    save.touch({chapter:choice.id,character:destination.character,place:destination.place??PLACE_NAMES[destination.character],placeKey:destination.character,titleKey:destination.titleKey??'',title:destination.title??chapterWords().chapters[choice.id-1]});
   }
   if(changed&&!api.reloadProgress){reloadInto(slot,'load',save.meta().character);return;}
   if(choice.replay&&choice.id===1){await beginNewGame({replay:true});return;}
   await continueHere();
  }else if(action==='gallery'){
   state.busy=true;
   try{
    const journal=chapterContent.get(2)??await CHAPTERS.find(chapter=>chapter.id===2).load(language());
    if(!state.disposed&&state.screen==='title')await title.showGallery({sections:gallery.sections(content,journal)});
   }finally{state.busy=false;}
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
  stopAttract();void runBeforePageReload().finally(()=>view.location.reload());return true;
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
   [hint('move')?.text,hint('move')],[hint('camera')?.text,hint('camera')],
   [t('guide.dodge'),hint('dodge')],[tip('sprint')?.title,tip('sprint')],
   [hint('guard')?.text,hint('guard')],[t('guide.justGuard'),both('guide.justGuardText')],
   [hint('attack')?.text,hint('attack')],[t('guide.combo'),both('guide.comboText')],
   [hint('push')?.text,hint('push')],[hint('heavy')?.text,hint('heavy')],
   [tip('stamina')?.title,tip('stamina')],[tip('potion')?.title,tip('potion')],[tip('talk')?.title,tip('talk')],
  ].filter(([name,row])=>name&&row);
  const make=(tag,className,text)=>{const node=doc.createElement(tag);node.className=className;if(text!==undefined)node.textContent=text;return node;};
  const guide=make('section','v03-guide'),list=make('dl','v03-guide-list');
  guide.append(make('h2','v03-guide-title',t('settings.controls')),make('p','v03-guide-mode is-touch',t('guide.touch')),make('p','v03-guide-mode is-keys',t('guide.keys')));
  for(const [name,row] of rows){const item=make('div','v03-guide-row');item.append(make('dt','',name),make('dd','is-touch',row.touch),make('dd','is-keys',row.keys));list.append(item);}
  guide.append(list);dialog.append(guide);
 }
 function tidySettings(dialog){
  const host=dialog.querySelector('.settings-sections');if(!host)return;
  mountSlowFxSettings({doc,host,fx:slowFx,t});
  mountAccessibilitySettings({doc,host,t});
  mountPlayerTextureSettings({doc,host,t,storage:prefs});
  hudBlur.mount({host:dialog.querySelector('#frame-diagnostics-options'),t});
  const credits=dialog.querySelector('#v03-audio-credits');
  if(credits)host.append(credits);
  // Back to the title: saved first; a second tap within three seconds confirms.
  const leave=doc.createElement('button');leave.type='button';leave.className='v03-settings-leave';leave.dataset.ui='';leave.textContent=t('settings.toTitle');
  let armed=0;
  leave.addEventListener('click',()=>{
   if(state.screen!=='play')return;
   if(!armed){leave.textContent=t('settings.toTitleConfirm');leave.classList.add('is-armed');armed=view.setTimeout(()=>{armed=0;leave.textContent=t('settings.toTitle');leave.classList.remove('is-armed');},3000);return;}
   view.clearTimeout(armed);armed=0;leave.textContent=t('settings.toTitle');leave.classList.remove('is-armed');save.touch(metaPatch());
   // On this page when it can be done (the loaded world stays); the reload is the fallback.
   try{dialog.close?.();}catch{/* stays open: the reload below closes it */}
   void returnToTitle().then(done=>{
    if(done)return;
    try{view.sessionStorage?.setItem(SKIP_LOGO_KEY,'1');}catch{/* the logo plays again */}
    void runBeforePageReload().finally(()=>view.location.reload());
   });
  });
  host.append(leave);
 }
 // Back to the title without reloading the page (user, 2026-11-21: the reload ran the
 // whole loading again). The loaded world, models and textures stay; only the play is put
 // away: the story's cast and marks (story.stop), the roaming monsters (api.stopWorld) and
 // the fight and stage in hand (api.resetStage). The record was saved by the caller.
 // Resolves false when a part is missing or it fails: the caller reloads as before.
 async function returnToTitle(){
  if(state.busy||state.screen!=='play'||state.disposed)return false;
  if(typeof story.stop!=='function'||typeof api.stopWorld!=='function'||typeof api.resetStage!=='function')return false;
  resetGreatAttackFx();
  state.busy=true;
  try{
   opening.cover();
   // Where the player stood: the title's showcase fight wanders, continuing puts them back here.
   const at=api.getPlayer()?.position;state.returnPose=at&&Number.isFinite(at.x)&&Number.isFinite(at.z)?{x:at.x,z:at.z,map:gameState().mapId}:null;
   playerCombatLock.reset();story.stop();api.stopWorld();state.worldStarted=false;
   api.resetStage(state.returnPose??undefined);
   state.ambush=false;state.sinceSave=0;state.trailScene=false;
   screen('title');title.setEnabled('load',canLoad());title.show();
   await startAttract();
   await opening.release();
   return true;
  }catch(error){console.warn('[MoonForest 0.3] could not return to the title on this page',error);return false;}
  finally{state.busy=false;}
 }
 // ----- boot -----
 function showTitle(){
  if(state.disposed||state.screen!=='boot')return;
  if(!state.langReady){void langReady.then(showTitle);return;}
  // Since 2026-11-20 (user) the black title with its veil is the download
  // screen too: it shows at once and follows the loading card underneath
  // (that card stays for errors). The world is prepared once the card closes.
  screen('title');title.setEnabled('load',canLoad());title.show();watchDownload();
  // The prologue score is decoded once the download and world loading are over
  // (as before the title became the download screen), not on top of them.
  afterLoading(()=>{
   if(appleTouch||state.disposed||state.screen!=='title')return;
   prepareWorld();try{void Promise.resolve(api.prefetchScore?.(SCREEN_SCORE.opening)).catch(()=>{});}catch{/* music is optional */}
  });
 }
 // The loading card's progress (#loading-progress width, #loading-bytes
 // "1.2 / 5.4 MB") mirrored onto the title veil while the card is up.
 let downloadWatch=null,glideTimer=0;
 // Beside the percent: the megabytes while downloading, then what is being drawn (user, 2026-11-20).
 // Fed every frame while the title is black: one input object reused, the
 // stage's words looked up only when the stage changes (no per-frame strings).
 const drawInput={dt:0,ready:false,pending:0,summoning:false,quietTime:0,prepareTime:0},drawIdle=Object.freeze({});
 let stageKey='',stageWords='';
 function showProgress(p){
  let text=p.remaining;
  if(typeof text!=='string'){const key=drawStage(p.ratio);if(key!==stageKey){stageKey=key;stageWords=t('title.stage.'+key);}text=stageWords;}
  title.setProgress(p.ratio,text);
 }
 function watchDownload(){
  const bar=doc.getElementById('loading-progress'),bytes=doc.getElementById('loading-bytes'),Watch=view?.MutationObserver;
  const sync=()=>{
   if(!html.dataset.loading||state.screen!=='title'){downloadWatch?.disconnect();downloadWatch=null;drawing.download(null);return;}
   const value=(parseFloat(bar?.style?.width)||0)/100,numbers=String(bytes?.textContent??'').match(/[\d.]+/g)?.map(Number)??[];
   // "3.2 / 5.4MB" while files are still coming; a download means a first drawing.
   const bytesText=numbers.length>=2&&numbers[1]>0&&numbers[0]<numbers[1]?`${numbers[0].toFixed(1)} / ${numbers[1].toFixed(1)}MB`:'';
   if(bytesText)title.veil.setFirst(true);
   drawing.download(value,bytesText);
   showProgress(drawing.update(drawIdle));
   // The card writes only when its value changes; while the shown value is still running up to it, come back (one timer).
   if(drawing.gliding&&!glideTimer)glideTimer=view.setTimeout(()=>{glideTimer=0;sync();},50);
  };
  if(!html.dataset.loading)return;
  if(Watch){downloadWatch=new Watch(sync);for(const node of [bar,bytes])if(node)downloadWatch.observe(node,{attributes:true,attributeFilter:['style'],childList:true,characterData:true,subtree:true});downloadWatch.observe(html,{attributes:true,attributeFilter:['data-loading']});}
  sync();
 }
 // Runs next() once the game's own download/loading card has closed.
 let loadingWait=null;
 function afterLoading(next){
  const Watch=view?.MutationObserver;
  if(!html.dataset.loading||!Watch){next();return;}
  loadingWait=new Watch(()=>{if(html.dataset.loading)return;loadingWait.disconnect();loadingWait=null;next();});
  loadingWait.observe(html,{attributes:true,attributeFilter:['data-loading']});
 }
 // New game on a fresh document (2026-11-19, user): the dream needs only its
 // paintings, captions and score, so it starts as soon as the language is set
 // and the game downloads underneath. The loading card is hidden; a thin line
 // at the bottom follows its progress (#loading-progress width) and goes when
 // the card would have closed. Downloads stay in the resource cache as before.
 let earlyLine=null,earlyWatch=null;
 function endEarlyLine(){earlyWatch?.disconnect();earlyWatch=null;earlyLine?.remove();earlyLine=null;delete html.dataset.v03EarlyDream;}
 function audioAllowed(){
  try{const policy=view?.navigator?.getAutoplayPolicy?.('audiocontext');if(policy)return policy==='allowed';}catch{}
  try{const Ctor=view?.AudioContext??view?.webkitAudioContext;if(!Ctor)return true;const probe=new Ctor();const running=probe.state==='running';probe.close?.().catch?.(()=>{});return running;}catch{return false;}
 }
 let cancelTap=null;
 function tapToBegin(){
  return new Promise(resolve=>{
   const hint=doc.createElement('button');hint.type='button';hint.className='v03-tap-begin';hint.innerHTML='';const lead=doc.createElement('span');lead.className='v03-tap-lead';lead.textContent=t('opening.tapLead');const act=doc.createElement('span');act.className='v03-tap-act';act.textContent=t('opening.tapToBegin');hint.append(lead,act);hint.setAttribute('aria-label',t('opening.tapToBegin'));(doc.body??doc.documentElement).append(hint);
   const kinds=['pointerdown','keydown','touchend'];
   const finish=()=>{for(const kind of kinds)view.removeEventListener(kind,go,true);cancelTap=null;hint.remove();resolve();};
   const go=event=>{if(event.type==='keydown'&&event.repeat)return;api.unlockAudio?.();finish();};
   cancelTap=finish;
   for(const kind of kinds)view.addEventListener(kind,go,{capture:true});
  });
 }
 function startEarlyDream(){
  opening.cover({art:true});
  html.dataset.v03EarlyDream='1';
  const source=doc.getElementById('loading-progress'),Watch=view?.MutationObserver;
  earlyLine=doc.createElement('div');earlyLine.className='v03-download-line';earlyLine.setAttribute('aria-hidden','true');
  const fill=doc.createElement('i');earlyLine.append(fill);(doc.body??doc.documentElement).append(earlyLine);
  let last=-1;
  const sync=()=>{
   if(!html.dataset.loading){endEarlyLine();return;}
   const value=Math.max(0,Math.min(100,parseFloat(source?.style?.width)||0));
   if(value!==last){last=value;fill.style.transform=`scaleX(${value/100})`;}
  };
  if(Watch){earlyWatch=new Watch(sync);if(source)earlyWatch.observe(source,{attributes:true,attributeFilter:['style']});earlyWatch.observe(html,{attributes:true,attributeFilter:['data-loading']});}
  sync();
  // A reloaded page has had no tap yet: browsers keep its sound off (no music,
  // no typing blips) until one. Unless the browser already allows audio, the
  // dream waits on its cover for one tap (2026-11-19, user: prologue silent).
  // The first ready frame joins this promise even if the audio tap is pending.
  state.dream=langReady.then(async()=>{
   if(state.disposed||state.failed||state.screen!=='opening')return;
   if(audioAllowed())api.unlockAudio?.();else await tapToBegin();
   if(state.disposed||state.failed||state.screen!=='opening')return;
   return opening.play();
  });
 }
 if(save.intent){
  // A slot was chosen on a previous document: skip logo and title.
  splash?.remove?.();screen(save.intent.mode==='new'?'opening':'resume');
  // Between the loading card and the dream, never show the raw camera (it
  // can start inside a tree crown): keep the prologue cover up.
  if(save.intent.mode==='new')startEarlyDream();
 }else{
  // Logo -> title: the loading card under the black title stays black (v03.css).
  html.dataset.v03Veil='1';
  if(splash?.done)splash.done.then(()=>{splash.remove?.();showTitle();});else showTitle();
 }
 // A loading/frame failure owns the screen: its retry UI must be reachable.
 // The frame loop is paused in that state, so the loading card is watched too.
 function fail(){
  if(state.failed||state.disposed)return;
  state.failed=true;openingAttempt?.abort();cancelTap?.();endEarlyLine();stopAttract();title.hide();opening.cancel();splash?.remove?.();input?.setSuspended(false);screen('failed');
 }
 const loadingCard=doc.getElementById('loading'),Observer=view?.MutationObserver;
 const loadingWatch=loadingCard&&Observer?new Observer(()=>{if(loadingCard.classList.contains('error'))fail();}):null;
 loadingWatch?.observe(loadingCard,{attributes:true,attributeFilter:['class']});
 const onPageHide=()=>{trail.end();if(state.screen==='play')save.touch(metaPatch());};
 const VITALS_SECONDS=5;
 const onVisibility=()=>trail.setHidden(doc.hidden===true);
 doc.addEventListener?.('visibilitychange',onVisibility);
 view?.addEventListener?.('pagehide',onPageHide);

 return {
  get screen(){return state.screen;},
  // Back to the title on this page; false when it could not be done (the settings button then reloads).
  returnToTitle,
  // The run before this one (stage it last reached; ended=false and hidden=false: killed on screen).
  get previousRun(){return trail.previous;},
  // Written into the performance record's metadata (main.js), so two records can be told apart.
  recordMetadata(){return hudBlur.metadata();},
  // Title/prologue never write progress, quests or map position.
  get blocksProgress(){return state.screen!=='play';},
  // A map trip waits here before it takes the loading picture away: the place's people load
  // their models and upload their textures behind it and not in the first seconds of play
  // (2026-11-21: five 2048 px textures, 55-88 ms each, one frame of 0.9 s on a laptop).
  async arrival(maxMs=4000){
   if(state.screen!=='play'||state.disposed)return false;
   const until=performance.now()+maxMs;
   // The story builds the cast here, not on its first frame: that frame only comes
   // after the trip (2026-11-23: the old wait here could never see the cast, so the
   // cover always stayed the full 4 s and the folk then loaded in play).
   const area=gameState().mapId;
   const preparations=[story.arrive?.(area),api.world.chapterResidents?.enter(area)].filter(Boolean);
   const settled=preparations.length?Promise.allSettled(preparations):null;
   let done=!settled;
   if(settled){void settled.then(()=>{done=true;});await Promise.race([settled,wait(maxMs)]);}
   // Then, within the same cap, until the world draws smoothly: the first seconds
   // after a trip ran 85-120 ms a frame on the plains (phone, 2026-11-23), which
   // that full wait had been hiding by accident. The cover never stays longer than before.
   if(done)await smoothFrames(until);
   return done;
  },
  // The prologue's black stage hides the world: main.js draws it only now and
  // then (uploads keep moving) so the ambush wolf's preparation and the
  // prologue's own animation get the frame time.
  prepareGreatAttack,greatAttackFrame,resetGreatAttackFx,
  get stageHidden(){return (state.screen==='opening'||state.screen==='resume')&&opening.covering;},
  // The simulation is frozen while the prologue covers the stage.
  // Dialogue no longer stops the world (2026-11-20, user: the player and the NPC
  // froze mid-stride). Input is suspended while talking, so the player settles
  // into idle and the speaker keeps its talking motion.
  get blocksGame(){return state.screen==='opening'||state.screen==='exit'||gate.active;},
  // Called by the game when an enemy is defeated.
  defeat(event){if(state.screen==='play'){gallery.encounter(event);story.defeat(event);}},
  // main.js, before the death screen: true when the story takes the fall (Jeffrey's defense errand).
  interceptDeath(){return state.screen==='play'&&story.interceptDeath?.()===true;},
  decorateFoeBar(element,foe){if(state.screen==='play'){
   if(!element.hidden&&foe?.brain?.hp>0&&foe.renderVisible!==false&&foe.fogVisible!==false)gallery.encounter(foe);
   vitality.decorate(element,foe);
  }},
  // main.js: a hit landed (kind 'enemy': on that foe; 'player'/'block': by that foe), and which foe a starting action faces.
  combatEvent(kind,foe,damage,heavy=false){if(state.screen==='play'&&!story.sceneActive){
   if(foe?.brain&&(kind==='enemy'||kind==='player'||kind==='block'))gallery.encounter(foe);
   combatFeel.note(kind,foe,damage,heavy);
   combatTarget.note(kind,foe);playerCombatLock.note(kind,foe,damage,api.world.mapId);
  }},
  get combatLocksTravel(){return combatLocksTravel();},
  // main.js (map-travel returnGate): going straight back to the map just left asks first
  // (user, 2026-11-26). The player holds still while the question is up.
  async confirmReturn(destination){
   if(state.screen!=='play'||state.disposed)return true;
   const key='place.'+destination,name=t(key);
   returnQuestion??=createConfirmDialog({doc,mount:root});
   input.setSuspended(true);
   try{return await returnQuestion.ask({title:t('travel.returnTitle'),message:t('travel.returnConfirm',{place:name===key?destination:name}),accept:t('travel.returnAccept')});}
   finally{if(!state.disposed)input.setSuspended(false);}
  },
  aimTarget(position,nearest,starts=true,reachScale=1){return state.screen==='play'?combatTarget.aim(position,nearest,starts,reachScale):nearest;},
  get aimReach(){return state.screen==='play'?combatTarget.reach:0;},
  get chainFoe(){return state.screen==='play'?combatTarget.chainFoe:null;},
  story,
  get pilotMovement(){return state.attract?pilot.movement:null;},
  // Tutorial gate for main.js actions; everything is allowed outside play.
  allows(kind){return state.screen!=='play'||story.allows(kind);},
  // Cutscene camera target and short slow motion (read by main.js each frame).
  get cameraFocus(){return state.screen==='play'?story.cameraFocus:null;},
  get holdsPlayer(){return state.screen==='play'&&story.holdsPlayer===true;},
  get timeScale(){return state.screen==='play'?story.timeScale*combatFeel.timeScale:1;},
  // main.js: added to the sword's attack (heavy attack, dodge counter).
  get strikeBonus(){return state.screen==='play'?combatFeel.strikeBonus:0;},
  // town-services defeat(): a heavy attack's finishing blow on this kind earns more experience (once).
  finishBonus(kind){return state.screen==='play'&&combatFeel.takeFinish(kind);},
  get lunge(){return state.screen==='play'?story.lunge:null;},
  get questSpot(){return state.screen==='play'?story.questSpot:null;},
  get playing(){return state.screen==='play';},
  // town-services.js announceLevel: true when the 0.3 level-up moment takes the event.
  celebrateLevel(event){return rewards.levelUp(event);},
  update(dt){
   if(state.disposed)return;
   if(state.screen!=='play')cursors.set('ui');
   const s=gameState();
   rewardFrame.scene=api.world?.scene??null;rewardFrame.player=api.getPlayer?.()??null;rewardFrame.mapId=s.mapId??null;rewardFrame.s=s;
   rewards.update(dt,rewardFrame);
   if(greatAttackFx?.active||starfallAura?.active){
    if(!s.ready||state.screen!=='play'||greatAttackMap!==s.mapId)resetGreatAttackFx();
    else{greatAttackFx?.tick();starfallAura?.tick();}
   }
   // Run-trail vitals: one small write every VITALS_SECONDS (kept across a freeze or kill).
   state.vitalsIn=(state.vitalsIn??0)-dt;if(state.vitalsIn<=0){state.vitalsIn=VITALS_SECONDS;const vitals=api.vitals?.();if(vitals){vitals.screen=state.screen;trail.vitals(vitals);}}
   if(s.failed&&!state.failed){fail();return;}
   if(s.ready)bindCape();
   if(state.screen==='title'){
    if(s.ready&&!state.sceneShown){state.sceneShown=true;void startAttract();}
    if(state.sceneShown&&!state.revealed){
     state.prepareTime+=dt;
     state.quietTime=!state.summoning&&!(s.pending>0)?state.quietTime+dt:0;
     if(state.quietTime>=REVEAL_QUIET||state.prepareTime>=REVEAL_LIMIT){state.revealed=true;title.setSceneReady(true);const took=drawing.measured;rememberPhaseMs('title:start',took.start*1000);rememberPhaseMs('title:pending',took.pending*1000);}
    }
    if(!state.revealed){drawInput.dt=dt;drawInput.ready=state.sceneShown;drawInput.pending=s.pending??0;drawInput.summoning=state.summoning;drawInput.quietTime=state.quietTime;drawInput.prepareTime=state.prepareTime;showProgress(drawing.update(drawInput));}
    if(state.attract&&s.ready)try{driveAttract(dt);}catch(error){console.warn('[MoonForest 0.3] title battle stopped',error);stopAttract();}
   }else if(state.screen==='opening'&&save.intent?.mode==='new'&&s.ready&&!state.busy&&state.langReady){
    // The opening is on the plains road; a document opened on another map goes there first.
    if(OPENING_STAGE.map&&s.mapId!==OPENING_STAGE.map&&!state.openingTravel){state.openingTravel=true;void Promise.resolve(api.travel?.('warrior-plains')).catch(report);return;}
    if(s.mapId!==OPENING_STAGE.map)return;
    state.busy=true;api.resetStage(OPENING_STAGE);
    void (async()=>{
     save.commit(metaPatch({chapter:1,title:'꿈',titleKey:'dream',playSeconds:0}));transfer?.saved();
     await finishOpening(state.dream);
    })().catch(report);
   }else if(state.screen==='resume'&&s.ready&&state.langReady&&!state.busy){
    if(!appleTouch)prepareWorld();
    state.busy=true;void enterPlay({resume:true}).catch(report).finally(()=>{state.busy=false;});
   }else if(state.screen==='play'&&s.ready){
    if(battle.playerAlive===false)playerCombatLock.reset();
    state.playSeconds+=dt;state.sinceSave+=dt;story.update(dt,s);combatFeel.update(dt);
    combatTarget.update(dt,api.getController()?.state,api.getPlayer()?.position,s.mapId);
    if(story.sceneActive!==state.trailScene){state.trailScene=story.sceneActive;state.wagonShown=false;trail.mark(state.trailScene?'play:opening-scene':'play');}
    if(story.sceneActive&&!state.wagonShown&&!opening.covering&&!doc.hidden){gallery.scene('wagon');state.wagonShown=true;}
    if(story.sceneActive)vitality.present();else vitality.update(dt);
    cursors.set(story.dialogueOpen||story.sceneActive?'ui':battle.combatCount>0?'combat':story.near?'talk':'play');
    maybeStartWorld();
    if(state.sinceSave>=15){state.sinceSave=0;save.touch(metaPatch());}
   }
  },
  // QA helpers. main.js exposes this object on window only in development.
  debug:{
   skipFight(){battle.resetBattle();for(let i=0;i<AMBUSH.count;i++)story.defeat({kind:'wolf'});},
   // The cape's spring on or off (to compare), and its average cost per frame in microseconds.
   cape(on){cape?.setEnabled(on);return cape?.inspect()??null;},capeCost(){return cape?.takeCost()??0;},
   teleport(x,z,yaw=0){return api.resetStage({x,z,yaw});},
   // Height/walkability samples for laying out story spots: [[x,z],...] → [{x,z,h,free}]
   probe(points){const w=api.world;return points.map(([x,z])=>({x,z,h:+(w.terrain?.heightAt?.(x,z)??0).toFixed(2),free:w.navigation?.free?.({x,z},.6)??null}));},
   travel:id=>api.travel(id),
   castVisual:id=>story.castVisual?.(id)??null,
   foes:()=>(battle.encounters??[]).map(foe=>({kind:foe.summonKind??foe.kind,active:!!foe.active,hp:Math.round(foe.brain?.hp??0),x:+(foe.actor?.position.x??0).toFixed(1),z:+(foe.actor?.position.z??0).toFixed(1)})),
  },
  inspect:()=>({story:story.inspect(),combat:combatTarget.inspect(),feel:combatFeel.inspect(),screen:state.screen,attract:state.attract,slot:save.slot,intent:save.intent,playSeconds:Math.floor(state.playSeconds),worldStarted:state.worldStarted}),
  dispose(){if(state.disposed)return;state.disposed=true;combatFeel.dispose();hudBlur.dispose();disposeAccessibility();greatAttackFx?.dispose();greatAttackFx=null;starfallAura?.dispose();starfallAura=null;openingAttempt?.abort();returnQuestion?.dispose();returnQuestion=null;cancelTap?.();endEarlyLine();cape?.dispose();cape=null;liveText?.dispose();liveText=null;loadingLore?.dispose();loadingLore=null;state.bench?.dispose();selection.dispose();stopAttract();loadingWatch?.disconnect();loadingWait?.disconnect();downloadWatch?.disconnect();view?.removeEventListener?.('pagehide',onPageHide);doc.removeEventListener?.('visibilitychange',onVisibility);story.dispose();rewards.dispose();cursors.dispose();gate.dispose();uiScale?.dispose();vitality.dispose();transfer?.dispose();title.dispose();opening.dispose();delete html.dataset.v03Screen;delete html.dataset.v03Veil;delete html.dataset.v03Ios;},
 };
}
