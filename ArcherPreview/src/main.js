import {createStoryboardEvents} from './storyboard-events.js';
import {validateStoryboard} from './storyboard-document.js';
import './styles.css';
import './dot-minimap.css';
import {DotMinimap} from './dot-minimap.js';
import {setupMinimapTravel,applyMinimapArrivalPose} from './minimap-travel.js';
import {MapResumeStore,readMapResume} from './map-resume.js';
import {uiTestRoute,uiTestSelectionUrl,uiTestStorage} from './ui-test-route.js';
import {releaseRoute,releaseSelectionUrl,releaseSelectionValue,MOONFOREST_RELEASE,MOONFOREST_RELEASE_LABEL} from './release-route.js';
import {loadAuthoredMap} from './authored-map-loader.js';
import {authoringCharacter,setupAuthoringNavigation} from './authoring-navigation.js';
import {readStoryboardOpening,setupStoryboardOpening} from './storyboard-opening.js';
import {setupUiTest} from './ui-test.js';
import {setupChapterQuests} from './chapter-quest.js';
import {setupAuthoredInteractions} from './authored-interactions.js';
import './ui-test.css';
import './chapter-quest.css';
import './mobile-viewport.css';
import './mobile-ui.css';
import './game-selection.css';
import './cave-story.css';
import './commercial-ui.css';
import './hud-layout.css';
import {setupCommercialUi} from './commercial-ui.js';
import {setupHudLayout} from './hud-layout.js';
import {setupCaveStoryInspection} from './cave-story-inspection.js';
import {setupGameSelection} from './game-selection.js';
import {setupDeveloperToolSettings,createDeveloperToolSessions} from './tool-visibility-settings.js';
import { Engine, SceneLoader, TransformNode, Vector3, VertexBuffer } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import './serial-player-textures.js';
import {selectPlayerTextureProfile,playerTextureCapabilities} from './player-texture-profile.js';
import {createMapDeparture} from './map-departure.js';
import {createMapTransition,carryPortalPose} from './map-transition.js';
import {captureVillagePlainsHandoff} from './village-plains-handoff.js';
import {updatePlainsBoundaryAtmosphere} from './plains-boundary-atmosphere.js';
import {travelWaypoint} from './map-waypoints.js';
import {applyPlayerDetail} from './player-detail.js';
import {CaveCameraGuard,cavePlayerMarkerClear} from './witch-cave-camera.js';
import {waitForSceneReady} from './scene-ready.js';
import {worldSpawn,mapForCharacter,isWorldCharacter,travelUrl} from './map-route.js';
import {createMapPortal,consumeTravel,villageTravelLimit,clampVillageExit,safeRoadArrival} from './map-travel.js';
import { createWorld,replaceWorldMap } from './world.js';
import { PlaygroundInput } from './input.js';
import { CharacterController, STATE_LABELS, normalizeAttackSpeed } from './controller.js';
import { CharacterAnimator } from './animation.js';
import { NativeWarriorController } from './native-warrior.js';
import { WarriorV2Controller, V2_LABELS } from './warrior-v2.js';
import {CameraFollow,setupCameraFollowControls} from './camera-follow.js';
import {CameraZoom,setupCameraZoomControls} from './camera-zoom.js';
import {CameraPitch,setupCameraPitchControls} from './camera-pitch.js';
import { ARENA_RADIUS } from './world-limits.js';
import { setupFullscreen } from './fullscreen.js';
import { observeViewportSize } from './viewport-resize.js';
import { createTrainingTargets } from './targets.js';
import { createProjectiles } from './projectiles.js';
import { EQUIPMENT_STYLES, WarriorEquipment, readEquipmentChoices, saveEquipmentChoices } from './equipment.js';
import { equipmentStats, equipmentLabel } from './equipment-stats.js';
import { initializeResourceCache, migrateCachedGlb } from './resource-cache.js';
import {createLoadingView} from './loading-view.js';
import {prepareStartupResources,prepareMapResources} from './startup-resources.js';
import { BossBattle } from './boss-battle.js';
import { BossSelection, bossSelectionHelp, summonSelectedBoss } from './boss-selection.js';
import { loadTrainingGround } from './environment.js';
import { loadVillage } from './village-environment.js';
import { VILLAGE_SPAWN } from './village-layout.js';
import { createVillageReview } from './village-review.js';
import { loadVillageTrainingTarget } from './village-training.js';
import { GOBLIN_MOTIONS } from './goblin-spec.js';
import { BOSS_ACTIVE_MOTIONS } from './boss-spec.js';
import { PlayerStrikeSampler, PLAYER_STRIKE_AIM_YAW } from './player-strikes.js';
import {createSwordTrail,setupSwordTrailSettings} from './sword-trail.js';
import {configurePlayerSize,playerDimensions,WARRIOR_DIMENSIONS} from './player-dimensions.js';
import { createDamageNumbers } from './damage-numbers.js';
import { BossHealthBars } from './boss-health-bar.js';
import { PlayerHealthBar } from './player-health-bar.js';
import { setupSettingsPanel } from './settings-panel.js';
import {setupMovementSpeedSettings} from './movement-speed-settings.js';
import {setupWeatherSettings} from './weather-settings.js';
import {setupSummonPanel} from './summon-panel.js';
import {setupBossPatternPanel} from './boss-pattern-settings.js';
import {setupCharacterStylePanel} from './character-style-settings.js';
import {applyCharacterSurfaceStyle,setSceneCharacterStyles} from './character-style.js';
import { applyHitFlash, PLAYER_STAGGER } from './hit-feedback.js';
import {StaminaFailureFeedback,applyPlayerFlash} from './stamina-feedback.js';
import {StaminaNoticeAnchor} from './stamina-notice-anchor.js';
import {ShieldHoldSources,bindShieldHoldButton} from './shield-hold-input.js';
import { dodgeDirection, dodgeDistanceAt } from './dodge.js';
import { constrainDodge } from './dodge-collision.js';
import { setupMotionSpeedControls } from './motion-speed-controls.js';
import { setupDeathScreen } from './death-screen.js';
import { FrameLoop } from './frame-loop.js';
import {createFrameDiagnostics} from './frame-diagnostics.js';
import {SceneDiagnostics} from './scene-diagnostics.js';
import {LoadDiagnostics,readDiagnosticMemory} from './load-diagnostics.js';
import {inspectMapDecodeCache} from './map-decode-cache.js';
import {inspectKtxWorkerPool} from './ktx-worker-supervisor.js';
import {inspectMeshoptWorkerPool} from './meshopt-worker-supervisor.js';
import {inspectMapTerrainCache} from './map-terrain-cache.js';
import {inspectMapNavigationCache} from './map-navigation-cache.js';
import { renderPixelRatio, RenderActivity } from './render-policy.js';
import {setupFrameRateControl} from './frame-rate-settings.js';
import {setupRenderScaleControl,renderResolutionSnapshot} from './render-scale-settings.js';
import {setupPlainsViewDistanceControl,applyPlainsViewDistance,plainsRenderRange} from './plains-view-distance.js';
import { ScreenProjection } from './screen-projection.js';
import { GameAudio } from './game-audio.js';
import { ActionAudio } from './action-audio.js';
import { GoldLoot } from './gold-loot.js';
import { createGoldLootView } from './gold-loot-view.js';
import { attachCharacterOutlines } from './character-outlines.js';
import {DodgeSprintGesture} from './dodge-sprint-input.js';

const gameSelection=setupGameSelection(document.getElementById('app'));
if(import.meta.hot)import.meta.hot.dispose(()=>gameSelection.dispose());
setupSettingsPanel();
setupSummonPanel();
const elements=new Map();
const $ = selector => {if(!elements.has(selector))elements.set(selector,document.querySelector(selector));return elements.get(selector);};
const text=(selector,value)=>{const node=$(selector);if(node.textContent!==value)node.textContent=value;};
const canvas = $('#viewport');
const audio=new GameAudio(),actionAudio=new ActionAudio(audio);
audio.bindUnlock(document);
const loading = $('#loading');
const loadingView=createLoadingView();
const buttons = ['#run-button', '#attack-button', '#hit-button', '#death-button', '#guard-button', '#dodge-button'].map($);
const validCharacters = ['archer', 'warrior', 'warrior-v2', 'warrior-v3', 'warrior-plains', 'warrior-v4', 'warrior-v5'];
const versionRoute=releaseRoute(location.href),releaseEnabled=versionRoute.enabled;
const cinematicAuthoringPreview=releaseEnabled&&new URLSearchParams(location.search).get('cinematicPreview')==='1';
const uiRoute=uiTestRoute(versionRoute.url),uiTestEnabled=uiRoute.enabled;
if(uiRoute.url.href!==location.href)history.replaceState(null,'',uiRoute.url);
if(releaseEnabled){document.title=MOONFOREST_RELEASE_LABEL;document.documentElement.dataset.release=MOONFOREST_RELEASE;}
let character = uiRoute.character;
let uiTest=null;
let commercialUi, hudLayout, developerTools;
// Explicit review URLs use the same map, camera, rig and input system as play.
let elenaReviewMode=new URLSearchParams(location.search).get('elenaReview');
let elenaReview=null;
const bossSelection=new BossSelection();
if (!validCharacters.includes(character)) character = 'archer';
const isWarrior = () => character !== 'archer';
const isV2 = () => character === 'warrior-v2' || isWorldCharacter(character);
const isVillage = () => isWorldCharacter(character);
const isForest=()=>character==='warrior-v4';
const isPlains=()=>character==='warrior-plains';
const isCave=()=>character==='warrior-v5';
let resumePose=null;
const mapSpawn=()=>resumePose??worldSpawn(character,location.search,VILLAGE_SPAWN);
let mapPortal;
let chapterQuests;
let mapDeparture;
let mapTransition;
const movementLimit=(position=actor.position)=>world?.mapId==='village'?villageTravelLimit(position,ARENA_RADIUS):ARENA_RADIUS;
const plainsReviewEnabled=(import.meta.env.DEV||import.meta.env.MODE==='plains-review')&&new URLSearchParams(location.search).get('plainsReview')==='1';
const villageHorizon=import.meta.env.DEV&&new URLSearchParams(location.search).get('villageHorizon')==='1';
const villageOverview=import.meta.env.DEV&&!villageHorizon&&new URLSearchParams(location.search).get('villageOverview')==='1';
const villageReviewEnabled=import.meta.env.DEV&&isVillage()&&new URLSearchParams(location.search).get('villageReview')==='1';
const villageForceMobile=villageReviewEnabled&&new URLSearchParams(location.search).get('villageMobile')==='1';
let villageReview;
let engine, world, actor, controller, animator, container, config, input, reviewFocus, cameraZoom, cameraPitch, cameraPitchControls, cameraFollow;
let ready = false, loadingAsset = false, maxInfluences = 0, statusTime = 0, elapsed = 0;
let boss, combatResult, swordNode, shieldNode, damageNumbers, frameLoop, swordTrail;
const staminaFeedback=new StaminaFailureFeedback();
const staminaNoticeAnchor=new StaminaNoticeAnchor($('#toast'));
let simulateFrame=false,buttonSnapshot,healthSnapshot,bossHealthBars,playerHealthBar,playerHead;
let screenProjection;
let reconcilePlayback=()=>{};
let frameFailure=null;
function assertFrameHealthy(){
  if(frameLoop?.failed===true||frameFailure)throw new Error('게임 실행 오류: '+(frameFailure?.message??'화면 준비 중 실행이 중단되었습니다.'));
}
const touchDevice=villageForceMobile||matchMedia('(pointer: coarse)').matches;
const renderActivity=new RenderActivity(touchDevice);
let rollDirection={x:0,z:1};
const strikeSampler=new PlayerStrikeSampler();
let equipment, equipmentStorage;
try { equipmentStorage = localStorage; } catch { /* Private browsing can disable storage. */ }
const movementSpeedSettings=setupMovementSpeedSettings({host:$('#common-speed-settings .settings-section-body'),storage:equipmentStorage,onChange:value=>controller?.setMovementSpeed?.(value)});
const swordTrailSettings=setupSwordTrailSettings({host:$('.settings-display-options'),storage:equipmentStorage,onChange:value=>{swordTrail?.setEnabled(value);renderActivity.wake();frameLoop?.invalidate();}});
if(import.meta.hot)import.meta.hot.dispose(()=>swordTrailSettings.dispose());
const weatherSettings=setupWeatherSettings({host:$('.settings-display-options'),storage:equipmentStorage,getWorld:()=>world,onChange:()=>{renderActivity.wake();frameLoop?.invalidate();}});
const frameRateControl=setupFrameRateControl({select:$('#frame-rate-select'),storage:equipmentStorage,activity:renderActivity,onChange:fps=>{if(engine)engine.maxFPS=fps;}});
if(import.meta.hot)import.meta.hot.dispose(()=>frameRateControl.dispose());
const plainsViewDistanceControl=setupPlainsViewDistanceControl({select:$('#plains-view-distance-select'),storage:equipmentStorage,onChange:value=>{if(world)applyPlainsViewDistance(world,value);renderActivity.wake();frameLoop?.invalidate();}});
if(import.meta.hot)import.meta.hot.dispose(()=>plainsViewDistanceControl.dispose());
const bossPatternPanel=setupBossPatternPanel({storage:equipmentStorage,onChange:value=>boss?.setAttackSettings(value)});
const characterStylePanel=setupCharacterStylePanel({storage:equipmentStorage,onChange:value=>{if(world)setSceneCharacterStyles(world.scene,value);renderActivity.wake();frameLoop?.invalidate();}});
let travelStorage;
try { travelStorage=sessionStorage; } catch { /* Travel also works without state storage. */ }
let equipmentChoices = readEquipmentChoices(equipmentStorage);
const journeyStorage=uiTestEnabled?uiTestStorage(equipmentStorage):equipmentStorage;
if(uiTestEnabled)travelStorage=uiTestStorage(travelStorage);
const goldLoot=new GoldLoot({storage:journeyStorage,onBalance:value=>text('#gold-balance',`${value.toLocaleString()} G`)});
let goldLootView;
const minimap=new DotMinimap($('#dot-minimap'));
let minimapTravel;
const resumeStore=new MapResumeStore(journeyStorage);
function saveMapPosition(force=false){if(elenaReview||villageReviewEnabled||plainsReviewEnabled||!world||!actor)return;resumeStore.save({character,world,actor,camera:world.camera,ready:ready&&!loadingAsset&&(!mapTransition?.busy||force),alive:!controller?.dead&&boss?.playerAlive!==false,radius:playerDimensions(actor).moveRadius},performance.now(),{force});}
function restoreMapCamera(){if(!resumePose)return;actor.rotation.y=resumePose.yaw;const c=resumePose.camera;if(c){world.camera.alpha=c.alpha;world.camera.beta=Math.max(world.camera.lowerBetaLimit??.01,Math.min(world.camera.upperBetaLimit??3.13,c.beta));world.camera.radius=c.radius;cameraZoom.apply();}syncCameraFocus(0,{snap:true});resumePose=null;}
function showMinimap(){minimap.setWorld(world).catch(error=>{console.warn('[Minimap]',error);minimap.hide();});}
window.addEventListener('pagehide',()=>saveMapPosition(true));
document.addEventListener('visibilitychange',()=>{if(document.hidden)saveMapPosition(true);});
for (const slot of ['sword', 'shield']) {
  const select = $(`#${slot}-select`);
  for (const style of EQUIPMENT_STYLES) select.add(new Option(equipmentLabel(slot,style), style.id));
  select.value = equipmentChoices[slot];
  select.addEventListener('change', () => {
    if (!ready || !equipment) return;
    equipmentChoices[slot] = equipment.select(slot, select.value);
    if(boss)boss.combat.defense=equipmentStats(equipmentChoices).defense;
    audio.play('equip');
    saveEquipmentChoices(equipmentStorage, equipmentChoices);
    $('#equipment-status').textContent = `${equipmentLabel(slot,EQUIPMENT_STYLES.find(style => style.id === select.value))} 적용`;
  });
}
let training, projectiles, shotTarget = null, shotActionId = null, hiddenArrowForAction = null, arrowNode, arrowMesh;
const attackSources = new Set();
const attackPointerTypes = new Map();
const shieldInput=new ShieldHoldSources({
  onBegin:()=>{
    if(controller?.setShieldHeld?.(true)===false)return false;
    if(controller?.shieldPending||controller?.guarding){strikeSampler.reset();boss?.playerReaction.cancelRecoil();}
    return true;
  },
  onEnd:()=>{
    const pending=controller?.shieldPending;
    if(controller?.setShieldHeld?.(false)&&pending&&controller.action?.state==='shieldPush'&&!controller.guarding)chapterQuests?.action('shieldPush');
  },
  onCancel:()=>controller?.cancelShieldInput?.(),
});
let toastTimer;
let qualityMode = 'high';
try { qualityMode = localStorage.getItem('archer-render-quality') || 'high'; } catch { /* Storage may be unavailable in private browsing. */ }
if (!['high', 'balanced', 'battery'].includes(qualityMode)) qualityMode = 'high';
let renderViewportKey='';
const renderScaleControl=setupRenderScaleControl({host:$('.settings-display-options'),storage:equipmentStorage,touchDevice,onChange:()=>applyRenderQuality()});
if(import.meta.hot)import.meta.hot.dispose(()=>renderScaleControl.dispose());
const renderResolution=()=>renderResolutionSnapshot({engine,canvas,deviceRatio:window.devicePixelRatio,quality:qualityMode,touchDevice,percent:renderScaleControl.value});
const loadDiagnostics=new LoadDiagnostics();
const sceneDiagnostics=new SceneDiagnostics();
let playerTextureSelection=null;
// Copy only scalar work state so old delay events cannot change as streaming
// and candidate selection advance. No extra scene traversal is needed.
const mapWorkDiagnostics=()=>({
  renderResolution:renderResolution(),
  playerTextures:playerTextureSelection,
  activeMeshCandidates:world?.environment?.activeMeshCandidates?{...world.environment.activeMeshCandidates}:null,
  geometryWork:world?.environment?{
    completeSkips:world.environment.geometryCompleteSkips??null,
    demandEvaluations:world.environment.demandEvaluations??null,
    demandCacheHits:world.environment.demandCacheHits??null,
    recordsTotal:world.environment.demandRecordsTotal??null,
    recordsChecked:world.environment.demandRecordsChecked??null,
  }:null,
  textureWork:world?.environment?{
    asset:world.environment.highTexturePendingAsset??null,
    stage:world.environment.highTextureStage??null,
    lastPromoteMs:world.environment.highTextureLastPromoteMs??null,
  }:null,
});
const frameDiagnostics=createFrameDiagnostics({storage:equipmentStorage,loads:loadDiagnostics,
  onEnabled:enabled=>sceneDiagnostics.setEnabled(enabled,world?.scene),
  onDrawCpuEnabled:enabled=>sceneDiagnostics.setDrawCpuEnabled(enabled),
  onContinuousDraw:enabled=>sceneDiagnostics.setContinuous(enabled),
  onCollecting:active=>sceneDiagnostics.setActive(active),
  onMapChanged:()=>sceneDiagnostics.resetGpu('map'),
  onReset:()=>sceneDiagnostics.resetGpu('reset'),
  renderMetrics:()=>sceneDiagnostics.sample(),
  zoom:()=>cameraZoom?.snapshot()??null,
  memory:()=>readDiagnosticMemory(performance,{highTextureBytes:world?.environment?.highTextureBytes,highTextureBudget:world?.environment?.highTextureBudget,textures:world?.scene.textures.length,meshes:world?.scene.meshes.length,geometries:world?.scene.geometries.length}),
  metadata:()=>({...mapWorkDiagnostics(),sceneResources:world?.scene?{meshes:world.scene.meshes?.length??null,skeletons:world.scene.skeletons?.length??null,animationGroups:world.scene.animationGroups?.length??null,sdkActiveAnimatablesIncludingPaused:world.scene._activeAnimatables?.length??null,sceneObservers:{beforeRender:world.scene.onBeforeRenderObservable?.observers?.length??null,afterRender:world.scene.onAfterRenderObservable?.observers?.length??null,dispose:world.scene.onDisposeObservable?.observers?.length??null}}:null,summonPreparation:boss?.lastSummon??null,animationBindings:{player:animator?.inspectBindingCache?.()??null,enemies:(boss?.encounters??[]).map(enemy=>({kind:enemy.kind,active:enemy.active,state:enemy.brain?.state??null,bindings:enemy.animator?.inspectBindingCache?.()??null}))},playerResources:{hp:boss?.playerHp??null,maxHp:boss?.playerMaxHp??null,stamina:controller?.stamina??null,maxStamina:controller?.maxStamina??null},plainsViewDistance:world?{selected:plainsViewDistanceControl.value,applied:world.mapId==='great-plains',range:plainsRenderRange(world)}:null,questProps:chapterQuests?.propDiagnostics?.()??null,playerSize:actor?playerDimensions(actor):null,mapTransition:mapTransition?.inspect?.()??null,viewportResize:world?.viewportResize?.snapshot?.()??null,goldLootPreparation:goldLootView?.inspect?.()??null,lastFrameError:frameFailure,playback:{ready,loading:loadingAsset,running:frameLoop?.running,failed:!!(frameLoop?.failed||frameLoop?.loadingFailed),frames:frameLoop?.frames},character,quality:qualityMode,touchDevice,userAgent:navigator.userAgent,bundle:document.querySelector('script[type="module"][src]')?.getAttribute('src'),renderSize:engine?[engine.getRenderWidth(),engine.getRenderHeight()]:null,mapDecodeCache:inspectMapDecodeCache(engine),ktxWorker:inspectKtxWorkerPool(),meshoptWorker:inspectMeshoptWorkerPool(),skyLoad:world?.sky?.lastLoad??null,screenReady:world?.scene?.metadata?.screenReady??null,mapTerrainCache:inspectMapTerrainCache(engine),mapNavigationCache:inspectMapNavigationCache(engine),caveMaterials:world?.caveAtmosphere?.inspect()??null,cameraGuard:world?.caveCamera?.inspect()??null,resourceDownloads:world?.resourceDownloadStats??null,textureStreaming:world?.environment?Object.fromEntries(Object.entries(world.environment).filter(([key])=>key.startsWith('highTexture'))):null}),
  context:()=>({...mapWorkDiagnostics(),activity:[combatResult?.moving?'이동':null,input?.cameraPointers.size?'회전/시점 조작':null,world?.environment?.geometryPending?'모델 준비':null,world?.environment?.highTexturePending?'텍스처 준비':null].filter(Boolean).join(' · ')||'플레이',
    position:actor?[Math.round(actor.position.x*10)/10,Math.round(actor.position.z*10)/10]:null,
    camera:world?[world.camera.alpha,world.camera.beta,world.camera.radius].map(n=>Math.round(n*100)/100):null,
    cameraZoom:cameraZoom?.snapshot()??null,
    viewportResize:world?.viewportResize?.snapshot?.()??null,cameraFollow:cameraFollow?.snapshot()??null,cameraGuard:world?.caveCamera?.inspect()??null,
    geometryPending:world?.environment?.geometryPending??0,texturePending:world?.environment?.highTexturePending??0,
    map:character,bosses:boss?.encounters.filter(b=>b.active&&!b.corpseGone).map(b=>({kind:b.kind,phase:b.phase??null,state:b.brain?.state,hp:b.brain?.hp}))??[],
    renderSize:engine?[engine.getRenderWidth(),engine.getRenderHeight()]:null,targetFps:engine?.maxFPS??null})});
loadingView.setDiagnostics(()=>frameDiagnostics.snapshot());
const attackSpeedStorageKey=()=>isV2()?'warrior-v2-attack-speed-base-1.8':'archer-attack-speed';
function readAttackSpeed(){
  try{return normalizeAttackSpeed(Number(localStorage.getItem(attackSpeedStorageKey())??1));}
  catch{return 1;}
}
let attackSpeed=readAttackSpeed();
function applyAttackSpeed(value) {
  attackSpeed = normalizeAttackSpeed(value);
  controller?.setAttackSpeed(attackSpeed);
  $('#attack-speed').value = String(attackSpeed);
  $('#attack-speed-value').textContent = `${attackSpeed.toFixed(1)}×`;
  $('#attack-speed').setAttribute('aria-valuetext', `${attackSpeed.toFixed(1)}배`);
}
applyAttackSpeed(attackSpeed);
const motionSpeedControls=setupMotionSpeedControls({getController:()=>isV2()?controller:null,beforeOpen:()=>{cancelAttackInput();input?.reset();}});
const deathScreen=setupDeathScreen({beforeOpen:()=>{staminaNoticeAnchor.reset();staminaFeedback.reset(controller);applyPlayerFlash(container?.meshes,boss?.playerReaction,staminaFeedback);cancelAttackInput();input?.reset();audio.stopAll();audio.play('death');},onRestart:()=>{world.authoredMonsters?.leaveMap();resetBeforeBoss();world.storyboardEvents?.emit('restart');}});

function resizeScreenProjection(){
  if(!screenProjection)return;
  screenProjection.resize(canvas.clientWidth,canvas.clientHeight);
  staminaNoticeAnchor.setOffset(canvas.offsetLeft,canvas.offsetTop);
  // CSS env() resolves the phone's notch insets here, once per viewport change.
  // Damage/HUD layout consumes these numbers without frame-by-frame DOM reads.
  const style=getComputedStyle($('#app'));
  screenProjection.safeInsets=Object.fromEntries(['top','right','bottom','left'].map(side=>[side,Math.max(0,parseFloat(style.getPropertyValue(`--safe-inset-${side}`))||0)]));
}

function updateStaminaNotice(){staminaNoticeAnchor.update(screenProjection,actor,{visible:ready&&!loadingAsset&&!mapTransition?.busy&&isV2()&&!controller?.dead&&boss?.playerHp>0});}

function applyRenderQuality() {
  if (!engine) return;
  const ratio = renderPixelRatio(window.devicePixelRatio, qualityMode, touchDevice,renderScaleControl.value);
  const viewportKey=`${canvas.clientWidth}:${canvas.clientHeight}:${ratio}`;
  // Babylon divides CSS dimensions by this value. HiDPI requires its reciprocal.
  // setHardwareScalingLevel already resizes. Map arrival reapplies lighting,
  // but an unchanged canvas/scale must not reallocate its backing buffer.
  if(viewportKey!==renderViewportKey){
    if(engine.getHardwareScalingLevel()!==1/ratio)engine.setHardwareScalingLevel(1/ratio);
    else engine.resize();
    renderViewportKey=viewportKey;
  }
  resizeScreenProjection();
  renderActivity.wake();
  engine.maxFPS=renderActivity.limit({quality:qualityMode});
  world?.lighting.setQuality(qualityMode);
  $('#quality-select').value = qualityMode;
  if(!document.hidden)frameLoop?.invalidate();
}

function toast(message, {stamina=false}={}) {
  staminaNoticeAnchor?.reset();
  $('#toast').classList.toggle('stamina-notice',stamina);
  $('#toast').textContent = message; $('#toast').hidden = false;
  if(stamina)staminaNoticeAnchor?.show();
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { staminaNoticeAnchor?.reset();$('#toast').hidden = true; }, 4000);
}
function updateSummonControls(encounter=boss) {
  const selection=bossSelection.current(),disabled=!ready||!isV2()||!!encounter?.loading;
  $('#boss-kind').value=selection.kind;
  $('#boss-kind').disabled=disabled;
  $('#boss-count').value=String(selection.count);
  $('#boss-count').disabled=disabled;
  $('#summon-boss').disabled=disabled;
  $('#open-summon').disabled=disabled;$('#open-summon').hidden=!isV2();
  text('#boss-selection-help',bossSelectionHelp(selection));
  const present=encounter?.encounters.some(enemy=>enemy.kind===(selection.phase?'elena':'bear')&&(!selection.phase||enemy.phase===selection.phase));
  text('#summon-boss',encounter?.loading?'불러오는 중…':present?'보스 다시 소환':'보스 소환');
}

function leaveElenaReview() {
  elenaReviewMode=null;
  if(!elenaReview)return;
  elenaReview.reviewMode=false;
  elenaReview.reviewMovement={x:0,z:0,run:false};
  elenaReview=null;
  text('#attack-label','검 공격');
  text('#attack-hint','짧게 일반 · 길게 심판 · J');
  $('#attack-button').title='짧게 누르면 일반 공격 · 0.45초 길게 누르면 심판의 검';
}

function updateButtons() {
  const dead = controller?.dead || false;
  const rejected=controller?.staminaRejectSerial??0;
  if(staminaFeedback.observe(controller)){toast('스테미나가 부족합니다.',{stamina:true});audio.play('ui_error');applyPlayerFlash(container?.meshes,boss?.playerReaction,staminaFeedback);}
  const snapshot=[character,ready,dead,controller?.captured,controller?.groggy,controller?.runToggled,controller?.guardToggled,controller?.shieldHeld,controller?.guarding,boss?.active,boss?.playerAlive,boss?.loading,boss?.canUsePotion,boss?.canEscapeGrab,boss?.potions.remaining,boss?.potions.pulsesLeft,rejected].join('|');
  if(snapshot===buttonSnapshot)return;buttonSnapshot=snapshot;
  $('#run-button').setAttribute('aria-pressed', String(controller?.runToggled || false));
  $('#death-label').textContent = dead ? '부활' : '사망';
  $('#death-key').textContent = dead ? 'R' : 'K';
  $('#death-button').classList.toggle('dead', dead);
  if(isV2())$('#guard-button').setAttribute('aria-pressed',String(!!controller?.guarding));
  else $('#guard-button').setAttribute('aria-pressed', String(controller?.guardToggled || false));
  for (const button of buttons) button.disabled = !ready || controller?.captured || controller?.groggy || (dead && button.id !== 'death-button') || (boss?.active && !boss.playerAlive);
  if(ready&&isV2()&&!dead&&boss?.canEscapeGrab)$('#dodge-button').disabled=false;
  updateSummonControls();
  $('#summon-goblin').disabled=$('#goblin-count').disabled=$('#summon-boss').disabled;
  $('#boss-controls').hidden = !isV2();
  $('#potion-button').hidden=!isV2();
  $('#potion-button').disabled=!ready||!boss?.canUsePotion||controller?.captured||controller?.groggy;
  $('#potion-count').textContent=String(boss?.potions.remaining??3);
  $('#potion-status').textContent=boss?.potions.active?`회복 ${4-boss.potions.pulsesLeft}/4`:'E';
  $('#potion-button').classList.toggle('healing',!!boss?.potions.active);
  $('#potion-button').setAttribute('aria-label',`회복 물약, 남은 횟수 ${boss?.potions.remaining??3}회${boss?.potions.active?', 회복 중':''}`);
}
const actions = {
  move() { if(ready&&isV2())controller.requestMovement(); },
  guard() { if (ready && (!boss?.active || boss.playerAlive)) { if(isV2())startDefense('shieldPush');else controller.toggleGuard?.(); updateButtons(); } },
  setShieldHeld(held,source='keyboard',pointerType){
    if(!isV2()){if(held)actions.guard();return false;}
    if(held&&(!ready||controller.dead||controller.captured||controller.groggy||boss?.playerHp<=0))return false;
    return shieldInput.setHeld(source,held,pointerType);
  },
  cancelShieldInput(source){return shieldInput.cancel(source);},
  isHudShieldHeld(pointerType){return shieldInput.hasTouchHud(pointerType);},
  dodge() { if(ready&&isV2()&&(!boss?.active||boss.playerAlive))startDefense('dodge'); },
  setDodgeHeld(held,source='keyboard',pointerType){
    if(!held)return input?.dodgeSprintGesture?.end(source);
    if(!ready||!isV2()||controller.dead||boss.playerHp<=0||controller.groggy)return false;
    if(controller.captured){actions.dodge();return false;}
    return input?.dodgeSprintGesture?.begin(source,{pointerType});
  },
  cancelDodgeInput(source){return input?.dodgeSprintGesture?.cancel(source);},
  isHudDodgeHeld(pointerType){return input?.dodgeSprintGesture?.hasTouchHud(pointerType)??false;},
  potion() { if(ready&&isV2()&&!controller.captured&&!controller.groggy){if(boss.usePotion()){chapterQuests?.action('potion');audio.play('potion_drink');audio.play('heal_start',{volume:.65});}else audio.play('ui_error');updateButtons();} },
  attack() { if (ready && (!boss?.active || boss.playerAlive)) {if(elenaReview)elenaReview.requestReviewCast();else controller.attack();} },
  setAttackHeld(held, source = 'keyboard') { setAttackHeld(source, held); },
  cancelAttackInput(source) { cancelAttackInput(source); },
  isHudAttackHeld(pointerType) { return isHudAttackHeld(pointerType); },
  hit() { if (ready && !isWarrior()) { attackSources.clear();attackPointerTypes.clear(); controller.hit(); } },
  death() { if (!ready || isWarrior() || controller.dead) return; attackSources.clear(); controller.die(); input.reset(); updateButtons(); },
  revive() { if (!ready || !controller.dead) return; controller.revive();audio.setEnvironment(character);audio.play('revive'); input.reset(); updateButtons(); toast('다시 움직일 수 있습니다.'); },
  // Accept direction intent during locks; the controller still prevents displacement.
  canMove() { return ready && !controller.dead && (!boss?.active || boss.playerAlive); },
};

function startDefense(kind){
  const directionInput=input.value();
  if(kind==='dodge'&&controller.captured){if(!boss.escapeGrab())return;audio.play('grab_escape');}
  if(!controller[kind]())return;
  chapterQuests?.action(kind);
  if(!controller.held){attackSources.clear();attackPointerTypes.clear();}strikeSampler.reset();boss?.playerReaction.cancelRecoil();
  if(kind==='dodge'){
    rollDirection=dodgeDirection(directionInput,world.camera.alpha,actor.rotation.y);
    actor.rotation.y=Math.atan2(rollDirection.x,rollDirection.z);
  }
}

function resetBeforeBoss(){
  goldLoot.clearDrops();goldLootView.clear();
  audio.stopAll();actionAudio.reset();audio.play('revive');
  boss.resetBattle();audio.setEnvironment(character);controller.releaseCapture();controller.staggerRemaining=0;controller.hitPose=null;
  controller.resetStamina?.();
  staminaNoticeAnchor.reset();staminaFeedback.reset(controller);
  input.reset();attackSources.clear();strikeSampler.reset();combatResult=null;shotActionId=null;
  actor.rotationQuaternion=null;actor.rotation.set(0,config.forwardYaw||0,0);actor.position.setAll(0);
  if(isVillage()){actor.position.set(mapSpawn().x,0,mapSpawn().z);world.terrain.place(actor.position);}
  syncCaveFog(true);
  animator.transition('idle',{clipTime:0,loop:true,blendDuration:.001});animator.update(.2);
  applyHitFlash(container.meshes,0);resetCamera();updateButtons();canvas.focus({preventScroll:true});
  if(isCave())boss.activateResident(actor,{reset:true}).then(()=>prepareElenaReview()).catch(error=>{console.error('[Elena resident]',error);toast('엘레나를 불러오지 못했습니다.');});
}

function setAttackHeld(source, held, pointerType) {
  if(elenaReview){if(held&&ready)elenaReview.requestReviewCast();return;}
  if (held) {
    if (!ready || controller.dead || (boss?.active && !boss.playerAlive) || controller.setAttackHeld(true) === false) return;
    attackSources.add(source);
    if(source.startsWith('button:'))attackPointerTypes.set(source,pointerType??'unknown');
  } else {attackPointerTypes.delete(source);if(attackSources.delete(source))controller?.setAttackHeld(attackSources.size > 0);}
}

function isHudAttackHeld(pointerType) {
  let touch=false,mouse=false;
  for(const source of attackSources)if(source.startsWith('button:')){
    if(attackPointerTypes.get(source)==='mouse')mouse=true;else touch=true;
  }
  return touch&&(!!pointerType||!mouse);
}

function cancelAttackInput(source,{preserveCompletedCharge=false}={}) {
  if(source){attackPointerTypes.delete(source);if(!attackSources.delete(source)||attackSources.size)return;}
  else {attackSources.clear();attackPointerTypes.clear();}
  // A captured HUD pointer can be released by the browser before pointerup.
  // Stop holding, but retain an already accepted heavy attack for recovery.
  // Global blur/pause/cancel still clears everything, including this buffer.
  if(source&&preserveCompletedCharge){controller?.syncHeldCharge?.();if(controller?.queuedAttack==='judgment'){controller.setAttackHeld(false);return;}}
  if(controller?.cancelAttackInput)controller.cancelAttackInput();
  else controller?.setAttackHeld(false);
}

function faceHeading(heading, dt) {
  const delta = Math.atan2(Math.sin(heading - actor.rotation.y), Math.cos(heading - actor.rotation.y));
  actor.rotation.y += delta * (1 - Math.exp(-18 * dt));
}

function shootAtTarget() {
  actor.computeWorldMatrix(true);
  arrowNode?.computeWorldMatrix(true);
  const origin = arrowNode ? arrowNode.getAbsolutePosition().clone() : actor.position.add(new Vector3(0, 1.35, 0));
  const destination = shotTarget?.aimPoint.clone() || origin.add(new Vector3(Math.sin(actor.rotation.y), 0, Math.cos(actor.rotation.y)).scale(12));
  projectiles.fire(origin, destination, shotTarget);audio.play('bow_release',{position:origin});
}

function resetCamera() {
  if (!world) return;
  world.camera.alpha = Math.PI * .38; world.camera.beta = isVillage() ? .88 : isWarrior() ? 1.35 : 1.18;
  world.camera.radius = isVillage() ? (innerWidth < 600 ? 13 : 17) : innerWidth < 600 ? 6.5 : 4.8;
  if(isVillage()&&villageOverview){world.camera.upperRadiusLimit=155;world.camera.radius=133;world.camera.beta=.62;world.camera.alpha=Math.PI*.38;world.camera.setTarget(new Vector3(0,0,0),false,false,true);}
  if(isVillage()&&villageHorizon){world.camera.radius=18;world.camera.beta=1.3;}
  if(!villageOverview)cameraZoom?.apply();
  cameraPitch?.setWarrior(isWarrior());cameraPitchControls?.sync();
  frameDiagnostics.refresh();
  input.panOffset = { x: 0, y: 0, z: 0 };
  syncCameraFocus(0,{snap:true});
}

async function loadCharacter() {
  if (loadingAsset) return;
  world.storyboardEvents?.leaveMap();world.toolRecovery=null;world.toolGeneration=(world.toolGeneration??0)+1;world.toolLease?.cancel('reload',{restore:false});world.developmentEditor?.leaveMap();world.developmentCinema?.leaveMap();world.authoredDataLifetime?.abort();world.authoredPlacements?.leaveMap();
  world.developmentActors?.leaveMap();world.authoredMonsters?.leaveMap();world.developmentActorEditor?.leaveMap();world.npcWorld?.leaveMap();
  frameFailure=null;if(frameLoop){frameLoop.failed=false;frameLoop.loadingFailed=false;}
  loadDiagnostics.begin(isCave()?'마녀의 동굴':isPlains()?'대평원':isForest()?'마물의 숲':isVillage()?'마을':'캐릭터');
  loadingAsset = true; ready = false;staminaNoticeAnchor.reset();staminaFeedback.reset(controller);audio.stopAll();actionAudio.reset();updateButtons();
  boss?.combat?.passiveRecovery?.reset();
  const arrival=consumeTravel(travelStorage,character);
  resumePose=readMapResume(journeyStorage,character,world,{radius:WARRIOR_DIMENSIONS.moveRadius,portalArrival:!!arrival});
  world.caveFog?.update(mapSpawn(),elapsed,{force:true});
  const loadingGeneration=loadingView.begin(character);if(world.villageStreaming)world.villageStreaming.active=false;
  boss?.hide();combatResult=null;strikeSampler.reset();
  goldLoot.clearDrops();goldLootView?.clear();$('#gold-balance').hidden=!isV2();
  $('#equipment-panel').hidden = !isWarrior();
  $('#sword-select').disabled = true; $('#shield-select').disabled = true;
  $('#equipment-status').textContent = '';
  $('#character-select').disabled = true;
  input?.reset(); cancelAttackInput();
  $('#attack-button').classList.remove('is-charging');
  training.setSelected(null); projectiles.clear();
  try {
    await initializeResourceCache();
    if(villageReview)await villageReview.startLoad();
    const caps=engine.getCaps();
    // Retain the exact gate inputs even if selection fails before downloads.
    playerTextureSelection={status:'selecting',capabilities:playerTextureCapabilities(caps)};
    const selectedProfile=selectPlayerTextureProfile(character,caps);
    playerTextureSelection={status:'selected',...selectedProfile};
    const manifestName=selectedProfile.manifest;
    const manifestUrl = new URL(`${import.meta.env.BASE_URL}assets/${manifestName}.json`, location.href);
    resetCamera();
    if(isVillage()&&!villageOverview){world.camera.setTarget(new Vector3(mapSpawn().x,world.terrain.heightAt(mapSpawn().x,mapSpawn().z)+WARRIOR_DIMENSIONS.stableFocusHeight,mapSpawn().z));world.camera.getViewMatrix();world.camera.getProjectionMatrix();}
    loadDiagnostics.phase('download');
    if(isVillage()&&!villageReviewEnabled)config=await prepareStartupResources(world,manifestUrl,s=>{loadingView.download(s,loadingGeneration);loadDiagnostics.download(s);},s=>loadingView.stream(s));
    else {const response=await fetch(manifestUrl,{cache:'no-cache'});if(!response.ok)throw new Error('캐릭터 설정 파일을 불러오지 못했습니다.');config=await response.json();}
    loadDiagnostics.phase('model');loadingView.preparing(undefined,loadingGeneration);
    const skyReady=world.cave?Promise.resolve():world.sky.load(new URL(`${import.meta.env.BASE_URL}assets/sky.json`, location.href));
    if(isVillage()){
      await loadVillage(world);
      await world.loadAuthoredMap?.();
      await loadVillageTrainingTarget(world,training);
    }
    else await loadTrainingGround(world,training);
    await migrateCachedGlb(config, manifestUrl);
    const modelUrl = new URL(config.model, manifestUrl);
    const rootUrl = new URL('.', modelUrl).href;
    swordTrail?.clear();if (animator) animator.dispose();
    equipment?.dispose(); equipment = null;
    if (container) { for (const mesh of container.meshes) world.shadows.removeShadowCaster(mesh, false); container.dispose(); }
    if (actor) actor.dispose();
    container = await SceneLoader.LoadAssetContainerAsync(rootUrl, modelUrl.pathname.split('/').pop() + modelUrl.search, world.scene, null, modelUrl.pathname.endsWith('.gltf') ? '.gltf' : '.glb');
    container.addAllToScene();
    if (isWarrior()) equipment = new WarriorEquipment(container, equipmentChoices);
    for (const group of container.animationGroups) group.stop();
    actor = new TransformNode('player-world-transform', world.scene);
    if(isVillage()){actor.position.set(mapSpawn().x,0,mapSpawn().z);world.terrain.place(actor.position);}
    syncCaveFog(true);
    // World movement is separate from exported root motion, including the authored death fall.
    for (const node of new Set([...container.meshes, ...container.transformNodes])) if (!node.parent) node.parent = actor;
    const dimensions=configurePlayerSize(actor,config,{warrior:isV2()});
    cameraPitch.setBodyScale(dimensions.ratio);
    actor.rotation.y = config.forwardYaw || 0;
    maxInfluences = 0;
    for (const mesh of container.meshes) {
      if (!mesh.getTotalVertices()) continue;
      if(isV2())mesh.metadata={...mesh.metadata,moonforestPlayerFlash:true};
      mesh.isPickable = false;
      if (mesh.skeleton) {
        const extra = mesh.isVerticesDataPresent(VertexBuffer.MatricesWeightsExtraKind);
        if (extra) mesh.numBoneInfluencers = 8;
        maxInfluences = Math.max(maxInfluences, mesh.numBoneInfluencers);
        mesh.skeleton.useTextureToStoreBoneMatrices = true;
        // The shader keeps JOINTS_1 / WEIGHTS_1. Never truncate weights to make a device faster.
        mesh.computeBonesUsingShaders = true;
        mesh.alwaysSelectAsActiveMesh = true;
      }
      world.shadows.addShadowCaster(mesh, false);
    }
    world.lighting.registerMeshes(container.meshes);
    applyPlayerDetail(container,world.camera);
    applyCharacterSurfaceStyle(container,'player');
    if (isWarrior()) attachCharacterOutlines(container, 'warrior');
    if (config.expectedMaxBoneInfluences && maxInfluences < config.expectedMaxBoneInfluences) throw new Error('모델의 스키닝 가중치가 설정과 일치하지 않습니다. 내보낸 파일을 확인해야 합니다.');
    animator = new CharacterAnimator(container.animationGroups, config.animations,{bindingCacheSize:isV2()?2:0});
    const speeds=isV2()?Object.fromEntries(Object.entries(config.speeds??{}).map(([key,value])=>[key,value*dimensions.ratio])):config.speeds;
    controller = new (isV2() ? WarriorV2Controller : isWarrior() ? NativeWarriorController : CharacterController)({ durations: animator.durations, speeds, ...(isV2()?{holdNow:()=>performance.now()}:{}) });
    movementSpeedSettings.apply(controller);
    applyAttackSpeed(readAttackSpeed());
    if(isV2())motionSpeedControls.apply(controller);
    motionSpeedControls.setVisible(isV2());
    arrowNode = container.transformNodes.find(node => node.name === 'arrow');
    arrowMesh = container.meshes.find(mesh => mesh.name === 'Azure_Arrow');
    reviewFocus = isWarrior() ? container.transformNodes.find(node => node.name === 'mixamorig:Hips') : null;
    playerHead = container.transformNodes.find(node => node.name === 'mixamorig:Head');
    shieldNode = container.transformNodes.find(node=>node.name==='Bunnyguard_Shield') || container.meshes.find(node=>node.name==='Bunnyguard_Shield');
    swordNode = container.transformNodes.find(node => node.name === 'Golden_Oathblade') || container.meshes.find(node => node.name === 'Golden_Oathblade');
    boss.playerNodes=Object.fromEntries(container.transformNodes.map(node=>[node.name,node]));
    attackSources.clear();attackPointerTypes.clear(); shotTarget = null; shotActionId = null; hiddenArrowForAction = null;
    projectiles.clear();
    animator.transition('idle', { clipTime: 0, loop: true });
    // Loading can finish while iOS has paused RAF. Sample the actual idle now,
    // rather than revealing the exported bind pose until a simulation tick.
    animator.update(0);
    $('#sword-select').disabled = !equipment; $('#shield-select').disabled = !equipment;
    $('#build-tag').textContent = isCave()?'CAVERN / 05':isPlains()?'PLAINS / 06':isForest()?'FOREST / 04':isVillage() ? 'VILLAGE / 03' : config.version || 'ARCHER / 01';
    $('#character-select').value = releaseSelectionValue(releaseEnabled,character,uiTestEnabled);
    $('#character-name').textContent = isCave()?'Violet Vanguard v5':isPlains()?'Violet Vanguard · 대평원':isForest()?'Violet Vanguard v4':isVillage() ? 'Violet Vanguard v3' : isV2() ? 'Violet Vanguard v2' : isWarrior() ? 'Violet Vanguard' : 'Azure Elf';
    $('#character-subtitle').textContent = isCave()?'마녀의 동굴':isPlains()?'대평원':isForest()?'마물의 숲':isVillage() ? (world.environment.mode==='village-fixture'?`개발 배치 검수 · 실제 모델 ${world.environment.sourceAssets} / 25 · 빈 부지는 윤곽 표시`:'숲의 경계 마을') : isWarrior() ? '보랏빛 선봉의 전사' : '푸른 숲의 궁수';
    $('#character-eyebrow').textContent = isWarrior() ? 'THE VIOLET VANGUARD' : 'THE MOONLIT RANGER';
    $('.character-caption').textContent = isV2() ? '한손 베기 1타 ↔ 베고 찌르기 2타 · 길게: 심판 3타' : isWarrior() ? '이동하면 달리기 · J 또는 공격 버튼으로 찌르기·베기' : '가까운 허수아비를 자동으로 조준합니다.';
    $('.action-controls').hidden = false;
    $('.action-controls').dataset.character = isV2()?'warrior-v2':character;
    $('#run-button').hidden = isWarrior();
    $('.secondary-actions').hidden = isWarrior();
    $('#hit-button').hidden = isWarrior(); $('#death-button').hidden = isWarrior();
    $('.keyboard-hint strong').textContent = isWarrior() ? '달리기 이동' : '이동';
    $('.keyboard-hint small').textContent = isV2() ? 'J 공격 · 길게 심판 · F 짧게 밀치기 / 길게 방어 · Space 짧게 회피 / 길게 질주' : isWarrior() ? 'J 공격 · 공격 후 이동 재개' : 'Shift 달리기 · J 공격';
    $('#attack-label').textContent = isWarrior() ? '검 공격' : '활 공격';
    $('#attack-hint').textContent = isV2() ? '짧게 일반 · 길게 심판 · J' : isWarrior() ? '길게 눌러 연속 검술 · J' : '길게 눌러 연사 · J';
    $('#attack-button').title = isV2() ? '짧게 누르면 일반 공격 · 0.45초 길게 누르면 심판의 검' : '길게 누르면 연속 공격';
    $('#attack-icon').setAttribute('d', isWarrior() ? 'M9 35 31 13 35 5 27 9 5 31m3-6 11 11m-10-5-5 5' : 'M12 5c21 7 21 27 0 34M12 5l11 17-11 17M5 22h34m-6-5 6 5-6 5');
    $('#guard-button').hidden = !isV2();
    $('#dodge-button').hidden = !isV2();
    $('#dodge-button').title='짧게 누르고 떼면 회피 · 0.2초 이상 누르는 동안 질주 · Space';
    $('#dodge-button').setAttribute('aria-label','회피, 길게 누르면 질주');
    $('#guard-button span').textContent = '방패 밀치기';
    $('#guard-button').title='짧게 누르고 떼면 방패 밀치기 · 0.2초 이상 누르는 동안 방어 · 스태미나 초당 5 · F';
    $('#guard-button').setAttribute('aria-label','방패 밀치기, 길게 누르면 방어 태세');
    canvas.setAttribute('aria-label', isWarrior() ? '전사 3D 화면. WASD 달리기 이동. 좌클릭 또는 J: 짧게 일반 공격, 길게 강공격. 우클릭 드래그 회전, 휠 확대 축소.' : '궁수 3D 검수 화면. WASD 이동, J 공격, H 피격, K 쓰러짐, R 부활.');
    if(isVillage()&&arrival){boss.combat.hp=arrival.hp;boss.potions.remaining=arrival.potions;}
    resetCamera();
    // First entry faces the warrior; an explicit portal arrival or saved
    // camera keeps its own orientation, preserving map continuity/resume.
    if(isV2()&&!arrival&&!resumePose&&!villageOverview&&!villageHorizon&&!elenaReviewMode){world.camera.alpha=Math.PI/2+actor.rotation.y-(config.forwardYaw||0);world.camera.beta=1.25;syncCameraFocus(0,{snap:true});}
    restoreMapCamera(); updateButtons();
    await skyReady;
    if(isCave())await boss.activateResident(actor);
    await prepareElenaReview();world.authoredPlacements?.update(0,actor);
    loadDiagnostics.phase('screen');
    // Keep the loading artwork through shader readiness and the first correctly
    // configured character/UI frame. Do not expose the legacy default scene.
    assertFrameHealthy();updatePlainsBoundaryAtmosphere(world,actor.position,true);syncCaveFog(true);world.scene.render();await chapterQuests?.prepareEffects();await world.goldLootView?.prepare();await waitForSceneReady(world.scene,{onProgress:progress=>loadingView.preparing(progress,loadingGeneration)});
    assertFrameHealthy();world.scene.render();ready=true;audio.setEnvironment(character);updateButtons();render(0);
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    assertFrameHealthy();
    loadingView.reveal(loadingGeneration);showMinimap();if(world.villageStreaming)world.villageStreaming.active=true;
    loadDiagnostics.finish();
    if (!motionSpeedControls.isOpen()) canvas.focus({ preventScroll: true });
    frameLoop?.invalidate();
  } catch (error) {
    loadDiagnostics.finish(error.message);
    ready=false;loadingAsset=false;if(frameLoop){frameLoop.loadingFailed=true;frameLoop.setPaused(true);}audio.setSuspended(true);
    console.error('[Archer asset load]', error);
    const timedOut=error.name==='TimeoutError'||/시간.*초과/.test(error.message);
    world.cancelResourceDownloads?.();
    loadingView.fail(frameFailure?'게임 실행이 중단되었습니다':timedOut?'불러오기 시간이 초과되었습니다':'캐릭터를 불러오지 못했습니다',frameFailure?'다시 불러오기를 눌러 주세요. '+frameFailure.message:timedOut?'준비 작업의 응답이 없어 중단했습니다. 아래 버튼으로 다시 시도해 주세요.':'아래 오류 내용과 진단 복사 버튼으로 기록을 전달할 수 있습니다.',{error:frameFailure??error,phase:loadDiagnostics.snapshot()?.failedPhase??'startup'});
    equipment?.dispose(); equipment = null;
    if (container) container.dispose(); container = null;
    updateButtons();
  } finally { loadingAsset = false; $('#character-select').disabled = false;if(ready){world.storyboardEvents?.emit('map-enter',{mapId:world.mapId});if(!world.storyboardOpening&&!world.storyboardGameStarted){world.storyboardGameStarted=true;world.storyboardEvents?.emit('game-start',{mapId:world.mapId});}mapTransition?.recover();reconcilePlayback();world.developmentCinema?.notifyReady();world.developmentEditor?.notifyReady?.();world.authoringNavigation?.notifyReady();} }
}

async function retryLoading(){
  if(loadingAsset||mapTransition?.busy)return;
  if(loadingView.retryPageIfRequired(location))return;
  if(mapTransition?.failed&&!frameFailure)await mapTransition.retry();
  else await loadCharacter();
}

function constrainPlayerPosition(previous){
  world.navigation.constrain(actor.position,previous,playerDimensions(actor).moveRadius,movementLimit(previous));
  if(world.mapId==='village')clampVillageExit(actor.position,previous);
}

async function prepareElenaReview(){
  elenaReview=null;
  if(!isCave()||!['saint','witch','battle'].includes(elenaReviewMode))return;
  if(elenaReviewMode==='witch'){boss.residentPhase=2;await boss.activateResident(actor);}
  const resident=boss.encounters.find(e=>e.kind==='elena');if(!resident)return;
  actor.position.set(29,0,-21.5);world.terrain.place(actor.position);actor.rotation.y=Math.PI;
  if(elenaReviewMode!=='battle'){elenaReview=resident;resident.reviewMode=true;resident.reviewMovement={x:0,z:0};}
  world.camera.alpha=Math.PI/2;world.camera.beta=1.25;world.camera.radius=8.5;
  world.camera.setTarget(resident.actor.position.add(new Vector3(0,resident.reviewFocusHeight??1.1,0)));
  toast(elenaReview?'엘레나 검수 · WASD/스틱 이동 · 좌클릭/J/공격 버튼으로 마법 · 카메라 회전 가능':'엘레나 2단계 전투 검수 · 성녀를 쓰러뜨리면 광폭화합니다');
}

function updateHealthBars() {
  bossHealthBars.update(world.scene,boss.encounters,screenProjection,{playerPosition:actor?.position});
  const nearGiant=ready&&isV2()&&world.cave&&boss.playerHp>0&&boss.encounters.some(enemy=>enemy.active&&enemy.phase===2&&enemy.brain.hp>0&&enemy.renderVisible!==false&&enemy.fogVisible!==false&&Vector3.DistanceSquared(actor.position,enemy.actor.position)<=6.5*6.5);
  const markerClear=nearGiant&&cavePlayerMarkerClear(world.terrain,world.camera.globalPosition,actor.position);
  playerHealthBar.update(world.scene,{visible:ready&&isV2(),actor,head:playerHead,hp:boss.playerHp,maxHp:boss.playerMaxHp,stamina:controller?.stamina??100,maxStamina:controller?.maxStamina??100,marker:{enabled:nearGiant,clearToPlayer:markerClear,groundY:actor?world.terrain.heightAt(actor.position.x,actor.position.z):0}},screenProjection);
}

function syncCaveFog(force=false){if(actor&&!actor.isDisposed())world.caveFog?.update(actor,elapsed,{force,encounters:boss?.encounters??[]});}

function syncCameraFocus(dt,{snap=false}={}){
  if(!actor||actor.isDisposed()||!cameraPitch)return;
  const focus=elenaReview?elenaReview.actor.position.add(new Vector3(0,elenaReview.reviewFocusHeight??1.45,0)):cameraFollow.focus(actor,playerHead,boss?.nearestTarget(actor.position)?.actor.position,world.camera.radius),pan=input?.panOffset??{x:0,y:0,z:0};
  const target=(isVillage()&&villageOverview?Vector3.Zero():focus).add(new Vector3(pan.x,pan.y,pan.z));
  cameraPitch.follow(target,dt,{snap});
  world.caveCamera?.follow(target,dt,{stable:!cameraFollow.settings.followMotion});
}

function render(dt) {
  if(mapDeparture?.departing)return;
  world.storyboardOpening?.update();
  world.storyboardEvents?.update();
  if(world.storyboardDeathPlayback){const events=world.storyboardEvents?.inspect();if(!events||!events.active&&!events.queued){world.storyboardDeathPlayback=false;deathScreen.show();return;}}
  if(world.storyboardExitPending){const events=world.storyboardEvents?.inspect();if(!events||!events.active&&!events.queued){world.storyboardExitPending=false;world.showGameExit?.();return;}}
  if((ready||world.toolLease?.active)&&!loadingAsset&&!mapTransition?.busy&&!world.storyboardOpening?.blocksStoryboard&&!world.storyboardEvents?.inspect().active)world.developmentStoryboardLive?.update();
  if(ready&&!loadingAsset&&!mapTransition?.busy&&world.authoringReadyGeneration!==(world.toolGeneration??0)){
    world.authoringReadyGeneration=world.toolGeneration??0;world.developmentEditor?.notifyReady?.();world.developmentCinema?.notifyReady();world.authoringNavigation?.notifyReady();void world.restoreNpcActors?.();
  }
  if(world.toolLease?.active){
    simulateFrame=false;boss?.combat?.passiveRecovery?.reset();world.toolLease.update(dt);
    if(!world.toolLease?.active)return;
    world.camera.update();world.camera.getViewMatrix();world.camera.getProjectionMatrix();
    const toolFocus=world.camera.getTarget();
    world.villageVisibility?.update(world.camera.globalPosition,toolFocus,dt);world.treeOcclusion?.update(world.camera.globalPosition,toolFocus,dt,playerDimensions(actor));
    world.lighting.follow(toolFocus);world.scene.render(false);return;
  }
  if(cinematicAuthoringPreview){
    simulateFrame=false;boss?.combat?.passiveRecovery?.reset();const focus=world.camera.getTarget();
    world.villageVisibility?.update(world.camera.globalPosition,focus,dt);world.treeOcclusion?.update(world.camera.globalPosition,focus,dt,playerDimensions(actor));world.lighting.follow(focus);world.scene.render(false);return;
  }
  simulateFrame=dt>0&&!world.storyboardOpening?.blocksGame&&!world.storyboardExitPending;
  if(!simulateFrame||!ready||loadingAsset||mapTransition?.busy)boss?.combat?.passiveRecovery?.reset();
  if(!simulateFrame){syncCameraFocus(0);world.caveCamera?.beginFrame();syncCaveFog();world.scene.render(!world.caveCamera?.applied);screenProjection.beginFrame();updateStaminaNotice();updateHealthBars();goldLootView.project(screenProjection);world.caveCamera?.endFrame();return;}
  const framePreludeStart=frameDiagnostics.mark();
  elapsed += dt;
  world.tick(elapsed);
  training.update(dt);
  projectiles.update(dt);
  if (ready) {
    if(isV2()){
      const beforeRecoil=actor.position.clone();
      const recoiled=boss.playerReaction.update(dt,actor);
      staminaFeedback.advance(dt);applyPlayerFlash(container.meshes,boss.playerReaction,staminaFeedback);
      if(recoiled)constrainPlayerPosition(beforeRecoil);
    }
    const rawMovement=input.value();
    if(elenaReview){
      const length=Math.hypot(rawMovement.x,rawMovement.y),direction=length>.08?dodgeDirection(rawMovement,world.camera.alpha,elenaReview.actor.rotation.y):{x:0,z:0};
      elenaReview.reviewMovement={x:direction.x*Math.min(1,length),z:direction.z*Math.min(1,length),run:rawMovement.run||controller.runToggled};
    }
    const movement = elenaReview||(boss?.active&&!boss.playerAlive)?{x:0,y:0}:rawMovement;
    if(boss?.active&&!boss.playerAlive)cancelAttackInput();
    input.dodgeSprintGesture?.advance(dt);
    movement.alive=!controller.dead&&boss.playerHp>0;
    const playerControllerStart=frameDiagnostics.mark();
    const result = controller.update(dt, movement);
    frameDiagnostics.measure('playerControllerMs',playerControllerStart);
    if(isV2()&&result.rollFrom!=null){
      const beforeRoll=actor.position.clone();
      const distance=(dodgeDistanceAt(result.rollTo,config.dodge)-dodgeDistanceAt(result.rollFrom,config.dodge))*playerDimensions(actor).ratio;
      actor.position.x+=rollDirection.x*distance;actor.position.z+=rollDirection.z*distance;
      constrainDodge(actor.position,beforeRoll,world.navigation,boss.encounters,movementLimit(beforeRoll),playerDimensions(actor));
      if(world.mapId==='village')clampVillageExit(actor.position,beforeRoll);
    }
    if(isV2()){
      $('#attack-button').classList.toggle('is-charging',result.chargeProgress>0);
      const progress=String(result.chargeProgress||0);
      if($('#attack-button').style.getPropertyValue('--charge-progress')!==progress)$('#attack-button').style.setProperty('--charge-progress',progress);
      text('#attack-label',elenaReview?'마법 시전':result.chargeProgress>0?'심판 준비':'검 공격');
      if(elenaReview)text('#attack-hint',elenaReview.phase===2?'5가지 패턴 순환 · J':'7가지 마법 모션 순환 · J');
    }
    combatResult=result;
    chapterQuests?.strike(result,actor.position);
    const busy=!!elenaReview||result.moving||result.state!=='idle'||result.chargeProgress>0||attackSources.size>0||input.cameraPointers.size>0||boss.combatCount>0||boss.loading;
    const frameLimit=renderActivity.limit({busy,quality:qualityMode});
    if(engine.maxFPS!==frameLimit)engine.maxFPS=frameLimit;
    const playerAnimationStart=frameDiagnostics.mark();
    animator.transition(result.state, result); animator.update(result.captured||result.staggered||result.hitStopped?0:dt);
    frameDiagnostics.measure('playerAnimationMs',playerAnimationStart);
    const attacking = !result.captured&&!result.staggered&&['attack', 'moveAttack','slash','judgment','shieldPush'].includes(result.state);
    if (attacking && result.actionId !== shotActionId) {
      shotActionId = result.actionId;
      shotTarget = isWarrior() ? null : training.selectNearest(actor.position);
      hiddenArrowForAction = null;
      const target=isV2()?boss.nearestTarget(actor.position):null;
      if(isV2()&&Math.hypot(movement.x||0,movement.y||0)>.08){
        const d=dodgeDirection(movement,world.camera.alpha,actor.rotation.y);
        actor.rotation.y=Math.atan2(d.x,d.z)+(PLAYER_STRIKE_AIM_YAW[result.state]??0);
      }else if(target&&Vector3.Distance(actor.position,target.actor.position)<(target.meleeAimDistance??4)){const d=target.actor.position.subtract(actor.position);actor.rotation.y=Math.atan2(d.x,d.z)+(PLAYER_STRIKE_AIM_YAW[result.state]??0);}
    }
    const selectedTarget = controller.dead ? null : attacking ? shotTarget : isWarrior() ? null : training.selectNearest(actor.position);
    training.setSelected(selectedTarget);
    let sprintRequested=0,sprintActual=0;
    if (result.moving) {
      const beforeMove=actor.position.clone();
      const alpha = world.camera.alpha;
      const forward = new Vector3(-Math.cos(alpha), 0, -Math.sin(alpha));
      const right = new Vector3(-forward.z, 0, forward.x);
      const direction = forward.scale(movement.y).add(right.scale(movement.x)).normalize();
      actor.position.addInPlace(direction.scale(result.speed * (result.movementDt??dt)));
      constrainPlayerPosition(beforeMove);
      sprintRequested=result.speed*(result.movementDt??dt);sprintActual=Math.hypot(actor.position.x-beforeMove.x,actor.position.z-beforeMove.z);
      if (!attacking || !shotTarget) faceHeading(Math.atan2(direction.x, direction.z) + (config.forwardYaw || 0), dt);
    }
    controller.commitSprintMovement?.(sprintRequested,sprintActual);
    // Authored jump/roll poses remain local to the actor. Only its ground anchor
    // follows terrain; a boss holding or throwing the actor owns its altitude.
    if(!result.captured&&!boss.grab.active)world.terrain.place(actor.position);
    if (attacking && shotTarget && !isWarrior()) {
      const direction = shotTarget.aimPoint.subtract(actor.position);
      faceHeading(Math.atan2(direction.x, direction.z) - (config.attackYaw?.[result.state] || 0), dt);
    }
    for (const event of result.events || []) if (event.type === 'release') {
      shootAtTarget(); hiddenArrowForAction = event.actionId;
    } else if (event.type === 'strike' && shotTarget && Vector3.Distance(actor.position, shotTarget.position) <= 1.65) {
      training.hit(shotTarget);
    }
    if (arrowMesh) arrowMesh.visibility = attacking && hiddenArrowForAction === result.actionId ? 0 : 1;
    const actionAudioStart=frameDiagnostics.mark();
    actionAudio.player(result,dt,{character,position:actor.position,duration:animator.durations[result.state],clipTime:animator.active.get(result.state)?.clipTime,strideScale:playerDimensions(actor).ratio});
    frameDiagnostics.measure('actionAudioMs',actionAudioStart);
    world.developmentActors?.beforeBattle(dt,actor);world.authoredMonsters?.beforeBattle(dt,actor);
    frameDiagnostics.measure('framePreludeMs',framePreludeStart);
    const bossUpdateStart=frameDiagnostics.mark();boss?.update(dt,actor);frameDiagnostics.measure('bossUpdateMs',bossUpdateStart);audio.setBossContext(boss?.encounters);actionAudio.boss(boss,dt);
    world.developmentActors?.afterBattle(actor);world.authoredMonsters?.afterBattle(actor);
    boss?.combat?.recover?.(dt,actor,boss.onDamage,!controller.dead&&boss.playerHp>0);
    const collected=goldLoot.update(dt,actor.position,isV2()&&!controller.dead&&boss.playerAlive&&!controller.captured,(a,b)=>!world.navigation||world.navigation.segmentClear(a,b,0,true));
    if(collected.length){const amount=collected.reduce((sum,drop)=>sum+drop.amount,0);damageNumbers.show(actor.position.add(new Vector3(0,playerDimensions(actor).goldHeight,0)),`+${amount} G`,false,'gold');audio.play('gold_pickup');}
    goldLootView.sync(goldLoot.drops);
    const worldUpdateStart=frameDiagnostics.mark();syncCameraFocus(dt);
    world.caveCamera?.beginFrame();
    if(isVillage()){world.camera.getViewMatrix();world.camera.getProjectionMatrix();}
    updatePlainsBoundaryAtmosphere(world,actor.position);world.lighting.follow(actor.position);
    for(const enemy of boss.encounters)enemy.updateRenderRange(world.camera.globalPosition);
    syncCaveFog();
    world.treeOcclusion?.update(world.camera.globalPosition, actor.position, dt,playerDimensions(actor));
    world.villageVisibility?.update(world.camera.globalPosition, actor.position, dt);
    frameDiagnostics.measure('worldUpdateMs',worldUpdateStart);
    const hudUpdateStart=frameDiagnostics.mark();
    text('#state-label', result.captured?boss.grab.label:result.groggy?'그로기 · 행동 불가':result.staggered?'피격 · 경직':result.guarding?'방어 태세':result.chargeProgress>0?'심판 준비':isV2() ? V2_LABELS[result.state] : isWarrior() ? { idle:'대기', run:'달리기', attack:'찌르기·베기' }[result.state] : STATE_LABELS[result.state]);
    text('#speed-label', `${result.speed.toFixed(2)} m/s`);
    text('#target-label', isV2() ? '검·방패 장착 · 검술 3종 / 방패 밀치기' : isWarrior() ? '검·방패 장착 · 달리기 / 찌르기·베기' : selectedTarget ? `${selectedTarget.name} · 명중 ${selectedTarget.hits}` : controller.dead ? '부활하면 전투를 재개합니다' : '허수아비 가까이 이동하세요');
    updateButtons();mapPortal?.update(dt);minimap.update(actor,elapsed);saveMapPosition();uiTest?.update(elapsed);world.authoredInteractions?.update(elapsed);
    frameDiagnostics.measure('hudUpdateMs',hudUpdateStart);
  }
  statusTime += dt;
  if (statusTime > .5) { const fps=Math.round(engine.getFps());text('#live-fps',`${fps} FPS`);$('#render-status').textContent = `${fps} FPS · ${engine.getRenderWidth()}×${engine.getRenderHeight()} · 최대 ${engine.maxFPS} FPS · ${ready ? 'LIVE' : 'LOADING'}`; statusTime = 0; }
  const sceneCallStart=frameDiagnostics.mark();
  world.scene.render(!world.caveCamera?.applied);
  frameDiagnostics.measure('sceneCallMs',sceneCallStart);
  const projectedHudStart=frameDiagnostics.mark();
  screenProjection.beginFrame();
  updateStaminaNotice();
  damageNumbers?.update(dt,screenProjection);
  goldLootView.project(screenProjection);
  updateHealthBars();
  world.caveCamera?.endFrame();
  frameDiagnostics.measure('hudUpdateMs',projectedHudStart);
}

function bindMapPortal(disarmRoadDestination=null){
  mapPortal?.dispose();
  mapPortal=createMapPortal(world,{button:$('#map-travel'),persistTravel:false,disarmRoadDestination,
    getState:()=>({position:actor?.position,loading:!ready||loadingAsset||mapTransition?.busy||boss.loading,dead:controller?.dead||boss.playerHp<=0,captured:controller?.captured||controller?.groggy,healing:boss.potions.active,enemies:boss.combatCount,hp:boss.playerHp,potions:boss.potions.remaining}),
    onTravel:(url,portal)=>{const boundary=portal.roadPassage?captureVillagePlainsHandoff(character,portal.destination,actor,world.camera,input.panOffset):null;mapTransition.travel(url,boundary?{boundary}:undefined);}});
}

function travelFromMinimap(href){
  const waypoint=travelWaypoint(href);
  if(waypoint&&character===waypoint.character&&world.mapId===waypoint.map){
    if(!ready||loadingAsset||mapTransition?.busy||mapTransition?.failed||controller.dead||controller.captured||controller.groggy||boss.playerHp<=0||boss.loading||boss.potions.active||boss.combatCount>0){toast('현재는 이동할 수 없습니다.');return false;}
    if(!world.navigation.free(waypoint.position,playerDimensions(actor).moveRadius,movementLimit(waypoint.position))){toast('이동할 위치를 사용할 수 없습니다.');return false;}
    input.reset();cancelAttackInput();boss.combat?.passiveRecovery?.reset();
    actor.position.set(waypoint.position.x,0,waypoint.position.z);world.terrain.place(actor.position);
    applyMinimapArrivalPose(actor,world.camera,input.panOffset,{destination:character,position:waypoint.position,waypoint});
    syncCameraFocus(0,{snap:true});syncCaveFog(true);world.lighting.follow(actor.position,true);saveMapPosition(true);return true;
  }
  return mapTransition.travel(href,{minimap:true});
}

try {
  if (!Engine.isSupported()) throw new Error('이 브라우저에서 WebGL을 사용할 수 없습니다.');
  engine = new Engine(canvas, true, { preserveDrawingBuffer: false, stencil: true, powerPreference: 'high-performance',loseContextOnDispose:true });
  engine.maxFPS=renderActivity.limit();
  // The Studio controls live outside the preview iframe. Moving focus to
  // those controls blurs its window even while the document stays visible.
  // Actual hidden/modal suspension is still owned by syncPlayback below.
  engine.renderEvenInBackground=cinematicAuthoringPreview;
  applyRenderQuality();
  world = createWorld(engine,{village:isVillage(),forest:isForest(),cave:isCave(),plains:isPlains(),warrior:isWarrior(),touchDevice});
  world.weather=weatherSettings;weatherSettings.mapChanged();
  world.frameDiagnostics=frameDiagnostics;
  if(releaseEnabled){
    world.loadAuthoredMap=async()=>{
      const mapId=world.mapId;
      try{const result=await loadAuthoredMap(world,{storage:journeyStorage,onCommit:()=>minimap.invalidate(world)});world.authoredMapError=null;return result;}
      catch(error){if(error.name!=='AbortError'&&mapId===world.mapId){world.authoredMapError=error.message;console.error('[Authored map]',error);toast('배치를 적용하지 못했습니다: '+error.message);}return null;}
    };
    world.acquireToolLease=async options=>{
      const {acquireGameToolLease}=await import('./game-tool-lease.js');
      return acquireGameToolLease({world,root:$('#app'),canvas,input,audio,
        getState:()=>({ready,loading:loadingAsset||!!mapTransition?.busy,dead:(controller?.dead||boss?.playerHp<=0)&&!(world.storyboardDeathPlayback&&String(options.owner??'').startsWith('cinematic-')),hidden:document.hidden,settings:!!document.querySelector('dialog[open]'),failed:frameLoop?.failed===true||mapTransition?.failed===true}),
        setReady:value=>{ready=value;updateButtons();},resetInput:()=>{input?.reset();cancelAttackInput();},reconcile:()=>reconcilePlayback()},options);
    };
  }
  applyPlainsViewDistance(world,plainsViewDistanceControl.value);
  setupCaveStoryInspection({world,getState:()=>({position:actor?.position,loading:!ready||loadingAsset||mapTransition?.busy,dead:controller?.dead||boss?.playerHp<=0,combat:(boss?.combatCount??0)>0,busy:controller?.captured||controller?.groggy}),onOpen:()=>{input?.reset();cancelAttackInput();}});
  world.caveCamera=new CaveCameraGuard(world);
  setSceneCharacterStyles(world.scene,characterStylePanel.settings.value);
  cameraZoom=new CameraZoom(world.camera,{referenceRadius:isVillage()?17:4.8,storage:equipmentStorage,key:`moonforest-camera-zoom-${isVillage()?'world':'training'}-v1`});
  cameraPitch=new CameraPitch(world.camera,{warrior:isWarrior(),storage:equipmentStorage});
  cameraFollow=new CameraFollow({storage:equipmentStorage});
  const cameraSettingChanged=()=>{syncCameraFocus(0,{snap:true});frameDiagnostics.refresh();renderActivity.wake();frameLoop?.invalidate();};
  $('#map-polygon-estimate')?.addEventListener('click',async event=>{
    const button=event.currentTarget,status=$('#map-polygon-status'),map=world.mapId;button.disabled=true;status.textContent='맵 배치를 집계하는 중…';
    try{const [{ASSET_CATALOG},{estimateMapPolygons}]=await Promise.all([import('./asset-catalog.js'),import('./map-polygon-estimate.js')]);if(world.mapId!==map){status.textContent='맵이 바뀌었습니다. 다시 집계해 주세요.';return;}const value=estimateMapPolygons(world,ASSET_CATALOG);status.textContent=`확인 가능한 배치·지형 합계 ${value.estimatedTotal?.toLocaleString()??'—'} 삼각형 · 배치 ${value.placements}개 · 집계 불가 ${value.unknown}개. 미집계 대상이 있으면 전체보다 적을 수 있으며 배우·효과와 실제 LOD는 제외됩니다.`;}
    catch(error){status.textContent='맵 집계 실패: '+error.message;}finally{button.disabled=false;}
  });
  setupCameraZoomControls(cameraZoom,{onChange:cameraSettingChanged});cameraPitchControls=setupCameraPitchControls(cameraPitch,{onChange:cameraSettingChanged});
  setupCameraFollowControls(cameraFollow,{onChange:cameraSettingChanged});
  world.villageOverview=isVillage()&&villageOverview;
  if(world.villageOverview){world.scene.fogStart=200;world.scene.fogEnd=260;world.camera.maxZ=500;}
  if(villageReviewEnabled)villageReview=createVillageReview(world,{forcedMobile:villageForceMobile});
  world.lighting.setQuality(qualityMode);
  screenProjection=new ScreenProjection(world.scene);
  resizeScreenProjection();
  damageNumbers=createDamageNumbers(world.scene,$('#damage-numbers'),{visibleAt:p=>world.caveFog?.allowsPoint(p)??true});
  goldLootView=world.goldLootView=createGoldLootView(world.scene,$('#loot-labels'),{visibleAt:p=>world.caveFog?.allowsPoint(p)??true});
  const damageFeedback=(...args)=>{damageNumbers.show(...args);if(!isWarrior()&&args[3]==='enemy')audio.play('arrow_hit',{position:args[0]});else actionAudio.damage(...args);};
  bossHealthBars=new BossHealthBars($('#boss-hud'));
  playerHealthBar=new PlayerHealthBar($('#player-health'));
  boss=new BossBattle(world,encounter=>{
    const snapshot=[encounter.loading,encounter.active,encounter.encounters.length,encounter.livingCount,encounter.playerHp,encounter.lastHit].join('|');
    if(snapshot===healthSnapshot)return;healthSnapshot=snapshot;
    updateSummonControls(encounter);
    $('#summon-goblin').textContent=encounter.loading?'불러오는 중…':encounter.encounters.some(e=>e.kind==='goblin')?'고블린 다시 소환':'고블린 소환';
    $('#player-combat-status').hidden=!encounter.active;
    if(!encounter.active){bossHealthBars.update(world.scene,[]);return;}
    $('#combat-feedback').textContent=encounter.lastHit||'방패 밀치기 시전 중 블록';
    if(encounter.playerHp<=0){world.developmentStoryboardLive?.update();if(!world.storyboardDeathPlayback&&!deathScreen.isOpen()){const events=world.storyboardEvents?.inspect();const count=!events?.active&&!events?.queued?world.storyboardEvents?.emit('death',{mapId:world.mapId})??0:0;if(count){world.storyboardDeathPlayback=true;input?.reset();cancelAttackInput();}else deathScreen.show();}}
  },damageFeedback,(duration,options={})=>{
    if('captured' in options){
      if(options.captured){actions.cancelDodgeInput();actions.cancelShieldInput();controller.capture();audio.play('grab_caught');}else controller.releaseCapture();
      attackSources.clear();attackPointerTypes.clear();strikeSampler.reset();return true;
    }
    const reacted=options.knockdown?controller.knockdown(options):controller.hit(duration,options);
    if(reacted!==false){if(!controller.held){attackSources.clear();attackPointerTypes.clear();}strikeSampler.reset();}
    applyPlayerFlash(container.meshes,boss.playerReaction,staminaFeedback);
    return reacted;
  },{onDefeat:event=>{try{sceneDiagnostics.requestDrawCpuCapture('enemy-defeat');frameDiagnostics.captureEvent('enemy-defeat');}catch{/* Diagnostics must not alter rewards or combat. */}if(chapterQuests)chapterQuests.defeat(event);else goldLoot.drop(event.kind,event.position,{canLand:(from,to)=>!world.navigation||world.navigation.free(to,.08)&&world.navigation.segmentClear(from,to,.05),heightAt:(x,z)=>world.terrain.heightAt(x,z)});world.developmentStoryboardLive?.defeat(event);},onDiagnosticEvent:event=>frameDiagnostics.bossEvent(event)});
  sceneDiagnostics.setEnabled(frameDiagnostics.enabled,world.scene);
  boss.setAttackSettings(bossPatternPanel.settings.value);
  boss.combat.defense=equipmentStats(equipmentChoices).defense;
  try{swordTrail=createSwordTrail(world.scene,{enabled:swordTrailSettings.enabled,onError:error=>console.warn('[검격 잔상]',error)});}catch(error){console.warn('[검격 잔상]',error);}
  world.scene.onAfterAnimationsObservable.add(()=>{
    if(!simulateFrame)return;
    if(!ready||!isWarrior()||!combatResult){swordTrail?.clear();return;}
    const sample=strikeSampler.sample(combatResult,swordNode,shieldNode,isV2(),actor.rotation.y,equipmentStats(equipmentChoices).attackBonus,playerDimensions(actor));
    try{swordTrail?.update(sample,combatResult.state,elapsed,equipmentChoices.sword);}catch(error){swordTrail?.setEnabled(false);console.warn('[검격 잔상]',error);}
    const contactsStart=frameDiagnostics.mark();
    const bossStop=isV2()?boss.poseAndContacts(actor,combatResult,sample,shieldNode):0;
    frameDiagnostics.measure('contactsMs',contactsStart);
    const targetStop=!controller.captured&&!controller.staggerRemaining?training.melee(sample):0;
    if(isV2())controller.pauseOnImpact(Math.max(bossStop||0,targetStop||0));
  });
  training = createTrainingTargets(world.scene, world.shadows,damageFeedback,world.terrain);
  world.trainingTargets=training;
  training.relocate(world.trainingSpawn);
  projectiles = createProjectiles(world.scene, target => training.hit(target));
  input = new PlaygroundInput(canvas, world.camera, actions);
  if(cinematicAuthoringPreview)input.setSuspended(true);
  input.dodgeSprintGesture=new DodgeSprintGesture({onDodge:()=>actions.dodge(),onSprint:(held,seconds)=>controller?.setSprintHeld?.(held,seconds)});
  const wakeRendering=()=>{renderActivity.wake();engine.maxFPS=renderActivity.limit({quality:qualityMode});if(frameLoop&&!frameLoop.running)reconcilePlayback();frameLoop?.recover();};
  for(const event of ['pointerdown','keydown','wheel'])document.addEventListener(event,wakeRendering,{capture:true,passive:true});
  document.addEventListener('pointermove',event=>{if(event.buttons)wakeRendering();},{capture:true,passive:true});
  setupFullscreen($('#fullscreen-button'), toast, {autoEnter:false});
  const diagnosticFullscreen=$('#diagnostic-fullscreen'),primaryFullscreen=$('#fullscreen-button');
  diagnosticFullscreen.addEventListener('click',()=>primaryFullscreen.click());
  const syncDiagnosticFullscreen=()=>{diagnosticFullscreen.textContent=primaryFullscreen.textContent;diagnosticFullscreen.setAttribute('aria-label',primaryFullscreen.getAttribute('aria-label'));diagnosticFullscreen.setAttribute('aria-pressed',primaryFullscreen.getAttribute('aria-pressed'));};
  for(const name of ['fullscreenchange','webkitfullscreenchange'])document.addEventListener(name,syncDiagnosticFullscreen);
  syncDiagnosticFullscreen();
  mapDeparture=createMapDeparture({
    prepare:href=>{world.storyboardEvents?.leaveMap();world.toolRecovery=null;world.toolGeneration=(world.toolGeneration??0)+1;world.toolLease?.cancel('map-departure',{restore:false});world.developmentEditor?.leaveMap();world.developmentCinema?.leaveMap();world.developmentActorEditor?.leaveMap();world.npcWorld?.leaveMap();ready=false;loadingView.begin(new URL(href,location.href).searchParams.get('character'));input.reset();cancelAttackInput();frameLoop?.setPaused(true);frameDiagnostics.suspend();audio.stopAll();world.cancelResourceDownloads?.();},
    release:()=>{staminaNoticeAnchor.dispose();input.dispose();audio.dispose();engine.dispose();},
    navigate:url=>location.replace(url),
    onError:error=>{console.error('[Map departure]',error);loading.classList.add('error');$('#loading-title').textContent='맵 이동을 완료하지 못했습니다';$('#loading-text').textContent='연결을 확인한 후 새로고침해 주세요.';},
  });
  let mapLoadingGeneration;
  mapTransition=createMapTransition({
    prepare:href=>{
      world.storyboardEvents?.leaveMap();world.toolRecovery=null;world.toolGeneration=(world.toolGeneration??0)+1;world.toolLease?.cancel('map-change',{restore:false});world.developmentEditor?.leaveMap();world.developmentCinema?.leaveMap();world.authoredDataLifetime?.abort();world.authoredPlacements?.leaveMap();
      world.developmentActors?.leaveMap();world.authoredMonsters?.leaveMap();world.developmentActorEditor?.leaveMap();world.npcWorld?.leaveMap();
      saveMapPosition(true);resumePose=null;hudLayout?.close();minimapTravel?.close();minimap.hide();chapterQuests?.releaseMap();
      leaveElenaReview();
      frameDiagnostics.mapChanged();loadDiagnostics.begin('지역 이동');
      ready=false;loadingAsset=true;staminaNoticeAnchor.reset();staminaFeedback.reset(controller);mapLoadingGeneration=loadingView.begin(new URL(href,location.href).searchParams.get('character'));updateButtons();input.reset();cancelAttackInput();
      boss.combat?.passiveRecovery?.reset();
      frameLoop?.setPaused(true);frameDiagnostics.suspend();audio.stopAll();audio.play('portal_depart');actionAudio.reset();
      boss.hide();applyPlayerFlash(container?.meshes,boss?.playerReaction,staminaFeedback);for(const enemy of boss.allPooled)enemy.routeState={};
      goldLoot.clearDrops();goldLootView.clear();projectiles.clear();training.setSelected(null);
      combatResult=null;strikeSampler.reset();swordTrail?.clear();mapPortal?.dispose();mapPortal=null;
      world.cancelResourceDownloads?.();
    },
    release:async()=>{await world.releaseEnvironment?.();world.releaseResourceDownloads?.();},
    load:async (href,context)=>{
      const url=new URL(href),destination=url.searchParams.get('character'),sourceCharacter=character,waypoint=travelWaypoint(url),loadingGeneration=mapLoadingGeneration;
      url.searchParams.delete('elenaReview');
      url.searchParams.delete('waypoint');
      replaceWorldMap(world,destination);applyPlainsViewDistance(world,plainsViewDistanceControl.value);character=destination;history.replaceState(null,'',url);
      const handoff=context?.boundary?.to===destination?context.boundary:null;
      const spawn=handoff?.position??waypoint?.position??mapSpawn();actor.position.set(spawn.x,0,spawn.z);world.terrain.place(actor.position);
      syncCaveFog(true);
      if(handoff){actor.rotation.y=handoff.yaw;world.camera.alpha=handoff.alpha;if(handoff.pan&&input.panOffset)Object.assign(input.panOffset,handoff.pan);}
      if(context?.minimap)applyMinimapArrivalPose(actor,world.camera,input.panOffset,{destination,position:spawn,waypoint});
      else carryPortalPose(actor,world.camera,input.panOffset,{from:handoff?.from??sourceCharacter,to:destination});
      controller.cancelAttack();controller.staggerRemaining=0;controller.hitPose=null;
      animator.transition('idle',{clipTime:0,loop:true,blendDuration:.001});animator.update(.2);
      cameraPitch.follow(cameraFollow.focus(actor,playerHead).add(new Vector3(input.panOffset.x,input.panOffset.y,input.panOffset.z)),0,{snap:true});
      world.camera.getViewMatrix();world.camera.getProjectionMatrix();training.relocate(world.trainingSpawn);
      const skyReady=world.cave?Promise.resolve():world.sky.load(new URL(`${import.meta.env.BASE_URL}assets/sky.json`,location.href));
      loadDiagnostics.phase('download');
      await prepareMapResources(world,new URL(`${import.meta.env.BASE_URL}assets/`,location.href),s=>{loadingView.download(s,loadingGeneration);loadDiagnostics.download(s);},s=>loadingView.stream(s));
      loadDiagnostics.phase('model');loadingView.preparing(undefined,loadingGeneration);await loadVillage(world);
      await world.loadAuthoredMap?.();
      if(handoff){const safe=safeRoadArrival(world,actor.position,playerDimensions(actor).moveRadius,movementLimit);actor.position.x=safe.x;actor.position.z=safe.z;world.terrain.place(actor.position);syncCameraFocus(0,{snap:true});}
      world.environment.legacyTrainingModel='scarecrow';updatePlainsBoundaryAtmosphere(world,actor.position,true);world.lighting.follow(actor.position,true);
      $('#build-tag').textContent=isCave()?'CAVERN / 05':isPlains()?'PLAINS / 06':isForest()?'FOREST / 04':'VILLAGE / 03';
      $('#character-name').textContent=isCave()?'Violet Vanguard v5':isPlains()?'Violet Vanguard · 대평원':isForest()?'Violet Vanguard v4':'Violet Vanguard v3';
      $('#character-subtitle').textContent=isCave()?'마녀의 동굴':isPlains()?'대평원':isForest()?'마물의 숲':'숲의 경계 마을';
      $('#character-select').value=releaseSelectionValue(releaseEnabled,character,uiTestEnabled);bindMapPortal(handoff?.from??null);
      if(isCave())await boss.activateResident(actor);
      await prepareElenaReview();world.authoredPlacements?.update(0,actor);
      await skyReady;
      assertFrameHealthy();loadDiagnostics.phase('screen');syncCaveFog(true);world.scene.render();await chapterQuests?.prepareEffects();await world.goldLootView?.prepare();await waitForSceneReady(world.scene,{onProgress:progress=>loadingView.preparing(progress,loadingGeneration)});assertFrameHealthy();world.scene.render();
    },
    finish:async()=>{
      assertFrameHealthy();
      loadingAsset=false;ready=true;audio.setEnvironment(character);audio.play('portal_arrive');updateButtons();
      world.storyboardEvents?.emit('map-enter',{mapId:world.mapId});
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      assertFrameHealthy();
      applyRenderQuality();loadingView.reveal(mapLoadingGeneration);showMinimap();world.villageStreaming.active=true;
      loadDiagnostics.finish();
      const modalOpen=hudLayout?.isOpen()||minimapTravel?.isOpen()||uiTest?.isOpen()||motionSpeedControls.isOpen()||$('#help-dialog').open||$('#summon-dialog').open||$('#boss-pattern-dialog').open||$('#character-style-dialog').open||$('#diagnostic-detail-dialog').open;
      frameLoop.setPaused(document.hidden||modalOpen||deathScreen.isOpen());
      audio.setSuspended(document.hidden||modalOpen);
      if(!document.hidden)canvas.focus({preventScroll:true});world.developmentCinema?.notifyReady();world.developmentEditor?.notifyReady?.();world.authoringNavigation?.notifyReady();
    },
    onError:error=>{loadingAsset=false;ready=false;frameLoop?.setPaused(true);audio.setSuspended(true);world.cancelResourceDownloads?.();loadDiagnostics.finish(error.message);console.error('[Map transition]',error);const timedOut=error.name==='TimeoutError'||/시간.*초과/.test(error.message);loadingView.fail(timedOut?'맵 이동 시간이 초과되었습니다':'맵 이동을 완료하지 못했습니다',frameFailure?'게임 실행 오류: '+frameFailure.message:timedOut?'준비 작업의 응답이 없어 이동을 중단했습니다. 아래 버튼으로 다시 시도해 주세요.':'아래 오류 내용과 진단 복사 버튼으로 기록을 전달할 수 있습니다.',{retryLabel:frameFailure?'다시 불러오기':'맵 이동 다시 시도',error:frameFailure??error,phase:loadDiagnostics.snapshot()?.failedPhase??'map-transition'});},
  });
  minimapTravel=setupMinimapTravel({element:$('#dot-minimap'),root:$('#app'),
    getState:()=>({character,ready:ready&&!loadingAsset&&!mapTransition?.busy,loading:boss.loading,busy:mapTransition?.failed||frameLoop?.failed||frameLoop?.loadingFailed,dead:controller?.dead||boss.playerHp<=0,captured:controller?.captured||controller?.groggy,healing:boss.potions.active,enemies:boss.combatCount}),
    onTravel:url=>travelFromMinimap(url),resetInput:()=>{input.reset();cancelAttackInput();},onPauseChange:()=>reconcilePlayback()});
  world.scene.onDisposeObservable.addOnce(()=>minimapTravel?.dispose());
  bindMapPortal();
  frameLoop=new FrameLoop(engine,dt=>{
    frameDiagnostics.beginFrame((ready||!!world.toolLease?.active)&&!loadingAsset&&frameLoop.running,engine.maxFPS);
    try{render(dt);}catch(error){
      world.toolLease?.cancel('error',{restore:false});
      frameFailure={name:error.name??'Error',message:String(error.message??error).slice(0,240),stack:String(error.stack??'').slice(0,4000),at:new Date().toISOString()};ready=false;
      loadDiagnostics.finish(frameFailure.message);
      frameLoop.failed=true;frameLoop.setPaused(true);input.reset();cancelAttackInput();audio.setSuspended(true);updateButtons();
      console.error('[Game frame]',error);loadingView.fail('게임 실행이 중단되었습니다','다시 불러오기를 눌러 주세요. '+frameFailure.message,{error,phase:'frame'});
    }finally{world.caveCamera?.endFrame();frameDiagnostics.endFrame();}
  });
  const syncPlayback=()=>{
    if(mapDeparture?.departing||mapTransition?.busy)return;
    const summonOpen=$('#summon-dialog').open,otherSettings=hudLayout?.isOpen()||minimapTravel?.isOpen()||uiTest?.isOpen()||world.authoredInteractions?.isOpen()||motionSpeedControls.isOpen()||$('#help-dialog').open||$('#boss-pattern-dialog').open||$('#character-style-dialog').open||$('#diagnostic-detail-dialog').open,settingsOpen=summonOpen||otherSettings,paused=document.hidden||settingsOpen||deathScreen.isOpen()||!!world.gameExited||frameLoop.failed===true||mapTransition?.failed===true||frameLoop.loadingFailed===true;
    world.toolLease?.setPaused(paused);
    if(paused){input.reset();cancelAttackInput();boss?.combat?.passiveRecovery?.reset();}frameLoop.setPaused(paused);
    if(paused){text('#live-fps',frameLoop.failed?'실행 오류':'일시정지');frameDiagnostics.suspend({preserveBossBaseline:summonOpen&&!otherSettings&&!document.hidden&&!deathScreen.isOpen()&&frameLoop.failed!==true});}
    audio.setSuspended(document.hidden||settingsOpen||!!world.gameExited||frameLoop.failed===true||mapTransition?.failed===true||frameLoop.loadingFailed===true||!!(world.toolLease?.active&&!world.toolLease.audioEnabled));
    world.developmentCinema?.notifyReady();world.developmentEditor?.notifyReady?.();world.authoringNavigation?.notifyReady();world.developmentToolSettings?.refresh();
  };
  const dialogObserver=new MutationObserver(syncPlayback);
  reconcilePlayback=syncPlayback;
  world.wakeToolPlayback=()=>{syncPlayback();wakeRendering();};
  for(const selector of ['#motion-speed-dialog','#help-dialog','#death-dialog','#summon-dialog','#boss-pattern-dialog','#character-style-dialog','#diagnostic-detail-dialog']){
    dialogObserver.observe($(selector),{attributes:true,attributeFilter:['open']});
    // Closing button handlers run before this bubble handler, keeping iOS
    // audio resume directly inside the user's tap, not only a later observer.
    $(selector).addEventListener('click',syncPlayback);
  }
  // Run after the pause bubble handler so reset buttons also retain their final
  // preview frame; combat remains frozen during both settings dialogs.
  for(const selector of ['#motion-speed-dialog','#character-style-dialog'])for(const event of ['click','change','input'])$(selector).addEventListener(event,()=>{if(!mapDeparture?.departing&&!mapTransition?.busy)frameLoop.invalidate();});
  document.addEventListener('visibilitychange',()=>{syncPlayback();if(!document.hidden)frameLoop.restart();});
  window.addEventListener('pagehide',()=>{staminaNoticeAnchor.reset();frameLoop.setPaused(true);frameDiagnostics.suspend();audio.setSuspended(true);});
  const restorePlayback=()=>{syncPlayback();frameLoop.restart();frameDiagnostics.suspend({preserveBossBaseline:$('#summon-dialog').open&&!minimapTravel?.isOpen()&&!document.hidden&&!motionSpeedControls.isOpen()&&!$('#help-dialog').open&&!$('#boss-pattern-dialog').open&&!$('#character-style-dialog').open&&!$('#diagnostic-detail-dialog').open&&!deathScreen.isOpen()&&frameLoop.failed!==true});};
  window.addEventListener('pageshow',restorePlayback);
  window.addEventListener('focus',restorePlayback);
  engine.onContextRestoredObservable.add(()=>{if(world.toolRecovery){world.toolRecovery.recover();world.toolRecovery=null;}restorePlayback();});
  syncPlayback();
  const viewportResize=world.viewportResize=observeViewportSize(canvas, () => {
    if(mapDeparture?.departing||mapTransition?.busy)return;
    applyRenderQuality();
    // Fullscreen can suspend the browser's render callback while Babylon's
    // backing buffer is reallocated. Re-register only the already-running loop.
    frameLoop?.restart?.();
    sceneDiagnostics.requestDrawCpuCapture('viewport-commit');
  },window,{onPending:()=>{if(!mapDeparture?.departing&&!mapTransition?.busy)input.reset();},onLayout:()=>{if(!mapDeparture?.departing&&!mapTransition?.busy)resizeScreenProjection();}});
  world.requestDrawCpuCapture=reason=>sceneDiagnostics.requestDrawCpuCapture(reason);
  world.requestDeathDiagnostic=reason=>{try{sceneDiagnostics.requestDrawCpuCapture(reason);frameDiagnostics.captureEvent(reason);}catch{/* Optional diagnostic only. */}};
  world.scene.onDisposeObservable.addOnce(viewportResize);
  $('#quality-select').addEventListener('change', event => {
    qualityMode = event.target.value;
    try { localStorage.setItem('archer-render-quality', qualityMode); } catch { /* Keep the current session choice. */ }
    applyRenderQuality();
  });
  $('#run-button').addEventListener('click', () => { controller?.toggleRun?.(); updateButtons(); });
  const shieldButtonBinding=bindShieldHoldButton($('#guard-button'),{setHeld:actions.setShieldHeld,cancel:actions.cancelShieldInput,tap:actions.guard});
  world.scene.onDisposeObservable.addOnce(()=>shieldButtonBinding.dispose());
  for(const [selector,action] of [['#potion-button',actions.potion]]){
    const button=$(selector);let lastPress=-Infinity;
    button.addEventListener('pointerdown',event=>{
      if(event.button!==0||button.disabled)return;
      event.preventDefault();lastPress=performance.now();action();
    });
    button.addEventListener('click',event=>{if(event.detail===0&&performance.now()-lastPress>350)action();});
  }
  {
    const button=$('#dodge-button');let lastPress=-Infinity;
    button.addEventListener('pointerdown',event=>{
      if(event.button!==0||button.disabled)return;
      event.preventDefault();lastPress=performance.now();
      if(actions.setDodgeHeld(true,'button:'+event.pointerId,event.pointerType)!==false)try{button.setPointerCapture(event.pointerId);}catch{}
    });
    button.addEventListener('pointerup',event=>{event.preventDefault();actions.setDodgeHeld(false,'button:'+event.pointerId);if(button.hasPointerCapture?.(event.pointerId))button.releasePointerCapture(event.pointerId);});
    for(const name of ['pointercancel','lostpointercapture'])button.addEventListener(name,event=>actions.cancelDodgeInput('button:'+event.pointerId));
    button.addEventListener('click',event=>{if(event.detail===0&&performance.now()-lastPress>350)actions.dodge();});
  }
  $('#boss-kind').addEventListener('change',()=>{bossSelection.choose($('#boss-kind').value);updateSummonControls();});
  $('#boss-count').addEventListener('change',()=>{bossSelection.setCount($('#boss-count').value);updateSummonControls();});
  for(const [selector,count,kind] of [['#summon-boss','#boss-count','bear'],['#summon-goblin','#goblin-count','goblin']])$(selector).addEventListener('click',async()=>{
    if(!ready||!isV2()||boss.loading)return;
    try{
      input.reset();attackSources.clear();controller.cancelAttack();controller.staggerRemaining=0;leaveElenaReview();
      const selection=kind==='bear'?bossSelection.current():null;
      const summoned=await (selection?summonSelectedBoss(boss,actor,selection):boss.summon(actor,$(count).value,kind));
      if(!summoned)return;
      $('#summon-dialog').close();
      actionAudio.reset();
      if(!selection?.phase)for(const enemy of boss.encounters.filter(e=>e.kind===kind))audio.play(kind==='bear'?'boss_appear':'goblin_appear',{position:enemy.actor.position,volume:kind==='bear'?1:.45});
      world.camera.radius=Math.max(world.camera.radius,innerWidth<600?11:8);canvas.focus({preventScroll:true});
    }
    catch(error){console.error('[Boss load]',error);toast('보스를 불러오지 못했습니다. 연결을 확인한 뒤 다시 소환해 주세요.');audio.play('ui_error');}
    updateButtons();
  });
  for(const motion of BOSS_ACTIVE_MOTIONS){const li=document.createElement('li');li.textContent=`${motion.label} · ${motion.name}`;$('#boss-motion-list').append(li);}
  for(const motion of GOBLIN_MOTIONS){const li=document.createElement('li');li.textContent=`${motion.label} · ${motion.name}`;$('#goblin-motion-list').append(li);}
  $('#character-select').value = releaseSelectionValue(releaseEnabled,character,uiTestEnabled);
  $('#character-select').addEventListener('change', event => {
    if (loadingAsset) return;
    if(event.target.value===MOONFOREST_RELEASE||releaseEnabled){
      if(event.target.value===MOONFOREST_RELEASE&&releaseEnabled)return;
      let url=releaseSelectionUrl(location.href,event.target.value);
      if(event.target.value==='ui-test')url=uiTestSelectionUrl(url,event.target.value);
      mapDeparture.leave(url.href);return;
    }
    if(event.target.value==='ui-test'||uiTestEnabled){
      if(event.target.value==='ui-test'&&uiTestEnabled)return;
      mapDeparture.leave(uiTestSelectionUrl(location.href,event.target.value).href);return;
    }
    const next=validCharacters.includes(event.target.value) ? event.target.value : 'archer';
    const url = new URL(location.href); url.searchParams.set('character', next);
    if(next!==character&&isWorldCharacter(character)&&isWorldCharacter(next)){url.searchParams.set('arrival','portal');mapTransition.travel(url.href);return;}
    if(mapForCharacter(next)!==mapForCharacter(character)){mapDeparture.leave(url.href);return;}
    character=next;history.replaceState(null, '', url);
    loadCharacter();
  });
  $('#attack-speed').addEventListener('input', event => {
    applyAttackSpeed(Number(event.target.value));
    try { localStorage.setItem(attackSpeedStorageKey(), String(attackSpeed)); } catch { /* Keep the session choice. */ }
  });
  $('#reset-attack-speed').addEventListener('click', () => {
    applyAttackSpeed(1);
    try { localStorage.setItem(attackSpeedStorageKey(), '1'); } catch { /* Keep the session choice. */ }
  });
  const attackButton = $('#attack-button');
  let lastPointerAttack = -Infinity;
  attackButton.addEventListener('pointerdown', event => {
    if (event.button !== 0 || !ready) return;
    event.preventDefault(); lastPointerAttack = performance.now();
    attackButton.setPointerCapture(event.pointerId); setAttackHeld(`button:${event.pointerId}`, true,event.pointerType);
  });
  attackButton.addEventListener('pointerup', event => setAttackHeld(`button:${event.pointerId}`, false));
  attackButton.addEventListener('pointercancel', event => cancelAttackInput(`button:${event.pointerId}`));
  attackButton.addEventListener('lostpointercapture', event => cancelAttackInput(`button:${event.pointerId}`,{preserveCompletedCharge:true}));
  attackButton.addEventListener('click', event => { if (event.detail === 0 && performance.now() - lastPointerAttack > 350) actions.attack(); });
  const releaseAttack = () => cancelAttackInput();
  window.addEventListener('blur', releaseAttack);
  document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAttack(); });
  $('#hit-button').addEventListener('click', actions.hit);
  $('#death-button').addEventListener('click', () => controller?.dead ? actions.revive() : actions.death());
  $('#retry-load').addEventListener('click', retryLoading);
  for (const mode of ['orbit', 'pan']) $(`#${mode}-mode`).addEventListener('click', () => {
    input.cameraMode = mode;
    for (const candidate of ['orbit', 'pan']) { $(`#${candidate}-mode`).classList.toggle('selected', mode === candidate); $(`#${candidate}-mode`).setAttribute('aria-pressed', String(mode === candidate)); }
  });
  $('#zoom-in').addEventListener('click', () => {input.zoom(.85);frameDiagnostics.refresh();frameLoop?.invalidate();});
  $('#zoom-out').addEventListener('click', () => {input.zoom(1.18);frameDiagnostics.refresh();frameLoop?.invalidate();});
  $('#reset-camera').addEventListener('click', resetCamera);
  $('#help-toggle').addEventListener('click', () => { releaseAttack(); input.reset(); $('#help-dialog').showModal(); });
  $('#close-help').addEventListener('click', () => $('#help-dialog').close());
  $('#help-dialog').addEventListener('click', e => { if (e.target === $('#help-dialog')) { const r = e.target.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) e.target.close(); } });
  document.addEventListener('click',event=>{
    const button=event.target.closest?.('button');
    if(!button||button.disabled||button.closest('.action-controls')||['summon-boss','summon-goblin','death-restart'].includes(button.id))return;
    audio.play(/close|back/.test(button.id)?'ui_back':/help|toggle/.test(button.id)?'ui_open':'ui_click');
  });
  if(plainsReviewEnabled){const {setupPlainsReview}=await import('./plains-review-controls.js');setupPlainsReview({world,getState:()=>({ready:ready&&!loadingAsset&&!mapTransition?.busy,character,x:actor?.position.x,z:actor?.position.z,hp:boss?.playerHp,motion:controller?.state,actionId:controller?.action?.id,charge:controller?.chargeProgress,queued:controller?.queuedAttack}),moveTo:(x,z)=>{input.reset();actor.position.set(x,0,z);world.terrain.place(actor.position);syncCameraFocus(0,{snap:true});},travel:id=>mapTransition.travel(travelUrl(location.href,id))});}
  // Read-only diagnostics make integration QA reproducible without exposing mutable scene objects.
  window.archerPreview = Object.freeze({ inspect: () => ({ ready, character, environment:world.environment, navigation:world.navigation.inspect(), targets:training.targets.map(t=>({id:t.id,position:t.position.asArray(),hits:t.hits})), boss:boss.inspect(), audio:audio.inspect(), renderFrames:frameLoop.frames, equipment: equipment?.inspect() || null, guardToggled: controller?.guardToggled, state: controller?.state, dead: controller?.dead, runToggled: controller?.runToggled, position: actor ? { x: actor.position.x, y: actor.position.y, z: actor.position.z } : null, maxBoneInfluences: maxInfluences, animations: config?.animations, joystickActive: input.joystickPointer !== null, cameraPointerCount: input.cameraPointers.size, camera: { alpha: world.camera.alpha, beta: world.camera.beta, radius: world.camera.radius }, panOffset: { ...input.panOffset } }) });
  if(isWorldCharacter(character)&&!elenaReviewMode&&new URLSearchParams(location.search).get('legacyUiTest')!=='1'){
    chapterQuests=setupChapterQuests({root:$('#app'),world,storage:journeyStorage,onChestOpened:({tier,position})=>{audio.play('gold_pickup',{position,volume:.95+(tier-1)*.1,rate:.85+(tier-1)*.1});if(tier>=4)audio.play('charge_ready',{position,volume:.28,rate:1.05+(tier-4)*.12});},onInteract:({id,kind,mapId})=>world.storyboardEvents?.emit(kind==='npc'?'npc-interact':'object-interact',{targetId:id,mapId}),openEquipment:()=>{const section=$('.character-info')?.closest('details');if(section)section.open=true;$('#motion-speed-toggle').click();},creditGold:total=>goldLoot.creditCumulative('chapter-one',total),getState:()=>({ready:ready&&!loadingAsset&&!mapTransition?.busy,character,map:world.mapId,position:actor?.position,dead:controller?.dead||boss.playerHp<=0,combat:boss.combatCount>0,busy:controller?.captured||controller?.groggy}),resetInput:()=>{input.reset();cancelAttackInput();},onPauseChange:()=>reconcilePlayback(),heal:amount=>{if(!ready||loadingAsset||boss.playerHp<=0||boss.potions.active)return 0;const gained=Math.min(amount,boss.playerMaxHp-boss.playerHp);if(gained>0){boss.combat.hp+=gained;updateHealthBars();boss.onChange(boss);}return gained;}});uiTest=chapterQuests;
  }else if(uiTestEnabled){
    uiTest=setupUiTest({root:$('#app'),storage:journeyStorage,
      getState:()=>({ready:ready&&!loadingAsset&&!mapTransition?.busy,character}),
      resetInput:()=>{input.reset();cancelAttackInput();},onPauseChange:()=>reconcilePlayback(),
      openSettings:()=>$('#motion-speed-toggle').click(),
      heal:amount=>{
        if(!ready||loadingAsset||mapTransition?.busy||controller.dead||controller.captured||controller.groggy||boss.playerHp<=0||boss.potions.active)return 0;
        const gained=Math.min(amount,boss.playerMaxHp-boss.playerHp);if(gained<=0)return 0;
        boss.combat.hp+=gained;updateHealthBars();boss.onChange(boss);audio.play('heal_start',{volume:.65});return gained;
      },
      prepareHealing:()=>{
        if(!ready||loadingAsset||mapTransition?.busy||boss.combatCount>0||controller.dead||boss.playerHp<=1||boss.potions.active)return false;
        boss.combat.hp=Math.max(1,boss.playerHp-120);updateHealthBars();boss.onChange(boss);return true;
      },
    });
    if(import.meta.hot)import.meta.hot.dispose(()=>uiTest.dispose());
  }
  if(isWorldCharacter(character)&&!cinematicAuthoringPreview){
    world.authoredInteractions=setupAuthoredInteractions({root:$('#app'),world,getState:()=>({ready:ready&&!loadingAsset&&!mapTransition?.busy,position:actor?.position,dead:controller?.dead||boss.playerHp<=0,combat:boss.combatCount>0,busy:controller?.captured||controller?.groggy,hidden:document.hidden}),getLiveNpc:()=>(boss.encounters??[]).filter(e=>e.type==='npc'||e.category==='npc'||e.config?.npc),resetInput:()=>{input.reset();cancelAttackInput();},onPauseChange:()=>reconcilePlayback(),onInteract:({id,kind,mapId})=>world.storyboardEvents?.emit(kind==='npc'?'npc-interact':'object-interact',{targetId:id,mapId})});
    world.scene.onDisposeObservable.addOnce(()=>world.authoredInteractions?.dispose());
  }
  if(isWorldCharacter(character)){
    commercialUi=setupCommercialUi({root:$('#app'),onDiagnostics:()=>$('#diagnostic-expand')?.click()});
    hudLayout=setupHudLayout({root:$('#app'),storage:equipmentStorage,getReady:()=>ready&&!loadingAsset&&!mapTransition?.busy&&!frameLoop?.failed&&!controller?.dead,resetInput:()=>{input?.reset();cancelAttackInput();},onPauseChange:()=>reconcilePlayback(),onClose:message=>toast(message)});
    if(import.meta.hot)import.meta.hot.dispose(()=>{hudLayout?.dispose();commercialUi?.dispose();});
  }
  if(releaseEnabled&&new URLSearchParams(location.search).get('actorLab')==='1'){
    import('./developer-actors.js').then(({setupDeveloperActors})=>{
      if(world.scene.isDisposed)return;
      world.developmentActors=setupDeveloperActors({root:$('#app'),world,battle:boss,getPlayer:()=>actor,travel:id=>mapTransition.travel(travelUrl(location.href,id)),
        getState:()=>({ready:ready&&!loadingAsset&&!mapTransition?.busy,dead:controller?.dead||boss.playerHp<=0,paused:document.hidden||!!document.querySelector('dialog[open]')}),
        interactNpc:(id,position,range=3)=>{
          const limit=Number.isFinite(range)?Math.max(0,Math.min(3,range)):3;
          if(!actor||!ready||loadingAsset||mapTransition?.busy||document.hidden||document.querySelector('dialog[open]')||Math.hypot(actor.position.x-position.x,actor.position.z-position.z)>limit||!world.navigation.segmentClear(actor.position,position,.05))return false;
          return chapterQuests?.talk(id)??false;
        },resetInput:()=>{input.reset();cancelAttackInput();},notify:toast});
    }).catch(error=>{console.error('[Actor lab]',error);toast('배우 실험 도구를 불러오지 못했습니다.');});
  }
  let placementEditorTask=null;
  const getPlacementEditor=async(canOpen=()=>true,{autoEnter=false}={})=>{
    if(!canOpen())throw new Error('오브젝트 편집 설정이 꺼졌습니다.');
    if(world.developmentEditor)return world.developmentEditor;
    // Cache only the module: each caller must retain its own settings generation.
    placementEditorTask??=import('./developer-editor.js').catch(error=>{placementEditorTask=null;throw error;});
    const {setupDeveloperEditor}=await placementEditorTask;
    if(world.scene.isDisposed)throw new Error('맵을 다시 열어 주세요.');
    if(!canOpen())throw new Error('오브젝트 편집 설정이 꺼졌습니다.');
    return world.developmentEditor??=setupDeveloperEditor({root:$('#app'),world,getPlayer:()=>actor,getLiveActors:()=>[...(boss?.encounters??[]).filter(e=>e.active!==false).map(e=>e.actor),...(world.npcWorld?.list()??[]).map(row=>world.npcWorld.get(row.id)?.encounter.actor),...(world.trainingTargets?.editableEncounters?.()??[]).map(e=>e.actor)],getState:()=>({ready:ready&&!loadingAsset&&!mapTransition?.busy&&!document.hidden&&!document.querySelector('dialog[open]')}),storage:journeyStorage,onCommit:()=>minimap.invalidate(world),canApply:()=>world.navigation.free(actor.position,playerDimensions(actor).moveRadius),autoEnter});
  };
  const toolState=()=>({ready:ready&&!loadingAsset&&!mapTransition?.busy,loading:loadingAsset||mapTransition?.busy,dead:controller?.dead||boss.playerHp<=0,hidden:document.hidden,settings:!!document.querySelector('dialog[open]'),failed:frameLoop?.failed===true||mapTransition?.failed===true||frameLoop?.loadingFailed===true});
  let npcWorldTask=null,actorEditorTask=null,gameCinematicsTask=null;
  const getNpcWorld=async()=>{
    if(world.npcWorld)return world.npcWorld;
    npcWorldTask??=Promise.all([import('./npc-world.js'),import('./npc-library.js'),import('./asset-catalog.js')]).then(async([{createNpcWorld},{hydrateNpcLibrary},{ASSET_CATALOG}])=>{
      await hydrateNpcLibrary({refresh:true});if(world.scene.isDisposed)throw new Error('맵을 다시 열어 주세요.');
      const runtime=createNpcWorld({world,catalog:ASSET_CATALOG,getState:toolState,storage:journeyStorage,onError:error=>{if(error.name!=='AbortError'){console.error('[NPC]',error);toast(error.message);}}});world.npcWorld=runtime;world.scene.onDisposeObservable.addOnce(()=>runtime.dispose());return runtime;
    }).catch(error=>{npcWorldTask=null;throw error;});return npcWorldTask;
  };
  let authoredMonsterTask=null;
  const getAuthoredMonsters=async()=>{
    if(world.authoredMonsters)return world.authoredMonsters;
    authoredMonsterTask??=import('./authored-monster-runtime.js').then(({createAuthoredMonsterRuntime})=>{
      if(world.scene.isDisposed)throw new Error('맵을 다시 열어 주세요.');
      const runtime=createAuthoredMonsterRuntime({world,battle:boss,getPlayer:()=>actor,storage:journeyStorage,getState:()=>({ready:ready&&!loadingAsset&&!mapTransition?.busy,dead:controller?.dead||boss.playerHp<=0,paused:document.hidden||!!document.querySelector('dialog[open]')||!!world.toolLease?.active||!!world.storyboardOpening?.blocksGame}),onDefeat:(event,row)=>{if(chapterQuests)chapterQuests.defeat(event,{rewardEnabled:row.rewardEnabled,dropAssetId:row.drop.assetId,dropEffectEnabled:row.drop.effectEnabled});else if(row.rewardEnabled)goldLoot.drop(event.kind,event.position);world.developmentStoryboardLive?.defeat(event);},onError:error=>console.error('[몬스터 배치]',error)});
      world.authoredMonsters=runtime;world.scene.onDisposeObservable.addOnce(()=>runtime.dispose());return runtime;
    }).catch(error=>{authoredMonsterTask=null;throw error;});return authoredMonsterTask;
  };
  try{if(releaseEnabled&&!uiTestEnabled&&new URLSearchParams(location.search).get('cinematicPreview')!=='1'&&journeyStorage?.getItem('moonforest-monster-spawns-v1'))void getAuthoredMonsters().catch(error=>console.error('[몬스터 배치]',error));}catch(error){console.error('[몬스터 배치]',error);}
  const getActorEditor=async(canOpen=()=>true)=>{
    if(!canOpen())throw new Error('배우 편집 설정이 꺼졌습니다.');
    if(world.developmentActorEditor)return world.developmentActorEditor;
    actorEditorTask??=Promise.all([import('./actor-editor.js'),getNpcWorld()]).catch(error=>{actorEditorTask=null;throw error;});
    const [{setupActorEditor},npcWorld]=await actorEditorTask;
    if(world.scene.isDisposed)throw new Error('맵을 다시 열어 주세요.');if(!canOpen())throw new Error('배우 편집 설정이 꺼졌습니다.');
    return world.developmentActorEditor??=setupActorEditor({root:$('#app'),world,battle:boss,npcWorld,getMonsterRuntime:getAuthoredMonsters,getPlayer:()=>actor,getState:toolState,storage:journeyStorage,notify:toast});
  };
  world.restoreNpcActors=async()=>{
    if(!releaseEnabled||new URLSearchParams(location.search).get('cinematicPreview')==='1')return;
    try{const raw=journeyStorage?.getItem('moonforest-0.1:npc-world:v1');if(!raw||!JSON.parse(raw).maps?.[world.mapId]?.length)return;const mapId=world.mapId,generation=world.toolGeneration,runtime=await getNpcWorld();if(world.mapId===mapId&&world.toolGeneration===generation&&toolState().ready)await runtime.ensureMap();}catch(error){if(error.name!=='AbortError'){console.error('[NPC restore]',error);toast('저장한 NPC를 열지 못했습니다. '+error.message);}}
  };
  const cinematicToolState=()=>({ready:ready&&!loadingAsset&&!mapTransition?.busy,loading:loadingAsset||mapTransition?.busy,dead:(controller?.dead||boss.playerHp<=0)&&!world.storyboardDeathPlayback,hidden:document.hidden,settings:!!document.querySelector('dialog[open]'),failed:frameLoop?.failed===true||mapTransition?.failed===true||frameLoop?.loadingFailed===true});
  const getGameCinematics=async(canOpen=()=>true)=>{
    if(!canOpen())throw new Error('컷씬 도구 설정이 꺼졌습니다.');
    if(world.developmentCinema)return world.developmentCinema;
    gameCinematicsTask??=import('./cinematic-game.js').catch(error=>{gameCinematicsTask=null;throw error;});
    const {setupGameCinematics}=await gameCinematicsTask;
    if(world.scene.isDisposed)throw new Error('맵을 다시 열어 주세요.');if(!canOpen())throw new Error('컷씬 도구 설정이 꺼졌습니다.');
    return world.developmentCinema??=setupGameCinematics({root:$('#app'),world,battle:boss,getPlayer:()=>actor,storage:journeyStorage,preview:new URLSearchParams(location.search).get('cinematicPreview')==='1',travel:id=>mapTransition.travel(travelUrl(location.href,authoringCharacter(id))),getState:cinematicToolState});
  };
  const eventParams=new URLSearchParams(location.search);
  if(releaseEnabled&&!uiTestEnabled&&!['cinematicPreview','cinematic','developer','actorLab','elenaReview','plainsReview','villageReview'].some(key=>eventParams.has(key))){
  world.storyboardEvents=createStoryboardEvents({storage:journeyStorage,getMap:()=>world.mapId,getCinema:()=>getGameCinematics(),recordQuest:(key,event,story)=>{if(!chapterQuests)throw Error('퀘스트 시스템이 준비되지 않았습니다.');return chapterQuests.event(key,1,event.once?('story-event:'+story.id+':'+event.id):undefined);},onError:error=>{console.error('[스토리 이벤트]',error);toast(error.message);},canStart:()=>{const state=toolState();const linear=world.developmentStoryboardLive?.inspect?.();return state.ready&&!state.hidden&&!state.settings&&!state.failed&&(!state.dead||world.storyboardDeathPlayback)&&!world.toolLease?.active&&!world.storyboardOpening?.blocksGame&&!world.developmentStoryboardEditor?.isVisible?.()&&(!linear||!['preparing','scene'].includes(linear.status));}});
  try{const saved=journeyStorage?.getItem('moonforest-storyboard-draft-v1');const checked=saved&&validateStoryboard(saved);if(checked?.valid)world.storyboardEvents.configure(checked.document);}catch{}
  world.scene.onDisposeObservable.addOnce(()=>world.storyboardEvents?.dispose());
  }
  const toolSessions=createDeveloperToolSessions({getEnabled:id=>developerTools?.enabled(id)===true,getTools:()=>[world.developmentEditor,world.developmentActorEditor,world.developmentCinema,world.developmentStoryboardEditor]});
  world.scene.onDisposeObservable.addOnce(()=>toolSessions.dispose());
  if(import.meta.hot)import.meta.hot.dispose(()=>toolSessions.dispose());
  const openingParams=new URLSearchParams(location.search);
  const openingStory=releaseEnabled&&!uiTestEnabled&&!['cinematicPreview','cinematic','developer','actorLab','elenaReview','plainsReview','villageReview'].some(key=>openingParams.has(key))?readStoryboardOpening(journeyStorage):null;
  if(openingStory){
    const {setupStoryboardLive}=await import('./storyboard-live.js');
    const live=world.developmentStoryboardLive=setupStoryboardLive({root:$('#app'),storage:journeyStorage,world,battle:boss,getPlayer:()=>actor,getQuests:()=>chapterQuests?.inspect(),getCinema:()=>getGameCinematics(),onEdit:()=>world.developmentStoryboardEditor?.show()});
    world.storyboardOpening=setupStoryboardOpening({root:$('#app'),document:openingStory,live,world,input,isReady:()=>{const state=toolState();return state.ready&&!state.hidden&&!state.settings&&!state.failed;},isFailed:()=>toolState().failed,travel:id=>mapTransition.travel(travelUrl(location.href,authoringCharacter(id))),wake:()=>wakeRendering(),onStart:()=>{world.storyboardGameStarted=true;world.storyboardEvents?.emit('game-start',{mapId:world.mapId});}});
    world.scene.onDisposeObservable.addOnce(()=>{world.storyboardOpening?.dispose();live.dispose();});
  }
  if(releaseEnabled&&new URLSearchParams(location.search).get('cinematicPreview')==='1'){
    getGameCinematics().then(api=>api.notifyReady()).catch(error=>{console.error('[Cinematic player]',error);toast('컷씬 도구를 불러오지 못했습니다.');});
  }
  if(releaseEnabled&&new URLSearchParams(location.search).get('cinematicPreview')!=='1'){
    const settingsDialog=$('#motion-speed-dialog');
    const exitButton=document.createElement('button'),exitScreen=document.createElement('section'),exitStyle=document.createElement('style');
    exitButton.type='button';exitButton.textContent='게임 종료';exitButton.dataset.ui='';settingsDialog.querySelector('.settings-sections').append(exitButton);
    exitScreen.dataset.toolUi='';exitScreen.hidden=true;exitScreen.className='story-game-exit';exitScreen.innerHTML='<div><h1>게임을 종료했습니다</h1><p>다시 시작하면 게임을 다시 불러옵니다.</p><button type="button" data-game-restart>다시 시작</button></div>';
    exitStyle.textContent='.story-game-exit[hidden]{display:none!important}.story-game-exit{position:fixed;inset:0;z-index:1200;background:#101c16;color:#f5edd7;display:grid;place-items:center;text-align:center;font:16px system-ui}.story-game-exit button{min-height:48px;padding:12px 24px;border:1px solid #b9a36e;border-radius:5px;background:#263e2e;color:#fff4d6;font:inherit}';$('#app').append(exitStyle,exitScreen);
    world.showGameExit=()=>{world.gameExited=true;exitScreen.hidden=false;input.reset();input.setSuspended(true);audio.stopAll();frameLoop.setPaused(true);exitScreen.querySelector('button').focus?.();};
    exitScreen.querySelector('button').addEventListener('click',()=>location.reload());
    exitButton.addEventListener('click',()=>{if(!ready||loadingAsset||mapTransition?.busy||controller?.dead||boss.playerHp<=0||world.toolLease?.active){toast('플레이 중에 다시 시도해 주세요.');return;}settingsDialog.close();input.reset();input.setSuspended(true);const count=world.storyboardEvents?.emit('game-exit',{mapId:world.mapId})??0;if(count){world.storyboardExitPending=true;wakeRendering();}else world.showGameExit();});
    world.scene.onDisposeObservable.addOnce(()=>{exitButton.remove();exitScreen.remove();exitStyle.remove();delete world.showGameExit;});
    developerTools=world.developmentToolSettings=setupDeveloperToolSettings({host:settingsDialog.querySelector('.settings-sections'),dialog:settingsDialog,storage:equipmentStorage,inGame:true,onDisable:id=>toolSessions.close(id),mounts:{
      nearby:async({host,isCurrent})=>{
        const [{setupNearbyEditor},{listEditableActorHandles}]=await Promise.all([import('./nearby-editor.js'),import('./live-actor-handles.js')]);if(!isCurrent()||world.scene.isDisposed)return;
        const control=setupNearbyEditor({root:$('#app'),world,getPlayer:()=>actor,getState:toolState,
          getActors:()=>[...listEditableActorHandles(world,boss),...(world.npcWorld?.list()??[]).map(row=>({...row,name:row.label,root:world.npcWorld.get(row.id)?.encounter.actor,kind:'actor',source:'npc-authored'}))],
          onAddActor:()=>toolSessions.open('nearby',isCurrent,async current=>{const editor=await getActorEditor(current);if(!current())return false;return editor.enter({isCurrent:current});}),
          onEdit:async(id,row)=>{
            const mapId=world.mapId,generation=world.toolGeneration;
            return toolSessions.open('nearby',isCurrent,async current=>{
              const canOpen=()=>current()&&developerTools?.enabled('nearby')===true&&!world.scene.isDisposed&&world.mapId===mapId&&world.toolGeneration===generation&&ready&&!loadingAsset&&!mapTransition?.busy&&!document.hidden&&!document.querySelector('dialog[open]')&&!controller?.dead&&boss.playerHp>0;
              const editor=await(row?.kind==='actor'?getActorEditor(canOpen):getPlacementEditor(canOpen));
              if(!canOpen())throw new Error('지역이 준비된 뒤 가까운 대상을 다시 골라 주세요.');
              try{if(await editor.enter({selection:id,isCurrent:()=>current()&&developerTools?.enabled('nearby')===true&&world.mapId===mapId&&world.toolGeneration===generation})===false)throw new Error('게임을 준비한 뒤 대상을 다시 골라 주세요.');}catch(error){toast(error.message);throw error;}
            });
          }});
        world.nearbyEditor=control;return {show:control.show,update:control.update,dispose(){control.dispose();if(world.nearbyEditor===control)world.nearbyEditor=null;}};
      },
      authoring:async({host,isCurrent})=>{
        const {setupDeveloperTools}=await import('./developer-tools.js');
        if(!isCurrent()||world.scene.isDisposed)return;
        const openStoryboard=async()=>{
          if(!world.developmentStoryboardEditor){
            const [{setupStoryboardEditor},{setupStoryboardLive}]=await Promise.all([import('./storyboard-editor.js'),import('./storyboard-live.js')]);
            if(!isCurrent()||world.scene.isDisposed)return false;
            const live=world.developmentStoryboardLive??=setupStoryboardLive({root:$('#app'),storage:journeyStorage,world,battle:boss,getPlayer:()=>actor,getQuests:()=>chapterQuests?.inspect(),getCinema:()=>getGameCinematics(isCurrent),onEdit:()=>world.developmentStoryboardEditor?.show()});
            world.developmentStoryboardEditor=setupStoryboardEditor({root:$('#app'),storage:journeyStorage,getMap:()=>world.mapId,getPosition:()=>actor?.position,studioUrl:new URL('./cinematic-studio.html',location.href).href,onMapEditor:async()=>{const editor=await getPlacementEditor(isCurrent);return editor.enter({isCurrent});},onStart:(document,options)=>live.start(document,options),onStop:()=>live.stop(),onDocumentChange:document=>world.storyboardEvents?.configure(document),getTargets:(mapId,trigger)=>mapId!==world.mapId?[]:trigger==='npc-interact'?(world.npcWorld?.list?.()??[]).map(row=>({id:row.id,name:row.label??'NPC'})):(world.placementOverlay?.instances??[]).filter(row=>row.interaction).map(row=>({id:row.instanceId,name:world.authoredPlacements?.records?.get(row.instanceId)?.entry?.catalog?.name??'오브젝트'}))});
          }
          world.developmentStoryboardEditor.show();return true;
        };
        const tools=setupDeveloperTools({root:$('#app'),managed:true,getState:toolState,studioUrl:new URL('./cinematic-studio.html',location.href).href,
          onStoryboard:()=>toolSessions.open('authoring',isCurrent,openStoryboard),
          onProps:()=>toolSessions.open('authoring',isCurrent,async current=>{const editor=await getPlacementEditor(current);if(!current())return false;return editor.enter({isCurrent:current});}),
          onActors:options=>toolSessions.open('authoring',isCurrent,async current=>{const editor=await getActorEditor(current);if(!current())return false;return editor.enter({...options,isCurrent:current});}),
          onCinema:()=>toolSessions.open('authoring',isCurrent,async current=>{const api=await getGameCinematics(current);if(!current())return false;api.show();})});
        const control=setupAuthoringNavigation({root:$('#app'),host:tools.navigationHost,href:location.href,mapId:world.mapId,getState:()=>({ready:(ready||!!world.toolLease?.active)&&!loadingAsset,mapId:world.mapId}),onMapChange:async id=>{if(!isCurrent()||id===world.mapId)return;await mapTransition.travel(travelUrl(location.href,authoringCharacter(id)));world.developmentEditor?.notifyReady?.();world.developmentCinema?.notifyReady();world.authoringNavigation?.notifyReady();}});
        const lab=document.createElement('a'),url=new URL(location.href);for(const key of ['developer','actorLab','cinematic','cinematicPreview'])url.searchParams.delete(key);url.searchParams.set('actorLab','1');lab.href=url.href;lab.textContent='배우 실험';tools.navigationHost.append(lab);
        world.authoringNavigation=control;return {show:tools.show,notifyReady:control.notifyReady,dispose(){world.developmentStoryboardEditor?.dispose();world.developmentStoryboardEditor=null;if(!world.storyboardOpening){world.developmentStoryboardLive?.dispose();world.developmentStoryboardLive=null;}tools.dispose();control.dispose();lab.remove();if(world.authoringNavigation===control)world.authoringNavigation=null;}};
      },
    }});
    world.scene.onDisposeObservable.addOnce(()=>developerTools?.dispose());
    if(import.meta.hot)import.meta.hot.dispose(()=>developerTools?.dispose());
    // An old editor URL must not override an explicitly disabled setting.
    const authoringEnabled=()=>developerTools?.enabled('authoring')===true;
    if(authoringEnabled()&&new URLSearchParams(location.search).get('developer')==='1'){
      void toolSessions.open('authoring',authoringEnabled,async current=>{const editor=await getPlacementEditor(current,{autoEnter:true});if(current())editor.notifyReady?.();}).catch(error=>{if(authoringEnabled())toast(error.message);});
    }else if(authoringEnabled()&&new URLSearchParams(location.search).get('cinematic')==='1'){
      void toolSessions.open('authoring',authoringEnabled,async current=>{const api=await getGameCinematics(current);if(current())api.show();}).catch(error=>{if(authoringEnabled())toast(error.message);});
    }
  }
  loadCharacter();
} catch (error) {
  loadingView.fail('3D 화면을 시작하지 못했습니다','진단을 복사해 전달한 뒤 페이지를 새로고침해 주세요.',{error,phase:'engine-initialization',retry:false});console.error(error);
}
