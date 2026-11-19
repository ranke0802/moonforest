import {Geometry,SubMesh,VertexBuffer} from '@babylonjs/core';
import {MeshoptSimplifier} from 'meshoptimizer/simplifier';

// Index-only simplification (meshoptimizer). Vertices, skin weights, UVs and
// normals stay exactly as authored; only fewer triangles reference them, so
// the GPU shades fewer vertices. Used where the shape is all that matters:
// the terrain surface and the inverted-hull outlines (2026-11-19: on the
// plains the ground was 93K triangles and character hulls 74–150K).
// 0.3 only; ?simplify=0 turns it off.
let ready=null,available=false;
export const simplifierAvailable=()=>available;
export function simplifierReady(){return ready??=MeshoptSimplifier.ready.then(()=>{available=!!MeshoptSimplifier.supported;return available;},()=>false);}
export const simplifyEnabled=()=>{const data=globalThis.document?.documentElement?.dataset;return !!data?.edition&&new URLSearchParams(globalThis.location?.search??'').get('simplify')!=='0';};

// → Uint32Array of the reduced indices, or null when it would not save enough.
export function simplifyIndices(positions,indices,{ratio=.5,error=.01,absolute=false,minSaving=.15}={}){
 if(!available||!positions||!indices?.length)return null;
 const source=indices instanceof Uint32Array?indices:Uint32Array.from(indices);
 const target=Math.max(3,Math.floor(source.length*ratio/3)*3);
 const [result]=MeshoptSimplifier.simplify(source,positions instanceof Float32Array?positions:Float32Array.from(positions),3,target,error,absolute?['ErrorAbsolute']:[]);
 if(!result?.length||result.length>source.length*(1-minSaving))return null;
 return result;
}
// A mesh that owns its geometry (terrain, baked outline meshes).
export function simplifyOwnMesh(mesh,options){
 if(!simplifyEnabled()||!available||mesh.geometry?.meshes?.length>1||mesh.subMeshes?.length!==1)return false;
 const reduced=simplifyIndices(mesh.getVerticesData(VertexBuffer.PositionKind),mesh.getIndices(),options);if(!reduced)return false;
 const before=mesh.getTotalIndices();mesh.setIndices(reduced,mesh.getTotalVertices());
 mesh.metadata={...mesh.metadata,simplifiedTriangles:[before/3,reduced.length/3]};return true;
}
// A runtime outline shell shares its body's vertex buffers. It gets its own
// index buffer over the same (non-owned) vertex buffers, so the body keeps
// every triangle and no vertex data is copied. One reduction per body geometry.
const reductions=new WeakMap();
export function simplifySharedShell(shell,options){
 if(!simplifyEnabled()||!available)return false;
 const geometry=shell.geometry;if(!geometry||shell.subMeshes?.length!==1)return false;
 let reduced=reductions.get(geometry);
 if(reduced===undefined){reduced=simplifyIndices(geometry.getVerticesData(VertexBuffer.PositionKind),geometry.getIndices(),options);reductions.set(geometry,reduced);}
 if(!reduced)return false;
 const scene=shell.getScene(),engine=scene.getEngine(),own=new Geometry(shell.name+' / ink indices',scene),total=geometry.getTotalVertices();
 for(const kind of geometry.getVerticesDataKinds()){
  const vb=geometry.getVertexBuffer(kind),buffer=vb?._buffer;if(!buffer)return own.dispose(),false;
  own.setVerticesBuffer(new VertexBuffer(engine,buffer,kind,false,undefined,vb.byteStride,vb.getIsInstanced(),vb.byteOffset,vb.getSize(),vb.type,vb.normalized,true,vb.getInstanceDivisor(),false),total);
 }
 own.setIndices(reduced,total);
 const bounds=shell.getBoundingInfo(),min=bounds.minimum.clone(),max=bounds.maximum.clone();
 geometry.releaseForMesh(shell,false);own.applyToMesh(shell);
 shell.releaseSubMeshes();new SubMesh(0,0,total,0,reduced.length,shell);
 // Keep the posed bounds the shell was given at creation (culling).
 shell.getBoundingInfo().reConstruct(min,max,shell.getWorldMatrix());
 shell.metadata={...shell.metadata,simplifiedTriangles:[geometry.getTotalIndices()/3,reduced.length/3]};return true;
}
