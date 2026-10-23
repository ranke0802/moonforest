// Offline-only tool; the game does not ship the simplifier to browsers.
// Reuses the exact current textures/materials/transforms; original meshes stay intact.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { hash } from './resource-pack.js';
import { MeshoptSimplifier as S } from 'meshoptimizer';
await S.ready;
const root=resolve(import.meta.dirname,'..'),base=resolve(root,'public/assets');
await mkdir(resolve(root,'reports'),{recursive:true});
const manifest=JSON.parse(await readFile(resolve(base,'environment.json'),'utf8')),report=[];
const types={5126:Float32Array,5125:Uint32Array,5123:Uint16Array,5121:Uint8Array},sizes={SCALAR:1,VEC2:2,VEC3:3,VEC4:4};
for(const key of ['verdant-tree','oak-tree']){
 const config=manifest.assets[key],source=JSON.parse(await readFile(resolve(base,config.model),'utf8'));
 const buffers=await Promise.all(source.buffers.map(b=>readFile(resolve(base,'content',b.uri))));
 const read=index=>{
  const a=source.accessors[index],view=source.bufferViews[a.bufferView],Type=types[a.componentType],size=sizes[a.type],step=Type.BYTES_PER_ELEMENT;
  const bytes=buffers[view.buffer],offset=(view.byteOffset||0)+(a.byteOffset||0),stride=view.byteStride||size*step;
  const out=new Type(a.count*size);
  for(let i=0;i<a.count;i++)for(let j=0;j<size;j++)out[i*size+j]=new Type(bytes.buffer,bytes.byteOffset+offset+i*stride+j*step,1)[0];
  return out;
 };
 config.lods=[];
 for(const [level,distance,ratio,errorLimit] of [['mid',9,.35,.006],['distant',18,.12,.014]]){
  const gltf=structuredClone(source);gltf.accessors=[];gltf.bufferViews=[];gltf.buffers=[];
  const resources=[],stats={key,level,distance,primitives:[]};
  const storeAccessor=(array,original)=>{
   const bytes=Buffer.from(array.buffer,array.byteOffset,array.byteLength),uri=hash(bytes)+'.bin';
   const buffer=gltf.buffers.length,view=gltf.bufferViews.length,index=gltf.accessors.length;
   gltf.buffers.push({uri,byteLength:bytes.length});gltf.bufferViews.push({buffer,byteLength:bytes.length});
   const accessor={...original,bufferView:view,byteOffset:0,count:array.length/sizes[original.type]};delete accessor.min;delete accessor.max;
   gltf.accessors.push(accessor);resources.push({uri,bytes});return index;
  };
  for(let m=0;m<source.meshes.length;m++)for(let p=0;p<source.meshes[m].primitives.length;p++){
   const original=source.meshes[m].primitives[p],primitive=gltf.meshes[m].primitives[p];
   const positions=read(original.attributes.POSITION),indices=Uint32Array.from(read(original.indices));
   const normals=read(original.attributes.NORMAL),uvs=read(original.attributes.TEXCOORD_0),count=positions.length/3,attributes=new Float32Array(count*5);
   for(let i=0;i<count;i++)attributes.set([normals[i*3],normals[i*3+1],normals[i*3+2],uvs[i*2],uvs[i*2+1]],i*5);
   const target=Math.floor(indices.length*ratio/3)*3;
   let [reduced,error]=S.simplifyWithAttributes(indices,positions,3,attributes,5,[.3,.3,.3,1,1],null,target,errorLimit,['Permissive','Prune']);
   let method='attributes';
   // The supplied trees contain non-manifold welded foliage. Spatial reduction
   // is used only for distant variants, with bounded positional error.
   if(reduced.length>indices.length*.8){[reduced,error]=S.simplifySloppy(indices,positions,3,null,target,errorLimit);method='spatial';}
   const [remap,used]=S.compactMesh(reduced);
   primitive.indices=storeAccessor(reduced,{componentType:5125,type:'SCALAR'});
   for(const [semantic,index] of Object.entries(original.attributes)){
    const values=read(index),a=source.accessors[index],size=sizes[a.type],compact=new values.constructor(used*size);
    for(let i=0;i<remap.length;i++)if(remap[i]!==0xffffffff)for(let j=0;j<size;j++)compact[remap[i]*size+j]=values[i*size+j];
    primitive.attributes[semantic]=storeAccessor(compact,a);
    if(semantic==='POSITION'){
     const a=gltf.accessors[primitive.attributes[semantic]];a.min=[Infinity,Infinity,Infinity];a.max=[-Infinity,-Infinity,-Infinity];
     for(let i=0;i<compact.length;i++){a.min[i%3]=Math.min(a.min[i%3],compact[i]);a.max[i%3]=Math.max(a.max[i%3],compact[i]);}
    }
   }
   stats.primitives.push({mesh:source.meshes[m].name,before:indices.length/3,after:reduced.length/3,vertices:used,error,method});
  }
  for(const {uri,bytes} of resources)await writeFile(resolve(base,'content',uri),bytes);
  const bytes=Buffer.from(JSON.stringify(gltf)),name=hash(bytes)+'.gltf';await writeFile(resolve(base,'content',name),bytes);
  config.lods.push({distance,model:'./content/'+name,resources:[name,...new Set(resources.map(r=>r.uri)),...(gltf.images??[]).map(i=>i.uri)].map(n=>'./content/'+n)});
  report.push(stats);console.log(JSON.stringify(stats));
 }
}
manifest.version=3;
await writeFile(resolve(base,'environment.json'),JSON.stringify(manifest,null,2)+'\n');
await writeFile(resolve(root,'reports/tree-lods.json'),JSON.stringify(report,null,2)+'\n');
