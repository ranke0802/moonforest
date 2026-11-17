// MoonForest 0.3 shell: logo → title (attract battle) → prologue → play.
// It owns no engine, scene, frame loop or timer loop: main.js calls update(dt)
// from the existing game frame, and every stage change goes through `api`.
import {createTitleScreen} from './title-screen.js';
import {createOpening} from './opening.js';
import {createAttractPilot} from './attract-pilot.js';
import {createStory} from './story.js';
import {createActorVisual} from './placeholder-actor.js';
import {createGuideWisp} from './guide-wisp.js';
import * as chapter1 from './data/chapter1.js';

export const PLACE_NAMES=Object.freeze({'warrior-v3':'숲의 경계 마을','warrior-plains':'대평원','warrior-v4':'마물의 숲','warrior-v5':'마녀의 동굴'});
export const TITLE_FOE=Object.freeze({kind:'wolf',count:1,hpFloor:.45});
// The first fight is one wolf: enough to learn every basic without pressure.
export const AMBUSH=Object.freeze({kind:'gray-wolf',count:1});
const GALLERY=Object.freeze([{id:'scenes',label:'장면',total:12},{id:'bestiary',label:'도감',total:14},{id:'titles',label:'칭호',total:10}]);
export const OPENING_STAGE=chapter1.OPENING_STAGE;
const TITLE_CAMERA=Object.freeze({radius:10.5,beta:1.24,orbit:.075});

export function setupV03(api){
 const {root,save,battle,input,actions}=api,doc=root.ownerDocument,view=doc.defaultView,html=doc.documentElement;
 const wait=api.wait??(ms=>new Promise(resolve=>setTimeout(resolve,ms)));
 const pilot=createAttractPilot({random:api.random});
 const opening=createOpening({doc,wait});
 const story=createStory({api,doc,save,content:api.content??chapter1,createVisual:api.createVisual??createActorVisual,createGuide:api.createGuide===undefined?createGuideWisp:api.createGuide});
 // The title is revealed only once its scene is fully drawn: the attract
 // battle is in place and scenery streaming has been quiet for a moment.
 const REVEAL_QUIET=1.2,REVEAL_LIMIT=25;
 const state={screen:'boot',revealed:false,prepareTime:0,quietTime:0,attract:false,sceneShown:false,summoning:false,busy:false,disposed:false,playSeconds:save.meta().playSeconds??0,sinceSave:0,ambush:false,worldStarted:false,failed:false};
 const screen=value=>{state.screen=value;html.dataset.v03Screen=value;};
 const title=createTitleScreen({doc,wait,onAction:action=>{void handle(action).catch(report);}});
 const splash=view?.__moonforestSplash;
 function report(error){console.error('[MoonForest 0.3]',error);api.toast?.('진행하지 못했습니다. 다시 시도해 주세요.');state.busy=false;}
 const gameState=()=>api.getState();

 // ----- attract battle (title background) -----
 function stopAttract(){
  state.attract=false;pilot.reset();
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
  const lower=camera.lowerRadiusLimit??1,upper=camera.upperRadiusLimit??60,wanted=Math.max(lower,Math.min(upper,TITLE_CAMERA.radius)),k=Math.min(1,dt*1.5);
  camera.radius+=(wanted-camera.radius)*k;camera.beta+=(TITLE_CAMERA.beta-camera.beta)*k;
  pilot.update(dt,{player:player.position,target:target?.actor.position??null,targetRadius:target?.radius??1,targetAttacking:target?.brain.mode==='attack',
   cameraAlpha:camera.alpha,captured:controller.captured===true,busy:controller.groggy===true||controller.dead===true,actions});
 }

 // ----- starting a game -----
 function metaPatch(extra={}){const s=gameState();return {character:s.character,place:PLACE_NAMES[s.character]??'',playSeconds:state.playSeconds,level:1,...extra};}
 function startWorld(){if(state.worldStarted)return;state.worldStarted=true;api.startWorld?.();}
 // Roaming monsters appear only after the opening quest: the first walk to
 // the village is safe.
 function maybeStartWorld(){if(!state.worldStarted&&story.started&&story.log.quest()?.id!=='M00')startWorld();}
 async function enterPlay({resume=false}={}){
  screen('play');input.setSuspended(false);api.wake?.();story.start({fresh:!resume});
  maybeStartWorld();
 }
 async function beginNewGame(){
  // Seamless path: the title already runs on the opening map.
  state.busy=true;await title.leave();
  stopAttract();api.resetStage(OPENING_STAGE);title.hide();story.prepare(gameState().mapId);
  screen('opening');save.commit(metaPatch({chapter:1,title:'꿈',playSeconds:0}));state.playSeconds=0;
  // Prepare the ambush behind the black stage; the simulation stays frozen
  // (blocksGame) until the dream ends, so nothing can attack early.
  state.ambush=true;
  const ambush=battle.summon(api.getPlayer(),AMBUSH.count,AMBUSH.kind).catch(error=>{console.warn('[MoonForest 0.3] ambush unavailable',error);return false;});
  await opening.play();
  const ready=await Promise.race([ambush,wait(6000).then(()=>null)]);
  if(ready===false)state.ambush=false;
  save.touch(metaPatch({title:'늑대와 마차'}));
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
  if(!save.request(slot,mode)){api.toast?.('저장소를 사용할 수 없어 기록을 열 수 없습니다.');return false;}
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
    const ok=await title.confirm({title:'기록 덮어쓰기',message:`${slot}번 기록을 지우고 새로 시작합니다. 되돌릴 수 없습니다.`,accept:'새로 시작'});if(!ok)return;
    if(!save.wipe(slot)){api.toast?.('기록을 지우지 못했습니다.');return;}
    reloadInto(slot,'new',null);return;
   }
   if(slot!==save.slot){reloadInto(slot,'new',null);return;}
   if(!ready){api.toast?.('세계를 준비하고 있습니다. 잠시만 기다려 주세요.');return;}
   await beginNewGame();
  }else if(action==='load'){
   const slot=await title.chooseSlot({mode:'load',index,bootSlot:save.slot});if(slot===null)return;
   const meta=index[slot-1];if(!meta.used)return;
   if(slot!==save.slot){reloadInto(slot,'load',meta.character);return;}
   if(!ready){api.toast?.('세계를 준비하고 있습니다. 잠시만 기다려 주세요.');return;}
   await continueHere();
  }else if(action==='gallery'){
   await title.showGallery({sections:GALLERY.map(section=>({...section,unlocked:0}))});
  }else if(action==='settings'){
   api.openSettings();
  }else if(action==='quit'){
   const ok=await title.confirm({title:'끝내기',message:'게임을 종료할까요?',accept:'끝내기'});if(!ok)return;
   stopAttract();title.hide();screen('exit');api.exit?.();
  }
 }

 // ----- boot -----
 function showTitle(){
  if(state.disposed||state.screen!=='boot')return;
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
  get blocksGame(){return state.screen==='opening'||state.screen==='exit'||story.dialogueOpen;},
  // Called by the game when an enemy is defeated.
  defeat(event){if(state.screen==='play')story.defeat(event);},
  story,
  get pilotMovement(){return state.attract?pilot.movement:null;},
  update(dt){
   if(state.disposed)return;
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
   }else if(state.screen==='opening'&&save.intent?.mode==='new'&&s.ready&&!state.busy){
    state.busy=true;api.resetStage(OPENING_STAGE);story.prepare(s.mapId);
    void (async()=>{
     save.commit(metaPatch({chapter:1,title:'꿈',playSeconds:0}));state.ambush=true;
     const ambush=battle.summon(api.getPlayer(),AMBUSH.count,AMBUSH.kind).catch(()=>false);
     await opening.play();const ok=await Promise.race([ambush,wait(6000).then(()=>null)]);if(ok===false)state.ambush=false;
     save.touch(metaPatch({title:'늑대와 마차'}));await enterPlay();state.busy=false;await opening.release();
    })().catch(report);
   }else if(state.screen==='resume'&&s.ready){
    void enterPlay({resume:true});
   }else if(state.screen==='play'&&s.ready){
    state.playSeconds+=dt;state.sinceSave+=dt;story.update(dt,s);
    maybeStartWorld();
    if(state.sinceSave>=15){state.sinceSave=0;save.touch(metaPatch());}
   }
  },
  // QA helpers. main.js exposes this object on window only in development.
  debug:{
   skipFight(){battle.resetBattle();for(let i=0;i<AMBUSH.count;i++)story.defeat({kind:'wolf'});},
   teleport(x,z,yaw=0){return api.resetStage({x,z,yaw});},
   travel:id=>api.travel(id),
  },
  inspect:()=>({story:story.inspect(),screen:state.screen,attract:state.attract,slot:save.slot,intent:save.intent,playSeconds:Math.floor(state.playSeconds),worldStarted:state.worldStarted}),
  dispose(){if(state.disposed)return;state.disposed=true;stopAttract();loadingWatch?.disconnect();loadingWait?.disconnect();view?.removeEventListener?.('pagehide',onPageHide);story.dispose();title.dispose();opening.dispose();delete html.dataset.v03Screen;},
 };
}
