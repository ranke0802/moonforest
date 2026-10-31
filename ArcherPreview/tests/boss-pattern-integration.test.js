import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NullEngine,Scene,TransformNode,Vector3,StandardMaterial,Quaternion} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/index.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {instantiateBossModel} from '../src/boss-models.js';
import {BossBattle} from '../src/boss-battle.js';
import {BossBrain} from '../src/boss-spec.js';
import {BossPatternSettings,normalizeBossPatterns} from '../src/boss-pattern-settings.js';
import {ELENA_SPELLS,MOURNING_SPELLS,MOURNING_CAST_LEAD_IN,spellImpact} from '../src/elena-spec.js';
import {mourningMorphs} from '../src/mourning-elena-animation.js';
import {spellContains} from '../src/elena-ground-magic.js';
import {setWorldCharacter} from '../src/world-limits.js';

const base=new URL('../public/assets/',import.meta.url),cache=new Map();
const near=(a,b,label,tolerance=2e-6)=>assert.ok(Math.abs(a-b)<tolerance,`${label}: ${a} != ${b}`);
const error=(a,b)=>Math.min(Math.hypot(...a.asArray().map((v,i)=>v-b.asArray()[i])),a instanceof Quaternion?Math.hypot(...a.asArray().map((v,i)=>v+b.asArray()[i])):Infinity);
async function fixture(t){
  setWorldCharacter('warrior-v5');t.after(()=>setWorldCharacter('warrior'));
  const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;scene.useConstantAnimationDeltaTime=true;
  const loaded=[];
  async function library(name){
    const config=JSON.parse(readFileSync(new URL(name+'.json',base)));
    if(!cache.has(name))cache.set(name,readRuntimeGltf(new URL(config.model,base)));
    const source=await cache.get(name),gltf=structuredClone(source.gltf);
    for(const key of ['extensionsUsed','extensionsRequired'])gltf[key]=(gltf[key]??[]).filter(x=>x!=='EXT_meshopt_compression');
    for(const buffer of gltf.buffers)if(buffer.uri)buffer.uri='data:application/octet-stream;base64,'+source.files.get(buffer.uri).data.toString('base64');
    const loader=new GLTFFileLoader();loader.skipMaterials=true;const container=await loader.loadAssetContainerAsync(scene,{json:gltf},'');
    for(const group of container.animationGroups)group.stop();
    for(const mesh of container.meshes)if(mesh.getTotalVertices())mesh.material=new StandardMaterial(name+'-audit',scene);
    loaded.push({loader,container});
    return {config,instances:0,async load(){},async instantiate(){this.instances++;return {config,asset:instantiateBossModel(container)};}};
  }
  const elenaModels=await library('elena'),mourningModels=await library('mourning-elena');
  // Flat cave-height ground isolates the settings/clock contract from route
  // finding; actual imported models, encounters, player damage and telegraphs run.
  const world={scene,cave:true,terrain:{heightAt:()=>6,place:p=>{p.y=6;}},shadows:{addShadowCaster(){},removeShadowCaster(){}}};
  const battle=new BossBattle(world,()=>{},()=>{},()=>true,{elenaModels,mourningModels}),player=new TransformNode('settings-player',scene);player.position.set(29,6,-21.5);
  t.after(()=>{battle.hide();for(const {container,loader} of loaded){container.dispose();loader.dispose();}scene.dispose();engine.dispose();});
  return {engine,scene,world,battle,player,elenaModels,mourningModels};
}
const id=(phase,spec)=>phase===2?spec.pattern:spec.name;
const kind=phase=>phase===2?'mourning-elena':'elena';
function sourcePose(encounter){
  const mourning=encounter.phase===2,variant=encounter.brain.spell?.motion??'cast',group=mourning?encounter.asset.animationGroups.find(g=>g.name===encounter.config.motion.castVariants[variant]):encounter.animator.clips[encounter.brain.state];
  let checked=0;
  for(const {target,animation} of group.targetedAnimations){
    const property=animation.targetProperty;
    if(!['position','rotationQuaternion','scaling'].includes(property)||target.name.startsWith('DEF_Halo'))continue;
    assert.ok(error(target[property],animation.evaluate(encounter.brain.time*animation.framePerSecond))<3e-5,`${group.name}/${target.name}/${property}`);checked++;
  }
  assert.ok(checked>100);
  if(mourning){
    const a=encounter.animator,t=encounter.brain.time,reach=encounter.config.motion.alternateReach;
    let castReachOverride;
    if(variant==='cast_alternate'){const i=reach.findIndex((key,index)=>index>0&&t<=key[0]);if(i<0)castReachOverride=0;else{const [ta,va]=reach[i-1],[tb,vb]=reach[i],u=Math.max(0,Math.min(1,(t-ta)/(tb-ta)));castReachOverride=va+(vb-va)*u*u*(3-2*u);}}
    const expected=mourningMorphs({casting:true,castVariant:variant,castReachOverride,castTime:t,castWeight:a.weights.cast,walkTime:a.walkTime,gaitSeconds:a.gaitSeconds,gaitBlend:a.gaitBlend,breathClock:a.breathClock});
    for(const target of a.morphs)near(target.influence,expected[target.name],target.name);
    near(a.castTime,encounter.brain.time,'cast morph source time');
  }else near(encounter.animator.active.get(encounter.brain.state).clipTime,encounter.brain.time,'controlled group time');
  return checked;
}

test('actual two-phase models keep floor warning, one damage release and source pose aligned at .5x/1x/2x, 30/60 fps',async t=>{
  const f=await fixture(t),{battle,player,scene}=f;let cases=0,channels=0,minWarning=Infinity,maxDrift=0;
  for(const phase of [1,2]){
    await battle.activateResident(player,{reset:true,phase});const encounter=battle.encounters.find(e=>e.kind==='elena'),spells=phase===2?MOURNING_SPELLS:ELENA_SPELLS;
    for(const speed of [.5,1,2])for(const fps of [30,60])for(const spec of spells){
      encounter.brain.cancelCast();encounter.spell.reset();encounter.pendingEvents=[];battle.combat.reset();encounter.actor.position.set(29,6,-25.5);
      const settings=normalizeBossPatterns({[kind(phase)]:{custom:true,sequence:[id(phase,spec)],speed}});battle.setAttackSettings(settings);
      const selected=encounter.brain.cast();assert.equal(selected,spec);
      const rate=(phase===2?1.6:1)*speed,impact=spellImpact(spec,encounter.brain.durations[spec.name]),warning=(phase===2?MOURNING_CAST_LEAD_IN:0)+impact/rate;
      near(encounter.brain.attackPlaybackRate,rate,'configured rate');near(encounter.brain.castWarningDuration,warning,'warning seconds');
      minWarning=Math.min(minWarning,warning);
      player.position.copyFrom(encounter.actor.position).addInPlaceFromFloats(0,0,phase===2&&spec.pattern==='ring'?7:4);player.rotation.y=Math.PI;
      encounter.update(0,player);scene._animate(0);encounter.poseAndContacts(player,{state:'idle'},null,null);
      const plan=encounter.spell.plan,serial=encounter.brain.serial,hp=battle.playerHp;
      if(phase===2&&spec.pattern==='ring')player.position.set(plan.origin.x+plan.direction.x*7,6,plan.origin.z+plan.direction.z*7);
      assert.ok(spellContains(plan,player.position),`${phase}/${spec.pattern}: probe must stand inside the displayed footprint`);assert.ok(encounter.spell.mesh.isEnabled());
      let elapsed=0,releases=0,damageAt=null,changed=false,previousProgress=-1;
      while(elapsed<warning+.12){
        encounter.update(1/fps,player);elapsed+=1/fps;scene._animate(0);
        const fire=encounter.pendingEvents.some(e=>e.kind==='ground');
        if(fire){releases++;channels+=sourcePose(encounter);}
        encounter.poseAndContacts(player,{state:'idle'},null,null);
        assert.equal(encounter.spell.plan,plan,'aim remains frozen after changing settings');assert.equal(encounter.brain.serial,serial);near(encounter.brain.attackPlaybackRate,rate,'in-flight speed snapshot');
        const progress=encounter.brain.castWarningElapsed;assert.ok(progress>=previousProgress);previousProgress=progress;
        if(elapsed<warning-1e-8){assert.equal(battle.playerHp,hp);assert.equal(encounter.spell.fired,false);assert.ok(encounter.spell.material.alpha<.48);}
        if(damageAt===null&&battle.playerHp<hp){damageAt=elapsed;assert.ok(fire);assert.equal(encounter.spell.fired,true);near(encounter.spell.material.alpha,.48,'impact flash');}
        if(!changed&&elapsed>=.2){changed=true;battle.setAttackSettings({...settings,[kind(phase)]:{...settings[kind(phase)],speed:2.5-speed}});}
      }
      assert.equal(releases,1);assert.ok(damageAt!==null);assert.ok(damageAt>=warning-1e-8&&damageAt-warning<=1/fps+1e-8);
      maxDrift=Math.max(maxDrift,damageAt-warning);encounter.brain.cast();near(encounter.brain.attackPlaybackRate,(phase===2?1.6:1)*(2.5-speed),'next cast takes changed speed');cases++;
    }
  }
  assert.equal(cases,72);t.diagnostic(JSON.stringify({cases,sourceTransformChecks:channels,minWarningSeconds:minWarning,maxReleaseFrameQuantizationSeconds:maxDrift}));
});

test('saved settings and duplicate sequence progress survive other boss edits, map hide/return, pooled summon and restart',async t=>{
  const f=await fixture(t),{battle,world,player}=f,saved={value:null,getItem(){return this.value;},setItem(_key,value){this.value=value;}},prefs=new BossPatternSettings(saved);
  prefs.set('elena',{custom:true,sequence:['mage_soell_cast_3','mage_soell_cast_2','mage_soell_cast_3'],speed:.5});
  prefs.set('mourning-elena',{custom:true,sequence:['cross','fan','cross'],speed:2});battle.setAttackSettings(prefs.value);
  await battle.activateResident(player);const saint=battle.elenaPool[0];assert.equal(saint.brain.cast().name,'mage_soell_cast_3');
  prefs.set('bear',{custom:true,sequence:['Right_Jab_from_Guard'],speed:1.5});battle.setAttackSettings(prefs.value);
  assert.equal(saint.brain.cast().name,'mage_soell_cast_2','an unrelated boss edit preserves the cursor');
  prefs.set('elena',{...prefs.value.elena,speed:1.7});battle.setAttackSettings(prefs.value);assert.equal(saint.brain.cast().name,'mage_soell_cast_3');near(saint.brain.attackPlaybackRate,1.7,'new speed');
  battle.hide();world.cave=false;assert.equal(await battle.activateResident(player),false);world.cave=true;await battle.activateResident(player);assert.equal(saint.brain.cast().name,'mage_soell_cast_3','sequence wraps after map return');
  await battle.transformResident(player);const witch=battle.mourningPool[0];assert.equal(witch.brain.cast().pattern,'cross');near(witch.brain.attackPlaybackRate,3.2,'phase-two settings applied on transformation');
  prefs.set('mourning-elena',{...prefs.value['mourning-elena'],speed:.5});battle.setAttackSettings(prefs.value);battle.hide();world.cave=false;world.cave=true;await battle.activateResident(player);
  assert.equal(witch.brain.cast().pattern,'fan');near(witch.brain.attackPlaybackRate,.8,'changed speed survives map return');
  await battle.summonResident(player,2);assert.equal(witch.brain.cast().pattern,'cross','explicit summon starts the selected sequence anew');near(witch.brain.attackPlaybackRate,.8,'summon retains preferences');
  battle.resetBattle();await battle.activateResident(player,{reset:true});assert.equal(saint.brain.cast().name,'mage_soell_cast_3');near(saint.brain.attackPlaybackRate,1.7,'restart retains preferences');
  assert.deepEqual(new BossPatternSettings(saved).value,prefs.value);assert.equal(f.elenaModels.instances,1);assert.equal(f.mourningModels.instances,1);
});

test('bear speed-only settings preserve sequence progress and authored base play rates',()=>{
  const config=JSON.parse(readFileSync(new URL('guardian-bear.json',base))),durations=Object.fromEntries(config.catalog.map(c=>[c.name,c.duration]));
  const brain=new BossBrain(durations),sequence=['Left_Hook_from_Guard','Skill_02','Right_Jab_from_Guard'];
  brain.configureAttacks({custom:true,sequence,speed:.5});assert.equal(brain.nextAttack(),sequence[0]);brain.start(sequence[0],'attack');brain.update(.1,1.5,true);near(brain.time,.1*1.12*.5,'normal base rate');
  brain.configureAttacks({custom:true,sequence:[...sequence],speed:2});assert.equal(brain.nextAttack(),sequence[1]);brain.update(.1,1.5,true);near(brain.time,.2*1.12*.5,'running attack keeps its snapshot');
  brain.start(sequence[1],'attack');brain.update(.05,1.5,true);near(brain.time,.05*.85*2,'grab uses its own authored base rate');
});
