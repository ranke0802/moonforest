import {validateStoryboard} from './storyboard-document.js';

// The editor draft belongs to this browser and origin. It is not a published story.
export function readStoryboardOpening(storage){
 try{
  const raw=storage?.getItem('moonforest-storyboard-draft-v1');if(!raw)return null;
  const result=validateStoryboard(raw);if(!result.valid)return null;
  const first=result.document.cards[0];
  if(first.type!=='cinematic'||!first.sceneId||!result.document.scenes.some(scene=>scene.cutsceneId===first.sceneId))return null;
  return result.document;
 }catch{return null;}
}

// Uses the same storyboard runner and cinematic lease as in-game playback.
export function setupStoryboardOpening({root,document:story,live,world,input,isReady,isFailed=()=>false,travel,wake=()=>{},onStart=()=>{}}){
 const doc=root.ownerDocument,originalMap=world.mapId,first=story.cards[0];
 const savedSuspended=input?.suspended??false;
 const screen=doc.createElement('section'),style=doc.createElement('style');
 screen.dataset.toolUi='';screen.className='story-opening';screen.hidden=true;
 screen.innerHTML='<div class="story-opening-cover"><div class="story-opening-loading" role="status">오프닝을 준비하고 있습니다…</div><div class="story-opening-title" hidden><small>AN ADVENTURE IN THE MOONLIGHT</small><h1>MOONFOREST</h1><p class="story-opening-error" role="status"></p><button data-opening="start">게임 시작</button></div></div><button class="story-opening-skip" data-opening="skip" hidden>건너뛰기</button>';
 style.textContent='.story-opening[hidden],.story-opening [hidden]{display:none!important}.story-opening{position:fixed;inset:0;z-index:1100;color:#f5edd7;font-family:system-ui,sans-serif}.story-opening-cover{position:absolute;inset:0;display:grid;place-items:center;text-align:center;background:radial-gradient(ellipse at 50% 38%,#213a2c,#101c16 60%,#090e0b)}.story-opening[data-playing="true"]{pointer-events:none}.story-opening[data-playing="true"] .story-opening-cover{display:none}.story-opening-title{padding:32px}.story-opening-title small{letter-spacing:.25em;color:#bdad7a}.story-opening-title h1{font-family:Georgia,serif;letter-spacing:.16em;font-size:clamp(34px,7vw,72px);font-weight:400;margin:18px 0 38px}.story-opening-error{max-width:520px;color:#e6b5a0;line-height:1.5}.story-opening button{cursor:pointer;border:1px solid #b9a36e;border-radius:5px;background:#263e2e;color:#fff4d6;padding:13px 32px;font:inherit}.story-opening button:disabled{opacity:.55}.story-opening-skip{position:absolute;top:24px;right:24px;pointer-events:auto}';
 root.append(style,screen);
 const loading=screen.querySelector('.story-opening-loading'),title=screen.querySelector('.story-opening-title'),error=screen.querySelector('.story-opening-error'),start=screen.querySelector('[data-opening="start"]'),skip=screen.querySelector('[data-opening="skip"]');
 let stage='waiting',disposed=false,serial=0;
 function showTitle(message=''){
  if(disposed)return;stage='title';screen.hidden=false;screen.dataset.playing='false';loading.hidden=true;title.hidden=false;skip.hidden=true;error.textContent=message;start.disabled=false;start.focus?.();wake();
 }
 function fail(message){
  if(isFailed()){stage='started';screen.hidden=true;input?.reset?.();input?.setSuspended?.(savedSuspended);void live.stop();wake();return;}
  showTitle(message);
 }
 async function begin(){
  const epoch=++serial;stage='preparing';screen.hidden=false;loading.hidden=false;title.hidden=true;input?.reset?.();input?.setSuspended?.(true);
  try{
   if(world.mapId!==first.mapId&&await travel(first.mapId)===false)throw Error('오프닝 지역을 열지 못했습니다.');
   if(disposed||epoch!==serial)return;
   await live.start(story);if(disposed||epoch!==serial)return;
   stage='active';wake();
  }catch(e){if(!disposed&&epoch===serial)fail('오프닝을 재생하지 못했습니다: '+e.message);}
 }
 async function startGame(){
  if(stage!=='title')return;stage='starting';start.disabled=true;error.textContent='게임을 준비하고 있습니다…';
  try{
   if(world.mapId!==originalMap&&await travel(originalMap)===false)throw Error('시작 지역을 열지 못했습니다.');
   if(live.inspect().status==='waiting'&&live.inspect().card?.type==='manual')await live.advance();
   if(disposed)return;stage='started';screen.hidden=true;input?.reset?.();input?.setSuspended?.(savedSuspended);onStart();wake();
  }catch(e){if(!disposed)fail(e.message);}
 }
 const click=event=>{const action=event.target.closest?.('[data-opening]')?.dataset.opening;if(action==='start')void startGame();else if(action==='skip'&&stage==='active')void live.skip();};
 screen.addEventListener('click',click);screen.addEventListener('keydown',event=>event.stopPropagation());
 return {
  update(){
   if(disposed)return;
   if(stage==='waiting'&&isReady()){void begin();return;}
   if(stage!=='active')return;
   const state=live.inspect();
   if(state.status==='error'||state.status==='retry'){showTitle('오프닝을 재생하지 못했습니다: '+(state.error??'알 수 없는 오류'));return;}
   if(state.cardId!==first.id||state.status==='complete'){showTitle();return;}
   const playing=state.status==='scene';screen.dataset.playing=String(playing);skip.hidden=!playing;
  },
  get blocksGame(){return stage!=='started';},
  get blocksStoryboard(){return stage==='title'||stage==='starting';},
  inspect:()=>({stage}),
  dispose(){if(disposed)return;disposed=true;serial++;input?.reset?.();input?.setSuspended?.(savedSuspended);screen.remove();style.remove();}
 };
}
