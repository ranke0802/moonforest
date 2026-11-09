import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {sourcePath,projectRoot} from '../../Sources/resolve-source.mjs';
import {hash} from './resource-pack.js';
import {compressMeshopt,decodeMeshoptBuffers} from './meshopt-lossless.js';
import {readAccessor} from './web-geometry.js';
import {APPROVED_SCENERY_CAPS,SCENERY_BUDGET_REVISION,sceneryNativeFingerprint} from './approved-scenery-policy.mjs';

const root=projectRoot,assetsRoot=path.join(root,'ArcherPreview/public/assets'),content=path.join(assetsRoot,'content');
const approval=JSON.parse(fs.readFileSync(sourcePath('approved-scenery-budgets','approval.json')));
assert.equal(approval.revision,SCENERY_BUDGET_REVISION);
const slash=s=>s.replaceAll('\\','/'),baseName=reference=>path.basename(reference);
const loadJSON=path=>JSON.parse(fs.readFileSync(path));
const modelFiles=g=>new Map(g.buffers.filter(b=>b.uri).map(b=>[b.uri,{data:b.uri.startsWith('data:')?Buffer.from(b.uri.split(',')[1],'base64'):fs.readFileSync(path.join(content,baseName(b.uri)))}]));
const counts=g=>g.meshes.reduce((n,m)=>n+m.primitives.reduce((n,p)=>n+(p.indices===undefined?g.accessors[p.attributes.POSITION].count:g.accessors[p.indices].count)/3,0),0);

export async function applyApprovedSceneryBudgets(){
 const cache=new Map(),packed=new Map(),tierResults=[],beforeResources=fs.readdirSync(content).filter(n=>/^[a-f0-9]{64}\./.test(n));
 const plans=new Map(approval.assets.map(a=>[a.id,a]));assert.equal(plans.size,Object.keys(APPROVED_SCENERY_CAPS).length);
 async function prepare(id,t){
  const key=id+':'+t.tier;if(packed.has(key))return packed.get(key);
  const oldPath=path.join(assetsRoot,t.oldModel),original=loadJSON(oldPath);assert.equal(hash(fs.readFileSync(oldPath)),t.oldModelSha256);
  if(!t.changed){const kept={id,tier:t.tier,changed:false,beforeModel:t.oldModel,model:t.oldModel,beforeTriangles:t.beforeTriangles,triangles:t.afterTriangles,modelSha256:t.oldModelSha256};packed.set(key,kept);tierResults.push(kept);return kept;}
  const bytes=fs.readFileSync(sourcePath(t.sourceId));assert.equal(hash(bytes),t.sourceSha256);
  const g=JSON.parse(bytes);assert.equal(counts(g),t.afterTriangles);
  for(const field of ['nodes','scenes','materials','textures','images','samplers'])assert.deepEqual(g[field],original[field],id+' '+t.tier+' changed appearance/transform '+field);
  const files=modelFiles(g);
  for(const image of g.images??[]){assert.ok(image.uri&&!image.uri.startsWith('data:'));const data=fs.readFileSync(path.join(content,baseName(image.uri)));assert.equal(hash(data),baseName(image.uri).split('.')[0]);files.set(image.uri,{data});}
  const result=await compressMeshopt(g,files,cache),decoded=await decodeMeshoptBuffers(result.gltf,result.files);
  assert.equal(counts(decoded.gltf),t.afterTriangles);
  for(let i=0;i<g.accessors.length;i++)assert.deepEqual(readAccessor(decoded.gltf,decoded.files,i),readAccessor(g,files,i),'Lossless pack accessor '+id+' '+t.tier+' '+i);
  for(const [name,{data}]of result.files){const target=path.join(content,name);assert.equal(hash(data),name.split('.')[0]);if(fs.existsSync(target))assert.ok(fs.readFileSync(target).equals(data));else fs.writeFileSync(target,data);}
  const entry={id,tier:t.tier,changed:true,beforeModel:t.oldModel,beforeModelSha256:t.oldModelSha256,beforeTriangles:t.beforeTriangles,
   model:'./content/'+result.model,modelSha256:result.model.split('.')[0],triangles:t.afterTriangles,
   resources:[...result.files.keys()].map(n=>'./content/'+n),bytes:[...result.files.values()].reduce((n,f)=>n+f.data.length,0),
   sourceId:t.sourceId,sourceSha256:t.sourceSha256,compression:result.stats,accessorsVerified:g.accessors.length};
  packed.set(key,entry);tierResults.push(entry);return entry;
 }
 for(const a of approval.assets){assert.equal(a.cap,APPROVED_SCENERY_CAPS[a.id]);for(const t of a.tiers)await prepare(a.id,t);}
 const changedManifests=[],applications=[],preserved=[];
 for(const saved of approval.beforeManifests){
  const beforeBytes=fs.readFileSync(sourcePath(saved.sourceId));assert.equal(hash(beforeBytes),saved.sha256);
  const before=JSON.parse(beforeBytes),currentPath=path.join(assetsRoot,saved.manifest),current=loadJSON(currentPath),next=structuredClone(before);
  let changes=0;
  for(const [id,config]of Object.entries(next.assets??{})){
   const plan=plans.get(id);if(!plan){assert.deepEqual(current.assets?.[id],config,'Unselected asset changed concurrently '+saved.manifest+':'+id);preserved.push({manifest:saved.manifest,id});continue;}
   const near=packed.get(id+':lod0'),originalNear=config.model??config.lods?.[0]?.model;
   if(baseName(originalNear??'')!==baseName(near.beforeModel))throw new Error('Unreviewed geometry alias '+saved.manifest+':'+id);
   const update=(old,tier)=>{
    const result=packed.get(id+':'+tier);assert.ok(result);
    assert.equal(baseName(old.model),baseName(result.beforeModel),'Tier alias differs '+saved.manifest+':'+id+':'+tier);
    if(!result.changed)return old;
    return {...old,model:result.model,resources:result.resources,bytes:result.bytes,triangles:result.triangles,
      ...(old.compression?{compression:result.compression}:{})};
   };
   if(config.lods)config.lods=config.lods.map((old,index)=>update(old,'lod'+(old.level??index)));
   if(config.mobileNear)config.mobileNear=update(config.mobileNear,'mobileNear');
   if(config.model){const result=packed.get(id+':lod0');Object.assign(config,{model:result.model,resources:result.resources,bytes:result.bytes,triangles:result.triangles});}
   config.geometryBudget={revision:SCENERY_BUDGET_REVISION,date:approval.date,assetId:id,cap:plan.cap,
    catalogAssetVersion:plan.catalogAssetVersion,beforeModelSha256:baseName(originalNear).split('.')[0],appliedModelSha256:near.modelSha256,
    nativeConfigSha256:sceneryNativeFingerprint(config),texturePixelsUnchanged:true,lodDistancesUnchanged:true,
    retention:'Original source and runtime files retained; deletion awaits user decision.',approval:'Category replacement authorized; applied build awaits user inspection.'};
   if(config.vertexRelief)config.vertexRelief.approvedBudgetRevision=SCENERY_BUDGET_REVISION;
   if(config.lods){assert.equal(config.mobileNear.triangles,config.lods[0].triangles);assert.ok(config.lods[0].triangles>config.lods[1].triangles&&config.lods[1].triangles>config.lods[2].triangles);}
   const oldConfig=before.assets[id],currentConfig=current.assets?.[id];
   assert.ok(JSON.stringify(currentConfig)===JSON.stringify(oldConfig)||JSON.stringify(currentConfig)===JSON.stringify(config),'Concurrent selected config edit '+saved.manifest+':'+id);
   applications.push({manifest:saved.manifest,id,name:config.name??id,category:config.category??plan.category,cap:plan.cap,
    beforeTriangles:near.beforeTriangles,afterTriangles:near.triangles,beforeModel:near.beforeModel,model:near.model,
    modelSha256:near.modelSha256,catalogAssetVersion:plan.catalogAssetVersion,
    lods:(config.lods??[]).map((l,i)=>({level:l.level??i,beforeTriangles:oldConfig.lods[i].triangles??packed.get(id+':lod'+i).beforeTriangles,afterTriangles:l.triangles,beforeModel:oldConfig.lods[i].model,model:l.model})),
    mobileNear:config.mobileNear?{beforeModel:oldConfig.mobileNear.model,model:config.mobileNear.model,triangles:config.mobileNear.triangles}:undefined});
   changes++;
  }
  if(changes){const data=Buffer.from(JSON.stringify(next,null,2)+'\n');if(!fs.readFileSync(currentPath).equals(data))fs.writeFileSync(currentPath,data);changedManifests.push({manifest:saved.manifest,sha256:hash(data),assets:changes});}
 }
 // Old source/model/image/buffer files remain physically available for rollback.
 for(const name of beforeResources)assert.ok(fs.existsSync(path.join(content,name)),'Original resource removed '+name);
 const report={version:1,date:approval.date,status:'applied-local-awaiting-user-review',revision:SCENERY_BUDGET_REVISION,productionChanged:true,
  browserAutomation:false,deployed:false,assets:approval.assets.map(a=>({id:a.id,name:a.label,cap:a.cap,category:a.category,
   beforeTriangles:packed.get(a.id+':lod0').beforeTriangles,afterTriangles:packed.get(a.id+':lod0').triangles,
   beforeModel:packed.get(a.id+':lod0').beforeModel,model:packed.get(a.id+':lod0').model,modelSha256:packed.get(a.id+':lod0').modelSha256,
   catalogAssetVersion:a.catalogAssetVersion,lods:a.tiers.map(t=>({level:t.tier,beforeTriangles:t.beforeTriangles,afterTriangles:t.afterTriangles,
    beforeModel:t.oldModel,model:packed.get(a.id+':'+t.tier).model,changed:t.changed}))})),
  applications,changedManifests,tierResults,preserved,
  retention:{oldContentFilesBefore:beforeResources.length,oldContentFilesRetained:beforeResources.length,deleted:0},
  limits:['Node/data checks do not establish real-device FPS, thermals or GPU raster output.','Final applied-build visual approval belongs to the user.']};
 const output=path.join(root,'ArcherPreview/reports/approved-scenery-budgets-2026-11-09');fs.mkdirSync(output,{recursive:true});
 fs.writeFileSync(path.join(output,'application.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({assets:report.assets.length,manifests:changedManifests.map(m=>m.manifest),changedTiers:tierResults.filter(t=>t.changed).length,oldFilesRetained:beforeResources.length,deleted:0}));
 return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await applyApprovedSceneryBudgets();
