import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {FreeCamera,NullEngine,Scene,TransformNode,Vector3} from '@babylonjs/core';
import '@babylonjs/loaders/glTF/index.js';
import {parseHTML} from 'linkedom';
import {BossHealthBars} from '../src/boss-health-bar.js';
import {ScreenProjection} from '../src/screen-projection.js';
import {PlayerCombat} from '../src/player-combat.js';
import {caveFogFallback} from '../src/cave-fog-binding.js';
import {isRuntimeOutline} from '../src/character-outlines.js';
import {setSceneCharacterStyles} from '../src/character-style.js';
import {CHARACTER_STYLE_DEFAULTS} from '../src/character-style-settings.js';
import {readBinaryMapContainer} from '../src/map-container.js';
import {acquireFoeWeapon,mountEnemyWeapon} from '../src/v03/foe-weapons.js';
import {CHAPTER_MONSTER_MODELS} from '../src/v03/chapter-monster-models.js';
import {CHAPTER_COMBAT,ChapterEnemyBrain} from '../src/v03/chapter-enemy-brain.js';
import {createChapterEnemyFactory} from '../src/v03/chapter-enemy-encounter.js';

const clips={idle:1,walk:1,hit:1,death:3.5,attack:2};
test('all six chapter rigs telegraph before one contact and can be interrupted',()=>{
  assert.deepEqual(Object.keys(CHAPTER_COMBAT).sort(),Object.keys(CHAPTER_MONSTER_MODELS).sort());
  for(const profile of Object.values(CHAPTER_COMBAT)){
    const brain=new ChapterEnemyBrain(profile,clips);brain.engaged=true;brain.hasSight=true;
    brain.update(.36,1);assert.equal(brain.mode,'attack');
    assert.deepEqual(brain.update(profile.windup-.02,1).events,[]);
    assert.equal(brain.update(.03,1).events.length,1);
    assert.deepEqual(brain.update(.03,1).events,[]);
    brain.hit({damage:1,heavy:true});assert.equal(brain.mode,'hit');
    brain.hit({damage:1000});assert.equal(brain.mode,'dead');
    assert.equal(brain.hit({damage:1}),false);
  }
});

async function readRig(scene,url){
  // NullEngine has no browser image codec. Retain real skinned meshes, clips,
  // skeletons and binary accessors; strip texture references in memory only.
  const raw=await fs.readFile(url), jsonLength=raw.readUInt32LE(12), doc=JSON.parse(raw.subarray(20,20+jsonLength));
  delete doc.textures;delete doc.images;delete doc.extensionsUsed;delete doc.extensionsRequired;
  for(const mat of doc.materials??[])if(mat.pbrMetallicRoughness)delete mat.pbrMetallicRoughness.baseColorTexture;
  const json=Buffer.from(JSON.stringify(doc)), padded=Math.ceil(json.length/4)*4;
  const bytes=Buffer.alloc(20+padded+raw.length-20-jsonLength,32);
  raw.copy(bytes,0,0,20);bytes.writeUInt32LE(bytes.length,8);bytes.writeUInt32LE(padded,12);
  json.copy(bytes,20);raw.copy(bytes,20+padded,20+jsonLength);
  return readBinaryMapContainer(scene,new Uint8Array(bytes),new URL('.',url).href,{fileName:url.pathname.split('/').pop()});
}
test('repeated GLB disposal releases the scene hook owned by every enemy container',async()=>{
  const engine=new NullEngine(),scene=new Scene(engine),url=CHAPTER_MONSTER_MODELS.zombie.url;
  const count=()=>scene.onDisposeObservable.observers.filter(o=>!o._willBeUnregistered).length;
  try{
    const prepare=async()=>{const source=await readRig(scene,url);source.dispose();await new Promise(r=>setTimeout(r,0));};
    await prepare();const settled=count();await prepare();await prepare();
    assert.equal(count(),settled);assert.equal(scene.meshes.length,0);
  }finally{scene.dispose();engine.dispose();}
});
function fixture(extra={}){
  const engine=new NullEngine(),scene=new Scene(engine);
  scene.useRightHandedSystem=true;
  // The real engine uploads the shared 1x1 inactive fog sampler. NullEngine has no GPU upload.
  caveFogFallback(scene).getInternalTexture().isReady=true;
  scene.activeCamera=new FreeCamera('camera',new Vector3(0,2,3),scene);
  const player=new TransformNode('player',scene); player.position.set(0,0,4);
  const world={scene,mapId:'monster-forest',shadows:{addShadowCaster(){},removeShadowCaster(){}}};
  const battle={combat:new PlayerCombat(),encounters:[],bossChanged(){}};battle.combat.reset();
  let loads=0;const kills=[];
  const factory=createChapterEnemyFactory({world,battle,incremental:false,onDefeat:event=>kills.push(event),
    loadModel:(...args)=>{loads++;return readRig(...args);},mountWeapon:(scene,owner,kind)=>mountEnemyWeapon(scene,owner,kind,(scene,id)=>acquireFoeWeapon(scene,id,readRig)),...extra});
  const params=(kind,id,x=0)=>({kind,id,x,z:0,player,home:{x:0,z:0,radius:13,combatRadius:7.2}});
  return {scene,world,battle,player,kills,params,factory,get loads(){return loads;},dispose(){factory.dispose();scene.dispose();engine.dispose();}};
}
test('real chapter GLB clones share a source and release bones, materials and groups with last actor',async()=>{
  const f=fixture();
  try{
    const order=f.params('goblin-warrior','guard-a');
    const [a,b]=await Promise.all([f.factory.create(order),f.factory.create({...order,id:'guard-b',x:2})]);
    assert.equal(f.loads,1);assert.equal(f.battle.encounters.length,2);
    assert.notEqual(a.encounter.asset.skeletons[0],b.encounter.asset.skeletons[0]);
    assert.notEqual(a.encounter.nodes.Head,b.encounter.nodes.Head);
    assert.equal(a.encounter.hurtCapsules().length,4);
    const held=a.encounter.asset.meshes.find(m=>m.name==='goblin-warrior-held-weapon');
    assert.equal(held.parent.parent,a.encounter.nodes['Hand.R']);
    a.encounter.update(.1,f.player);a.encounter.poseAndContacts(f.player,{state:'idle'},null,null);
    assert.equal(a.encounter.engaged,true);
    for(const point of a.encounter.hurtCapsules().flatMap(c=>c.points).flat())assert.ok(Number.isFinite(point));
    f.player.position.z=18;a.encounter.update(.1,f.player);assert.equal(a.encounter.engaged,false);
    a.encounter.brain.hit({damage:999});a.encounter.update(.02,f.player);a.encounter.update(.02,f.player);
    assert.equal(f.kills.length,1);assert.equal(f.kills[0].id,'guard-a');
    a.dispose();assert.equal(f.battle.encounters.length,1);assert.ok(f.scene.skeletons.length>0);
    b.dispose();assert.equal(f.scene.skeletons.length,0);assert.equal(f.scene.animationGroups.length,0);
    assert.equal(f.battle.active,false);assert.equal(f.scene.meshes.length,0);
  }finally{f.dispose();}
});
test('six chapter foes submit body and held equipment silhouettes under the monster outline setting',async t=>{
  const f=fixture();t.after(()=>f.dispose());
  f.scene.activeCamera.position.set(0,1.1,3);
  f.scene.activeCamera.setTarget(new Vector3(0,.9,0));
  let sharedInk;
  for(const kind of Object.keys(CHAPTER_MONSTER_MODELS)){
    const handle=await f.factory.create(f.params(kind,kind)),foe=handle.encounter;
    const shells=foe.asset.meshes.filter(isRuntimeOutline);
    assert.deepEqual(shells.map(mesh=>mesh.parent.name).sort(),kind==='zombie'?[kind+'-body']:[kind+'-body',kind+'-held-weapon']);
    const drawn=new Set();
    for(const mesh of shells){
      sharedInk??=mesh.material;
      assert.equal(mesh.material,sharedInk);
      assert.equal(mesh.metadata.characterStyleGroup,'boss');assert.equal(mesh.metadata.outlineWidth,.004);
      assert.equal(mesh.material.stencil.funcRef,2);assert.equal(mesh.parent.material.stencil.funcRef,2);
      assert.equal(mesh.skeleton,mesh.parent.skeleton);
      assert.equal(mesh.material._getEffectiveOrientation(mesh),1,'matches the counterclockwise glTF exterior');
      assert.equal(mesh.parent.material._getEffectiveOrientation(mesh.parent),1);
      assert.equal(mesh.getVertexBuffer('position'),mesh.parent.getVertexBuffer('position'));
      assert.ok(foe.deathVisibility.some(([part])=>part===mesh));
      mesh.onBeforeDrawObservable.add(()=>drawn.add(mesh));
    }
    for(const outline of [true,false,true]){
      setSceneCharacterStyles(f.scene,{...CHARACTER_STYLE_DEFAULTS,boss:{...CHARACTER_STYLE_DEFAULTS.boss,outline}});
      drawn.clear();f.scene.render();
      assert.equal(drawn.size,outline?shells.length:0,kind+' outline submission');
    }
    foe.brain.hit({damage:9999});foe.update(.15,f.player);
    for(const mesh of shells){assert.ok(mesh.visibility<1);assert.equal(mesh.visibility,mesh.parent.visibility);}
    handle.dispose();assert.equal(f.scene.meshes.length,0);
  }
});
test('chapter goblin HP follows the skinned footwear in combat and through defeat',async t=>{
  const f=fixture();t.after(()=>f.dispose());
  const {document}=parseHTML('<main><section class="boss-hud"><span class="sr-only"></span><progress></progress><span></span></section></main>');
  const bars=new BossHealthBars(document.querySelector('section'),{underFeet:true}),projection=new ScreenProjection(f.scene);
  for(const kind of ['goblin-warrior','goblin-archer','goblin-shaman']){
    const handle=await f.factory.create(f.params(kind,kind,1)),foe=handle.encounter;
    const body=foe.asset.meshes.find(mesh=>mesh.name===kind+'-body');
    const weights=body.getVerticesData('matricesWeights'),joints=body.getVerticesData('matricesIndices');
    const footBones=new Set(body.skeleton.bones.filter(b=>/^(Foot|Toe)\./.test(b.name)).map(b=>b.getIndex()));
    const indices=[];
    for(let i=0;i<body.getTotalVertices();i++){
      let largest=i*4;
      for(let j=largest+1;j<i*4+4;j++)if(weights[j]>weights[largest])largest=j;
      if(footBones.has(joints[largest]))indices.push(i);
    }
    assert.ok(indices.length>foe.model.soleVertices.length);assert.ok(foe.model.soleVertices.every(i=>indices.includes(i)));
    const points=foe.healthFootprint();assert.equal(foe.healthFootprint(),points,'the actor reuses its sole points');
    const checkPose=()=>{
      for(const [az,width,height] of [[0,1920,1080],[.8,780,360],[1.6,1920,1080],[2.4,780,360],[3.14,1920,1080]]){
        f.scene.activeCamera.position.set(1+Math.sin(az)*5,2,Math.cos(az)*5);
        f.scene.activeCamera.setTarget(foe.actor.position.add(new Vector3(0,.8,0)));
        projection.resize(width,height);f.scene.render();projection.beginFrame();
        bars.update(f.scene,[foe],projection);
        const el=bars.items.get(foe.id).element;
        assert.equal(el.hidden,false);assert.equal(el.dataset.kind,'monster');assert.equal(el.dataset.hud,'world');
        // Independent reference from every rendered vertex dominated by either foot or toe.
        const posed=body.getPositionData(true,true),matrix=body.getWorldMatrix();
        let left=Infinity,right=-Infinity,bottom=-Infinity;
        for(const index of indices){
          const point=projection.project(Vector3.TransformCoordinates(Vector3.FromArray(posed,index*3),matrix));
          left=Math.min(left,point.x);right=Math.max(right,point.x);bottom=Math.max(bottom,point.y);
        }
        const [,x,y]=el.style.transform.match(/translate3d\(([^p]+)px,([^p]+)px/);
        assert.ok(Math.abs(+x-(left+right)/2)<5*width/1920,kind+' centred on both feet');
        assert.ok(Math.abs(+y-bottom-4)<5*height/1080,kind+' just below the soles');
      }
    };
    foe.update(.05,f.player);checkPose();
    foe.brain.hit({damage:999});for(let i=0;i<26;i++)foe.update(.04,f.player);
    assert.equal(foe.brain.hp,0);checkPose();
    foe.fogVisible=false;bars.update(f.scene,[foe],projection);assert.equal(bars.items.get(foe.id).element.hidden,true);
    handle.dispose();bars.update(f.scene,f.battle.encounters,projection);assert.equal(bars.items.size,0);
  }
});
test('a stationary sentry reuses its sight until either endpoint or the map obstacles change', async () => {
  const f = fixture();
  try {
    const {encounter: sentry} = await f.factory.create(f.params('goblin-warrior', 'watch'));
    f.player.position.z = 10;
    let checks = 0, clear = true;
    const navigation = {segmentClear() { checks++; return clear; }};
    f.world.navigation = navigation;
    const frames = count => { for (let i = 0; i < count; i++) sentry.update(1/60, f.player); };

    frames(600);
    assert.equal(checks, 1, 'unchanged sentry and player in the watch area');
    assert.equal(sentry.brain.hasSight, true);
    f.player.position.x += .01;
    frames(7);
    assert.equal(checks, 2, 'sub-step movement is visible at the original sample cadence');
    sentry.actor.position.x += .01;
    frames(7);
    assert.equal(checks, 3);
    clear = false;
    f.world.placementRevision = 1;
    frames(7);
    assert.equal(sentry.brain.hasSight, false);
    assert.equal(checks, 4);
    f.world.navigation = {...navigation};
    clear = true;
    frames(7);
    assert.equal(checks, 5);
    f.player.position.z = 16;
    frames(7);
    assert.equal(sentry.brain.hasSight, false);
    f.player.position.z = 10;
    frames(7);
    assert.equal(sentry.brain.hasSight, true);
    assert.equal(checks, 6);
  } finally { f.dispose(); }
});

test('archer arrow misses a moving target and hits a stationary target; caster uses its marked ground point',async()=>{
  const f=fixture();
  try{
    for(const kind of ['goblin-archer','goblin-shaman']){
      f.player.position.set(0,0,4);
      const handle=await f.factory.create(f.params(kind,kind)),enc=handle.encounter;
      const advance=()=>{enc.update(.05,f.player);enc.poseAndContacts(f.player,{state:'idle'},null,null);};
      for(let i=0;i<70&&!enc.flying;i++)advance();
      assert.equal(enc.flying,true);const hp=f.battle.combat.hp;
      f.player.position.x=3;
      for(let i=0;i<24;i++)advance();
      assert.equal(f.battle.combat.hp,hp);
      f.player.position.x=0;
      for(let i=0;i<150&&f.battle.combat.hp===hp;i++)advance();
      assert.ok(f.battle.combat.hp<hp);
      handle.dispose();f.battle.combat.reset();
    }
  }finally{f.dispose();}
});
test('melee contact obeys dodge, block direction and map line of sight',async()=>{
  const f=fixture();
  try{
    const {encounter:enc}=await f.factory.create(f.params('ghoul-warrior','sentry'));
    f.player.position.z=1;
    const advance=(action={state:'idle'})=>{enc.update(.05,f.player);enc.poseAndContacts(f.player,action,null,null);};
    const hp=f.battle.combat.hp;
    for(let i=0;i<60;i++)advance({state:'dodge',actionId:2});
    assert.equal(f.battle.combat.hp,hp);
    for(let i=0;i<60;i++)advance({state:'shieldPush',actionId:3,actionElapsed:.4});
    assert.equal(f.battle.combat.hp,hp);
    f.world.navigation={segmentClear:()=>false,steer:()=>null,constrain(){}};
    for(let i=0;i<70;i++)advance();
    assert.equal(f.battle.combat.hp,hp);
    f.world.navigation=null;
    for(let i=0;i<80&&f.battle.combat.hp===hp;i++)advance();
    assert.ok(f.battle.combat.hp<hp);
  }finally{f.dispose();}
});
test('cancelling a pending region discards a late source before cloning or registering it',async()=>{
  let resolve,started;const ready=new Promise(r=>started=r);let releases=0;
  const f=fixture({loadModel:()=>{started();return new Promise(r=>resolve=r);}});
  try{
    const create=f.factory.create(f.params('zombie','cave-a'));await ready;
    f.factory.dispose();resolve({dispose(){releases++;}});
    await assert.rejects(create,{name:'AbortError'});
    assert.equal(releases,1);assert.equal(f.battle.encounters.length,0);
  }finally{f.dispose();}
});
