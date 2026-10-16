import './styles.css';
import { Engine, SceneLoader, TransformNode, Vector3, VertexBuffer } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { createWorld } from './world.js';
import { PlaygroundInput } from './input.js';
import { CharacterController, STATE_LABELS, normalizeAttackSpeed } from './controller.js';
import { CharacterAnimator } from './animation.js';
import { setupFullscreen } from './fullscreen.js';
import { createTrainingTargets } from './targets.js';
import { createProjectiles } from './projectiles.js';

const $ = selector => document.querySelector(selector);
const canvas = $('#viewport');
const loading = $('#loading');
const buttons = ['#run-button', '#attack-button', '#hit-button', '#death-button'].map($);
let engine, world, actor, controller, animator, container, config, input;
let ready = false, loadingAsset = false, maxInfluences = 0, statusTime = 0, elapsed = 0;
let training, projectiles, shotTarget = null, shotActionId = null, hiddenArrowForAction = null, arrowNode, arrowMesh;
const attackSources = new Set();
let toastTimer;
let qualityMode = 'high';
try { qualityMode = localStorage.getItem('archer-render-quality') || 'high'; } catch { /* Storage may be unavailable in private browsing. */ }
if (!['high', 'balanced', 'battery'].includes(qualityMode)) qualityMode = 'high';
let attackSpeed = 1;
try { attackSpeed = normalizeAttackSpeed(Number(localStorage.getItem('archer-attack-speed') ?? 1)); } catch { /* Use the default without storage. */ }
function applyAttackSpeed(value) {
  attackSpeed = normalizeAttackSpeed(value);
  controller?.setAttackSpeed(attackSpeed);
  $('#attack-speed').value = String(attackSpeed);
  $('#attack-speed-value').textContent = `${attackSpeed.toFixed(1)}×`;
  $('#attack-speed').setAttribute('aria-valuetext', `${attackSpeed.toFixed(1)}배`);
}
applyAttackSpeed(attackSpeed);

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
  for (const button of buttons) button.disabled = !ready || (dead && button.id !== 'death-button');
}
const actions = {
  attack() { if (ready) controller.attack(); },
  setAttackHeld(held) { setAttackHeld('keyboard', held); },
  hit() { if (ready) { attackSources.clear(); controller.hit(); } },
  death() { if (!ready || controller.dead) return; attackSources.clear(); controller.die(); input.reset(); updateButtons(); },
  revive() { if (!ready || !controller.dead) return; controller.revive(); input.reset(); updateButtons(); toast('다시 움직일 수 있습니다.'); },
  canMove() { return ready && !controller.dead; },
};

function setAttackHeld(source, held) {
  if (held) {
    if (!ready || controller.dead || controller.setAttackHeld(true) === false) return;
    attackSources.add(source);
  } else if (attackSources.delete(source)) controller?.setAttackHeld(attackSources.size > 0);
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
  world.camera.alpha = Math.PI * .38; world.camera.beta = 1.18;
  world.camera.radius = innerWidth < 600 ? 6.5 : 4.8;
  input.panOffset = { x: 0, y: 0, z: 0 };
}

async function loadCharacter() {
  if (loadingAsset) return;
  loadingAsset = true; ready = false; updateButtons();
  loading.hidden = false; loading.classList.remove('error'); $('#retry-load').hidden = true;
  $('#loading-title').textContent = '숲으로 들어가는 중'; $('#loading-text').textContent = '캐릭터와 동작을 불러옵니다.'; $('#loading-progress').style.width = '5%';
  try {
    const manifestUrl = new URL(`${import.meta.env.BASE_URL}assets/character.json`, location.href);
    const response = await fetch(manifestUrl, { cache: 'no-cache' });
    if (!response.ok) throw new Error('캐릭터 설정 파일을 불러오지 못했습니다.');
    config = await response.json();
    const modelUrl = new URL(config.model, manifestUrl);
    const rootUrl = new URL('.', modelUrl).href;
    if (animator) animator.dispose();
    if (container) container.dispose();
    if (actor) actor.dispose();
    container = await SceneLoader.LoadAssetContainerAsync(rootUrl, modelUrl.pathname.split('/').pop(), world.scene, progress => {
      if (progress.lengthComputable && progress.total > 0) $('#loading-progress').style.width = `${Math.min(92, progress.loaded / progress.total * 90 + 5)}%`;
      else if (progress.loaded) $('#loading-text').textContent = `${(progress.loaded / 1024 / 1024).toFixed(1)} MB 불러오는 중`;
    }, '.glb');
    container.addAllToScene();
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
    controller = new CharacterController({ durations: animator.durations, speeds: config.speeds });
    controller.setAttackSpeed(attackSpeed);
    arrowNode = container.transformNodes.find(node => node.name === 'arrow');
    arrowMesh = container.meshes.find(mesh => mesh.name === 'Azure_Arrow');
    attackSources.clear(); shotTarget = null; shotActionId = null; hiddenArrowForAction = null;
    projectiles.clear();
    animator.transition('idle', { loop: true });
    ready = true; loading.hidden = true; $('#loading-progress').style.width = '100%';
    $('#build-tag').textContent = config.version || 'ARCHER / 01';
    resetCamera(); updateButtons();
    canvas.focus({ preventScroll: true });
  } catch (error) {
    console.error('[Archer asset load]', error);
    loading.classList.add('error');
    $('#loading-title').textContent = '캐릭터를 불러오지 못했습니다';
    $('#loading-text').textContent = error.message?.startsWith('필수 동작') || error.message?.startsWith('모델의 스키닝') ? error.message : '연결을 확인한 후 다시 시도해 주세요. 캐릭터 파일이 준비되지 않았을 수도 있습니다.';
    $('#retry-load').hidden = false; $('#loading-progress').style.width = '0%';
    if (container) container.dispose(); container = null;
    updateButtons();
  } finally { loadingAsset = false; }
}

function render() {
  const dt = document.hidden ? 0 : Math.min(engine.getDeltaTime() / 1000, .1);
  elapsed += dt;
  world.tick(elapsed);
  training.update(dt);
  projectiles.update(dt);
  if (ready) {
    const movement = input.value();
    const result = controller.update(dt, movement);
    animator.transition(result.state, result); animator.update(dt);
    const attacking = ['attack', 'moveAttack'].includes(result.state);
    if (attacking && result.actionId !== shotActionId) {
      shotActionId = result.actionId;
      shotTarget = training.selectNearest(actor.position);
      hiddenArrowForAction = null;
    }
    const selectedTarget = controller.dead ? null : attacking ? shotTarget : training.selectNearest(actor.position);
    training.setSelected(selectedTarget);
    if (result.moving) {
      const alpha = world.camera.alpha;
      const forward = new Vector3(-Math.cos(alpha), 0, -Math.sin(alpha));
      const right = new Vector3(-forward.z, 0, forward.x);
      const direction = forward.scale(movement.y).add(right.scale(movement.x)).normalize();
      actor.position.addInPlace(direction.scale(result.speed * dt));
      const radius = Math.hypot(actor.position.x, actor.position.z);
      if (radius > 11) { actor.position.x *= 11 / radius; actor.position.z *= 11 / radius; }
      // Keep the player outside the wooden target stands.
      for (const dummy of training.targets) {
        const dx = actor.position.x - dummy.position.x, dz = actor.position.z - dummy.position.z;
        const distance = Math.hypot(dx, dz);
        if (distance < .62) { actor.position.x = dummy.position.x + (distance ? dx / distance : 1) * .62; actor.position.z = dummy.position.z + (distance ? dz / distance : 0) * .62; }
      }
      if (!attacking || !shotTarget) faceHeading(Math.atan2(direction.x, direction.z) + (config.forwardYaw || 0), dt);
    }
    if (attacking && shotTarget) {
      const direction = shotTarget.aimPoint.subtract(actor.position);
      faceHeading(Math.atan2(direction.x, direction.z) - (config.attackYaw?.[result.state] || 0), dt);
    }
    for (const event of result.events || []) if (event.type === 'release') {
      shootAtTarget(); hiddenArrowForAction = event.actionId;
    }
    if (arrowMesh) arrowMesh.visibility = attacking && hiddenArrowForAction === result.actionId ? 0 : 1;
    const target = actor.position.add(new Vector3(input.panOffset.x, 1.02 + input.panOffset.y, input.panOffset.z));
    world.camera.setTarget(Vector3.Lerp(world.camera.target, target, 1 - Math.exp(-10 * dt)));
    $('#state-label').textContent = STATE_LABELS[result.state];
    $('#speed-label').textContent = `${result.speed.toFixed(2)} m/s`;
    $('#target-label').textContent = selectedTarget ? `${selectedTarget.name} · 명중 ${selectedTarget.hits}` : controller.dead ? '부활하면 사격을 재개합니다' : '사거리 안의 허수아비로 이동하세요';
    updateButtons();
  }
  statusTime += dt;
  if (statusTime > .5) { $('#render-status').textContent = `${Math.round(engine.getFps())} FPS · ${ready ? 'LIVE' : 'LOADING'}`; statusTime = 0; }
  world.scene.render();
}

try {
  if (!Engine.isSupported()) throw new Error('이 브라우저에서 WebGL을 사용할 수 없습니다.');
  engine = new Engine(canvas, true, { preserveDrawingBuffer: false, stencil: true, powerPreference: 'high-performance' });
  applyRenderQuality();
  world = createWorld(engine);
  training = createTrainingTargets(world.scene, world.shadows);
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
  $('#run-button').addEventListener('click', () => { controller?.toggleRun(); updateButtons(); });
  $('#attack-speed').addEventListener('input', event => {
    applyAttackSpeed(Number(event.target.value));
    try { localStorage.setItem('archer-attack-speed', String(attackSpeed)); } catch { /* Keep the session choice. */ }
  });
  $('#reset-attack-speed').addEventListener('click', () => {
    applyAttackSpeed(1);
    try { localStorage.setItem('archer-attack-speed', '1'); } catch { /* Keep the session choice. */ }
  });
  const attackButton = $('#attack-button');
  let lastPointerAttack = -Infinity;
  attackButton.addEventListener('pointerdown', event => {
    if (event.button !== 0 || !ready) return;
    event.preventDefault(); lastPointerAttack = performance.now();
    attackButton.setPointerCapture(event.pointerId); setAttackHeld(`button:${event.pointerId}`, true);
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) attackButton.addEventListener(name, event => setAttackHeld(`button:${event.pointerId}`, false));
  attackButton.addEventListener('click', event => { if (event.detail === 0 && performance.now() - lastPointerAttack > 350) actions.attack(); });
  const releaseAttack = () => { attackSources.clear(); controller?.setAttackHeld(false); };
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
  window.archerPreview = Object.freeze({ inspect: () => ({ ready, state: controller?.state, dead: controller?.dead, runToggled: controller?.runToggled, position: actor ? { x: actor.position.x, y: actor.position.y, z: actor.position.z } : null, maxBoneInfluences: maxInfluences, animations: config?.animations, joystickActive: input.joystickPointer !== null, cameraPointerCount: input.cameraPointers.size, camera: { alpha: world.camera.alpha, beta: world.camera.beta, radius: world.camera.radius }, panOffset: { ...input.panOffset } }) });
  loadCharacter();
} catch (error) {
  loading.classList.add('error'); $('#loading-title').textContent = '3D 화면을 시작하지 못했습니다'; $('#loading-text').textContent = error.message; console.error(error);
}
