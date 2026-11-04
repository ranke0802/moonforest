// Independent provider oracle against immutable git14c972c. CPU logic only.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {NullEngine,Scene,Mesh,Node,InstancedMesh,MeshBuilder,TransformNode,FreeCamera,Vector3,StandardMaterial} from '@babylonjs/core';
import {VillageActiveCandidates} from '../../src/village-active-candidates.js';

const root=fileURLToPath(new URL('../../',import.meta.url)),baseline='14c972c';
const oldSource=execFileSync('git',['show',baseline+':ArcherPreview/src/village-active-candidates.js'],{cwd:root,encoding:'utf8'});
const Baseline=new Function('InstancedMesh','Mesh','Node',oldSource.replace(/^import[^\n]+\n/,'').replace('export class VillageActiveCandidates','class VillageActiveCandidates')+'\nreturn VillageActiveCandidates;')(InstancedMesh,Mesh,Node);
const hash=value=>createHash('sha256').update(value).digest('hex');
const sourceHash=hash(readFileSync(new URL('../../src/village-active-candidates.js',import.meta.url)));
const cases=[],observations=[];
const names=list=>list.data.slice(0,list.length).map(mesh=>mesh.name);
function make(){
 const engine=new NullEngine(),scene=new Scene(engine),camera=new FreeCamera('camera',new Vector3(0,4,-10),scene);camera.setTarget(Vector3.Zero());
 const source=MeshBuilder.CreateBox('source',{},scene);source.material=new StandardMaterial('material',scene);source.isVisible=false;
 const previous=scene.getActiveMeshCandidates,before=new Baseline(scene);scene.getActiveMeshCandidates=previous;const after=new VillageActiveCandidates(scene);
 const instance=(name,enabled=true)=>{const parent=new TransformNode(name+'-parent',scene),empty=new Mesh(name+'-empty',scene),mesh=source.createInstance(name);empty.parent=parent;mesh.parent=empty;mesh.computeWorldMatrix(true);mesh.freezeWorldMatrix();parent.setEnabled(enabled);return {parent,empty,mesh};};
 const register=entry=>{before.add(entry.mesh);after.add(entry.mesh);before.addEmptyRoot(entry.empty);after.addEmptyRoot(entry.empty);};
 const equal=label=>assert.deepEqual(names(after.provider()),names(before.provider()),label);
 const dispose=()=>{scene.getActiveMeshCandidates=after.provider;after.dispose();before.dispose();scene.dispose();engine.dispose();};
 return {engine,scene,camera,source,previous,before,after,instance,register,equal,dispose};
}
async function check(name,run){let f;try{f=make();await run(f);cases.push({name,passed:true});}catch(error){cases.push({name,passed:false,error:error.stack});}finally{f?.dispose();}}

await check('registration, ancestor enable propagation, reparenting and unfreeze retain baseline semantics',f=>{
 const a=f.instance('a',false),b=f.instance('b');f.register(a);f.register(b);f.equal('initial');
 for(let i=0;i<12;i++){a.parent.setEnabled(i%2===0);b.empty.setEnabled(i%3===0);f.equal('state '+i);}
 const disabled=new TransformNode('disabled-parent',f.scene);disabled.setEnabled(false);a.mesh.parent=disabled;f.equal('reparent disabled');a.mesh.parent=null;f.equal('reparent enabled');
 a.mesh.unfreezeWorldMatrix();a.mesh.setEnabled(false);f.equal('registered instance later unfrozen');
 const unowned=f.source.createInstance('unfrozen-unowned');unowned.setEnabled(false);f.before.add(unowned);f.after.add(unowned);f.equal('unfrozen rejection');
 f.before.add(f.source);f.after.add(f.source);f.before.addEmptyRoot(f.source);f.after.addEmptyRoot(f.source);f.equal('source rejection');
 assert.ok(names(f.after.provider()).includes('source'),'invisible source retained');
});

await check('late root attachments and native-method overrides fail open and restore immediately',f=>{
 const a=f.instance('a',false);f.register(a);f.equal('initial');
 for(const field of ['material','subMeshes','skeleton','morphTargetManager','actionManager','isReady','isEnabled','getTotalVertices']){
  const had=Object.hasOwn(a.empty,field),old=a.empty[field];
  a.empty[field]=field==='subMeshes'?[{}]:field==='isReady'?()=>true:field==='isEnabled'?()=>false:field==='getTotalVertices'?()=>0:{};
  f.equal('attach '+field);assert.ok(names(f.after.provider()).includes(a.empty.name),field+' is admitted');
  if(had)a.empty[field]=old;else delete a.empty[field];f.equal('restore '+field);
 }
 for(const field of ['isReady','isEnabled']){const old=a.mesh[field];a.mesh[field]=field==='isReady'?()=>true:()=>false;f.equal('instance '+field);assert.ok(names(f.after.provider()).includes(a.mesh.name));delete a.mesh[field];assert.equal(a.mesh[field],old);f.equal('instance restore '+field);}
 f.source.geometry.applyToMesh(a.empty);f.equal('geometry attach');assert.ok(names(f.after.provider()).includes(a.empty.name));
});

await check('Babylon mesh add/remove/dispose preserve exact order after same-length replacements and source LOD additions',f=>{
 const a=f.instance('a',false),b=f.instance('b');f.register(a);f.register(b);f.equal('initial');
 const dynamic=MeshBuilder.CreateBox('dynamic',{},f.scene);f.equal('dynamic add');
 f.scene.removeMesh(dynamic);f.scene.addMesh(dynamic);f.equal('remove/add order');
 f.scene.removeMesh(a.mesh);f.equal('registered remove');f.scene.addMesh(a.mesh);f.equal('registered readd');
 const oldLength=f.scene.meshes.length;dynamic.dispose();const replacement=new Mesh('same-length-replacement',f.scene);assert.equal(f.scene.meshes.length,oldLength);f.equal('same length replacement');
 const lod=MeshBuilder.CreateSphere('lod-source',{segments:4},f.scene);f.source.addLODLevel(10,lod);lod.isVisible=false;f.equal('invisible LOD source');assert.ok(names(f.after.provider()).includes(lod.name));
 b.parent.dispose();f.equal('placement subtree dispose');replacement.dispose();f.equal('final remove');
});

await check('camera replacement, multi-camera and FrameGraph preserve native fallback identity',f=>{
 const a=f.instance('a',false);f.register(a);f.equal('initial');
 const camera2=new FreeCamera('camera2',new Vector3(0,4,10),f.scene);camera2.setTarget(Vector3.Zero());f.scene.activeCamera=camera2;f.equal('camera replacement');
 f.scene.activeCameras=[f.camera,camera2];assert.equal(f.after.provider().data,f.scene.meshes);f.equal('multi camera');
 f.scene.activeCameras=[];f.scene.frameGraph={};assert.equal(f.after.provider().data,f.scene.meshes);f.equal('FrameGraph');f.scene.frameGraph=undefined;f.equal('FrameGraph removed');
});

await check('custom provider subset, changing list identity, receiver, and retained wrapper disposal',f=>{
 f.after.dispose();f.before.dispose();const a=f.instance('a',false),subset={data:[a.mesh],length:1};let received;
 const custom=function(){received=this;return subset;};f.scene.getActiveMeshCandidates=custom;const helper=new VillageActiveCandidates(f.scene);helper.add(a.mesh);
 assert.equal(helper.provider(),subset);assert.equal(received,f.scene);const own=helper.provider,wrapper=()=>own();f.scene.getActiveMeshCandidates=wrapper;helper.dispose();helper.dispose();
 assert.equal(f.scene.getActiveMeshCandidates,wrapper);assert.equal(wrapper(),subset);assert.equal(helper.result.length,0);assert.equal(helper.result.data.length,0);
 f.scene.getActiveMeshCandidates=f.previous;
});

await check('scene.meshes array replacement is detected without mesh events',f=>{
 const a=f.instance('a',false),b=f.instance('b');f.register(a);f.register(b);f.equal('initial');
 const original=f.scene.meshes;f.scene.meshes=original.slice().reverse();f.equal('replaced array');f.scene.meshes=original;f.equal('restored array');
});

await check('50 registry lifetimes release scene and tracked enabled-state observers',async f=>{
 f.after.dispose();f.before.dispose();f.scene.getActiveMeshCandidates=f.previous;
 const a=f.instance('a',false),observables=[f.scene.onNewMeshAddedObservable,f.scene.onMeshRemovedObservable,f.scene.onDisposeObservable,a.parent.onEffectiveEnabledStateChangedObservable,a.empty.onEffectiveEnabledStateChangedObservable,a.mesh.onEffectiveEnabledStateChangedObservable,a.empty.onDisposeObservable,a.mesh.onDisposeObservable].filter(Boolean);
 // Observable.remove marks observers inactive immediately, physically splicing
 // on the next task. Check both live subscriptions and the drained raw arrays.
 await new Promise(resolve=>setTimeout(resolve,0));
 const counts=()=>observables.map(value=>value.observers.filter(observer=>!observer._willBeUnregistered).length),initial=counts();
 for(let i=0;i<50;i++){const helper=new VillageActiveCandidates(f.scene);helper.add(a.mesh);helper.addEmptyRoot(a.empty);helper.provider();a.parent.setEnabled(i%2===0);helper.provider();helper.dispose();assert.equal(f.scene.getActiveMeshCandidates,f.previous);assert.deepEqual(counts(),initial,'live observer counts at lifetime '+i);}
 await new Promise(resolve=>setTimeout(resolve,0));assert.deepEqual(observables.map(value=>value.observers.length),initial,'deferred observer arrays drain');
});

// Public-array reordering bypasses Babylon's lifecycle events. Record explicitly;
// production uses scene APIs, but do not silently call this full mutation parity.
await check('direct same-length public array reorder audit',f=>{
 const a=f.instance('a',false),b=f.instance('b');f.register(a);f.register(b);f.equal('initial');f.scene.meshes.reverse();
 const expected=names(f.before.provider()),actual=names(f.after.provider());f.after.invalidate();f.equal('explicit invalidation supports foreign direct reorder');observations.push({name:'direct scene.meshes.reverse without Babylon event',equal:JSON.stringify(actual)===JSON.stringify(expected),explicitInvalidateRestoresExactOrder:true,expected,actual,productionDirectMutationSearchMatches:0});
});

assert.equal(hash(readFileSync(new URL('../../src/village-active-candidates.js',import.meta.url))),sourceHash,'source must not mutate during verification');
const report={generatedAt:new Date().toISOString(),baseline,baselineSourceSha256:hash(oldSource),candidateSourceSha256:sourceHash,passed:cases.every(row=>row.passed),cases,observations,scope:'Actual Babylon9.31 provider-selection and lifecycle CPU logic against immutable14c972c; no pixels, browser, GPU/device/FPS claim.'};
writeFileSync(new URL('verification-candidate-edges'+(process.env.VERIFICATION_REPORT_SUFFIX??'')+'.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:report.passed,cases:cases.length,failed:cases.filter(row=>!row.passed).map(row=>({name:row.name,error:row.error})),observations},null,2));
if(!report.passed)process.exitCode=1;
