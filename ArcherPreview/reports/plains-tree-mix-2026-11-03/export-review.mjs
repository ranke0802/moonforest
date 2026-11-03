import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {ArcRotateCamera,Matrix,NullEngine,Scene,Vector3,VertexBuffer,Viewport} from '@babylonjs/core';
import {readRuntimeGltf} from '../../tests/helpers/read-runtime-gltf.js';
import {createVillageTransform} from '../../src/village-environment.js';
import {createGreatPlainsTerrain} from '../../src/great-plains-terrain.js';
import {createTerrainGround} from '../../src/terrain-mesh.js';
import {PLAINS_PLACEMENTS} from '../../src/great-plains-layout.js';
const root=resolve(import.meta.dirname,'../..'),assets=resolve(root,'public/assets'),out=resolve(import.meta.dirname,'review-data'),baseline=JSON.parse(readFileSync(resolve(import.meta.dirname,'baseline.json'))),manifest=JSON.parse(readFileSync(resolve(assets,'great-plains.json'))),paint=JSON.parse(readFileSync(resolve(assets,'great-plains-ground.json'))),ktx='C:/Program Files/KTX-Software/bin/ktx.exe';
mkdirSync(out,{recursive:true});const cache=resolve(root,'reports/plains-boundary-followup-2026-11-03/review-data'),configs={},folders={};
const texture=file=>{const target=resolve(out,'textures',file.split('/').at(-1)+'.png');mkdirSync(dirname(target),{recursive:true});if(!existsSync(target)){const old=resolve(cache,'textures',file.split('/').at(-1)+'.png');if(existsSync(old))return old;const r=spawnSync(ktx,['extract','--transcode','rgba8','--level','0',resolve(assets,file),target],{encoding:'utf8',windowsHide:true});if(r.status!==0)throw Error(r.stderr);}return target;};
for(const p of PLAINS_PLACEMENTS)configs[p.asset]=manifest.assets[p.asset];
for(const[id,c]of Object.entries(configs)){
 const model=c.lods.at(-1).model,prior=resolve(cache,'decoded','2-'+model.split('/').at(-1)),folder=existsSync(resolve(prior,'review.gltf'))?prior:resolve(out,'decoded',id);folders[id]=folder;
 if(existsSync(resolve(folder,'review.gltf')))continue;mkdirSync(folder,{recursive:true});const url=pathToFileURL(resolve(assets,model)),{gltf:g,files}=await readRuntimeGltf(url);
 for(const b of g.buffers??[])if(b.uri){const target=resolve(folder,b.uri);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,files.get(b.uri).data);}
 for(const im of g.images??[]){const full=resolve(dirname(url.pathname.replace(/^\/(.:)/,'$1')),im.uri);im.uri=im.uri.endsWith('.ktx2')?texture('./content/'+im.uri):full;im.mimeType='image/png';}
 for(const t of g.textures??[])for(const extension of['KHR_texture_basisu','EXT_texture_webp'])if(t.extensions?.[extension]){t.source=t.extensions[extension].source;delete t.extensions[extension];}
 for(const key of['extensionsUsed','extensionsRequired'])g[key]=(g[key]??[]).filter(x=>!['KHR_texture_basisu','EXT_texture_webp','EXT_meshopt_compression'].includes(x));writeFileSync(resolve(folder,'review.gltf'),JSON.stringify(g));
}
const engine=new NullEngine({renderWidth:1280,renderHeight:720}),scene=new Scene(engine);scene.useRightHandedSystem=true;const terrain=createGreatPlainsTerrain(),world={scene,terrain},camera=new ArcRotateCamera('tree-composition-review',0,1.25,17,Vector3.Zero(),scene);camera.fov=.65;camera.minZ=.05;camera.maxZ=1024;
const placed=list=>list.map(p=>{const{root,facing}=createVillageTransform(world,p,configs[p.asset]);root.computeWorldMatrix(true);facing.computeWorldMatrix(true);const matrix=Array.from(facing.getWorldMatrix().m);root.dispose();return{id:p.id,key:p.asset,matrix};});
const ground=createTerrainGround(scene,terrain,{borderExtension:310}),groundData={size:terrain.size,n:terrain.subdivisions,positions:Array.from(ground.getVerticesData(VertexBuffer.PositionKind)),normals:Array.from(ground.getVerticesData(VertexBuffer.NormalKind)),uvs:Array.from(ground.getVerticesData(VertexBuffer.UVKind)),indices:Array.from(ground.getIndices())};
const shot=(map)=>{camera.getViewMatrix(true);camera.getProjectionMatrix(true);return{map,camera:{position:camera.globalPosition.asArray(),target:camera.target.asArray(),alpha:camera.alpha,beta:camera.beta,radius:camera.radius,fov:camera.fov,minZ:camera.minZ,maxZ:camera.maxZ},viewport:{width:1280,height:720},projectionProbes:[[-3,0,-4],[3,2,4],[0,4,0],[-6,3,8],[6,2,-8]].map(([x,y,z])=>{const p=camera.target.add(new Vector3(x,y,z));return{position:p.asArray(),screen:Vector3.Project(p,Matrix.Identity(),camera.getTransformationMatrix(),new Viewport(0,0,1280,720)).asArray()};})};};
const cases=[];
for(const[id,x,z,tx,tz,beta,radius]of [['approach-in',26,-20,35,-50,1.25,17],['forest-out',60,-65,25,-30,1.35,17],['meadow-east',30,28,35,65,1.25,20],['eastern-edge',70,0,95,-15,1.25,19]]){const yaw=Math.atan2(tx-x,tz-z);camera.target.set(x,terrain.heightAt(x,z)+1.35,z);camera.alpha=-Math.PI/2-yaw;camera.beta=beta;camera.radius=radius;cases.push({id,before:shot('baseline'),after:shot('current')});}
camera.setTarget(new Vector3(25,0,-20));camera.setPosition(new Vector3(5,105,85));cases.push({id:'overview',before:shot('baseline'),after:shot('current')});
const paintData={path:texture(paint.color.url),span:paint.span},data={stage:'composition',profile:'tree-mix',lod:2,configs,folders,grounds:{baseline:paintData,current:paintData},terrains:{baseline:groundData,current:groundData},placements:{baseline:placed(baseline.placements),current:placed(PLAINS_PLACEMENTS)},cases,limitations:['Offline re-creation using actual fixedLOD2 source geometry/textures and production placement/floor matrices.','Before/after means062feb6 versus tree-species composition in the same plains, not a map transition.','Native toon, fog, sky, outline, dither, runtime LOD/visibility and shadows are not reproduced.','No browser automation, actual game screenshots, S23 measurement or GPU performance measurement.']};
const path=resolve(out,'scene.json');writeFileSync(path,JSON.stringify(data));console.log(JSON.stringify({path,assets:Object.keys(configs).length,placements:PLAINS_PLACEMENTS.length,views:cases.length,browserAutomation:false}));scene.dispose();engine.dispose();
