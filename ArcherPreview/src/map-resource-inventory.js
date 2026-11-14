// An explicit, on-demand inventory of already resident resources. No fetch,
// matrix update, render, readback, query, observer or per-frame traversal.
const finite=value=>Number.isFinite(value)&&value>=0?value:null;
const text=value=>typeof value==='string'?value.slice(0,512):null;
const categories=['player','actors','terrain','scenery','outline','other'];
const astc=[[4,4],[5,4],[5,5],[6,5],[6,6],[8,5],[8,6],[8,8],[10,5],[10,6],[10,8],[10,10],[12,10],[12,12]];
const block8=new Set([33776,33777,35916,35917,36196,37488,37489,37492,37493,37494,37495]);
const block16=new Set([33778,33779,35918,35919,36492,36493,36494,36495,37490,37491,37496,37497]);
function textureEstimate(texture){
 const width=finite(texture.width),height=finite(texture.height),format=texture.format,type=texture.type;
 if(!width||!height||texture.is3D||texture.is2DArray||texture.depth>1)return {bytes:null,basis:'unknown-layout'};
 let block=null,blockBytes=0,bytesPerPixel=null;
 if(block8.has(format)){block=[4,4];blockBytes=8;}
 else if(block16.has(format)){block=[4,4];blockBytes=16;}
 else if(format>=37808&&format<=37821){block=astc[format-37808];blockBytes=16;}
 else if(format>=37840&&format<=37853){block=astc[format-37840];blockBytes=16;}
 else{
  const components={0:1,1:1,2:2,4:3,5:4,6:1,7:2,8:1,9:2,10:3,11:4}[format];
  const componentBytes={0:1,1:4,2:2,3:1,4:2,5:2,6:4,7:4}[type];
  if(components&&componentBytes)bytesPerPixel=components*componentBytes;
 }
 if(!block&&!bytesPerPixel)return {bytes:null,basis:'unknown-format-or-type'};
 let w=width,h=height,bytes=0,level=0;
 // Babylon leaves mipLevelCount at its constructor default1 for auto-generated
 // chains. A generated chain still owns every level down to1x1.
 const levels=texture.mipLevelCount>1?texture.mipLevelCount:texture.generateMipMaps?Infinity:1;
 do{bytes+=block?Math.ceil(w/block[0])*Math.ceil(h/block[1])*blockBytes:w*h*bytesPerPixel;
  level++;if(w===1&&h===1)break;w=Math.max(1,w>>1);h=Math.max(1,h>>1);
 }while(level<levels);
 return {bytes:bytes*(texture.isCube?6:1),basis:block?'GPU block-format dimensions and mip levels':'uncompressed format/type dimensions and mip levels'};
}
function geometryOf(mesh){return mesh.geometry??mesh.sourceMesh?.geometry??null;}
function triangles(mesh){const indices=finite(mesh.getTotalIndices?.());return Math.floor((indices||finite(mesh.getTotalVertices?.())||0)/3);}
function outline(mesh){return mesh.metadata?.moonforestOutline===true||mesh.sourceMesh?.metadata?.moonforestOutline===true;}
function identity(mesh){
 const source=mesh.sourceMesh??mesh,meta={...source.metadata,...mesh.metadata};
 const names=[],seen=new Set();let node=mesh,asset=null,category=null;
 for(let depth=0;node&&depth<24&&!seen.has(node);depth++,node=node.parent){
  seen.add(node);if(node.name)names.push(node.name);
  const m=node.metadata;asset??=text(m?.assetId??m?.sourceAssetId??m?.catalogAssetId??m?.moonforestAssetId);
  if(m?.actorDefinitionId)category='actors';
 }
 asset??=text(meta.assetId??meta.sourceAssetId??meta.catalogAssetId??meta.moonforestAssetId);
 const name=names.join('/'),material=mesh.material??source.material;
 if(outline(mesh))category='outline';
 else if(/(^|\/)(player|warrior)([-_/]|$)/i.test(name))category='player';
 else if(category||mesh.skeleton||source.skeleton||meta.characterStyleOverrideGroup||material?.metadata?.moonforestMonsterToon||/(guardian-bear-world|alpha-wolf-world|elena-world|goblin-world)/i.test(name))category='actors';
 else if(meta.terrain===true||/(^|\/)(terrain|ground|village-ground|plains-ground|cave-ground)([-_/]|$)/i.test(name))category='terrain';
 else if(meta.villageLodLevel!==undefined||/(^|\/)(village-|quest-prop-|authored-)/i.test(name))category='scenery';
 else category='other';
 const materialId=text(material?.metadata?.assetId??material?.metadata?.sourceAssetId);
 return {category,assetId:asset??materialId??text(source.geometry?.id)??text(source.name)??'unknown',basis:asset||materialId?'metadata':'source-geometry-or-mesh-name'};
}
function aggregate(name){return {name,meshEntries:0,placements:0,meshTriangles:0,placementBaseTriangles:0,uniqueGeometries:0,uniqueGeometryTriangles:0,_geometry:new Set()};}
function finish(group,geometryRecords){
 for(const geometry of group._geometry)group.uniqueGeometryTriangles+=geometryRecords.get(geometry)?.triangles??0;
 group.uniqueGeometries=group._geometry.size;delete group._geometry;return group;
}

export function snapshotMapResourceInventory(scene,{world=null,mapId=null,renderMetrics=null,limit=512}={}){
 if(!scene)throw new TypeError('A current scene is required for the resource inventory');
 const started=performance.now(),cap=Math.max(1,Math.min(4096,Math.floor(limit)||512));
 const meshes=(scene.meshes??[]).filter(mesh=>!mesh.isDisposed?.()),lods=new Set(),geometryRecords=new Map(),buffers=new Map();
 const categoryGroups=new Map(categories.map(name=>[name,aggregate(name)])),assetGroups=new Map(),meshOwners=new Map(),geometryOwners=new Map(),assetFiles=new Map();
 for(const record of [...(world?.villageRenderRecords??[]),...(world?.authoredPlacementRecords??[])]){
  const assetId=text(record.placement?.asset??record.instance?.assetId??record.entry?.catalog?.assetId);if(!assetId)continue;
  for(const mesh of record.meshes??[])meshOwners.set(mesh,{assetId,basis:'map-placement-record'});
 }
 for(const [assetId,asset]of world?.villagePrepared?.assets??[]){
  const loadedLods=[],modelFiles=[];
  for(const [level,tier]of asset.tiers??[]){
   if(!(tier.meshes?.length))continue;loadedLods.push(level);
   const config=asset.levels?.find(row=>row.level===level),model=text(config?.model);if(model&&!modelFiles.includes(model))modelFiles.push(model);
  }
  assetFiles.set(assetId,{loadedLods,modelFiles});
  for(const mesh of [...(asset.baseMeshes??[]),...[...(asset.tiers?.values?.()??[])].flatMap(tier=>tier.meshes??[])]){
   meshOwners.set(mesh,{assetId,basis:'prepared-asset-map'});const geometry=geometryOf(mesh);if(geometry)geometryOwners.set(geometry,{assetId,basis:'prepared-asset-map'});
  }
 }
 const totals={meshEntries:0,surfaceMeshEntries:0,outlineMeshEntries:0,placementCount:0,instancePlacements:0,templateMeshes:0,lodAlternativeMeshes:0,surfaceMeshTriangles:0,outlineMeshTriangles:0,placementBaseTriangles:0,uniqueGeometries:0,uniqueGeometryTriangles:0,geometryBuffers:0,geometryBufferBytesKnown:0,geometryBuffersUnknown:0,materials:0,textureWrappers:0,internalTextures:0,textureBytesEstimate:0,textureBytesUnknown:0,submittedTriangles:finite(renderMetrics?.submittedTriangles)};
 for(const mesh of meshes)for(const level of mesh.getLODLevels?.()??[])if(level.mesh)lods.add(level.mesh);
 for(const mesh of meshes){
  const geometry=geometryOf(mesh),count=triangles(mesh);if(!geometry||!count)continue;
  totals.meshEntries++;const ink=outline(mesh),id=identity(mesh),owner=meshOwners.get(mesh)??meshOwners.get(mesh.sourceMesh)??geometryOwners.get(geometry);
  if(owner){id.assetId=owner.assetId;id.basis=owner.basis;if(!ink)id.category='scenery';}
  // The shared terrain builder calls the main ground "forest-floor" on every
  // map. Prefer the world's actual owner over a name heuristic. Do not steal a
  // registered scenery clone merely because it happens to share that geometry.
  if(!ink&&world?.ground&&(mesh===world.ground||!owner&&geometry===geometryOf(world.ground)))id.category='terrain';
  const category=categoryGroups.get(id.category);
  if(ink){totals.outlineMeshEntries++;totals.outlineMeshTriangles+=count;}else{totals.surfaceMeshEntries++;totals.surfaceMeshTriangles+=count;}
  const isInstance=mesh.isAnInstance===true||Boolean(mesh.sourceMesh),isLod=lods.has(mesh),isTemplate=!isInstance&&(mesh.instances?.length??0)>0;
  const thin=Math.max(0,Math.floor(mesh.thinInstanceCount??0)),placements=isLod||isTemplate?0:thin||1;
  if(isLod)totals.lodAlternativeMeshes++;else if(isTemplate)totals.templateMeshes++;
  if(!ink){totals.placementCount+=placements;totals.placementBaseTriangles+=placements*count;if(isInstance||thin)totals.instancePlacements+=placements;}
  const key=id.category+'\u0000'+id.assetId;let asset=assetGroups.get(key);
  if(!asset){asset={...aggregate(id.assetId),assetId:id.assetId,category:id.category,basis:id.basis};assetGroups.set(key,asset);}
  for(const group of [category,asset]){group.meshEntries++;group.meshTriangles+=count;group.placements+=ink?0:placements;group.placementBaseTriangles+=ink?0:placements*count;group._geometry.add(geometry);}
  if(!geometryRecords.has(geometry))geometryRecords.set(geometry,{geometry,id:text(geometry.id)??'unknown',assetId:id.assetId,triangles:count,vertices:finite(geometry.getTotalVertices?.()),meshReferences:0,surfaceReferences:0,outlineReferences:0});
  const record=geometryRecords.get(geometry);record.meshReferences++;record[ink?'outlineReferences':'surfaceReferences']++;
 }
 // A resident geometry may be temporarily outside the scene's mesh list during
 // preparation. Keep it in memory accounting, without inventing a placement.
 for(const geometry of scene.geometries??[])if(!geometryRecords.has(geometry))geometryRecords.set(geometry,{geometry,id:text(geometry.id)??'unknown',assetId:geometryOwners.get(geometry)?.assetId??null,triangles:Math.floor(((geometry.getTotalIndices?.()??0)||(geometry.getTotalVertices?.()??0))/3),vertices:finite(geometry.getTotalVertices?.()),meshReferences:0,surfaceReferences:0,outlineReferences:0});
 for(const record of geometryRecords.values()){
  const geometry=record.geometry;
  for(const vertex of Object.values(geometry.getVertexBuffers?.()??{})){const buffer=vertex?.getBuffer?.();if(buffer)buffers.set(buffer,finite(buffer.capacity));}
  const index=geometry.getIndexBuffer?.();if(index)buffers.set(index,finite(index.capacity));
  totals.uniqueGeometryTriangles+=record.triangles;delete record.geometry;
 }
 totals.uniqueGeometries=geometryRecords.size;totals.geometryBuffers=buffers.size;
 for(const bytes of buffers.values())if(bytes>0)totals.geometryBufferBytesKnown+=bytes;else totals.geometryBuffersUnknown++;
 const materials=new Set([...(scene.materials??[]),...(scene.multiMaterials??[])]),wrappers=new Set(scene.textures??[]),internals=new Map();
 for(const mesh of meshes)if(mesh.material)materials.add(mesh.material);
 for(const material of materials){for(const child of material.subMaterials??[])if(child)materials.add(child);for(const texture of material.getActiveTextures?.()??[])wrappers.add(texture);}
 for(const wrapper of wrappers){const texture=wrapper.getInternalTexture?.();if(!texture)continue;let row=internals.get(texture);if(!row){row={texture,names:[],sceneReferenced:true};internals.set(texture,row);}const name=text(wrapper.name??wrapper.url);if(name&&row.names.length<4&&!row.names.includes(name))row.names.push(name);}
 for(const texture of scene.getEngine?.().getLoadedTexturesCache?.()??[])if(!internals.has(texture))internals.set(texture,{texture,names:[],sceneReferenced:false});
 const textures=[];
 for(const {texture,names,sceneReferenced}of internals.values()){
  const estimate=textureEstimate(texture),ready=texture.isReady===true;
  const estimatedBytes=ready?estimate.bytes:null;
  if(estimatedBytes!==null)totals.textureBytesEstimate+=estimatedBytes;else totals.textureBytesUnknown++;
  textures.push({name:names[0]??text(texture.url)??'unnamed-internal-texture',names,sceneReferenced,width:finite(texture.width),height:finite(texture.height),format:finite(texture.format),type:finite(texture.type),mipmapped:texture.generateMipMaps===true,cube:texture.isCube===true,ready,estimatedBytes,estimateBasis:ready?estimate.basis:'not-ready-or-unallocated'});
 }
 totals.materials=materials.size;totals.textureWrappers=wrappers.size;totals.internalTextures=textures.length;
 const assets=[...assetGroups.values()].map(group=>Object.assign(finish(group,geometryRecords),assetFiles.get(group.assetId)??{loadedLods:[],modelFiles:[]})).sort((a,b)=>b.placementBaseTriangles-a.placementBaseTriangles||b.uniqueGeometryTriangles-a.uniqueGeometryTriangles);
 textures.sort((a,b)=>(b.estimatedBytes??-1)-(a.estimatedBytes??-1));
 const geometries=[...geometryRecords.values()].sort((a,b)=>b.triangles-a.triangles);
 return {format:'moonforest-map-resource-inventory',version:1,mapId,capturedAt:new Date().toISOString(),cpuMs:performance.now()-started,totals,categories:[...categoryGroups.values()].map(group=>finish(group,geometryRecords)),assets:assets.slice(0,cap),textures:textures.slice(0,cap),geometries:geometries.slice(0,cap),truncated:{assets:Math.max(0,assets.length-cap),textures:Math.max(0,textures.length-cap),geometries:Math.max(0,geometries.length-cap)},measurement:'On-demand resident inventory, including hidden pools, templates and all resident LODs. Surface mesh triangles sum mesh entries; placement base triangles exclude known LOD alternatives and instance templates and use base geometry, not selected render LOD. Unique geometry and buffer objects are counted once globally. Category/asset geometry totals can overlap and must not be summed. Submitted triangles are the separate last engine frame counter including passes/instances, not unique map geometry. Texture bytes estimate ready internal texture dimensions/format/mips; engine-cached textures outside current scene references are marked. Buffers with unknown capacity and unknown texture layouts remain unknown. These values are not total GPU/device RAM; animation/morph/instance buffers, framebuffers/depth/MSAA attachments, driver overhead and CPU copies are not fully covered. No GPU query/readback or network request is performed.'};
}
