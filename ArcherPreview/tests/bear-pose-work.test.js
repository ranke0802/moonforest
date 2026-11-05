import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {NullEngine,Scene,TransformNode,Vector3,PBRMaterial,FreeCamera,DirectionalLight,ShadowGenerator,VertexBuffer} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/index.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {instantiateBossModel} from '../src/boss-models.js';
import {BossEncounter} from '../src/boss-encounter.js';
import {createBossPreparation} from '../src/boss-preparation.js';
import {refreshPoseMatrices} from '../src/pose-matrices.js';
import {applyHitFlash} from '../src/hit-feedback.js';
import {caveFogFallback} from '../src/cave-fog-binding.js';

// The production alignment before this change is the numerical/work oracle.
function previousAlign(){
  this.carrier.position.setAll(0);this.actor.computeWorldMatrix(true);this.carrier.computeWorldMatrix(true);
  const hip=this.nodes['mixamorig:Hips'];hip.computeWorldMatrix(true);
  const relative=Vector3.TransformCoordinates(hip.getAbsolutePosition(),this.actor.getWorldMatrix().clone().invert());
  const clip=this.config.catalog.find(c=>c.name===this.brain.state),ground=clip.groundTrack;
  const sampleTime=['move','approach'].includes(this.brain.mode)&&clip.duration>0?this.brain.time%clip.duration:this.brain.time;
  const f=Math.min((ground?.length||1)-1,sampleTime*(clip.fps??30)),i=Math.floor(f);
  const level=ground?ground[i]+(ground[Math.min(i+1,ground.length-1)]-ground[i])*(f-i):.075;
  this.groundHeight=level>this.groundHeight?level:this.groundHeight+(level-this.groundHeight)*(1-Math.exp(-18*this.dt));
  this.carrier.position.set(-relative.x,this.groundHeight,-relative.z);this.carrier.computeWorldMatrix(true);
}
const report={baseline:'99fcd56',scope:'Actual shipped guardian-bear packed geometry, independently cloned skeletons/animation targets, native Babylon NullEngine matrix recompositions and shader-effect cache. Alignment compares the previous method against the optimized method on identical native animation samples; binding-cache behavior is separately tested in animation-combat-bindings.test.js. Downloaded images are omitted; original skin/clip/geometry streams are retained. CPU timings are local process samples, not phone FPS or GPU measurements.',cases:[],limitations:['No browser or real GPU driver compilation/upload/fence timing.','No change to combat windows, capsule geometry, animation rate, skin influences, textures, geometry LOD or shadow settings.']};
async function fixture(t){
  const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;scene.useConstantAnimationDeltaTime=true;
  Object.assign(engine.getCaps(),{textureFloat:true,maxVertexTextureImageUnits:16,maxTextureSize:4096});
  const camera=new FreeCamera('bear-pose-review',new Vector3(0,3,-9),scene);camera.setTarget(new Vector3(0,1,3));
  const light=new DirectionalLight('bear-shadow-review',new Vector3(.5,-1,.3),scene),shadows=new ShadowGenerator(256,light);
  caveFogFallback(scene).getInternalTexture().isReady=true;
  const base=new URL('../public/assets/',import.meta.url),config=JSON.parse(readFileSync(new URL('guardian-bear.json',base))),decoded=await readRuntimeGltf(new URL(config.model,base)),gltf=structuredClone(decoded.gltf);
  for(const key of ['extensionsUsed','extensionsRequired'])gltf[key]=(gltf[key]??[]).filter(x=>x!=='EXT_meshopt_compression');
  for(const buffer of gltf.buffers)if(buffer.uri)buffer.uri='data:application/octet-stream;base64,'+decoded.files.get(buffer.uri).data.toString('base64');
  const loader=new GLTFFileLoader();loader.skipMaterials=true;const container=await loader.loadAssetContainerAsync(scene,{json:gltf},'');for(const group of container.animationGroups)group.stop();
  const paint=new PBRMaterial('bear-pose-paint',scene);paint.unlit=true;paint.transparencyMode=PBRMaterial.PBRMATERIAL_OPAQUE;
  for(const mesh of container.meshes)if(mesh.getTotalVertices())mesh.material=paint;
  const world={scene,shadows,terrain:{place:p=>{p.y=0;}}},player=new TransformNode('player',scene),effects=new Set(),createEffect=engine.createEffect.bind(engine),draws=[],draw=engine.drawElementsType.bind(engine);
  engine.createEffect=(...args)=>{const effect=createEffect(...args);effects.add(effect);return effect;};
  engine.drawElementsType=(...args)=>{draws.push({renderPass:engine.currentRenderPassId,indices:args[2]});return draw(...args);};
  const encounters=[];
  for(let i=0;i<2;i++){
    const asset=instantiateBossModel(container),enemy=new BossEncounter(world,()=>{},()=>{},()=>{},{loadAsset:async()=>({config,asset})});
    await enemy.summon(player,{position:new Vector3(0,0,3),rotationY:Math.PI,preparation:createBossPreparation({frame:async()=>{}})});
    encounters.push(enemy);
  }
  encounters[0].alignPose=previousAlign;
  const counters=encounters.map(enemy=>{
    const counter={forced:0,calls:0,recomposed:0};
    for(const node of [enemy.actor,enemy.carrier,...enemy.asset.transformNodes,...enemy.asset.meshes]){
      const compute=node.computeWorldMatrix;node.computeWorldMatrix=function(force,...args){counter.calls++;if(force===true)counter.forced++;return compute.call(this,force,...args);};
      node.onAfterWorldMatrixUpdateObservable.add(()=>counter.recomposed++);
    }
    return counter;
  });
  t.after(()=>{for(const enemy of encounters)enemy.hide();container.dispose();loader.dispose();scene.dispose();engine.dispose();});
  return {engine,scene,config,container,encounters,counters,effects,shadows,draws};
}
function reset(counter){counter.calls=counter.forced=counter.recomposed=0;}
function sample(f,state,mode,time){
  for(const enemy of f.encounters){enemy.brain.start(state,mode);enemy.brain.time=time;enemy.dt=1/60;enemy.groundHeight=0;enemy.animator.transition(state,{clipTime:time,actionId:enemy.brain.serial});enemy.animator.update(.2);}
  f.scene._animate(0);
}
function snapshot(enemy){
  const nodes=[enemy.actor,enemy.carrier,...enemy.asset.transformNodes,...enemy.asset.meshes];
  const matrices=nodes.map(node=>Array.from(node.computeWorldMatrix().asArray()));
  for(const skeleton of enemy.asset.skeletons)skeleton.prepare(true);
  const bones=enemy.asset.skeletons.map(s=>Array.from(s.getTransformMatrices(enemy.asset.meshes.find(m=>m.skeleton===s))));
  return {matrices,bones,capsules:enemy.hurtCapsules()};
}
function maxError(a,b){const left=a.flat(Infinity),right=b.flat(Infinity);assert.equal(left.length,right.length);let error=0;for(let i=0;i<left.length;i++)error=Math.max(error,Math.abs(left[i]-right[i]));return error;}
function localCpuSamples(enemy){
  const samples=[];
  for(let round=0;round<5;round++){
    const started=performance.now();for(let frame=0;frame<120;frame++){enemy.alignPose();refreshPoseMatrices(enemy.poseNodes);}
    samples.push((performance.now()-started)/120);
  }
  return {scope:'alignment plus full imported-transform refresh; wrapped native work counters enabled',frames:600,medianMs:samples.toSorted((a,b)=>a-b)[2],roundMeanMs:samples};
}

test('actual bear attack, grab, fall and recovery keep exact world/bone/contact poses with fewer forced ancestor recompositions',async t=>{
  const f=await fixture(t),asset=f.encounters[1].asset,bodies=asset.meshes.filter(m=>m.getTotalVertices()&&!m.metadata?.moonforestOutline);
  assert.equal(f.encounters[1].animator.bindingCacheSize,2);assert.equal(f.encounters[1].animator.inspectBindingCache().eligible,true);
  report.asset={transformNodes:asset.transformNodes.length,skeletons:asset.skeletons.length,bones:asset.skeletons.map(s=>s.bones.length),clips:asset.animationGroups.length,clipTargets:asset.animationGroups.map(g=>({name:g.name,targets:g.targetedAnimations.length})),bodies:bodies.map(m=>({name:m.name,vertices:m.getTotalVertices(),triangles:m.getTotalIndices()/3,influences:m.numBoneInfluencers,extraWeights:m.isVerticesDataPresent(VertexBuffer.MatricesWeightsExtraKind),boneTexture:m.skeleton?.useTextureToStoreBoneMatrices})),outlines:asset.meshes.filter(m=>m.metadata?.moonforestOutline).length,casters:f.shadows.getShadowMap().renderList.length/2};
  const cases=[['Right_Jab_from_Guard','attack',.4],['Weapon_Combo','attack',1.1],['Skill_02','attack',1.4],['Knock_Down_1','down',.3],['Knock_Down_1','down',1.5],['Knock_Down_1','down',3],['Stand_Up3','recover',.3],['Stand_Up3','recover',2],['Stand_Up3','recover',3.8]];
  for(const [state,mode,time]of cases){
    sample(f,state,mode,time);
    const measured=[];
    for(let i=0;i<2;i++){
      const enemy=f.encounters[i],counter=f.counters[i];reset(counter);enemy.alignPose();refreshPoseMatrices(enemy.poseNodes);measured.push({...counter});
    }
    const [before,after]=f.encounters.map(snapshot),worldError=maxError(before.matrices,after.matrices),boneError=maxError(before.bones,after.bones);
    assert.ok(worldError<2e-5,`${state} world ${worldError}`);assert.ok(boneError<2e-5,`${state} bone ${boneError}`);assert.deepEqual(before.capsules,after.capsules);
    assert.ok(measured[1].forced<measured[0].forced);assert.ok(measured[1].recomposed<measured[0].recomposed);
    const skins=f.encounters.map(enemy=>enemy.asset.meshes.filter(m=>m.getTotalVertices()&&!m.metadata?.moonforestOutline).map(m=>Array.from(m.getPositionData(true,true))));
    const skinError=maxError(skins[0],skins[1]);assert.ok(skinError<2e-5,`${state} skin ${skinError}`);
    report.cases.push({state,mode,time,before:measured[0],after:measured[1],maxWorldMatrixError:worldError,maxBoneMatrixError:boneError,maxSkinnedPositionError:skinError,contactCapsulesEqual:true});
    if((state==='Right_Jab_from_Guard'&&time===.4)||(state==='Knock_Down_1'&&time===1.5)||(state==='Stand_Up3'&&time===2))report.cases.at(-1).localCpu={before:localCpuSamples(f.encounters[0]),after:localCpuSamples(f.encounters[1])};
  }
  report.productionBindingCache=f.encounters[1].animator.inspectBindingCache();
});

test('actual bear warmup covers first attack/down/recover and fading body, overlay and shadow effects',async t=>{
  const f=await fixture(t),enemy=f.encounters[1],initialEffects=f.effects.size,transitions=[];
  f.encounters[0].actor.setEnabled(false);
  for(const [state,mode,time]of [['Right_Jab_from_Guard','attack',.4],['Knock_Down_1','down',1.5],['Stand_Up3','recover',2]]){
    sample(f,state,mode,time);enemy.alignPose();refreshPoseMatrices(enemy.poseNodes);const before=f.effects.size;f.draws.length=0;f.scene.render();
    assert.equal(f.effects.size,before,`${state} creates no new effect after hidden preparation`);transitions.push({state,newEffects:f.effects.size-before,draws:[...f.draws],shadowDraws:f.draws.filter(d=>d.renderPass===f.shadows.getShadowMap().renderPassId).length});
  }
  for(const [mesh,visibility]of enemy.deathVisibility)mesh.visibility=visibility*.7;
  for(const mesh of enemy.asset.meshes)f.shadows.removeShadowCaster(mesh,false);
  applyHitFlash(enemy.asset.meshes,.1);const before=f.effects.size;f.scene.render();assert.equal(f.effects.size,before);
  report.shaderCoverage={preparedEffects:initialEffects,transitions,firstFadingHitNewEffects:f.effects.size-before,opaqueShadowCastersPerBear:report.asset?.casters,bodySkinSettingsUnchanged:true};
});

test.after(()=>{report.passed=report.cases.length===9&&report.shaderCoverage?.firstFadingHitNewEffects===0;mkdirSync('reports/bear-combat-2026-11-05',{recursive:true});writeFileSync('reports/bear-combat-2026-11-05/bear-validation.json',JSON.stringify(report,null,2)+'\n');});
