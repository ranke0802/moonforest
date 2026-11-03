// From the packed asset and the three shipped death curves to the final sparse
// corrective. No preview geometry.bin, external Blender scene or AI image input.
// The default verifies; --write writes only reports/r3/reproduced-depth-data.js.
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {NullEngine,Scene,TransformNode,Vector3,VertexBuffer,VertexData,Matrix,Quaternion} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/index.js';
import {readRuntimeGltf} from '../../../tests/helpers/read-runtime-gltf.js';
import {MourningElenaAnimator} from '../../../src/mourning-elena-animation.js';
import {MOURNING_SIZE_SCALE} from '../../../src/elena-spec.js';
import {MOURNING_DEATH_DEPTH_DELTAS} from '../../../src/mourning-death-depth-data.js';

const dir=new URL('./',import.meta.url),assets=new URL('../../../public/assets/',dir),config=JSON.parse(readFileSync(new URL('mourning-elena.json',assets))),packed=await readRuntimeGltf(new URL(config.model,assets)),json=structuredClone(packed.gltf);
for(const buffer of json.buffers)if(buffer.uri)buffer.uri='data:application/octet-stream;base64,'+packed.files.get(buffer.uri).data.toString('base64');
const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;
const loader=new GLTFFileLoader();loader.skipMaterials=true;const asset=await loader.loadAssetContainerAsync(scene,{json},'');asset.addAllToScene();
const actor=new TransformNode('reproduce',scene),carrier=new TransformNode('center',scene);actor.scaling.setAll(config.scale*MOURNING_SIZE_SCALE);carrier.parent=actor;carrier.position.copyFromFloats(...config.centerOffset);for(const node of new Set([...asset.meshes,...asset.transformNodes]))if(!node.parent)node.parent=carrier;
const animator=new MourningElenaAnimator(asset,config,actor);animator.reset();animator.transition('cast',{clipTime:1.2});animator.update(.1);animator.transition('dead');for(let i=0;i<312;i++)animator.update(1/60);for(const skeleton of asset.skeletons)skeleton.prepare(true);
const mesh=asset.meshes.find(mesh=>mesh.name==='Elina_Chimera_Skin'),manager=mesh.morphTargetManager,target=manager.getTargetByName('Death_Ground_Contact'),oldPositions=target.getPositions(),oldNormals=target.getNormals(),world=mesh.computeWorldMatrix(true),worldInverse=world.clone().invert(),skin=mesh.skeleton.getTransformMatrices(mesh),ji=mesh.getVerticesData(VertexBuffer.MatricesIndicesKind),jw=mesh.getVerticesData(VertexBuffer.MatricesWeightsKind),topology=mesh.getIndices(),boneNames=Object.fromEntries(mesh.skeleton.bones.map(b=>[b.getIndex(),b.name])),thigh=mesh.skeleton.bones.find(b=>b.name==='DEF_FrontFoot.R_Thigh').getIndex(),shin=mesh.skeleton.bones.find(b=>b.name==='DEF_FrontFoot.R_Shin').getIndex(),knee=asset.transformNodes.find(n=>n.name==='DEF_FrontFoot.R_Shin').getAbsolutePosition().clone(),ankle=asset.transformNodes.find(n=>n.name==='DEF_FrontFoot.R_Foot').getAbsolutePosition().clone(),smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
function capture(){const ps=mesh.getPositionData(true,true),ns=mesh.getNormalsData(true,true),positions=new Float32Array(ps.length),normals=new Float32Array(ns.length),p=new Vector3(),n=new Vector3();for(let i=0;i<ps.length;i+=3){Vector3.TransformCoordinatesFromFloatsToRef(ps[i],ps[i+1],ps[i+2],world,p);Vector3.TransformNormalFromFloatsToRef(ns[i],ns[i+1],ns[i+2],world,n);n.normalize();positions.set(p.asArray(),i);normals.set(n.asArray(),i);}return{positions,normals};}
const baseline=capture();
function changed(positions){const ids=[];for(let i=0;i<positions.length;i+=3)if(Math.hypot(...[0,1,2].map(a=>positions[i+a]-baseline.positions[i+a]))>1e-7)ids.push(i/3);return ids;}
function normalsFor(positions,ids){
 const before=new Float32Array(positions.length),after=new Float32Array(positions.length),normals=baseline.normals.slice();VertexData.ComputeNormals(baseline.positions,topology,before,{useRightHandedSystem:true});VertexData.ComputeNormals(positions,topology,after,{useRightHandedSystem:true});
 const from=new Vector3(),to=new Vector3(),custom=new Vector3(),n=new Vector3(),q=Quaternion.Identity(),matrix=Matrix.Identity();
 for(const id of ids){Vector3.FromArrayToRef(before,id*3,from);Vector3.FromArrayToRef(after,id*3,to);Vector3.FromArrayToRef(normals,id*3,custom);from.normalize();to.normalize();custom.normalize();Quaternion.FromUnitVectorsToRef(from,to,q);q.toRotationMatrix(matrix);Vector3.TransformNormalToRef(custom,matrix,n);n.normalize();normals.set(n.asArray(),id*3);}return normals;
}
function inverseBake(positions,normals,ids){
 const current=mesh.getPositionData(true,true),preNormals=mesh.getNormalsData(false,true),p=new Vector3(),delta=new Vector3(),normal=new Vector3(),matrix=Matrix.Identity(),inverse=Matrix.Identity(),data=[];
 for(const id of ids){const at=id*3;Vector3.TransformCoordinatesFromFloatsToRef(current[at],current[at+1],current[at+2],world,p);delta.set(positions[at]-p.x,positions[at+1]-p.y,positions[at+2]-p.z);const blended=new Array(16).fill(0);for(let j=0;j<4;j++)for(let k=0;k<16;k++)blended[k]+=skin[ji[id*4+j]*16+k]*jw[id*4+j];Matrix.FromArrayToRef(blended,0,matrix);matrix.invertToRef(inverse);Vector3.TransformNormalToRef(delta,worldInverse,delta);Vector3.TransformNormalToRef(delta,inverse,delta);normal.set(normals[at],normals[at+1],normals[at+2]);Vector3.TransformNormalToRef(normal,worldInverse,normal);normal.normalize();Vector3.TransformNormalToRef(normal,inverse,normal);normal.normalize();data.push(id,...delta.asArray(),normal.x-preNormals[at],normal.y-preNormals[at+1],normal.z-preNormals[at+2]);}return data.map(Math.fround);
}
function install(data){
 const positions=Float32Array.from(oldPositions),normals=Float32Array.from(oldNormals);for(let at=0;at<data.length;at+=7)for(let a=0;a<3;a++){positions[data[at]*3+a]+=data[at+1+a];normals[data[at]*3+a]+=data[at+4+a];}
 manager.areUpdatesFrozen=true;try{target.setPositions(positions);target.setNormals(normals);manager.optimizeInfluencers=manager.isUsingTextureForTargets;manager.numMaxInfluencers=manager.numTargets;manager._mustSynchronize=true;}finally{manager.areUpdatesFrozen=false;}
}
// First sculpt: soften only the anterior hip/thigh junction and attached hem.
const softcap=baseline.positions.slice();
for(let id=0;id<softcap.length/3;id++){
 let leg=0;for(let j=0;j<4;j++)if(ji[id*4+j]===thigh||ji[id*4+j]===shin)leg+=jw[id*4+j];const at=id*3,x=softcap[at],y=softcap[at+1],z=softcap[at+2],hipRegion=((x-1.5)/.75)**2+((y-1.15)/.6)**2+((z-1.4)/.65)**2,mask=Math.max(1-smooth((Math.sqrt(hipRegion)-.25)/.75),smooth((leg-.1)/.7));if(mask<=0||y<.005||y>1.75||x<.65)continue;
 const t=smooth((y-.2)/1.2);let front=1.5-.3*t;if(y<knee.y+.22&&Math.abs(y-knee.y)<.24)front=Math.min(front,knee.z+Math.sqrt(Math.max(0,.24*.24-(y-knee.y)**2)));const excess=z-front;if(excess<=0)continue;const dz=(front+.045*Math.tanh(excess/.045)-z)*mask*smooth((1.75-y)/.25);if(Math.abs(dz)>1e-7)softcap[at+2]=z+dz;
}
const softcapIds=changed(softcap),softcapNormals=normalsFor(softcap,softcapIds);install(inverseBake(softcap,softcapNormals,softcapIds));
// Match the approved intermediate's actual Float32 morph/skin round trip.
const final=capture().positions;
for(let id=0;id<final.length/3;id++){
 let leg=0,shinWeight=0,footWeight=0;for(let j=0;j<4;j++){const name=boneNames[ji[id*4+j]],w=jw[id*4+j];if(name.startsWith('DEF_FrontFoot.R_'))leg+=w;if(name==='DEF_FrontFoot.R_Shin')shinWeight+=w;if(/^DEF_FrontFoot.R_(Foot|Toe)/.test(name))footWeight+=w;}if(leg<.01)continue;
 const at=id*3,x=final[at],y=final[at+1],z=final[at+2];if(x<.65||y>1.1||z>1.45)continue;const t=Math.max(0,Math.min(1,(knee.z-z)/(knee.z-ankle.z))),blend=smooth(t),axisY=knee.y+(ankle.y-knee.y)*t,footBlend=smooth((y-.025)/.26),dy=(-.11*blend-(y-axisY)*.1*blend)*shinWeight-.11*footBlend*footWeight,dz=.12*blend*shinWeight+.12*footBlend*footWeight;if(Math.abs(dy)+Math.abs(dz)<1e-8)continue;final[at+1]=Math.max(0,y+dy);final[at+2]=z+dz;
}
manager.areUpdatesFrozen=true;target.setPositions(oldPositions);target.setNormals(oldNormals);manager._mustSynchronize=true;manager.areUpdatesFrozen=false;
const ids=changed(final),normals=normalsFor(final,ids),data=inverseBake(final,normals,ids);assert.equal(ids.length,528);assert.equal(data.length,MOURNING_DEATH_DEPTH_DELTAS.length);let maximumBindValueError=0;for(let i=0;i<data.length;i++)maximumBindValueError=Math.max(maximumBindValueError,Math.abs(data[i]-MOURNING_DEATH_DEPTH_DELTAS[i]));assert.ok(maximumBindValueError<2e-6,'Reproduction drift: '+maximumBindValueError);
writeFileSync(new URL('reproduced-reference.json',dir),JSON.stringify({coordinateSystem:'native x,y,z',vertices:ids.map(id=>({id,position:Array.from(final.slice(id*3,id*3+3)),normal:Array.from(normals.slice(id*3,id*3+3))}))}));
if(process.argv.includes('--write'))writeFileSync(new URL('reproduced-depth-data.js',dir),'// Local right front leg, hip/thigh junction and attached hem. Existing death target; no new morph slot.\nexport const MOURNING_DEATH_DEPTH_VERTEX_COUNT=36196;\nexport const MOURNING_DEATH_DEPTH_DELTAS=Object.freeze('+JSON.stringify(data)+');\n');
const report={sourceModel:config.model,source:'Packed glTF/buffers plus the three shipped local death tracks; no historical geometry.bin input.',changedVertices:ids.length,maximumBindValueError,withinFloat32SkinTolerance:true,runtimeSourceWritten:false};writeFileSync(new URL('reproduction-validation.json',dir),JSON.stringify(report,null,2)+'\n');console.log(report);animator.dispose();asset.dispose();scene.dispose();engine.dispose();
