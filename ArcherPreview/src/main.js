import {devControlsHidden} from './v03/dev-controls.js';
import {strikeLungeStep,applyStrikeTravel,strikeAimRange,STARFALL_REACH_SCALE} from './v03/strike-approach.js';
import {PlayerMeleeAim,meleeNeckPoint,meleeApproachPoint} from './player-melee-aim.js';
import {createStoryboardEvents} from './storyboard-events.js';
import {validateStoryboard} from './storyboard-document.js';
import './styles.css';
import './dot-minimap.css';
import {DotMinimap} from './dot-minimap.js';
import {setupMinimapTravel,applyMinimapArrivalPose} from './minimap-travel.js';
import {MapResumeStore,readMapResume} from './map-resume.js';
import {uiTestRoute,uiTestSelectionUrl,uiTestStorage} from './ui-test-route.js';
import {releaseRoute,releaseSelectionUrl,releaseSelectionValue,isMoonforestRelease} from './release-route.js';
import {releaseStorage} from './release-storage.js';
import {editionStorage,createSaveSession} from './v03/save-slots.js';
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
import './hud-raster-v1.css';
import {setupCommercialUi} from './commercial-ui.js';
import {setupHudLayout,POTION_SLOTS_HUD_SELECTOR} from './hud-layout.js';
import {setupHudRasterV1} from './hud-raster-v1.js';
import {setupCaveStoryInspection} from './cave-story-inspection.js';
import {setupGameSelection} from './game-selection.js';
import {setupDeveloperToolSettings,createDeveloperToolSessions} from './tool-visibility-settings.js';
import { Engine, SceneLoader, SharpenPostProcess, TransformNode, Vector3, VertexBuffer } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import './serial-player-textures.js';
import {selectPlayerTextureProfile,playerTextureCapabilities} from './player-texture-profile.js';
import {selectV03PlayerTextures} from './v03/player-texture-choice.js';
import {setupPlayerTextureSettings} from './player-texture-settings.js';
import {setupBuildingTextureSettings} from './building-texture-settings.js';
import {setFrameWorkContext,frameWorkSnapshot} from './frame-work-coordinator.js';
import {prepareModelShaders} from './boss-shader-warmup.js';
import {createBossPreparation} from './boss-preparation.js';
import {inspectPreparedEffects} from './prepared-effect-lifetime.js';
import {setupEffectReviewSettings} from './effect-review-settings.js';
import './preparation-review-settings.css';
import {createMapDeparture} from './map-departure.js';
import {createMapTransition,carryPortalPose} from './map-transition.js';
import {captureVillagePlainsHandoff} from './village-plains-handoff.js';
import {updatePlainsBoundaryAtmosphere} from './plains-boundary-atmosphere.js';
import {travelWaypoint} from './map-waypoints.js';
import {applyPlayerDetail} from './player-detail.js';import {mergePlayerMeshes} from './player-mesh-merge.js';import {createRefreshMeter,calibrationMs} from './display-refresh.js';import {simplifierReady,simplifyEnabled,simplifyOwnMesh} from './mesh-simplify.js';
import {CaveCameraGuard,cavePlayerMarkerClear} from './witch-cave-camera.js';
import {waitForSceneReady} from './scene-ready.js';
import {worldSpawn,mapForCharacter,isWorldCharacter,travelUrl} from './map-route.js';
import {createMapPortal,consumeTravel,villageTravelLimit,clampVillageExit,safeRoadArrival,VILLAGE_EXIT_LIMIT} from './map-travel.js';
import { createWorld,replaceWorldMap } from './world.js';
import {prepareFixedLayouts,fixedLayoutsForCharacter,fixedLayoutStats} from './fixed-layouts.js';
import {recentResourceDownloadStats} from './resource-downloads.js';import {manifestReadStats} from './map-manifests.js';
import { PlaygroundInput } from './input.js';
import { CharacterController, STATE_LABELS, normalizeAttackSpeed } from './controller.js';
import { CharacterAnimator } from './animation.js';
import { NativeWarriorController } from './native-warrior.js';
import { WarriorV2Controller, V2_LABELS } from './warrior-v2.js';
import {CameraFollow,setupCameraFollowControls} from './camera-follow.js';
import {CameraZoom,setupCameraZoomControls} from './camera-zoom.js';
import {CameraPitch,setupCameraPitchControls} from './camera-pitch.js';
import { ARENA_RADIUS, VILLAGE_MAP, setEnemyTravelRule } from './world-limits.js';
import { fullscreenOwnerDocument,setupFullscreen } from './fullscreen.js';
import { observePageZoom, observeViewportSize } from './viewport-resize.js';
import { createTrainingTargets } from './targets.js';
import { createProjectiles } from './projectiles.js';
import { POTION } from './healing-potion.js';
import { equipmentStyles, WarriorEquipment, readEquipmentChoices, saveEquipmentChoices } from './equipment.js';
import { equipmentStats, equipmentLabel } from './equipment-stats.js';
import { initializeResourceCache, migrateCachedGlb } from './resource-cache.js';
import {createLoadingView} from './loading-view.js';
import {createContextRecovery,createContextRecoveryNotice} from './context-recovery.js';
import {prepareStartupResources,prepareMapResources} from './startup-resources.js';
import {createMapResourceInspector} from './map-resource-inspector.js';
import {inspectContentRuntimeBudget} from './content-runtime-budget.js';
import './map-resource-inspector.css';
import { BossBattle } from './boss-battle.js';
import {releaseNpcInteriorInkResources,setupInteriorInkSettings} from './character-interior-ink.js';
import { BossSelection, bossSelectionHelp, summonSelectedBoss } from './boss-selection.js';
import {MonsterSelection,MONSTER_NAMES,monsterSelectionHelp,summonSelectedMonster} from './monster-selection.js';
import { loadTrainingGround } from './environment.js';
import { loadVillage } from './village-environment.js';
import { VILLAGE_SPAWN } from './village-layout-base.js';
import { createVillageReview } from './village-review.js';
import { loadVillageTrainingTarget } from './village-training.js';
import { GOBLIN_MOTIONS } from './goblin-spec.js';
import { BOSS_ACTIVE_MOTIONS } from './boss-spec.js';
import {createSceneryStrikes} from './scenery-strikes.js';
import { PlayerStrikeSampler, PLAYER_STRIKE_AIM_YAW, PLAYER_STRIKES } from './player-strikes.js';
import {createSwordTrail,setupSwordTrailSettings} from './sword-trail.js';
import {configurePlayerSize,playerDimensions,WARRIOR_DIMENSIONS} from './player-dimensions.js';
import { createDamageNumbers } from './damage-numbers.js';
import {damageKeepOut} from './v03/damage-keep-out.js';
import { BossHealthBars } from './boss-health-bar.js';
import { PlayerHealthBar } from './player-health-bar.js';
import { setupSettingsPanel } from './settings-panel.js';
import {setupMovementSpeedSettings} from './movement-speed-settings.js';
import {setupWeatherSettings} from './weather-settings.js';
import {setupSummonPanel} from './summon-panel.js';
import {setupBossPatternPanel} from './boss-pattern-settings.js';
import {setupCharacterStylePanel} from './character-style-settings.js';
import {applyCharacterSurfaceStyle,setInteriorLinesEnabled,setSceneCharacterStyles} from './character-style.js';
import { applyHitFlash, PLAYER_STAGGER } from './hit-feedback.js';
import {StaminaFailureFeedback,applyPlayerFlash} from './stamina-feedback.js';
import {StaminaNoticeAnchor} from './stamina-notice-anchor.js';
import {setupWolfMaulNotice} from './wolf-maul-notice.js';
import {ShieldHoldSources,bindShieldHoldButton} from './shield-hold-input.js';
import { dodgeDirection, dodgeDistanceAt } from './dodge.js';
import { constrainDodge } from './dodge-collision.js';
import { AdaptivePerformance,resumeAdaptiveLevel } from './adaptive-performance.js';
import {createAdaptiveShadowWarmup} from './adaptive-shadow-warmup.js';
import {inspectActorSourceCache,setActorSourceCacheBudget} from './actor-source-cache.js';
import { setupMotionSpeedControls } from './motion-speed-controls.js';
import { setupDeathScreen } from './death-screen.js';
import { FrameLoop } from './frame-loop.js';
import {createCombatTrail} from './v03/combat-trail.js';
import {createShaderBirthWatch} from './shader-birth-watch.js';
import {createFirstPersonView} from './v03/first-person-view.js';
import {createFrameDiagnostics,mapStreamSnapshot} from './frame-diagnostics.js';
import {readRendererInfo,showSoftwareRendererNotice} from './renderer-diagnostics.js';
import {SceneDiagnostics} from './scene-diagnostics.js';
import {LoadDiagnostics,readDiagnosticMemory} from './load-diagnostics.js';
import {estimateTextureMemory,textureMemoryTotals,createTextureMemoryMeter,compactPerformanceText} from './texture-memory.js';import {setTextureTier,MONSTER_2K_TEXTURES} from './texture-replacements.js';import {createActorMaterialFreeze} from './v03/actor-material-freeze.js';import {castsPlayerShadow} from './v03/actor-shadow-casters.js';
import {smithTextureTier} from './v03/smith-texture.js';
import {inspectMapDecodeCache} from './map-decode-cache.js';
import {inspectKtxWorkerPool} from './ktx-worker-supervisor.js';
import {inspectMeshoptWorkerPool} from './meshopt-worker-supervisor.js';
import {inspectMapTerrainCache} from './map-terrain-cache.js';
import {inspectMapNavigationCache} from './map-navigation-cache.js';
import { renderPixelRatio, RenderActivity } from './render-policy.js';
import {setupFrameRateControl} from './frame-rate-settings.js';
import {enableSplitTextureUpload,splitTextureUploadStats,splitUploadPreference,villageArrivalUpload} from './split-texture-upload.js';
import {animationCompaction,setAnimationCompaction} from './animation-compaction.js';
import {tickGcCanary,gcCanarySnapshot,observerKinds} from './gc-canary.js';
import {createLongTaskLog} from './long-task-log.js';
import {setupRenderScaleControl,renderResolutionSnapshot} from './render-scale-settings.js';
import {setupPlainsViewDistanceControl,applyPlainsViewDistance,applyAdaptiveRange,plainsRenderRange} from './plains-view-distance.js';
import { ScreenProjection } from './screen-projection.js';
import { GameAudio } from './game-audio.js';
import { ActionAudio } from './action-audio.js';
import { GoldLoot, CHAPTER_ONE_COIN_DROPS } from './gold-loot.js';
import { createGoldLootView } from './gold-loot-view.js';
import { attachCharacterOutlines,setFarOutlinesEnabled } from './character-outlines.js';
import {setupQualityRestoreSettings,QUALITY_RESTORE_V03} from './quality-restore-settings.js';
import {runBeforePageReload} from './page-reload-hooks.js';
import {DodgeSprintGesture} from './dodge-sprint-input.js';
// Shared-game text in the 0.3 player's language (identity in Korean / 0.2).
import {t,tr,startLanguage} from './v03/i18n.js';
import {trackRenderTargetHealth,inspectSceneRenderTarget,inspectVillageInk,contextHealth} from './render-target-diagnostics.js';
import {createAudioLiveness} from './audio-liveness.js';
import {suspendTextBlip} from './v03/text-blip.js';
import hudLandscapeV03 from './v03/data/hud-landscape.json' with {type:'json'};
// 0.3 only (its splash defines __moonforestSplash): load the language before the loading card.
if(globalThis.__moonforestSplash)void startLanguage();

globalThis.__moonforestStartup?.entered();
const gameSelection=setupGameSelection(document.getElementById('app'));
if(import.meta.hot)import.meta.hot.dispose(()=>gameSelection.dispose());
setupSettingsPanel();
setupSummonPanel({openButton:!devControlsHidden()});
const elements=new Map();
const $ = selector => {if(!elements.has(selector))elements.set(selector,document.querySelector(selector));return elements.get(selector);};
const text=(selector,value)=>{const node=$(selector);value=tr(value);if(node.textContent!==value)node.textContent=value;};
const canvas = $('#viewport');
const audio=new GameAudio(),actionAudio=new ActionAudio(audio);
audio.bindUnlock(document);
const loading = $('#loading');
const loadingView=createLoadingView();
// The hit/death test buttons exist only in development on 0.3 (v03/dev-controls.js).
const buttons = ['#run-button', '#attack-button', '#hit-button', '#death-button', '#guard-button', '#dodge-button'].map($).filter(Boolean);
const validCharacters = ['archer', 'warrior', 'warrior-v2', 'warrior-v3', 'warrior-plains', 'warrior-v4', 'warrior-v5'];
const versionRoute=releaseRoute(location.href),releaseEnabled=versionRoute.enabled;
const splitUploadOverride=splitUploadPreference(location.search); // before the route rewrites the address
const fullAnimationKeys=/[?&]animkeys=full(?:&|$)/.test(location.search); // comparison switch: keep every exported key
const longTaskLog=versionRoute.edition?createLongTaskLog():null;
const cinematicAuthoringPreview=releaseEnabled&&new URLSearchParams(location.search).get('cinematicPreview')==='1';
const uiRoute=uiTestRoute(versionRoute.url),uiTestEnabled=uiRoute.enabled;
if(uiRoute.url.href!==location.href)history.replaceState(null,'',uiRoute.url);
if(versionRoute.edition)loadingView.enableEstimate(); // 0.3: the model stage moves the bar too (phase-share.js)
// 0.3 (user, 2026-11-21): monsters may use the road out of the village, the strip the player walks
// (map-travel.js), instead of stopping at the village circle.
// 0.3: regular monsters load their 2048 level (texture-replacements.js). Deployed-build check 2026-11-23:
// pixel-identical at play distance, max 14/255 with the wolf filling the screen. ?monstertex=4k keeps 4K.
const useMonster2k=versionRoute.edition&&new URLSearchParams(location.search).get('monstertex')!=='4k';
// 0.3: ?actorshadow=lean keeps the player's outline shells and small parts out of the shadow pass
// (v03/actor-shadow-casters.js). On trial until the comparison is approved and measured on a phone.
const leanPlayerShadows=!!versionRoute.edition&&new URLSearchParams(location.search).get('actorshadow')==='lean';
if(versionRoute.edition)setEnemyTravelRule({
  // VILLAGE_MAP and not world.mapId: the route grids are built while a map loads, before the world says where it is.
  limit:(position,normal)=>VILLAGE_MAP?villageTravelLimit(position,normal+.5)-.5:normal,
  clamp:(position,previous)=>{if(VILLAGE_MAP)clampVillageExit(position,previous);},
  outside:(point,limit)=>VILLAGE_MAP&&limit>ARENA_RADIUS&&Math.hypot(point.x,point.z)>ARENA_RADIUS&&villageTravelLimit(point,0)===0,
  warmLimits:()=>VILLAGE_MAP?[VILLAGE_EXIT_LIMIT-.5]:[],
});
if(releaseEnabled){document.title=versionRoute.label;document.documentElement.dataset.release=versionRoute.release;}
if(versionRoute.edition)document.documentElement.dataset.edition=versionRoute.edition;if(simplifyEnabled())void simplifierReady();
if(versionRoute.worldRevision)document.documentElement.dataset.world=versionRoute.worldRevision;
{const query=new URLSearchParams(location.search);if(import.meta.env.DEV||query.has('dev')||query.has('qa'))document.documentElement.dataset.dev='';}
let character = uiRoute.character;
// The starting region's prebuilt layout downloads while the engine starts (createWorld awaits it).
const startupLayouts=prepareFixedLayouts(fixedLayoutsForCharacter(character));startupLayouts.catch(()=>{});
let uiTest=null;
let commercialUi, hudLayout, developerTools, characterMenu, characterMenuOpening=false;
// Explicit review URLs use the same map, camera, rig and input system as play.
let elenaReviewMode=new URLSearchParams(location.search).get('elenaReview');
let elenaReview=null;
const bossSelection=new BossSelection();
const monsterSelection=new MonsterSelection();
if (!validCharacters.includes(character)) character = 'archer';
const isWarrior = () => character !== 'archer';
const isV2 = () => character === 'warrior-v2' || isWorldCharacter(character);
const isVillage = () => isWorldCharacter(character);
const isForest=()=>character==='warrior-v4';
const isPlains=()=>character==='warrior-plains';
const isCave=()=>character==='warrior-v5';
let resumePose=null,travelResume=false;
const mapSpawn=()=>resumePose??worldSpawn(character,location.search,VILLAGE_SPAWN);
let mapPortal;
let chapterQuests;
// The 0.3 title/prologue must not record quest actions or progress.
const questLive=()=>world?.v03?.blocksProgress?null:chapterQuests;
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
const lungeState={id:null,done:0,span:0,foe:null,reach:0};
// 0.3 combat target (src/v03/combat-target.js): whether the running strike was aimed by a held direction, and the guard's last state.
let strikeByInput=false,guardFaced=false;
// The map's monster species are ready before the loading cover lifts (capped,
// so a slow network still reaches the game; packs then finish in play).
// The loading cover lifts only after the world has really been drawn: game
// frames run behind it until every visible mesh is ready (capped). Lifting it
// on the first frame showed the bare sky colour for 0.1-0.3 s on every arrival.
async function settleWorldBehindCover(maxMs=2500){
 const sc=world?.scene;if(!sc||sc.isDisposed)return;const start=performance.now();let rendered=0,seen=0,clean=0;
 const o=sc.onAfterRenderObservable.add(()=>{rendered++;});
 try{while(performance.now()-start<maxMs){
  await new Promise(resolve=>{const t=setTimeout(resolve,60);requestAnimationFrame(()=>{clearTimeout(t);resolve();});});
  if(sc.isDisposed)return;if(rendered===seen){try{sc.render();}catch{return;}}seen=rendered;
  let pending=false;for(const mesh of sc.meshes){if(mesh.isVisible&&mesh.getTotalVertices()>0&&mesh.isEnabled()&&!mesh.isReady(true)){pending=true;break;}}
  clean=pending?0:clean+1;if(rendered>=6&&clean>=3)break;
 }}finally{sc.onAfterRenderObservable.remove(o);}
}
async function preloadMapMonsters(){try{const runtime=world?.authoredMonsters??await world?.authoredMonstersTask?.catch?.(()=>null);if(!runtime?.preload)return;let timer;await Promise.race([runtime.active&&runtime.prepareForLoading?runtime.prepareForLoading({deadlineMs:20000}):runtime.preload(),new Promise(resolve=>{timer=setTimeout(resolve,22000);})]);clearTimeout(timer);}catch(error){console.error('[몬스터 준비]',error);}}
let boss, combatResult, swordNode, shieldNode, damageNumbers, frameLoop, swordTrail,meleeAim,meleeAimDt=1/60;
const meleeTargetPoint=new Vector3();
const staminaFeedback=new StaminaFailureFeedback();
const staminaNoticeAnchor=new StaminaNoticeAnchor($('#toast'));
const wolfMaulNotice=setupWolfMaulNotice($('#app'));
let simulateFrame=false,buttonSnapshot,healthSnapshot,bossHealthBars,playerHealthBar,playerHead;
let screenProjection;
let reconcilePlayback=()=>{};
let contextRecovery;
let frameFailure=null;
function assertFrameHealthy(){
  if(frameLoop?.failed===true||frameFailure)throw new Error('게임 실행 오류: '+(frameFailure?.message??'화면 준비 중 실행이 중단되었습니다.'));
}
const touchDevice=villageForceMobile||matchMedia('(pointer: coarse)').matches;
const renderActivity=new RenderActivity(touchDevice);
// Touch devices: hold the frame cap by trading resolution, view distance and shadows.
const ADAPTIVE_LEVEL_KEY='moonforest-adaptive-level-v2';
let adaptiveStoredLevel=0;try{adaptiveStoredLevel=Number(globalThis.localStorage?.getItem(ADAPTIVE_LEVEL_KEY))||0;}catch{/* storage optional */}
const adaptivePerformance=new AdaptivePerformance({enabled:touchDevice&&!!versionRoute.edition,level:resumeAdaptiveLevel(adaptiveStoredLevel)});
const warmAdaptiveShadows=createAdaptiveShadowWarmup();
function effectivePlainsView(value){const cap=adaptivePerformance.settings.viewCap;return cap?Math.min(value,cap):value;}
function applyAdaptiveShadows(){const guard=adaptivePerformance.settings;if(world?.lighting){const restore=qualityRestore.value;world.lighting.actorShadowRange=restore.farActorShadows&&!guard.forceActorShadowRange?Infinity:guard.actorShadowRange??32;const map=world.lighting.shadows?.getShadowMap?.();if(map)map.refreshRate=restore.steadyShadows?1:guard.shadowRefresh??1;}if(world)world.detailCullRange=adaptivePerformance.settings.detailRange??0;if(world?.scene&&world.lighting)world.scene.shadowsEnabled=!!world.lighting.shadowsActive&&adaptivePerformance.settings.shadows;}
function applyAdaptivePerformance(){try{globalThis.localStorage?.setItem(ADAPTIVE_LEVEL_KEY,String(adaptivePerformance.level));}catch{/* storage optional */}applyRenderQuality();if(world){applyPlainsViewDistance(world,effectivePlainsView(plainsViewDistanceControl.value));applyAdaptiveRange(world,adaptivePerformance.settings.rangeScale);world.detailCullRange=adaptivePerformance.settings.detailRange??0;}applyAdaptiveShadows();}
let rollDirection={x:0,z:1};
const strikeSampler=new PlayerStrikeSampler();
let equipment, equipmentStorage;
try { equipmentStorage = localStorage; } catch { /* Private browsing can disable storage. */ }
const v03RawStorage=equipmentStorage;
equipmentStorage=releaseStorage(equipmentStorage,versionRoute.release);
// 0.3 keeps its own preferences; progress lives in a save slot (journeyStorage).
if(versionRoute.edition)equipmentStorage=editionStorage(v03RawStorage,equipmentStorage,versionRoute.edition);
const buildingTextures=versionRoute.edition&&!versionRoute.worldRevision
  ?setupBuildingTextureSettings({host:$('.settings-display-options'),storage:equipmentStorage}):null;
if(import.meta.hot)import.meta.hot.dispose(()=>buildingTextures?.dispose());
const movementSpeedSettings=setupMovementSpeedSettings({host:$('#common-speed-settings .settings-section-body'),storage:equipmentStorage,onChange:value=>controller?.setMovementSpeed?.(value)});
const swordTrailSettings=setupSwordTrailSettings({host:$('.settings-display-options'),storage:equipmentStorage,onChange:value=>{swordTrail?.setEnabled(value);renderActivity.wake();frameLoop?.invalidate();}});
const interiorInkSettings=setupInteriorInkSettings({...(versionRoute.edition?{key:'moonforest-interior-ink-v3'}:null),host:$('.settings-display-options'),storage:equipmentStorage,onToggle:setInteriorLinesEnabled,onChange:()=>{renderActivity.wake();frameLoop?.invalidate();}});
const qualityRestore=setupQualityRestoreSettings({...(versionRoute.edition?QUALITY_RESTORE_V03:null),host:$('.settings-display-options'),storage:equipmentStorage,onChange:value=>{setFarOutlinesEnabled(value.farOutlines);applyAdaptiveShadows();renderActivity.wake();frameLoop?.invalidate();}});setFarOutlinesEnabled(qualityRestore.value.farOutlines);
if(import.meta.hot)import.meta.hot.dispose(()=>swordTrailSettings.dispose());
const weatherSettings=setupWeatherSettings({host:$('.settings-display-options'),storage:equipmentStorage,getWorld:()=>world,onChange:()=>{renderActivity.wake();frameLoop?.invalidate();}});
const frameRateControl=setupFrameRateControl({select:$('#frame-rate-select'),storage:equipmentStorage,activity:renderActivity,onChange:fps=>{if(engine)engine.maxFPS=fps;}});
if(import.meta.hot)import.meta.hot.dispose(()=>frameRateControl.dispose());
const plainsViewDistanceControl=setupPlainsViewDistanceControl({select:$('#plains-view-distance-select'),storage:equipmentStorage,onChange:value=>{if(world)applyPlainsViewDistance(world,effectivePlainsView(value));renderActivity.wake();frameLoop?.invalidate();}});
if(import.meta.hot)import.meta.hot.dispose(()=>plainsViewDistanceControl.dispose());
const bossPatternPanel=setupBossPatternPanel({storage:equipmentStorage,release:versionRoute.release,onChange:value=>boss?.setAttackSettings(value)});
const characterStylePanel=setupCharacterStylePanel({storage:equipmentStorage,onChange:value=>{if(world)setSceneCharacterStyles(world.scene,value);renderActivity.wake();frameLoop?.invalidate();}});
let travelStorage;
try { travelStorage=sessionStorage; } catch { /* Travel also works without state storage. */ }
const combatTrail = versionRoute.edition && !versionRoute.worldRevision && !cinematicAuthoringPreview
  ? createCombatTrail({local: v03RawStorage, session: travelStorage,build:buildChunks})
  : null;
function gameplayTrail() {
  return world?.v03?.playing && !world.toolLease?.active ? combatTrail : null;
}
const v03Save=versionRoute.edition?createSaveSession({local:v03RawStorage,session:travelStorage,edition:versionRoute.edition}):null;
travelStorage=releaseStorage(travelStorage,versionRoute.release,{inherit:false});
let equipmentChoices = readEquipmentChoices(equipmentStorage);
const journeyStorage=uiTestEnabled?uiTestStorage(equipmentStorage):v03Save?v03Save.journey:equipmentStorage;
if(uiTestEnabled)travelStorage=uiTestStorage(travelStorage);
let goldLootView, townServices;
const goldLoot=new GoldLoot({storage:journeyStorage,coinDrops:versionRoute.edition&&!versionRoute.worldRevision?CHAPTER_ONE_COIN_DROPS:undefined,onPickup:amount=>townServices?.collectGold(amount),onBalance:value=>text('#gold-balance',`${value.toLocaleString()} G`)});
const minimap=new DotMinimap($('#dot-minimap'), {translucent:()=>!!versionRoute.edition&&!versionRoute.worldRevision&&$('#app').dataset.hudInput==='touch'});
let minimapTravel;
const resumeStore=new MapResumeStore(journeyStorage);
function saveMapPosition(force=false){if(elenaReview||villageReviewEnabled||plainsReviewEnabled||!world||!actor||world.v03?.blocksProgress)return;resumeStore.save({character,world,actor,camera:world.firstPerson?.cameraForSave??world.camera,ready:ready&&!loadingAsset&&(!mapTransition?.busy||force),alive:!controller?.dead&&boss?.playerAlive!==false,radius:playerDimensions(actor).moveRadius},performance.now(),{force});}
function restoreMapCamera(){if(!resumePose)return;actor.rotation.y=resumePose.yaw;const c=resumePose.camera;if(c){world.camera.alpha=c.alpha;world.camera.beta=Math.max(world.camera.lowerBetaLimit??.01,Math.min(world.camera.upperBetaLimit??3.13,c.beta));world.camera.radius=c.radius;cameraZoom.apply();}syncCameraFocus(0,{snap:true});resumePose=null;}
// 0.3 quest armor (leather, from M04) adds flat defense on top of the shield.
const V03_ARMOR_KEY='moonforest-v03-armor-v1',V03_ARMOR_DEFENSE={leather:2};
function playerDefense(){if(townServices)return townServices.economy.defense;let bonus=0;try{bonus=V03_ARMOR_DEFENSE[journeyStorage?.getItem(V03_ARMOR_KEY)]??0;}catch{/* storage optional */}return equipmentStats(equipmentChoices).defense+bonus;}
function showMinimap(){minimap.setWorld(world).catch(error=>{console.warn('[Minimap]',error);minimap.hide();});}
window.addEventListener('pagehide',()=>saveMapPosition(true));
document.addEventListener('visibilitychange',()=>{if(document.hidden)saveMapPosition(true);});
for (const slot of ['sword', 'shield']) {
  const select = $(`#${slot}-select`);
  for (const style of equipmentStyles(slot)) select.add(new Option(equipmentLabel(slot,style), style.id));
  select.value = equipmentChoices[slot];
  select.addEventListener('change', () => {
    if (!ready || !equipment) return;
    if(townServices&&world?.v03?.playing){select.value=townServices.equippedFinishes[slot];toast('가방에서 가진 장비를 착용하세요.');return;}
    equipmentChoices[slot] = equipment.select(slot, select.value);
    if(boss)boss.combat.defense=playerDefense();
    audio.play('equip');
    saveEquipmentChoices(equipmentStorage, equipmentChoices);
    $('#equipment-status').textContent = `${equipmentLabel(slot,equipmentStyles(slot).find(style => style.id === select.value))} 적용`;
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
    if(controller?.setShieldHeld?.(false)&&pending&&controller.action?.state==='shieldPush'&&!controller.guarding)questLive()?.action('shieldPush');
  },
  onCancel:()=>controller?.cancelShieldInput?.(),
});
let toastTimer;
let qualityMode = 'high';
try { qualityMode = equipmentStorage?.getItem('archer-render-quality') || 'high'; } catch { /* Storage may be unavailable in private browsing. */ }
if (!['high', 'balanced', 'battery'].includes(qualityMode)) qualityMode = 'high';
let renderViewportKey='';
const renderScaleControl=setupRenderScaleControl({host:$('.settings-display-options'),storage:equipmentStorage,touchDevice,onChange:()=>applyRenderQuality()});
if(import.meta.hot)import.meta.hot.dispose(()=>renderScaleControl.dispose());
const renderResolution=()=>renderResolutionSnapshot({engine,canvas,deviceRatio:window.devicePixelRatio,quality:qualityMode,touchDevice,percent:renderScaleControl.value});
const loadDiagnostics=new LoadDiagnostics();
const sceneDiagnostics=new SceneDiagnostics({uploadContext:()=>({map:world?.mapId??null,covered:document.documentElement.dataset.loading!==undefined})});
const mapResourceInspector=createMapResourceInspector({getWorld:()=>world,getLoad:()=>loadDiagnostics.snapshot()});
if(import.meta.hot)import.meta.hot.dispose(()=>mapResourceInspector.dispose());
let playerTextureSelection=null;
// 0.3 has its own 2K/4K row (v03/player-texture-choice.js): the 0.2 PC list stays in 0.2.
const playerTextureSettings=setupPlayerTextureSettings({host:$('.settings-display-options'),storage:equipmentStorage,release:versionRoute.edition?null:versionRoute.release,compressedSize:versionRoute.edition?4096:8192,onApply:async()=>{
  const selectedWorld=world,selectedCharacter=character,position=actor?.position.clone(),rotation=actor?.rotation.clone(),camera=world?.camera;
  const view=camera?{alpha:camera.alpha,beta:camera.beta,radius:camera.radius,target:camera.target.clone()}:null;
  $('#motion-speed-dialog').close();await retryLoading();
  if(ready&&world===selectedWorld&&character===selectedCharacter&&position&&rotation){actor.position.copyFrom(position);actor.rotation.copyFrom(rotation);if(view){camera.setTarget(view.target);camera.alpha=view.alpha;camera.beta=view.beta;camera.radius=view.radius;camera.getViewMatrix(true);}frameLoop?.invalidate();}
}});
const originalTextureRetry=document.createElement('button');originalTextureRetry.type='button';originalTextureRetry.textContent='8K 원본으로 다시 불러오기';originalTextureRetry.hidden=true;
$('#retry-load').after(originalTextureRetry);
originalTextureRetry.addEventListener('click',()=>{originalTextureRetry.hidden=true;playerTextureSettings.restoreOriginal();void retryLoading();});
let effectReviewGeneration=0;
const effectReviewSettings=setupEffectReviewSettings({host:$('.settings-display-options'),release:versionRoute.release,onMode:value=>world?.effectWorld?.setMode(value),onPreview:async value=>{
  if(!world||!ready||loadingAsset||mapTransition?.busy)throw new Error('지역 로딩이 끝난 뒤 사용해 주세요.');
  const selectedWorld=world,generation=world.toolGeneration,ticket=effectReviewGeneration;
  const {createEffectWorld}=await import('./effect-world.js');
  if(selectedWorld!==world||generation!==world.toolGeneration||ticket!==effectReviewGeneration||loadingAsset||!ready)return;
  if(!world.effectWorld){world.effectWorld=createEffectWorld(world.scene);const effectWorld=world.effectWorld;world.scene.onDisposeObservable.addOnce(()=>effectWorld.dispose());}
  await world.effectWorld.warm();if(selectedWorld!==world||generation!==world.toolGeneration||ticket!==effectReviewGeneration||loadingAsset||!ready)return;
  world.effectWorld.setMode(value);const yaw=actor.rotation.y-(config?.forwardYaw??0),point=new Vector3(actor.position.x+Math.sin(yaw)*3,actor.position.y,actor.position.z+Math.cos(yaw)*3);world.terrain.place(point);
  world.effectWorld.burst(point);$('#motion-speed-dialog').close();renderActivity.wake();frameLoop?.invalidate();
}});
if(import.meta.hot)import.meta.hot.dispose(()=>{effectReviewGeneration++;playerTextureSettings.dispose();effectReviewSettings.dispose();});
// Copy only scalar work state so old delay events cannot change as streaming
// and candidate selection advance. No extra scene traversal is needed.
function viewpointSample(){
  return {
    position:actor?[Math.round(actor.position.x*10)/10,Math.round(actor.position.z*10)/10]:null,
    camera:world?[world.camera.alpha,world.camera.beta,world.camera.radius].map(n=>Math.round(n*100)/100):null
  };
}
function ridingAndViewSample(){
  if(!versionRoute.edition||versionRoute.worldRevision)return {};
  return {
    riding:world?.riding?.inspect?.()??null,
    ...world?.pageZoom?.snapshot(),
    orbitZoom:cameraZoom&&world?.camera?.radius>0?cameraZoom.referenceRadius/world.camera.radius:null,
    dialogueOpen:world?.v03?.story?.dialogueOpen??null
  };
}
const mapWorkDiagnostics=()=>({
  ...ridingAndViewSample(),
  renderResolution:renderResolution(),
  playerTextures:playerTextureSelection,
  preparationBudget:world?.scene?frameWorkSnapshot(world.scene):null,
  // Which step of a streamed scenery load takes the main thread, and the browser's own long tasks (0.3 diagnostics).
  ...mapStreamSnapshot(world),longTasks:longTaskLog?.snapshot()??null,
  // true while the loading picture still covers the stage (frames already run behind it to settle the map)
  covered:document.documentElement.dataset.loading!==undefined,
  preparedShaders:engine?inspectPreparedEffects(engine):null,
  reviewEffects:world?.effectWorld?.inspect()??null,
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
const refreshMeter=createRefreshMeter(window);
const compactMeterEnabled = !!versionRoute.edition && !versionRoute.worldRevision;
const sampleTextureMemory = createTextureMemoryMeter();
// Once a second while a long recording runs: what the scene holds, a fixed CPU
// reference, the browser refresh rate and the monster cost of the last frame.
let probePlayerBindings=null;
// Which build made a record: the content-hashed names of the game's own chunks
// (main, v03, locale). Read once per record from what the page loaded.
function buildChunks(){try{const names=new Set();for(const entry of performance.getEntriesByType('resource')){const name=entry.name.split('/').pop().split('?')[0];if(/^(main|v03|index|boot)[-.\w]*\.js$/.test(name))names.add(name);}return [...names].slice(0,8);}catch{return null;}}
function recordingProbe(){
  const scene=world?.scene,counts=animator?.bindingCounts,previous=probePlayerBindings,memory=performance.memory,profile=boss?.profile,gpuTextures=compactMeterEnabled ? sampleTextureMemory(engine) : textureMemoryTotals(engine);
  probePlayerBindings=counts?{...counts}:null;
  return {...ridingAndViewSample(),...(compactMeterEnabled?viewpointSample():{}),map:world?.mapId??null,hz:refreshMeter.hz,calibrationMs:calibrationMs(),targetFps:engine?.maxFPS??null,
    meshes:scene?.meshes.length??null,activeMeshes:scene?.getActiveMeshes().length??null,skeletons:scene?.skeletons.length??null,animationGroups:scene?.animationGroups.length??null,animatables:scene?._activeAnimatables?.length??null,
    jsHeapMB:memory?Math.round(memory.usedJSHeapSize/1048576):null,gcFinalized:tickGcCanary().finalized,materials:scene?.materials.length??null,textures:scene?.textures.length??null,disposeObservers:scene?.onDisposeObservable.observers.length??null,foes:boss?.encounters?.filter(foe=>foe.active).length??null,...(versionRoute.edition&&world?.chapterResidents?{camps:world.chapterResidents.inspect?.()??null}:{}),engaged:profile?.engaged??null,nearFoes:profile?.near??null,farFoes:profile?.far??null,maxFoe:profile?.maxKind?`${profile.maxKind}:${profile.maxState}`:null,
    playerClipStarts:counts&&previous?counts.created-previous.created:null,playerClipReuses:counts&&previous?counts.reused-previous.reused:null,
    // Engine-held textures (all maps, retained species included) and the frame guard's level, each second (2026-11-23).
    engineTextures:gpuTextures?.count??null,textureMB:gpuTextures?.megabytes??null,...(compactMeterEnabled?{texturePeakMiB:gpuTextures?.peakMiB??null}:{}),uncompressedTextureMB:gpuTextures?.uncompressedMegabytes??null,retainedTextureSourceMB:gpuTextures?.retainedSourceMegabytes??null,adaptiveLevel:adaptivePerformance.level,frozenActorMaterials:world?.actorMaterialFreeze?world.actorMaterialFreeze.frozenNow:null,materialThaws:world?.actorMaterialFreeze?world.actorMaterialFreeze.thaws:null,
    // Whether the loading picture still covers the stage at this second: frames behind it are counted too (2026-11-23).
    covered:document.documentElement.dataset.loading!==undefined};
}
const shaderBirths=createShaderBirthWatch(()=>engine);
const frameDiagnostics=createFrameDiagnostics({probe:recordingProbe,cameraYaw:()=>world?.camera?.alpha,storage:equipmentStorage,loads:loadDiagnostics,
  contentRuntime:()=>inspectContentRuntimeBudget({world,battle:boss,audio,playerTextureProfile:playerTextureSelection,decodeCache:inspectMapDecodeCache(engine)}),
  onEnabled:enabled=>sceneDiagnostics.setEnabled(enabled,world?.scene),
  onDrawCpuEnabled:enabled=>sceneDiagnostics.setDrawCpuEnabled(enabled),
  onContinuousDraw:enabled=>sceneDiagnostics.setContinuous(enabled),
  onCollecting:active=>{sceneDiagnostics.setActive(active);if(!active)shaderBirths.pause();},
  onMapChanged:()=>sceneDiagnostics.resetGpu('map'),
  onReset:()=>{shaderBirths.pause();sceneDiagnostics.resetGpu('reset');},
  renderMetrics:()=>sceneDiagnostics.sample(),
  zoom:()=>cameraZoom?.snapshot()??null,
  memory:()=>readDiagnosticMemory(performance,{textureSample:compactMeterEnabled?sampleTextureMemory(engine):null,highTextureBytes:world?.environment?.highTextureBytes,highTextureBudget:world?.environment?.highTextureBudget,textures:world?.scene.textures.length,meshes:world?.scene.meshes.length,geometries:world?.scene.geometries.length}),
  metadata:()=>({...mapWorkDiagnostics(),adaptive:adaptivePerformance.inspect(),actorSourceCache:world?.scene?inspectActorSourceCache(world.scene):null,fixedLayouts:structuredClone(fixedLayoutStats),resourceDownloadVisits:recentResourceDownloadStats(),manifestReads:{...manifestReadStats},speeds:{...movementSpeedSettings.value,attack:attackSpeed},splitUpload:splitTextureUploadStats(world?.scene?.getEngine?.()),animationCompaction:{...animationCompaction,ms:Math.round(animationCompaction.ms)},previousRun:world?.v03?.previousRun??null,...world?.v03?.recordMetadata?.(),...(combatTrail?{previousCombat:combatTrail.previous,currentCombat:combatTrail.current}:{}),textureMemory:estimateTextureMemory(world?.scene?.getEngine?.()),...(versionRoute.edition?{renderTarget:inspectSceneRenderTarget(world?.scene?.getEngine?.(),world?.scene?.activeCamera),villageInk:inspectVillageInk(world)}:{}),gcCanary:gcCanarySnapshot(world?.scene?.getEngine?.()),sceneResources:world?.scene?{meshes:world.scene.meshes?.length??null,skeletons:world.scene.skeletons?.length??null,animationGroups:world.scene.animationGroups?.length??null,sdkActiveAnimatablesIncludingPaused:world.scene._activeAnimatables?.length??null,materials:world.scene.materials?.length??null,textures:world.scene.textures?.length??null,geometries:world.scene.geometries?.length??null,transformNodes:world.scene.transformNodes?.length??null,disposeObserverKinds:observerKinds(world.scene.onDisposeObservable),sceneObservers:{beforeRender:world.scene.onBeforeRenderObservable?.observers?.length??null,afterRender:world.scene.onAfterRenderObservable?.observers?.length??null,dispose:world.scene.onDisposeObservable?.observers?.length??null}}:null,summonPreparation:boss?.lastSummon??null,animationBindings:{player:animator?.inspectBindingCache?.()??null,enemies:(boss?.encounters??[]).map(enemy=>({kind:enemy.kind,active:enemy.active,state:enemy.brain?.state??null,bindings:enemy.animator?.inspectBindingCache?.()??null}))},playerResources:{hp:boss?.playerHp??null,maxHp:boss?.playerMaxHp??null,stamina:controller?.stamina??null,maxStamina:controller?.maxStamina??null},plainsViewDistance:world?{selected:plainsViewDistanceControl.value,applied:world.mapId==='great-plains',range:plainsRenderRange(world)}:null,questProps:chapterQuests?.propDiagnostics?.()??null,playerSize:actor?playerDimensions(actor):null,mapTransition:mapTransition?.inspect?.()??null,viewportResize:world?.viewportResize?.snapshot?.()??null,goldLootPreparation:goldLootView?.inspect?.()??null,lastFrameError:frameFailure,playback:{ready,loading:loadingAsset,running:frameLoop?.running,failed:!!(frameLoop?.failed||frameLoop?.loadingFailed),frames:frameLoop?.frames},character,quality:qualityMode,touchDevice,userAgent:navigator.userAgent,bundle:document.querySelector('script[type="module"][src]')?.getAttribute('src'),build:buildChunks(),renderSize:engine?[engine.getRenderWidth(),engine.getRenderHeight()]:null,mapDecodeCache:inspectMapDecodeCache(engine),ktxWorker:inspectKtxWorkerPool(),meshoptWorker:inspectMeshoptWorkerPool(),skyLoad:world?.sky?.lastLoad??null,screenReady:world?.scene?.metadata?.screenReady??null,mapTerrainCache:inspectMapTerrainCache(engine),mapNavigationCache:inspectMapNavigationCache(engine),caveMaterials:world?.caveAtmosphere?.inspect()??null,cameraGuard:world?.caveCamera?.inspect()??null,resourceDownloads:world?.resourceDownloadStats??null,textureStreaming:world?.environment?Object.fromEntries(Object.entries(world.environment).filter(([key])=>key.startsWith('highTexture'))):null}),
  context:()=>({...mapWorkDiagnostics(),activity:[combatResult?.moving?'이동':null,input?.cameraPointers.size?'회전/시점 조작':null,world?.environment?.geometryPending?'모델 준비':null,world?.environment?.highTexturePending?'텍스처 준비':null].filter(Boolean).join(' · ')||'플레이',
    ...viewpointSample(),
    cameraZoom:cameraZoom?.snapshot()??null,
    viewportResize:world?.viewportResize?.snapshot?.()??null,cameraFollow:cameraFollow?.snapshot()??null,cameraGuard:world?.caveCamera?.inspect()??null,
    geometryPending:world?.environment?.geometryPending??0,texturePending:world?.environment?.highTexturePending??0,
    recentShaderEffects:shaderBirths.recentEffects(),
    character,slowFoe:boss?.profile?.maxMs>=8?{kind:boss.profile.maxKind,from:boss.profile.maxFrom,state:boss.profile.maxState,ms:Math.round(boss.profile.maxMs),navMs:Math.round(boss.profile.maxNavMs??0),animatablesAdded:boss.profile.maxAnimatables??0,woke:boss.profile.maxWoke===true,far:boss.profile.maxFar===true,modeFrom:boss.profile.maxModeFrom??'',mode:boss.profile.maxMode??''}:null,bosses:boss?.encounters.filter(b=>b.active&&!b.corpseGone).map(b=>({kind:b.kind,phase:b.phase??null,state:b.brain?.state,hp:b.brain?.hp}))??[],
    renderSize:engine?[engine.getRenderWidth(),engine.getRenderHeight()]:null,targetFps:engine?.maxFPS??null})});
loadingView.setDiagnostics(()=>frameDiagnostics.snapshot());
const attackSpeedStorageKey=()=>isV2()?'warrior-v2-attack-speed-base-1.8':'archer-attack-speed';
function readAttackSpeed(){
  try{return normalizeAttackSpeed(Number(equipmentStorage?.getItem(attackSpeedStorageKey())??1));}
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
const motionSpeedControls=setupMotionSpeedControls({storage:equipmentStorage,getController:()=>isV2()?controller:null,beforeOpen:()=>{cancelAttackInput();input?.reset();}});
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

// Phones draw below the screen's own pixel density and the browser stretches
// the picture: a light sharpen pass (last in the chain, after the NPC ink)
// keeps outlines and edges crisp. It carries the MSAA when it is the first
// pass, so antialiasing is unchanged. Desktops at native density skip it.
let phoneSharpen=null,phoneSharpenCamera=null,coveredFrames=0;
function syncPhoneSharpen(){
  const camera=world?.camera;if(!engine||!camera||camera.isDisposed?.())return;
  const native=globalThis.devicePixelRatio||1,css=Math.max(1,canvas.clientWidth||1),render=engine.getRenderWidth()/css,forced=new URLSearchParams(location.search).get('sharpen'),want=forced==='1'?true:forced==='0'?false:touchDevice&&render<native*.95;
  if(phoneSharpen&&(!want||phoneSharpenCamera!==camera)){try{phoneSharpen.dispose(phoneSharpenCamera);}catch{}phoneSharpen=null;phoneSharpenCamera=null;}
  if(!want||phoneSharpen)return;
  try{phoneSharpen=new SharpenPostProcess('phone-sharpen',1,camera,undefined,engine);phoneSharpen.edgeAmount=.32;phoneSharpen.colorAmount=1;phoneSharpen.samples=Math.min(4,engine.getCaps().maxMSAASamples||1);phoneSharpenCamera=camera;}
  catch(error){console.warn('[render] sharpen unavailable',error);phoneSharpen=null;phoneSharpenCamera=null;}
}
function applyRenderQuality() {
  if (!engine) return;
  const ratio = renderPixelRatio(window.devicePixelRatio, qualityMode, touchDevice,renderScaleControl.value)*adaptivePerformance.settings.scale;
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
  world?.lighting.setQuality(qualityMode);applyAdaptiveShadows();syncPhoneSharpen();
  $('#quality-select').value = qualityMode;
  if(!document.hidden)frameLoop?.invalidate();
}

function toast(message, {stamina=false}={}) {
  staminaNoticeAnchor?.reset();
  $('#toast').classList.toggle('stamina-notice',stamina);
  $('#toast').textContent = tr(message); $('#toast').hidden = false;
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
  if($('#open-summon')){$('#open-summon').disabled=disabled;$('#open-summon').hidden=!isV2();}
  text('#boss-selection-help',bossSelectionHelp(selection));
  const present=encounter?.encounters.some(enemy=>(enemy.summonKind??enemy.kind)===(selection.phase?'elena':selection.kind)&&(!selection.phase||enemy.phase===selection.phase));
  text('#summon-boss',encounter?.loading?'불러오는 중…':present?'보스 다시 소환':'보스 소환');
  if($('#monster-kind'))updateMonsterSummonControls(encounter,disabled);
}
function updateMonsterSummonControls(encounter=boss,disabled=!ready||!isV2()||!!encounter?.loading){
  const selection=monsterSelection.current(),present=encounter?.encounters.some(enemy=>(enemy.summonKind??enemy.kind)===selection.kind);
  $('#monster-kind').value=selection.kind;$('#monster-kind').disabled=disabled;
  $('#goblin-count').value=String(selection.count);$('#goblin-count').disabled=disabled;$('#summon-goblin').disabled=disabled;
  text('#summon-goblin',encounter?.loading?'불러오는 중…':MONSTER_NAMES[selection.kind]+(present?' 다시 소환':' 소환'));
  text('#monster-selection-help',monsterSelectionHelp(selection));
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
  world?.hudRaster?.update({guarding:!!controller?.guarding,blocked:!ready||loadingAsset||!!mapTransition?.busy||!!frameLoop?.failed});
  wolfMaulNotice.update(boss?.playerAlive?boss.grab:null);
  const dead = controller?.dead || false;
  const rejected=controller?.staminaRejectSerial??0, liveTown=world?.v03?.playing?townServices:null;
  const potionCount=liveTown?liveTown.remaining:boss?.potions.remaining??3,canDrink=liveTown?liveTown.canDrink():boss?.canUsePotion;
  townServices?.updatePotionHud(!!liveTown,ready&&!dead&&!boss?.loading&&!!boss?.playerAlive&&!input?.suspended&&!controller?.captured&&!controller?.groggy&&allowed('potion'));
  if(staminaFeedback.observe(controller)){toast('스테미나가 부족합니다.',{stamina:true});audio.play('ui_error');applyPlayerFlash(container?.meshes,boss?.playerReaction,staminaFeedback);}
  const snapshot=[character,ready,dead,controller?.captured,controller?.groggy,controller?.runToggled,controller?.guardToggled,controller?.shieldHeld,controller?.guarding,boss?.active,boss?.playerAlive,boss?.loading,canDrink,boss?.canEscapeGrab,potionCount,!!liveTown,boss?.potions.pulsesLeft,rejected].join('|');
  if(snapshot===buttonSnapshot)return;buttonSnapshot=snapshot;
  $('#run-button').setAttribute('aria-pressed', String(controller?.runToggled || false));
  if($('#death-button')){
  $('#death-label').textContent = dead ? '부활' : '사망';
  $('#death-key').textContent = dead ? 'R' : 'K';
  $('#death-button').classList.toggle('dead', dead);
  }
  if(!world?.riding?.active)$('#guard-button').setAttribute('aria-pressed',String(isV2()?!!controller?.guarding:!!controller?.guardToggled));
  for (const button of buttons) button.disabled = !ready || controller?.captured || controller?.groggy || (dead && button.id !== 'death-button') || (boss?.active && !boss.playerAlive);
  if(ready&&isV2()&&!dead&&boss?.canEscapeGrab)$('#dodge-button').disabled=false;
  updateSummonControls();
  $('#summon-goblin').disabled=$('#goblin-count').disabled=$('#summon-boss').disabled;
  $('#boss-controls').hidden = !isV2();
  $('#potion-button').hidden=!isV2();
  if(!liveTown){
    $('#potion-button').disabled=!ready||!canDrink||controller?.captured||controller?.groggy;
    $('#potion-count').textContent=String(potionCount);
    $('#potion-button').setAttribute('aria-label',`회복 물약, 남은 횟수 ${boss?.potions.remaining??3}회${boss?.potions.active?', 회복 중':''}`);
  }
  $('#potion-status').textContent=boss?.potions.active?`회복 ${4-boss.potions.pulsesLeft}/4`:'1';
  $('#potion-button').classList.toggle('healing',!!boss?.potions.active);
}
// 0.3 tutorial gate: a step can allow only some actions (move, camera,
// attack, dodge, guard, potion). Always true outside the tutorial and in 0.2.
// Movement while the tutorial locks it: a fresh zero intent (the frame adds fields to it).
const noMovement=()=>({x:0,y:0,run:false});
const allowed=kind=>(kind==='camera'||!world?.riding?.locksRider)&&world?.v03?.allows?.(kind)!==false;
const actions = {
  move() { if(ready&&isV2())controller.requestMovement(); },
  guard() {
    if(!ready||!allowed('guard')||(boss?.active&&!boss.playerAlive))return;
    if(world?.riding?.active){world.riding.dismount();return;}
    if(isV2())startDefense('shieldPush');else controller.toggleGuard?.();
    updateButtons();
  },
  setShieldHeld(held,source='keyboard',pointerType){
    if(!isV2()){if(held)actions.guard();return false;}
    if(held&&(!ready||!allowed('guard')||controller.dead||controller.captured||controller.groggy||boss?.playerHp<=0))return false;
    if(held&&world?.riding?.active){world.riding.dismount();return true;}
    return shieldInput.setHeld(source,held,pointerType);
  },
  cancelShieldInput(source){return shieldInput.cancel(source);},
  isHudShieldHeld(pointerType){return shieldInput.hasTouchHud(pointerType);},
  dodge() {
    if(!ready||!isV2()||!allowed('dodge')||(boss?.active&&!boss.playerAlive))return;
    if(world?.riding?.active)return; // mounted: the held press is the horse's run (setDodgeHeld)
    startDefense('dodge');
  },
  setDodgeHeld(held,source='keyboard',pointerType){
    if(!held){world?.riding?.setRunHeld?.(false);return input?.dodgeSprintGesture?.end(source);}
    if(!ready||!isV2()||!allowed('dodge')||controller.dead||boss.playerHp<=0||controller.groggy)return false;
    if(controller.captured){actions.dodge();return false;}
    if(world?.riding?.active){world.riding.setRunHeld(true);return true;}
    return input?.dodgeSprintGesture?.begin(source,{pointerType});
  },
  cancelDodgeInput(source){world?.riding?.setRunHeld?.(false);return input?.dodgeSprintGesture?.cancel(source);},
  isHudDodgeHeld(pointerType){return input?.dodgeSprintGesture?.hasTouchHud(pointerType)??false;},
  potionSlotsEnabled(){return !!world?.v03?.playing&&!!townServices;},
  potion(slot) {
    if(!ready||!isV2()||!allowed('potion')||controller.dead||controller.captured||controller.groggy)return;
    const carried=versionRoute.edition&&!versionRoute.worldRevision;
    if(carried&&(!actions.potionSlotsEnabled()||input.suspended||document.hidden||document.querySelector('dialog[open]')))return;
    if(!carried&&slot!==undefined&&slot!==0)return;
    const belt=carried?townServices.economy.state:null;
    const kind=belt?belt.quickSlots[slot??belt.selectedQuickSlot]:'potion';
    const used=carried?townServices.drink(slot):boss.usePotion();
    if(used){
      audio.play('potion_drink');
      if(kind==='potion'){questLive()?.action('potion');audio.play('heal_start',{volume:.65});}
    }else audio.play('ui_error');
    updateButtons();
  },
  attack() { if (world?.riding?.active) {world.riding.startGallop();return;} if (ready && allowed('attack') && (!boss?.active || boss.playerAlive)) {if(elenaReview)elenaReview.requestReviewCast();else controller.attack();} },
  setAttackHeld(held, source = 'keyboard') { setAttackHeld(source, held); },
  cancelAttackInput(source) { cancelAttackInput(source); },
  isHudAttackHeld(pointerType) { return isHudAttackHeld(pointerType); },
  hit() { if (ready && !isWarrior()) { attackSources.clear();attackPointerTypes.clear(); controller.hit(); } },
  death() { if (!ready || isWarrior() || controller.dead) return; attackSources.clear(); controller.die(); input.reset(); updateButtons(); },
  revive() { if (!ready || !controller.dead) return; controller.revive();audio.setEnvironment(character);audio.play('revive'); input.reset(); updateButtons(); toast('다시 움직일 수 있습니다.'); },
  // Accept direction intent during locks; the controller still prevents displacement.
  canMove() { return ready && !controller.dead && (!boss?.active || boss.playerAlive); },
  canTurn() { return allowed('camera'); },
  // 0.3: past the closest zoom the view moves into the warrior's eyes, and back.
  zoomStep(factor) { return world?.firstPerson?.zoom(factor) ?? false; },
};

function startDefense(kind){
  const directionInput=world.v03?.pilotMovement??input.value();
  if(kind==='dodge'&&controller.captured){if(!boss.escapeGrab())return;audio.play('grab_escape');}
  if(!controller[kind]())return;
  questLive()?.action(kind);
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
  if(held&&world?.riding?.active){world.riding.startGallop();return;}
  if(elenaReview){if(held&&ready)elenaReview.requestReviewCast();return;}
  if (held) {
    if (!ready || !allowed('attack') || controller.dead || (boss?.active && !boss.playerAlive) || controller.setAttackHeld(true) === false) return;
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

let shownGreatAttack=null;
function clearGreatAttack(){
  if(shownGreatAttack){shownGreatAttack=null;world?.v03?.greatAttackFrame?.(null,null);}
  world?.v03?.story?.cancelGreatAttackFocus?.();
}
function interruptGreatAttack(){
  if(!shownGreatAttack&&!controller?.action?.greatAttack)return;
  if(controller?.action?.greatAttack)controller.cancelAttack();
  clearGreatAttack();
}

function cancelAttackInput(source,{preserveCompletedCharge=false}={}) {
  if(!source)world?.riding?.stopGallop?.();
  if(source){attackPointerTypes.delete(source);if(!attackSources.delete(source)||attackSources.size)return;}
  else {attackSources.clear();attackPointerTypes.clear();}
  // A lost HUD capture used to retain a completed, buffered ordinary heavy.
  // Starfall needs an actual release, including when queued behind another action.
  if(source&&preserveCompletedCharge&&!controller?.greatAttackLevel){
    controller?.syncHeldCharge?.();
    if(controller?.queuedAttack==='judgment'){controller.setAttackHeld(false);return;}
  }else interruptGreatAttack();
  if(controller?.cancelAttackInput)controller.cancelAttackInput();
  else controller?.setAttackHeld(false);
}

function faceHeading(heading, dt) {
  const delta = Math.atan2(Math.sin(heading - actor.rotation.y), Math.cos(heading - actor.rotation.y));
  actor.rotation.y += delta * (1 - Math.exp(-18 * dt));
}

function strikeHeading(state){
  return actor.rotation.y-(config.forwardYaw||0)-(PLAYER_STRIKE_AIM_YAW[state]??0);
}

function shootAtTarget() {
  actor.computeWorldMatrix(true);
  arrowNode?.computeWorldMatrix(true);
  const origin = arrowNode ? arrowNode.getAbsolutePosition().clone() : actor.position.add(new Vector3(0, 1.35, 0));
  const destination = shotTarget?.aimPoint.clone() || origin.add(new Vector3(Math.sin(actor.rotation.y), 0, Math.cos(actor.rotation.y)).scale(12));
  projectiles.fire(origin, destination, shotTarget);audio.play('bow_release',{position:origin});
}

// 0.3 stage reset: same state clearing as resetBeforeBoss, without its sound,
// and optionally at an authored stage point when that point is walkable.
function v03ResetStage(stage){
  world?.v03?.resetGreatAttackFx?.();
  world.riding?.leave();
  goldLoot.clearDrops();goldLootView.clear();actionAudio.reset();
  boss.resetBattle();controller.releaseCapture();controller.staggerRemaining=0;controller.hitPose=null;controller.resetStamina?.();controller.cancelAttack?.();
  staminaNoticeAnchor.reset();staminaFeedback.reset(controller);
  input.reset();attackSources.clear();attackPointerTypes.clear();strikeSampler.reset();combatResult=null;shotActionId=null;
  // A story stage always wins over any remembered position. If the exact spot
  // is blocked, the nearest free spot beside it is used (never the map spawn).
  if(stage)resumePose=null;
  const radius=playerDimensions(actor).moveRadius,onMap=!!stage&&Number.isFinite(stage.x)&&Number.isFinite(stage.z)&&(!stage.map||stage.map===world.mapId);
  const near=onMap&&world.navigation?.free?.(stage,radius,movementLimit(stage))!==true?world.navigation?.findFree?.(stage,radius,movementLimit(stage)):null;
  if(near){stage={...stage,x:near.x,z:near.z};}
  const spawn=mapSpawn(),staged=onMap;
  const yaw=staged&&Number.isFinite(stage.yaw)?stage.yaw:null;
  actor.rotationQuaternion=null;actor.rotation.set(0,(config.forwardYaw||0)+(yaw??0),0);
  actor.position.set(staged?stage.x:spawn.x,0,staged?stage.z:spawn.z);world.terrain.place(actor.position);
  animator.transition('idle',{clipTime:0,loop:true,blendDuration:.001});animator.update(.2);
  applyHitFlash(container.meshes,0);resetCamera();
  // Start behind the warrior, looking where they face.
  if(yaw!==null){world.camera.alpha=-Math.PI/2-yaw;world.camera.beta=1.2;syncCameraFocus(0,{snap:true});}
  syncCaveFog(true);world.lighting.follow(actor.position,true);updateButtons();
  return staged;
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
  world?.firstPerson?.exit();
  world?.v03?.resetGreatAttackFx?.();
  effectReviewGeneration++;world?.effectWorld?.clear();world?.sceneryStrikes?.leave();setFrameWorkContext(world?.scene,{active:false,frameId:engine?.frameId,generation:world?.toolGeneration});
  originalTextureRetry.hidden=true;
  mapResourceInspector.begin();
  world.storyboardEvents?.leaveMap();world.toolRecovery=null;world.toolGeneration=(world.toolGeneration??0)+1;world.toolLease?.cancel('reload',{restore:false});world.developmentEditor?.leaveMap();world.developmentCinema?.leaveMap();world.authoredDataLifetime?.abort();world.authoredPlacements?.leaveMap();
  world.chapterResidents?.leave();world.riding?.leave();
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
    const selectedProfile=versionRoute.edition?selectV03PlayerTextures(character,caps,undefined,{storage:v03RawStorage,legacyStorage:equipmentStorage,search:location.search})
      :selectPlayerTextureProfile(character,caps,undefined,{release:versionRoute.release,desktopPreference:playerTextureSettings.value,desktopCompressedSize:versionRoute.edition?4096:8192});
    playerTextureSelection={status:'selected',...selectedProfile};
    playerTextureSettings.sync(selectedProfile);
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
    meleeAim?.reset();meleeAim=null;swordTrail?.clear();if (animator) animator.dispose();
    equipment?.dispose(); equipment = null;
    if (container) { for (const mesh of container.meshes) world.shadows.removeShadowCaster(mesh, false); container.dispose(); }
    boss?.combat?.v02Impact?.reset();
    if (actor) actor.dispose();
    container = await SceneLoader.LoadAssetContainerAsync(rootUrl, modelUrl.pathname.split('/').pop() + modelUrl.search, world.scene, null, modelUrl.pathname.endsWith('.gltf') ? '.gltf' : '.glb');
    container.addAllToScene();
    // 0.3: join rigid shield parts and same-material baked outlines (35 → ~19 player draws). ?mergeplayer=0 turns it off.
    if (isWarrior()&&versionRoute.edition) mergePlayerMeshes(container,{keep:['Bunnyguard_Shield','Golden_Oathblade'],enabled:new URLSearchParams(location.search).get('mergeplayer')!=='0'});
    if (isWarrior()) equipment = new WarriorEquipment(container, equipmentChoices);
    // 0.3: the player's baked inverted-hull outlines keep half their triangles (shape-only meshes).
    if (isWarrior()&&simplifyEnabled()){const owned=container;void simplifierReady().then(ok=>{if(!ok||container!==owned)return;for(const mesh of owned.meshes)if(/_Outline\b|_Outline \+/.test(mesh.name)&&!mesh.isDisposed())simplifyOwnMesh(mesh,{ratio:.5,error:.01});});}
    for (const group of container.animationGroups) group.stop();
    actor = new TransformNode('player-world-transform', world.scene);
    if(isVillage()){actor.position.set(mapSpawn().x,0,mapSpawn().z);world.terrain.place(actor.position);}
    syncCaveFog(true);
    // World movement is separate from exported root motion, including the authored death fall.
    let playerModelParent=actor;
    if(versionRoute.release==='moonforest-0.2'&&isV2()){
      // The ground anchor stays terrain-owned. A single identity carrier lets
      // an accepted wolf ram lift the complete model without altering its rig.
      const carrier=new TransformNode('player-v02-impact-carrier',world.scene);
      carrier.parent=actor;actor.metadata={...actor.metadata,moonforestV02ImpactCarrier:carrier};
      playerModelParent=carrier;
    }
    if(world.gameplayV03){
      const saddle=new TransformNode('rider-saddle-offset',world.scene);
      saddle.parent=playerModelParent;playerModelParent=saddle;
      actor.metadata={...actor.metadata,saddleOffset:saddle};
    }
    for (const node of new Set([...container.meshes, ...container.transformNodes])) if (!node.parent) node.parent = playerModelParent;
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
      if(!leanPlayerShadows||castsPlayerShadow(mesh))world.shadows.addShadowCaster(mesh, false);
    }
    world.lighting.registerMeshes(container.meshes);
    applyPlayerDetail(container,world.camera);
    applyCharacterSurfaceStyle(container,'player');
    if (isWarrior()) attachCharacterOutlines(container, 'warrior');
    if (config.expectedMaxBoneInfluences && maxInfluences < config.expectedMaxBoneInfluences) throw new Error('모델의 스키닝 가중치가 설정과 일치하지 않습니다. 내보낸 파일을 확인해야 합니다.');
    // 0.3: every player clip keeps its bindings, created during loading, so a clip change never allocates (S23: 14 ms spikes).
    animator = new CharacterAnimator(container.animationGroups, config.animations,{bindingCacheSize:isV2()?(versionRoute.edition?Object.keys(config.animations).length:4):0,prewarmBindings:isV2()&&!!versionRoute.edition});
    const speeds=isV2()?Object.fromEntries(Object.entries(config.speeds??{}).map(([key,value])=>[key,value*dimensions.ratio])):config.speeds;
    controller = new (isV2() ? WarriorV2Controller : isWarrior() ? NativeWarriorController : CharacterController)({ durations: animator.durations, speeds, ...(isV2()?{holdNow:()=>performance.now()}:{}) });
    townServices?.economy.resetWeaponAction();
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
    if(isV2())meleeAim=new PlayerMeleeAim(container);
    attackSources.clear();attackPointerTypes.clear(); shotTarget = null; shotActionId = null; hiddenArrowForAction = null;
    projectiles.clear();
    animator.transition('idle', { clipTime: 0, loop: true });
    // Loading can finish while iOS has paused RAF. Sample the actual idle now,
    // rather than revealing the exported bind pose until a simulation tick.
    animator.update(0);
    $('#sword-select').disabled = !equipment; $('#shield-select').disabled = !equipment;
    $('#build-tag').textContent = isCave()?'CAVERN / 05':isPlains()?'PLAINS / 06':isForest()?'FOREST / 04':isVillage() ? 'VILLAGE / 03' : config.version || 'ARCHER / 01';
    $('#character-select').value = releaseSelectionValue(releaseEnabled,character,uiTestEnabled,world?.release);
    $('#character-name').textContent = isCave()?'Violet Vanguard v5':isPlains()?'Violet Vanguard · 대평원':isForest()?'Violet Vanguard v4':isVillage() ? 'Violet Vanguard v3' : isV2() ? 'Violet Vanguard v2' : isWarrior() ? 'Violet Vanguard' : 'Azure Elf';
    $('#character-subtitle').textContent = isCave()?'마녀의 동굴':isPlains()?'대평원':isForest()?'마물의 숲':isVillage() ? (world.environment.mode==='village-fixture'?`개발 배치 검수 · 실제 모델 ${world.environment.sourceAssets} / 25 · 빈 부지는 윤곽 표시`:'숲의 경계 마을') : isWarrior() ? '보랏빛 선봉의 전사' : '푸른 숲의 궁수';
    $('#character-eyebrow').textContent = isWarrior() ? 'THE VIOLET VANGUARD' : 'THE MOONLIT RANGER';
    $('.character-caption').textContent = isV2() ? '한손 베기 1타 ↔ 베고 찌르기 2타 · 길게: 심판 3타' : isWarrior() ? '이동하면 달리기 · J 또는 공격 버튼으로 찌르기·베기' : '가까운 허수아비를 자동으로 조준합니다.';
    $('.action-controls').hidden = false;
    $('.action-controls').dataset.character = isV2()?'warrior-v2':character;
    $('#run-button').hidden = isWarrior();
    if($('.secondary-actions')){$('.secondary-actions').hidden = isWarrior();
    $('#hit-button').hidden = isWarrior(); $('#death-button').hidden = isWarrior();}
    $('.keyboard-hint strong').textContent = tr(isWarrior() ? '달리기 이동' : '이동');
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
    canvas.setAttribute('aria-label', tr(isWarrior() ? '전사 3D 화면. WASD 달리기 이동. 좌클릭 또는 J: 짧게 일반 공격, 길게 강공격. 우클릭 드래그 회전, 휠 확대 축소.' : '궁수 3D 검수 화면. WASD 이동, J 공격, H 피격, K 쓰러짐, R 부활.'));
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
    const preparedPlayer=container,preparedGeneration=world.toolGeneration;
    await prepareModelShaders(preparedPlayer,{preparation:createBossPreparation({scene:world.scene,isCurrent:()=>container===preparedPlayer&&world.toolGeneration===preparedGeneration&&!world.scene.isDisposed}),shadows:world.shadows});
    // Keep the loading artwork through shader readiness and the first correctly
    // configured character/UI frame. Do not expose the legacy default scene.
    assertFrameHealthy();updatePlainsBoundaryAtmosphere(world,actor.position,true);syncCaveFog(true);world.scene.render();await chapterQuests?.prepareEffects();await world.goldLootView?.prepare();await preloadMapMonsters();await waitForSceneReady(world.scene,{onProgress:progress=>loadingView.preparing(progress,loadingGeneration)});
    assertFrameHealthy();world.scene.render();ready=true;audio.setEnvironment(character);updateButtons();render(0);
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    assertFrameHealthy();
    loadDiagnostics.finish();
    mapResourceInspector.captureReady();
    if(world.villageStreaming)world.villageStreaming.active=true;await settleWorldBehindCover();
    loadingView.reveal(loadingGeneration);showMinimap();
    if (!motionSpeedControls.isOpen()) canvas.focus({ preventScroll: true });
    frameLoop?.invalidate();
  } catch (error) {
    originalTextureRetry.hidden=!playerTextureSettings.noteFailure(playerTextureSelection,error);
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
  const radius=playerDimensions(actor).moveRadius;
  world.navigation.constrain(actor.position,previous,world.riding?.active?Math.max(.64,radius):radius,movementLimit(previous));
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
  // 0.3 story shots (the ambush) show no health bars.
  bossHealthBars.update(world.scene,world.v03?.story?.sceneActive?[]:boss.encounters,screenProjection,{playerPosition:actor?.position});
  const nearGiant=ready&&isV2()&&world.cave&&boss.playerHp>0&&boss.encounters.some(enemy=>enemy.active&&enemy.phase===2&&enemy.brain.hp>0&&enemy.renderVisible!==false&&enemy.fogVisible!==false&&Vector3.DistanceSquared(actor.position,enemy.actor.position)<=6.5*6.5);
  const markerClear=nearGiant&&cavePlayerMarkerClear(world.terrain,world.camera.globalPosition,actor.position);
  playerHealthBar.update(world.scene,{visible:ready&&isV2()&&!world.firstPerson?.active,actor,head:playerHead,hp:boss.playerHp,maxHp:boss.playerMaxHp,stamina:controller?.stamina??100,maxStamina:controller?.maxStamina??100,marker:{enabled:nearGiant,clearToPlayer:markerClear,groundY:actor?world.terrain.heightAt(actor.position.x,actor.position.z):0}},screenProjection);
}

function syncCaveFog(force=false){if(actor&&!actor.isDisposed())world.caveFog?.update(actor,elapsed,{force,encounters:boss?.encounters??[]});}

// 0.3 first person only in free play on foot outside the cave; anything that frames
// the camera itself (cutscene, dialogue, riding, menu, map change, death) returns to third person.
function firstPersonAllowed(){
  const v=world?.v03;
  return !!(ready&&isV2()&&v?.playing&&!v.blocksGame&&!v.cameraFocus&&!v.story?.sceneActive&&!v.story?.scenePending&&!v.story?.dialogueOpen&&
    !world.riding?.blocksFirstPerson&&!world.cave&&!controller?.dead&&!controller?.captured&&!characterMenu?.open&&!characterMenuOpening&&
    !loadingAsset&&!mapTransition?.busy&&!world.toolLease?.active&&!elenaReview&&!villageOverview&&!boss?.grab?.active);
}
function syncCameraFocus(dt,{snap=false}={}){
  if(!actor||actor.isDisposed()||!cameraPitch)return;
  const eye=world.firstPerson?.update(dt);
  if(eye){cameraPitch.follow(eye,dt,{snap:true,exact:true});world.firstPerson.limitPitch();return;}
  // 0.3 cutscenes may frame another point (a snarling wolf, the driver).
  const scripted=world.v03?.cameraFocus??null;
  const focus=scripted?new Vector3(scripted.x,scripted.y,scripted.z):elenaReview?elenaReview.actor.position.add(new Vector3(0,elenaReview.reviewFocusHeight??1.45,0)):cameraFollow.focus(actor,playerHead,boss?.nearestTarget(actor.position)?.actor.position,world.camera.radius),pan=input?.panOffset??{x:0,y:0,z:0};
  const target=(isVillage()&&villageOverview?Vector3.Zero():focus).add(new Vector3(pan.x,pan.y,pan.z));
  cameraPitch.follow(target,dt,{snap:snap||scripted?.snap===true,exact:!!scripted});
  world.caveCamera?.follow(target,dt,{stable:!cameraFollow.settings.followMotion});
}

function render(dt) {
  if(contextRecovery?.blocked)return;
  if(mapDeparture?.departing)return;
  setFrameWorkContext(world.scene,{active:ready&&!loadingAsset&&!mapTransition?.busy,frameId:engine.frameId,generation:world.toolGeneration??0});
  world.v03?.update(dt);
  world.riding?.updateAvailability();
  if(world.chapterResidents&&!mapTransition?.busy)world.chapterResidents.update(dt,world.v03?.playing,world.v03?.story?.sceneActive||input?.suspended||document.hidden||!boss?.playerAlive);
  if(world.v03&&(shownGreatAttack||controller?.action?.greatAttack)&&(!world.v03.playing||world.v03.story?.sceneActive||world.v03.story?.dialogueOpen||world.v03.blocksGame))interruptGreatAttack();
  // 0.3 slow motion (short, story-driven): the rest of the frame runs scaled.
  dt*=world.v03?.timeScale??1;
  world.storyboardOpening?.update();
  world.storyboardEvents?.update();
  if(world.storyboardDeathPlayback){const events=world.storyboardEvents?.inspect();if(!events||!events.active&&!events.queued){world.storyboardDeathPlayback=false;deathScreen.show();return;}}
  if(world.storyboardExitPending){const events=world.storyboardEvents?.inspect();if(!events||!events.active&&!events.queued){world.storyboardExitPending=false;world.showGameExit?.();return;}}
  if((ready||world.toolLease?.active)&&!loadingAsset&&!mapTransition?.busy&&!world.storyboardOpening?.blocksStoryboard&&!world.storyboardEvents?.inspect().active)world.developmentStoryboardLive?.update();
  if(ready&&!loadingAsset&&!mapTransition?.busy&&world.authoringReadyGeneration!==(world.toolGeneration??0)){
    world.authoringReadyGeneration=world.toolGeneration??0;world.developmentEditor?.notifyReady?.();world.developmentCinema?.notifyReady();world.authoringNavigation?.notifyReady();void world.restoreNpcActors?.();
  }
  if(world.toolLease?.active){
    world.plainsDecor?.updateLeaves(0,null,false);world.sceneryStrikes?.clear();
    simulateFrame=false;boss?.combat?.passiveRecovery?.reset();world.toolLease.update(dt);
    if(!world.toolLease?.active)return;
    world.camera.update();world.camera.getViewMatrix();world.camera.getProjectionMatrix();
    const toolFocus=world.camera.getTarget();
    world.villageVisibility?.update(world.camera.globalPosition,toolFocus,dt);world.treeOcclusion?.update(world.camera.globalPosition,toolFocus,dt,playerDimensions(actor));
    world.lighting.follow(toolFocus);world.scene.render(false);return;
  }
  if(cinematicAuthoringPreview){
    world.plainsDecor?.updateLeaves(0,null,false);world.sceneryStrikes?.clear();
    simulateFrame=false;boss?.combat?.passiveRecovery?.reset();const focus=world.camera.getTarget();
    world.villageVisibility?.update(world.camera.globalPosition,focus,dt);world.treeOcclusion?.update(world.camera.globalPosition,focus,dt,playerDimensions(actor));world.lighting.follow(focus);world.scene.render(false);return;
  }
  simulateFrame=dt>0&&!world.storyboardOpening?.blocksGame&&!world.storyboardExitPending&&!world.v03?.blocksGame;
  if(!simulateFrame){world.plainsDecor?.updateLeaves(0,null,false);world.sceneryStrikes?.clear();}
  if(!simulateFrame||!ready||loadingAsset||mapTransition?.busy)boss?.combat?.passiveRecovery?.reset();
  if(!simulateFrame&&world.v03?.stageHidden&&(coveredFrames=(coveredFrames+1)%12)!==0)return;
  if(!simulateFrame){syncCameraFocus(0);world.caveCamera?.beginFrame();syncCaveFog();world.scene.render(!world.caveCamera?.applied);screenProjection.beginFrame();updateStaminaNotice();updateHealthBars();goldLootView.project(screenProjection);world.caveCamera?.endFrame();return;}
  const framePreludeStart=frameDiagnostics.mark();
  elapsed += dt;
  world.tick(elapsed);
  if(world.dayCycle&&world.v03?.playing!==false)world.dayCycle.update(dt);
  world.effectWorld?.update(dt);
  if(world.sceneryStrikes){
    if(world.v03?.playing&&ready&&!loadingAsset&&!mapTransition?.busy&&!world.v03.story?.sceneActive)world.sceneryStrikes.update(dt,actor.position,boss);
    else world.sceneryStrikes.clear();
  }
  training.update(dt);
  projectiles.update(dt);
  if (ready) {
    if(isV2()){
      const beforeRecoil=actor.position.clone();
      const recoiled=boss.playerReaction.update(dt,actor);
      staminaFeedback.advance(dt);applyPlayerFlash(container.meshes,boss.playerReaction,staminaFeedback);
      if(recoiled)constrainPlayerPosition(beforeRecoil);
      boss.combat.v02Impact?.advance(dt,actor,constrainPlayerPosition);
    }
    const rawMovement=world.v03?.pilotMovement??(allowed('move')?input.value():noMovement());
    if(elenaReview){
      const length=Math.hypot(rawMovement.x,rawMovement.y),direction=length>.08?dodgeDirection(rawMovement,world.camera.alpha,elenaReview.actor.rotation.y):{x:0,z:0};
      elenaReview.reviewMovement={x:direction.x*Math.min(1,length),z:direction.z*Math.min(1,length),run:rawMovement.run||controller.runToggled};
    }
    const movement = elenaReview||(boss?.active&&!boss.playerAlive)?{x:0,y:0}:rawMovement;
    if(world.riding?.active&&allowed('move')&&!input.suspended)world.riding.steerGallop(movement,world.camera.alpha,dt);
    if(boss?.active&&!boss.playerAlive)cancelAttackInput();
    input.dodgeSprintGesture?.advance(dt);
    movement.alive=!controller.dead&&boss.playerHp>0;
    const playerControllerStart=frameDiagnostics.mark();
    const result = controller.update(dt, movement);
    if(world.v03&&shownGreatAttack&&result.greatAttack!==shownGreatAttack)clearGreatAttack();
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
    questLive()?.strike(result,actor.position);
    const busy=!!elenaReview||result.moving||result.state!=='idle'||result.chargeProgress>0||attackSources.size>0||input.cameraPointers.size>0||boss.combatCount>0||boss.loading;
    const frameLimit=renderActivity.limit({busy,quality:qualityMode});
    if(engine.maxFPS!==frameLimit)engine.maxFPS=frameLimit;
    const playerAnimationStart=frameDiagnostics.mark();
    meleeAim?.restore();meleeAimDt=dt;
    animator.transition(result.state, result); animator.update(result.captured||result.staggered||result.hitStopped?0:dt);
    frameDiagnostics.measure('playerAnimationMs',playerAnimationStart);
    const attacking = !result.captured&&!result.staggered&&['attack', 'moveAttack','slash','judgment','shieldPush'].includes(result.state);
    if (attacking && !result.greatAttack?.charging && result.actionId !== shotActionId) {
      shotActionId = result.actionId;
      shotTarget = isWarrior() ? null : training.selectNearest(actor.position);
      hiddenArrowForAction = null;
      // 0.3: without a direction the strike turns to the foe being fought (the one hit or hitting), a chain to the foe of its first swing.
      const reachScale=result.greatAttack?STARFALL_REACH_SCALE:1;
      const nearest=isV2()?boss.nearestTarget(actor.position):null,target=nearest&&world.v03?.aimTarget?world.v03.aimTarget(actor.position,nearest,true,reachScale):nearest;
      strikeByInput=isV2()&&Math.hypot(movement.x||0,movement.y||0)>.08;
      if(strikeByInput){
        const d=dodgeDirection(movement,world.camera.alpha,actor.rotation.y);
        actor.rotation.y=Math.atan2(d.x,d.z)+(PLAYER_STRIKE_AIM_YAW[result.state]??0);
      }else if(target){
        const reach=strikeAimRange(target,world.v03?.aimReach,reachScale),distance=Vector3.Distance(actor.position,target.actor.position);
        if(result.greatAttack?distance<=reach:distance<reach){
          const point=result.greatAttack?target.actor.position:versionRoute.edition&&!versionRoute.worldRevision?meleeApproachPoint(target,meleeTargetPoint):meleeNeckPoint(target,meleeTargetPoint)??target.actor.position;
          actor.rotation.y=Math.atan2(point.x-actor.position.x,point.z-actor.position.z)+(PLAYER_STRIKE_AIM_YAW[result.state]??0);
        }
      }
      meleeAim?.begin(result,actor,target,!!versionRoute.edition&&!versionRoute.worldRevision);
    }
    // 0.3: the guard raised without a direction turns to that foe too (once, as it goes up).
    if(isV2()&&world.v03?.aimTarget){
      const guard=!!result.guarding&&!result.captured&&!result.staggered;
      if(guard&&!guardFaced&&Math.hypot(movement.x||0,movement.y||0)<=.08){
        const foe=world.v03.aimTarget(actor.position,boss.nearestTarget(actor.position),false);
        if(foe?.actor&&Vector3.Distance(actor.position,foe.actor.position)<Math.max(foe.meleeAimDistance??4,world.v03.aimReach??0))actor.rotation.y=Math.atan2(foe.actor.position.x-actor.position.x,foe.actor.position.z-actor.position.z);
      }
      guardFaced=guard;
    }
    // 0.3 light combo: the warrior steps into each swing (profile from the edition),
    // eased over the opening of the clip, stopping short of the locked foe.
    const lunge=world.v03?.lunge?.[result.state];
    if(isV2()&&lunge&&attacking&&result.actionId!=null&&!result.hitStopped){
      const fitted=!versionRoute.worldRevision,nearest=fitted?null:boss.nearestTarget(actor.position);
      const target=world.v03.chainFoe;
      const step=strikeLungeStep(lungeState,actor,result,lunge,target,nearest,strikeByInput,playerDimensions(actor).ratio,controller.durations?.[result.state]||1,dt,fitted,world.v03.aimReach);
      if(step>1e-4){
        const yaw=strikeHeading(result.state);
        applyStrikeTravel(actor,result,yaw,step,world,boss.encounters,movementLimit(actor.position),playerDimensions(actor),world.mapId==='village'?clampVillageExit:null);
      }
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
      const travelSpeed=world.riding?.active?world.riding.travelSpeed(result.speed):result.speed;
      actor.position.addInPlace(direction.scale(travelSpeed * (result.movementDt??dt)));
      constrainPlayerPosition(beforeMove);
      sprintRequested=travelSpeed*(result.movementDt??dt);sprintActual=Math.hypot(actor.position.x-beforeMove.x,actor.position.z-beforeMove.z);
      if (!attacking || !shotTarget) faceHeading(Math.atan2(direction.x, direction.z) + (config.forwardYaw || 0), dt);
    }
    controller.commitSprintMovement?.(sprintRequested,sprintActual);
    // Authored jump/roll poses remain local to the actor. Only its ground anchor
    // follows terrain; a boss holding or throwing the actor owns its altitude.
    if(!result.captured&&!boss.grab.active&&!world.v03?.holdsPlayer)world.terrain.place(actor.position);
    world.riding?.afterMove(result,dt>0?sprintActual/dt:0,dt);
    if (attacking && shotTarget && !isWarrior()) {
      const direction = shotTarget.aimPoint.subtract(actor.position);
      faceHeading(Math.atan2(direction.x, direction.z) - (config.attackYaw?.[result.state] || 0), dt);
    }
    // A strike, shield or roll retains its combat heading, including its chain target.
    if(world.firstPerson?.active&&!world.riding?.active&&!attacking&&!result.guarding&&!result.groggy&&!result.staggered&&!result.captured&&result.rollFrom==null)
      actor.rotation.y=world.firstPerson.heading()+(config.forwardYaw||0);
    for (const event of result.events || []) if (event.type === 'release') {
      shootAtTarget(); hiddenArrowForAction = event.actionId;
    } else if (event.type === 'strike' && shotTarget && Vector3.Distance(actor.position, shotTarget.position) <= 1.65) {
      training.hit(shotTarget);
    }
    if (arrowMesh) arrowMesh.visibility = attacking && hiddenArrowForAction === result.actionId ? 0 : 1;
    const actionAudioStart=frameDiagnostics.mark();
    actionAudio.player(result,dt,{character,position:actor.position,duration:animator.durations[result.state],clipTime:animator.active.get(result.state)?.clipTime,strideScale:playerDimensions(actor).ratio,mounted:world.riding?.active});
    frameDiagnostics.measure('actionAudioMs',actionAudioStart);
    world.developmentActors?.beforeBattle(dt,actor);world.authoredMonsters?.beforeBattle(dt,actor);
    frameDiagnostics.measure('framePreludeMs',framePreludeStart);
    if(boss)gameplayTrail()?.sample(dt,world.mapId,boss.encounters,boss.playerHp);
    if(boss)boss.profile=frameDiagnostics.collecting?(boss.profile??{}):null;const bossUpdateStart=frameDiagnostics.mark();boss?.update(dt,actor);frameDiagnostics.measure('bossUpdateMs',bossUpdateStart);if(boss?.profile){const p=boss.profile;frameDiagnostics.set('bossNearMs',p.nearMs);frameDiagnostics.set('bossFarMs',p.farMs);frameDiagnostics.set('bossSeparationMs',p.separationMs);frameDiagnostics.set('bossPostMs',p.postMs);frameDiagnostics.set('bossMaxOneMs',p.maxMs);frameDiagnostics.set('navGridMs',p.navGridMs);frameDiagnostics.set('navPathMs',p.navPathMs);}actionAudio.boss(boss,dt);
    world.developmentActors?.afterBattle(actor);world.authoredMonsters?.afterBattle(actor);
    boss?.combat?.recover?.(dt,actor,boss.onDamage,!controller.dead&&boss.playerHp>0);
    townServices?.tick(dt);
    const collected=goldLoot.update(dt,actor.position,isV2()&&!controller.dead&&boss.playerAlive&&!controller.captured,(a,b)=>!world.navigation||world.navigation.segmentClear(a,b,0,true));
    if(collected.length){const amount=collected.reduce((sum,drop)=>sum+drop.amount,0);damageNumbers.show(actor.position.add(new Vector3(0,playerDimensions(actor).goldHeight,0)),`+${amount} G`,false,'gold');audio.play('gold_pickup');}
    goldLootView.sync(goldLoot.drops);
    // worldUpdateMs stays the whole block; the four parts name where a long one went
    // (S23 2026-11-25: 226 ms and 98 ms frames here, part unknown). Marks are null when not recording.
    const worldUpdateStart=frameDiagnostics.mark();syncCameraFocus(dt);
    world.caveCamera?.beginFrame();
    if(isVillage()){world.camera.getViewMatrix();world.camera.getProjectionMatrix();}
    updatePlainsBoundaryAtmosphere(world,actor.position);world.lighting.follow(actor.position);
    frameDiagnostics.measure('worldCameraMs',worldUpdateStart);
    const worldRangeStart=frameDiagnostics.mark();
    for(const enemy of boss.encounters)enemy.updateRenderRange(world.camera.globalPosition);
    syncCaveFog();
    frameDiagnostics.measure('worldRangeMs',worldRangeStart);
    const worldOcclusionStart=frameDiagnostics.mark();
    world.treeOcclusion?.update(world.camera.globalPosition, actor.position, dt,playerDimensions(actor));
    frameDiagnostics.measure('worldOcclusionMs',worldOcclusionStart);
    const worldVisibilityStart=frameDiagnostics.mark();
    world.villageVisibility?.update(world.camera.globalPosition, actor.position, dt);world.meadow?.update(world.camera.globalPosition,dt);
    frameDiagnostics.measure('worldVisibilityMs',worldVisibilityStart);
    frameDiagnostics.measure('worldUpdateMs',worldUpdateStart);
    const hudUpdateStart=frameDiagnostics.mark();
    text('#state-label', result.captured?boss.grab.label:result.groggy?'그로기 · 행동 불가':result.staggered?'피격 · 경직':result.guarding?'방어 태세':result.chargeProgress>0?'심판 준비':isV2() ? V2_LABELS[result.state] : isWarrior() ? { idle:'대기', run:'달리기', attack:'찌르기·베기' }[result.state] : STATE_LABELS[result.state]);
    text('#speed-label', `${result.speed.toFixed(2)} m/s`);
    text('#target-label', isV2() ? '검·방패 장착 · 검술 3종 / 방패 밀치기' : isWarrior() ? '검·방패 장착 · 달리기 / 찌르기·베기' : selectedTarget ? `${selectedTarget.name} · 명중 ${selectedTarget.hits}` : controller.dead ? '부활하면 전투를 재개합니다' : '허수아비 가까이 이동하세요');
    updateButtons();mapPortal?.update(dt);minimap.update(actor,elapsed);saveMapPosition();uiTest?.update(elapsed);world.authoredInteractions?.update(elapsed);
    frameDiagnostics.measure('hudUpdateMs',hudUpdateStart);
  }
  statusTime += dt;
  if (statusTime > .5) { const fps=Math.round(engine.getFps());text('#live-fps',compactMeterEnabled?compactPerformanceText(fps,refreshMeter.hz,sampleTextureMemory(engine)):refreshMeter.hz?`${fps} FPS · ${refreshMeter.hz}Hz`:`${fps} FPS`);$('#render-status').textContent = `${fps} FPS · ${engine.getRenderWidth()}×${engine.getRenderHeight()} · 최대 ${engine.maxFPS} FPS · ${ready ? 'LIVE' : 'LOADING'}`; statusTime = 0; }
  const sceneCallStart=frameDiagnostics.mark();
  if(world.plainsDecor && versionRoute.edition && !versionRoute.worldRevision){
    const exploring=simulateFrame&&ready&&!loadingAsset&&!mapTransition?.busy&&world.v03?.playing&&!world.v03.story?.sceneActive&&boss?.playerAlive&&!boss.combatCount;
    world.plainsDecor.updateLeaves(dt,actor?.position,exploring);
  }
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

function travelCombatCount(){
  return world?.gameplayV03&&world.v03?.playing ? Number(world.v03.combatLocksTravel) : boss.combatCount;
}

function bindMapPortal(disarmRoadDestination=null,cameFrom=null){
  mapPortal?.dispose();
  mapPortal=createMapPortal(world,{button:$('#map-travel'),persistTravel:false,disarmRoadDestination,
    returnGate:cameFrom&&world.gameplayV03?{destination:cameFrom,seconds:3,confirm:portal=>world.v03?.playing&&world.v03.confirmReturn?world.v03.confirmReturn(portal.destination):true}:null,
    getState:()=>({position:actor?.position,loading:!ready||loadingAsset||mapTransition?.busy||boss.loading,dead:controller?.dead||boss.playerHp<=0,captured:controller?.captured||controller?.groggy,healing:boss.potions.active,enemies:travelCombatCount(),hp:boss.playerHp,potions:boss.potions.remaining}),
    onTravel:(url,portal)=>{world.firstPerson?.exit();const boundary=portal.roadPassage?captureVillagePlainsHandoff(character,portal.destination,actor,world.camera,input.panOffset):null;mapTransition.travel(url,{boundary,playerTravelFrom:character});}});
}

function travelFromMinimap(href){
  const waypoint=travelWaypoint(href);
  if(waypoint&&character===waypoint.character&&world.mapId===waypoint.map){
    if(!ready||loadingAsset||mapTransition?.busy||mapTransition?.failed||controller.dead||controller.captured||controller.groggy||boss.playerHp<=0||boss.loading||boss.potions.active||travelCombatCount()>0){toast('현재는 이동할 수 없습니다.');return false;}
    const radius=playerDimensions(actor).moveRadius;
    if(!world.navigation.free(waypoint.position,world.riding?.active?Math.max(.64,radius):radius,movementLimit(waypoint.position))){toast('이동할 위치를 사용할 수 없습니다.');return false;}
    world.firstPerson?.exit();input.reset();cancelAttackInput();boss.combat?.passiveRecovery?.reset();
    actor.position.set(waypoint.position.x,0,waypoint.position.z);world.terrain.place(actor.position);
    applyMinimapArrivalPose(actor,world.camera,input.panOffset,{destination:character,position:waypoint.position,waypoint});
    syncCameraFocus(0,{snap:true});syncCaveFog(true);world.lighting.follow(actor.position,true);saveMapPosition(true);return true;
  }
  return mapTransition.travel(href,{minimap:true,playerTravelFrom:character});
}

try {
  if (!Engine.isSupported()) throw new Error('이 브라우저에서 WebGL을 사용할 수 없습니다.');
  engine = new Engine(canvas, true, { preserveDrawingBuffer: false, stencil: true, powerPreference: 'high-performance',loseContextOnDispose:true });
  trackRenderTargetHealth(engine);
  const updateGraphicsDevice=()=>{
    if(versionRoute.edition){
      const smith=versionRoute.edition==='moonforest-0.3'&&!versionRoute.worldRevision?smithTextureTier(engine.getCaps()):{};
      setTextureTier({...(useMonster2k?MONSTER_2K_TEXTURES:{}),...smith});
    }
    const info=readRendererInfo(engine);
    frameDiagnostics.setGraphicsDevice(info);
    if(info.mode==='software'&&!cinematicAuthoringPreview){
      const splash=window.__moonforestSplash;
      void Promise.allSettled(splash?[splash.done,startLanguage()]:[]).then(()=>{
        if(!engine.isDisposed && readRendererInfo(engine).mode==='software' && !$('#loading')?.classList.contains('error'))
          showSoftwareRendererNotice(info,{doc:document,view:window,onChange:()=>reconcilePlayback()});
      }).catch(error=>console.warn('[renderer notice]',error));
    }
  };
  updateGraphicsDevice();
  engine.onContextRestoredObservable.add(updateGraphicsDevice);
  if(combatTrail)engine.onContextLostObservable.add(()=>gameplayTrail()?.fault(world.mapId,'webgl-context-lost',boss?.playerHp));
  engine.maxFPS=renderActivity.limit();
  setAnimationCompaction(!!versionRoute.edition&&!fullAnimationKeys);
  if(!versionRoute.edition)setActorSourceCacheBudget(0);// 0.2 keeps releasing actor sources
  if(versionRoute.edition&&splitUploadOverride===true){
    enableSplitTextureUpload(engine,{bytesPerFrame:()=>loadingAsset?16<<20:touchDevice?1<<20:4<<20});
  }else if(versionRoute.edition==='moonforest-0.3'&&touchDevice&&splitUploadOverride===null){
    enableSplitTextureUpload(engine,{
      accept:(data,internal)=>villageArrivalUpload(world?.mapId,document.documentElement.dataset.loading!==undefined,data,internal),
      idleBytes:1<<20
    });
  }
  // The Studio controls live outside the preview iframe. Moving focus to
  // those controls blurs its window even while the document stays visible.
  // Actual hidden/modal suspension is still owned by syncPlayback below.
  engine.renderEvenInBackground=cinematicAuthoringPreview;
  applyRenderQuality();
  await startupLayouts;
  world = createWorld(engine,{village:isVillage(),forest:isForest(),cave:isCave(),plains:isPlains(),warrior:isWarrior(),touchDevice,gameplayV03:!!versionRoute.edition&&!versionRoute.worldRevision});
  world.release=versionRoute.release;world.edition=versionRoute.edition??null;
  world.buildingTextureSettings=buildingTextures;
  setFrameWorkContext(world.scene,{active:false,frameId:engine.frameId,generation:world.toolGeneration??0});
  world.weather=weatherSettings;weatherSettings.mapChanged();world.dayCycle?.mapChanged();
  world.frameDiagnostics=frameDiagnostics;
  // 0.3: freeze drawn character materials (v03/actor-material-freeze.js); on trial with ?matfreeze=1.
  if(versionRoute.edition&&new URLSearchParams(location.search).get('matfreeze')==='1')world.actorMaterialFreeze=createActorMaterialFreeze(world.scene);
  if(new URLSearchParams(location.search).get('posetrace')==='1')void import('./pose-trace.js').then(({installPoseTrace})=>installPoseTrace({scene:world.scene,getEncounters:()=>boss?.encounters,getPlayer:()=>actor,getShield:()=>shieldNode})).catch(error=>console.warn('[pose trace]',error));
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
  applyPlainsViewDistance(world,effectivePlainsView(plainsViewDistanceControl.value));applyAdaptiveRange(world,adaptivePerformance.settings.rangeScale,true);
  setupCaveStoryInspection({world,getState:()=>({position:actor?.position,loading:!ready||loadingAsset||mapTransition?.busy,dead:controller?.dead||boss?.playerHp<=0,combat:(boss?.combatCount??0)>0,busy:controller?.captured||controller?.groggy}),onOpen:()=>{input?.reset();cancelAttackInput();}});
  world.caveCamera=new CaveCameraGuard(world);
  setSceneCharacterStyles(world.scene,characterStylePanel.settings.value);
  cameraZoom=new CameraZoom(world.camera,{referenceRadius:isVillage()?17:4.8,storage:equipmentStorage,key:`moonforest-camera-zoom-${isVillage()?'world':'training'}-v1`,
    // 0.3 (2026-11-20, user): the furthest view is 2x by default (was 1.2x).
    ...(versionRoute.edition?{minZoom:2,defaultsVersion:3}:{})});
  cameraPitch=new CameraPitch(world.camera,{warrior:isWarrior(),storage:equipmentStorage});
  world.firstPerson?.dispose();
  world.firstPerson=world.gameplayV03?createFirstPersonView({camera:world.camera,zoom:cameraZoom,storage:equipmentStorage,
    getHead:()=>playerHead,getMeshes:()=>container?.meshes??[],allowed:firstPersonAllowed}):null;
  if(world.firstPerson){
    const mode=world.firstPerson,label=document.createElement('label'),toggle=document.createElement('input');
    toggle.type='checkbox';toggle.checked=mode.enabled;toggle.addEventListener('change',()=>mode.setEnabled(toggle.checked));
    label.append(toggle,' ',tr('최대 확대에서 1인칭으로 전환'));$('#camera-zoom-options').append(label);
    world.scene.onDisposeObservable.addOnce(()=>{label.remove();mode.dispose();});
  }
  cameraFollow=new CameraFollow({storage:equipmentStorage});
  const cameraSettingChanged=()=>{syncCameraFocus(0,{snap:true});frameDiagnostics.refresh();renderActivity.wake();frameLoop?.invalidate();};
  $('#map-polygon-estimate')?.addEventListener('click',async event=>{
    const button=event.currentTarget,status=$('#map-polygon-status'),map=world.mapId;button.disabled=true;status.textContent='맵 배치를 집계하는 중…';
    try{const [{ASSET_CATALOG},{estimateMapPolygons}]=await Promise.all([import('./asset-catalog.js'),import('./map-polygon-estimate.js')]);if(world.mapId!==map){status.textContent='맵이 바뀌었습니다. 다시 집계해 주세요.';return;}const value=estimateMapPolygons(world,ASSET_CATALOG);status.textContent=`맵 전체 배치 예상치 ${value.estimatedTotal?.toLocaleString()??'—'} 삼각형 · 모든 배치를 근거리 LOD로 가정합니다. 화면 밖·미로딩 포함, 배우·효과·외곽선·그림자 제외. 배치 ${value.placements}개 · 집계 불가 ${value.unknown}개. 실제 상주 자원은 ‘이번 로딩 리소스 보기’에서 확인하세요.`;}
    catch(error){status.textContent='맵 집계 실패: '+error.message;}finally{button.disabled=false;}
  });
  setupCameraZoomControls(cameraZoom,{onChange:cameraSettingChanged});cameraPitchControls=setupCameraPitchControls(cameraPitch,{onChange:cameraSettingChanged});
  setupCameraFollowControls(cameraFollow,{onChange:cameraSettingChanged});
  world.villageOverview=isVillage()&&villageOverview;
  if(world.villageOverview){world.scene.fogStart=200;world.scene.fogEnd=260;world.camera.maxZ=500;}
  if(villageReviewEnabled)villageReview=createVillageReview(world,{forcedMobile:villageForceMobile});
  world.lighting.setQuality(qualityMode);applyAdaptiveShadows();
  screenProjection=new ScreenProjection(world.scene);
  resizeScreenProjection();
  damageNumbers=createDamageNumbers(world.scene,$('#damage-numbers'),{visibleAt:p=>world.caveFog?.allowsPoint(p)??true,keepOut:versionRoute.edition?damageKeepOut(document):null,spread:!!versionRoute.edition});
  goldLootView=world.goldLootView=createGoldLootView(world.scene,$('#loot-labels'),{visibleAt:p=>world.caveFog?.allowsPoint(p)??true});
  if(world.gameplayV03)world.sceneryStrikes=createSceneryStrikes(world,audio);
  const damageFeedback=(...args)=>{
    const target=args[6]??args[7];
    if(world.v03?.playing&&townServices&&(args[3]==='block'||args[3]==='player')&&townServices.economy.wearDefense(args[3]==='block'))boss.combat.defense=townServices.economy.defense;
    gameplayTrail()?.hit(world.mapId,args[3],target,boss?.playerHp,frameDiagnostics.enabled&&args[3]==='enemy'?{damage:args[1],weapon:townServices?.weaponMark()??null}:null);
    world?.v03?.combatEvent?.(args[3],target,args[1],args[2]===true);
    damageNumbers.show(...args);
    if(!isWarrior()&&args[3]==='enemy')audio.play('arrow_hit',{position:args[0]});
    else actionAudio.damage(...args);
  };
  bossHealthBars=new BossHealthBars($('#boss-hud'),{showNumbers:!versionRoute.edition,underFeet:!!versionRoute.edition&&!versionRoute.worldRevision});
  playerHealthBar=new PlayerHealthBar($('#player-health'));
  boss=new BossBattle(world,encounter=>{
    const snapshot=[encounter.loading,encounter.active,encounter.encounters.length,encounter.livingCount,encounter.playerHp,encounter.lastHit].join('|');
    if(snapshot===healthSnapshot)return;healthSnapshot=snapshot;
    updateSummonControls(encounter);
    if(!$('#monster-kind'))$('#summon-goblin').textContent=encounter.loading?'불러오는 중…':encounter.encounters.some(e=>e.kind==='goblin')?'고블린 다시 소환':'고블린 소환';
    $('#player-combat-status').hidden=!encounter.active;
    if(!encounter.active){bossHealthBars.update(world.scene,[]);return;}
    $('#combat-feedback').textContent=encounter.lastHit||'방패 밀치기 시전 중 블록';
    if(encounter.playerHp<=0){world.developmentStoryboardLive?.update();if(!world.storyboardDeathPlayback&&!deathScreen.isOpen()&&!world.v03?.interceptDeath?.()){const events=world.storyboardEvents?.inspect();const count=!events?.active&&!events?.queued?world.storyboardEvents?.emit('death',{mapId:world.mapId})??0:0;if(count){world.storyboardDeathPlayback=true;input?.reset();cancelAttackInput();}else deathScreen.show();}}
  },damageFeedback,(duration,options={})=>{
    if('captured' in options){
      if(options.captured){world.riding?.playerCaptured?.();if(shownGreatAttack)clearGreatAttack();actions.cancelDodgeInput();actions.cancelShieldInput();controller.capture();audio.play('grab_caught');}else controller.releaseCapture();
      attackSources.clear();attackPointerTypes.clear();strikeSampler.reset();return true;
    }
    const reacted=options.knockdown?controller.knockdown(options):controller.hit(duration,options);
    if(reacted!==false){if(shownGreatAttack)clearGreatAttack();if(!controller.held){attackSources.clear();attackPointerTypes.clear();}strikeSampler.reset();}
    applyPlayerFlash(container.meshes,boss.playerReaction,staminaFeedback);
    return reacted;
  },{onDefeat:event=>{const defeatStart=frameDiagnostics.mark();try{townServices?.defeat(event);world.v03?.defeat(event);}catch(error){console.error('[MoonForest 0.3]',error);}frameDiagnostics.measure('defeatMs',defeatStart);try{sceneDiagnostics.requestDrawCpuCapture('enemy-defeat');frameDiagnostics.captureEvent('enemy-defeat');}catch{/* Diagnostics must not alter rewards or combat. */}if(chapterQuests)chapterQuests.defeat(event);else goldLoot.drop(event.kind,event.position,{canLand:(from,to)=>!world.navigation||world.navigation.free(to,.08)&&world.navigation.segmentClear(from,to,.05),heightAt:(x,z)=>world.terrain.heightAt(x,z)});world.developmentStoryboardLive?.defeat(event);},onDiagnosticEvent:event=>frameDiagnostics.bossEvent(event)});
  sceneDiagnostics.setEnabled(frameDiagnostics.enabled,world.scene);
  boss.setAttackSettings(bossPatternPanel.settings.value);
  if(world.gameplayV03)boss.combat.onBladeContact=actionId=>{if(world.v03?.playing)townServices?.weaponHit(actionId);};
  boss.combat.defense=playerDefense();
  try{swordTrail=createSwordTrail(world.scene,{enabled:swordTrailSettings.enabled,onError:error=>console.warn('[검격 잔상]',error)});}catch(error){console.warn('[검격 잔상]',error);}
  world.scene.onAfterAnimationsObservable.add(()=>{
    if(!simulateFrame)return;
    if(!ready||!isWarrior()||!combatResult){swordTrail?.clear();return;}
    const meleeAimStart=frameDiagnostics.mark();
    meleeAim?.apply(combatResult,actor,meleeAimDt);
    frameDiagnostics.measure('playerMeleeAimMs',meleeAimStart);
    const attackBonus=(world.v03?.playing&&townServices)?townServices.attackPower+(world.v03.strikeBonus??0):equipmentStats(equipmentChoices).attackBonus;
    let sample=strikeSampler.sample(combatResult,swordNode,shieldNode,isV2(),actor.rotation.y,attackBonus,playerDimensions(actor));
    try{swordTrail?.update(sample,combatResult.state,elapsed,equipmentChoices.sword);}catch(error){swordTrail?.setEnabled(false);console.warn('[검격 잔상]',error);}
    const contactsStart=frameDiagnostics.mark();
    if(sample?.contacts.length && world.sceneryStrikes && world.v03?.playing && !world.v03.story?.sceneActive &&
       !loadingAsset && !mapTransition?.busy && boss.playerAlive && !controller.captured && !controller.staggerRemaining){
      const surface=world.sceneryStrikes.hit(sample,combatResult.state,actor.position,!boss.combatCount);
      if(surface)boss.combat.onBladeContact?.(sample.actionId);
      if(surface==='stone'&&controller.deflectSword(sample.actionId)){
        sample=null;strikeSampler.reset();swordTrail?.clear();
      }else if(surface)controller.pauseOnImpact(.025);
    }
    const cast=combatResult.greatAttack;
    if(cast){
      if(sample&&cast.center&&controller.action?.greatAttack===cast&&boss.playerAlive){
        cast.sample(combatResult.clipTime,sample,PLAYER_STRIKES.judgment[0],attackBonus,actor.position,world,strikeHeading(combatResult.state));
        shownGreatAttack=cast;world.v03?.greatAttackFrame?.(cast,sample.blade);
      }else{sample=null;if(shownGreatAttack)clearGreatAttack();}
    }
    const bossStop=isV2()?boss.poseAndContacts(actor,combatResult,sample,shieldNode):0;
    frameDiagnostics.measure('contactsMs',contactsStart);
    const targetStop=!controller.captured&&!controller.staggerRemaining&&(!cast||controller.action?.greatAttack===cast)?training.melee(sample,boss.combat.onBladeContact,world.navigation):0;
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
  const diagnosticFullscreen=$('#diagnostic-fullscreen'),primaryFullscreen=$('#fullscreen-button');
  const toggleFullscreen=()=>primaryFullscreen?.click();
  diagnosticFullscreen?.addEventListener('click',toggleFullscreen);
  const stopFullscreen=setupFullscreen(primaryFullscreen,toast,{
    owner:world.gameplayV03?fullscreenOwnerDocument(document):document,
    labels:world.gameplayV03?active=>({name:tr('전체화면'),title:t(active?'hud.tip.exitFullscreen':'hud.tip.fullscreen')}):undefined,
    onSync:button=>{if(diagnosticFullscreen){diagnosticFullscreen.textContent=button.textContent;diagnosticFullscreen.setAttribute('aria-label',button.getAttribute('aria-label'));diagnosticFullscreen.setAttribute('aria-pressed',button.getAttribute('aria-pressed'));}},
  });
  const releaseFullscreen=()=>{stopFullscreen();diagnosticFullscreen?.removeEventListener('click',toggleFullscreen);window.removeEventListener('pagehide',leaveFullscreenPage);};
  const leaveFullscreenPage=event=>{if(!event.persisted)releaseFullscreen();};
  window.addEventListener('pagehide',leaveFullscreenPage);
  world.scene.onDisposeObservable.addOnce(releaseFullscreen);
  mapDeparture=createMapDeparture({
    prepare:href=>{world.v03?.resetGreatAttackFx?.();townServices?.clear();characterMenu?.close();world.firstPerson?.exit();world.storyboardEvents?.leaveMap();world.toolRecovery=null;world.toolGeneration=(world.toolGeneration??0)+1;world.toolLease?.cancel('map-departure',{restore:false});world.developmentEditor?.leaveMap();world.developmentCinema?.leaveMap();world.developmentActorEditor?.leaveMap();world.npcWorld?.leaveMap();ready=false;loadingView.begin(new URL(href,location.href).searchParams.get('character'));input.reset();cancelAttackInput();frameLoop?.setPaused(true);frameDiagnostics.suspend();audio.stopAll();world.cancelResourceDownloads?.();},
    release:()=>{staminaNoticeAnchor.dispose();input.dispose();audio.dispose();engine.dispose();},
    navigate:url=>{void runBeforePageReload().finally(()=>location.replace(url));},
    onError:error=>{console.error('[Map departure]',error);loading.classList.add('error');$('#loading-title').textContent='맵 이동을 완료하지 못했습니다';$('#loading-text').textContent='연결을 확인한 후 새로고침해 주세요.';},
  });
  let mapLoadingGeneration;
  mapTransition=createMapTransition({
    prepare:(href,context)=>{
      world.v03?.story?.cancelRaidWarning?.();
      world.v03?.resetGreatAttackFx?.();townServices?.clear();world.firstPerson?.exit();world.storyboardEvents?.leaveMap();world.toolRecovery=null;world.toolGeneration=(world.toolGeneration??0)+1;world.toolLease?.cancel('map-change',{restore:false});world.developmentEditor?.leaveMap();world.developmentCinema?.leaveMap();world.authoredDataLifetime?.abort();world.authoredPlacements?.leaveMap();
      world.chapterResidents?.leave();
      if(context?.playerTravelFrom&&world.v03?.playing&&!world.v03.story?.sceneActive){
        world.riding?.beginTravel(mapForCharacter(new URL(href,location.href).searchParams.get('character')));
      }else world.riding?.leave();
      world.developmentActors?.leaveMap();world.authoredMonsters?.leaveMap();world.developmentActorEditor?.leaveMap();world.npcWorld?.leaveMap();
      if(!travelResume)saveMapPosition(true);resumePose=null;hudLayout?.close();minimapTravel?.close();minimap.hide();chapterQuests?.releaseMap();
      leaveElenaReview();
      frameDiagnostics.mapChanged();mapResourceInspector.begin();effectReviewGeneration++;world.effectWorld?.clear();world.sceneryStrikes?.leave();setFrameWorkContext(world.scene,{active:false,frameId:engine.frameId,generation:world.toolGeneration??0});loadDiagnostics.begin('지역 이동');
      ready=false;loadingAsset=true;staminaNoticeAnchor.reset();staminaFeedback.reset(controller);mapLoadingGeneration=loadingView.begin(new URL(href,location.href).searchParams.get('character'));updateButtons();input.reset();cancelAttackInput();
      boss.combat?.passiveRecovery?.reset();
      frameLoop?.setPaused(true);frameDiagnostics.suspend();audio.stopAll();audio.play('portal_depart');actionAudio.reset();
      boss.hide();releaseNpcInteriorInkResources(world.scene);applyPlayerFlash(container?.meshes,boss?.playerReaction,staminaFeedback);for(const enemy of boss.allPooled)enemy.routeState={};
      goldLoot.clearDrops();goldLootView.clear();projectiles.clear();training.setSelected(null);
      combatResult=null;meleeAim?.reset();lungeState.id=null;lungeState.foe=null;strikeSampler.reset();swordTrail?.clear();mapPortal?.dispose();mapPortal=null;
      world.cancelResourceDownloads?.();
      prepareFixedLayouts(fixedLayoutsForCharacter(new URL(href,location.href).searchParams.get('character'))).catch(()=>{});
    },
    release:async()=>{await boss.trimDormantModels();await world.releaseEnvironment?.();world.releaseResourceDownloads?.();},
    load:async (href,context)=>{
      const url=new URL(href),destination=url.searchParams.get('character'),sourceCharacter=character,waypoint=travelWaypoint(url),loadingGeneration=mapLoadingGeneration;
      url.searchParams.delete('elenaReview');
      url.searchParams.delete('waypoint');
      await prepareFixedLayouts(fixedLayoutsForCharacter(destination));
      replaceWorldMap(world,destination);applyPlainsViewDistance(world,effectivePlainsView(plainsViewDistanceControl.value));applyAdaptiveRange(world,adaptivePerformance.settings.rangeScale,true);applyAdaptiveShadows();character=destination;history.replaceState(null,'',url);
      const handoff=context?.boundary?.to===destination?context.boundary:null;
      if(travelResume){travelResume=false;resumePose=readMapResume(journeyStorage,destination,world,{radius:WARRIOR_DIMENSIONS.moveRadius,portalArrival:false});}
      const spawn=handoff?.position??waypoint?.position??mapSpawn();actor.position.set(spawn.x,0,spawn.z);world.terrain.place(actor.position);
      syncCaveFog(true);
      world.v03?.prepareGreatAttack?.(controller.greatAttackLevel);
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
      $('#character-select').value=releaseSelectionValue(releaseEnabled,character,uiTestEnabled,world?.release);bindMapPortal(handoff?.from??null,context?.playerTravelFrom);
      if(isCave())await boss.activateResident(actor);
      await prepareElenaReview();world.authoredPlacements?.update(0,actor);
      await skyReady;
      assertFrameHealthy();loadDiagnostics.phase('screen');syncCaveFog(true);world.scene.render();await chapterQuests?.prepareEffects();await world.goldLootView?.prepare();await preloadMapMonsters();await waitForSceneReady(world.scene,{onProgress:progress=>loadingView.preparing(progress,loadingGeneration)});assertFrameHealthy();world.scene.render();
    },
    finish:async()=>{
      assertFrameHealthy();
      loadingAsset=false;ready=true;audio.setEnvironment(character);audio.play('portal_arrive');updateButtons();
      world.storyboardEvents?.emit('map-enter',{mapId:world.mapId});
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      assertFrameHealthy();
      applyRenderQuality();loadDiagnostics.finish();mapResourceInspector.captureReady();
      const modalOpen=townServices?.open||characterMenu?.open||hudLayout?.isOpen()||minimapTravel?.isOpen()||uiTest?.isOpen()||motionSpeedControls.isOpen()||$('#help-dialog').open||$('#summon-dialog').open||$('#boss-pattern-dialog').open||$('#character-style-dialog').open||$('#diagnostic-detail-dialog').open;
      frameLoop.setPaused(document.hidden||modalOpen||deathScreen.isOpen()||contextRecovery?.blocked===true);
      audio.setSuspended(document.hidden||modalOpen||contextRecovery?.blocked===true);
      world.villageStreaming.active=true;await world.v03?.arrival?.();await settleWorldBehindCover();
      if(await world.riding?.finishTravel(position=>{
        const safe=safeRoadArrival(world,position,Math.max(.64,playerDimensions(actor).moveRadius),movementLimit);
        return {...safe,y:world.terrain.heightAt(safe.x,safe.z)};
      }))syncCameraFocus(0,{snap:true});
      loadingView.reveal(mapLoadingGeneration);showMinimap();
      if(!document.hidden)canvas.focus({preventScroll:true});world.developmentCinema?.notifyReady();world.developmentEditor?.notifyReady?.();world.authoringNavigation?.notifyReady();
    },
    onError:error=>{travelResume=false;loadingAsset=false;ready=false;frameLoop?.setPaused(true);audio.setSuspended(true);world.cancelResourceDownloads?.();loadDiagnostics.finish(error.message);console.error('[Map transition]',error);const timedOut=error.name==='TimeoutError'||/시간.*초과/.test(error.message);loadingView.fail(timedOut?'맵 이동 시간이 초과되었습니다':'맵 이동을 완료하지 못했습니다',frameFailure?'게임 실행 오류: '+frameFailure.message:timedOut?'준비 작업의 응답이 없어 이동을 중단했습니다. 아래 버튼으로 다시 시도해 주세요.':'아래 오류 내용과 진단 복사 버튼으로 기록을 전달할 수 있습니다.',{retryLabel:frameFailure?'다시 불러오기':'맵 이동 다시 시도',error:frameFailure??error,phase:loadDiagnostics.snapshot()?.failedPhase??'map-transition'});},
  });
  minimapTravel=setupMinimapTravel({element:$('#dot-minimap'),root:$('#app'),
    getState:()=>({character,ready:ready&&!loadingAsset&&!mapTransition?.busy,loading:boss.loading,busy:mapTransition?.failed||frameLoop?.failed||frameLoop?.loadingFailed,dead:controller?.dead||boss.playerHp<=0,captured:controller?.captured||controller?.groggy,healing:boss.potions.active,enemies:travelCombatCount()}),
    onTravel:url=>travelFromMinimap(url),resetInput:()=>{input.reset();cancelAttackInput();},onPauseChange:()=>reconcilePlayback()});
  world.scene.onDisposeObservable.addOnce(()=>minimapTravel?.dispose());
  bindMapPortal();
  frameLoop=new FrameLoop(engine,dt=>{
    // Resize/context callbacks can request an isolated frame while the gameplay loop is paused.
    if(characterMenuOpening||characterMenu?.open)return;
    const firstCollectedFrame=frameDiagnostics.beginFrame((ready||!!world.toolLease?.active)&&!loadingAsset&&frameLoop.running,engine.maxFPS);
    if(frameDiagnostics.collecting)shaderBirths.beginFrame(firstCollectedFrame);
    if(adaptivePerformance.sample(frameLoop.intervalMs||dt*1000,{active:ready&&!loadingAsset&&!mapTransition?.busy&&frameLoop.running&&!document.hidden,targetMs:1000/Math.min(engine.maxFPS||60,60)}))applyAdaptivePerformance();
    if(touchDevice&&world.gameplayV03)warmAdaptiveShadows(world,ready&&!loadingAsset&&!mapTransition?.busy&&frameLoop.running&&!document.hidden&&world.v03?.playing&&adaptivePerformance.settings.emergency&&adaptivePerformance.settings.shadows&&!boss.combatCount);
    try{render(dt);}catch(error){
      gameplayTrail()?.fault(world.mapId,'frame-error',boss?.playerHp,error?.message);
      world.toolLease?.cancel('error',{restore:false});
      frameFailure={name:error.name??'Error',message:String(error.message??error).slice(0,240),stack:String(error.stack??'').slice(0,4000),at:new Date().toISOString()};ready=false;
      loadDiagnostics.finish(frameFailure.message);
      frameLoop.failed=true;frameLoop.setPaused(true);input.reset();cancelAttackInput();audio.setSuspended(true);updateButtons();
      console.error('[Game frame]',error);loadingView.fail('게임 실행이 중단되었습니다','다시 불러오기를 눌러 주세요. '+frameFailure.message,{error,phase:'frame'});
    }finally{
      world.caveCamera?.endFrame();
      if(frameDiagnostics.collecting){
        shaderBirths.endFrame();
        frameDiagnostics.set('shaderCompileAttempts',shaderBirths.frameAttempts);
        frameDiagnostics.set('shaderCompileAttemptsBetweenFrames',shaderBirths.betweenAttempts);
      }
      frameDiagnostics.endFrame();
    }
  });
  const syncPlayback=()=>{
    if(mapDeparture?.departing||mapTransition?.busy)return;
    const summonOpen=$('#summon-dialog').open,otherSettings=townServices?.open||characterMenuOpening||characterMenu?.open||hudLayout?.isOpen()||minimapTravel?.isOpen()||uiTest?.isOpen()||world.authoredInteractions?.isOpen()||motionSpeedControls.isOpen()||$('#help-dialog').open||$('#boss-pattern-dialog').open||$('#character-style-dialog').open||$('#diagnostic-detail-dialog').open||$('#software-renderer-notice')?.open,settingsOpen=summonOpen||otherSettings,paused=document.hidden||settingsOpen||deathScreen.isOpen()||!!world.gameExited||frameLoop.failed===true||mapTransition?.failed===true||frameLoop.loadingFailed===true||contextRecovery?.blocked===true;
    world.toolLease?.setPaused(paused);
    if(paused)world.firstPerson?.exit();
    if(paused){input.reset();cancelAttackInput();world.hudRaster?.clear();boss?.combat?.passiveRecovery?.reset();}frameLoop.setPaused(paused);
    if(paused){if((!characterMenuOpening&&!characterMenu?.open)||frameLoop.failed)text('#live-fps',compactMeterEnabled?(frameLoop.failed?'Error':'Paused'):(frameLoop.failed?'실행 오류':'일시정지'));frameDiagnostics.suspend({preserveBossBaseline:summonOpen&&!otherSettings&&!document.hidden&&!deathScreen.isOpen()&&frameLoop.failed!==true});}
    audio.setSuspended(document.hidden||(settingsOpen&&!townServices?.forgeAudible)||!!world.gameExited||frameLoop.failed===true||mapTransition?.failed===true||frameLoop.loadingFailed===true||contextRecovery?.blocked===true||!!(world.toolLease?.active&&!world.toolLease.audioEnabled));
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
  window.addEventListener('pagehide',()=>{combatTrail?.flush();staminaNoticeAnchor.reset();frameLoop.setPaused(true);frameDiagnostics.suspend();audio.setSuspended(true);});
  // 0.3: sound only while the page paints (audio-liveness.js; iPhone kept playing after the app was closed).
  if(versionRoute.edition&&!world.audioLiveness){audio.enableLiveGuard();world.audioLiveness=createAudioLiveness({onStarve:()=>{audio.setStarved(true);suspendTextBlip();},onRevive:()=>audio.setStarved(false),onBeat:()=>audio.beat()});}
  const restorePlayback=()=>{syncPlayback();frameLoop.restart();frameDiagnostics.suspend({preserveBossBaseline:$('#summon-dialog').open&&!minimapTravel?.isOpen()&&!document.hidden&&!motionSpeedControls.isOpen()&&!$('#help-dialog').open&&!$('#boss-pattern-dialog').open&&!$('#character-style-dialog').open&&!$('#diagnostic-detail-dialog').open&&!deathScreen.isOpen()&&frameLoop.failed!==true});};
  window.addEventListener('pageshow',restorePlayback);
  window.addEventListener('focus',restorePlayback);
  if(versionRoute.release==='moonforest-0.2'){
    const notice=createContextRecoveryNotice(document);let inputWasSuspended=false;
    contextRecovery=createContextRecovery(engine,{
      onLost:()=>{inputWasSuspended=input.suspended===true;input.setSuspended(true);cancelAttackInput();frameDiagnostics.suspend();notice.show();syncPlayback();},
      onRestored:()=>{const toolRecovery=world.toolRecovery;world.toolRecovery=null;const toolRestored=toolRecovery?.recover()===true;if(!toolRestored)input.setSuspended((!toolRecovery&&inputWasSuspended)||cinematicAuthoringPreview||!!world.gameExited);notice.hide();restorePlayback();},
      onTimeout:()=>{input.setSuspended(true);syncPlayback();notice.fail();},
    });
    world.scene.onDisposeObservable.addOnce(()=>{contextRecovery.dispose();notice.dispose();});
  }else engine.onContextRestoredObservable.add(()=>{if(world.toolRecovery){world.toolRecovery.recover();world.toolRecovery=null;}restorePlayback();});
  syncPlayback();
  if(versionRoute.edition&&!versionRoute.worldRevision){
    const pageZoom=world.pageZoom=observePageZoom(window);
    world.scene.onDisposeObservable.addOnce(pageZoom.dispose);
  }
  const viewportResize=world.viewportResize=observeViewportSize(canvas, () => {
    if(mapDeparture?.departing||mapTransition?.busy)return;
    applyRenderQuality();
    // Fullscreen can suspend the browser's render callback while Babylon's
    // backing buffer is reallocated. Re-register only the already-running loop.
    frameLoop?.restart?.();
    sceneDiagnostics.requestDrawCpuCapture('viewport-commit');
  },window,{onPending:()=>{if(!mapDeparture?.departing&&!mapTransition?.busy)input.reset();},onLayout:()=>{if(!mapDeparture?.departing&&!mapTransition?.busy)resizeScreenProjection();}});
  world.requestDrawCpuCapture=reason=>sceneDiagnostics.requestDrawCpuCapture(reason);
  // Frame recorder sections other systems may fill (e.g. ambientWakes: actors restored from an off-screen pause this frame).
  world.setFrameDiagnostic=(name,value)=>frameDiagnostics.set(name,value);
  if(combatTrail)world.noteCombatDefeat=(foe,completed)=>gameplayTrail()?.defeat(world.mapId,foe,boss?.playerHp,completed);
  world.requestDeathDiagnostic=reason=>{try{sceneDiagnostics.requestDrawCpuCapture(reason);frameDiagnostics.captureEvent(reason);}catch{/* Optional diagnostic only. */}};
  world.scene.onDisposeObservable.addOnce(viewportResize);
  $('#quality-select').addEventListener('change', event => {
    qualityMode = event.target.value;
    try { equipmentStorage?.setItem('archer-render-quality', qualityMode); } catch { /* Keep the current session choice. */ }
    applyRenderQuality();
  });
  $('#run-button').addEventListener('click', () => { controller?.toggleRun?.(); updateButtons(); });
  const shieldButtonBinding=bindShieldHoldButton($('#guard-button'),{setHeld:actions.setShieldHeld,cancel:actions.cancelShieldInput,tap:actions.guard});
  world.scene.onDisposeObservable.addOnce(()=>shieldButtonBinding.dispose());
  if(!versionRoute.edition||versionRoute.worldRevision){
    const button=$('#potion-button'),action=actions.potion;let lastPress=-Infinity;
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
    button.addEventListener('pointerup',event=>{event.preventDefault();lastPress=performance.now();actions.setDodgeHeld(false,'button:'+event.pointerId);if(button.hasPointerCapture?.(event.pointerId))button.releasePointerCapture(event.pointerId);});
    for(const name of ['pointercancel','lostpointercapture'])button.addEventListener(name,event=>actions.cancelDodgeInput('button:'+event.pointerId));
    button.addEventListener('click',event=>{if(event.detail===0&&performance.now()-lastPress>350)actions.dodge();});
  }
  $('#boss-kind').addEventListener('change',()=>{bossSelection.choose($('#boss-kind').value);updateSummonControls();});
  $('#boss-count').addEventListener('change',()=>{bossSelection.setCount($('#boss-count').value);updateSummonControls();});
  $('#monster-kind')?.addEventListener('change',()=>{monsterSelection.choose($('#monster-kind').value);updateSummonControls();});
  $('#goblin-count').addEventListener('change',()=>{if($('#monster-kind'))monsterSelection.setCount($('#goblin-count').value);updateSummonControls();});
  for(const [selector,count,kind] of [['#summon-boss','#boss-count','bear'],['#summon-goblin','#goblin-count','goblin']])$(selector).addEventListener('click',async()=>{
    if(!ready||!isV2()||boss.loading)return;
    try{
      input.reset();attackSources.clear();controller.cancelAttack();controller.staggerRemaining=0;leaveElenaReview();
      const selection=kind==='bear'?bossSelection.current():$('#monster-kind')?monsterSelection.current():null;
      const summoned=await (selection?(kind==='bear'?summonSelectedBoss:summonSelectedMonster)(boss,actor,selection):boss.summon(actor,$(count).value,kind));
      if(!summoned)return;
      $('#summon-dialog').close();
      actionAudio.reset();
      if(!selection?.phase)for(const enemy of boss.encounters.filter(e=>(e.summonKind??e.kind)===(selection?.kind??kind)))audio.play(kind==='bear'?'boss_appear':'goblin_appear',{position:enemy.actor.position,volume:kind==='bear'?1:.45});
      world.camera.radius=Math.max(world.camera.radius,innerWidth<600?11:8);canvas.focus({preventScroll:true});
    }
    catch(error){console.error('[Boss load]',error);toast('보스를 불러오지 못했습니다. 연결을 확인한 뒤 다시 소환해 주세요.');audio.play('ui_error');}
    updateButtons();
  });
  for(const motion of BOSS_ACTIVE_MOTIONS){const li=document.createElement('li');li.textContent=`${motion.label} · ${motion.name}`;$('#boss-motion-list').append(li);}
  for(const motion of GOBLIN_MOTIONS){const li=document.createElement('li');li.textContent=`${motion.label} · ${motion.name}`;$('#goblin-motion-list').append(li);}
  $('#character-select').value = releaseSelectionValue(releaseEnabled,character,uiTestEnabled,world?.release);
  $('#character-select').addEventListener('change', event => {
    if (loadingAsset) return;
    if(isMoonforestRelease(event.target.value)||releaseEnabled){
      if(event.target.value===versionRoute.release&&releaseEnabled)return;
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
    if(next!==character&&isWorldCharacter(character)&&isWorldCharacter(next)){url.searchParams.set('arrival','portal');mapTransition.travel(url.href,{playerTravelFrom:character});return;}
    if(mapForCharacter(next)!==mapForCharacter(character)){mapDeparture.leave(url.href);return;}
    character=next;history.replaceState(null, '', url);
    loadCharacter();
  });
  $('#attack-speed').addEventListener('input', event => {
    applyAttackSpeed(Number(event.target.value));
    try { equipmentStorage?.setItem(attackSpeedStorageKey(), String(attackSpeed)); } catch { /* Keep the session choice. */ }
  });
  $('#reset-attack-speed').addEventListener('click', () => {
    applyAttackSpeed(1);
    try { equipmentStorage?.setItem(attackSpeedStorageKey(), '1'); } catch { /* Keep the session choice. */ }
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
  $('#hit-button')?.addEventListener('click', actions.hit);
  $('#death-button')?.addEventListener('click', () => controller?.dead ? actions.revive() : actions.death());
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
  // 0.3 runs its own story/quest runtime (src/v03/story.js) instead of the 0.2 chapter quests.
  if(isWorldCharacter(character)&&!versionRoute.edition&&!elenaReviewMode&&new URLSearchParams(location.search).get('legacyUiTest')!=='1'){
    chapterQuests=setupChapterQuests({root:$('#app'),world,storage:journeyStorage,getWalletState:()=>goldLoot.saveState,onChestOpened:({tier,position})=>{audio.play('gold_pickup',{position,volume:.95+(tier-1)*.1,rate:.85+(tier-1)*.1});if(tier>=4)audio.play('charge_ready',{position,volume:.28,rate:1.05+(tier-4)*.12});},onInteract:({id,kind,mapId})=>world.storyboardEvents?.emit(kind==='npc'?'npc-interact':'object-interact',{targetId:id,mapId}),openEquipment:()=>{const section=$('.character-info')?.closest('details');if(section)section.open=true;$('#motion-speed-toggle').click();},creditGold:total=>goldLoot.creditCumulative('chapter-one',total),getState:()=>({ready:ready&&!loadingAsset&&!mapTransition?.busy&&!world.v03?.blocksProgress,character,map:world.mapId,position:actor?.position,dead:controller?.dead||boss.playerHp<=0,combat:boss.combatCount>0,busy:controller?.captured||controller?.groggy}),resetInput:()=>{input.reset();cancelAttackInput();},onPauseChange:()=>reconcilePlayback(),heal:amount=>{if(!ready||loadingAsset||boss.playerHp<=0||boss.potions.active)return 0;const gained=Math.min(amount,boss.playerMaxHp-boss.playerHp);if(gained>0){boss.combat.hp+=gained;updateHealthBars();boss.onChange(boss);}return gained;}});uiTest=chapterQuests;
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
    if(world.release==='moonforest-0.2'){
      world.hudRaster=setupHudRasterV1({root:$('#app'),touchDevice,onLayoutChange:()=>hudLayout?.refresh()});
      world.scene.onDisposeObservable.addOnce(()=>world.hudRaster?.dispose());
      if(import.meta.hot)import.meta.hot.dispose(()=>world.hudRaster?.dispose());
    }
    hudLayout=setupHudLayout({root:$('#app'),storage:equipmentStorage,getReady:()=>ready&&!loadingAsset&&!mapTransition?.busy&&!frameLoop?.failed&&!controller?.dead,resetInput:()=>{input?.reset();cancelAttackInput();},onPauseChange:()=>reconcilePlayback(),onClose:message=>toast(message),
      // 0.3: its own quest panel, and a reviewed landscape layout (portrait keeps the authored default).
      ...(versionRoute.edition?{selectors:{quest:'.v03-quest',potion:POTION_SLOTS_HUD_SELECTOR},orientationDefaults:{landscape:hudLandscapeV03}}:{})});
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
  // active:false prepares (title / resume screen: species preloaded) without
  // placing monsters; startWorld activates the same runtime.
  const getAuthoredMonsters=async({active=true}={})=>{
    if(world.authoredMonsters){if(active)world.authoredMonsters.activate?.();return world.authoredMonsters;}
    authoredMonsterTask??=Promise.all([
      import('./authored-monster-runtime.js'),
      versionRoute.release==='moonforest-0.2'?import('./plains-monster-spawns.js'):null,
    ]).then(([{createAuthoredMonsterRuntime},defaults])=>{
      if(world.scene.isDisposed)throw new Error('맵을 다시 열어 주세요.');
      const runtime=createAuthoredMonsterRuntime({world,battle:boss,active,getPlayer:()=>actor,getFocus:()=>world.v03?.questSpot??null,storage:journeyStorage,defaultDocument:defaults?.PLAINS_MONSTER_SPAWNS,defaultRevision:defaults?.PLAINS_MONSTER_SPAWNS_REVISION,getState:()=>({ready:ready&&!loadingAsset&&!mapTransition?.busy,dead:controller?.dead||boss.playerHp<=0,paused:document.hidden||!!document.querySelector('dialog[open]')||!!world.toolLease?.active||!!world.storyboardOpening?.blocksGame}),onDefeat:(event,row)=>{if(row.rewardEnabled)townServices?.defeat(event);if(chapterQuests)chapterQuests.defeat(event,{rewardEnabled:row.rewardEnabled,dropAssetId:row.drop.assetId,dropEffectEnabled:row.drop.effectEnabled});else if(row.rewardEnabled)goldLoot.drop(event.kind,event.position);world.developmentStoryboardLive?.defeat(event);try{world.v03?.defeat(event);}catch(error){console.error('[MoonForest 0.3]',error);}},onError:error=>console.error('[몬스터 배치]',error)});
      world.authoredMonsters=runtime;world.scene.onDisposeObservable.addOnce(()=>runtime.dispose());return runtime;
    }).catch(error=>{authoredMonsterTask=null;throw error;});world.authoredMonstersTask=authoredMonsterTask;return authoredMonsterTask.then(runtime=>{if(active)runtime.activate?.();return runtime;});
  };
  // 0.3 starts the living world itself, after the title and the first fight.
  try{if(!versionRoute.edition&&releaseEnabled&&!uiTestEnabled&&new URLSearchParams(location.search).get('cinematicPreview')!=='1'&&(versionRoute.release==='moonforest-0.2'||journeyStorage?.getItem('moonforest-monster-spawns-v1')))void getAuthoredMonsters().catch(error=>console.error('[몬스터 배치]',error));}catch(error){console.error('[몬스터 배치]',error);}
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
  if(versionRoute.edition){
    const {setupV03,setupHudTooltips}=await import('./v03/index.js');
    if(!versionRoute.worldRevision){
      const {setupTownServices}=await import('./v03/town-services.js');
      townServices=setupTownServices({world,root:$('#app'),wallet:goldLoot,player:()=>actor?.position,battle:()=>boss,controls:()=>controller,appearance:()=>equipment,
        usePotion:actions.potion,canOpenPotionPicker:()=>actions.potionSlotsEnabled()&&ready&&!input.suspended&&!document.hidden&&!document.querySelector('dialog[open]')&&allowed('potion')&&!controller.dead&&!controller.captured&&!controller.groggy,onPotionLayout:()=>hudLayout?.refresh(),
        legacy:()=>v03Save.meta().used?{...equipmentChoices,armor:journeyStorage.getItem(V03_ARMOR_KEY)}:{},
        canInteract:()=>!!world.v03?.playing&&!world.v03.blocksGame&&!world.v03.story?.sceneActive&&!world.v03.story?.dialogueOpen&&!loadingAsset&&!mapTransition?.busy&&boss.playerAlive&&!boss.combatCount&&!controller?.captured&&!controller?.groggy&&!document.querySelector('dialog[open]'),
        onPause:()=>reconcilePlayback(),notify:message=>toast(message),sound:(cue,options)=>audio.play(cue,options),onLevelUp:event=>world.v03?.celebrateLevel?.(event)===true});
      world.scene.onDisposeObservable.addOnce(()=>{townServices?.dispose();townServices=null;});
    }
    if(world.gameplayV03){
      const {createChapterResidentVisits}=await import('./v03/chapter-resident-visits.js');
      world.chapterResidents=createChapterResidentVisits({world,battle:boss,getPlayer:()=>actor,onDefeat:event=>{
        townServices?.defeat(event);world.v03?.defeat(event);
        goldLoot.drop(event.kind,event.position,{canLand:(_from,to)=>world.navigation.free(to,.09),heightAt:(x,z)=>world.terrain.heightAt(x,z)});
      }});
      world.scene.onDisposeObservable.addOnce(()=>world.chapterResidents.dispose());
      const {createRidingHorse}=await import('./v03/riding-horse.js');
      world.riding=createRidingHorse({world,audio,root:$('#app'),storage:v03Save.journey,player:()=>actor,diagnostics:frameDiagnostics,
        battle:()=>boss,canRam:()=>!!(world.v03?.playing&&!world.v03.story?.sceneActive&&boss.playerAlive&&!mapTransition?.busy),
        forwardYaw:()=>config?.forwardYaw??0,tell:toast,riderAlive:()=>!controller?.dead&&boss.playerHp>0,
        ridingAllowed:(onArrival=false)=>!!(ready&&!loadingAsset&&world.v03?.playing&&(onArrival||
          !mapTransition?.busy&&!world.v03.blocksGame&&!world.v03.story?.sceneActive&&!input.suspended&&!controller?.captured&&!controller?.groggy))});
      boss.combat.onPlayerDamaged=world.riding.playerDamaged;
      world.scene.onDisposeObservable.addOnce(()=>world.riding.dispose());
    }
    world.v03=setupV03({root:$('#app'),save:v03Save,world,input,actions,battle:boss,toast,
      projectFeet:point=>screenProjection?.transform?screenProjection.project(point):null,
      offerMount:()=>world.riding?.offer(),
      getPlayer:()=>actor,getController:()=>controller,openTownShop:(id,view)=>townServices?.openShop(id,view),
      getState:()=>({ready:ready&&!loadingAsset&&!mapTransition?.busy,failed:frameLoop?.failed===true||frameLoop?.loadingFailed===true||mapTransition?.failed===true,character,mapId:world.mapId,
        // Scenery still streaming in (models and higher-resolution textures).
        pending:(world.environment?.geometryPending??0)+(world.environment?.highTexturePending??0)}),
      // Run-trail vitals (boot.js, every 5 s): small numbers only.
      vitals:()=>{const health=contextHealth(world.scene?.getEngine?.());return {map:world.mapId??null,frames:frameLoop?.frames??0,gapMs:Math.round(frameLoop?.intervalMs??0),level:adaptivePerformance.level,lost:health?.lost??null,restored:health?.restored??null,meshes:world.scene?.meshes.length??0,textures:world.scene?.textures.length??0,audio:audio.context?.state??null,starves:world.audioLiveness?.inspect().starves??null};},
      resetStage:v03ResetStage,openSettings:()=>$('#motion-speed-toggle').click(),
      // resume: continuing a record that was saved on another map. The player arrives where the
      // record left them, not at the road's end, and the place stood on now is not written into that record.
      travel:(id,options)=>{travelResume=options?.resume===true;return mapTransition.travel(travelUrl(location.href,id));},
      startWorld:()=>{void getAuthoredMonsters().catch(error=>console.error('[몬스터 배치]',error));},
      // The reverse: the roaming monsters leave (back to the title on the same page). A runtime still loading is stopped once it arrives.
      stopWorld:()=>{world.firstPerson?.exit();if(world.authoredMonsters)world.authoredMonsters.deactivate?.();else void world.authoredMonstersTask?.then(runtime=>runtime.deactivate?.(),()=>{});},
      setScore:(key,fade)=>audio?.setScore?.(key,fade),
      prefetchScore:key=>audio?.prefetchScore?.(key),
      setSfxMuted:value=>audio?.setSfxMuted?.(value),
      prepareWorld:()=>{void getAuthoredMonsters({active:false}).then(runtime=>runtime.preload?.()).catch(error=>console.error('[몬스터 배치]',error));},
      // Adds story scenery through the map's placement runtime (streaming,
      // collision and outlines included). Already-present ids are skipped.
      placeProps:async props=>{
        const runtime=world.authoredPlacements;if(!runtime||runtime.disposed||runtime.mapId!==world.mapId||!runtime.applied)return false;
        const have=new Set(runtime.document.instances.map(instance=>instance.instanceId)),extra=[];
        for(const prop of props){
          if(have.has(prop.id))continue;
          const entry=runtime.catalog?.entries?.find(row=>row.assetId===prop.asset);if(!entry)continue;
          const half=(prop.yaw??0)/2;
          extra.push({instanceId:prop.id,assetId:prop.asset,assetVersion:entry.version??entry.contentHash,transform:{position:[prop.x,world.terrain.heightAt(prop.x,prop.z),prop.z],rotation:[0,Math.sin(half),0,Math.cos(half)],scale:prop.scale??1},attachment:{surface:'ground',normal:[0,1,0],offset:0,supportId:'terrain'},collision:prop.collision??'solid'});
        }
        if(!extra.length)return true;
        await runtime.apply({...runtime.document,revision:runtime.document.revision+1,instances:[...runtime.document.instances,...extra]});return true;
      },
      rest:()=>{if(!ready||!boss||boss.playerHp<=0)return false;boss.combat.hp=boss.playerMaxHp;boss.potions.reset?.();townServices?.rest();controller?.resetStamina?.();updateHealthBars();boss.onChange(boss);saveMapPosition(true);world.dayCycle?.restUntilMorning();return true;},
      setMapMarkers:list=>minimap.setMarkers(list),
      playerLevel:()=>townServices?.economy.progression.level??1,
      ...(townServices?{settleQuest:(quest,step)=>townServices.settleQuest(quest,step),hasSettledQuest:id=>townServices.economy.hasSettledQuest(id)}:{}),
      creditQuestExperience:(ids,quiet,chapter)=>townServices?.creditQuestExperience(ids,quiet,chapter)??0,
      creditGold:(source,amount)=>goldLoot.creditCumulative(source,amount),
      addPotions:count=>{if(townServices)return townServices.addPotions(count);if(!boss)return 0;const before=boss.potions.remaining;boss.potions.remaining=Math.min(POTION.uses,before+count);updateButtons();return boss.potions.remaining-before;},
      // Errands (v03/errands.js): bag items, village service events.
      grantItem:(id,count)=>{if(!townServices?.economy.grant(id,count))return false;townServices.apply();return true;},
      spendItem:(id,count)=>!!townServices?.economy.spend(id,count),itemCount:id=>townServices?.economy.state.bag[id]??0,
      // Jeffrey's defense errand: a lost stage puts the gear wear back as it was at the talk.
      gearCondition:()=>townServices?.economy.wearSnapshot()??null,restoreGearCondition:snapshot=>{if(townServices?.economy.restoreWear(snapshot))townServices.apply();},
      onTownEvent:fn=>{if(townServices)townServices.economy.onEvent=fn;},
      grantArmor:id=>{if(townServices)return townServices.grantArmor(id);if(!V03_ARMOR_DEFENSE[id])return false;try{if(journeyStorage?.getItem(V03_ARMOR_KEY)===id)return false;journeyStorage?.setItem(V03_ARMOR_KEY,id);}catch{return false;}if(boss)boss.combat.defense=playerDefense();audio.play('equip');return true;},
      playSound:(cue,options)=>{try{audio.play(cue,options);}catch{/* sound is optional */}},
      // Starts sound without a tap where the browser already allows it (a reloaded new game).
      // A new game in place (0.3): the slot storage was wiped and rebound; drop what memory still holds from the old record.
      // Another record was bound to this page (save.bindTo): read again what is kept in memory from the record.
      reloadProgress:()=>{goldLoot.reload();world.riding?.reload();townServices?.reset(true);resumeStore.last='';resumePose=readMapResume(journeyStorage,character,world,{radius:WARRIOR_DIMENSIONS.moveRadius,portalArrival:false});if(boss){boss.combat.defense=playerDefense();boss.potions.reset?.();boss.combat.hp=boss.playerMaxHp;}controller?.resetStamina?.();world.authoredMonsters?.reloadSaved?.();updateHealthBars?.();return true;},
      restartProgress:()=>{goldLoot.reload();world.riding?.reload();townServices?.reset(false);resumePose=null;resumeStore.last='';if(boss){boss.combat.defense=playerDefense();boss.potions.reset?.();boss.combat.hp=boss.playerMaxHp;}controller?.resetStamina?.();updateHealthBars?.();return true;},
      unlockAudio:()=>{try{return audio.unlock();}catch{return null;}},
      exit:()=>world.showGameExit?.(),wake:()=>wakeRendering()});
    world.scene.onDisposeObservable.addOnce(()=>{interruptGreatAttack();world.v03?.dispose();});
    if(!versionRoute.worldRevision){
      const root=$('#app'),scene=world.scene,launch=document.createElement('button');
      launch.type='button';launch.dataset.chapter='bag';launch.id='character-menu-toggle';
      launch.setAttribute('aria-label',tr('가방'));launch.setAttribute('aria-keyshortcuts','I');launch.setAttribute('aria-haspopup','dialog');
      root.querySelector('.top-actions').append(launch);commercialUi?.refresh();world.hudRaster?.refresh();
      const hudTooltips=setupHudTooltips(root);
      const canOpen=()=>!scene.isDisposed&&ready&&world.v03?.playing&&!world.v03.blocksGame&&!world.v03.story?.sceneActive&&!world.v03.story?.scenePending&&!world.v03.story?.dialogueOpen&&
        !loadingAsset&&!mapTransition?.busy&&!frameLoop.failed&&!world.gameExited&&!contextRecovery?.blocked&&!world.toolLease?.active&&!controller?.dead&&!controller?.captured&&!document.hidden&&!document.querySelector('dialog[open]');
      const open=async page=>{
        if(characterMenuOpening||!canOpen())return;
        // The portrait draws the real head; leave first person before it opens.
        world.firstPerson?.exit();
        const startingMap=world.mapId,startingActor=actor,startingGeneration=world.toolGeneration;
        characterMenuOpening=true;root.dataset.characterMenuOpening='';reconcilePlayback();
        try{
          const [{createCharacterMenu}]=await Promise.all([import('./v03/character-menu.js'),import('./v03/character-menu.css')]);
          if(!canOpen()||!launch.isConnected||startingMap!==world.mapId||actor!==startingActor||startingGeneration!==world.toolGeneration)return;
          characterMenu??=createCharacterMenu({root,mount:()=>world.riding?.wardrobe,onPause:()=>{input.reset();cancelAttackInput();reconcilePlayback();},
            subject:()=>actor&&({camera:world.camera,scene,actor,meshes:container?.meshes,height:playerDimensions(actor).height,canvasRect:canvas.getBoundingClientRect()}),
            read:()=>{
              const stats=equipmentStats(equipmentChoices),defense=playerDefense();
              return {equipment:townServices?.equippedFinishes??{...equipmentChoices},tradeBag:townServices?.bag(),attackBonus:townServices?.attackPower??stats.attackBonus,defense,armorDefense:townServices?.armorDefense??defense-stats.defense,
                progression:townServices?.economy.progression,quickSlots:townServices?.economy.state.quickSlots,
                canUseSlot:slot=>allowed('potion')&&!controller.captured&&!controller.groggy&&townServices?.canDrink(slot),
                hp:boss.playerHp,maxHp:boss.playerMaxHp,stamina:controller.stamina,maxStamina:controller.maxStamina,
                gold:goldLoot.balance,potions:townServices?.remaining??boss.potions.remaining,canUsePotion:allowed('potion')&&!controller.captured&&!controller.groggy&&(townServices?townServices.canDrink():boss.canUsePotion),
                touch:root.dataset.hudInput==='touch',allows:allowed};
            },
            equip:(slot,id)=>{const select=$('#'+slot+'-select');select.value=id;select.dispatchEvent(new Event('change'));},
            equipItem:id=>townServices?.equip(id),registerItem:(id,slot)=>townServices?.register(id,slot),unregisterItem:slot=>townServices?.unregister(slot),usePotion:actions.potion,
            learnSkill:id=>{
              if(!townServices?.economy.learnSkill(id))return false;
              townServices.apply();return true;
            },
            refundSkills:()=>{
              if(!townServices?.economy.refundSkills())return false;
              townServices.apply();return true;
            },
          });
          characterMenu.show(page);
        }catch(error){console.error('[Character menu]',error);toast('캐릭터 메뉴를 열지 못했습니다.');}
        finally{characterMenuOpening=false;delete root.dataset.characterMenuOpening;if(!scene.isDisposed)reconcilePlayback();}
      };
      launch.addEventListener('click',()=>open('Inventory'));
      const hotkeys={KeyI:'Inventory',KeyC:'Status',KeyU:'Skills'};
      const shortcut=event=>{
        if(event.repeat||event.defaultPrevented||event.altKey||event.ctrlKey||event.metaKey||event.target?.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName))return;
        if(hotkeys[event.code]&&canOpen()){event.preventDefault();void open(hotkeys[event.code]);}
      };
      window.addEventListener('keydown',shortcut);
      const dispose=()=>{window.removeEventListener('keydown',shortcut);hudTooltips.dispose();launch.remove();characterMenu?.dispose();characterMenu=null;};
      scene.onDisposeObservable.addOnce(dispose);
      if(import.meta.hot)import.meta.hot.dispose(dispose);
    }
    // 0.4 world: time of day and weather (shares the 0.3 story and saves).
    if(versionRoute.worldRevision==='0.4'&&!world.dayCycle){
      const [{createDayCycle}]=await Promise.all([import('./v04/day-cycle.js'),import('./v04/v04.css')]);
      world.dayCycle=createDayCycle({doc:document,canvas,getWorld:()=>world,storage:journeyStorage,chipHost:()=>$('#dot-minimap')});
      world.dayCycle.mapChanged();world.scene.onDisposeObservable.addOnce(()=>{world.dayCycle?.dispose();world.dayCycle=null;});
    }
    hudLayout?.rebind?.();
    // 0.3 layered (recoverable) health on monster bars.
    bossHealthBars.decorate=(element,foe)=>world.v03?.decorateFoeBar?.(element,foe);
    // Development-only handle for QA from the console; never present in a build.
    // The same handle on a build when the address carries ?qa (inspection only).
    if(import.meta.env.DEV||new URLSearchParams(location.search).has('qa')){window.moonforestV03=world.v03;window.moonforestQA={get dayCycle(){return world.dayCycle;},get meadow(){return world.meadow;},get world(){return world;},get engine(){return engine;},get battle(){return boss;},get player(){return actor;},get preparedShaders(){return inspectPreparedEffects(engine);}};}
    if(import.meta.hot)import.meta.hot.dispose(()=>world.v03?.dispose());
  }
  loadCharacter();
} catch (error) {
  loadingView.fail('3D 화면을 시작하지 못했습니다','진단을 복사해 전달한 뒤 페이지를 새로고침해 주세요.',{error,phase:'engine-initialization',retry:false});console.error(error);
}
