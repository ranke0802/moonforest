import './styles.css';
import { Engine, SceneLoader, TransformNode, Vector3, VertexBuffer } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { createWorld } from './world.js';
import { PlaygroundInput } from './input.js';
import { CharacterController, STATE_LABELS } from './controller.js';
import { CharacterAnimator } from './animation.js';
import { setupFullscreen } from './fullscreen.js';

const $ = selector => document.querySelector(selector);
const canvas = $('#viewport');
const loading = $('#loading');
const buttons = ['#run-button', '#attack-button', '#hit-button', '#death-button'].map($);
let engine, world, actor, controller, animator, container, config, input;
let ready = false, loadingAsset = false, maxInfluences = 0, statusTime = 0, elapsed = 0;
let toastTimer;
let qualityMode = 'high';
try { qualityMode = localStorage.getItem('archer-render-quality') || 'high'; } catch { /* Storage may be unavailable in private browsing. */ }
if (!['high', 'balanced', 'battery'].includes(qualityMode)) qualityMode = 'high';

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
  hit() { if (ready) controller.hit(); },
  death() { if (!ready || controller.dead) return; controller.die(); input.reset(); updateButtons(); },
  revive() { if (!ready || !controller.dead) return; controller.revive(); input.reset(); updateButtons(); toast('다시 움직일 수 있습니다.'); },
  canMove() { return ready && !controller.dead; },
};

function resetCamera() {
  if (!world) return;
  world.camera.alpha = Math.PI * .38; world.camera.beta = 1.18;
  world.camera.radius = innerWidth < 600 ? 5.5 : 4.8;
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
  const dt = document.hidden ? 0 : Math.min(engine.getDeltaTime() / 1000, 1 / 30);
  elapsed += dt;
  world.tick(elapsed);
  if (ready) {
    const movement = input.value();
    const result = controller.update(dt, movement);
    animator.transition(result.state, result); animator.update(dt);
    if (result.moving) {
      const alpha = world.camera.alpha;
      const forward = new Vector3(-Math.cos(alpha), 0, -Math.sin(alpha));
      const right = new Vector3(-forward.z, 0, forward.x);
      const direction = forward.scale(movement.y).add(right.scale(movement.x)).normalize();
      actor.position.addInPlace(direction.scale(result.speed * dt));
      const radius = Math.hypot(actor.position.x, actor.position.z);
      if (radius > 11) { actor.position.x *= 11 / radius; actor.position.z *= 11 / radius; }
      const heading = Math.atan2(direction.x, direction.z) + (config.forwardYaw || 0);
      const delta = Math.atan2(Math.sin(heading - actor.rotation.y), Math.cos(heading - actor.rotation.y));
      actor.rotation.y += delta * (1 - Math.exp(-14 * dt));
    }
    const target = actor.position.add(new Vector3(input.panOffset.x, 1.02 + input.panOffset.y, input.panOffset.z));
    world.camera.setTarget(Vector3.Lerp(world.camera.target, target, 1 - Math.exp(-10 * dt)));
    $('#state-label').textContent = STATE_LABELS[result.state];
    $('#speed-label').textContent = `${result.speed.toFixed(2)} m/s`;
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
  $('#attack-button').addEventListener('click', actions.attack);
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
  $('#help-toggle').addEventListener('click', () => { input.reset(); $('#help-dialog').showModal(); });
  $('#close-help').addEventListener('click', () => $('#help-dialog').close());
  $('#help-dialog').addEventListener('click', e => { if (e.target === $('#help-dialog')) { const r = e.target.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) e.target.close(); } });
  // Read-only diagnostics make integration QA reproducible without exposing mutable scene objects.
  window.archerPreview = Object.freeze({ inspect: () => ({ ready, state: controller?.state, dead: controller?.dead, runToggled: controller?.runToggled, position: actor ? { x: actor.position.x, y: actor.position.y, z: actor.position.z } : null, maxBoneInfluences: maxInfluences, animations: config?.animations, joystickActive: input.joystickPointer !== null, cameraPointerCount: input.cameraPointers.size, camera: { alpha: world.camera.alpha, beta: world.camera.beta, radius: world.camera.radius }, panOffset: { ...input.panOffset } }) });
  loadCharacter();
} catch (error) {
  loading.classList.add('error'); $('#loading-title').textContent = '3D 화면을 시작하지 못했습니다'; $('#loading-text').textContent = error.message; console.error(error);
}
