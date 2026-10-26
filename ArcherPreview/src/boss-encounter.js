import { Color3, SceneLoader, StandardMaterial, TransformNode, Vector3, VertexBuffer } from '@babylonjs/core';
import { CharacterAnimator } from './animation.js';
import { BossBrain, BOSS_BY_NAME, BOSS_DAMAGE, BOSS_GROUNDED_HIT_RANGE, BOSS_HEAVY_ATTACKS, bossAttackRange } from './boss-spec.js';
import { MeleeContactGate } from './melee-collision.js';
import { applyHitFlash, PlayerHitReaction, PLAYER_STAGGER, PLAYER_BLOCK_GROGGY } from './hit-feedback.js';

import { shieldIntercepts } from './player-strikes.js';
import { rearDamage, facingYaw } from './combat-damage.js';
import { BossGrab } from './boss-grab.js';
import { PlayerCombat } from './player-combat.js';
import { orderPoseNodes, refreshPoseMatrices } from './pose-matrices.js';
import { isEnemySolid, dodgeSeparation } from './enemy-collision.js';
import { armoredDamage } from './equipment-stats.js';
import { EnemyDeath } from './enemy-death.js';
import { createTerrainRing } from './terrain-mesh.js';
import { ARENA_RADIUS, ENEMY_ARENA_RADIUS, withinRenderRange } from './world-limits.js';
const capPosition=p=>{const d=Math.hypot(p.x,p.z);if(d>ENEMY_ARENA_RADIUS){p.x*=ENEMY_ARENA_RADIUS/d;p.z*=ENEMY_ARENA_RADIUS/d;}};
function rootSample(config,name,time){
  const c=config.catalog.find(c=>c.name===name),f=Math.min(c.rootTrack.length-1,Math.max(0,time*c.fps));
  const i=Math.floor(f),j=Math.min(i+1,c.rootTrack.length-1),t=f-i;
  return c.rootTrack[i].map((v,k)=>v+(c.rootTrack[j][k]-v)*t);
}

export class BossEncounter {
  constructor(world,onChange,onDamage=()=>{},onPlayerHit=()=>{},{combat,loadAsset,onDefeat=()=>{}}={}){
    this.kind='bear';this.radius=.7;this.stopDistance=1.65;this.separationRadius=.8;
    this.combat=combat??new PlayerCombat();this.ownsCombat=!combat;this.loadAsset=loadAsset;
    this.death=new EnemyDeath();this.onDefeat=onDefeat;
    this.world=world;this.onChange=onChange;this.onDamage=onDamage;this.active=false;this.loading=false;this.gate=new MeleeContactGate();
    this.hitCount=0;this.heavyCount=0;
    this.pendingEvents=[];this.lastRoot=null;this.knockVelocity=new Vector3();
    this.bossReaction=new PlayerHitReaction();this.onPlayerHit=onPlayerHit;
    this.grab=new BossGrab(captured=>{
      if(captured)this.combat.grabOwner=this;
      else if(this.combat.grabOwner===this)this.combat.grabOwner=null;
      this.playerReaction.cancelRecoil();this.gate.reset();this.onPlayerHit(0,{captured});
    },critical=>{
      // Hand off the landing to the authored knockdown clip instead of rotating
      // the whole captured actor upright during BossGrab's generic recovery.
      this.grab.reset();
      this.hitPlayer(BOSS_DAMAGE.Skill_02,this.actor.position,{superArmor:true,critical,grabImpact:true,knockdown:true,landed:true});
    },{heightAt:world.terrain?(x,z)=>world.terrain.heightAt(x,z):undefined,
      constrainLanding:(to,from)=>world.navigation?.constrain(to,from,.32,ENEMY_ARENA_RADIUS)});
  }
  async summon(player,{position,rotationY}={}){
    if(this.loading)return;this.loading=true;this.onChange(this);
    this.grab.reset();
    try{
      if(!this.asset){
        if(this.loadAsset){const loaded=await this.loadAsset();this.config=loaded.config;this.asset=loaded.asset;}
        else {
        const url=new URL(`${import.meta.env.BASE_URL}assets/guardian-bear.json`,location.href);
        const response=await fetch(url,{cache:'no-cache'});if(!response.ok)throw new Error('보스 설정을 불러오지 못했습니다.');
        this.config=await response.json();const model=new URL(this.config.model,url);
        this.asset=await SceneLoader.LoadAssetContainerAsync(new URL('.',model).href,model.pathname.split('/').pop(),this.world.scene,null,'.gltf');
        this.asset.addAllToScene();
        }
        for(const g of this.asset.animationGroups)g.stop();
        this.actor=new TransformNode('guardian-bear-world',this.world.scene);
        this.carrier=new TransformNode('guardian-bear-root-offset',this.world.scene);this.carrier.parent=this.actor;
        for(const n of new Set([...this.asset.meshes,...this.asset.transformNodes]))if(!n.parent)n.parent=this.carrier;
        this.actor.scaling.setAll(this.config.scale);
        for(const mesh of this.asset.meshes){
          if(!mesh.getTotalVertices())continue;
          mesh.isPickable=false;mesh.alwaysSelectAsActiveMesh=true;
          if(mesh.skeleton){if(mesh.isVerticesDataPresent(VertexBuffer.MatricesWeightsExtraKind))mesh.numBoneInfluencers=8;mesh.skeleton.useTextureToStoreBoneMatrices=true;}
          mesh.overlayColor=Color3.White();mesh.overlayAlpha=0;this.world.shadows.addShadowCaster(mesh,false);
        }
        this.world.lighting?.registerMeshes(this.asset.meshes);
        this.deathVisibility=this.asset.meshes.map(mesh=>[mesh,mesh.visibility]);
        this.nodes=Object.fromEntries(this.asset.transformNodes.map(n=>[n.name,n]));
        this.poseNodes=orderPoseNodes(this.asset.transformNodes);
        this.animator=new CharacterAnimator(this.asset.animationGroups,this.config.animations);
        this.warningRing=createTerrainRing(this.world.scene,this.world.terrain);this.ring=this.warningRing.mesh;
        this.ring.material=new StandardMaterial('boss-warning-gold',this.world.scene);this.ring.material.emissiveColor=new Color3(.9,.32,.05);this.ring.material.disableLighting=true;this.ring.isPickable=false;
      }
      this.animator.dispose();this.animator=new CharacterAnimator(this.asset.animationGroups,this.config.animations);
      this.brain=this.createBrain(this.animator.durations);this.hitCount=0;this.heavyCount=0;this.gate.reset();
      this.death.reset();
      for(const [mesh,visibility] of this.deathVisibility){mesh.visibility=visibility;if(mesh.getTotalVertices())this.world.shadows.addShadowCaster(mesh,false);}
      if(this.ownsCombat)this.combat.reset();
      this.bossReaction.reset();applyHitFlash(this.asset.meshes,0);
      this.actor.setEnabled(true);this.actor.position.copyFrom(position??player.position.add(new Vector3(Math.sin(player.rotation.y)*2.8,0,Math.cos(player.rotation.y)*2.8)));
      capPosition(this.actor.position);this.actor.rotation.y=rotationY??player.rotation.y+Math.PI;
      this.world.terrain?.place(this.actor.position);
      this.active=true;this.lastHit=null;this.groundHeight=.075;this.lastSerial=null;this.lastRoot=null;this.defenseFeedbackKey=null;this.knockVelocity.setAll(0);
      this.routeState={};this.dodgeContactClearance=false;
      this.animator.transition(this.brain.state,{clipTime:0,actionId:this.brain.serial});this.animator.update(.2);
    }catch(error){this.active=false;this.actor?.setEnabled(false);throw error;}
    finally{this.loading=false;this.onChange(this);}
  }
  hide(){this.grab.reset();if(this.ownsCombat){this.potions.cancel();this.playerReaction.reset();}this.active=false;this.bossReaction.reset();this.animator?.dispose();this.actor?.setEnabled(false);if(this.ring)this.ring.isVisible=false;this.pendingEvents=[];this.gate.reset();this.onChange(this);}
  resetBattle(){
    this.hide();this.playerHp=this.playerMaxHp;this.playerInvulnerable=0;this.potions.reset();
    this.pendingEvents=[];this.knockVelocity.setAll(0);this.lastHit=null;this.hitCount=0;this.heavyCount=0;
    this.onChange(this);
  }
  get playerAlive(){return !this.active||this.playerHp>0;}
  get corpseGone(){return this.death.finished;}
  updateRenderRange(camera){
    if(!this.active||this.corpseGone)return;
    // Posed skinned bounds intentionally bypass normal frustum tests. Explicit
    // range rejection skips their draws/shadows while AI and contacts continue.
    const visible=withinRenderRange(camera,this.actor.position,3);
    if(visible===this.renderVisible)return;
    this.renderVisible=visible;
    for(const mesh of this.asset.meshes)if(mesh.getTotalVertices())mesh.isVisible=visible;
  }
  updateDeath(dt){
    if(this.death.advance(dt)){
      this.grab.reset();this.gate.reset();
      this.onDefeat({kind:this.kind,position:this.actor.position.clone()});
      for(const [mesh] of this.deathVisibility)this.world.shadows.removeShadowCaster?.(mesh,false);
    }
    // Visibility is per mesh, so living enemies sharing this material do not fade.
    for(const [mesh,visibility] of this.deathVisibility)mesh.visibility=visibility*this.death.opacity;
    if(this.corpseGone){this.actor.setEnabled(false);this.ring.isVisible=false;this.pendingEvents=[];this.animator.dispose();this.onChange(this);}
  }
  createBrain(durations){return new BossBrain(durations);}
  motionSpec(name){return BOSS_BY_NAME[name];}
  attackRange(spec){return bossAttackRange(spec);}
  attackDamage(event){return BOSS_DAMAGE[event.name];}
  isHeavyAttack(event){return BOSS_HEAVY_ATTACKS.has(event.name);}
  hurtCapsules(){
    const pairs=[['Hips','Spine2',.48],['Neck','Head',.35],['LeftArm','LeftForeArm',.23],['LeftForeArm','LeftHand',.23],['RightArm','RightForeArm',.23],['RightForeArm','RightHand',.23],['LeftUpLeg','LeftLeg',.27],['LeftLeg','LeftFoot',.22],['RightUpLeg','RightLeg',.27],['RightLeg','RightFoot',.22]];
    return pairs.map(([a,b,r])=>({points:[a,b].map(n=>this.nodes[`mixamorig:${n}`].getAbsolutePosition().asArray()),radius:r*this.config.scale}));
  }
  get playerHp(){return this.combat.hp;} set playerHp(value){this.combat.hp=value;}
  get playerMaxHp(){return this.combat.maxHp;} set playerMaxHp(value){this.combat.maxHp=value;}
  get playerInvulnerable(){return this.combat.invulnerable;} set playerInvulnerable(value){this.combat.invulnerable=value;}
  get playerReaction(){return this.combat.reaction;}
  get potions(){return this.combat.potions;}
  get playerNodes(){return this.combat.nodes;} set playerNodes(value){this.combat.nodes=value;}
  get canUsePotion(){return this.active&&!this.loading&&!this.grab.active&&!this.combat.grabOwner&&this.potions.canUse(this.playerHp,this.playerMaxHp);}
  usePotion(){
    if(!this.canUsePotion)return false;
    this.potions.use(this.playerHp,this.playerMaxHp);this.lastHit='물약 사용 · 1초마다 40씩 4회 회복';this.onChange(this);return true;
  }
  update(dt,player){
    if(!this.active||this.corpseGone)return;
    if(this.brain.hp<=0){this.updateDeath(dt);if(this.corpseGone)return;}
    this.dt=dt;this.player=player;
    const beforeMove=this.actor.position.clone(),navigation=this.world.navigation;
    if(this.ownsCombat)this.combat.update(dt,player,this.onDamage);
    const direction=player.position.subtract(this.actor.position);direction.y=0;const distance=direction.length();
    const canTravel=this.brain.hp>0&&!['down','recover','dead'].includes(this.brain.mode)&&!this.combat.grabOwner;
    const waypoint=canTravel?navigation?.steer(this.actor.position,player.position,this.radius,this.routeState??={},dt):null;
    const travel=waypoint?new Vector3(waypoint.x-this.actor.position.x,0,waypoint.z-this.actor.position.z):direction.clone();
    const blocked=navigation&&!navigation.segmentClear(this.actor.position,player.position,0,true);
    const available=!this.combat.grabOwner||this.combat.grabOwner===this;
    const result=this.brain.update(dt,blocked?Math.max(3.8,distance):distance,this.playerAlive&&available&&(!this.grab.active||this.grab.holding));this.pendingEvents=result.events;
    if(this.brain.mode==='evade')this.showDefense('evade');
    if(['idle','move','approach'].includes(this.brain.mode)||this.lastSerial!==this.brain.serial){
      if(!this.grab.active&&!['down','recover'].includes(this.brain.mode)&&distance>.01){const facing=['move','approach'].includes(this.brain.mode)?travel:direction;this.actor.rotation.y=Math.atan2(facing.x,facing.z);}
    }
    if(result.speed&&distance>this.stopDistance&&travel.lengthSquared()>.0001)this.actor.position.addInPlace(travel.normalize().scale(Math.min(result.speed*dt,distance-this.stopDistance)));
    this.animator.transition(this.brain.state,{clipTime:this.brain.time,actionId:this.brain.serial,loop:['move','approach'].includes(this.brain.mode),blendDuration:['down','recover'].includes(this.brain.mode)?.10:.16});
    this.animator.update(dt);
    const root=rootSample(this.config,this.brain.state,this.brain.time);
    if(this.lastSerial===this.brain.serial&&this.lastRoot&&['attack','evade'].includes(this.brain.mode)&&!this.brain.stagger){
      const x=(root[0]-this.lastRoot[0])*this.config.scale,z=(root[2]-this.lastRoot[2])*this.config.scale,yaw=this.actor.rotation.y;
      this.actor.position.x+=x*Math.cos(yaw)+z*Math.sin(yaw);this.actor.position.z+=z*Math.cos(yaw)-x*Math.sin(yaw);
    }
    this.lastRoot=root;this.lastSerial=this.brain.serial;
    if(this.brain.mode==='down')this.actor.position.addInPlace(this.knockVelocity.scale(dt));
    this.bossReaction.update(dt,this.actor);
    this.knockVelocity.scaleInPlace(Math.exp(-6*dt));
    if(navigation)navigation.constrain(this.actor.position,beforeMove,this.radius,ENEMY_ARENA_RADIUS);else capPosition(this.actor.position);
    this.world.terrain?.place(this.actor.position);
    const spec=this.motionSpec(this.brain.state);
    this.ring.isVisible=this.brain.mode==='attack'&&!this.brain.impacted&&!this.brain.stagger;
    this.warningRing.update(this.actor.position,this.attackRange(spec));
    applyHitFlash(this.asset.meshes,this.brain.flash,this.brain.flashDuration);
    this.onChange(this);
  }
  poseAndContacts(player,result,sample,shield){
    if(!this.active||this.corpseGone)return;
    let hitStop=0;
    this.player=player;
    // Keep source skeletal animation untouched. Separate planar root travel from the
    // encounter's position so clip transitions/loop boundaries never teleport the boss.
    this.carrier.position.setAll(0);this.actor.computeWorldMatrix(true);this.carrier.computeWorldMatrix(true);
    const hip=this.nodes['mixamorig:Hips'];hip.computeWorldMatrix(true);
    const relative=Vector3.TransformCoordinates(hip.getAbsolutePosition(),this.actor.getWorldMatrix().clone().invert());
    const clip=this.config.catalog.find(c=>c.name===this.brain.state),ground=clip.groundTrack;
    const f=Math.min((ground?.length||1)-1,this.brain.time*30),i=Math.floor(f);
    const level=ground?ground[i]+(ground[Math.min(i+1,ground.length-1)]-ground[i])*(f-i):.075;
    this.groundHeight=level>this.groundHeight?level:this.groundHeight+(level-this.groundHeight)*(1-Math.exp(-18*this.dt));
    this.carrier.position.set(-relative.x,this.groundHeight,-relative.z);this.carrier.computeWorldMatrix(true);
    // Refresh once after both root corrections, before contacts consume the pose.
    const d=player.position.subtract(this.actor.position);d.y=0;const distance=d.length();
    // Retain the narrower clearance until this pair has separated naturally.
    // Otherwise the first upright frame would push the enemy out of the gap
    // the player just rolled through.
    if(result.state==='dodge'||result.rollFrom!=null)this.dodgeContactClearance=true;
    else if(distance>=this.radius+.65)this.dodgeContactClearance=false;
    const separation=this.dodgeContactClearance?dodgeSeparation(this):this.radius+.65;
    if(result.state!=='dodge'&&result.rollFrom==null&&!this.grab.active&&distance<separation&&distance>.001&&isEnemySolid(this)){const previous=this.actor.position.clone();this.actor.position.subtractInPlace(d.scale((separation-distance)/distance));this.world.navigation?.constrain(this.actor.position,previous,this.radius,ENEMY_ARENA_RADIUS);this.world.terrain?.place(this.actor.position);this.actor.computeWorldMatrix();}
    this.poseNodes??=orderPoseNodes(Object.values(this.nodes));
    refreshPoseMatrices(this.poseNodes);
    const clearSight=!this.world.navigation||this.world.navigation.segmentClear(player.position,this.actor.position,0,true);
    if(sample&&clearSight&&!this.grab.active&&this.playerAlive&&this.brain.hp>0){
      const capsules=this.hurtCapsules();
      const grounded=['down','recover'].includes(this.brain.mode);
      // Downed/recovering bosses are always vulnerable within melee range, even
      // when an upright sword swing passes above the lying skeleton. The gate
      // still enforces strike windows, per-swing deduplication and burst timing.
      const rangeContact=grounded&&distance<=BOSS_GROUNDED_HIT_RANGE;
      let contacts;
      if(this.brain.defense){
        // Consume this swing without starting a delayed damage burst through a block/roll.
        this.gate.pending=[];
        for(const contact of sample.contacts??[sample])if(this.gate.check({...sample,...contact,capsules})){
          if(this.showDefense(this.brain.defense,sample.actionId)&&this.brain.defense==='block')this.playerBlocked();
        }
        contacts={hits:[],hitStop:0};
      }else contacts=this.gate.collect({...sample,capsules,rangeContact});
      for(const contact of contacts.hits){
        const hit={...contact,...rearDamage(contact.damage,player.position,this.actor.position,facingYaw(this.nodes,this.actor.rotation?.y||0))};
        if(!this.brain.hit(hit))continue;
        hitStop=Math.max(hitStop,contacts.hitStop);this.hitCount++;
        applyHitFlash(this.asset?.meshes,this.brain.flash,this.brain.flashDuration);
        if(hit.heavy&&!grounded){this.heavyCount++;const away=this.actor.position.subtract(player.position);away.y=0;this.knockVelocity.copyFrom(away.normalize().scale(8));}
        this.lastHit=grounded?'다운·기상 중 추가 타격':hit.heavy?'강공격 명중 · 넉백':hit.stun?`방패 명중 · ${this.brain.stagger}초 강한 경직`:this.brain.stagger?'검 명중 · 경직':'검 명중 · 보스 기술 유지';
        this.onDamage(this.nodes['mixamorig:Head'].getAbsolutePosition(),hit.damage,hit.heavy,'enemy',hit.burstIndex,hit.critical);this.onChange(this);
      }
    }else this.gate.previous=null;
    for(const event of this.pendingEvents){
      if(this.grab.active||this.brain.stagger||this.brain.hp<=0||['down','recover'].includes(this.brain.mode))continue;
      if(event.disabled)continue;
      if(clearSight&&distance<=this.attackRange(event)){
        const facing=distance<.01?1:(d.x*Math.sin(this.actor.rotation.y)+d.z*Math.cos(this.actor.rotation.y))/distance;
        if(event.kind==='spin'||event.kind==='grab'||facing>.2){
          const aim=player.position.add(new Vector3(0,1.1,0));
          const limbs=['RightHand','LeftHand','RightFoot','LeftFoot'].map(n=>this.nodes[`mixamorig:${n}`].getAbsolutePosition()).sort((a,b)=>Vector3.DistanceSquared(a,aim)-Vector3.DistanceSquared(b,aim));
          this.receiveBossHit({damage:this.attackDamage(event),grab:event.kind==='grab',heavy:this.isHeavyAttack(event),bodyContact:true,shieldContact:shieldIntercepts(limbs[0],aim,shield),action:result});
        }
      }
    }
    this.pendingEvents=[];
    const beforeGrab=player.position.clone();
    this.grab.update(this.dt,{boss:this.actor,nodes:this.nodes,serial:this.brain.serial,state:this.brain.state,clipTime:this.brain.time,
      duration:this.brain.durations[this.brain.state],interrupted:this.brain.stagger>0||this.brain.hp<=0});
    if(!player.position.equals(beforeGrab))this.world.navigation?.constrain(player.position,beforeGrab,.32,ARENA_RADIUS);
    if(!this.combat.grabOwner){this.world.terrain?.place(player.position);player.computeWorldMatrix(true);}
    return hitStop;
  }
  showDefense(kind,actionId){
    const key=kind==='evade'?`evade:${this.brain.serial}`:`block:${this.brain.serial}:${actionId}`;
    if(this.defenseFeedbackKey===key)return false;
    this.defenseFeedbackKey=key;this.lastHit=kind==='evade'?'보스 회피':'보스 BLOCK';
    this.onDamage(this.nodes['mixamorig:Head'].getAbsolutePosition(),kind==='evade'?'Dodge':'BLOCK',false,kind);
    this.onChange(this);
    return true;
  }
  playerBlocked(){
    this.gate.pending=[];
    this.playerReaction.start(this.player.position.subtract(this.actor.position),{flashDuration:.45});
    const duration=this.kind==='goblin'?.5:PLAYER_BLOCK_GROGGY;
    this.onPlayerHit(duration,{force:true,reason:'blocked'});
    this.lastHit=`전사 공격 BLOCK · ${duration}초 그로기`;
  }
  receiveBossHit({damage,grab=false,heavy=false,bodyContact=false,shieldContact=false,action,source=this.actor?.position}){
    if(this.grab.active||(this.combat.grabOwner&&this.combat.grabOwner!==this)||!this.playerAlive||(!bodyContact&&!shieldContact))return false;
    // A grab checks range at its cast frame. Neither a dodge nor a shield can
    // block it; moving outside the capture radius is the way to escape.
    if(grab){
      if(!bodyContact)return false;
      const {critical}=rearDamage(damage,source,this.player.position,facingYaw(this.playerNodes,this.player.rotation?.y||0));
      if(this.grab.start(this.player,this.playerNodes,this.brain.serial,critical)){this.lastHit='다리 잡힘 · 조작 불가';this.onChange(this);return true;}
      return false;
    }
    if(action?.state==='dodge'&&action.actionId!=null){
      this.onDamage(this.player.position.add(new Vector3(0,1.8,0)),'Dodge',false,'evade');return false;
    }
    // Block throughout the shield-push cast, including its wind-up and recovery.
    // Contact is still required; distant attacks cannot trigger a parry.
    const casting=action?.state==='shieldPush'&&action.actionId!=null;
    if(shieldContact||casting){
      this.brain.parry();this.lastHit='블록 · 보스 1초 경직';
      if(this.actor)this.bossReaction.start(this.actor.position.subtract(this.player.position),{flashDuration:.45});
      applyHitFlash(this.asset?.meshes,this.brain.flash,this.brain.flashDuration);
      this.onDamage(this.player.position.add(new Vector3(0,1.8,0)),'BLOCK',false,'block');this.onChange(this);
    }else this.hitPlayer(damage,source,{superArmor:action?.state==='judgment'&&action.actionId!=null,knockdown:heavy});
    return true;
  }
  hitPlayer(damage,source,{superArmor=false,critical:fixedCritical,grabImpact=false,knockdown=false,landed=false}={}){
    if((this.playerInvulnerable&&!grabImpact)||!this.playerAlive)return;
    const critical=fixedCritical??(source?rearDamage(damage,source,this.player.position,facingYaw(this.playerNodes,this.player.rotation?.y||0)).critical:false);
    damage=armoredDamage(damage*(critical?1.3:1),this.combat.defense);
    this.playerHp=Math.max(0,this.playerHp-damage);this.playerInvulnerable=PLAYER_STAGGER;
    this.playerReaction.start(source?this.player.position.subtract(source):new Vector3(0,0,-1),{recoil:!landed&&(!superArmor||knockdown)});
    if(knockdown)this.onPlayerHit(PLAYER_STAGGER,{knockdown:true,landed});
    else if(!grabImpact)this.onPlayerHit(PLAYER_STAGGER);
    this.lastHit=this.playerHp?`전사 피격 · −${damage}`:'전투 종료 · 보스를 다시 소환하세요';
    this.onDamage(this.player.position.add(new Vector3(0,1.8,0)),`−${damage}`,false,'player',0,critical);this.onChange(this);
  }
  inspect(){return {id:this.id,kind:this.kind,active:this.active,state:this.brain?.state,label:this.brain?.label,hp:this.brain?.hp,playerHp:this.playerHp,hits:this.hitCount,knockbacks:this.heavyCount,position:this.actor?.position.asArray(),clips:this.asset?.animationGroups.length,visited:[...(this.brain?.visited||[])]};}
}

