// Derive complete per-instance ownership from existing immutable near meshes.
// This does not repack assets or rewrite the approved aggregate collision data.
import {readFile,writeFile} from 'node:fs/promises';
import {NullEngine,Scene,Vector3,VertexBuffer} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/index.js';
import {readRuntimeGltf} from '../tests/helpers/read-runtime-gltf.js';
import {CAVE_PLACEMENTS,caveSurface} from '../src/witch-cave-layout.js';
import {createWitchCaveTerrain} from '../src/witch-cave-terrain.js';
import {createVillageTransform} from '../src/village-environment.js';
import {CAVE_COLLISION_DATA} from '../src/witch-cave-collision-data.js';
import {CAVE_SIGHT_DATA} from '../src/witch-cave-sight-data.js';
import {CAVE_CAMERA_DATA} from '../src/witch-cave-camera-data.js';
import {CAVE_LABORATORY_GEOMETRY,laboratoryEnabled} from '../src/cave-laboratory-geometry.js';
import {caveSourceFingerprint} from './cave-source-fingerprint.mjs';
import {caveCollisionManifest} from './cave-collision-source.mjs';
import {caveCollisionGeometry} from './cave-collision-geometry.mjs';
import {EDITOR_CAVE_GRID as grid,rasterizeCaveGeometry,encodeCaveCells,fillCaveRuns,encodeCaveCamera,fillCaveCamera} from '../src/editor-cave-grid.js';
const fingerprint=caveSourceFingerprint();if(fingerprint!==CAVE_COLLISION_DATA.fingerprint)throw Error('Current cave collision certificate needs its approved source revision');
const base=new URL('../public/assets/',import.meta.url),manifest=caveCollisionManifest(),terrain=createWitchCaveTerrain(),ground=new Float32Array(grid.size**2),mask=new Uint8Array(ground.length),union=new Uint8Array(ground.length),owners={},sightOwners={},cameraOwners={},sightUnion=new Uint8Array(ground.length),cameraUnion=new Uint32Array(ground.length*8);
for(let z=0;z<grid.size;z++)for(let x=0;x<grid.size;x++){const i=z*grid.size+x,xx=grid.min+(x+.5)*grid.step,zz=grid.min+(z+.5)*grid.step;ground[i]=terrain.heightAt(xx,zz);mask[i]=caveSurface(xx,zz).distance<2?1:0;}
const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;const world={scene,terrain};let triangles=0;
try{for(const [id,config]of Object.entries(manifest.assets)){
 if(id==='cave-14-hidden-pressure-stone')continue;
 const placements=CAVE_PLACEMENTS.filter(p=>p.asset===id);if(!placements.length)continue;
 const {gltf,files}=await readRuntimeGltf(new URL(config.lods?.[0]?.model??config.model,base));for(const buffer of gltf.buffers??[])if(buffer.uri)buffer.uri='data:application/octet-stream;base64,'+Buffer.from(files.get(buffer.uri).data).toString('base64');
 const loader=new GLTFFileLoader();loader.skipMaterials=true;const container=await loader.loadAssetContainerAsync(scene,{json:gltf},'');
 for(const placement of placements){const cells=new Uint8Array(ground.length),sight=new Uint8Array(ground.length),camera=new Uint32Array(ground.length*8),{root,facing}=createVillageTransform(world,placement,config),instance=container.instantiateModelsToScene(name=>placement.id+name,false,{doNotInstantiate:false});for(const node of instance.rootNodes)node.parent=facing;
  for(const mesh of root.getChildMeshes().filter(mesh=>mesh.getTotalVertices()>0)){const source=mesh.getVerticesData(VertexBuffer.PositionKind),matrix=mesh.computeWorldMatrix(true),positions=new Float32Array(source.length),point=new Vector3();for(let i=0;i<source.length;i+=3){Vector3.TransformCoordinatesFromFloatsToRef(source[i],source[i+1],source[i+2],matrix,point);positions.set([point.x,point.y,point.z],i);}const geometry=caveCollisionGeometry(id,{positions,indices:mesh.getIndices()});triangles+=geometry.indices.length/3;rasterizeCaveGeometry(geometry.positions,geometry.indices,ground,{...grid,mask,occupied:cells,sight,camera,body:!(laboratoryEnabled()&&id===CAVE_LABORATORY_GEOMETRY.assetId),structural:placement.kind==='rock'||config.category==='rock'});}
  owners[placement.id]=encodeCaveCells(cells);fillCaveRuns(union,owners[placement.id]);sightOwners[placement.id]=encodeCaveCells(sight);cameraOwners[placement.id]=encodeCaveCamera(camera);fillCaveRuns(sightUnion,sightOwners[placement.id]);fillCaveCamera(cameraUnion,cameraOwners[placement.id]);root.dispose();
 }container.dispose();loader.dispose();console.log(id+': '+placements.length+' complete owner masks');
}}finally{engine.dispose();}
const expected=fillCaveRuns(new Uint8Array(ground.length),CAVE_COLLISION_DATA.runs);let differences=0;for(let i=0;i<union.length;i++)if(union[i]!==expected[i])differences++;if(differences)throw Error('Complete owner union differs from approved occupancy by '+differences+' cells');
const sightExpected=fillCaveRuns(new Uint8Array(ground.length),CAVE_SIGHT_DATA.runs);
const lookupBytes=Buffer.from(CAVE_CAMERA_DATA.lookup,'base64'),profileBytes=Buffer.from(CAVE_CAMERA_DATA.profiles,'base64'),lookupView=new Uint16Array(lookupBytes.buffer,lookupBytes.byteOffset,lookupBytes.length/2),profiles=new Uint32Array(profileBytes.buffer,profileBytes.byteOffset,profileBytes.length/4);let sightDifferences=0,cameraDifferences=0;for(let i=0;i<ground.length;i++){if(sightUnion[i]!==sightExpected[i])sightDifferences++;for(let k=0;k<8;k++)if(cameraUnion[i*8+k]!==profiles[lookupView[i]*8+k])cameraDifferences++;}if(sightDifferences||cameraDifferences)throw Error('Sight/camera baseline mismatch '+JSON.stringify({sightDifferences,cameraDifferences}));
const data={version:1,...grid,bottom:-16,unit:.25,fingerprint,owners,sightOwners,cameraOwners};await writeFile(new URL('../src/editor-cave-collision-data.js',import.meta.url),'// Derived edit-time ownership; approved near meshes remain unchanged.\nexport const EDITOR_CAVE_COLLISION_DATA='+JSON.stringify(data)+';\n');console.log(JSON.stringify({owners:Object.keys(owners).length,triangles,occupied:union.reduce((sum,n)=>sum+n,0),baselineDifferences:differences,sightDifferences,cameraDifferences,bytes:JSON.stringify(data).length}));
