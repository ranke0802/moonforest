// Offline index-only simplification. Retained vertex attributes and all rig /
// animation data stay byte-exact; no runtime dependency on meshoptimizer.
import { MeshoptSimplifier as S } from 'meshoptimizer';
import { hash } from './resource-pack.js';

const types={5126:Float32Array,5125:Uint32Array,5123:Uint16Array,5121:Uint8Array,5122:Int16Array,5120:Int8Array};
const sizes={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};
export function readAccessor(gltf,files,index){
 const a=gltf.accessors[index],v=gltf.bufferViews[a.bufferView],Type=types[a.componentType],size=sizes[a.type];
 if(a.sparse)throw new Error('Sparse accessors require explicit support');
 const bytes=files.get(gltf.buffers[v.buffer].uri).data;
 const offset=(v.byteOffset||0)+(a.byteOffset||0),stride=v.byteStride||size*Type.BYTES_PER_ELEMENT;
 const out=new Type(a.count*size);
 for(let i=0;i<a.count;i++)for(let j=0;j<size;j++)out[i*size+j]=new Type(bytes.buffer,bytes.byteOffset+offset+i*stride+j*Type.BYTES_PER_ELEMENT,1)[0];
 return out;
}

export async function simplifyGeometry(source,files,policy){
 await S.ready;
 const gltf=structuredClone(source),generated=new Map(),stats=[];
 const read=i=>readAccessor(source,files,i);
 const store=(values,original)=>{
  const data=Buffer.from(values.buffer,values.byteOffset,values.byteLength),uri=hash(data)+'.bin';
  generated.set(uri,{data});
  const buffer=gltf.buffers.length,view=gltf.bufferViews.length,index=gltf.accessors.length;
  gltf.buffers.push({uri,byteLength:data.length});gltf.bufferViews.push({buffer,byteLength:data.length});
  const a={...original,bufferView:view,byteOffset:0,count:values.length/sizes[original.type]};
  delete a.min;delete a.max;gltf.accessors.push(a);return index;
 };
 for(let m=0;m<source.meshes.length;m++)for(let p=0;p<source.meshes[m].primitives.length;p++){
  const original=source.meshes[m].primitives[p],primitive=gltf.meshes[m].primitives[p];
  const options=policy(source.meshes[m],original,source);
  if(!options||original.targets)continue;
  if(original.attributes.JOINTS_1!==undefined)throw new Error('Eight-influence skins need a separate simplification policy');
  const positions=read(original.attributes.POSITION),indices=Uint32Array.from(read(original.indices));
  const normals=read(original.attributes.NORMAL),uvs=read(original.attributes.TEXCOORD_0),count=positions.length/3;
  const joints=original.attributes.JOINTS_0===undefined?null:read(original.attributes.JOINTS_0);
  const weights=joints?read(original.attributes.WEIGHTS_0):null;
  const usedJoints=joints?[...new Set([...joints].filter((j,i)=>weights[i]>.00001))].sort((a,b)=>a-b):[];
  // Sum of weights is one, so the final dense weight is redundant. Unlike
  // joint-number distances, this metric protects actual changes in skinning.
  const tracked=usedJoints.slice(0,-1);
  if(tracked.length+5>32)throw new Error('Skin exceeds the safe attribute budget');
  const colors=options.paintedColors?read(original.attributes.COLOR_0):null;
  const colorSize=colors?colors.length/count:0,baseStride=colors?6:5;
  const stride=baseStride+tracked.length,attributes=new Float32Array(count*stride),slot=new Map(tracked.map((j,i)=>[j,baseStride+i]));
  for(let i=0;i<count;i++){
   attributes.set([normals[i*3],normals[i*3+1],normals[i*3+2],...(colors?Array.from(colors.subarray(i*colorSize,i*colorSize+3)):[uvs[i*2],uvs[i*2+1]])],i*stride);
   if(joints)for(let k=0;k<4;k++){const s=slot.get(joints[i*4+k]);if(s!==undefined)attributes[i*stride+s]+=weights[i*4+k];}
  }
  const attributeWeights=options.attributeWeights??[.15,.15,.15,...(colors?[1,1,1]:[.3,.3]),...tracked.map(()=>.5)];
  let vertexLock=options.vertexLock??null;
  if(options.protectUvSeams){
   const remap=S.generatePositionRemap(positions,3),uvByPosition=new Map(),seams=new Set();
   for(let i=0;i<count;i++){
    const key=remap[i],uv=[uvs[i*2],uvs[i*2+1]],first=uvByPosition.get(key);
    if(first&&(Math.abs(first[0]-uv[0])>1e-5||Math.abs(first[1]-uv[1])>1e-5))seams.add(key);
    else if(!first)uvByPosition.set(key,uv);
   }
   vertexLock=new Uint8Array(count);
   for(let i=0;i<count;i++)if(seams.has(remap[i]))vertexLock[i]=2;
  }
  const target=Math.floor(indices.length*options.ratio/3)*3;
  const [reduced,error]=S.simplifyWithAttributes(indices,positions,3,attributes,stride,attributeWeights,vertexLock,target,options.error,options.flags??['Permissive',...(joints?['RegularizeLight']:[])]);
  const [remap,used]=S.compactMesh(reduced);
  primitive.indices=store(reduced,{componentType:5125,type:'SCALAR'});
  for(const [semantic,index] of Object.entries(original.attributes)){
   if(options.paintedColors&&semantic.startsWith('TEXCOORD_')){delete primitive.attributes[semantic];continue;}
   const values=read(index),a=source.accessors[index],size=sizes[a.type],compact=new values.constructor(used*size);
   for(let i=0;i<remap.length;i++)if(remap[i]!==0xffffffff)for(let j=0;j<size;j++)compact[remap[i]*size+j]=values[i*size+j];
   primitive.attributes[semantic]=store(compact,a);
   if(semantic==='POSITION'){
    const a=gltf.accessors[primitive.attributes[semantic]];a.min=[Infinity,Infinity,Infinity];a.max=[-Infinity,-Infinity,-Infinity];
    for(let i=0;i<compact.length;i++){a.min[i%3]=Math.min(a.min[i%3],compact[i]);a.max[i%3]=Math.max(a.max[i%3],compact[i]);}
   }
  }
  stats.push({mesh:source.meshes[m].name,before:indices.length/3,after:reduced.length/3,vertices:used,error,joints:usedJoints.length});
 }
 // Remove orphaned original geometry without changing shared animation/image
 // URLs. Returning visitors download only the geometry that actually changed.
 const accessors=new Map(),views=new Map(),buffers=new Map();
 const visit=i=>{if(!accessors.has(i))accessors.set(i,accessors.size);return accessors.get(i);};
 for(const mesh of gltf.meshes)for(const p of mesh.primitives){
  p.indices=visit(p.indices);for(const k in p.attributes)p.attributes[k]=visit(p.attributes[k]);
  for(const t of p.targets||[])for(const k in t)t[k]=visit(t[k]);
 }
 for(const skin of gltf.skins||[])if(skin.inverseBindMatrices!==undefined)skin.inverseBindMatrices=visit(skin.inverseBindMatrices);
 for(const a of gltf.animations||[])for(const s of a.samplers){s.input=visit(s.input);s.output=visit(s.output);}
 gltf.accessors=[...accessors.keys()].map(i=>gltf.accessors[i]);
 for(const a of gltf.accessors){if(!views.has(a.bufferView))views.set(a.bufferView,views.size);a.bufferView=views.get(a.bufferView);}
 gltf.bufferViews=[...views.keys()].map(i=>gltf.bufferViews[i]);
 for(const v of gltf.bufferViews){if(!buffers.has(v.buffer))buffers.set(v.buffer,buffers.size);v.buffer=buffers.get(v.buffer);}
 gltf.buffers=[...buffers.keys()].map(i=>gltf.buffers[i]);
 const output=new Map();
 for(const b of gltf.buffers)output.set(b.uri,generated.get(b.uri)||files.get(b.uri));
 for(const image of gltf.images||[])output.set(image.uri,files.get(image.uri));
 const data=Buffer.from(JSON.stringify(gltf)),model=hash(data)+'.gltf';output.set(model,{data});
 return {gltf,model,files:output,stats};
}
