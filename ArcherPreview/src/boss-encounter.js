import { Color3, MeshBuilder, SceneLoader, StandardMaterial, TransformNode, Vector3, VertexBuffer } from '@babylonjs/core';
import { CharacterAnimator } from './animation.js';
import { BossBrain, BOSS_BY_NAME } from './boss-spec.js';
import { MeleeContactGate } from './melee-collision.js';
import { applyHitFlash, PlayerHitReaction, PLAYER_STAGGER } from './hit-feedback.js';

import { shieldIntercepts } from './player-strikes.js';
const capPosition=p=>{const d=Math.hypot(p.x,p.z);if(d>6.5){p.x*=6.5/d;p.z*=6.5/d;}};
function rootSample(config,name,time){
  const c=config.catalog.find(c=>c.name===name),f=Math.min(c.rootTrack.length-1,Math.max(0,time*c.fps));
  const i=Math.floor(f),j=Math.min(i+1,c.rootTrack.length-1),t=f-i;
  return c.rootTrack[i].map((v,k)=>v+(c.rootTrack[j][k]-v)*t);
}

export class BossEncounter {
  constructor(world,onChange,onDamage=()=>{},onPlayerHit=()=>{}){
    this.world=world;this.onChange=onChange;this.onDamage=onDamage;this.active=false;this.loading=false;this.gate=new MeleeContactGate();
    this.shots=[];this.playerHp=500;this.playerMaxHp=500;this.playerInvulnerable=0;this.hitCount=0;this.heavyCount=0;
    this.pendingEvents=[];this.lastRoot=null;this.knockVelocity=new Vector3();
    this.playerReaction=new PlayerHitReaction();this.onPlayerHit=onPlayerHit;
  }
  async summon(player){
    if(this.loading)return;this.loading=true;this.onChange(this);
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
      for(const shot of this.shots)shot.mesh.dispose();this.shots=[];
      this.animator.dispose();this.animator=new CharacterAnimator(this.asset.animationGroups,this.config.animations);
      this.brain=new BossBrain(this.animator.durations);this.playerHp=this.playerMaxHp;this.playerInvulnerable=0;this.hitCount=0;this.heavyCount=0;this.gate.reset();
      this.playerReaction.reset();applyHitFlash(this.asset.meshes,0);
      this.actor.setEnabled(true);this.actor.position.copyFrom(player.position.add(new Vector3(Math.sin(player.rotation.y)*2.8,0,Math.cos(player.rotation.y)*2.8)));
      capPosition(this.actor.position);this.actor.rotation.y=player.rotation.y+Math.PI;
      this.active=true;this.lastHit=null;this.groundHeight=.075;this.lastSerial=null;this.lastRoot=null;this.knockVelocity.setAll(0);
      this.animator.transition('Block6',{clipTime:0,actionId:this.brain.serial});this.animator.update(.2);
    }catch(error){this.active=false;this.actor?.setEnabled(false);throw error;}
    finally{this.loading=false;this.onChange(this);}
  }
  hide(){this.active=false;this.playerReaction.reset();this.actor?.setEnabled(false);if(this.ring)this.ring.isVisible=false;for(const s of this.shots)s.mesh.dispose();this.shots=[];this.gate.reset();this.onChange(this);}
  get playerAlive(){return !this.active||this.playerHp>0;}
  update(dt,player){
    if(!this.active)return;
    this.dt=dt;this.player=player;this.playerInvulnerable=Math.max(0,this.playerInvulnerable-dt);
    const direction=player.position.subtract(this.actor.position);direction.y=0;const distance=direction.length();
    const result=this.brain.update(dt,distance,this.playerAlive);this.pendingEvents=result.events;
    if(['idle','move'].includes(this.brain.mode)||this.lastSerial!==this.brain.serial){
      if(!['down','recover'].includes(this.brain.mode)&&distance>.01)this.actor.rotation.y=Math.atan2(direction.x,direction.z);
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
    this.knockVelocity.scaleInPlace(Math.exp(-6*dt));capPosition(this.actor.position);
    this.ring.position.set(this.actor.position.x,.025,this.actor.position.z);
    const spec=BOSS_BY_NAME[this.brain.state];
    this.ring.isVisible=this.brain.mode==='attack'&&!this.brain.impacted&&!this.brain.stagger;
    this.ring.scaling.setAll((spec.range||2.5)/1.9);
    applyHitFlash(this.asset.meshes,this.brain.flash);
    this.onChange(this);
  }
  poseAndContacts(player,result,sample,shield){
    if(!this.active)return;
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
    if(distance<1.35&&distance>.001&&this.brain.mode!=='down'){this.actor.position.subtractInPlace(d.scale((1.35-distance)/distance));this.actor.computeWorldMatrix(true);for(const n of Object.values(this.nodes))n.computeWorldMatrix(true);}
    if(sample&&this.playerAlive&&this.brain.hp>0&&this.brain.mode!=='down'){
      const pairs=[['Hips','Spine2',.48],['Neck','Head',.35],['LeftArm','LeftForeArm',.23],['LeftForeArm','LeftHand',.23],['RightArm','RightForeArm',.23],['RightForeArm','RightHand',.23],['LeftUpLeg','LeftLeg',.27],['LeftLeg','LeftFoot',.22],['RightUpLeg','RightLeg',.27],['RightLeg','RightFoot',.22]];
      const capsules=pairs.map(([a,b,r])=>({points:[a,b].map(n=>this.nodes[`mixamorig:${n}`].getAbsolutePosition().asArray()),radius:r*this.config.scale}));
      if(this.gate.check({...sample,capsules})&&this.brain.hit(sample.window)){
        const hit=sample.window;this.hitCount++;
        applyHitFlash(this.asset?.meshes,this.brain.flash);
        if(hit.heavy){this.heavyCount++;const away=this.actor.position.subtract(player.position);away.y=0;this.knockVelocity.copyFrom(away.normalize().scale(8));}
        this.lastHit=hit.heavy?'강공격 명중 · 넉백':hit.stun?'방패 명중 · 1.5초 강한 경직':'검 명중 · 경직';
        this.onDamage(this.nodes['mixamorig:Head'].getAbsolutePosition(),hit.damage,hit.heavy);this.onChange(this);
      }
    }else this.gate.previous=null;
    for(const event of this.pendingEvents){
      if(this.brain.stagger||['down','recover'].includes(this.brain.mode))continue;
      if(['rock','magic'].includes(event.kind))this.fire(event.kind,player);
      else if(distance<=event.range){
        const facing=distance<.01?1:(d.x*Math.sin(this.actor.rotation.y)+d.z*Math.cos(this.actor.rotation.y))/distance;
        if(event.kind==='spin'||facing>.2){
          const aim=player.position.add(new Vector3(0,1.1,0));
          const limbs=['RightHand','LeftHand','RightFoot','LeftFoot'].map(n=>this.nodes[`mixamorig:${n}`].getAbsolutePosition()).sort((a,b)=>Vector3.DistanceSquared(a,aim)-Vector3.DistanceSquared(b,aim));
          this.receiveBossHit({damage:14,bodyContact:true,shieldContact:shieldIntercepts(limbs[0],aim,shield),action:result});
        }
      }
    }
    this.pendingEvents=[];
    for(const shot of [...this.shots]){
      const previous=shot.mesh.position.clone();shot.mesh.position.addInPlace(shot.velocity.scale(this.dt));shot.life-=this.dt;
      const center=player.position.add(new Vector3(0,1,0));
      const line=shot.mesh.position.subtract(previous),t=Math.max(0,Math.min(1,Vector3.Dot(center.subtract(previous),line)/Math.max(1e-9,line.lengthSquared())));
      const contact=this.receiveBossHit({damage:18,bodyContact:Vector3.Distance(previous.add(line.scale(t)),center)<.55,
        shieldContact:shieldIntercepts(previous,shot.mesh.position,shield),action:result,source:previous});
      if(contact)shot.life=0;
      if(shot.life<=0){shot.mesh.dispose();this.shots.splice(this.shots.indexOf(shot),1);}
    }
  }
  fire(kind,player){
    const mesh=MeshBuilder.CreateSphere(`bear-${kind}`,{diameter:kind==='rock'?.32:.24,segments:kind==='rock'?3:10},this.world.scene);
    if(!this.shotMaterials)this.shotMaterials={};
    if(!this.shotMaterials[kind]){const m=new StandardMaterial(`bear-${kind}-material`,this.world.scene);m.diffuseColor=kind==='rock'?new Color3(.36,.24,.14):new Color3(.65,.35,.05);if(kind==='magic')m.emissiveColor=new Color3(.85,.4,.03);this.shotMaterials[kind]=m;}
    mesh.material=this.shotMaterials[kind];mesh.isPickable=false;
    mesh.position.copyFrom(this.nodes['mixamorig:RightHand'].getAbsolutePosition());
    const velocity=player.position.add(new Vector3(0,1,0)).subtract(mesh.position).normalize().scale(6);
    this.shots.push({mesh,velocity,life:3});
  }
  receiveBossHit({damage,bodyContact=false,shieldContact=false,action,source=this.actor?.position}){
    if(!this.playerAlive||(!bodyContact&&!shieldContact))return false;
    // Block throughout the shield-push cast, including its wind-up and recovery.
    // Contact is still required; distant attacks/projectiles cannot trigger a parry.
    const casting=action?.state==='shieldPush'&&action.actionId!=null;
    if(shieldContact||casting){
      this.brain.parry();this.lastHit='블록 · 보스 경직';
      applyHitFlash(this.asset?.meshes,this.brain.flash);
      this.onDamage(this.player.position.add(new Vector3(0,1.8,0)),'BLOCK',false,'block');this.onChange(this);
    }else this.hitPlayer(damage,source);
    return true;
  }
  hitPlayer(damage,source){
    if(this.playerInvulnerable||!this.playerAlive)return;
    this.playerHp=Math.max(0,this.playerHp-damage);this.playerInvulnerable=.8;
    this.playerReaction.start(source?this.player.position.subtract(source):new Vector3(0,0,-1));
    this.onPlayerHit(PLAYER_STAGGER);
    this.lastHit=this.playerHp?`전사 피격 · −${damage}`:'전투 종료 · 보스를 다시 소환하세요';
    this.onDamage(this.player.position.add(new Vector3(0,1.8,0)),`−${damage}`,false,'player');this.onChange(this);
  }
  inspect(){return {active:this.active,state:this.brain?.state,label:this.brain?.label,hp:this.brain?.hp,playerHp:this.playerHp,hits:this.hitCount,knockbacks:this.heavyCount,visited:[...(this.brain?.visited||[])]};}
}
