import { createWagonHorse } from './wagon-horse.js';
import { createBonePose } from './bone-pose.js';


const OWNED = 'v03:stable:horse';
const OUTDOORS = new Set(['village', 'great-plains', 'monster-forest']);
const REINS = [];
for (const [side, sign] of [['Left', 1], ['Right', -1]]) {
  const limb = name => 'mixamorig:' + side + name;
  REINS.push(
    [limb('UpLeg'), limb('Leg'), [-.54, .64, .5 * sign]],
    [limb('Leg'), limb('Foot'), [-1, -.19, -.08 * sign]],
    [limb('Arm'), limb('ForeArm'), [-.88, .28, .18 * sign]],
    [limb('ForeArm'), limb('Hand'), [.12, 1, -.30 * sign]]
  );
}

export function createRidingHorse({ world, root, storage, player, ridingAllowed, tell, forwardYaw, makeHorse = createWagonHorse, pose = createBonePose }) {
  const doc = root.ownerDocument;
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = 'v03-ride-toggle';
  button.dataset.ui = '';
  button.hidden = true;
  root.querySelector('.top-actions').append(button);
  let owned = false, horse = null, active = false, generation = 0, rig = null, lift = null, rider = null;
  let hiddenArms = [], clip = '', available = false, mountMap = '', poseObserver = null;
  const display = () => {
    button.hidden = !owned || !available;
    button.textContent = active ? 'Dismount' : horse ? 'Cancel' : 'Ride';
    button.setAttribute('aria-label', button.textContent+' (H)');
  };
  function leave() {
    ++generation;
    if(poseObserver)world.scene.onBeforeRenderObservable.remove(poseObserver);
    poseObserver=null;
    if (lift && !lift.isDisposed()) lift.position.y = 0;
    for (const mesh of hiddenArms) if (!mesh.isDisposed()) mesh.setEnabled(true);
    hiddenArms = []; rig = lift = rider = null;
    const old = horse; horse = null; active = false; clip = '';
    old?.dispose(); display();
  }
  function reload() {
    leave();
    try { owned = storage.getItem(OWNED) === '1'; } catch { owned = false; }
    display();
  }
  function offer() {
    if (!owned) {
      try { storage.setItem(OWNED, '1'); } catch { tell('The horse could not be saved.'); return false; }
      owned = true;
      tell('Horse acquired · Ride (H)');
    } else tell('Your horse is ready · Ride (H)');
    display();
    return true;
  }
  async function toggle() {
    if (horse) { leave(); return; }
    const actor = player();
    if (!owned || !available || !actor || !ridingAllowed()) return;
    const token = ++generation;
    mountMap = world.mapId;
    const instance = makeHorse({scene:world.scene,shadows:world.shadows,wagon:actor.position,heightAt:(x,z)=>world.terrain.heightAt(x,z),mounted:true});
    horse = instance; display();
    try {
      const model = await instance.ready;
      if (token !== generation) return;
      if (!model || actor !== player() || world.mapId !== mountMap || !ridingAllowed()) { leave(); return; }
      rider = actor; lift = actor.metadata?.saddleOffset;
      if (!lift) { leave(); return; }
      rig = pose(actor, REINS);
      if (!rig.ready || !rig.hips) { leave(); tell('Rider unavailable. Please try again.'); return; }
      active = true;
      for (const mesh of actor.getChildMeshes(false)) {
        if (/^(Golden_Oathblade|Bunnyguard_Shield)( \/|$)/.test(mesh.name) && mesh.isEnabled(false)) {
          mesh.setEnabled(false); hiddenArms.push(mesh);
        }
      }
      afterMove({moving:false},0);
      // Weighted walk/run tracks write their values during scene.render().
      // Apply the seated pose after that blend, before the skeleton is drawn.
      if(world.scene)poseObserver=world.scene.onBeforeRenderObservable.add(fitSaddle);
      display();
    } catch { if (token === generation) { leave(); tell('Horse unavailable. Please try again.'); } }
  }
  function updateAvailability() {
    if (!owned) return;
    if (horse && world.mapId !== mountMap) leave();
    const value = OUTDOORS.has(world.mapId) && ridingAllowed();
    if (value !== available) { available = value; if (!value && horse) leave(); else display(); }
  }
  function afterMove(result, speed) {
    if (!active) return;
    const state = result.state ?? 'idle';
    if (player() !== rider || !available || (state !== 'idle' && state !== 'walk' && state !== 'run')) { leave(); return; }
    const yaw = rider.rotation.y - forwardYaw();
    horse.place(rider.position.x,rider.position.z,yaw);
    const next = speed < .04 ? 'Horse_Idle' : speed > 3 ? 'Horse_Gallop' : 'Horse_Walk';
    if (clip !== next) { horse.play(next); clip = next; }
    horse.speed(clip === 'Horse_Idle' ? 1 : Math.max(.55,Math.min(1.7,speed/(clip === 'Horse_Walk'?1.7:5))));
    if(!poseObserver)fitSaddle();
  }
  function fitSaddle() {
    if(!active)return;
    rig.apply(1);
    const scale = rider.absoluteScaling?.y || 1;
    const contact=horse.saddleY?.();
    const goal=contact==null ? 1.608 : contact-rider.absolutePosition.y+.13;
    lift.position.y += (goal-rig.hipsAbove())/scale;
  }
  function hotkey(e) {
    if (e.code !== 'KeyH' || e.repeat || e.ctrlKey || e.altKey || e.metaKey || button.hidden || doc.querySelector('dialog[open]')) return;
    e.preventDefault(); void toggle();
  }
  button.addEventListener('click',toggle);doc.addEventListener('keydown',hotkey);
  reload();
  return { offer, reload, leave, updateAvailability, afterMove, get active(){return active;},
    dispose(){leave();doc.removeEventListener('keydown',hotkey);button.remove();}
  };
}
