import {Color3, Matrix, MeshBuilder, Vector3, VertexBuffer} from '@babylonjs/core';
import {BossEncounter} from '../boss-encounter.js';
import {readBinaryMapContainer} from '../map-container.js';
import {instantiateBossModel} from '../boss-models.js';
import {enableEnemyFade} from '../enemy-death.js';
import {attachCharacterOutlinesAsync} from '../character-outlines.js';
import {createBossPreparation,bossPreparationCancelled} from '../boss-preparation.js';
import {prepareModelShaders} from '../boss-shader-warmup.js';
import {playerDimensions} from '../player-dimensions.js';
import {shieldIntercepts} from '../player-strikes.js';
import {initializeVillageKtx2} from '../village-ktx2.js';
import {CHAPTER_MONSTER_MODELS} from './chapter-monster-models.js';
import {ChapterEnemyBrain,CHAPTER_COMBAT} from './chapter-enemy-brain.js';
import {mountEnemyWeapon} from './foe-weapons.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const sight=(world,a,b)=>!world.navigation||world.navigation.segmentClear(a,b,0,true);
const noop=()=>{};

async function loadChapterModel(scene,url,signal){
  await initializeVillageKtx2();
  const response=await fetch(url,{signal,cache:'force-cache'});
  if(!response.ok)throw new Error('몬스터 모델을 열 수 없습니다. '+response.status);
  const bytes=new Uint8Array(await response.arrayBuffer());
  if(signal.aborted)throw bossPreparationCancelled();
  return readBinaryMapContainer(scene,bytes,new URL('.',url).href,{signal,fileName:url.pathname.split('/').pop()});
}

// Keep only the palette weights and rest positions for the sole landmarks. After the
// frame renders, the same skin matrices that drew the body also place its HP bar.
const soleSamples=new WeakMap();
function readSoleSamples(body,vertices){
  const cached=soleSamples.get(body.geometry);if(cached)return cached;
  const positions=body.getVerticesData(VertexBuffer.PositionKind),joints=body.getVerticesData(VertexBuffer.MatricesIndicesKind),weights=body.getVerticesData(VertexBuffer.MatricesWeightsKind);
  if(!positions||!joints||!weights||vertices.some(i=>i>=body.getTotalVertices()))return null;
  const samples=vertices.map(index=>{
    const influences=[];
    for(let i=index*4;i<index*4+4;i++)if(weights[i]>0)influences.push({offset:joints[i]*16,weight:weights[i]});
    return {rest:Vector3.FromArray(positions,index*3),influences};
  });
  soleSamples.set(body.geometry,samples);return samples;
}
function makeSoleSampler(body,vertices){
  if(!body?.skeleton)return null;
  const samples=readSoleSamples(body,vertices);if(!samples)return null;
  const points=samples.map(()=>new Vector3()),skin=Matrix.Zero(),weighted=Matrix.Zero();
  return ()=>{
    const palette=body.skeleton.getTransformMatrices(body),world=body.getWorldMatrix();
    for(let i=0;i<samples.length;i++){
      const {rest,influences}=samples[i];skin.reset();
      for(const {offset,weight} of influences){
        Matrix.FromFloat32ArrayToRefScaled(palette,offset,weight,weighted);
        skin.addToSelf(weighted);
      }
      Vector3.TransformCoordinatesToRef(rest,skin,points[i]);
      Vector3.TransformCoordinatesToRef(points[i],world,points[i]);
    }
    return points;
  };
}

class ChapterEncounter extends BossEncounter {
  createBrain(durations){return new ChapterEnemyBrain(this.profile,durations,this.kind);}
  alignPose(){} // Fitted clips already include floor compensation at the hip.
  motionSpec(){return this.brain.move;}
  attackRange(spec){return this.profile.reach*(spec?.reach??1);}
  attackDamage(event){return event?.damage??this.profile.damage;}
  isHeavyAttack(event){return event?.heavy??!!this.profile.heavy;}
  movementPlan(player,result){
    if(this.brain.move?.step&&result.speed>0){
      // Commit the lunge to the facing chosen at wind-up; a sidestep can evade it.
      const target=this.lungeTarget??=new Vector3();
      target.copyFrom(this.actor.position);target.x+=Math.sin(this.actor.rotation.y);target.z+=Math.cos(this.actor.rotation.y);
      return {target,stopDistance:0,direct:true};
    }
    if(this.brain.returning)return {target:this.spawn,stopDistance:.10};
    return {target:player.position,stopDistance:this.brain.hasSight?this.profile.reach*.86:.15};
  }
  skillHurtCapsule(){return null;}
  hurtCapsules(){
    const node=this.nodes, height=this.model.height;
    const capsule=(a,b,r)=>({points:[node[a].getAbsolutePosition().asArray(),node[b].getAbsolutePosition().asArray()],radius:r*height});
    return [capsule('Hips','Chest',.19),capsule('Chest','Head',.16),capsule('Thigh.L','Foot.L',.105),capsule('Thigh.R','Foot.R',.105)];
  }
  damageNumberPosition(){this.damageAnchor.copyFrom(this.nodes.Chest.getAbsolutePosition());this.damageAnchor.y+=.24;return this.damageAnchor;}
  healthBarPosition(){this.healthAnchor.copyFrom(this.actor.position);this.healthAnchor.y+=this.model.height+.12;return this.healthAnchor;}
  attackContactPoints(){return [this.nodes['Hand.R'].getAbsolutePosition()];}
  attackBodyContact(event){
    const target=this.player.position, p=this.actor.position, d=distance(target,p);
    const facing=d>.01?((target.x-p.x)*Math.sin(this.actor.rotation.y)+(target.z-p.z)*Math.cos(this.actor.rotation.y))/d:1;
    return facing>(event?.facing??.50)&&Math.abs(target.y-p.y)<this.model.height*.72;
  }
  async prepareAuxiliary(job){
    if(this.model.soleVertices&&!this.healthFootprint){
      const body=this.asset.meshes.find(mesh=>mesh.name===this.kind+'-body');
      this.healthFootprint=makeSoleSampler(body,this.model.soleVertices);
    }
    if(!this.weapon&&this.kind!=='zombie'){
      this.weapon=this.mountWeapon(this.world.scene,this.asset,this.kind);
      if(!await job.wait(this.weapon.ready,'chapter-weapon'))throw new Error('몬스터 무기를 손에 부착하지 못했습니다. '+this.kind);
      const held=this.asset.transformNodes.flatMap(node=>node.name==='Hand.R'||node.name==='Hand.L'?node.getChildMeshes(false):[]).filter(mesh=>mesh.name===this.kind+'-held-weapon');
      if(held.length){
        this.world.lighting?.registerMeshes(held);
        const equipment={meshes:held};
        await attachCharacterOutlinesAsync(equipment,this.outlineProfile,job);
        enableEnemyFade(equipment);
        await prepareModelShaders(equipment,{preparation:job,shadows:this.world.shadows,keepPrograms:false});
        this.asset.meshes.push(...held);
        for(const mesh of held)this.deathVisibility.push([mesh,mesh.visibility]);
      }
    }
    if(!this.profile.missile||this.bolt)return;
    const arrow=this.profile.missile==='arrow',scene=this.world.scene;
    this.bolt=arrow?MeshBuilder.CreateCylinder('goblin-arrow',{height:.53,diameterTop:.005,diameterBottom:.052,tessellation:4},scene):
      MeshBuilder.CreateSphere('shaman-ember',{diameter:.23,segments:5},scene);
    this.bolt.isPickable=false;this.bolt.isVisible=false;this.bolt.material=this.ring.material;
    this.bolt.material.emissiveColor=arrow?new Color3(1,.69,.29):new Color3(.53,.77,.99);
    // The battle's post-separation reconciliation updates every warning ring
    // at the actor's feet. Ranged attacks indicate the locked destination.
    const update=this.warningRing.update;
    this.warningRing.update=()=>update(this.aim,arrow?.42:1.05);
    await prepareModelShaders({meshes:[this.bolt]},{preparation:job,keepPrograms:false});
  }
  ambientUpdatePeriod(player){
    const b=this.brain,p=player?.position,a=this.actor?.position;
    if(!p||!a||!b||!b.hp||b.engaged||b.returning||b.stagger||this.flying||b.mode!=='idle')return 0;
    return (a.x-p.x)**2+(a.z-p.z)**2>144&&(this.home.x-p.x)**2+(this.home.z-p.z)**2>(this.home.radius+1)**2?1:0;
  }
  update(dt,player){
    if(!this.active||this.corpseGone)return;
    const b=this.brain, p=this.actor.position, toHome=distance(this.home,player.position),toPlayer=distance(p,player.position);
    if(b.move?.guard){
      const yaw=this.actor.rotation.y;
      b.guardFacing=(player.position.x-p.x)*Math.sin(yaw)+(player.position.z-p.z)*Math.cos(yaw)>=toPlayer*.4;
    }
    if(b.hp>0){
      if(b.engaged&&toHome>this.home.radius){b.engaged=false;b.returning=true;}
      if(b.returning&&distance(p,this.spawn)<.2)b.returning=false;
      this.sightTimer-=dt;
      const target=player.position;
      if(toHome>this.home.radius){
        b.hasSight=false;this.sightPlayerX=Infinity;
      }else if(this.sightTimer<=0||Math.abs(this.sightPlayerX-target.x)+Math.abs(this.sightPlayerZ-target.z)>.55){
        // These maps test static XZ obstacles. While watching from rest the
        // ray is identical until an endpoint or the map's obstacle set moves.
        const movingOrFighting=b.engaged||b.returning||b.stagger||b.mode!=='idle';
        if(movingOrFighting||this.sightPlayerX!==target.x||this.sightPlayerZ!==target.z||
            this.sightActorX!==p.x||this.sightActorZ!==p.z||
            this.sightNavigation!==this.world.navigation||this.sightRevision!==this.world.placementRevision){
          b.hasSight=sight(this.world,p,target);
          this.sightPlayerX=target.x;this.sightPlayerZ=target.z;
          this.sightActorX=p.x;this.sightActorZ=p.z;
          this.sightNavigation=this.world.navigation;this.sightRevision=this.world.placementRevision;
        }
        this.sightTimer=.1;
      }
      if(!b.engaged&&!b.returning&&b.hasSight&&toPlayer<=this.home.combatRadius)b.engaged=true;
    }
    this.engaged=this.territoryState.engaged=b.engaged;
    if(!b.engaged&&!b.returning&&b.hp>0&&!b.stagger){
      this.pendingEvents.length=0;this.dt=dt;this.player=player;
      if(toPlayer<this.home.radius&&b.hasSight){
        const target=Math.atan2(player.position.x-p.x,player.position.z-p.z);
        this.actor.rotation.y+=Math.atan2(Math.sin(target-this.actor.rotation.y),Math.cos(target-this.actor.rotation.y))*(1-Math.exp(-3*dt));
      }
      b.update(dt,toPlayer,false);
      if(this.renderVisible!==false&&!this._ambientLogicalOnly){this.animator.transition(b.state,{clipTime:b.time,actionId:b.serial,loop:true});this.animator.update(this._ambientWake?Math.max(.2,dt):dt);}
      this.ring.isVisible=false;this.cancelShot();return;
    }
    const serial=b.serial;
    super.update(dt,player);
    if(!this.bolt||this.corpseGone)return;
    if(!b.hp){this.cancelShot();this.ring.isVisible=false;return;}
    if(b.mode==='attack'&&b.serial!==serial)this.aim.copyFrom(player.position);
    for(const event of this.pendingEvents)if(event.kind===this.profile.missile&&!this.flying)this.launch();
    this.pendingEvents.length=0;
    if(this.flying)this.advanceShot(dt,player);
    this.ring.isVisible=!!this.flying||(b.mode==='attack'&&!b.impacted&&!b.stagger);
    if(this.ring.isVisible)this.warningRing.update();
  }
  hide(){this.cancelShot();super.hide();}
  cancelShot(){
    if(this.bolt)this.bolt.isVisible=false;
    this.flying=false;this.shotHit=false;
  }
  launch(){
    this.origin.copyFrom(this.actor.position);this.origin.y+=this.model.height*.73;
    this.endpoint.copyFrom(this.aim);
    if(this.profile.missile==='arrow')this.endpoint.y+=playerDimensions(this.player).bodyAimHeight;
    else this.endpoint.y+=.08;
    if(!sight(this.world,this.origin,this.endpoint))return;
    this.bolt.position.copyFrom(this.origin);this.bolt.isVisible=true;this.flying=true;this.shotTime=0;
    this.flightSeconds=Math.max(.12,Vector3.Distance(this.origin,this.endpoint)/this.profile.velocity);
    if(this.profile.missile==='arrow'){
      this.bolt.lookAt(this.endpoint);
      this.bolt.rotate(Vector3.Right(),Math.PI/2);
    }
  }
  advanceShot(dt,player){
    const old=this.previousShot.copyFrom(this.bolt.position);
    this.shotTime+=dt;const t=Math.min(1,this.shotTime/this.flightSeconds);
    Vector3.LerpToRef(this.origin,this.endpoint,t,this.bolt.position);
    const pos=this.bolt.position,arrow=this.profile.missile==='arrow';
    if(!arrow)pos.y+=2.8*t*(1-t);
    if(!sight(this.world,old,pos)){this.cancelShot();return;}
    this.shotAim.copyFrom(player.position);this.shotAim.y+=playerDimensions(player).bodyAimHeight;
    if(arrow){
      const dx=pos.x-old.x,dy=pos.y-old.y,dz=pos.z-old.z,len=dx*dx+dy*dy+dz*dz;
      const k=len?Math.min(1,Math.max(0,((this.shotAim.x-old.x)*dx+(this.shotAim.y-old.y)*dy+(this.shotAim.z-old.z)*dz)/len)):0;
      this.shotHit=Math.hypot(old.x+dx*k-this.shotAim.x,old.z+dz*k-this.shotAim.z)<.37&&Math.abs(old.y+dy*k-this.shotAim.y)<.57;
    }else if(t===1)this.shotHit=distance(pos,player.position)<=1.05&&Math.abs(pos.y-player.position.y)<1.15;
    if(t===1||this.shotHit){this.bolt.isVisible=false;this.flying=false;}
  }
  poseAndContacts(player,action,sample,shield){
    // Dormant, distant actors have no possible blade/actor contact. The
    // parent's render, navigation and culling continue to own their transforms.
    if(!this.brain.engaged&&!this.brain.returning&&distance(this.actor.position,player.position)>4&&
       !this.gate.pending.length&&!sample?.radialAttack?.contains(this.actor.position,this.world.navigation))return 0;
    const stop=super.poseAndContacts(player,action,sample,shield);
    if(this.shotHit){
      this.shotHit=false;
      if(this.brain.hp>0&&sight(this.world,this.origin,player.position))this.receiveBossHit({
        source:this.origin,damage:this.profile.damage,action,bodyContact:true,shieldContact:shieldIntercepts(this.origin,this.shotAim,shield)
      });
    }
    return stop;
  }
}

export function createChapterEnemyFactory({world,battle,onDefeat=noop,loadModel=loadChapterModel,mountWeapon=mountEnemyWeapon,incremental=true}){
  const scene=world.scene, sources=new Map(), handles=new Set();let retired=false,next=0;
  function acquire(kind){
    let entry=sources.get(kind);
    if(!entry){
      entry={users:0,demand:0,source:null,controller:new AbortController(),materials:new Set()};
      sources.set(kind,entry);
      entry.ready=Promise.resolve().then(()=>loadModel(scene,CHAPTER_MONSTER_MODELS[kind].url,entry.controller.signal)).then(source=>{
        if(!entry.demand||retired||scene.isDisposed){source.dispose();throw bossPreparationCancelled();}
        for(const group of source.animationGroups)group.stop();
        entry.source=source;return source;
      });
    }
    entry.demand++;entry.users++;return entry;
  }
  function release(kind,entry){
    if(--entry.users)return;
    entry.controller.abort();
    if(sources.get(kind)===entry)sources.delete(kind);
    for(const material of entry.materials)material.dispose(false,false);
    entry.materials.clear();entry.source?.dispose();
  }
  async function create({kind,id='chapter-foe-'+(++next),x,z,yaw=0,home={},player,isCurrent=()=>true}){
    if(retired||!isCurrent()||scene.isDisposed)throw bossPreparationCancelled();
    const model=CHAPTER_MONSTER_MODELS[kind],profile=CHAPTER_COMBAT[kind];
    if(!model||!profile)throw new Error('Unknown chapter enemy '+kind);
    const entry=acquire(kind);let disposed=false,delivered=false,prepared=false,owned=null;
    const valid=()=>!disposed&&!retired&&world.scene===scene&&!scene.isDisposed&&isCurrent();
    const preparation=createBossPreparation({scene,isCurrent:valid,incremental});
    const enc=new ChapterEncounter(world,b=>battle.bossChanged?.(b),battle.onDamage??noop,(...args)=>battle.playerHit?.(...args),{
      combat:battle.combat,
      loadAsset:async()=>{
        const source=await entry.ready;preparation.check();
        await preparation.step('chapter-foe-clone',()=>{owned=instantiateBossModel(source);});preparation.check();
        const catalog=Object.keys(model.clips).map(name=>({name,fps:1,rootTrack:[[0,0,0]]}));
        return {asset:owned,config:{scale:1,catalog,animations:model.clips}};
      },
      onDefeat:event=>{if(valid()&&!delivered){delivered=true;onDefeat({...event,id,kind});}}
    });
    Object.assign(enc,{id,kind,outlineProfile:'goblin',developmentActor:true,minorEnemy:!profile.boss,displayName:profile.name,
      model,profile,mountWeapon,keepPreparedPrograms:false,radius:model.height*.205,separationRadius:model.height*.25,
      spawn:new Vector3(x,0,z),home:{x:home.x??x,z:home.z??z,radius:home.radius??13,combatRadius:home.combatRadius??7.2},
      territoryState:{enabled:true,engaged:false},sightTimer:0,sightPlayerX:Infinity,sightPlayerZ:Infinity,healthAnchor:new Vector3(),aim:new Vector3(x,0,z),
      origin:new Vector3(),endpoint:new Vector3(),previousShot:new Vector3(),shotAim:new Vector3()});
    function free(){
      enc.weapon?.dispose();enc.bolt?.dispose();
      enc.animator?.dispose();enc.ring?.material?.dispose();enc.ring?.dispose();
      const asset=owned??enc.asset;
      for(const mesh of asset?.meshes??[])if(mesh.material?.metadata?.moonforestMonsterToon)entry.materials.add(mesh.material);
      enc.actor?.dispose(false,false);
      for(const group of asset?.animationGroups??[])group.dispose();
      for(const node of [...(asset?.meshes??[]),...(asset?.transformNodes??[])])if(!node.isDisposed())node.dispose();
      for(const skeleton of asset?.skeletons??[])skeleton.dispose();
      release(kind,entry);
    }
    const handle={encounter:enc,dispose(){
      if(disposed)return;disposed=true;preparation.cancel();handles.delete(handle);
      const at=battle.encounters.indexOf(enc);if(at>=0)battle.encounters.splice(at,1);
      const pool=battle.developmentPool,index=pool?.indexOf(enc)??-1;if(index>=0)pool.splice(index,1);
      battle.active=battle.encounters.some(b=>b.active);
      if(enc.active)enc.hide();
      if(--entry.demand===0){if(sources.get(kind)===entry)sources.delete(kind);entry.controller.abort();}
      if(prepared)free();
    }};
    handles.add(handle);
    try{
      await enc.summon(player,{position:enc.spawn,rotationY:yaw,preparation,reuseAnimator:true});
      preparation.check();battle.encounters.push(enc);(battle.developmentPool??=[]).push(enc);battle.active=true;
      return handle;
    }catch(error){handle.dispose();throw error;}
    finally{
      prepared=true;
      if(disposed){
        // A cancellation may wake the caller before Babylon finishes adopting
        // a clone. Wait for those continuations before releasing its source.
        const pending=[enc.hiddenPreparationPending,enc.assetAcquisition].filter(Boolean);
        if(pending.length)await Promise.allSettled(pending);
        free();
      }
    }
  }
  const observer=scene.onDisposeObservable.addOnce(()=>dispose());
  function dispose(){if(retired)return;retired=true;scene.onDisposeObservable.remove(observer);for(const handle of [...handles])handle.dispose();}
  return {create,dispose};
}
