import {NullEngine,Scene,FreeCamera,Vector3,MeshBuilder,StandardMaterial,TransformNode,InstancedMesh} from '@babylonjs/core';
import {writeFileSync} from 'node:fs';
import {VillageActiveCandidates} from '../../src/village-active-candidates.js';

const engine=new NullEngine({renderWidth:960,renderHeight:540}),scene=new Scene(engine);engine.getCaps().instancedArrays=true;
const camera=new FreeCamera('camera',new Vector3(0,8,-22),scene);camera.setTarget(Vector3.Zero());camera.maxZ=400;
const source=MeshBuilder.CreateBox('shared-source',{size:1},scene);source.material=new StandardMaterial('paint',scene);source.material.disableLighting=true;source.isVisible=false;
const tracked=new WeakSet(),instances=[],roots=[];
for(let i=0;i<100;i++){const root=new TransformNode('r'+i,scene);root.position.set((i%10-5)*2,0,(Math.floor(i/10)-5)*2);const mesh=source.createInstance('m'+i);mesh.parent=root;mesh.computeWorldMatrix(true);mesh.freezeWorldMatrix();root.freezeWorldMatrix();root.setEnabled(i%4===0);tracked.add(mesh);roots.push(root);instances.push(mesh);}
const dynamic=MeshBuilder.CreateBox('dynamic',{size:2},scene);dynamic.position.set(0,2,0);
const prev=scene.getActiveMeshCandidates,candidates=new VillageActiveCandidates(scene);for(const instance of instances)candidates.add(instance);const filter=scene.getActiveMeshCandidates;
let readyCalls=0;const originalReady=InstancedMesh.prototype.isReady;InstancedMesh.prototype.isReady=function(...args){readyCalls++;return originalReady.apply(this,args);};
const draws=[],draw=engine.drawElementsType.bind(engine);engine.drawElementsType=(...args)=>{draws.push([args[1],args[2],args[3]]);return draw(...args);};
for(let i=0;i<3;i++)scene.render();const rows=[];
for(let i=0;i<5;i++){
 if(i%10===0){roots[i].setEnabled(!roots[i].isEnabled());dynamic.position.x=i%20?2:-2;}
 for(const [name,provider] of [['original',prev],['filtered',filter]]){
  scene.getActiveMeshCandidates=provider;draws.length=0;readyCalls=0;const start=performance.now();scene.render();const ms=performance.now()-start;
  rows.push({frame:i,name,ms,readyCalls,candidates:provider().length,active:scene.getActiveMeshes().data.slice(0,scene.getActiveMeshes().length).map(m=>m.name),draws:draws.slice()});
 }
 const a=rows.at(-2),b=rows.at(-1);if(JSON.stringify(a.active)!==JSON.stringify(b.active)||JSON.stringify(a.draws)!==JSON.stringify(b.draws))throw Error('active/draw mismatch '+i);
}
const sum=name=>{let x=rows.filter(r=>r.name===name);return {meanSceneMs:x.reduce((a,r)=>a+r.ms,0)/x.length,meanReadyCalls:x.reduce((a,r)=>a+r.readyCalls,0)/x.length,meanCandidates:x.reduce((a,r)=>a+r.candidates,0)/x.length};};
const result={sceneMeshes:scene.meshes.length,frames:5,original:sum('original'),filtered:sum('filtered'),activeAndDrawsMatch:true,scope:'Synthetic static instances in real Babylon NullEngine; no GPU/phone result.'};writeFileSync(new URL('candidate-preflight.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
InstancedMesh.prototype.isReady=originalReady;scene.getActiveMeshCandidates=filter;candidates.dispose();scene.dispose();engine.dispose();
