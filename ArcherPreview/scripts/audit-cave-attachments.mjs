// Offline geometry evidence only. Uses the same transforms and laboratory
// clipping as colour/shadow/collision, without opening or driving a browser.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {NullEngine,Scene,Vector3,VertexBuffer} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/index.js';
import {readRuntimeGltf} from '../tests/helpers/read-runtime-gltf.js';
import {CAVE_PLACEMENTS,caveRoofHeight} from '../src/witch-cave-layout.js';
import {createWitchCaveTerrain} from '../src/witch-cave-terrain.js';
import {createVillageTransform} from '../src/village-environment.js';
import {caveCollisionGeometry} from './cave-collision-geometry.mjs';
import {CAVE_LABORATORY_GEOMETRY,clipLaboratoryCeiling} from '../src/cave-laboratory-geometry.js';
import {appendLaboratoryVault} from '../src/cave-laboratory-vault.js';
const base=new URL('../public/assets/',import.meta.url);
const out=resolve(process.env.CAVE_ATTACHMENT_OUT??'reports/boundary-cave-polish-2026-11-03/attachments');
await mkdir(out,{recursive:true});
const manifest=JSON.parse(await readFile(new URL('witch-cave.json',base),'utf8'));
const terrain=createWitchCaveTerrain(),engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;
const records=[],world={scene,terrain};
async function save(id,positions,indices,extra={}){
 const filename=id+'.bin',p=Float32Array.from(positions),ix=Uint32Array.from(indices),data=Buffer.concat([Buffer.from(p.buffer),Buffer.from(ix.buffer)]);
 await writeFile(resolve(out,filename),data);records.push({id,filename,vertices:p.length/3,triangles:ix.length/3,...extra});
}
try{
 for(const [id,config] of Object.entries(manifest.assets)){
  if(config.category!=='rock')continue;
  const {gltf,files}=await readRuntimeGltf(new URL(config.lods[0].model,base));
  for(const b of gltf.buffers??[])if(b.uri)b.uri='data:application/octet-stream;base64,'+Buffer.from(files.get(b.uri).data).toString('base64');
  const loader=new GLTFFileLoader();loader.skipMaterials=true;const container=await loader.loadAssetContainerAsync(scene,{json:gltf},'');
  for(const p of CAVE_PLACEMENTS.filter(p=>p.asset===id)){
   const {root,facing}=createVillageTransform(world,p,config),entry=container.instantiateModelsToScene(n=>p.id+n,false,{doNotInstantiate:false});
   for(const node of entry.rootNodes)node.parent=facing;
   const ps=[],ix=[];let terrainPenetrating=0;
   for(const mesh of root.getChildMeshes().filter(m=>m.getTotalVertices()>0)){
    const matrix=mesh.computeWorldMatrix(true),positions=mesh.getVerticesData(VertexBuffer.PositionKind),vertices=[];
    for(let i=0;i<positions.length;i+=3){const v=Vector3.TransformCoordinates(Vector3.FromArray(positions,i),matrix);vertices.push(v.x,v.y,v.z);}
    const clipped=caveCollisionGeometry(id,{positions:Float32Array.from(vertices),indices:mesh.getIndices()}),offset=ps.length/3;
    ps.push(...clipped.positions);for(const index of clipped.indices)ix.push(offset+index);
   }
   for(let i=0;i<ps.length;i+=3)if(ps[i+1]<=terrain.heightAt(ps[i],ps[i+2])+.025)terrainPenetrating++;
   if(ix.length)await save(p.id,ps,ix,{asset:id,terrainPenetrating,placement:p});root.dispose();
  }container.dispose();
 }
}finally{engine.dispose();}
const positions=[],indices=[],segments=64,rings=12;
for(let ring=0;ring<=rings;ring++)for(let i=0;i<=segments;i++){
 const angle=i/segments*Math.PI*2,x=Math.cos(angle)*ring*6,z=Math.sin(angle)*ring*6;positions.push(x,caveRoofHeight(x,z)+.6*Math.sin(x*.24)*Math.cos(z*.19),z);
 if(ring&&i){const at=ring*(segments+1)+i;indices.push(at,at-1,at-segments-2);if(ring>1)indices.push(at,at-segments-2,at-segments-1);}
}
const edge=positions.length/3;for(let i=0;i<=segments;i++){const a=i/segments*Math.PI*2;positions.push(Math.cos(a)*180,-28,Math.sin(a)*180);if(i){const prev=rings*(segments+1)+i;indices.push(prev,edge+i-1,edge+i,prev,prev-1,edge+i-1);}}
const roof=appendLaboratoryVault(clipLaboratoryCeiling({positions,indices},CAVE_LABORATORY_GEOMETRY),CAVE_LABORATORY_GEOMETRY);
await save('roof',roof.positions,roof.indices,{anchor:true});
await writeFile(resolve(out,'geometry.json'),JSON.stringify({records,sourceLod:0,browserAutomation:false}));
console.log(JSON.stringify({out,rocks:records.length-1,triangles:records.reduce((n,r)=>n+r.triangles,0)}));
