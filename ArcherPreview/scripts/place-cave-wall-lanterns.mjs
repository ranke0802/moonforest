// Offline placement against the actual visible near-LOD rock/terrain surfaces.
// No generated models, textures, runtime rays or per-frame searches.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {NullEngine,Scene,Mesh,VertexData,Vector3,Ray} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/index.js';
import {readRuntimeGltf} from '../tests/helpers/read-runtime-gltf.js';
import {CAVE_PLACEMENTS,CAVE_SEGMENTS,caveSurface} from '../src/witch-cave-layout.js';
import {createWitchCaveTerrain} from '../src/witch-cave-terrain.js';
import {createVillageTransform} from '../src/village-environment.js';
import {caveCollisionGeometry} from './cave-collision-geometry.mjs';
const base=new URL('../public/assets/',import.meta.url),manifest=JSON.parse(readFileSync(new URL('witch-cave.json',base))),terrain=createWitchCaveTerrain();
const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;const walls=[];
function surface(name,positions,indices){const mesh=new Mesh(name,scene),data=new VertexData();data.positions=positions;data.indices=indices;data.normals=[];VertexData.ComputeNormals(positions,indices,data.normals,{useRightHandedSystem:true});data.applyToMesh(mesh);mesh.computeWorldMatrix(true);walls.push(mesh);return mesh;}
try{
 for(const [id,config]of Object.entries(manifest.assets)){
  const placements=CAVE_PLACEMENTS.filter(p=>p.asset===id&&(p.kind==='rock'||config.category==='rock'));if(!placements.length)continue;
  const {gltf,files}=await readRuntimeGltf(new URL(config.lods[0].model,base));for(const b of gltf.buffers??[])if(b.uri)b.uri='data:application/octet-stream;base64,'+Buffer.from(files.get(b.uri).data).toString('base64');
  const loader=new GLTFFileLoader();loader.skipMaterials=true;const container=await loader.loadAssetContainerAsync(scene,{json:gltf},'');
  for(const p of placements){const {root,facing}=createVillageTransform({scene,terrain},p,config),entry=container.instantiateModelsToScene(n=>p.id+n,false,{doNotInstantiate:false});for(const node of entry.rootNodes)node.parent=facing;
   for(const mesh of root.getChildMeshes().filter(m=>m.getTotalVertices()>0)){
    const world=mesh.computeWorldMatrix(true),raw=mesh.getVerticesData('position'),positions=new Float32Array(raw.length);
    for(let i=0;i<raw.length;i+=3)Vector3.TransformCoordinates(Vector3.FromArray(raw,i),world).toArray(positions,i);
    const clipped=caveCollisionGeometry(id,{positions,indices:mesh.getIndices()});surface(p.id,clipped.positions,clipped.indices);
   }root.dispose();
  }container.dispose();
 }
 const n=terrain.subdivisions,positions=[],indices=[];
 for(let row=0;row<=n;row++)for(let col=0;col<=n;col++){const x=col*terrain.step-terrain.half,z=terrain.half-row*terrain.step;positions.push(x,terrain.heightAt(x,z),z);if(row&&col){const d=row*(n+1)+col,a=d-n-2,b=a+1,c=d-1;indices.push(a,b,d,a,d,c);}}
 surface('continuous-terrain',positions,indices);
 // The user approved relocating unsupported route lamps to adjacent wall sections.
 const pick=(origin,direction,length=18)=>{const ray=new Ray(origin,direction,length);let result=null;for(const mesh of walls){const hit=ray.intersectsMesh(mesh,false);if(hit?.hit&&hit.distance>.001&&hit.distance<=length&&(!result||hit.distance<result.distance))result=hit;}return result;};
 const mounts={},report=[];
 for(const lamp of CAVE_PLACEMENTS.filter(p=>p.asset==='cave-13-votive-lantern')){
  const from=lamp.wallMount?.from??{x:lamp.x,z:lamp.z};let approach=from;
  // Old floor placements can themselves lie on a ridge. Anchor fixture height
  // to the adjacent walking lane, not the top of that ridge.
  if(terrain.heightAt(from.x,from.z)>caveSurface(from.x,from.z).height+.5){
   let closest=Infinity;for(const {a,b}of CAVE_SEGMENTS){const dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((from.x-a[0])*dx+(from.z-a[1])*dz)/(dx*dx+dz*dz))),x=a[0]+dx*t,z=a[1]+dz*t,d=Math.hypot(x-from.x,z-from.z);if(d<closest){closest=d;approach={x,z};}}
  }
  const floor=terrain.heightAt(approach.x,approach.z),bottom=floor+1.8,origin=new Vector3(approach.x,bottom+.55,approach.z);let best;
  for(let i=0;i<64;i++){
   const a=i*Math.PI/32,direction=new Vector3(Math.sin(a),0,Math.cos(a)),hit=pick(origin,direction);if(!hit)continue;
   const normal=hit.getNormal(true,false);if(!normal||Math.abs(normal.y)>.78)continue;if(Vector3.Dot(normal,direction)>0)normal.scaleInPlace(-1);normal.y=0;normal.normalize();
   const point=hit.pickedPoint,center=point.add(normal.scale(.38)),back=normal.scale(-1);
   // Require a wall through the complete lantern height, not a floating edge.
   const lower=pick(new Vector3(center.x,bottom,center.z),back,1.1),upper=pick(new Vector3(center.x,bottom+1.08,center.z),back,1.1);
   if(!lower||!upper||lower.distance<.20||upper.distance<.20)continue;
   if(terrain.heightAt(center.x,center.z)>bottom-.5)continue;
   if(Object.values(mounts).some(m=>Math.hypot(m.x-center.x,m.z-center.z)<2))continue;
   const score=hit.distance+Math.abs(lower.distance-.38)+Math.abs(upper.distance-.38);if(best&&score>=best.score)continue;
   best={score,x:center.x,z:center.z,elevation:bottom+.025,yaw:Math.atan2(normal.x,normal.z),wallMount:{from,approach,floor,wall:[point.x,bottom,point.z],normal:[normal.x,normal.z],supportDepth:lower.distance,source:hit.pickedMesh.name}};
  }
  if(!best)throw Error('No valid wall mount for '+lamp.id+' at '+JSON.stringify(from));delete best.score;mounts[lamp.id]=best;report.push({id:lamp.id,...best});
 }
 const out=new URL('../reports/cave-wall-lanterns-2026-11-02/',import.meta.url);mkdirSync(out,{recursive:true});writeFileSync(new URL('mount-review.json',out),JSON.stringify({count:report.length,mounts:report},null,2)+'\n');
 writeFileSync(new URL('../src/cave-lantern-mounts.js',import.meta.url),'// Offline actual-rock ray placements; regenerate with scripts/place-cave-wall-lanterns.mjs.\nexport const CAVE_LANTERN_MOUNTS=Object.freeze('+JSON.stringify(mounts,null,2)+');\n');
 console.log(JSON.stringify({count:report.length,maxMove:Math.max(...report.map(p=>Math.hypot(p.x-p.wallMount.from.x,p.z-p.wallMount.from.z))),sources:[...new Set(report.map(p=>p.wallMount.source))]}));
}finally{engine.dispose();}
