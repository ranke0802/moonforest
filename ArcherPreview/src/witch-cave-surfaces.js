import {MaterialPluginBase,SubMesh,VertexBuffer,VertexData} from '@babylonjs/core';

// One material and vertex buffer; bounded terrain patches only change index
// submission. The sampled walking surface and its original triangles stay exact.
export function partitionCaveGround(mesh,terrain){
 // The shared outdoor floor stretches its border beyond the mountains. In a
 // closed cave that invisible skirt creates enormous patch bounds. Trim only
 // that non-playable border, preserving all walking vertices and triangles.
 const positions=mesh.getVerticesData(VertexBuffer.PositionKind),normals=mesh.getVerticesData(VertexBuffer.NormalKind),uvs=mesh.getVerticesData(VertexBuffer.UVKind);
 for(let i=0;i<positions.length;i+=3){
  positions[i]=Math.max(-terrain.half,Math.min(terrain.half,positions[i]));positions[i+2]=Math.max(-terrain.half,Math.min(terrain.half,positions[i+2]));
  uvs[i/3*2]=(positions[i]+terrain.half)/terrain.size;uvs[i/3*2+1]=(positions[i+2]+terrain.half)/terrain.size;
 }
 VertexData.ComputeNormals(positions,mesh.getIndices(),normals);
 mesh.setVerticesData(VertexBuffer.PositionKind,positions,false);mesh.setVerticesData(VertexBuffer.NormalKind,normals,false);mesh.setVerticesData(VertexBuffer.UVKind,uvs,false);mesh.refreshBoundingInfo();
 const n=terrain.subdivisions,tile=32,columns=Math.ceil(n/tile),buckets=Array.from({length:columns*columns},()=>[]),source=mesh.getIndices();
 for(let i=0;i<source.length;i+=6){
  const vertex=Math.min(...source.slice(i,i+6)),row=Math.floor(vertex/(n+1)),col=vertex%(n+1);
  buckets[Math.floor(row/tile)*columns+Math.floor(col/tile)].push(...source.slice(i,i+6));
 }
 const indices=buckets.flat();mesh.setIndices(indices);mesh.releaseSubMeshes();let offset=0;
 for(const bucket of buckets){if(!bucket.length)continue;const sub=new SubMesh(0,0,mesh.getTotalVertices(),offset,bucket.length,mesh);sub.updateBoundingInfo(mesh.getWorldMatrix());offset+=bucket.length;}
 mesh.metadata={...mesh.metadata,caveTerrainPatches:mesh.subMeshes.length};
 return mesh.subMeshes.length;
}

// Bounded, static colour pools preserve painted toon/shadow/ink passes. They
// illuminate only environment materials, never the existing 8K player.
const colorCode=`
float caveWarm = max(max(exp(-dot(vPositionW.xz-vec2(-44.,38.),vPositionW.xz-vec2(-44.,38.))/35.),
                        exp(-dot(vPositionW.xz-vec2(-38.,-15.),vPositionW.xz-vec2(-38.,-15.))/55.)),
                    max(exp(-dot(vPositionW.xz-vec2(20.,-36.),vPositionW.xz-vec2(20.,-36.))/32.),
                        exp(-dot(vPositionW.xz-vec2(35.,16.),vPositionW.xz-vec2(35.,16.))/30.)));
float caveViolet = exp(-dot(vPositionW.xz-vec2(29.,-34.),vPositionW.xz-vec2(29.,-34.))/40.);
float caveLow = mix(.82,1.,smoothstep(-3.,10.,vPositionW.y));
vec3 caveTint = mix(vec3(.87,.92,1.)*caveLow,vec3(1.14,1.02,.84),caveWarm*.78);
caveTint = mix(caveTint,vec3(1.02,.91,1.13),caveViolet*.62);
`;
export class CaveSurfaceShade extends MaterialPluginBase {
 constructor(material,{ground=false}={}){super(material,ground?'CaveGroundMood':'CaveRockMood',325,{},true,true);this.ground=ground;this.active=true;}
 getUniforms(){return {ubo:[{name:'caveMoodActive',size:1,type:'float'}],fragment:'uniform float caveMoodActive;'};}
 bindForSubMesh(buffer){buffer.updateFloat('caveMoodActive',this.active?1:0);}
 getCustomCode(type){
  if(type!=='fragment')return null;
  return this.ground?{CUSTOM_FRAGMENT_BEFORE_FOG:'if(caveMoodActive>.5){'+colorCode+'color.rgb *= caveTint;}'}:
   {CUSTOM_FRAGMENT_BEFORE_FINALCOLORCOMPOSITION:'if(caveMoodActive>.5){'+colorCode+'finalDiffuse *= caveTint;}'};
 }
}
export function caveSurfaceStyle(world){
 partitionCaveGround(world.ground,world.terrain);
 const activate=(material,ground=false)=>{const plugin=material.pluginManager?.getPlugin(ground?'CaveGroundMood':'CaveRockMood')??new CaveSurfaceShade(material,{ground});plugin.active=true;return plugin;};
 const plugins=[activate(world.floorMaterial,true)],seen=new WeakSet(),pending=new Set(world.scene.materials);
 const observer=world.scene.onNewMaterialAddedObservable.add(material=>pending.add(material));
 let materialCount=-1;
 const bind=()=>{
  // Babylon's material-added event is deferred. Observe newly loaded sources
  // before their first draw as well, avoiding a one-frame ungraded flash.
  if(materialCount!==world.scene.materials.length){materialCount=world.scene.materials.length;for(const material of world.scene.materials)if(!seen.has(material))pending.add(material);}
  for(const material of pending){
  if(material.metadata?.villageToon&&!seen.has(material)){
   material.unfreeze();plugins.push(activate(material));seen.add(material);pending.delete(material);
  }else if(material.getClassName()!=='PBRMaterial'||seen.has(material))pending.delete(material);
 }};
 const renderObserver=world.scene.onBeforeRenderObservable.add(bind);
 return {dispose(){world.scene.onNewMaterialAddedObservable.remove(observer);world.scene.onBeforeRenderObservable.remove(renderObserver);for(const plugin of plugins)plugin.active=false;pending.clear();}};
}
