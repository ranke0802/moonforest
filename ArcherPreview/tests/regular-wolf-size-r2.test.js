import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NullEngine,Scene,TransformNode,Vector3,Quaternion} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {instantiateBossModel} from '../src/boss-models.js';
import {WolfAnimator} from '../src/wolf-animation.js';
import {WolfEncounter} from '../src/wolf-encounter.js';
import {WolfV02Encounter} from '../src/wolf-v02-encounter.js';
import {regularWolfManifest,regularWolfRuntimeProfile,regularWolfSize,regularWolfBalance,regularWolfActorScale} from '../src/regular-wolf-spec.js';
import {WARRIOR_DIMENSIONS} from '../src/player-dimensions.js';
import {RegularBoarBrain} from '../src/regular-boar-brain.js';
import {WOLF_CLIPS} from '../src/wolf-spec.js';
import {WOLF_V02_ORBIT,WOLF_V02_GET_UP} from '../src/wolf-v02-spec.js';

const base=new URL('../public/assets/',import.meta.url),read=id=>JSON.parse(readFileSync(new URL(id+'.json',base)));
const near=(a,b,label)=>assert.ok(Math.abs(a-b)<2e-5,`${label}: ${a} vs ${b}`);
function pose(scene,container,config,name,time){
 const asset=instantiateBossModel(container),actor=new TransformNode('scale-actor',scene),carrier=new TransformNode('scale-carrier',scene);carrier.parent=actor;actor.scaling.setAll(config.scale);
 for(const node of new Set([...asset.meshes,...asset.transformNodes]))if(!node.parent)node.parent=carrier;
 const animator=new WolfAnimator(asset,config),e={asset,actor,carrier,animator,inverseRoot:Quaternion.Identity(),offset:new Vector3(),nodes:Object.fromEntries(asset.transformNodes.map(n=>[n.name,n]))};
 animator.transition(name,{clipTime:time,blendDuration:0});animator.update(0);WolfEncounter.prototype.alignPose.call(e);return e;
}
function skinHeight(e){
 for(const n of [e.actor,e.carrier,...e.asset.transformNodes,...e.asset.meshes])n.computeWorldMatrix(true);
 for(const s of e.asset.skeletons)s.prepare(true);
 let low=Infinity,high=-Infinity;
 for(const m of e.asset.meshes){if(!m.getTotalVertices()||!m.skeleton)continue;const p=m.getPositionData(true,true),world=m.computeWorldMatrix(true);for(let i=0;i<p.length;i+=3){const y=Vector3.TransformCoordinates(Vector3.FromArray(p,i),world).y;low=Math.min(low,y);high=Math.max(high,y);}}
 return high-low;
}
test('R2 actor transforms enlarge four fitted skins 1.5x and boar 2.5x, preserving resources and real mouth contact',async t=>{
 const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;t.after(()=>{scene.dispose();engine.dispose();});const proof=[];
 for(const id of ['gray-wolf','stylized-wolf','wolf-3','fox','boar']){
  const factor=id==='boar'?2.5:1.5,old=read(id),config=read(regularWolfManifest(id)),profile=regularWolfRuntimeProfile(id,config),fit=profile.actions['quick-bite'],calibration=config.canineProfile.attacks['quick-bite'].calibration;
  assert.equal(config.scale,old.scale*factor);assert.equal(config.height,old.height*factor);assert.equal(config.model,old.model);assert.deepEqual(config.resources,old.resources);assert.deepEqual(config.texture,old.texture);assert.equal(config.sourceSha256,old.sourceSha256);assert.deepEqual(config.canineProfile.hurtVolumes,old.canineProfile.hurtVolumes);
  for(const [name,shape]of Object.entries(config.canineProfile.contactShapes)){near(shape.radius,old.canineProfile.contactShapes[name].radius*factor,id+' '+name+' radius');assert.deepEqual(shape.offset,old.canineProfile.contactShapes[name].offset);}
  const oldRate=4.2/(old.canineProfile.runSourceSpeed*old.scale);near(profile.gait.runPlaybackRate,oldRate/factor,id+' stride cadence');assert.equal(regularWolfActorScale(id),factor);
  const decoded=await readRuntimeGltf(new URL(config.model,base)),gltf=structuredClone(decoded.gltf);for(const key of ['extensionsUsed','extensionsRequired'])gltf[key]=(gltf[key]??[]).filter(x=>x!=='EXT_meshopt_compression'&&x!=='KHR_texture_basisu');for(const b of gltf.buffers)if(b.uri)b.uri='data:application/octet-stream;base64,'+decoded.files.get(b.uri).data.toString('base64');
  const loader=new GLTFFileLoader();loader.skipMaterials=true;const container=await loader.loadAssetContainerAsync(scene,{json:gltf},'');for(const g of container.animationGroups)g.stop();
  const before=pose(scene,container,old,fit.sourceClip,calibration.sourceTime),after=pose(scene,container,config,fit.sourceClip,calibration.sourceTime),oldHeight=skinHeight(before),height=skinHeight(after);near(height,oldHeight*factor,id+' actual skinned height');
  const root=after.animator.root.position,q=after.animator.root.rotationQuaternion,yaw=Math.atan2(2*(q.w*q.y+q.x*q.z),1-2*(q.y*q.y+q.z*q.z));after.actor.rotation.y=yaw;after.animator.ensurePoseCurrent();
  const shape=config.canineProfile.contactShapes[calibration.part],mouth=Vector3.TransformCoordinates(Vector3.FromArray(shape.offset),after.nodes[calibration.part].getWorldMatrix()),root0=config.catalog.find(c=>c.name===fit.sourceClip).rootTrack[0];mouth.x+=(root.x-root0[0])*config.scale;mouth.z+=(root.z-root0[2])*config.scale;
  for(let k=0;k<3;k++)near(mouth.asArray()[k],calibration.point[k],id+' actual '+calibration.part+' XYZ');
  const bodyRadius=WARRIOR_DIMENSIONS.moveRadius,low=bodyRadius,high=WARRIOR_DIMENSIONS.height-bodyRadius,radius=shape.radius+bodyRadius,vertical=Math.max(low-mouth.y,mouth.y-high,0),separations=[];
  for(const distance of [fit.minDistance,fit.maxDistance]){const separation=Math.hypot(mouth.x,mouth.z-distance,vertical);assert.ok(separation<=radius,id+' actual mouth at approach edge '+distance);separations.push(separation);}
  assert.ok(Math.hypot(mouth.x,5,0)>radius,id+' elevated miss remains outside contact');
  const size=regularWolfSize(id),balance=regularWolfBalance(id);near(size.radius,old.balance.radius*factor,id+' navigation body');near(size.separationRadius,old.balance.separationRadius*factor,id+' separation');near(balance.safeDistance,1.4*factor,id+' spawn clearance');
  proof.push({id,height:config.height,actualPoseHeightRatio:height/oldHeight,modelAndResourcesUnchanged:true,mouth:mouth.asArray(),edgeSeparations:separations,contactRadius:radius,runPlaybackRatio:profile.gait.runPlaybackRate/oldRate});
  before.animator.dispose();after.animator.dispose();container.dispose();loader.dispose();
 }
 assert.equal(regularWolfManifest('alpha-wolf'),'alpha-wolf');assert.equal(regularWolfActorScale('alpha-wolf'),1);
 console.log(JSON.stringify({scope:'Native CPU skin height, actual jaw/player capsule fit, resource identity and stride cadence; no browser/GPU/device claim.',proof}));
});

test('boar starts standing, observes facing forward and approaches a straight ram without orbit/side evade while retaining fall and get-up',()=>{
 const config=read(regularWolfManifest('boar')),profile=regularWolfRuntimeProfile('boar',config),durations=Object.fromEntries(config.catalog.map(c=>[c.name,c.duration])),brain=new RegularBoarBrain(durations,regularWolfBalance('boar'),()=>.5,profile);brain.ramReach=profile.ramReach;
 assert.ok(profile.ramPairClearance<brain.balance.radius);assert.ok(profile.catchDistance>profile.ramPairClearance);
 const lease={radius:brain.balance.radius,runtimeProfile:profile,v02Ram:{hasClearanceLease:()=>true}};assert.equal(WolfV02Encounter.prototype.contactSeparation.call(lease),profile.ramPairClearance);lease.runtimeProfile={};assert.equal(WolfV02Encounter.prototype.contactSeparation.call(lease),brain.balance.radius,'other actors keep their existing lease radius');
 assert.equal(brain.state,WOLF_CLIPS.watch);assert.equal(brain.behavior,'observe');const serial=brain.serial;
 for(let i=0;i<30;i++){const result=brain.update(1/60,40);assert.equal(result.speed,0);assert.equal(result.flank,undefined);assert.equal(brain.state,WOLF_CLIPS.watch);}assert.equal(brain.serial,serial,'standing far idle does not restart every frame');
 let distance=12,travel=0,charge=false;
 for(let i=0;i<600;i++){const result=brain.update(1/60,distance);assert.equal(result.flank,undefined);if(result.speed>0){travel+=result.speed/60;distance=Math.max(0,distance-result.speed/60);}if(result.momentumRam){charge=true;break;}}
 assert.ok(travel>0,'positive forward approach');assert.ok(charge,'forward approach reaches RUN charge');assert.equal(brain.action.id,'lunge');assert.equal(brain.ramApproachVariant,'run-ram');
 for(const clip of [WOLF_CLIPS.rest,WOLF_CLIPS.alert,WOLF_CLIPS.rise,...Object.values(WOLF_V02_ORBIT)])assert.equal(brain.visited.has(clip),false,clip+' unused');
 brain.beginRamEvade(true);assert.equal(brain.state,WOLF_CLIPS.watch);assert.equal(brain.plannedId,'lunge');assert.equal(brain.behavior,'position');
 brain.configureAttacks({custom:true,sequence:['paw-swipe'],speed:1});assert.equal(brain.chooseAction(4),'lunge');
 assert.ok(brain.hit({damage:10,heavy:true}));assert.equal(brain.mode,'down');let gotUp=false;
 for(let i=0;i<360;i++){brain.update(1/60,8);if(brain.state===WOLF_V02_GET_UP){gotUp=true;break;}}assert.ok(gotUp,'supported get-up retained');
 assert.ok(brain.hit({damage:10000,heavy:true}));assert.equal(brain.hp,0);assert.equal(brain.mode,'down');assert.notEqual(brain.state,WOLF_CLIPS.watch);
});
