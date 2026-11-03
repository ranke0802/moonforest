import {MaterialPluginBase,SubMesh,VertexBuffer,VertexData} from '@babylonjs/core';
import {CAVE_VIEW_GLSL} from './witch-cave-visibility.js';
import {CAVE_ROCK_GLSL} from './cave-rock-shell.js';
import {CAVE_ROCK_UV_DETAIL} from './cave-rock-palette.js';
import {CavePaintLightShade} from './cave-painted-light-runtime.js';
import {groundTriangleKey,retiredLaboratoryGround,laboratoryEnabled,activeLaboratoryClip,CAVE_LABORATORY_CLIP_GLSL} from './cave-laboratory-geometry.js';
import {restoreLaboratoryFloorNormals} from './cave-laboratory-terrain.js';

// One material and vertex buffer; bounded terrain patches only change index
// submission. The sampled walking surface and its original triangles stay exact.
export function partitionCaveGround(mesh,terrain,{laboratory=null}={}){
 // The shared outdoor floor stretches its border beyond the mountains. In a
 // closed cave that invisible skirt creates enormous patch bounds. Trim only
 // that non-playable border, preserving all walking vertices and triangles.
 const positions=mesh.getVerticesData(VertexBuffer.PositionKind),normals=mesh.getVerticesData(VertexBuffer.NormalKind),uvs=mesh.getVerticesData(VertexBuffer.UVKind);let positionsChanged=false;
 for(let i=0;i<positions.length;i+=3){
  if(positions[i]<-terrain.half||positions[i]>terrain.half||positions[i+2]<-terrain.half||positions[i+2]>terrain.half)positionsChanged=true;
  positions[i]=Math.max(-terrain.half,Math.min(terrain.half,positions[i]));positions[i+2]=Math.max(-terrain.half,Math.min(terrain.half,positions[i+2]));
  uvs[i/3*2]=(positions[i]+terrain.half)/terrain.size;uvs[i/3*2+1]=(positions[i+2]+terrain.half)/terrain.size;
 }
 // Native activation repartitions the same mesh once. Its indices are already
 // bucketed, so recomputing unchanged normals in that new summation order could
 // perturb protected floor bits despite identical vertex positions.
 if(!mesh.metadata?.caveTerrainPatches||positionsChanged)VertexData.ComputeNormals(positions,mesh.getIndices(),normals);
 restoreLaboratoryFloorNormals(normals,terrain);
 mesh.setVerticesData(VertexBuffer.PositionKind,positions,false);mesh.setVerticesData(VertexBuffer.NormalKind,normals,false);mesh.setVerticesData(VertexBuffer.UVKind,uvs,false);mesh.refreshBoundingInfo();
 const n=terrain.subdivisions,tile=32,columns=Math.ceil(n/tile),buckets=Array.from({length:columns*columns},()=>[]),source=mesh.getIndices(),retired=retiredLaboratoryGround(laboratory,n);let removed=0;
 for(let i=0;i<source.length;i+=3){
  const a=source[i],b=source[i+1],c=source[i+2],key=groundTriangleKey(a,b,c,n);
  if(retired?.has(key)){removed++;continue;}
  const vertex=Math.min(a,b,c),row=Math.floor(vertex/(n+1)),col=vertex%(n+1);
  buckets[Math.floor(row/tile)*columns+Math.floor(col/tile)].push(a,b,c);
 }
 const indices=buckets.flat();mesh.setIndices(indices);mesh.releaseSubMeshes();let offset=0;
 for(const bucket of buckets){if(!bucket.length)continue;const sub=new SubMesh(0,0,mesh.getTotalVertices(),offset,bucket.length,mesh);sub.updateBoundingInfo(mesh.getWorldMatrix());offset+=bucket.length;}
 mesh.metadata={...mesh.metadata,caveTerrainPatches:mesh.subMeshes.length,caveLaboratoryRetiredTriangles:retired?.size??0,caveLaboratoryRemovedThisPartition:removed,caveLaboratoryRevision:laboratory?.enabled?laboratory.revision:null};
 return mesh.subMeshes.length;
}

// Bounded, static colour pools preserve painted toon/shadow/ink passes. They
// illuminate only environment materials, never the existing 8K player.
// World-space colour keeps the existing floor painting from stretching into
// black vertical bands on the high shoulders. No texture, mesh or draw added.
const cliffCode=`
#if defined(NORMAL) && defined(CAVE_ROCK_SURFACE)
float caveCliff = 1.0-smoothstep(.42,.86,abs(normalW.y));
if(caveCliff>.001){
 vec3 caveRock = caveRockAlbedo(vPositionW,normalW);
 float caveRockShadow = 1.;
 if(numLights>0.)caveRockShadow=clamp(1.-numLights*(1.-aggShadow),0.,1.);
 color.rgb=mix(color.rgb,caveRock*mix(.60,1.,caveRockShadow),caveCliff*.92);
}
#endif
`;
export class CaveSurfaceShade extends MaterialPluginBase {
 constructor(material,{ground=false,camera=null}={}){super(material,ground?'CaveGroundMood':'CaveRockMood',325,{MOONFOREST_CAVE_SURFACE:true,MOONFOREST_CAVE_SURFACE_GROUND:ground},true,true);this.doNotSerialize=true;this.ground=ground;this.camera=camera;this.active=true;}
 getClassName(){return 'MoonforestCaveSurfaceShade';}
 getUniforms(){return {ubo:[{name:'caveMoodActive',size:1,type:'float'},{name:'caveRockTone',size:1,type:'float'},{name:'caveRockPaintedWeight',size:1,type:'float'},{name:'caveLegacyLabClip',size:1,type:'float'},{name:'caveLaboratoryRect',size:4,type:'vec4'},{name:'caveEye',size:3,type:'vec3'},{name:'caveFocus',size:3,type:'vec3'},{name:'cavePlayerView',size:4,type:'vec4'},{name:'caveBossView',size:4,type:'vec4'}],fragment:'uniform float caveMoodActive;uniform float caveRockTone;uniform float caveRockPaintedWeight;uniform float caveLegacyLabClip;uniform vec4 caveLaboratoryRect;uniform vec3 caveEye;uniform vec3 caveFocus;uniform vec4 cavePlayerView;uniform vec4 caveBossView;'};}
 bindForSubMesh(buffer){buffer.updateFloat('caveMoodActive',this.active?1:0);buffer.updateFloat('caveRockTone',this._material.metadata?.caveRockTone?1:0);buffer.updateFloat('caveRockPaintedWeight',this._material.metadata?.caveRockPaletteOnly?0:CAVE_ROCK_UV_DETAIL);const clip=this.active&&activeLaboratoryClip(this._material.getScene(),this._material),rect=clip?.bounds;buffer.updateFloat('caveLegacyLabClip',clip?1:0);buffer.updateFloat4('caveLaboratoryRect',rect?.minX??0,rect?.minZ??0,rect?.maxX??0,rect?.maxZ??0);if(this.camera){buffer.updateVector3('caveEye',this.camera.globalPosition);buffer.updateVector3('caveFocus',this.camera.target);}const fog=this._material.getScene().metadata?.caveFogRuntime,p=fog?.playerView,b=fog?.bossView;buffer.updateFloat4('cavePlayerView',p?.x??0,p?.y??0,p?.z??0,p?.w??0);buffer.updateFloat4('caveBossView',b?.x??0,b?.y??0,b?.z??0,b?.w??0);}
 getCustomCode(type){
  if(type!=='fragment')return null;
  const common={CUSTOM_FRAGMENT_DEFINITIONS:CAVE_VIEW_GLSL+CAVE_ROCK_GLSL+CAVE_LABORATORY_CLIP_GLSL,CUSTOM_FRAGMENT_MAIN_BEGIN:'if(caveLaboratoryClip(vPositionW,caveLegacyLabClip,caveLaboratoryRect))discard;'+(this.ground?`\n#ifdef NORMAL\nif(caveMoodActive>.5 && caveTerrainCutaway(vPositionW,vNormalW,caveEye,caveFocus))discard;\n#endif\n`:'if(caveMoodActive>.5 && caveForegroundCutaway(vPositionW,caveEye,caveFocus))discard;')};
  // Babylon discovers hook names inside the base constructor, before ground
  // is assigned. Register both names so the floor works even before another
  // floor plugin is added during asynchronous texture loading.
  return {...common,CUSTOM_FRAGMENT_BEFORE_FOG:this.ground?'if(caveMoodActive>.5){'+cliffCode+'}':'',
   CUSTOM_FRAGMENT_BEFORE_FINALCOLORCOMPOSITION:this.ground?'':`
if(caveMoodActive>.5&&caveRockTone>.5){
 vec3 caveToneNormal=vec3(0.,1.,0.);
#ifdef NORMAL
 caveToneNormal=normalW;
#endif
 float caveToneShadow=1.;
 if(numLights>0.)caveToneShadow=clamp(1.-numLights*(1.-aggShadow),0.,1.);
 vec3 caveBroad=caveRockAlbedo(vPositionW,caveToneNormal)*mix(.76,1.,caveToneShadow);
 finalDiffuse=mix(caveBroad,caveRockPaintedDetail(caveBroad,finalDiffuse),caveRockPaintedWeight);
}`};
 }
}
export function caveSurfaceStyle(world){
 partitionCaveGround(world.ground,world.terrain);
 const activate=(material,ground=false)=>{const plugin=material.pluginManager?.getPlugin(ground?'CaveGroundMood':'CaveRockMood')??new CaveSurfaceShade(material,{ground,camera:world.camera});plugin.camera=world.camera;plugin.active=true;plugin.previousFogEnabled=material.fogEnabled;material.fogEnabled=false;const paint=material.pluginManager?.getPlugin('CavePaintLight')??new CavePaintLightShade(material,{ground});paint.active=true;return plugin;};
 const plugins=new Map([[world.floorMaterial,activate(world.floorMaterial,true)]]),seen=new WeakSet(),pending=new Set(),watched=new Map(),dead=new WeakSet();
 let disposed=false,activeLaboratory=null;
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
 // Incoming LODs must acquire their cave grading BEFORE their real shader is
 // warmed. Waiting for the next render can prepare an unpainted bright variant
 // and let shader hot-swapping briefly reuse it on the new distant source.
 const attach=material=>{
  if(!material||disposed||dead.has(material))return false;
  track(material);
  if(seen.has(material)||plugins.has(material))return plugins.has(material);
  if(material!==world.floorMaterial&&!material.metadata?.villageToon)return false;
  material.unfreeze();plugins.set(material,activate(material,material===world.floorMaterial));seen.add(material);pending.delete(material);return true;
 };
 const bind=()=>{
  // Babylon's material-added event is deferred. Observe newly loaded sources
  // before their first draw as well, avoiding a one-frame ungraded flash.
  if(materialCount!==world.scene.materials.length){materialCount=world.scene.materials.length;for(const material of world.scene.materials)track(material);}
  for(const material of pending)attach(material);
 };
 const renderObserver=world.scene.onBeforeRenderObservable.add(bind);
 const dispose=()=>{
  if(disposed)return;disposed=true;
  world.scene.onNewMaterialAddedObservable.remove(observer);world.scene.onMaterialRemovedObservable.remove(removedObserver);world.scene.onBeforeRenderObservable.remove(renderObserver);world.scene.onDisposeObservable.remove(sceneObserver);
  for(const [material,plugin]of plugins){plugin.active=false;material.fogEnabled=plugin.previousFogEnabled;const paint=material.pluginManager?.getPlugin('CavePaintLight');if(paint)paint.active=false;}
  for(const [material,subscription]of watched)material.onDisposeObservable.remove(subscription);
  plugins.clear();watched.clear();pending.clear();
  if(world.scene.metadata?.caveLaboratoryGeometry===activeLaboratory)world.scene.metadata.caveLaboratoryGeometry=null;
 };
 const sceneObserver=world.scene.onDisposeObservable.addOnce(dispose);
 const activateLaboratory=contract=>{
  if(disposed||!laboratoryEnabled(contract))return false;
  if(world.ground.metadata?.caveLaboratoryRevision===contract.revision)return true;
  if(world.terrain.caveLaboratoryVersion!==contract.version)throw Error('Laboratory terrain and structural geometry revisions differ');
  if(world.caveFog&&typeof world.caveFog.replaceGround!=='function')throw Error('Laboratory ground requires a synchronized fog replacement');
  partitionCaveGround(world.ground,world.terrain,{laboratory:contract});world.caveFog?.replaceGround(world.ground,{force:true});activeLaboratory=contract;world.scene.metadata={...world.scene.metadata,caveLaboratoryGeometry:contract};return true;
 };
 return {dispose,attach,activateLaboratory,inspect:()=>({pending:pending.size,active:plugins.size,tracked:watched.size,disposed})};
}
