import { Color3, MeshBuilder, SceneLoader, StandardMaterial, TransformNode, Vector3, VertexBuffer } from '@babylonjs/core';
import { CharacterAnimator } from './animation.js';
import { BossBrain, BOSS_BY_NAME, BOSS_DAMAGE, bossAttackRange } from './boss-spec.js';
import { MeleeContactGate } from './melee-collision.js';
import { applyHitFlash, PlayerHitReaction, PLAYER_STAGGER, BLOCK_STAGGER } from './hit-feedback.js';

import { shieldIntercepts } from './player-strikes.js';
import { rearDamage, facingYaw } from './combat-damage.js';
import { BossGrab } from './boss-grab.js';
import { HealingPotion } from './healing-potion.js';
const capPosition=p=>{const d=Math.hypot(p.x,p.z);if(d>6.5){p.x*=6.5/d;p.z*=6.5/d;}};
function rootSample(config,name,time){
  const c=config.catalog.find(c=>c.name===name),f=Math.min(c.rootTrack.length-1,Math.max(0,time*c.fps));
  const i=Math.floor(f),j=Math.min(i+1,c.rootTrack.length-1),t=f-i;
  return c.rootTrack[i].map((v,k)=>v+(c.rootTrack[j][k]-v)*t);
}

export class BossEncounter {
  constructor(world,onChange,onDamage=()=>{},onPlayerHit=()=>{}){
    this.world=world;this.onChange=onChange;this.onDamage=onDamage;this.active=false;this.loading=false;this.gate=new MeleeContactGate();
    this.playerHp=500;this.playerMaxHp=500;this.playerInvulnerable=0;this.hitCount=0;this.heavyCount=0;
    this.potions=new HealingPotion();
    this.pendingEvents=[];this.lastRoot=null;this.knockVelocity=new Vector3();
    this.playerReaction=new PlayerHitReaction();this.bossReaction=new PlayerHitReaction();this.onPlayerHit=onPlayerHit;
    this.grab=new BossGrab(captured=>{
      this.playerReaction.cancelRecoil();this.gate.reset();this.onPlayerHit(0,{captured});
    },critical=>this.hitPlayer(BOSS_DAMAGE.Skill_02,this.actor.position,{superArmor:true,critical,grabImpact:true}));
  }
  async summon(player){
    if(this.loading)return;this.loading=true;this.onChange(this);
    this.grab.reset();
    try{
      if(!this.asset){
        const url=new URL(`${import.meta.env.BASE_URL}assets/guardian-bear.json`,location.href);
        const response=await fetch(url,{cache:'no-cache'});if(!response.ok)throw new Error('보스 설정을 불러오지 못했습니다.');
        this.config=await response.json();const model=new URL(this.config.model,url);
        this.asset=await SceneLoader.LoadAssetContainerAsync(new URL('.',model).href,model.pathname.split('/').pop(),this.world.scene,null,'.gltf');
        this.asset.addAllToScene();for(const g of this.asset.animationGroups)g.stop();
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
        this.nodes=Object.fromEntries(this.asset.transformNodes.map(n=>[n.name,n]));
        this.animator=new CharacterAnimator(this.asset.animationGroups,this.config.animations);
        this.ring=MeshBuilder.CreateTorus('boss-attack-warning',{diameter:3.8,thickness:.035,tessellation:64},this.world.scene);
        this.ring.material=new StandardMaterial('boss-warning-gold',this.world.scene);this.ring.material.emissiveColor=new Color3(.9,.32,.05);this.ring.material.disableLighting=true;this.ring.isPickable=false;
      }
      this.animator.dispose();this.animator=new CharacterAnimator(this.asset.animationGroups,this.config.animations);
      this.brain=new BossBrain(this.animator.durations);this.playerHp=this.playerMaxHp;this.playerInvulnerable=0;this.hitCount=0;this.heavyCount=0;this.gate.reset();
      this.potions.reset();
      this.playerReaction.reset();this.bossReaction.reset();applyHitFlash(this.asset.meshes,0);
      this.actor.setEnabled(true);this.actor.position.copyFrom(player.position.add(new Vector3(Math.sin(player.rotation.y)*2.8,0,Math.cos(player.rotation.y)*2.8)));
      capPosition(this.actor.position);this.actor.rotation.y=player.rotation.y+Math.PI;
      this.active=true;this.lastHit=null;this.groundHeight=.075;this.lastSerial=null;this.lastRoot=null;this.defenseFeedbackKey=null;this.knockVelocity.setAll(0);
      this.animator.transition('Block6',{clipTime:0,actionId:this.brain.serial});this.animator.update(.2);
    }catch(error){this.active=false;this.actor?.setEnabled(false);throw error;}
    finally{this.loading=false;this.onChange(this);}
  }
  hide(){this.grab.reset();this.potions.cancel();this.active=false;this.playerReaction.reset();this.bossReaction.reset();this.actor?.setEnabled(false);if(this.ring)this.ring.isVisible=false;this.gate.reset();this.onChange(this);}
  get playerAlive(){return !this.active||this.playerHp>0;}
  get canUsePotion(){return this.active&&!this.loading&&!this.grab.active&&this.potions.canUse(this.playerHp,this.playerMaxHp);}
  usePotion(){
    if(!this.canUsePotion)return false;
    this.potions.use(this.playerHp,this.playerMaxHp);this.lastHit='물약 사용 · 1초마다 40씩 4회 회복';this.onChange(this);return true;
  }
  update(dt,player){
    if(!this.active)return;
    this.dt=dt;this.player=player;this.playerInvulnerable=Math.max(0,this.playerInvulnerable-dt);
    const recovery=this.potions.update(dt,this.playerHp,this.playerMaxHp);this.playerHp=recovery.hp;
    for(const amount of recovery.heals)this.onDamage(player.position.add(new Vector3(0,1.8,0)),`+${amount}`,false,'heal');
    const direction=player.position.subtract(this.actor.position);direction.y=0;const distance=direction.length();
    const result=this.brain.update(dt,distance,this.playerAlive&&(!this.grab.active||this.grab.holding));this.pendingEvents=result.events;
    if(this.brain.mode==='evade')this.showDefense('evade');
    if(['idle','move'].includes(this.brain.mode)||this.lastSerial!==this.brain.serial){
      if(!this.grab.active&&!['down','recover'].includes(this.brain.mode)&&distance>.01)this.actor.rotation.y=Math.atan2(direction.x,direction.z);
    }
    if(result.speed&&distance>1.65)this.actor.position.addInPlace(direction.normalize().scale(Math.min(result.speed*dt,distance-1.65)));
    this.animator.transition(this.brain.state,{clipTime:this.brain.time,actionId:this.brain.serial,loop:this.brain.mode==='move',blendDuration:['down','recover'].includes(this.brain.mode)?.10:.16});
    this.animator.update(dt);
    const root=rootSample(this.config,this.brain.state,this.brain.time);
    if(this.lastSerial===this.brain.serial&&this.lastRoot&&['attack','evade'].includes(this.brain.mode)&&!this.brain.stagger){
      const x=(root[0]-this.lastRoot[0])*this.config.scale,z=(root[2]-this.lastRoot[2])*this.config.scale,yaw=this.actor.rotation.y;
      this.actor.position.x+=x*Math.cos(yaw)+z*Math.sin(yaw);this.actor.position.z+=z*Math.cos(yaw)-x*Math.sin(yaw);
    }
    this.lastRoot=root;this.lastSerial=this.brain.serial;
    if(this.brain.mode==='down')this.actor.position.addInPlace(this.knockVelocity.scale(dt));
    this.bossReaction.update(dt,this.actor);
    this.knockVelocity.scaleInPlace(Math.exp(-6*dt));capPosition(this.actor.position);
    this.ring.position.set(this.actor.position.x,.025,this.actor.position.z);
    const spec=BOSS_BY_NAME[this.brain.state];
    this.ring.isVisible=this.brain.mode==='attack'&&!this.brain.impacted&&!this.brain.stagger;
    this.ring.scaling.setAll(bossAttackRange(spec)/1.9);
    applyHitFlash(this.asset.meshes,this.brain.flash,this.brain.flashDuration);
    this.onChange(this);
  }
  poseAndContacts(player,result,sample,shield){
    if(!this.active)return;
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
    for(const n of Object.values(this.nodes))n.computeWorldMatrix(true);
    const d=player.position.subtract(this.actor.position);d.y=0;const distance=d.length();
    if(!this.grab.active&&distance<1.35&&distance>.001&&this.brain.mode!=='down'){this.actor.position.subtractInPlace(d.scale((1.35-distance)/distance));this.actor.computeWorldMatrix(true);for(const n of Object.values(this.nodes))n.computeWorldMatrix(true);}
    if(sample&&!this.grab.active&&this.playerAlive&&this.brain.hp>0){
      const pairs=[['Hips','Spine2',.48],['Neck','Head',.35],['LeftArm','LeftForeArm',.23],['LeftForeArm','LeftHand',.23],['RightArm','RightForeArm',.23],['RightForeArm','RightHand',.23],['LeftUpLeg','LeftLeg',.27],['LeftLeg','LeftFoot',.22],['RightUpLeg','RightLeg',.27],['RightLeg','RightFoot',.22]];
      const capsules=pairs.map(([a,b,r])=>({points:[a,b].map(n=>this.nodes[`mixamorig:${n}`].getAbsolutePosition().asArray()),radius:r*this.config.scale}));
      let contacts;
      if(this.brain.defense){
        // Consume this swing without starting a delayed damage burst through a block/roll.
        this.gate.pending=[];
        for(const contact of sample.contacts??[sample])if(this.gate.check({...sample,...contact,capsules})){
          if(this.showDefense(this.brain.defense,sample.actionId)&&this.brain.defense==='block')this.playerBlocked();
        }
        contacts={hits:[],hitStop:0};
      }else contacts=this.gate.collect({...sample,capsules});
      const grounded=['down','recover'].includes(this.brain.mode);
      for(const contact of contacts.hits){
        const hit={...contact,...rearDamage(contact.damage,player.position,this.actor.position,facingYaw(this.nodes,this.actor.rotation?.y||0))};
        if(!this.brain.hit(hit))continue;
        hitStop=Math.max(hitStop,contacts.hitStop);this.hitCount++;
        applyHitFlash(this.asset?.meshes,this.brain.flash,this.brain.flashDuration);
        if(hit.heavy&&!grounded){this.heavyCount++;const away=this.actor.position.subtract(player.position);away.y=0;this.knockVelocity.copyFrom(away.normalize().scale(8));}
        this.lastHit=grounded?'다운·기상 중 추가 타격':hit.heavy?'강공격 명중 · 넉백':hit.stun?'방패 명중 · 1.5초 강한 경직':'검 명중 · 경직';
        this.onDamage(this.nodes['mixamorig:Head'].getAbsolutePosition(),hit.damage,hit.heavy,'enemy',hit.burstIndex,hit.critical);this.onChange(this);
      }
    }else this.gate.previous=null;
    for(const event of this.pendingEvents){
      if(this.grab.active||this.brain.stagger||['down','recover'].includes(this.brain.mode))continue;
      if(event.disabled)continue;
      if(distance<=bossAttackRange(event)){
        const facing=distance<.01?1:(d.x*Math.sin(this.actor.rotation.y)+d.z*Math.cos(this.actor.rotation.y))/distance;
        if(event.kind==='spin'||facing>.2){
          const aim=player.position.add(new Vector3(0,1.1,0));
          const limbs=['RightHand','LeftHand','RightFoot','LeftFoot'].map(n=>this.nodes[`mixamorig:${n}`].getAbsolutePosition()).sort((a,b)=>Vector3.DistanceSquared(a,aim)-Vector3.DistanceSquared(b,aim));
          this.receiveBossHit({damage:BOSS_DAMAGE[event.name],grab:event.kind==='grab',bodyContact:true,shieldContact:shieldIntercepts(limbs[0],aim,shield),action:result});
        }
      }
    }
    this.pendingEvents=[];
    this.grab.update(this.dt,{boss:this.actor,nodes:this.nodes,serial:this.brain.serial,state:this.brain.state,clipTime:this.brain.time,
      duration:this.brain.durations[this.brain.state],interrupted:this.brain.stagger>0||this.brain.hp<=0});
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
    this.onPlayerHit(BLOCK_STAGGER,{force:true,reason:'blocked'});
    this.lastHit='전사 공격 BLOCK · 1초 경직';
  }
  receiveBossHit({damage,grab=false,bodyContact=false,shieldContact=false,action,source=this.actor?.position}){
    if(this.grab.active||!this.playerAlive||(!bodyContact&&!shieldContact))return false;
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
    }else if(grab){
      const {critical}=rearDamage(damage,source,this.player.position,facingYaw(this.playerNodes,this.player.rotation?.y||0));
      if(this.grab.start(this.player,this.playerNodes,this.brain.serial,critical)){this.lastHit='다리 잡힘 · 조작 불가';this.onChange(this);}
    }else this.hitPlayer(damage,source,{superArmor:action?.state==='judgment'&&action.actionId!=null});
    return true;
  }
  hitPlayer(damage,source,{superArmor=false,critical:fixedCritical,grabImpact=false}={}){
    if((this.playerInvulnerable&&!grabImpact)||!this.playerAlive)return;
    const critical=fixedCritical??(source?rearDamage(damage,source,this.player.position,facingYaw(this.playerNodes,this.player.rotation?.y||0)).critical:false);
    damage=Math.round(damage*(critical?1.3:1));
    this.playerHp=Math.max(0,this.playerHp-damage);this.playerInvulnerable=PLAYER_STAGGER;
    this.playerReaction.start(source?this.player.position.subtract(source):new Vector3(0,0,-1),{recoil:!superArmor});
    if(!grabImpact)this.onPlayerHit(PLAYER_STAGGER);
    this.lastHit=this.playerHp?`전사 피격 · −${damage}`:'전투 종료 · 보스를 다시 소환하세요';
    this.onDamage(this.player.position.add(new Vector3(0,1.8,0)),`−${damage}`,false,'player',0,critical);this.onChange(this);
  }
  inspect(){return {active:this.active,state:this.brain?.state,label:this.brain?.label,hp:this.brain?.hp,playerHp:this.playerHp,hits:this.hitCount,knockbacks:this.heavyCount,visited:[...(this.brain?.visited||[])]};}
}

