import { createWagonHorse } from './wagon-horse.js';
import { planHorseApproach, planHorseCall, planHorseDeparture, findHorseDismount, startHorseTravel } from './riding-horse-path.js';
import { createRidingWardrobe, RIDING_STATS } from './riding-wardrobe.js';
import { createRidingAudio } from './riding-audio.js';
import { createRiderTransferPose } from './riding-transfer-pose.js';
import { createBonePose } from './bone-pose.js';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { ridingLabels } from './riding-locale.js';
import { createRidingControls } from './riding-controls.js';
import { createRidingSaddle, placeRidingSaddle, SADDLE_PAD_HEIGHT } from './riding-saddle.js';
import { createRidingReins } from './riding-reins.js';
import { createRiderContact } from './riding-seat-contact.js';
import { createRidingGallopTrail } from './riding-gallop-trail.js';
import { createRidingRam } from './riding-charge.js';
import { createRidingChargeFx } from './riding-charge-fx.js';
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
const {gallopSeconds:GALLOP_SECONDS,gallopSpeed:GALLOP_SPEED,speedMultiplier,runMultiplier:RUN_MULTIPLIER,gallopOverRun:GALLOP_OVER_RUN}=RIDING_STATS;
// Mounted run (2026-11-27): the held run input eases in/out over this time.
const RUN_EASE_SECONDS=.25;
const RAM_MAX=4;
const MOUNT_SECONDS = 1.45, DISMOUNT_SECONDS = 1.30;
const FALL_SECONDS = 52/30, FALL_FADE_SECONDS = 1;
const WHISTLE_ARM = [
  ['mixamorig:RightArm', 'mixamorig:RightForeArm', [-.62,.72,-.20]],
  ['mixamorig:RightForeArm','mixamorig:RightHand',[.86,-.32,.41]]
];
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

export function createRidingHorse({ world, root, storage, player, ridingAllowed, riderAlive=()=>true, tell, forwardYaw, diagnostics, audio, makeHorse = createWagonHorse, pose = createBonePose,
  battle=()=>null, canRam=()=>true, random=Math.random, makeChargeFx=createRidingChargeFx,
  enabled = new URLSearchParams(globalThis.location?.search).get('riding') !== '0' }) {
  // A URL-only comparison: no horse load, listeners or reads/writes to the player's save.
  if(!enabled){
    const noop=()=>{};
    return {offer:()=>false,reload:noop,leave:noop,beginTravel:noop,finishTravel:noop,updateAvailability:noop,afterMove:noop,active:false,
      inspect:()=>({state:'disabled',mounts:0,gait:null}),dispose:noop};
  }
  const doc = root.ownerDocument;
  const controls = createRidingControls(root, toggle);
  const sounds=audio?createRidingAudio(audio):null;
  let owned = false, horse = null, active = false, generation = 0, rig = null, lift = null, rider = null;
  const wardrobe=createRidingWardrobe({world,storage,owned:()=>owned,fieldHorse:()=>horse,canBorrow:()=>active&&!travellingTo,makeHorse});
  let hiddenArms = [], clip = '', available = false, mountMap = '', poseObserver = null, saddle = null;
  const contact = new Vector3(), correction = new Vector3(), local = new Vector3(), inverse = new Matrix();
  let labels = ridingLabels(doc), riderContact = null;
  let seatedBones=[],updateReins=null;
  let checkedMap=null, nextOfferCheck=0, mounts=0;
  let travellingTo=null, parked=false;
  let phase='on-foot', travel=null, standing=null, transfer=null, transferTime=0;
  let whistleRig=null, whistleTime=0, route=null, departRoute=null, savedPrograms=false, turning=null;
  const transferring=()=>phase==='mounting'||phase==='dismounting';
  const locksRider=()=>phase==='approaching'||transferring();
  let gallopRemaining=0, gallopStrength=0, trail=null, chargeFx=null;
  // Run: the held run input (dodge button / Space), a sustained faster gait with
  // no charge effects or contact. Charge: the attack input only (2026-11-27).
  let runHeld=false, runStrength=0, launchPending=false, endPending=false, rams=0;
  const ram=createRidingRam({random});
  const struckAt=Array.from({length:RAM_MAX},()=>({x:0,z:0,boss:false}));
  function stopGallop() {
    gallopRemaining=0;
    gallopStrength=0;launchPending=false;endPending=false;
    trail?.update(0,0);chargeFx?.reset();
  }
  function startGallop() {
    if (!active || travellingTo || !available || !ridingAllowed()) return false;
    if (!gallopRemaining) {gallopRemaining=GALLOP_SECONDS;ram.begin();launchPending=true;endPending=false;}
    return true;
  }
  function setRunHeld(held) {
    runHeld=!!held&&active&&!travellingTo;
    return runHeld;
  }
  function steerGallop(movement,cameraYaw,dt) {
    if (!gallopRemaining) return;
    gallopRemaining=Math.max(0,gallopRemaining-dt);
    if(!gallopRemaining)endPending=true;
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
    const usual=base*speedMultiplier,running=usual*(1+(RUN_MULTIPLIER-1)*runStrength);
    // The charge always outruns the full run, also at raised movement-speed settings.
    const charge=Math.max(GALLOP_SPEED,usual*RUN_MULTIPLIER*GALLOP_OVER_RUN);
    return running+gallopStrength*Math.max(0,charge-running);
  }
  const display = () => {
    labels = ridingLabels(doc);
    controls.show(travellingTo ? 'on-foot' : phase, owned && available && !travellingTo, labels);
  };
  function leave(keepPrograms=true) {
    sounds?.stop();wardrobe.closePreview();
    ++generation;travellingTo=null;parked=false;
    if(keepPrograms&&active&&saddle&&!savedPrograms)keepRenderedMountPrograms(saddle,horse.root);
    stopGallop();runHeld=false;runStrength=0;
    trail?.dispose();trail=null;chargeFx?.dispose();chargeFx=null;
    checkedMap=null;
    if(poseObserver)world.scene.onBeforeRenderObservable.remove(poseObserver);
    poseObserver=null;
    transfer?.reset();
    phase='on-foot';transfer=null;transferTime=0;whistleRig=null;travel=null;route=null;departRoute=null;standing=null;savedPrograms=false;turning=null;
    if (lift && !lift.isDisposed()) {lift.position.set(0,0,0);lift.rotation.z=0;}
    for (const mesh of hiddenArms) if (!mesh.isDisposed()) mesh.setEnabled(true);
    hiddenArms = []; seatedBones=[]; rig = lift = rider = riderContact = null;updateReins=null;
    const old = horse; horse = null; saddle = null; active = false; clip = '';
    old?.dispose(); display();
  }
  function reload() {
    leave();
    wardrobe.reload();
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
  function dismount() {
    if (travellingTo || phase!=='mounted' || !riderAlive() || !ridingAllowed()) return;
    const heading=rider.rotation.y-forwardYaw();
    const landing=findHorseDismount(world,rider.position,heading);
    if(!landing){tell(labels.space);return;}
    departRoute=planHorseDeparture(world,rider.position,heading);
    if(!departRoute){tell(labels.space);return;}
    standing=landing;transferTime=DISMOUNT_SECONDS;phase='dismounting';active=false;
    // Retain the opaque draw before the rider leaves and the horse fades.
    if(saddle){keepRenderedMountPrograms(saddle,horse.root);savedPrograms=true;}
    sounds?.run(0);
    stopGallop();horse.play('Horse_Idle');clip='Horse_Idle';horse.speed(1);
    display();
  }
  function playerDamaged() {
    if(horse&&!travellingTo&&phase!=='departing'&&phase!=='falling')leave();
  }
  function playerCaptured() {
    if (!horse || travellingTo || phase==='departing' || phase==='falling') return;
    if (!active && !transferring()) { leave(); return; }
    if (active && saddle && !savedPrograms) keepRenderedMountPrograms(saddle,horse.root);
    sounds?.stop();stopGallop();
    if(poseObserver)world.scene.onBeforeRenderObservable.remove(poseObserver);
    poseObserver=null;
    releaseRider(true);
    // The saddle normally follows the moving pelvis each frame. Attach it
    // at its current world pose so it tips onto its side with this horse.
    if(saddle){
      const chest=horse.root.getChildTransformNodes(false,node=>node.name==='chest')[0];
      if(chest){chest.computeWorldMatrix(true);saddle.setParent(chest);}
    }
    active=false;phase='falling';transferTime=0;
    clip='Horse_Fall';horse.play(clip);horse.speed(1);
    display();
  }
  async function toggle() {
    if (travellingTo) return;
    if (phase==='mounted') return dismount();
    if(transferring()||phase==='departing'||phase==='falling')return;
    if(horse){leave();return;}
    return mount(false);
  }
  async function mount(onArrival,findLanding) {
    const actor = player();
    if (!owned || !actor || !riderAlive() || (!onArrival&&(!available||!ridingAllowed()))) return;
    const token = ++generation;
    mountMap = world.mapId;
    let timer;
    phase='loading';
    try {
      if(!onArrival){
        // Keep the original ground anchor until the pelvis has reached the saddle.
        world.firstPerson?.exit();
        // The horse may need another facing than the caller's (a tree at that flank): the
        // caller turns to it while whistling (2026-11-26, user: calls were refused on open ground).
        const call=planHorseCall(world,actor,actor.rotation.y-forwardYaw());
        if(!call){leave();tell(labels.space);return;}
        route=call.route;turning=call.turn?{actor,from:actor.rotation.y,by:call.turn}:null;
        standing={x:actor.position.x,y:actor.position.y??world.terrain.heightAt(actor.position.x,actor.position.z),z:actor.position.z};
        sounds?.call();
        whistleTime=0;
        if(actor.getDescendants)whistleRig=pose(actor,WHISTLE_ARM,{reuseHierarchy:true});
        hideEquipment(actor);
        if(world.scene)poseObserver=world.scene.onBeforeRenderObservable.add(drawMountedPose);
      }
      const instance = makeHorse({scene:world.scene,shadows:world.shadows,wagon:actor.position,heightAt:(x,z)=>world.terrain.heightAt(x,z),mounted:true,initialOpacity:onArrival?1:0});
      horse=instance;display();
      // If a cave return cannot load the horse, release the travel curtain on foot.
      const model=onArrival?await Promise.race([instance.ready,new Promise(resolve=>{timer=setTimeout(()=>resolve(null),4000);})]):await instance.ready;
      if (token !== generation) return;
      if(!model){leave();tell(ridingLabels(doc).loadError);return;}
      if(actor!==player()||world.mapId!==mountMap||!riderAlive()||(onArrival&&(!ridingAllowed(true)||!placeAtArrival(actor,findLanding)))){leave();return;}
      instance.setCoat?.(wardrobe.coat);
      rider = actor; lift = actor.metadata?.saddleOffset;
      if (!lift) { leave(); return; }
      rig = pose(actor, REINS, {reuseHierarchy:true});
      if (!rig.ready || !rig.hips) { leave(); tell(ridingLabels(doc).poseError); return; }
      travellingTo=null;parked=false;available=true;
      if(actor.getDescendants)transfer=createRiderTransferPose(actor);
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
        // Charge effects are prepared while the horse approaches and the rider climbs on.
        trail=createRidingGallopTrail(instance.root);
        if(world.scene)chargeFx=makeChargeFx({scene:world.scene,camera:()=>world.camera??world.scene.activeCamera,root});
      }
      hideEquipment(actor);
      if(world.scene&&!poseObserver)poseObserver=world.scene.onBeforeRenderObservable.add(drawMountedPose);
      if(onArrival){
        phase='mounted';active=true;++mounts;afterMove({state:'idle'},0);
      }else{
        phase='approaching';travel=startHorseTravel(horse,route,{departing:false,saddle});clip='Horse_Gallop';
      }
      display();
      return true;
    } catch { if (token === generation) { leave(); tell(ridingLabels(doc).loadError); } }
    finally{if(timer!==undefined)clearTimeout(timer);}
  }
  function hideEquipment(actor){
    for(const mesh of actor.getChildMeshes(false)){
      if(/^(Golden_Oathblade|Bunnyguard_Shield|Shield_(Forearm_Strap|MountPad|Rivet|Rear_Leather_Pad))/.test(mesh.name)&&mesh.isEnabled(false)){
        mesh.setEnabled(false);hiddenArms.push(mesh);
      }
    }
  }
  function releaseRider(restorePose=false){
    transfer?.reset(restorePose);transfer=null;
    if(lift&&!lift.isDisposed()){lift.position.set(0,0,0);lift.rotation.z=0;}
    for(const mesh of hiddenArms)if(!mesh.isDisposed())mesh.setEnabled(true);
    hiddenArms=[];seatedBones=[];rig=lift=rider=riderContact=null;whistleRig=null;
    if(saddle&&updateReins)horse.root.getChildMeshes(false,m=>m.name==='v03-riding-reins')[0]?.setEnabled(false);
    updateReins=null;
  }
  function advanceSequence(result,dt){
    const delta=Math.max(0,Math.min(dt,.1));
    if(phase==='falling'){
      transferTime+=delta;
      if(transferTime<FALL_SECONDS)return;
      if(clip!=='Horse_Down'){clip='Horse_Down';horse.play(clip);}
      const opacity=Math.max(0,1-(transferTime-FALL_SECONDS)/FALL_FADE_SECONDS);
      horse.setOpacity?.(opacity);
      if(saddle)saddle.visibility=opacity;
      if(!opacity)leave();
      return;
    }
    if(phase==='departing'){
      if(travel.update(delta)){leave();return;}
      sounds?.run(travel.speed,1-travel.progress);return;
    }
    const state=result.state??'idle';
    if(state!=='idle'&&state!=='walk'&&state!=='run'){leave();return;}
    if(phase==='loading'||phase==='approaching'){
      whistleTime+=delta;
      if(turning){
        const k=Math.min(1,whistleTime/.28);
        if(!turning.actor.isDisposed?.())turning.actor.rotation.y=turning.from+turning.by*k*k*(3-2*k);
        if(k>=1)turning=null;
      }
      const actor=player();
      if(standing&&(!actor||Math.hypot(actor.position.x-standing.x,actor.position.z-standing.z)>.15)){
        leave();return;
      }
      if(phase==='approaching'){
        const arrived=travel.update(delta);
        sounds?.run(travel.speed,.15+.85*travel.progress);
        if(!arrived)return;
        sounds?.arrive();
        phase='mounting';transferTime=0;travel=null;clip='Horse_Idle';horse.speed(1);display();
      }
      return;
    }
    if(phase==='mounting'){
      transferTime+=delta;
      if(transferTime>=MOUNT_SECONDS){
        rider.position.x=route.end.x;rider.position.z=route.end.z;
        rider.position.y=world.terrain.heightAt(route.end.x,route.end.z);
        phase='mounted';active=true;++mounts;display();tell(labels.mounted+' '+labels.controlsHint);
        afterMove({state:'idle'},0);
      }
    }else if(phase==='dismounting'){
      transferTime-=delta;
      if(transferTime<=0){
        Object.assign(rider.position,standing);releaseRider();
        phase='departing';travel=startHorseTravel(horse,departRoute,{departing:true,saddle});
        clip=departRoute.stationary?'Horse_Idle':'Horse_Gallop';display();tell(labels.dismounted);
      }
    }
  }
  // Map changes retain the scene and player. Hide the existing outdoor mount
  // until the destination has walkable terrain; the cave keeps only the intent.
  function beginTravel(destination) {
    if(travellingTo===destination)return; // retry of the same covered transition
    if(!(active||parked)||(!OUTDOORS.has(destination)&&destination!=='witch-cave')){leave();return;}
    if(destination==='witch-cave'){
      leave();parked=true;
    }else if(active){
      sounds?.stop();stopGallop();horse.root?.setEnabled(false);
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
    if(!actor||(active&&actor!==rider)||!riderAlive()||!ridingAllowed(true)){leave();return false;}
    if(!active)return mount(true,findLanding);
    if(!placeAtArrival(actor,findLanding)){leave();return false;}
    mountMap=travellingTo;travellingTo=null;parked=false;available=true;
    afterMove({state:'idle'},0);horse.root?.setEnabled(true);display();
    return true;
  }
  function updateAvailability(now) {
    if (!owned || travellingTo) return;
    now??=performance.now();
    if (horse && (world.mapId !== mountMap || (!riderAlive()&&phase!=='falling') || (rider && rider!==player()))) leave();
    // The toolbar samples availability periodically on foot. The call itself
    // rechecks input and player state immediately, including a fresh capture.
    if(!horse && checkedMap===world.mapId && now<nextOfferCheck){
      if(labels!==ridingLabels(doc))display();
      return;
    }
    checkedMap=world.mapId;nextOfferCheck=now+150;
    const value = OUTDOORS.has(world.mapId) && riderAlive() && ridingAllowed();
    if (value !== available) { available = value; display(); }
    else if (labels !== ridingLabels(doc)) display();
  }
  function afterMove(result, speed, dt=0) {
    if(travellingTo||!horse)return;
    if(!active){advanceSequence(result,dt);return;}
    if (player() !== rider || !riderAlive()) { leave(); return; }
    const yaw = rider.rotation.y - forwardYaw();
    horse.place(rider.position.x,rider.position.z,yaw);
    sounds?.run(speed);
    if(speed<.04)sounds?.idle(dt);
    const next = speed < .04 ? 'Horse_Idle' : speed > 3 ? 'Horse_Gallop' : 'Horse_Walk';
    if (clip !== next) { horse.play(next); clip = next; }
    horse.speed(clip === 'Horse_Idle' ? 1 : Math.max(.55,Math.min(1.7,speed/(clip === 'Horse_Walk'?1.7:5))));
    const strength=gallopStrength*Math.min(1,speed/6);
    trail?.update(dt,strength);
    runStrength=Math.max(0,Math.min(1,runStrength+(runHeld?1:-1)*Math.max(0,dt)/RUN_EASE_SECONDS));
    charge(yaw,speed,dt,strength);
    if(!poseObserver)fitSaddle();
  }
  // Charge contact and effects; contact runs every simulated frame.
  function charge(yaw,speed,dt,strength){
    const fx=Math.sin(yaw),fz=Math.cos(yaw),p=rider.position,y=world.terrain?.heightAt?.(p.x,p.z)??p.y??0;
    if(launchPending&&gallopRemaining>0){launchPending=false;chargeFx?.launch(p.x,y,p.z,fx,fz);}
    if(endPending){endPending=false;if(speed>2)chargeFx?.finish(p.x-fx*1.1,y,p.z-fz*1.1);}
    if(gallopRemaining>0&&gallopStrength>.25&&speed>4&&canRam()){
      const hits=ram.sweep(battle()?.encounters,p,fx,fz,struckAt);
      for(let i=0;i<hits;i++){
        rams++;
        if(i<RAM_MAX)chargeFx?.impact(struckAt[i].x,world.terrain?.heightAt?.(struckAt[i].x,struckAt[i].z)??y,struckAt[i].z);
      }
    }
    chargeFx?.update(dt,strength);
  }
  function placeSaddle(){return placeRidingSaddle(horse,saddle,contact,inverse);}
  function fitSaddle() {
    lift.rotation.z=0;
    for(const {node,rotation} of seatedBones)node.rotationQuaternion.copyFrom(rotation);
    rig.apply(1);
    if(!placeSaddle())return;
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
  }
  function drawRider(){
    if(phase==='mounted'){fitSaddle();updateReins?.();return;}
    if(transferring()){
      const t=phase==='mounting'?transferTime/MOUNT_SECONDS:transferTime/DISMOUNT_SECONDS;
      if(transfer&&saddle)transfer.apply(t,saddle,standing,fitSaddle,phase==='dismounting');
      else if(t>.5)fitSaddle();
      if(t>.18)updateReins?.();
      return;
    }
    if(saddle)placeSaddle();
    if(whistleRig&&whistleTime<.85)
      whistleRig.apply(Math.max(0,Math.min(1,whistleTime/.12,(.85-whistleTime)/.18)));
  }
  function drawMountedPose() {
    if(travellingTo)return;
    if(!diagnostics?.collecting){drawRider();return;}
    const start=diagnostics.mark();
    try{drawRider();}finally{diagnostics.measure('ridingPoseMs',start);}
  }
  function hotkey(e) {
    if (e.code !== 'KeyH' || e.repeat || e.ctrlKey || e.altKey || e.metaKey || controls.button.hidden || doc.querySelector('dialog[open]')) return;
    e.preventDefault(); void toggle();
  }
  doc.addEventListener('keydown',hotkey);
  reload();
  return { wardrobe, offer, reload, leave, dismount, playerDamaged, playerCaptured, beginTravel, finishTravel, updateAvailability, afterMove, startGallop, stopGallop, steerGallop, travelSpeed, setRunHeld, get active(){return active&&!travellingTo;},get locksRider(){return locksRider()&&!travellingTo;},
    get blocksFirstPerson(){return phase!=='on-foot'&&phase!=='departing'&&phase!=='falling';},
    inspect:()=>({state:travellingTo?'travelling':phase,mounts,gait:clip||null,...(gallopRemaining>0?{galloping:true}:{}),...(runHeld?{running:true}:{}),...(rams?{rams}:{})}),
    dispose(){leave(false);sounds?.dispose();doc.removeEventListener('keydown',hotkey);controls.dispose();}
  };
}
