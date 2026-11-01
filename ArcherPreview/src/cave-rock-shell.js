import {caveFogFallback,readyShaderEffect} from './cave-fog-binding.js';
import {CAVE_ROCK_PALETTE_GLSL} from './cave-rock-palette.js';
import {groundTriangleKey} from './cave-laboratory-geometry.js';

// Borrow an already resident rock map. Its streaming owner retains disposal and
// all existing 4K/1K/512/256 tier decisions; this adds no image or GPU texture.
export function caveRockTexture(world){
 const asset=world.villagePrepared?.assets?.get('cave-01-eroded-wall');
 const material=asset?.tiers?.get(2)?.meshes?.[0]?.material??asset?.baseMeshes?.[0]?.material;
 const texture=material?.albedoTexture;
 return texture?.getInternalTexture?.()?texture:caveFogFallback(world.scene);
}
export const CAVE_ROCK_GLSL=CAVE_ROCK_PALETTE_GLSL;
export function bindCaveRock(material,world,effect=null){
 const texture=caveRockTexture(world),gamma=texture.gammaSpace===false?1:0;
 material.setTexture('caveRockMap',texture);material.setFloat('caveRockToGamma',gamma);
 effect=readyShaderEffect(effect);if(!effect)return;
 effect.setTexture('caveRockMap',texture);effect.setFloat('caveRockToGamma',gamma);
}

// Keep every original patch-boundary vertex, so the substitute can meet the
// detailed floor without cracks. Only fully hidden patches use these indices.
// Interior vertices are a sparse subset of the exact original terrain: no
// height, collision, material, or visible LOD is changed.
export function buildCaveRockShell(ground,terrain,{stride=4}={}){
 const source=ground.getVerticesData('position'),sourceNormals=ground.getVerticesData('normal'),original=ground.getIndices(),n=terrain.subdivisions,rowWidth=n+1;
 if(!Number.isInteger(stride)||stride<1||!Number.isInteger(n))throw new TypeError('Invalid rock shell grid');
 const positions=[],normals=[],indices=[],patches=[],lookup=new Map();
 const vertex=(x,z)=>{const id=z*rowWidth+x;if(!lookup.has(id)){lookup.set(id,positions.length/3);positions.push(source[id*3],source[id*3+1],source[id*3+2]);normals.push(sourceNormals[id*3],sourceNormals[id*3+1],sourceNormals[id*3+2]);}return lookup.get(id);};
 // Only an approved replacement can leave holes in the source grid. Exact
 // cell triangles near those holes keep the sparse cover from recreating a
 // retired ridge. Temporary CPU tables are released after this one-time build.
 let present,triangles;
 if(ground.metadata?.caveLaboratoryRetiredTriangles){
  present=new Uint8Array(n*n);triangles=new Uint32Array(n*n*6);
  for(let i=0;i<original.length;i+=3){const key=groundTriangleKey(original[i],original[i+1],original[i+2],n);if(key<0)throw Error('Laboratory cover requires the original terrain grid');present[key>>1]|=1<<(key&1);triangles.set(original.slice(i,i+3),key*3);}
 }
 for(const sub of ground.subMeshes){
  let x0=Infinity,x1=-Infinity,z0=Infinity,z1=-Infinity;
  for(let i=sub.indexStart;i<sub.indexStart+sub.indexCount;i++){const id=original[i],x=id%rowWidth,z=Math.floor(id/rowWidth);x0=Math.min(x0,x);x1=Math.max(x1,x);z0=Math.min(z0,z);z1=Math.max(z1,z);}
  const start=indices.length;
  for(let z=z0;z<z1;z+=stride)for(let x=x0;x<x1;x+=stride){
   const xx=Math.min(x+stride,x1),zz=Math.min(z+stride,z1),north=z===z0,east=xx===x1,south=zz===z1,west=x===x0;
   let mixed=false;if(present)for(let v=z;v<zz&&!mixed;v++)for(let u=x;u<xx;u++)if(present[v*n+u]!==3){mixed=true;break;}
   if(mixed){
    for(let v=z;v<zz;v++)for(let u=x;u<xx;u++)for(let half=0;half<2;half++)if(present[v*n+u]&(1<<half)){
     const at=((v*n+u)*2+half)*3;for(let k=0;k<3;k++){const id=triangles[at+k];indices.push(vertex(id%rowWidth,Math.floor(id/rowWidth)));}
    }
    continue;
   }
   if(!north&&!east&&!south&&!west){const a=vertex(x,z),b=vertex(xx,z),c=vertex(xx,zz),d=vertex(x,zz);indices.push(a,b,c,a,c,d);continue;}
   const ring=[];
   for(let u=x;u<xx;u+=north?1:xx-x)ring.push(vertex(u,z));
   for(let v=z;v<zz;v+=east?1:zz-z)ring.push(vertex(xx,v));
   for(let u=xx;u>x;u-=south?1:xx-x)ring.push(vertex(u,zz));
   for(let v=zz;v>z;v-=west?1:zz-z)ring.push(vertex(x,v));
   const centre=vertex(Math.floor((x+xx)/2),Math.floor((z+zz)/2));
   for(let i=0;i<ring.length;i++)indices.push(centre,ring[i],ring[(i+1)%ring.length]);
  }
  patches.push({indexStart:start,indexCount:indices.length-start});
 }
 return {positions:Float32Array.from(positions),normals:Float32Array.from(normals),indices:Uint32Array.from(indices),patches,originalTriangles:original.length/3,triangles:indices.length/3};
}
