// Independent actual SDK draw/LOD/shadow comparison; no browser/GPU claim.
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {NullEngine,Scene,MeshBuilder,StandardMaterial,FreeCamera,Vector3,TransformNode,DirectionalLight,ShadowGenerator,Mesh,Node,InstancedMesh} from '@babylonjs/core';
import {VillageActiveCandidates} from '../../src/village-active-candidates.js';
import {prepareMapMaterials} from '../../src/map-shader-cache.js';

const baseline='14c972c',root=fileURLToPath(new URL('../../',import.meta.url)),oldSource=execFileSync('git',['show',baseline+':ArcherPreview/src/village-active-candidates.js'],{cwd:root,encoding:'utf8'});
const Baseline=new Function('InstancedMesh','Mesh','Node',oldSource.replace(/^import[^\n]+\n/,'').replace('export class VillageActiveCandidates','class VillageActiveCandidates')+'\nreturn VillageActiveCandidates;')(InstancedMesh,Mesh,Node);
const hash=value=>createHash('sha256').update(value).digest('hex'),candidateSourceSha256=hash(readFileSync(new URL('../../src/village-active-candidates.js',import.meta.url)));
function make(optimized){
 const engine=new NullEngine();engine.getCaps().instancedArrays=true;
 const scene=new Scene(engine);scene.useRightHandedSystem=true;
 const camera=new FreeCamera('camera',new Vector3(0,3,-6),scene);camera.setTarget(Vector3.Zero());
 const light=new DirectionalLight('key',new Vector3(-.2,-1,.3),scene),shadow=new ShadowGenerator(256,light);
 const material=new StandardMaterial('paint',scene),source=MeshBuilder.CreateBox('near',{},scene),mid=MeshBuilder.CreateSphere('mid',{segments:6},scene),far=MeshBuilder.CreateBox('far',{size:.7},scene);
 for(const mesh of [source,mid,far])mesh.material=material;
 source.addLODLevel(10,mid);source.addLODLevel(20,far);for(const mesh of [source,mid,far]){mesh._instanceDataStorage.useMonoDataStorageRenderPass=false;const before=mesh._preActivate;mesh._preActivate=function(...args){preActivate.push(this.name);return before.apply(this,args);};}
 const roots=[],emptyRoots=[],instances=[],draws=[],preActivate=[];
 for(let i=0;i<24;i++){
  const root=new TransformNode('root-'+i,scene),empty=new Mesh('clone-root-'+i,scene),mesh=source.createInstance('instance-'+i);empty.parent=root;mesh.parent=empty;emptyRoots.push(empty);root.position.set((i%6-2.5)*1.3,0,Math.floor(i/6)*1.4);
  root.computeWorldMatrix(true);mesh.computeWorldMatrix(true);mesh.freezeWorldMatrix();roots.push(root);instances.push(mesh);shadow.addShadowCaster(mesh,false);
 }
 source.isVisible=false;mid.isVisible=false;far.isVisible=false;
 const dynamic=MeshBuilder.CreateBox('dynamic',{size:.4},scene);dynamic.position.y=2;dynamic.material=material;
 for(const mesh of [source,mid,far,dynamic]){
  const original=mesh._processRendering;
  mesh._processRendering=function(renderMesh,sub,effect,mode,batch,...args){
   draws.push({source:mesh.name,intermediate:scene._isInIntermediateRendering(),instances:(batch.visibleInstances?.[sub._id]??[]).map(m=>m.name),self:!!batch.renderSelf[sub._id]});
   return original.call(this,renderMesh,sub,effect,mode,batch,...args);
  };
 }
 const previous=scene.getActiveMeshCandidates,provider=optimized?new VillageActiveCandidates(scene):new Baseline(scene);for(const mesh of instances)provider?.add(mesh);for(const empty of emptyRoots)provider?.addEmptyRoot(empty);
 return {engine,scene,camera,shadow,roots,instances,draws,provider,previous,emptyRoots,preActivate,sources:[source,mid,far,dynamic]};
}
const fixtures=[make(false),make(true)],snapshots=[];
try{
 for(const f of fixtures){await prepareMapMaterials(f.sources);await f.shadow.forceCompilationAsync({useInstances:true});}
 const patterns=[{radius:6,mask:i=>true},{radius:16,mask:i=>i%2===0},{radius:28,mask:i=>true},{radius:7,mask:i=>false},{radius:7,mask:i=>true},{radius:16,mask:i=>i%3===0},{radius:6,mask:i=>true}];
 for(const [index,pattern]of patterns.entries()){
  const results=[];
  for(const f of fixtures){
   for(const [i,root]of f.roots.entries())root.setEnabled(pattern.mask(i));f.camera.position.set(0,3,-pattern.radius);f.camera.setTarget(new Vector3(0,0,2));f.draws.length=0;f.preActivate.length=0;
   f.engine.beginFrame();f.scene.render();f.engine.endFrame();
   results.push({sourcePreActivate:f.preActivate.slice(),draws:structuredClone(f.draws),active:f.scene.getActiveMeshes().data.slice(0,f.scene.getActiveMeshes().length).map(m=>m.name),
    lod:f.instances.filter(m=>m.isEnabled()).map(m=>[m.name,m._currentLOD?.name]),shadowList:f.shadow.getShadowMap().renderList.map(m=>m.name)});
  }
  assert.deepEqual(results[1],results[0],'native draw batches, active ordering, selected LOD and shadow renderList at step '+index);
  snapshots.push({step:index,radius:pattern.radius,enabled:fixtures[1].instances.filter(m=>m.isEnabled()).length,draws:results[0].draws,sourcePreActivate:results[0].sourcePreActivate,stats:{...fixtures[1].provider.stats}});
 }
 assert.ok(snapshots.some(s=>s.draws.length>0),'comparison includes actual native draw submissions');
 const f=fixtures[1],helper=f.provider,mutationChecks=[];
 const candidateNames=()=>{const list=f.scene.getActiveMeshCandidates();return list.data.slice(0,list.length).map(m=>m.name);};
 for(const field of ['material','subMeshes','skeleton','morphTargetManager','actionManager','isReady','isEnabled','getTotalVertices']){
  const empty=new Mesh('mutated-'+field,f.scene);empty.setEnabled(false);helper.addEmptyRoot(empty);assert.ok(!candidateNames().includes(empty.name));
  const original=empty[field];empty[field]=field==='subMeshes'?[{}]:field==='isReady'?()=>true:field==='isEnabled'?()=>false:field==='getTotalVertices'?()=>0:{};
  assert.ok(candidateNames().includes(empty.name),field+' mutation must fail open');empty[field]=original;empty.dispose();mutationChecks.push(field);
 }
 const grown=new Mesh('empty-gains-native-geometry',f.scene);grown.setEnabled(false);helper.addEmptyRoot(grown);assert.ok(!candidateNames().includes(grown.name));
 f.sources[0].geometry.applyToMesh(grown);assert.ok(candidateNames().includes(grown.name));grown.dispose();mutationChecks.push('nativeGeometry');
 const own=helper.provider,external=()=>own();f.scene.getActiveMeshCandidates=external;helper.dispose();
 assert.equal(f.scene.getActiveMeshCandidates,external);assert.equal(external().data,f.scene.meshes);assert.equal(external().length,f.scene.meshes.length);assert.equal(helper.result.length,0);
 f.scene.getActiveMeshCandidates=f.previous;const plain=new VillageActiveCandidates(f.scene);plain.dispose();assert.equal(f.scene.getActiveMeshCandidates,f.previous);
 assert.equal(hash(readFileSync(new URL('../../src/village-active-candidates.js',import.meta.url))),candidateSourceSha256,'candidate source stays frozen');
 const report={baseline,baselineCandidateSourceSha256:hash(oldSource),candidateSourceSha256,generatedAt:new Date().toISOString(),steps:snapshots.length,nativeDrawBatchAndLodAndShadowEquality:true,sourceMeshesPreserved:true,sourcePreActivateTraceIdentical:true,mutationChecks,externalWrapperAfterDisposePassesThrough:true,ownProviderRestored:true,
  snapshots,limitation:'NullEngine validates native CPU selection/batch/LOD/shadow-list logic; no actual GPU shader compilation, pixels, device FPS or browser test.'};
 writeFileSync(new URL('verification-native-lod'+(process.env.VERIFICATION_REPORT_SUFFIX??'')+'.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({steps:report.steps,equal:true,drawCounts:snapshots.map(s=>s.draws.length),mutationChecks,candidateCounts:snapshots.map(s=>s.stats)}));
}finally{for(const f of fixtures){f.provider?.dispose();f.engine.dispose();}}
