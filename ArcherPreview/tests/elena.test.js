import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {NullEngine,Scene,TransformNode,Vector3,StandardMaterial,FreeCamera,PBRMaterial,RawTexture,MeshBuilder} from '@babylonjs/core';
import {WebGL2ShaderProcessor} from '@babylonjs/core/Engines/WebGL/webGL2ShaderProcessors.js';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/index.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {BossBattle} from '../src/boss-battle.js';
import {instantiateBossModel} from '../src/boss-models.js';
import {ElenaBrain,ELENA_HOME,ELENA_ACTIVE_CLIPS,ELENA_CAST} from '../src/elena-spec.js';
import {ElenaLineEffect,lineHitsPlayer,ELENA_LINE_RADIUS} from '../src/elena-magic.js';
import {ELENA_STYLE,ElenaPaint,applyElenaStyle} from '../src/elena-style.js';
import {createWitchCaveTerrain} from '../src/witch-cave-terrain.js';
import {CaveNavigation} from '../src/witch-cave-navigation.js';
import {caveObstacles} from '../src/witch-cave-layout.js';
import {setWorldCharacter} from '../src/world-limits.js';
import {portalAvailable,MAP_PORTALS} from '../src/map-route.js';
import {ActionAudio} from '../src/action-audio.js';
import {applyMonsterToon} from '../src/monster-toon.js';
import {attachCharacterOutlines} from '../src/character-outlines.js';
const base=new URL('../public/assets/',import.meta.url),read=n=>JSON.parse(readFileSync(new URL(n,base)));

async function fixture(t){
  setWorldCharacter('warrior-v5');t.after(()=>setWorldCharacter('warrior'));
  const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;
  new FreeCamera('offline-review',new Vector3(29,8,-20),scene);scene.useConstantAnimationDeltaTime=true;
  const config=read('elena.json'),{gltf,files}=await readRuntimeGltf(new URL(config.model,base));
  for(const key of ['extensionsUsed','extensionsRequired'])gltf[key]=(gltf[key]??[]).filter(x=>x!=='EXT_meshopt_compression');
  for(const b of gltf.buffers)if(b.uri)b.uri='data:application/octet-stream;base64,'+files.get(b.uri).data.toString('base64');
  const loader=new GLTFFileLoader();loader.skipMaterials=true;
  const container=await loader.loadAssetContainerAsync(scene,{json:gltf},'');
  // GPU texture/shader compilation is covered separately; exercise the actual
  // rig and every production clip without waiting for a nonexistent GPU.
  for(const mesh of container.meshes)if(mesh.getTotalVertices())mesh.material=new StandardMaterial('offline-color',scene);
  const models={loads:0,instances:0,async load(){this.loads=1;},async instantiate(){this.instances++;return {config,asset:instantiateBossModel(container)};}};
  const world={scene,cave:true,terrain:createWitchCaveTerrain(),navigation:new CaveNavigation(caveObstacles()),shadows:{addShadowCaster(){},removeShadowCaster(){}}};
  const battle=new BossBattle(world,()=>{},()=>{},()=>true,{elenaModels:models});
  const player=new TransformNode('player',scene);player.position.set(29,6,-22);
  t.after(()=>{battle.hide();container.dispose();loader.dispose();scene.dispose();engine.dispose();});
  return {engine,scene,config,world,battle,player,models};
}

test('Elena source inventory is 18 real 60 fps motions; runtime preserves topology and 4K ETC1S',()=>{
  const c=read('elena.json'),g=read(c.model);assert.equal(c.sourceClips.length,18);assert.equal(c.sourceClips.filter(a=>a.name.startsWith('mage_')).length,6);
  assert.ok(c.sourceClips.every(a=>a.fps===60));assert.equal(c.sourceClips.find(a=>a.name==='Axe_Spin_Attack').duration,2.5);
  assert.deepEqual(Object.keys(c.animations),[...ELENA_ACTIVE_CLIPS]);assert.equal(g.animations.length,12);assert.equal(c.magicEffect,'ground-telegraphs-v1');
  assert.deepEqual(c.style,ELENA_STYLE);
  const triangles=g.meshes.reduce((n,m)=>n+m.primitives.reduce((s,p)=>s+g.accessors[p.indices].count/3,0),0);assert.equal(triangles,103930);
  assert.equal(g.skins.length,1);assert.ok(g.skins[0].joints.length>=80);
  for(const path of c.resources){const data=readFileSync(new URL(path,base));assert.equal(createHash('sha256').update(data).digest('hex'),path.split('/').at(-1).split('.')[0]);}
  const texture=readFileSync(new URL(g.images[0].uri,new URL(c.model,base)));assert.equal(texture.readUInt32LE(20),4096);assert.equal(texture.readUInt32LE(24),4096);assert.ok(texture.readUInt32LE(40)>1);
});

test('twenty cave round trips retain one Elena, player health/equipment and boss health without growing scene resources',async t=>{
  const {scene,battle,world,player,models}=await fixture(t);
  battle.combat.hp=312;battle.potions.remaining=1;battle.combat.defense=7;
  await Promise.all([battle.activateResident(player),battle.activateResident(player)]);
  const elena=battle.elenaPool[0];assert.equal(models.instances,1);assert.equal(battle.encounters.length,1);
  assert.equal(world.navigation.free(ELENA_HOME,.34),true);assert.equal(elena.actor.position.y,world.terrain.heightAt(ELENA_HOME.x,ELENA_HOME.z));
  elena.brain.hp=777;
  const count=()=>[scene.meshes.length,scene.transformNodes.length,scene.animationGroups.length,scene.skeletons.length,scene.materials.length,scene.textures.length];const before=count();
  for(let i=0;i<20;i++){
    battle.hide();world.cave=false;assert.equal(elena.actor.isEnabled(),false);assert.equal(await battle.activateResident(player),false);
    world.cave=true;await battle.activateResident(player);assert.deepEqual(count(),before);assert.equal(battle.encounters.length,1);assert.equal(elena.brain.hp,777);
  }
  assert.equal(models.loads,1);assert.equal(models.instances,1);assert.equal(battle.playerHp,312);assert.equal(battle.potions.remaining,1);assert.equal(battle.combat.defense,7);
});

test('real animation groups deform and ground the rig; every authored attack is a ground spell',async t=>{
  const {battle,player,config,scene}=await fixture(t);await battle.activateResident(player);const e=battle.elenaPool[0];
  const hand=e.nodes['mixamorig:RightHand'];assert.ok(hand);
  e.renderVisible=true;const points=[];
  for(const clip of config.catalog){
    assert.ok(Math.abs(e.animator.durations[clip.name]-clip.duration)<.001,'source timing preserved for '+clip.name);
    e.brain.start(clip.name,clip.name==='Knock_Down'?'down':clip.name==='Stand_Up9'?'recover':'idle');
    for(const phase of [.1,.5,.9]){
      e.brain.time=clip.duration*phase;e.dt=1/30;e.animator.transition(clip.name,{clipTime:e.brain.time,actionId:e.brain.serial});e.animator.update(.2);
      scene.render();
      e.poseAndContacts(player,{state:'idle'},null,null);
      const p=hand.getAbsolutePosition();assert.ok(p.asArray().every(Number.isFinite));assert.ok(Math.abs(p.x-e.actor.position.x)<3);assert.ok(p.y>5&&p.y<9);points.push(p.clone());
    }
  }
  assert.ok(points.some(p=>Vector3.Distance(p,points[0])>.2),'source animation really moves the skeleton');
  assert.equal(e.asset.meshes.filter(m=>m.metadata?.moonforestOutline).length,1);
  assert.equal(e.asset.meshes.find(m=>m.metadata?.moonforestOutline).metadata.outlinePixels,.5);
  const b=new ElenaBrain(Object.fromEntries(config.catalog.map(c=>[c.name,c.duration]))),events=[];
  for(let i=0;i<2400;i++)events.push(...b.update(1/30,1,true).events);
  assert.equal(new Set(events.map(e=>e.name)).size,7);assert.ok(events.every(event=>event.kind==='ground'));
  b.hit({heavy:true,damage:50});assert.equal(b.mode,'down');b.update(b.durations.Knock_Down+.1,1,true);assert.equal(b.mode,'recover');b.update(b.durations.Stand_Up9+.1,1,true);assert.equal(b.mode,'idle');
});

test('red line locks aim, respects range and obstacles, and reuses one mesh',t=>{
  const engine=new NullEngine(),scene=new Scene(engine);t.after(()=>engine.dispose());
  const fx=new ElenaLineEffect({scene}),start=new Vector3(0,1,0),target=new Vector3(0,1,8);
  const count=scene.meshes.length;fx.aim(1,start,target,7);assert.equal(fx.end.z,7);
  fx.aim(1,start,new Vector3(4,1,4),7);assert.equal(fx.end.x,0,'cannot track the player after warning');
  assert.equal(lineHitsPlayer(start,fx.end,new Vector3(0,0,5)),true);assert.equal(lineHitsPlayer(start,fx.end,new Vector3(1,0,5)),false);
  for(let i=0;i<100;i++){fx.aim(i+2,start,target,7);fx.show(start,.5,1);assert.equal(fx.mesh.scaling.x,.07);fx.show(start,1.05,1);assert.equal(fx.mesh.scaling.x,ELENA_LINE_RADIUS*2);fx.reset();}
  assert.equal(scene.meshes.length,count);fx.dispose();
  const blocked=new ElenaLineEffect({scene,navigation:{segmentClear:(a,b)=>b.z<=3}});blocked.aim(2,start,target,7);assert.ok(blocked.end.z<=3&&blocked.end.z>2.98);blocked.dispose();
});

test('spell damage occurs once at release, can be dodged or blocked, and cancels on interruption/departure',async t=>{
  const {battle,player,scene}=await fixture(t);await battle.activateResident(player);const e=battle.elenaPool[0];
  player.position.set(29,e.actor.position.y,-23.5);e.actor.rotation.y=0;e.renderVisible=true;
  const cast=async(state)=>{
    e.brain.start(ELENA_CAST.name,'attack');e.brain.stagger=0;e.engaged=true;
    const step=(time,fire=false)=>{e.brain.time=time;e.dt=1/30;e.animator.transition(ELENA_CAST.name,{clipTime:time,actionId:e.brain.serial});e.animator.update(.2);scene.render();e.pendingEvents=fire?[ELENA_CAST]:[];e.poseAndContacts(player,state,null,null);};
    step(.1);const hp=battle.playerHp;step(e.brain.durations[ELENA_CAST.name]*ELENA_CAST.impact,true);const damage=hp-battle.playerHp;
    step(e.brain.time,true);assert.equal(hp-battle.playerHp,damage,'same cast cannot hit twice');e.spell.reset();battle.combat.invulnerable=0;return damage;
  };
  assert.ok(await cast({state:'idle'})>0);assert.equal(await cast({state:'dodge',actionId:9}),0);assert.equal(await cast({state:'shieldPush',actionId:10}),0);
  e.brain.start(ELENA_CAST.name,'attack');e.brain.hit({damage:5,stun:.5});assert.equal(e.brain.state,'Elena_Idle');assert.equal(e.brain.update(2,4,true).events.length,0);
  const start=e.actor.position.clone();e.spell.aim(9,'corridor',start,start.add(new Vector3(0,0,2)),{range:7});e.spell.show(.1,1);assert.equal(e.spell.mesh.isEnabled(),true);
  battle.hide();assert.equal(e.spell.mesh.isEnabled(),false);assert.equal(e.contact.mesh.isEnabled(),false);
});

test('an unengaged resident does not block cave exit or play bear voices, and movement remains on the dwelling floor',async t=>{
  const {battle,player,world}=await fixture(t);await battle.activateResident(player);const e=battle.elenaPool[0];
  player.position.set(-46,0,47);battle.update(.03,player);assert.equal(e.engaged,false);assert.equal(battle.combatCount,0);
  assert.equal(battle.nearestTarget(player.position),null,'distant resident cannot pull camera or auto-aim');
  assert.equal(portalAvailable(player.position,MAP_PORTALS['witch-cave'],{enemies:battle.combatCount}),true);
  const cues=[],combat=[],audio=new ActionAudio({play:(name)=>cues.push(name),setCombat:state=>combat.push(state)});audio.boss(battle,.03);assert.equal(combat.at(-1).active,false);
  player.position.set(29,6,-23);
  for(let i=0;i<90;i++){battle.update(1/30,player);assert.ok(world.navigation.free(e.actor.position,.33));audio.boss(battle,1/30);}
  assert.equal(e.engaged,true);assert.ok(!cues.some(n=>/^(bear_|goblin_)/.test(n)));assert.equal(battle.combatCount,1);
  assert.equal(battle.nearestTarget(player.position),e);
  player.position.set(-46,0,47);
  for(let i=0;i<300;i++)battle.update(1/30,player);
  assert.ok(Math.hypot(e.actor.position.x-ELENA_HOME.x,e.actor.position.z-ELENA_HOME.z)<.2);
});

test('a late resident download cannot appear after departing the cave',async t=>{
  const {battle,player,world,models}=await fixture(t);let release;models.load=()=>new Promise(r=>{release=r;});
  const pending=battle.activateResident(player);battle.hide();world.cave=false;release();assert.equal(await pending,false);assert.equal(models.instances,0);assert.equal(battle.encounters.length,0);
});

for(const ubo of [false,true])test('S23 shader processing preserves 0.50 px outline / 0.20 inner lines / 1.35 brightness without PBR',async t=>{
  const engine=new NullEngine(),scene=new Scene(engine);t.after(()=>engine.dispose());engine._webGLVersion=2;engine._getShaderProcessor=()=>new WebGL2ShaderProcessor();engine.disableUniformBuffers=!ubo;
  new FreeCamera('camera',new Vector3(0,1,-3),scene);
  const mesh=MeshBuilder.CreateBox('painted-elena',{},scene),m=new PBRMaterial('paint',scene),texture=RawTexture.CreateRGBATexture(new Uint8Array([128,100,150,255]),1,1,scene,true);
  texture.getInternalTexture().isReady=true;m.albedoTexture=texture;mesh.material=m;const asset={meshes:[mesh]};
  applyMonsterToon(asset);applyElenaStyle(asset);attachCharacterOutlines(asset,'elena');
  const before=scene.materials.length;applyElenaStyle(asset);assert.equal(scene.materials.length,before);
  assert.equal(mesh.material.unlit,true);assert.equal(mesh.material.reflectionTexture,null);assert.equal(mesh.material.metallicTexture,null);assert.deepEqual(mesh.material.metadata.elenaStyle,ELENA_STYLE);
  await mesh.material.forceCompilationAsync(mesh);await asset.meshes[1].material.forceCompilationAsync(asset.meshes[1]);scene.render();
  const fragment=mesh.subMeshes[0].effect.fragmentSourceCode;assert.match(fragment,/elenaPaintStyle\.x \* elenaBand/);assert.match(fragment,/elenaPaintStyle\.y\*max\(elenaCrease,elenaPaintEdge\)/);
  const uniforms={};mesh.material.pluginManager.getPlugin('ElenaPaint').hardBindForSubMesh({updateFloat(){},updateFloat2:(name,x,y)=>uniforms[name]=[x,y]},scene,engine,mesh.subMeshes[0]);assert.deepEqual(uniforms.elenaPaintStyle,[1.35,.2]);
  assert.match(asset.meshes[1].subMeshes[0].effect.vertexSourceCode,/outlinePixels \* 2\.0 \/ outlineViewport/);
});
