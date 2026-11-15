import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {MeshoptDecoder} from 'meshoptimizer';

const base=new URL('../../public/assets/',import.meta.url),read=url=>JSON.parse(fs.readFileSync(url));
const manifest=read(new URL('warrior-v3.json',base)),modelUrl=new URL(manifest.model,base),sourceBytes=fs.readFileSync(modelUrl),g=JSON.parse(sourceBytes);
await MeshoptDecoder.ready;
const raw=new Map(),views=new Map(),size=8192;
function buffer(index){const uri=g.buffers[index].uri;if(!raw.has(uri))raw.set(uri,fs.readFileSync(new URL(uri,modelUrl)));return raw.get(uri);}
function view(index){
 if(views.has(index))return views.get(index);const v=g.bufferViews[index],ext=v.extensions?.EXT_meshopt_compression;let data;
 if(ext){data=new Uint8Array(v.byteLength);MeshoptDecoder.decodeGltfBuffer(data,ext.count,ext.byteStride,buffer(ext.buffer).subarray(ext.byteOffset??0,(ext.byteOffset??0)+ext.byteLength),ext.mode,ext.filter??'NONE');}
 else data=buffer(v.buffer).subarray(v.byteOffset??0,(v.byteOffset??0)+v.byteLength);
 views.set(index,data);return data;
}
const components={5120:[1,'getInt8'],5121:[1,'getUint8'],5122:[2,'getInt16'],5123:[2,'getUint16'],5125:[4,'getUint32'],5126:[4,'getFloat32']},widths={SCALAR:1,VEC2:2,VEC3:3,VEC4:4};
function accessor(index){
 const a=g.accessors[index];if(a.sparse)throw Error('Sparse accessor needs explicit handling');const bytes=view(a.bufferView),d=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),[bytesPer,method]=components[a.componentType],n=widths[a.type],stride=g.bufferViews[a.bufferView].byteStride??bytesPer*n,offset=a.byteOffset??0;
 return i=>Array.from({length:n},(_,k)=>{let value=d[method](offset+i*stride+k*bytesPer,true);if(a.normalized){if(a.componentType===5120)value=Math.max(-1,value/127);if(a.componentType===5121)value/=255;if(a.componentType===5122)value=Math.max(-1,value/32767);if(a.componentType===5123)value/=65535;}return value;});
}
const imageSource=texture=>texture?.source??texture?.extensions?.KHR_texture_basisu?.source??texture?.extensions?.EXT_texture_webp?.source;
const oldImage=g.images.findIndex(image=>image.name==='warrior_head_clean_v2_8k');
if(oldImage<0)throw Error('Expected referenced old head texture is missing');
function slots(material){
 const out=[];function walk(object,prefix=''){for(const [key,value]of Object.entries(object??{})){if(!value||typeof value!=='object')continue;const path=prefix?prefix+'.'+key:key;if(key.endsWith('Texture')&&Number.isInteger(value.index)&&imageSource(g.textures[value.index])===oldImage)out.push({path,info:value,sampler:g.samplers?.[g.textures[value.index].sampler]??{}});else walk(value,path);}}walk(material);return out;
}
const bounds=()=>({min:[Infinity,Infinity],max:[-Infinity,-Infinity]});
function grow(box,uv){for(let k=0;k<2;k++){box.min[k]=Math.min(box.min[k],uv[k]);box.max[k]=Math.max(box.max[k],uv[k]);}}
const combined=bounds(),primitives=[],references=new Set();let triangles=0,sumTriangleArea=0;
for(const [meshIndex,mesh]of g.meshes.entries())for(const [primitiveIndex,p]of mesh.primitives.entries()){
 const material=g.materials[p.material],uses=slots(material);if(!uses.length)continue;
 const count=p.indices==null?g.accessors[p.attributes.POSITION].count:g.accessors[p.indices].count,indices=p.indices==null?i=>[i]:accessor(p.indices),slotRows=[];
 triangles+=count/3;
 for(const slot of uses){
  const transform=slot.info.extensions?.KHR_texture_transform??{},texCoord=transform.texCoord??slot.info.texCoord??0,uvIndex=p.attributes['TEXCOORD_'+texCoord];if(uvIndex==null)throw Error('Missing used UV channel');const uv=accessor(uvIndex),box=bounds(),unique=new Set();let area=0;
  const evaluate=i=>{const original=uv(i),scale=transform.scale??[1,1],offset=transform.offset??[0,0],r=transform.rotation??0,c=Math.cos(r),s=Math.sin(r),x=original[0]*scale[0],y=original[1]*scale[1];return [c*x-s*y+offset[0],s*x+c*y+offset[1]];};
  for(let i=0;i<count;i++){const index=indices(i)[0],point=evaluate(index);grow(box,point);grow(combined,point);unique.add(index);references.add(uvIndex+':'+index);}
  for(let i=0;i<count;i+=3){const a=evaluate(indices(i)[0]),b=evaluate(indices(i+1)[0]),c=evaluate(indices(i+2)[0]);area+=Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))*.5;}
  if(!slotRows.length)sumTriangleArea+=area;
  slotRows.push({slot:slot.path,uvAccessor:uvIndex,texCoord,textureTransform:transform,uniqueReferencedVertices:unique.size,uvBounds:box,sumTriangleArea:area,sampler:{wrapS:slot.sampler.wrapS??10497,wrapT:slot.sampler.wrapT??10497,magFilter:slot.sampler.magFilter??null,minFilter:slot.sampler.minFilter??null}});
 }
 primitives.push({mesh:mesh.name,meshIndex,primitiveIndex,material:material.name,triangles:count/3,slots:slotRows});
}
const outside=combined.min.some(x=>x<0)||combined.max.some(x=>x>1),pixelMin=combined.min.map(x=>Math.floor(x*size)),pixelMax=combined.max.map(x=>Math.ceil(x*size)),pot=n=>2**Math.ceil(Math.log2(Math.max(1,n))),rgbaMip=(w,h)=>{let bytes=0;for(;;){bytes+=w*h*4;if(w===1&&h===1)return bytes;w=Math.max(1,w>>1);h=Math.max(1,h>>1);}};
const candidates=[0,32,64,128].map(padding=>{
 const min=pixelMin.map(n=>Math.max(0,Math.floor((n-padding)/4)*4)),max=pixelMax.map(n=>Math.min(size,Math.ceil((n+padding)/4)*4)),width=max[0]-min[0],height=max[1]-min[1],pw=Math.min(size,pot(width)),ph=Math.min(size,pot(height));
 return {paddingPerSide:padding,origin:min,extent:max,width,height,basePixels:width*height,rectangleFraction:width*height/(size*size),potWidth:pw,potHeight:ph,estimatedPotRgbaMipBytes:rgbaMip(pw,ph),estimatedPotSavingBytes:rgbaMip(size,size)-rgbaMip(pw,ph),validBounds:!outside&&width>0&&height>0,boundarySamplingRisk:primitives.some(p=>p.slots.some(s=>(s.sampler.wrapS!==33071&&(combined.min[0]*size<padding||(1-combined.max[0])*size<padding))||(s.sampler.wrapT!==33071&&(combined.min[1]*size<padding||(1-combined.max[1])*size<padding))))};
});
const report={version:1,manifest:'warrior-v3',model:manifest.model,modelSha256:createHash('sha256').update(sourceBytes).digest('hex'),image:g.images[oldImage],sourceSize:[size,size],referencingPrimitives:primitives.length,triangles,uniqueUvAccessorVertexReferences:references.size,uvBounds:combined,uvOutsideUnitSquare:outside,sumTriangleAreaExcludingDuplicateMaterialSlots:sumTriangleArea,triangleAreaIsUnion:false,pixelBounds:{min:pixelMin,max:pixelMax},candidates,primitives,
 measurement:'Read-only actual indexed TEXCOORD/indices decode, including material texture transforms. UV triangle area is a sum, not chart-union area or proof of visible texels. Rectangles are conservative bounding crops with explicit padding; wrapping/filtering/mips and all motion visibility require separate approval. No geometry, UV, texture, runtime file or registry was changed. Hidden/unused status and deletion safety are not established.'};
fs.writeFileSync(new URL('uv-usage.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({triangles,primitives:primitives.length,uvBounds:combined,pixelBounds:report.pixelBounds,outside,candidates},null,2));
