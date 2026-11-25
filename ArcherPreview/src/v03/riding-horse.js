import { createWagonHorse } from './wagon-horse.js';
import { createBonePose } from './bone-pose.js';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { ridingLabels } from './riding-locale.js';
import { createRidingControls } from './riding-controls.js';
import { createRidingSaddle, SADDLE_PAD_HEIGHT } from './riding-saddle.js';
import { createRidingReins } from './riding-reins.js';
import { createRiderContact } from './riding-seat-contact.js';
import { createRidingGallopTrail } from './riding-gallop-trail.js';
import { createPreparedEffectLease } from '../prepared-effect-lifetime.js';
import { cameraRenderPass } from '../render-variant-state.js';

function keepRenderedMountPrograms(saddle,horseRoot){
  const scene=saddle.getScene();
  if(scene.isDisposed||scene.getEngine().isDisposed)return;
  const pass=cameraRenderPass(scene),lease=createPreparedEffectLease();
  const body=horseRoot.getChildMeshes(false,mesh=>mesh.name==='wagon_horse')[0];
  for(const mesh of [saddle,body]){
    if(!mesh||!scene.isActiveMesh(mesh)||mesh._internalMeshDataInfo._effectiveMaterial!==mesh.material)continue;
    // Read the last main-camera draw. A readiness query here would start work
    // for a mount that was cancelled before its first visible frame.
    for(const sub of mesh.subMeshes){
      const wrapper=sub._getDrawWrapper(pass,false);
      if(wrapper?._wasPreviouslyReady)lease.retain(mesh,wrapper.effect);
    }
  }
  lease.commit({keep:true});
}

const OWNED = 'v03:stable:horse';
const OUTDOORS = new Set(['village', 'great-plains', 'monster-forest']);
const GALLOP_SECONDS = 2.4, GALLOP_SPEED = 14;
const REINS = [
  {twist:'mixamorig:Hips', a:'mixamorig:RightUpLeg', b:'mixamorig:LeftUpLeg'},
  ['mixamorig:Spine', 'mixamorig:Spine1', [1,.08,0]],
  ['mixamorig:Spine1', 'mixamorig:Spine2', [1,.1,0]]
];
for (const [side, sign] of [['Left', 1], ['Right', -1]]) {
  const limb = name => 'mixamorig:' + side + name;
  REINS.push(
    [limb('UpLeg'), limb('Leg'), [-.88, .42, .77 * sign]],
    [limb('Leg'), limb('Foot'), [-1, -.12, .38 * sign]],
    [limb('Foot'), limb('ToeBase'), [-.24, 1, .03 * sign]],
    [limb('Arm'), limb('ForeArm'), [-.82, .45, .16 * sign]],
    [limb('ForeArm'), limb('Hand'), [.14, 1, -.25 * sign]]
  );
}
for(const [strand,spread] of [['L',.12],['C',0],['R',-.12]]){
  const bone = n => 'DEF-Cape.0'+n+'.'+strand;
  REINS.push([bone(1),bone(2),[-.89,-.46,spread]], [bone(2),bone(3),[-.43,-.90,spread]],
    [bone(3),bone(4),[-.15,-1,spread]]);
}

export function createRidingHorse({ world, root, storage, player, ridingAllowed, tell, forwardYaw, diagnostics, makeHorse = createWagonHorse, pose = createBonePose,
  enabled = new URLSearchParams(globalThis.location?.search).get('riding') !== '0' }) {
  // A URL-only comparison: no horse load, listeners or reads/writes to the player's save.
  if(!enabled){
    const noop=()=>{};
    return {offer:()=>false,reload:noop,leave:noop,beginTravel:noop,finishTravel:noop,updateAvailability:noop,afterMove:noop,active:false,
      inspect:()=>({state:'disabled',mounts:0,gait:null}),dispose:noop};
  }
  const doc = root.ownerDocument;
  const controls = createRidingControls(root, toggle);
  let owned = false, horse = null, active = false, generation = 0, rig = null, lift = null, rider = null;
  let hiddenArms = [], clip = '', available = false, mountMap = '', poseObserver = null, saddle = null;
  const contact = new Vector3(), correction = new Vector3(), local = new Vector3(), inverse = new Matrix();
  let labels = ridingLabels(doc), riderContact = null;
  let seatedBones=[],updateReins=null;
  let checkedMap=null, nextOfferCheck=0, mounts=0;
  let travellingTo=null, parked=false;
  let gallopRemaining=0, gallopStrength=0, trail=null;
  function stopGallop() {
    gallopRemaining=0;
    gallopStrength=0;
    trail?.update(0,0);
  }
  function startGallop() {
    if (!active || travellingTo || !available || !ridingAllowed()) return false;
    if (!gallopRemaining) gallopRemaining=GALLOP_SECONDS;
    return true;
  }
  function steerGallop(movement,cameraYaw,dt) {
    if (!gallopRemaining) return;
    gallopRemaining=Math.max(0,gallopRemaining-dt);
    gallopStrength=Math.min(1,(GALLOP_SECONDS-gallopRemaining)/.22,gallopRemaining/.30);
    if (gallopRemaining && Math.hypot(movement.x,movement.y)<.08) {
      // Project the horse's forward direction onto the active camera's controls.
      const angle=rider.rotation.y-forwardYaw()+cameraYaw;
      movement.x=-Math.cos(angle);
      movement.y=-Math.sin(angle);
    }
  }
  function travelSpeed(base) {
    if(base<=0)return 0;
    const usual=base*1.7;
    return usual+gallopStrength*Math.max(0,GALLOP_SPEED-usual);
  }
  const display = () => {
    labels = ridingLabels(doc);
    controls.show(travellingTo ? 'on-foot' : active ? 'mounted' : horse ? 'loading' : 'on-foot', owned && available && !travellingTo, labels);
  };
  function leave(keepPrograms=true) {
    ++generation;travellingTo=null;parked=false;
    if(keepPrograms&&active&&saddle)keepRenderedMountPrograms(saddle,horse.root);
    stopGallop();
    trail?.dispose();trail=null;
    checkedMap=null;
    if(poseObserver)world.scene.onBeforeRenderObservable.remove(poseObserver);
    poseObserver=null;
    if (lift && !lift.isDisposed()) {lift.position.set(0,0,0);lift.rotation.z=0;}
    for (const mesh of hiddenArms) if (!mesh.isDisposed()) mesh.setEnabled(true);
    hiddenArms = []; seatedBones=[]; rig = lift = rider = riderContact = null;updateReins=null;
    const old = horse; horse = null; saddle = null; active = false; clip = '';
    old?.dispose(); display();
  }
  function reload() {
    leave();
    try { owned = storage.getItem(OWNED) === '1'; } catch { owned = false; }
    display();
  }
  function offer() {
    if (!owned) {
      try { storage.setItem(OWNED, '1'); } catch { tell(ridingLabels(doc).saveError); return false; }
      owned = true;
      tell(ridingLabels(doc).acquired);
    } else tell(ridingLabels(doc).ready);
    display();
    return true;
  }
  async function toggle() {
    if (travellingTo) return;
    if (horse) { const wasMounted=active; leave(); if(wasMounted)tell(labels.dismounted); return; }
    return mount(false);
  }
  async function mount(onArrival,findLanding) {
    const actor = player();
    if (!owned || !actor || (!onArrival&&(!available||!ridingAllowed()))) return;
    const token = ++generation;
    mountMap = world.mapId;
    let timer;
    try {
      const instance = makeHorse({scene:world.scene,shadows:world.shadows,wagon:actor.position,heightAt:(x,z)=>world.terrain.heightAt(x,z),mounted:true});
      horse=instance;display();
      // If a cave return cannot load the horse, release the travel curtain on foot.
      const model=onArrival?await Promise.race([instance.ready,new Promise(resolve=>{timer=setTimeout(()=>resolve(null),4000);})]):await instance.ready;
      if (token !== generation) return;
      if(!model){leave();tell(ridingLabels(doc).loadError);return;}
      if(actor!==player()||world.mapId!==mountMap||!ridingAllowed(onArrival)||(onArrival&&!placeAtArrival(actor,findLanding))){leave();return;}
      rider = actor; lift = actor.metadata?.saddleOffset;
      if (!lift) { leave(); return; }
      rig = pose(actor, REINS, {reuseHierarchy:true});
      if (!rig.ready || !rig.hips) { leave(); tell(ridingLabels(doc).poseError); return; }
      travellingTo=null;parked=false;available=true;active=true;
      riderContact=createRiderContact(actor);
      // The ground gait twists the pelvis and ankles differently on each
      // stride. The horse carries the pelvis; the rider balances with the torso.
      const body=actor.getChildMeshes(false).find(mesh=>mesh.name==='Warrior_Body_primitive0');
      for(const bone of body?.skeleton?.bones??[]){
        if(!/^mixamorig:(Hips|(Right|Left)(UpLeg|Leg|Foot))$/.test(bone.name))continue;
        const node=bone.getTransformNode(), rotation=node?.rotationQuaternion?.clone();
        if(rotation){bone.getRestMatrix().decompose(undefined,rotation);seatedBones.push({node,rotation});}
      }
      if(instance.root){
        saddle=createRidingSaddle(instance.root);
        updateReins=createRidingReins(instance.root,actor,saddle.material);
      }
      for (const mesh of actor.getChildMeshes(false)) {
        if (/^(Golden_Oathblade|Bunnyguard_Shield|Shield_(Forearm_Strap|MountPad|Rivet))/.test(mesh.name) && mesh.isEnabled(false)) {
          mesh.setEnabled(false); hiddenArms.push(mesh);
        }
      }
      afterMove({moving:false},0);
      // Weighted walk/run tracks write their values during scene.render().
      // Apply the seated pose after that blend, before the skeleton is drawn.
      if(world.scene)poseObserver=world.scene.onBeforeRenderObservable.add(drawMountedPose);
      ++mounts;
      display();if(!onArrival)tell(labels.mounted);
      return true;
    } catch { if (token === generation) { leave(); tell(ridingLabels(doc).loadError); } }
    finally{if(timer!==undefined)clearTimeout(timer);}
  }
  // Map changes retain the scene and player. Hide the existing outdoor mount
  // until the destination has walkable terrain; the cave keeps only the intent.
  function beginTravel(destination) {
    if(travellingTo===destination)return; // retry of the same covered transition
    if(!(active||parked)||(!OUTDOORS.has(destination)&&destination!=='witch-cave')){leave();return;}
    if(destination==='witch-cave'){
      leave();parked=true;
    }else if(active){
      stopGallop();horse.root?.setEnabled(false);
    }
    available=false;travellingTo=destination;display();
  }
  function placeAtArrival(actor,findLanding){
    let landing;
    try{landing=findLanding(actor.position);}catch{/* No horse-sized space at the arrival. */}
    if(!landing||![landing.x,landing.y,landing.z].every(Number.isFinite))return false;
    Object.assign(actor.position,landing);
    return true;
  }
  async function finishTravel(findLanding) {
    if(!travellingTo)return false;
    if(world.mapId!==travellingTo||!owned){leave();return false;}
    if(travellingTo==='witch-cave'){
      travellingTo=null;tell(ridingLabels(doc).parked);return false;
    }
    const actor=player();
    if(!actor||(active&&actor!==rider)||!ridingAllowed(true)){leave();return false;}
    if(!active)return mount(true,findLanding);
    if(!placeAtArrival(actor,findLanding)){leave();return false;}
    mountMap=travellingTo;travellingTo=null;parked=false;available=true;
    afterMove({state:'idle'},0);horse.root?.setEnabled(true);display();
    return true;
  }
  function updateAvailability(now) {
    if (!owned || travellingTo) return;
    now??=performance.now();
    if (horse && world.mapId !== mountMap) leave();
    // On foot only the button depends on this check, which scans all enemies.
    // Clicks, pending mounts and active rides still test eligibility immediately.
    if(!horse && checkedMap===world.mapId && now<nextOfferCheck){
      if(labels!==ridingLabels(doc))display();
      return;
    }
    checkedMap=world.mapId;nextOfferCheck=now+150;
    const value = OUTDOORS.has(world.mapId) && ridingAllowed();
    if (value !== available) { available = value; if (!value && horse) leave(); else display(); }
    else if (labels !== ridingLabels(doc)) display();
  }
  function afterMove(result, speed, dt=0) {
    if (!active || travellingTo) return;
    const state = result.state ?? 'idle';
    if (player() !== rider || !available || (state !== 'idle' && state !== 'walk' && state !== 'run')) { leave(); return; }
    const yaw = rider.rotation.y - forwardYaw();
    horse.place(rider.position.x,rider.position.z,yaw);
    const next = speed < .04 ? 'Horse_Idle' : speed > 3 ? 'Horse_Gallop' : 'Horse_Walk';
    if (clip !== next) { horse.play(next); clip = next; }
    horse.speed(clip === 'Horse_Idle' ? 1 : Math.max(.55,Math.min(1.7,speed/(clip === 'Horse_Walk'?1.7:5))));
    const strength=gallopStrength*Math.min(1,speed/6);
    if(strength>0&&!trail)trail=createRidingGallopTrail(horse.root);
    trail?.update(dt,strength);
    if(!poseObserver)fitSaddle();
  }
  function fitSaddle() {
    if(!active)return;
    lift.rotation.z=0;
    for(const {node,rotation} of seatedBones)node.rotationQuaternion.copyFrom(rotation);
    rig.apply(1);
    if(!horse.saddleContactToRef(contact))return;
    if(saddle){
      // Place the seat behind the withers, following the orientation of the mount.
      contact.x-=.09*Math.sin(horse.root.rotation.y);
      contact.z-=.09*Math.cos(horse.root.rotation.y);
      contact.y-=.003;
      horse.root.getWorldMatrix().invertToRef(inverse);
      Vector3.TransformCoordinatesToRef(contact,inverse,saddle.position);
    }
    // The run clip translates the hips forward and sideways. Place the actual
    // pelvis in the moving three-dimensional seat after the locomotion blend.
    if(riderContact){
      // Neutralise the alternating hip roll from the biped run. Both seat
      // bones then carry weight on their pads, including the gait changeover.
      lift.rotation.z=Math.max(-.15,Math.min(.15,riderContact(local,false)));
      lift.markAsDirty();
      riderContact(local,false);
      contact.y+=SADDLE_PAD_HEIGHT;
      contact.subtractToRef(local,correction);
    }else{
      rig.hips.computeWorldMatrix(true);
      contact.y+=.28;
      contact.subtractToRef(rig.hips.absolutePosition,correction);
    }
    lift.parent.computeWorldMatrix().invertToRef(inverse);
    Vector3.TransformNormalToRef(correction,inverse,local);
    lift.position.addInPlace(local);
    lift.markAsDirty?.();
    updateReins?.();
  }
  function drawMountedPose() {
    if(travellingTo)return;
    if(!diagnostics?.collecting){fitSaddle();return;}
    const start=diagnostics.mark();
    try{fitSaddle();}finally{diagnostics.measure('ridingPoseMs',start);}
  }
  function hotkey(e) {
    if (e.code !== 'KeyH' || e.repeat || e.ctrlKey || e.altKey || e.metaKey || controls.button.hidden || doc.querySelector('dialog[open]')) return;
    e.preventDefault(); void toggle();
  }
  doc.addEventListener('keydown',hotkey);
  reload();
  return { offer, reload, leave, beginTravel, finishTravel, updateAvailability, afterMove, startGallop, stopGallop, steerGallop, travelSpeed, get active(){return active&&!travellingTo;},
    inspect:()=>({state:travellingTo?'travelling':active?'mounted':horse?'loading':'on-foot',mounts,gait:clip||null,...(gallopRemaining>0?{galloping:true}:{})}),
    dispose(){leave(false);doc.removeEventListener('keydown',hotkey);controls.dispose();}
  };
}
