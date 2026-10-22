import './styles.css';
import { Engine, SceneLoader, TransformNode, Vector3, VertexBuffer } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { createWorld } from './world.js';
import { PlaygroundInput } from './input.js';
import { CharacterController, STATE_LABELS, normalizeAttackSpeed } from './controller.js';
import { CharacterAnimator } from './animation.js';
import { NativeWarriorController } from './native-warrior.js';
import { WarriorV2Controller, V2_LABELS } from './warrior-v2.js';
import { followTarget } from './camera-follow.js';
import { setupFullscreen } from './fullscreen.js';
import { createTrainingTargets } from './targets.js';
import { createProjectiles } from './projectiles.js';
import { EQUIPMENT_STYLES, WarriorEquipment, readEquipmentChoices, saveEquipmentChoices } from './equipment.js';
import { initializeResourceCache, migrateCachedGlb } from './resource-cache.js';
import { BossEncounter } from './boss-encounter.js';
import { BOSS_ACTIVE_MOTIONS } from './boss-spec.js';
import { PlayerStrikeSampler } from './player-strikes.js';
import { createDamageNumbers } from './damage-numbers.js';
import { updateBossHealthPosition } from './boss-health-bar.js';
import { applyHitFlash, PLAYER_STAGGER } from './hit-feedback.js';
import { dodgeDirection, dodgeDistanceAt } from './dodge.js';
import { setupMotionSpeedControls } from './motion-speed-controls.js';

const $ = selector => document.querySelector(selector);
const canvas = $('#viewport');
const loading = $('#loading');
const buttons = ['#run-button', '#attack-button', '#hit-button', '#death-button', '#guard-button', '#dodge-button'].map($);
const validCharacters = ['archer','warrior','warrior-v2'];
let character = new URLSearchParams(location.search).get('character');
if (!validCharacters.includes(character)) character = 'archer';
const isWarrior = () => character !== 'archer';
const isV2 = () => character === 'warrior-v2';
let engine, world, actor, controller, animator, container, config, input, reviewFocus;
let ready = false, loadingAsset = false, maxInfluences = 0, statusTime = 0, elapsed = 0;
let boss, combatResult, swordNode, shieldNode, damageNumbers;
let rollDirection={x:0,z:1};
const strikeSampler=new PlayerStrikeSampler();
let equipment, equipmentStorage;
try { equipmentStorage = localStorage; } catch { /* Private browsing can disable storage. */ }
let equipmentChoices = readEquipmentChoices(equipmentStorage);
for (const slot of ['sword', 'shield']) {
  const select = $(`#${slot}-select`);
  for (const style of EQUIPMENT_STYLES) select.add(new Option(style.label, style.id));
  select.value = equipmentChoices[slot];
  select.addEventListener('change', () => {
    if (!ready || !equipment) return;
    equipmentChoices[slot] = equipment.select(slot, select.value);
    saveEquipmentChoices(equipmentStorage, equipmentChoices);
    $('#equipment-status').textContent = `${slot === 'sword' ? '검' : '방패'}: ${EQUIPMENT_STYLES.find(style => style.id === select.value).label} 적용`;
  });
}
let training, projectiles, shotTarget = null, shotActionId = null, hiddenArrowForAction = null, arrowNode, arrowMesh;
const attackSources = new Set();
let toastTimer;
let qualityMode = 'high';
try { qualityMode = localStorage.getItem('archer-render-quality') || 'high'; } catch { /* Storage may be unavailable in private browsing. */ }
if (!['high', 'balanced', 'battery'].includes(qualityMode)) qualityMode = 'high';
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

function applyRenderQuality() {
  if (!engine) return;
  const cap = { high: 3, balanced: 2, battery: 1 }[qualityMode];
  const ratio = Math.min(window.devicePixelRatio || 1, cap);
  // Babylon divides CSS dimensions by this value. HiDPI requires its reciprocal.
  engine.setHardwareScalingLevel(1 / ratio);
  engine.resize();
  $('#quality-select').value = qualityMode;
}

function toast(message) {
  $('#toast').textContent = message; $('#toast').hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 4000);
}
function updateButtons() {
  const dead = controller?.dead || false;
  $('#run-button').setAttribute('aria-pressed', String(controller?.runToggled || false));
  $('#death-label').textContent = dead ? '부활' : '사망';
  $('#death-key').textContent = dead ? 'R' : 'K';
  $('#death-button').classList.toggle('dead', dead);
  if(isV2())$('#guard-button').removeAttribute('aria-pressed');
  else $('#guard-button').setAttribute('aria-pressed', String(controller?.guardToggled || false));
  for (const button of buttons) button.disabled = !ready || controller?.captured || (dead && button.id !== 'death-button') || (boss?.active && !boss.playerAlive);
  $('#summon-boss').disabled = !ready || !isV2() || boss?.loading;
  $('#boss-controls').hidden = !isV2();
  $('#potion-button').hidden=!isV2();
  $('#potion-button').disabled=!ready||!boss?.canUsePotion||controller?.captured;
  $('#potion-count').textContent=String(boss?.potions.remaining??3);
  $('#potion-status').textContent=boss?.potions.active?`회복 ${4-boss.potions.pulsesLeft}/4`:'E';
  $('#potion-button').classList.toggle('healing',!!boss?.potions.active);
  $('#potion-button').setAttribute('aria-label',`회복 물약, 남은 횟수 ${boss?.potions.remaining??3}회${boss?.potions.active?', 회복 중':''}`);
}
const actions = {
  move() { if(ready&&isV2())controller.requestMovement(); },
  guard() { if (ready && (!boss?.active || boss.playerAlive)) { if(isV2())startDefense('shieldPush');else controller.toggleGuard?.(); updateButtons(); } },
  dodge() { if(ready&&isV2()&&(!boss?.active||boss.playerAlive))startDefense('dodge'); },
  potion() { if(ready&&isV2()&&!controller.captured){boss.usePotion();updateButtons();} },
  attack() { if (ready && (!boss?.active || boss.playerAlive)) controller.attack(); },
  setAttackHeld(held) { setAttackHeld('keyboard', held); },
  cancelAttackInput() { cancelAttackInput(); },
  hit() { if (ready && !isWarrior()) { attackSources.clear(); controller.hit(); } },
  death() { if (!ready || isWarrior() || controller.dead) return; attackSources.clear(); controller.die(); input.reset(); updateButtons(); },
  revive() { if (!ready || !controller.dead) return; controller.revive(); input.reset(); updateButtons(); toast('다시 움직일 수 있습니다.'); },
  canMove() { return ready && !controller.dead && !controller.captured && (!boss?.active || boss.playerAlive); },
};

function startDefense(kind){
  if(!controller[kind]())return;
  attackSources.clear();strikeSampler.reset();boss?.playerReaction.cancelRecoil();
  if(kind==='dodge'){
    rollDirection=dodgeDirection(input.value(),world.camera.alpha,actor.rotation.y);
    actor.rotation.y=Math.atan2(rollDirection.x,rollDirection.z);
  }
}

function setAttackHeld(source, held) {
  if (held) {
    if (!ready || controller.dead || (boss?.active && !boss.playerAlive) || controller.setAttackHeld(true) === false) return;
    attackSources.add(source);
  } else if (attackSources.delete(source)) controller?.setAttackHeld(attackSources.size > 0);
}

function cancelAttackInput(source) {
  if(source){if(!attackSources.delete(source)||attackSources.size)return;}
  else attackSources.clear();
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
  projectiles.fire(origin, destination, shotTarget);
}

function resetCamera() {
  if (!world) return;
  world.camera.alpha = Math.PI * .38; world.camera.beta = isWarrior() ? 1.35 : 1.18;
  world.camera.radius = innerWidth < 600 ? 6.5 : 4.8;
  input.panOffset = { x: 0, y: 0, z: 0 };
}

async function loadCharacter() {
  if (loadingAsset) return;
  loadingAsset = true; ready = false; updateButtons();
  boss?.hide();combatResult=null;strikeSampler.reset();
  $('#equipment-panel').hidden = !isWarrior();
  $('#sword-select').disabled = true; $('#shield-select').disabled = true;
  $('#equipment-status').textContent = '';
  $('#character-select').disabled = true;
  input?.reset(); cancelAttackInput();
  $('#attack-button').classList.remove('is-charging');
  training.setSelected(null); projectiles.clear();
  loading.hidden = false; loading.classList.remove('error'); $('#retry-load').hidden = true;
  $('#loading-title').textContent = '숲으로 들어가는 중'; $('#loading-text').textContent = '캐릭터와 동작을 불러옵니다.'; $('#loading-progress').style.width = '5%';
  try {
    await initializeResourceCache();
    const manifestUrl = new URL(`${import.meta.env.BASE_URL}assets/${isV2() ? 'warrior-v2' : isWarrior() ? 'warrior' : 'character'}.json`, location.href);
    const response = await fetch(manifestUrl, { cache: 'no-cache' });
    if (!response.ok) throw new Error('캐릭터 설정 파일을 불러오지 못했습니다.');
    config = await response.json();
    await migrateCachedGlb(config, manifestUrl);
    const modelUrl = new URL(config.model, manifestUrl);
    const rootUrl = new URL('.', modelUrl).href;
    if (animator) animator.dispose();
    equipment?.dispose(); equipment = null;
    if (container) { for (const mesh of container.meshes) world.shadows.removeShadowCaster(mesh, false); container.dispose(); }
    if (actor) actor.dispose();
    container = await SceneLoader.LoadAssetContainerAsync(rootUrl, modelUrl.pathname.split('/').pop() + modelUrl.search, world.scene, progress => {
      if (progress.lengthComputable && progress.total > 0) $('#loading-progress').style.width = `${Math.min(92, progress.loaded / progress.total * 90 + 5)}%`;
      else if (progress.loaded) $('#loading-text').textContent = `${(progress.loaded / 1024 / 1024).toFixed(1)} MB 불러오는 중`;
    }, modelUrl.pathname.endsWith('.gltf') ? '.gltf' : '.glb');
    container.addAllToScene();
    if (isWarrior()) equipment = new WarriorEquipment(container, equipmentChoices);
    for (const group of container.animationGroups) group.stop();
    actor = new TransformNode('player-world-transform', world.scene);
    // World movement is separate from exported root motion, including the authored death fall.
    for (const node of new Set([...container.meshes, ...container.transformNodes])) if (!node.parent) node.parent = actor;
    actor.scaling.setAll(config.scale || 1);
    actor.rotation.y = config.forwardYaw || 0;
    maxInfluences = 0;
    for (const mesh of container.meshes) {
      if (!mesh.getTotalVertices()) continue;
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
    if (config.expectedMaxBoneInfluences && maxInfluences < config.expectedMaxBoneInfluences) throw new Error('모델의 스키닝 가중치가 설정과 일치하지 않습니다. 내보낸 파일을 확인해야 합니다.');
    animator = new CharacterAnimator(container.animationGroups, config.animations);
    controller = new (isV2() ? WarriorV2Controller : isWarrior() ? NativeWarriorController : CharacterController)({ durations: animator.durations, speeds: config.speeds });
    applyAttackSpeed(readAttackSpeed());
    if(isV2())motionSpeedControls.apply(controller);
    motionSpeedControls.setVisible(isV2());
    arrowNode = container.transformNodes.find(node => node.name === 'arrow');
    arrowMesh = container.meshes.find(mesh => mesh.name === 'Azure_Arrow');
    reviewFocus = isWarrior() ? container.transformNodes.find(node => node.name === 'mixamorig:Hips') : null;
    shieldNode = container.transformNodes.find(node=>node.name==='Bunnyguard_Shield') || container.meshes.find(node=>node.name==='Bunnyguard_Shield');
    swordNode = container.transformNodes.find(node => node.name === 'Golden_Oathblade') || container.meshes.find(node => node.name === 'Golden_Oathblade');
    boss.playerNodes=Object.fromEntries(container.transformNodes.map(node=>[node.name,node]));
    attackSources.clear(); shotTarget = null; shotActionId = null; hiddenArrowForAction = null;
    projectiles.clear();
    animator.transition('idle', { clipTime: 0, loop: true });
    ready = true; loading.hidden = true; $('#loading-progress').style.width = '100%';
    $('#sword-select').disabled = !equipment; $('#shield-select').disabled = !equipment;
    $('#build-tag').textContent = config.version || 'ARCHER / 01';
    $('#character-select').value = character;
    $('#character-name').textContent = isV2() ? 'Violet Vanguard v2' : isWarrior() ? 'Violet Vanguard' : 'Azure Elf';
    $('#character-subtitle').textContent = isWarrior() ? '보랏빛 선봉의 전사' : '푸른 숲의 궁수';
    $('#character-eyebrow').textContent = isWarrior() ? 'THE VIOLET VANGUARD' : 'THE MOONLIT RANGER';
    $('.character-caption').textContent = isV2() ? '한손 베기 1타 ↔ 베고 찌르기 2타 · 길게: 심판 3타' : isWarrior() ? '이동하면 달리기 · J 또는 공격 버튼으로 찌르기·베기' : '가까운 허수아비를 자동으로 조준합니다.';
    $('.action-controls').hidden = false;
    $('.action-controls').dataset.character = character;
    $('#run-button').hidden = isWarrior();
    $('.secondary-actions').hidden = isWarrior();
    $('#hit-button').hidden = isWarrior(); $('#death-button').hidden = isWarrior();
    $('.keyboard-hint strong').textContent = isWarrior() ? '달리기 이동' : '이동';
    $('.keyboard-hint small').textContent = isV2() ? 'J 공격 · 길게 심판 · F 밀치기 · Space 회피' : isWarrior() ? 'J 공격 · 공격 후 이동 재개' : 'Shift 달리기 · J 공격';
    $('#attack-label').textContent = isWarrior() ? '검 공격' : '활 공격';
    $('#attack-hint').textContent = isV2() ? '짧게 일반 · 길게 심판 · J' : isWarrior() ? '길게 눌러 연속 검술 · J' : '길게 눌러 연사 · J';
    $('#attack-button').title = isV2() ? '짧게 누르면 일반 공격 · 0.45초 길게 누르면 심판의 검' : '길게 누르면 연속 공격';
    $('#attack-icon').setAttribute('d', isWarrior() ? 'M9 35 31 13 35 5 27 9 5 31m3-6 11 11m-10-5-5 5' : 'M12 5c21 7 21 27 0 34M12 5l11 17-11 17M5 22h34m-6-5 6 5-6 5');
    $('#guard-button').hidden = !isV2();
    $('#dodge-button').hidden = !isV2();
    $('#guard-button span').textContent = '방패 밀치기';
    canvas.setAttribute('aria-label', isWarrior() ? '전사 3D 화면. WASD 달리기 이동, J 공격. 왼쪽 또는 오른쪽 마우스 드래그 회전, 휠 확대 축소.' : '궁수 3D 검수 화면. WASD 이동, J 공격, H 피격, K 쓰러짐, R 부활.');
    resetCamera(); updateButtons();
    canvas.focus({ preventScroll: true });
  } catch (error) {
    console.error('[Archer asset load]', error);
    loading.classList.add('error');
    $('#loading-title').textContent = '캐릭터를 불러오지 못했습니다';
    $('#loading-text').textContent = error.message?.startsWith('필수 동작') || error.message?.startsWith('모델의 스키닝') ? error.message : '연결을 확인한 후 다시 시도해 주세요. 캐릭터 파일이 준비되지 않았을 수도 있습니다.';
    $('#retry-load').hidden = false; $('#loading-progress').style.width = '0%';
    equipment?.dispose(); equipment = null;
    if (container) container.dispose(); container = null;
    updateButtons();
  } finally { loadingAsset = false; $('#character-select').disabled = false; }
}

function constrainPlayerPosition(){
  const radius=Math.hypot(actor.position.x,actor.position.z);
  if(radius>11){actor.position.x*=11/radius;actor.position.z*=11/radius;}
  for(const dummy of training.targets){
    const dx=actor.position.x-dummy.position.x,dz=actor.position.z-dummy.position.z,distance=Math.hypot(dx,dz);
    if(distance<.62){actor.position.x=dummy.position.x+(distance?dx/distance:1)*.62;actor.position.z=dummy.position.z+(distance?dz/distance:0)*.62;}
  }
}

function render() {
  const dt = document.hidden || motionSpeedControls.isOpen() ? 0 : Math.min(engine.getDeltaTime() / 1000, .1);
  elapsed += dt;
  world.tick(elapsed);
  training.update(dt);
  projectiles.update(dt);
  if (ready) {
    if(isV2()){
      const recoiled=boss.playerReaction.update(dt,actor);
      applyHitFlash(container.meshes,boss.playerReaction.flashRemaining,boss.playerReaction.flashDuration);
      if(recoiled)constrainPlayerPosition();
    }
    const movement = boss?.active&&!boss.playerAlive?{x:0,y:0}:input.value();
    if(boss?.active&&!boss.playerAlive)cancelAttackInput();
    const result = controller.update(dt, movement);
    if(isV2()&&result.rollFrom!=null){
      const distance=dodgeDistanceAt(result.rollTo,config.dodge)-dodgeDistanceAt(result.rollFrom,config.dodge);
      actor.position.x+=rollDirection.x*distance;actor.position.z+=rollDirection.z*distance;
      constrainPlayerPosition();
    }
    if(isV2()){
      $('#attack-button').classList.toggle('is-charging',result.chargeProgress>0);
      $('#attack-button').style.setProperty('--charge-progress',result.chargeProgress||0);
      $('#attack-label').textContent=result.chargeProgress>0?'심판 준비':'검 공격';
    }
    combatResult=result;
    animator.transition(result.state, result); animator.update(result.captured||result.staggered||result.hitStopped?0:dt);
    const attacking = !result.captured&&!result.staggered&&['attack', 'moveAttack','slash','judgment','shieldPush'].includes(result.state);
    if (attacking && result.actionId !== shotActionId) {
      shotActionId = result.actionId;
      shotTarget = isWarrior() ? null : training.selectNearest(actor.position);
      hiddenArrowForAction = null;
      if(isV2()&&boss?.active&&boss.brain.hp>0&&Vector3.Distance(actor.position,boss.actor.position)<4){const d=boss.actor.position.subtract(actor.position);actor.rotation.y=Math.atan2(d.x,d.z);}
    }
    const selectedTarget = controller.dead ? null : attacking ? shotTarget : isWarrior() ? null : training.selectNearest(actor.position);
    training.setSelected(selectedTarget);
    if (result.moving) {
      const alpha = world.camera.alpha;
      const forward = new Vector3(-Math.cos(alpha), 0, -Math.sin(alpha));
      const right = new Vector3(-forward.z, 0, forward.x);
      const direction = forward.scale(movement.y).add(right.scale(movement.x)).normalize();
      actor.position.addInPlace(direction.scale(result.speed * (result.movementDt??dt)));
      constrainPlayerPosition();
      if (!attacking || !shotTarget) faceHeading(Math.atan2(direction.x, direction.z) + (config.forwardYaw || 0), dt);
    }
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
    const center = reviewFocus ? reviewFocus.getAbsolutePosition().add(new Vector3(0, .12, 0)) : actor.position.add(new Vector3(0, 1.02, 0));
    boss?.update(dt,actor);
    const focus=boss?.active?Vector3.Lerp(center,boss.actor.position.add(new Vector3(0,1.1,0)),.35):center;
    const target = focus.add(new Vector3(input.panOffset.x, input.panOffset.y, input.panOffset.z));
    followTarget(world.camera, target, dt);
    $('#state-label').textContent = result.captured?boss.grab.label:result.staggered?'피격 · 경직':result.chargeProgress>0?'심판 준비':isV2() ? V2_LABELS[result.state] : isWarrior() ? { idle:'대기', run:'달리기', attack:'찌르기·베기' }[result.state] : STATE_LABELS[result.state];
    $('#speed-label').textContent = `${result.speed.toFixed(2)} m/s`;
    $('#target-label').textContent = isV2() ? '검·방패 장착 · 검술 3종 / 방패 밀치기' : isWarrior() ? '검·방패 장착 · 달리기 / 찌르기·베기' : selectedTarget ? `${selectedTarget.name} · 명중 ${selectedTarget.hits}` : controller.dead ? '부활하면 전투를 재개합니다' : '허수아비 가까이 이동하세요';
    updateButtons();
  }
  statusTime += dt;
  if (statusTime > .5) { $('#render-status').textContent = `${Math.round(engine.getFps())} FPS · ${ready ? 'LIVE' : 'LOADING'}`; statusTime = 0; }
  world.scene.render();
  damageNumbers?.update(dt);
  updateBossHealthPosition(world.scene,boss,$('#boss-hud'));
}

try {
  if (!Engine.isSupported()) throw new Error('이 브라우저에서 WebGL을 사용할 수 없습니다.');
  engine = new Engine(canvas, true, { preserveDrawingBuffer: false, stencil: true, powerPreference: 'high-performance' });
  applyRenderQuality();
  world = createWorld(engine);
  damageNumbers=createDamageNumbers(world.scene,$('#damage-numbers'));
  boss=new BossEncounter(world,encounter=>{
    $('#summon-boss').textContent=encounter.loading?'보스 불러오는 중…':encounter.active?'보스 다시 소환':'보스 소환';
    $('#player-combat-status').hidden=!encounter.active;
    if(!encounter.active)$('#boss-hud').hidden=true;
    if(!encounter.active)return;
    $('#boss-hp').max=encounter.brain.maxHp;$('#boss-hp').value=encounter.brain.hp;
    $('#boss-hp-text').textContent=`${encounter.brain.hp} / ${encounter.brain.maxHp}`;
    $('#boss-state').textContent=encounter.brain.label;
    $('#combat-feedback').textContent=encounter.lastHit||'방패 밀치기 시전 중 블록';
    $('#player-health').textContent=`전사 HP ${encounter.playerHp} / ${encounter.playerMaxHp}`;
    $('#boss-hud').dataset.state=encounter.brain.stagger>0?'stagger':encounter.brain.mode;
  },(...args)=>damageNumbers.show(...args),(duration,options={})=>{
    if('captured' in options){
      if(options.captured)controller.capture();else controller.releaseCapture();
      attackSources.clear();strikeSampler.reset();input.reset();return;
    }
    if(controller.hit(duration,options)!==false){attackSources.clear();strikeSampler.reset();}
    applyHitFlash(container.meshes,boss.playerReaction.flashRemaining,boss.playerReaction.flashDuration);
  });
  world.scene.onAfterAnimationsObservable.add(()=>{
    if(!ready||!isWarrior()||!combatResult)return;
    const sample=strikeSampler.sample(combatResult,swordNode,shieldNode,isV2());
    const bossStop=isV2()?boss.poseAndContacts(actor,combatResult,sample,shieldNode):0;
    const targetStop=!controller.captured&&!controller.staggerRemaining?training.melee(sample):0;
    if(isV2())controller.pauseOnImpact(Math.max(bossStop||0,targetStop||0));
  });
  training = createTrainingTargets(world.scene, world.shadows,(...args)=>damageNumbers.show(...args));
  projectiles = createProjectiles(world.scene, target => training.hit(target));
  input = new PlaygroundInput(canvas, world.camera, actions);
  setupFullscreen($('#fullscreen-button'), toast);
  engine.runRenderLoop(render);
  window.addEventListener('resize', applyRenderQuality);
  $('#quality-select').addEventListener('change', event => {
    qualityMode = event.target.value;
    try { localStorage.setItem('archer-render-quality', qualityMode); } catch { /* Keep the current session choice. */ }
    applyRenderQuality();
  });
  $('#run-button').addEventListener('click', () => { controller?.toggleRun?.(); updateButtons(); });
  for(const [selector,action] of [['#guard-button',actions.guard],['#dodge-button',actions.dodge],['#potion-button',actions.potion]]){
    const button=$(selector);let lastPress=-Infinity;
    button.addEventListener('pointerdown',event=>{
      if(event.button!==0||button.disabled)return;
      event.preventDefault();lastPress=performance.now();action();
    });
    button.addEventListener('click',event=>{if(event.detail===0&&performance.now()-lastPress>350)action();});
  }
  $('#summon-boss').addEventListener('click',async()=>{
    if(!ready||!isV2()||boss.loading)return;
    try{input.reset();attackSources.clear();controller.cancelAttack();controller.staggerRemaining=0;await boss.summon(actor);world.camera.radius=Math.max(world.camera.radius,innerWidth<600?11:8);canvas.focus({preventScroll:true});}
    catch(error){console.error('[Boss load]',error);toast('보스를 불러오지 못했습니다. 연결을 확인한 뒤 다시 소환해 주세요.');}
    updateButtons();
  });
  for(const motion of BOSS_ACTIVE_MOTIONS){const li=document.createElement('li');li.textContent=`${motion.label} · ${motion.name}`;$('#boss-motion-list').append(li);}
  $('#character-select').value = character;
  $('#character-select').addEventListener('change', event => {
    if (loadingAsset) return;
    character = validCharacters.includes(event.target.value) ? event.target.value : 'archer';
    const url = new URL(location.href); url.searchParams.set('character', character); history.replaceState(null, '', url);
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
    attackButton.setPointerCapture(event.pointerId); setAttackHeld(`button:${event.pointerId}`, true);
  });
  attackButton.addEventListener('pointerup', event => setAttackHeld(`button:${event.pointerId}`, false));
  for (const name of ['pointercancel', 'lostpointercapture']) attackButton.addEventListener(name, event => cancelAttackInput(`button:${event.pointerId}`));
  attackButton.addEventListener('click', event => { if (event.detail === 0 && performance.now() - lastPointerAttack > 350) actions.attack(); });
  const releaseAttack = () => cancelAttackInput();
  window.addEventListener('blur', releaseAttack);
  document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAttack(); });
  $('#hit-button').addEventListener('click', actions.hit);
  $('#death-button').addEventListener('click', () => controller?.dead ? actions.revive() : actions.death());
  $('#retry-load').addEventListener('click', loadCharacter);
  for (const mode of ['orbit', 'pan']) $(`#${mode}-mode`).addEventListener('click', () => {
    input.cameraMode = mode;
    for (const candidate of ['orbit', 'pan']) { $(`#${candidate}-mode`).classList.toggle('selected', mode === candidate); $(`#${candidate}-mode`).setAttribute('aria-pressed', String(mode === candidate)); }
  });
  $('#zoom-in').addEventListener('click', () => input.zoom(.85));
  $('#zoom-out').addEventListener('click', () => input.zoom(1.18));
  $('#reset-camera').addEventListener('click', resetCamera);
  $('#help-toggle').addEventListener('click', () => { releaseAttack(); input.reset(); $('#help-dialog').showModal(); });
  $('#close-help').addEventListener('click', () => $('#help-dialog').close());
  $('#help-dialog').addEventListener('click', e => { if (e.target === $('#help-dialog')) { const r = e.target.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) e.target.close(); } });
  // Read-only diagnostics make integration QA reproducible without exposing mutable scene objects.
  window.archerPreview = Object.freeze({ inspect: () => ({ ready, character, equipment: equipment?.inspect() || null, guardToggled: controller?.guardToggled, state: controller?.state, dead: controller?.dead, runToggled: controller?.runToggled, position: actor ? { x: actor.position.x, y: actor.position.y, z: actor.position.z } : null, maxBoneInfluences: maxInfluences, animations: config?.animations, joystickActive: input.joystickPointer !== null, cameraPointerCount: input.cameraPointers.size, camera: { alpha: world.camera.alpha, beta: world.camera.beta, radius: world.camera.radius }, panOffset: { ...input.panOffset } }) });
  loadCharacter();
} catch (error) {
  loading.classList.add('error'); $('#loading-title').textContent = '3D 화면을 시작하지 못했습니다'; $('#loading-text').textContent = error.message; console.error(error);
}
