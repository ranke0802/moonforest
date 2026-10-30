import {caveFogFallback} from './cave-fog-binding.js';

// Borrow an already resident rock map. Its streaming owner retains disposal and
// all existing 4K/1K/512/256 tier decisions; this adds no image or GPU texture.
export function caveRockTexture(world){
 const asset=world.villagePrepared?.assets?.get('cave-01-eroded-wall');
 const material=asset?.tiers?.get(2)?.meshes?.[0]?.material??asset?.baseMeshes?.[0]?.material;
 const texture=material?.albedoTexture;
 return texture?.getInternalTexture?.()?texture:caveFogFallback(world.scene);
}
export const CAVE_ROCK_GLSL=`
#define CAVE_ROCK_SURFACE
uniform sampler2D caveRockMap;
uniform float caveRockToGamma;
vec3 caveRockShade(vec3 p,vec3 normal,float explored){
 vec3 n=abs(normalize(normal));
 vec2 surface=n.y>max(n.x,n.z)?p.xz:(n.x>n.z?p.zy:p.xy);
 vec2 uv=fract(surface*.11);
 vec3 paint=texture2D(caveRockMap,uv).rgb;
 paint=mix(paint,pow(max(paint,vec3(.001)),vec3(.454545)),caveRockToGamma);
 // Retain the authored rock map's coloured facets instead of reducing it to
 // grey luminance and coating every wall with a synthetic concrete palette.
 vec3 rock=paint*.96+vec3(.018,.014,.016);
 float facing=.82+.18*max(0.,dot(normalize(normal),normalize(vec3(-.35,.78,-.52))));
 return rock*facing*mix(.87,1.,smoothstep(.05,.95,explored));
}`;
export function bindCaveRock(material,world){
 const texture=caveRockTexture(world),effect=material.getEffect?.(),gamma=texture.gammaSpace===false?1:0;
 material.setTexture('caveRockMap',texture);material.setFloat('caveRockToGamma',gamma);
 effect?.setTexture('caveRockMap',texture);effect?.setFloat('caveRockToGamma',gamma);
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
 for(const sub of ground.subMeshes){
  let x0=Infinity,x1=-Infinity,z0=Infinity,z1=-Infinity;
  for(let i=sub.indexStart;i<sub.indexStart+sub.indexCount;i++){const id=original[i],x=id%rowWidth,z=Math.floor(id/rowWidth);x0=Math.min(x0,x);x1=Math.max(x1,x);z0=Math.min(z0,z);z1=Math.max(z1,z);}
  const start=indices.length;
  for(let z=z0;z<z1;z+=stride)for(let x=x0;x<x1;x+=stride){
   const xx=Math.min(x+stride,x1),zz=Math.min(z+stride,z1),north=z===z0,east=xx===x1,south=zz===z1,west=x===x0;
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
