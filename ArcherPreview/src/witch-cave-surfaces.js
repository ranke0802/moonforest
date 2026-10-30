import {MaterialPluginBase,SubMesh,VertexBuffer,VertexData} from '@babylonjs/core';
import {CAVE_VIEW_GLSL} from './witch-cave-visibility.js';

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
// World-space colour keeps the existing floor painting from stretching into
// black vertical bands on the high shoulders. No texture, mesh or draw added.
const cliffCode=`
#ifdef NORMAL
float caveCliff = max(1.0-smoothstep(.42,.86,abs(normalW.y)),1.0-smoothstep(.14,.26,dot(baseColor.rgb,vec3(.299,.587,.114))));
if(caveCliff>.001){
 float caveStrata = .5+.5*sin(vPositionW.x*1.1+vPositionW.y*1.8+sin(vPositionW.z*.7))*sin(vPositionW.z*1.3-vPositionW.y*.9+sin(vPositionW.x*.5));
 float caveGrain = .5+.5*sin(vPositionW.x*8.7+vPositionW.y*11.3)*sin(vPositionW.z*9.9-vPositionW.y*6.1);
 vec3 caveRock = mix(vec3(.32,.28,.30),vec3(.49,.435,.405),.58+.16*caveStrata+.04*caveGrain);
 float caveFacing = .82+.18*max(0.,dot(normalize(normalW),normalize(vec3(-.35,.78,-.52))));
 float caveRockShadow = 1.;
 if(numLights>0.)caveRockShadow=clamp(1.-numLights*(1.-aggShadow),0.,1.);
 color.rgb=mix(color.rgb,caveRock*caveFacing*mix(.60,1.,caveRockShadow)*caveTint,caveCliff*.92);
}
#endif
`;
export class CaveSurfaceShade extends MaterialPluginBase {
 constructor(material,{ground=false,camera=null}={}){super(material,ground?'CaveGroundMood':'CaveRockMood',325,{},true,true);this.ground=ground;this.camera=camera;this.active=true;}
 getUniforms(){return {ubo:[{name:'caveMoodActive',size:1,type:'float'},{name:'caveEye',size:3,type:'vec3'},{name:'caveFocus',size:3,type:'vec3'}],fragment:'uniform float caveMoodActive;uniform vec3 caveEye;uniform vec3 caveFocus;'};}
 bindForSubMesh(buffer){buffer.updateFloat('caveMoodActive',this.active?1:0);if(this.camera){buffer.updateVector3('caveEye',this.camera.globalPosition);buffer.updateVector3('caveFocus',this.camera.target);}}
 getCustomCode(type){
  if(type!=='fragment')return null;
  const common={CUSTOM_FRAGMENT_DEFINITIONS:CAVE_VIEW_GLSL,CUSTOM_FRAGMENT_MAIN_BEGIN:'if(caveMoodActive>.5 && caveForegroundCutaway(vPositionW,caveEye,caveFocus))discard;'};
  // Babylon discovers hook names inside the base constructor, before ground
  // is assigned. Register both names so the floor works even before another
  // floor plugin is added during asynchronous texture loading.
  return {...common,CUSTOM_FRAGMENT_BEFORE_FOG:this.ground?'if(caveMoodActive>.5){'+colorCode+'color.rgb *= caveTint;'+cliffCode+'}':'',
   CUSTOM_FRAGMENT_BEFORE_FINALCOLORCOMPOSITION:this.ground?'':'if(caveMoodActive>.5){'+colorCode+'finalDiffuse *= caveTint;}'};
 }
}
export function caveSurfaceStyle(world){
 partitionCaveGround(world.ground,world.terrain);
 const activate=(material,ground=false)=>{const plugin=material.pluginManager?.getPlugin(ground?'CaveGroundMood':'CaveRockMood')??new CaveSurfaceShade(material,{ground,camera:world.camera});plugin.camera=world.camera;plugin.active=true;return plugin;};
 const plugins=new Map([[world.floorMaterial,activate(world.floorMaterial,true)]]),seen=new WeakSet(),pending=new Set(),watched=new Map(),dead=new WeakSet();
 let disposed=false;
 const track=material=>{
  if(disposed||dead.has(material)||watched.has(material)||seen.has(material))return;
  if(material!==world.floorMaterial&&material.getClassName()!=='PBRMaterial'){seen.add(material);return;}
  watched.set(material,material.onDisposeObservable.addOnce(()=>{
   dead.add(material);pending.delete(material);plugins.delete(material);watched.delete(material);
  }));
  if(!plugins.has(material))pending.add(material);
 };
 for(const material of world.scene.materials)track(material);
 const observer=world.scene.onNewMaterialAddedObservable.add(track);
 // Material-added notifications are deferred, but removal is synchronous.
 // Subscribe before an immediate dispose can finish. Removing to an
 // AssetContainer is NOT disposal: its live material still needs the tint.
 const removedObserver=world.scene.onMaterialRemovedObservable.add(track);
 let materialCount=-1;
 const bind=()=>{
  // Babylon's material-added event is deferred. Observe newly loaded sources
  // before their first draw as well, avoiding a one-frame ungraded flash.
  if(materialCount!==world.scene.materials.length){materialCount=world.scene.materials.length;for(const material of world.scene.materials)track(material);}
  for(const material of pending){
  if(material.metadata?.villageToon&&!seen.has(material)){
   material.unfreeze();plugins.set(material,activate(material));seen.add(material);pending.delete(material);
  }
 }};
 const renderObserver=world.scene.onBeforeRenderObservable.add(bind);
 const dispose=()=>{
  if(disposed)return;disposed=true;
  world.scene.onNewMaterialAddedObservable.remove(observer);world.scene.onMaterialRemovedObservable.remove(removedObserver);world.scene.onBeforeRenderObservable.remove(renderObserver);world.scene.onDisposeObservable.remove(sceneObserver);
  for(const plugin of plugins.values())plugin.active=false;
  for(const [material,subscription]of watched)material.onDisposeObservable.remove(subscription);
  plugins.clear();watched.clear();pending.clear();
 };
 const sceneObserver=world.scene.onDisposeObservable.addOnce(dispose);
 return {dispose,inspect:()=>({pending:pending.size,active:plugins.size,tracked:watched.size,disposed})};
}
