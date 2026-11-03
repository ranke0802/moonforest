import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,basename} from 'node:path';
import {createHash} from 'node:crypto';
import {NullEngine,Scene,VertexBuffer} from '@babylonjs/core';
import {compressMeshopt} from './meshopt-lossless.js';
import {PLAINS_PLACEMENTS,PLAINS_LOOKOUT} from '../src/great-plains-layout.js';
import {createGreatPlainsTerrain} from '../src/great-plains-terrain.js';
import {createTerrainGround} from '../src/terrain-mesh.js';
import {plainsToVillage,VILLAGE_PLAINS_BOUNDARY} from '../src/village-plains-boundary.js';
import {buildVillagePlainsOutskirts,VILLAGE_PLAINS_OUTSKIRTS_WINDOW as window,VILLAGE_PLAINS_OUTSKIRTS_GROUND_WINDOW as groundWindow} from '../src/village-plains-outskirts.js';

const root=resolve(import.meta.dirname,'..'),assetsDir=resolve(root,'public/assets'),content=resolve(assetsDir,'content'),reportDir=resolve(root,'reports/region-continuity-2026-11-03');
const read=async path=>JSON.parse(await readFile(path,'utf8')),hash=data=>createHash('sha256').update(data).digest('hex');
await mkdir(reportDir,{recursive:true});
const plains=await read(resolve(assetsDir,'great-plains.json')),ground=await read(resolve(assetsDir,'great-plains-ground.json')),terrain=createGreatPlainsTerrain();
const placements=buildVillagePlainsOutskirts({placements:PLAINS_PLACEMENTS,assets:plains.assets,terrain});
const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;
const mesh=createTerrainGround(scene,terrain,{borderExtension:310}),pos=mesh.getVerticesData(VertexBuffer.PositionKind),normal=mesh.getVerticesData(VertexBuffer.NormalKind),indices=mesh.getIndices();
const yaw=VILLAGE_PLAINS_BOUNDARY.yaw,c=Math.cos(yaw),s=Math.sin(yaw),vertices=[];
for(let i=0;i<pos.length;i+=3){const p=plainsToVillage({x:pos[i],z:pos[i+2]});vertices.push([p.x,pos[i+1],p.z,c*normal[i]-s*normal[i+2],normal[i+1],s*normal[i]+c*normal[i+2],.5+pos[i]/ground.span,.5-pos[i+2]/ground.span]);}
// Clip existing triangles, retaining their exact planes, interpolated normals
// and the original macrotexture coordinates. No resampled/rerolled heightfield.
function clip(poly,axis,bound,greater){
 const out=[];for(let i=0;i<poly.length;i++){
  const a=poly[i],b=poly[(i+1)%poly.length],aIn=greater?a[axis]>=bound:a[axis]<=bound,bIn=greater?b[axis]>=bound:b[axis]<=bound;
  if(aIn)out.push(a);
  if(aIn!==bIn){const t=(bound-a[axis])/(b[axis]-a[axis]);out.push(a.map((n,k)=>n+(b[k]-n)*t));}
 }return out;
}
const points=[],triangles=[];const dedup=new Map();
function index(p){const key=p.slice(0,3).map(v=>v.toFixed(8)).join(',');if(dedup.has(key))return dedup.get(key);const i=points.push(p)-1;dedup.set(key,i);return i;}
for(let i=0;i<indices.length;i+=3){
 let poly=[vertices[indices[i]],vertices[indices[i+1]],vertices[indices[i+2]]];
 for(const [axis,bound,greater]of [[0,groundWindow.minX,true],[0,groundWindow.maxX,false],[2,groundWindow.minZ,true],[2,groundWindow.maxZ,false]]){poly=clip(poly,axis,bound,greater);if(poly.length<3)break;}
 if(poly.length<3)continue;
 for(let j=1;j<poly.length-1;j++){
  const[a,b,d]=[poly[0],poly[j],poly[j+1]],area=(b[0]-a[0])*(d[2]-a[2])-(b[2]-a[2])*(d[0]-a[0]);if(Math.abs(area)<1e-9)continue;
  triangles.push(index(a),index(b),index(d));
 }
}
const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(const p of points)for(let i=0;i<3;i++){min[i]=Math.min(min[i],p[i]);max[i]=Math.max(max[i],p[i]);}
const pivot={x:(min[0]+max[0])/2,z:(min[2]+max[2])/2,y:min[1]},bounds=max.map((n,i)=>n-min[i]);
const gp=[],gn=[],gu=[];
for(const p of points){gp.push(p[0]-pivot.x,p[1]-pivot.y,p[2]-pivot.z);const n=Math.hypot(p[3],p[4],p[5]);gn.push(p[3]/n,p[4]/n,p[5]/n);gu.push(p[6],p[7]);}
const dst={asset:{version:'2.0',generator:'Moonforest exact plains entrance ground patch'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],meshes:[{primitives:[]}],buffers:[],bufferViews:[],accessors:[],materials:[{name:'plains-outskirts-ground',pbrMetallicRoughness:{baseColorTexture:{index:0},metallicFactor:0,roughnessFactor:1},doubleSided:true}],textures:[{sampler:0,extensions:{KHR_texture_basisu:{source:0}}}],images:[{uri:basename(ground.color.url)}],samplers:[{wrapS:33071,wrapT:33071,magFilter:9729,minFilter:9987}],extensionsUsed:['KHR_texture_basisu'],extensionsRequired:['KHR_texture_basisu']};
const chunks=[];let offset=0;
function accessor(values,type,componentType=5126){
 const array=componentType===5125?new Uint32Array(values):new Float32Array(values),data=Buffer.from(array.buffer),width={SCALAR:1,VEC2:2,VEC3:3}[type],view=dst.bufferViews.push({buffer:0,byteOffset:offset,byteLength:data.length})-1;chunks.push(data);offset+=data.length;
 const a={bufferView:view,componentType,count:array.length/width,type};
 if(type==='VEC3'){a.min=[Infinity,Infinity,Infinity];a.max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<array.length;i++){a.min[i%3]=Math.min(a.min[i%3],array[i]);a.max[i%3]=Math.max(a.max[i%3],array[i]);}}
 return dst.accessors.push(a)-1;
}
dst.meshes[0].primitives.push({attributes:{POSITION:accessor(gp,'VEC3'),NORMAL:accessor(gn,'VEC3'),TEXCOORD_0:accessor(gu,'VEC2')},indices:accessor(triangles,'SCALAR',5125),material:0});
dst.buffers=[{uri:'plains-outskirts-ground.bin',byteLength:offset}];
const files=new Map([['plains-outskirts-ground.bin',{data:Buffer.concat(chunks)}],[basename(ground.color.url),{data:await readFile(resolve(assetsDir,ground.color.url))}]]),packed=await compressMeshopt(dst,files);
for(const[name,file]of packed.files)await writeFile(resolve(content,name),file.data);
const resources=[...packed.files.keys()].map(name=>'./content/'+name),groundBytes=[...packed.files.values()].reduce((n,f)=>n+f.data.length,0),groundConfig={name:'대평원 입구 지면 · 기존 지형 조각',category:'background',height:bounds[1],bounds,origin:'bottom-center',frontYawOffset:0,surfaceStyle:'outskirts-ground',geometryLod:true,sharedLowPolyGeometry:true,lods:[0,1,2].map(level=>({level,model:'./content/'+packed.model,resources,triangles:triangles.length/3,textureSize:ground.color.width,normalMap:false,bytes:groundBytes}))};
groundConfig.mobileNear=groundConfig.lods[0];
const copiedAssets=Object.fromEntries([...new Set(placements.map(p=>p.asset))].map(id=>[id,plains.assets[id]]));copiedAssets['village-plains-outskirts-ground']=groundConfig;
placements.push({id:'village-plains-outskirts-ground',asset:'village-plains-outskirts-ground',kind:'ground-detail',x:pivot.x,z:pivot.z,yaw:0,scale:1,elevation:pivot.y+.025,colliderRadius:0,background:true,villagePlainsOutskirts:true});
const allResources=[...new Set(Object.values(copiedAssets).flatMap(config=>[...config.lods.flatMap(lod=>[lod.model,...lod.resources]),...(config.highTextures?.resources??[])]))];
const source={window,groundWindow,boundaryYaw:yaw,plainsManifestSha256:hash(await readFile(resolve(assetsDir,'great-plains.json'))),groundManifestSha256:hash(await readFile(resolve(assetsDir,'great-plains-ground.json'))),terrainSha256:hash(Buffer.from(terrain.heights.buffer))};
const sidecar={version:1,assets:copiedAssets,placements,resources:allResources,ground:{...ground,asset:'village-plains-outskirts-ground',pivot,sourceUv:'u=.5+plainsX/span,v=.5-plainsZ/span',min,max},source};
await writeFile(resolve(assetsDir,'village-plains-outskirts.json'),JSON.stringify(sidecar,null,2)+'\n');
const counts={};for(const p of placements)counts[p.kind]=(counts[p.kind]??0)+1;
const lookout=plainsToVillage(PLAINS_LOOKOUT),report={generatedAt:new Date().toISOString(),source,counts,placementCount:placements.length,originalPlainsPlacements:PLAINS_PLACEMENTS.length,sourceAssetCount:Object.keys(copiedAssets).length,selectedIds:placements.map(p=>p.sourcePlacementId).filter(Boolean),lookout:{...lookout,distanceFromVillagePortal:Math.hypot(lookout.x-.35,lookout.z-76),includesAllButtressRocks:[0,1,2,3,4,5,6].every(i=>placements.some(p=>p.sourcePlacementId===`lookout-rock-${i}`)),includesSummitOak:placements.some(p=>p.sourcePlacementId==='lookout-oak')},ground:{model:groundConfig.lods[0].model,triangles:triangles.length/3,vertices:points.length,primitives:1,drawCalls:1,bytes:groundBytes,min,max,pivot,macroTexture:ground.color,sharedDetail:ground.detail},newArtwork:false,originalVillageEdited:false,gpuPerformanceMeasured:false};
await writeFile(resolve(reportDir,'village-plains-outskirts.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));scene.dispose();engine.dispose();
