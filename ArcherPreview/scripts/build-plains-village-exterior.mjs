import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,basename} from 'node:path';
import {Matrix,Quaternion,Vector3,NullEngine,Scene} from '@babylonjs/core';
import {decodeMeshoptBuffers,compressMeshopt} from './meshopt-lossless.js';
import {VILLAGE_PLACEMENTS} from '../src/village-layout.js';
import {villageHeight,createVillageTerrain} from '../src/village-terrain.js';
import {createVillageTransform} from '../src/village-environment.js';
import {PLAINS_SPAN,PLAINS_ROUTES,PLAINS_CLEARINGS,PLAINS_STREAM,PLAINS_PLACEMENTS} from '../src/great-plains-layout.js';
import {VILLAGE_PLAINS_BOUNDARY} from '../src/village-plains-boundary.js';
const root=resolve(import.meta.dirname,'..'),assets=resolve(root,'public/assets'),content=resolve(assets,'content'),report=resolve(root,'reports/boundary-continuity-2026-11-03');
await mkdir(report,{recursive:true});
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const village=await read(resolve(assets,'village.json')),plains=await read(resolve(assets,'great-plains.json'));
const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;const world={scene,terrain:createVillageTerrain()};
const selected=VILLAGE_PLACEMENTS.filter(p=>Math.hypot(p.x,p.z)<58&&(['building','wall'].includes(p.kind)||['watchtower','wood-03-plank-gate','market-stall','well'].includes(p.asset)||(p.kind==='tree'&&Math.hypot(p.x,p.z)<37)));
const dst={asset:{version:'2.0',generator:'Moonforest existing village exterior batch'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],meshes:[{primitives:[]}],buffers:[],bufferViews:[],accessors:[],materials:[],textures:[],images:[],samplers:[],extensionsUsed:['KHR_texture_basisu'],extensionsRequired:['KHR_texture_basisu']};
const files=new Map(),chunks=[];let offset=0,totalTriangles=0;
function accessor(values,type,componentType=5126){
 const array=componentType===5125?new Uint32Array(values):new Float32Array(values),data=Buffer.from(array.buffer);const n={SCALAR:1,VEC2:2,VEC3:3}[type];
 const v=dst.bufferViews.push({buffer:0,byteOffset:offset,byteLength:data.length})-1;chunks.push(data);offset+=data.length;
 const a={bufferView:v,componentType,count:array.length/n,type};
 if(type==='VEC3'){a.min=[Infinity,Infinity,Infinity];a.max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<array.length;i++) {a.min[i%3]=Math.min(a.min[i%3],array[i]);a.max[i%3]=Math.max(a.max[i%3],array[i]);}}
 return dst.accessors.push(a)-1;
}
function values(g,fs,index){
 const a=g.accessors[index],v=g.bufferViews[a.bufferView],b=fs.get(g.buffers[v.buffer].uri).data,n={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type],size={5126:4,5125:4,5123:2,5121:1}[a.componentType],stride=v.byteStride??n*size;
 const out=[];for(let i=0;i<a.count;i++)for(let j=0;j<n;j++){const o=(v.byteOffset??0)+(a.byteOffset??0)+i*stride+j*size;out.push(a.componentType===5126?b.readFloatLE(o):a.componentType===5125?b.readUInt32LE(o):a.componentType===5123?b.readUInt16LE(o):b[o]);}return out;
}
const totalMin=[Infinity,Infinity,Infinity],totalMax=[-Infinity,-Infinity,-Infinity];
for(const id of new Set(selected.map(p=>p.asset))){
 const config=village.assets[id],lod=config.lods.find(l=>l.level===2),source=await read(resolve(assets,lod.model)),fs=new Map();
 for(const uri of [...source.buffers.map(b=>b.uri),...(source.images??[]).map(i=>i.uri)].filter(Boolean))fs.set(uri,{data:await readFile(resolve(content,uri))});
 const {gltf:g,files:decoded}=await decodeMeshoptBuffers(source,fs),materialOffset=dst.materials.length,textureOffset=dst.textures.length,imageOffset=dst.images.length,samplerOffset=dst.samplers.length;
 for(const im of g.images??[]) {dst.images.push(im);files.set(im.uri,fs.get(im.uri));}
 dst.samplers.push(...(g.samplers??[]));
 for(const tex of g.textures??[]){const t=structuredClone(tex);if(t.source!==undefined)t.source+=imageOffset;if(t.sampler!==undefined)t.sampler+=samplerOffset;if(t.extensions?.KHR_texture_basisu)t.extensions.KHR_texture_basisu.source+=imageOffset;dst.textures.push(t);}
 const remap=o=>{if(!o||typeof o!=='object')return;for(const [k,v]of Object.entries(o)){if(k==='index'&&typeof v==='number')o[k]=v+textureOffset;else remap(v);}};
 for(const mat of g.materials){const m=structuredClone(mat);remap(m);dst.materials.push(m);}
 const batches=new Map();
 function visit(nodeIndex,parent,pMatrix){
  const node=g.nodes[nodeIndex],local=node.matrix?Matrix.FromArray(node.matrix):Matrix.Compose(Vector3.FromArray(node.scale??[1,1,1]),Quaternion.FromArray(node.rotation??[0,0,0,1]),Vector3.FromArray(node.translation??[0,0,0]));
  const transform=local.multiply(parent),world=transform.multiply(pMatrix),normal=world.clone().invert().transpose();
  if(node.mesh!==undefined)for(const prim of g.meshes[node.mesh].primitives){
   const key=prim.material??0;let batch=batches.get(key);if(!batch){batch={positions:[],normals:[],uv:[],indices:[]};batches.set(key,batch);}
   const pos=values(g,decoded,prim.attributes.POSITION),norm=values(g,decoded,prim.attributes.NORMAL),uv=values(g,decoded,prim.attributes.TEXCOORD_0),inds=values(g,decoded,prim.indices),base=batch.positions.length/3;
   for(let i=0;i<pos.length;i+=3){const v=Vector3.TransformCoordinates(Vector3.FromArray(pos,i),world);batch.positions.push(v.x,v.y,v.z);const n=Vector3.TransformNormal(Vector3.FromArray(norm,i),normal).normalize();batch.normals.push(n.x,n.y,n.z);for(let k=0;k<3;k++){totalMin[k]=Math.min(totalMin[k],v.asArray()[k]);totalMax[k]=Math.max(totalMax[k],v.asArray()[k]);}}
   batch.uv.push(...uv);for(const i of inds)batch.indices.push(i+base);
  }
  for(const child of node.children??[])visit(child,transform,pMatrix);
 }
 for(const p of selected.filter(p=>p.asset===id)){
  // Use the exact live transform, including sampled terrain, wall endpoint
  // minimum, source facing and optional authored axis lengths.
  const {root:placedRoot,facing}=createVillageTransform(world,p,config),mat=facing.computeWorldMatrix(true).clone();placedRoot.dispose();
  for(const n of g.scenes[g.scene??0].nodes)visit(n,Matrix.Identity(),mat);
 }
 for(const [m,b]of batches){totalTriangles+=b.indices.length/3;dst.meshes[0].primitives.push({attributes:{POSITION:accessor(b.positions,'VEC3'),NORMAL:accessor(b.normals,'VEC3'),TEXCOORD_0:accessor(b.uv,'VEC2')},indices:accessor(b.indices,'SCALAR',5125),material:materialOffset+m});}
}
// Preserve the village's actual street map in the distant prefab as well.
const ground=await read(resolve(assets,'village-ground.json')),image=dst.images.length,texture=dst.textures.length,material=dst.materials.length;
const groundUri=basename(ground.color.url);dst.images.push({uri:groundUri});files.set(groundUri,{data:await readFile(resolve(content,groundUri))});
dst.textures.push({extensions:{KHR_texture_basisu:{source:image}}});dst.materials.push({name:'village-streets',pbrMetallicRoughness:{baseColorTexture:{index:texture},metallicFactor:0,roughnessFactor:1},doubleSided:true});
const gp=[],gn=[],gu=[],gi=[];
// End the floor inside the curved wall; no stair-stepped floating skirt.
const rings=22,segments=160;
for(let ring=0;ring<=rings;ring++)for(let i=0;i<segments;i++){
 const a=i/segments*Math.PI*2,r=ring/rings,s=Math.sin(a),c=Math.cos(a),x=Math.sign(s)*Math.sqrt(Math.abs(s))*37.7*r,z=Math.sign(c)*Math.sqrt(Math.abs(c))*41.7*r;
 const blend=Math.max(0,(r-.88)/.12),y=villageHeight(x,z)*(1-blend)+.12*blend;
 gp.push(x,y+.008,z);gn.push(0,1,0);gu.push(.5+x/ground.span,.5-z/ground.span);
 if(ring<rings){const n=ring*segments+i,next=ring*segments+(i+1)%segments;if(ring>0)gi.push(n,n+segments,next);gi.push(next,n+segments,next+segments);}
}
dst.meshes[0].primitives.push({attributes:{POSITION:accessor(gp,'VEC3'),NORMAL:accessor(gn,'VEC3'),TEXCOORD_0:accessor(gu,'VEC2')},indices:accessor(gi,'SCALAR',5125),material});totalTriangles+=gi.length/3;
dst.buffers=[{uri:'village-exterior.bin',byteLength:offset}];files.set('village-exterior.bin',{data:Buffer.concat(chunks)});
const packed=await compressMeshopt(dst,files);
for(const [name,file]of packed.files)await writeFile(resolve(content,name),file.data);
const resources=[...packed.files.keys()].map(n=>'./content/'+n),bytes=[...packed.files.values()].reduce((s,f)=>s+f.data.length,0);
const bounds=totalMax.map((v,i)=>v-totalMin[i]);
const cfg={name:'마을 외경 · 기존 건물과 성벽',category:'background',height:bounds[1],bounds,origin:'bottom-center',frontYawOffset:0,surfaceStyle:'distant-village',geometryLod:true,sharedLowPolyGeometry:true,lods:[0,1,2].map(level=>({level,model:'./content/'+packed.model,resources,triangles:totalTriangles,textureSize:Math.max(512,ground.color.width,ground.color.height),normalMap:false,bytes}))};
cfg.mobileNear=cfg.lods[0];plains.assets['village-approach']=cfg;plains.assets['rock-02-jagged-outcrop']=village.assets['rock-02-jagged-outcrop'];plains.availableAssetCount=Object.keys(plains.assets).length;
plains.placementCount=PLAINS_PLACEMENTS.length;
await writeFile(resolve(assets,'great-plains.json'),JSON.stringify(plains,null,2)+'\n');
await writeFile(resolve(report,'layout.json'),JSON.stringify({span:PLAINS_SPAN,routes:PLAINS_ROUTES,clearings:PLAINS_CLEARINGS,stream:PLAINS_STREAM,placements:PLAINS_PLACEMENTS,boundary:VILLAGE_PLAINS_BOUNDARY}));
await writeFile(resolve(report,'village-exterior.json'),JSON.stringify({selected:selected.map(p=>p.id),triangles:totalTriangles,bytes,bounds,min:totalMin,max:totalMax,model:cfg.lods[0].model,primitives:dst.meshes[0].primitives.length},null,2));
console.log({placements:selected.length,triangles:totalTriangles,bytes,bounds,primitives:dst.meshes[0].primitives.length,model:packed.model});
scene.dispose();engine.dispose();
