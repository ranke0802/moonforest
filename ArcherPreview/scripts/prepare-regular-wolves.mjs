import fs from 'node:fs';
import path from 'node:path';
import {NullEngine,Scene,TransformNode,Vector3,Quaternion} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import {sourcePath,projectPath} from '../../Sources/resolve-source.mjs';
import {splitGlb,hash} from './resource-pack.js';
import {compressMeshopt} from './meshopt-lossless.js';
import {gltfCatalogMetadata} from './asset-catalog-metadata.mjs';
import {WolfAnimator} from '../src/wolf-animation.js';
import {WolfEncounter} from '../src/wolf-encounter.js';
import {WOLF_CLIPS} from '../src/wolf-spec.js';
import {WOLF_V02_ACTIONS,WOLF_V02_GAIT} from '../src/wolf-v02-spec.js';
import {WOLF_V02_RUN_RAM_OVERLAY} from '../src/wolf-v02-run-ram.js';
import {WARRIOR_DIMENSIONS} from '../src/player-dimensions.js';
import {regularWolfActorScale,regularWolfManifest,regularWolfVersion} from '../src/regular-wolf-spec.js';

const variants=[['gray-wolf','회색 늑대','regular-wolves-r1'],['stylized-wolf','늑대 2','regular-wolves-r1'],['wolf-3','늑대 3','regular-wolves-r1'],['fox','여우','regular-quadrupeds-r1'],['boar','멧돼지','regular-quadrupeds-r1']];
const assets=projectPath('ArcherPreview/public/assets'),content=path.join(assets,'content');
const selection=process.argv.find(arg=>arg.startsWith('--ids='))?.slice(6).split(','),selected=selection?variants.filter(([id])=>selection.includes(id)):variants;
if(selection?.some(id=>!variants.some(([known])=>id===known)))throw new Error('Unknown regular quadruped selection');
const lockPath=projectPath('ArcherPreview/src/regular-wolf-source-locks.json'),catalogPath=projectPath('ArcherPreview/src/regular-wolf-catalog.json');
const sourceLocks=fs.existsSync(lockPath)?JSON.parse(fs.readFileSync(lockPath)):{},catalog=fs.existsSync(catalogPath)?JSON.parse(fs.readFileSync(catalogPath)).entries:[];fs.mkdirSync(content,{recursive:true});
const textureRoot=sourcePath('regular-quadruped-textures-r1'),textureManifest=JSON.parse(fs.readFileSync(path.join(textureRoot,'manifest.json')));
if(variants.some(([id])=>!textureManifest.textures?.[id]))throw new Error('All five original-resolution runtime texture candidates must be ready');
const properties={translation:'position',rotation:'rotationQuaternion',scale:'scaling'};
const bodyRadius=WARRIOR_DIMENSIONS.moveRadius,bodyLow=bodyRadius,bodyHigh=WARRIOR_DIMENSIONS.height-bodyRadius;
const lerp=(a,b,t)=>a+(b-a)*t;
function writeImmutableManifest(file,config){
 const bytes=Buffer.from(JSON.stringify(config,null,2)+'\n');
 if(fs.existsSync(file)){if(!fs.readFileSync(file).equals(bytes))throw new Error('Published actor manifest is immutable; route a new revision before writing: '+path.basename(file));return;}
 fs.writeFileSync(file,bytes);
}
function reader(gltf,files,index){
 const accessor=gltf.accessors[index],view=gltf.bufferViews[accessor.bufferView],buffer=files.get(gltf.buffers[view.buffer].uri).data,width={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16}[accessor.type],bytes={5121:1,5123:2,5125:4,5126:4}[accessor.componentType],offset=(view.byteOffset??0)+(accessor.byteOffset??0),read={5121:'readUInt8',5123:'readUInt16LE',5125:'readUInt32LE',5126:'readFloatLE'}[accessor.componentType];
 return Array.from({length:accessor.count},(_,i)=>Array.from({length:width},(_,k)=>buffer[read](offset+i*(view.byteStride??width*bytes)+k*bytes)));
}
function rootSampler(gltf,files,animation,node,target,fallback){
 const channel=animation.channels.find(c=>c.target.node===node&&c.target.path===target);if(!channel)return ()=>fallback;
 const sampler=animation.samplers[channel.sampler],times=reader(gltf,files,sampler.input).map(v=>v[0]),values=reader(gltf,files,sampler.output);
 return time=>{let i=0;while(i<times.length-2&&time>times[i+1])i++;const j=Math.min(i+1,times.length-1),t=Math.max(0,Math.min(1,(time-times[i])/Math.max(1e-9,times[j]-times[i])));if(target==='rotation'){const q=Quaternion.Slerp(Quaternion.FromArray(values[i]),Quaternion.FromArray(values[j]),t);return q.asArray();}return values[i].map((v,k)=>lerp(v,values[j][k],t));};
}
async function calibrate(split,config,anatomy){
 const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;
 const gltf=structuredClone(split.gltf);for(const buffer of gltf.buffers)buffer.uri='data:application/octet-stream;base64,'+split.files.get(buffer.uri).data.toString('base64');
 const loader=new GLTFFileLoader();loader.skipMaterials=true;const asset=await loader.loadAssetContainerAsync(scene,{json:gltf},'');
 const actor=new TransformNode('profile-actor',scene),carrier=new TransformNode('profile-carrier',scene);carrier.parent=actor;actor.scaling.setAll(config.scale);for(const node of [...asset.meshes,...asset.transformNodes])if(!node.parent)node.parent=carrier;
 const animator=new WolfAnimator(asset,config),nodes=Object.fromEntries(asset.transformNodes.map(node=>[node.name,node])),e={actor,carrier,animator,inverseRoot:Quaternion.Identity(),offset:new Vector3()};
 const point=new Vector3(),attacks={},sample=(name,time)=>{animator.transition(name,{clipTime:time,actionId:-1,blendDuration:0});animator.update(0);WolfEncounter.prototype.alignPose.call(e);};
 // A narrow fitted approach band comes from the exported mouth path and the
 // unchanged player's capsule, rather than copying the alpha's metre ranges.
 for(const action of WOLF_V02_ACTIONS.filter(a=>!a.momentumRam)){
  const clip=config.catalog.find(c=>c.name===action.sourceClip),root0=clip.rootTrack[0],ranges=[];
  for(let i=0;i<=24;i++){
   const time=lerp(action.contactStart,action.contactEnd,i/24);sample(action.sourceClip,time);
   const root=animator.root.position,q=animator.root.rotationQuaternion,yaw=Math.atan2(2*(q.w*q.y+q.x*q.z),1-2*(q.y*q.y+q.z*q.z));actor.rotation.y=yaw;animator.ensurePoseCurrent();
   for(const name of action.contactParts){
    const shape=config.canineProfile.contactShapes[name];Vector3.TransformCoordinatesToRef(Vector3.FromArray(shape.offset),nodes[name].getWorldMatrix(),point);
    point.x+=(root.x-root0[0])*config.scale;point.z+=(root.z-root0[2])*config.scale;
    const radius=shape.radius+bodyRadius,height=Math.max(bodyLow-point.y,point.y-bodyHigh,0),square=radius*radius-point.x*point.x-height*height;
    if(square>0){const half=Math.sqrt(square);ranges.push({from:point.z-half,to:point.z+half,time,name,point:point.asArray()});}
   }
  }
  if(!ranges.length)throw new Error('Fitted attack cannot reach standing player: '+config.canineProfile.id+'/'+action.id);
  // Keep one connected interval near the authored impact; its endpoints are
  // inside the measured path, leaving a small navigation/rounding allowance.
  const best=ranges.reduce((a,b)=>Math.abs(b.time-action.impact)<Math.abs(a.time-action.impact)?b:a),preferred=(best.from+best.to)*.5,min=Math.max(config.balance.radius+bodyRadius+.02,preferred-.07),max=Math.max(min+.02,preferred+.07);
  attacks[action.id]={minDistance:min,maxDistance:max,preferredDistance:(min+max)*.5,range:Math.max(...ranges.map(r=>r.to))+.02,calibration:{part:best.name,sourceTime:best.time,point:best.point,bodyRadius}};
 }
 const overlay=structuredClone(WOLF_V02_RUN_RAM_OVERLAY),phasePoints=[],radius=config.canineProfile.contactShapes.headRam.radius,offset=Vector3.FromArray(config.canineProfile.contactShapes.headRam.offset);
 for(const phase of overlay.contactCenter.phaseTimes){
  actor.rotation.y=0;sample(WOLF_CLIPS.run,overlay.sourcePhaseStart+phase);
  for(const channel of overlay.channels){let i=0;while(i<overlay.phaseTimes.length-2&&phase>overlay.phaseTimes[i+1])i++;const t=(phase-overlay.phaseTimes[i])/Math.max(1e-9,overlay.phaseTimes[i+1]-overlay.phaseTimes[i]),q=Quaternion.Slerp(Quaternion.FromArray(channel.values[i]),Quaternion.FromArray(channel.values[i+1]),Math.max(0,Math.min(1,t)));nodes[channel.node].rotationQuaternion.multiplyInPlace(q);}
  animator.ensurePoseCurrent();Vector3.TransformCoordinatesToRef(offset,nodes.head.getWorldMatrix(),point);phasePoints.push(point.scale(1/config.scale).asArray());
 }
 overlay.contactCenter={...overlay.contactCenter,localOffset:offset.asArray(),radiusWorld:radius,phasePoints};
 const ramReach=Math.max(...phasePoints.map(p=>p[2]*config.scale))+radius+bodyRadius;
 attacks.lunge={minDistance:ramReach+.3,maxDistance:ramReach+2.8,preferredDistance:ramReach+1.0,range:ramReach+2.8};
 actor.rotation.y=0;const jaw=config.canineProfile.contactShapes.jawMaul;sample('Wolf_Close_Ram_Ground_Maul_V02',1.7833333333);Vector3.TransformCoordinatesToRef(Vector3.FromArray(jaw.offset),nodes.jaw.getWorldMatrix(),point);
 // An accepted ram owns the existing narrow pair-clearance lease. The
 // standing player radius must not stop a small mouth outside the prone body.
 const originalCatchDistance=Math.max(config.balance.radius+.02,point.z);
 // The boar's conservative navigation circle includes barrel padding.
 // Its accepted-prone pair can use the measured body half-width plus a margin,
 // Scale the approved 2.5 m body's paired margins with its current body size;
 // the player capsule remains its actual size throughout contact calibration.
 const pairScale=config.height/2.5;
 const ramPairClearance=config.canineProfile.id==='boar'?Math.max(config.balance.radius-.18*pairScale,anatomy.nativeDimensions[0]*config.scale*.5):undefined;
 const catchDistance=ramPairClearance===undefined?originalCatchDistance:Math.max(ramPairClearance+.04*pairScale,originalCatchDistance-.16*pairScale);
 asset.dispose();loader.dispose();scene.dispose();engine.dispose();return {attacks,ramReach,catchDistance,ramPairClearance,runRamOverlay:overlay};
}

for(const [id,label,sourceId]of selected){
 const directory=sourcePath(sourceId,id),meta=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'))),anatomyBytes=fs.readFileSync(path.join(directory,'anatomy.json')),anatomy=JSON.parse(anatomyBytes),bytes=fs.readFileSync(path.join(directory,meta.model));
 const actorScale=regularWolfActorScale(id),scale=anatomy.scale*actorScale,height=anatomy.height*actorScale,manifestName=regularWolfManifest(id),version=regularWolfVersion(id);
 if(hash(bytes)!==meta.modelSha256)throw new Error('Regular wolf source hash differs: '+id);
 if(meta.motionSourceSha256!=='38057d9820c296c883a5545fc7528bffdda88e78387b9b5b1fe117b89cb09bce'||meta.clips!==22||meta.joints!==28)throw new Error('Unexpected regular wolf motion source: '+id);
 const split=splitGlb(bytes,{baseColorOnly:true}),gltf=split.gltf,root=gltf.nodes.findIndex(n=>n.name==='root');
 const textureProfile=textureManifest.textures[id],textureBytes=fs.readFileSync(path.join(textureRoot,textureProfile.file)),textureName=hash(textureBytes)+'.ktx2';
 if(hash(textureBytes)!==textureProfile.sha256||textureProfile.width!==4096||textureProfile.height!==4096)throw new Error('Regular quadruped texture profile differs: '+id);
 for(const image of gltf.images)if(hash(split.files.get(image.uri).data)!==textureProfile.sourceImageSha256)throw new Error('Runtime texture does not derive from this original image: '+id);
 const catalogClips=gltf.animations.map(animation=>{
  const native=anatomy.clips.find(c=>c.name===animation.name),fps=native.fps??60,duration=native.duration,p=rootSampler(gltf,split.files,animation,root,'translation',[0,0,0]),r=rootSampler(gltf,split.files,animation,root,'rotation',[0,0,0,1]),rootTrack=[],yawTrack=[],count=Math.round(duration*fps)+1;
  for(let i=0;i<count;i++){const time=Math.min(duration,i/fps),q=r(time);rootTrack.push(p(time));yawTrack.push(Math.atan2(2*(q[3]*q[1]+q[0]*q[2]),1-2*(q[1]*q[1]+q[2]*q[2])));}
  return {...native,rootMotionScale:anatomy.nativeRootMotionScale*scale,orbitRadius:native.orbitRadius?native.orbitRadius*anatomy.nativeRootMotionScale:undefined,rootTrack,yawTrack,groundTrack:Array(count).fill(0)};
 });
 if(!anatomy.hurtVolumes?.length)throw new Error('Fitted hurt volumes are required: '+id);
 const shapes=Object.fromEntries(Object.entries(anatomy.contactShapes).map(([name,shape])=>[name,{...shape,radius:shape.radius*scale}]));
 for(const name of ['head','jaw','paw','headRam','jawMaul'])if(!shapes[name])throw new Error('Fitted contact shape missing: '+id+'/'+name);
 const dimensions=anatomy.dimensions.map(v=>v*actorScale),balance={hp:300,radius:Math.max(.25*actorScale,dimensions[0]*.64),separationRadius:Math.max(.32*actorScale,dimensions[0]*.76)};
 const canineProfile={id,version:1,sourceSha256:hash(bytes),anatomySha256:hash(anatomyBytes),motionSourceSha256:meta.motionSourceSha256,runSourceSpeed:WOLF_V02_GAIT.runSourceSpeed*anatomy.nativeRootMotionScale,hurtVolumes:anatomy.hurtVolumes,contactShapes:shapes,forepawPadHeight:dimensions[1]*.035};
 const config={name:label,category:'monster',version,sourceAssetId:sourceId,sourceVariant:id,sourceSha256:hash(bytes),scale,height,bounds:anatomy.nativeDimensions,animations:Object.fromEntries(gltf.animations.map(a=>[a.name,a.name])),catalog:catalogClips,canineProfile,balance,rendering:{shared:'existing-monster-toon-and-wolf-style',lod:'original-full-quality'},texture:{...textureProfile,profile:textureManifest.profile,sourceAssetId:'regular-quadruped-textures-r1',policy:'Original 4K resolution retained; UASTC encoding is a separate runtime candidate, not pixel-identical to the original JPEG preserved in Sources.'}};
 Object.assign(canineProfile,await calibrate(split,config,anatomy));
 split.files.set(textureName,{data:textureBytes});gltf.images=gltf.images.map(image=>({...image,uri:textureName,mimeType:'image/ktx2'}));
 for(const texture of gltf.textures){const source=texture.source;texture.extensions={...texture.extensions,KHR_texture_basisu:{source}};delete texture.source;}
 for(const key of ['extensionsUsed','extensionsRequired'])gltf[key]=[...new Set([...(gltf[key]??[]),'KHR_texture_basisu'])];
 const packed=await compressMeshopt(gltf,split.files);for(const [name,file]of packed.files)fs.writeFileSync(path.join(content,name),file.data);
 Object.assign(config,{model:'./content/'+packed.model,resources:[...packed.files.keys()].map(name=>'./content/'+name),geometryCompression:packed.stats});
 writeImmutableManifest(path.join(assets,manifestName+'.json'),config);
 const info=gltfCatalogMetadata(gltf),previous=catalog.findIndex(entry=>entry.assetId===id);if(previous>=0)catalog.splice(previous,1);catalog.push({assetId:id,version,name:label,category:'monster',contentHash:hash(packed.files.get(packed.model).data),runtime:{manifest:'assets/'+manifestName+'.json',assetKey:id,model:'assets/content/'+packed.model},geometry:{...info,lods:[]},bounds:{size:anatomy.nativeDimensions,posed:true},referenceHeight:height,units:{world:'metres',metersPerSourceUnit:scale},reviewStatus:'candidate-awaiting-user-review'});
 sourceLocks[id]={sourceSha256:hash(bytes),anatomySha256:hash(anatomyBytes),motionSourceSha256:meta.motionSourceSha256,scale,height};
 fs.writeFileSync(path.join(directory,manifestName===id?'runtime-manifest.json':'runtime-manifest-'+manifestName.slice(id.length+1)+'.json'),JSON.stringify(config,null,2)+'\n');
 console.log(JSON.stringify({id,triangles:info.triangles,joints:info.bones,clips:info.clips,scale:config.scale,height:config.height,sourceSha256:hash(bytes),resources:packed.files.size,bytes:[...packed.files.values()].reduce((sum,file)=>sum+file.data.length,0),attacks:canineProfile.attacks,ramReach:canineProfile.ramReach,catchDistance:canineProfile.catchDistance}));
}
fs.writeFileSync(lockPath,JSON.stringify(sourceLocks,null,2)+'\n');
fs.writeFileSync(catalogPath,JSON.stringify({version:1,release:'moonforest-0.2',entries:catalog.sort((a,b)=>a.assetId.localeCompare(b.assetId))},null,2)+'\n');
