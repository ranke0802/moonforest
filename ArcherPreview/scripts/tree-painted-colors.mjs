// Sample the existing atlas before reducing topology. Its UV seams must never
// be interpolated across newly formed triangles. glTF colors are linear RGB.
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { hash } from './resource-pack.js';
import { readAccessor } from './web-geometry.js';
const require=createRequire(import.meta.url);
const sharp=require(resolve(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp'));
const linear=c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4;

export async function bakePaintedColors(source,files){
 const gltf=structuredClone(source),output=new Map(files),images=new Map();
 for(const mesh of gltf.meshes)for(const primitive of mesh.primitives){
  const mat=gltf.materials[primitive.material],texture=gltf.textures[mat.pbrMetallicRoughness.baseColorTexture.index];
  if(!images.has(texture.source)){
   const bytes=files.get(gltf.images[texture.source].uri).data;
   images.set(texture.source,await sharp(bytes).removeAlpha().raw().toBuffer({resolveWithObject:true}));
  }
  const {data,info:{width,height,channels}}=images.get(texture.source),uvs=readAccessor(source,files,primitive.attributes.TEXCOORD_0);
  const colors=new Float32Array(uvs.length/2*3);
  const pixel=(x,y,c)=>data[((Math.max(0,Math.min(height-1,y)))*width+Math.max(0,Math.min(width-1,x)))*channels+c]/255;
  for(let i=0;i<uvs.length/2;i++){
   const x=Math.max(0,Math.min(1,uvs[i*2]))*width-.5,y=Math.max(0,Math.min(1,uvs[i*2+1]))*height-.5;
   const a=Math.floor(x),b=Math.floor(y),fx=x-a,fy=y-b;
   for(let c=0;c<3;c++)colors[i*3+c]=linear(pixel(a,b,c)*(1-fx)*(1-fy)+pixel(a+1,b,c)*fx*(1-fy)+pixel(a,b+1,c)*(1-fx)*fy+pixel(a+1,b+1,c)*fx*fy);
  }
  const bytes=Buffer.from(colors.buffer),uri=hash(bytes)+'.bin';output.set(uri,{data:bytes});
  const buffer=gltf.buffers.length,bufferView=gltf.bufferViews.length,accessor=gltf.accessors.length;
  gltf.buffers.push({uri,byteLength:bytes.length});gltf.bufferViews.push({buffer,byteLength:bytes.length});
  gltf.accessors.push({bufferView,componentType:5126,count:colors.length/3,type:'VEC3'});
  primitive.attributes.COLOR_0=accessor;
 }
 for(const mat of gltf.materials){
  delete mat.pbrMetallicRoughness.baseColorTexture;
  if(!(mat.emissiveFactor??[]).some(v=>v>0))delete mat.emissiveTexture;
 }
 return {gltf,files:output};
}
