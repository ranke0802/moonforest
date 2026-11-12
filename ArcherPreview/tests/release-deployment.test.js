import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {stagePages} from '../scripts/stage-pages.mjs';
import {syncMoonforestV2} from '../scripts/sync-moonforest-0.2.mjs';
import {sha256,publishedBytes,RELEASE_V2_MANIFEST,reviewedDeploymentUnion,deploymentPath} from '../scripts/release-deployment.mjs';

test('publish comparisons normalize Windows text without changing hashed content or source bytes',()=>{
 const source=Buffer.from('{"approved":true}\r\n'),original=Buffer.from(source),published=Buffer.from('{"approved":true}\n');
 assert.deepEqual(publishedBytes('app.webmanifest',source),published);assert.deepEqual(publishedBytes('assets/actor.json',source),published);assert.deepEqual(source,original);
 assert.equal(publishedBytes('assets/content/'+'a'.repeat(64)+'.gltf',source),source);assert.equal(publishedBytes('assets/bundles/'+'a'.repeat(64)+'.mfp.gz',source),source);
});

async function fixture(){
 const root=await mkdtemp(join(tmpdir(),'moonforest-release-')),site=join(root,'ArcherPreviewSite'),dist=join(root,'build'),data=Buffer.from('approved shared asset'),name=sha256(data)+'.bin',files={[name]:data.length},bundles=[],index={version:1,revision:sha256(JSON.stringify({files,bundles})),files,bundles};
 const descriptor=(path,bytes)=>({path,bytes:bytes.length,sha256:sha256(bytes)}),baselineFiles=[];
 for(const [path,value]of [['index.html','preserved 0.1 entry'],['assets/game-old.js','preserved 0.1 runtime'],['assets/alpha-wolf.json','preserved approved actor manifest'],['assets/resource-index.json',JSON.stringify(index)],['assets/content/'+name,data]]){
  const bytes=Buffer.from(value);await mkdir(join(site,path,'..'),{recursive:true});await writeFile(join(site,path),bytes);baselineFiles.push(descriptor(path,bytes));
 }
 await writeFile(join(root,'index.html'),'preserved root redirect');const primary={version:2,resourceRevision:index.revision,bytes:baselineFiles.reduce((sum,item)=>sum+item.bytes,0),files:baselineFiles},primaryBytes=Buffer.from(JSON.stringify(primary));await writeFile(join(site,'deployment-files.json'),primaryBytes);await mkdir(dist);
 const nextFiles=[];
 for(const [path,value]of [['moonforest-0.2.html','new 0.2 entry'],['assets/game-new.js','new 0.2 runtime']]){
  const bytes=Buffer.from(value);await mkdir(join(dist,path,'..'),{recursive:true});await writeFile(join(dist,path),bytes);nextFiles.push(descriptor(path,bytes));
 }
 const allFiles=[...baselineFiles.filter(item=>item.path.startsWith('assets/')&&!item.path.endsWith('game-old.js')),...nextFiles];
 const manifest={version:2,release:'moonforest-0.2',baseDeploymentSha256:sha256(primaryBytes),resourceRevision:index.revision,bytes:allFiles.reduce((sum,item)=>sum+item.bytes,0),files:allFiles};
 await writeFile(join(dist,RELEASE_V2_MANIFEST),JSON.stringify(manifest));
 return {root,site,dist,manifest,primaryBytes,baselineFiles,descriptor,async cleanup(){assert.ok(resolve(root).startsWith(resolve(tmpdir(),'moonforest-release-')));await rm(root,{recursive:true,force:true});}};
}
test('additive sync and Pages union preserve 0.1 while copying shared assets once',async()=>{
 const f=await fixture();try{
  const result=await syncMoonforestV2({...f,repository:f.root,writeReport:false});assert.equal(result.reusedBytes,f.manifest.bytes-f.manifest.files.filter(item=>item.path==='moonforest-0.2.html'||item.path==='assets/game-new.js').reduce((sum,item)=>sum+item.bytes,0));
  assert.deepEqual(await readFile(join(f.site,'deployment-files.json')),f.primaryBytes);
  for(const item of f.baselineFiles)assert.equal(sha256(await readFile(join(f.site,item.path))),item.sha256);
  const reviewed=await reviewedDeploymentUnion(f.site,{requireResourceIndex:true});assert.equal(reviewed.manifests.length,2);assert.equal(reviewed.entries.length,f.baselineFiles.length+2);
  const output=join(f.root,'published'),staged=await stagePages(f.root,output,{requireResourceIndex:true});assert.equal(staged.files,f.baselineFiles.length+2);assert.equal(staged.releases,2);assert.ok(staged.bytes<f.manifest.bytes+f.baselineFiles.reduce((sum,item)=>sum+item.bytes,0));
  assert.equal(await readFile(join(output,'ArcherPreviewSite/index.html'),'utf8'),'preserved 0.1 entry');assert.equal(await readFile(join(output,'ArcherPreviewSite/moonforest-0.2.html'),'utf8'),'new 0.2 entry');assert.deepEqual(await readFile(join(output,'ArcherPreviewSite/deployment-files.json')),f.primaryBytes);
 }finally{await f.cleanup();}
});
test('additive sync rejects changing a 0.1 path before writing any new file',async()=>{
 const f=await fixture();try{
  const bytes=Buffer.from('changed 0.1 entry');await writeFile(join(f.dist,'index.html'),bytes);f.manifest.files.push(f.descriptor('index.html',bytes));f.manifest.bytes+=bytes.length;await writeFile(join(f.dist,RELEASE_V2_MANIFEST),JSON.stringify(f.manifest));
  await assert.rejects(syncMoonforestV2({...f,repository:f.root,writeReport:false}),/0.1 deployment path would change/);assert.equal(await readFile(join(f.site,'index.html'),'utf8'),'preserved 0.1 entry');await assert.rejects(readFile(join(f.site,'moonforest-0.2.html')),error=>error.code==='ENOENT');
 }finally{await f.cleanup();}
});
test('Pages rejects conflicting release graphs and changes to the frozen deployment inventory',async()=>{
 const f=await fixture();try{
  await syncMoonforestV2({...f,repository:f.root,writeReport:false});
  f.manifest.files.find(item=>item.path==='assets/alpha-wolf.json').sha256='f'.repeat(64);await writeFile(join(f.site,RELEASE_V2_MANIFEST),JSON.stringify(f.manifest));await assert.rejects(reviewedDeploymentUnion(f.site),/disagree on shared deployment path/);
  await writeFile(join(f.site,'deployment-files.json'),Buffer.concat([f.primaryBytes,Buffer.from('\n')]));await assert.rejects(reviewedDeploymentUnion(f.site),/preserved deployment mismatch/);
  assert.throws(()=>deploymentPath(f.site,'../outside'),/Unsafe/);assert.throws(()=>deploymentPath(f.site,'assets\\outside'),/Unsafe/);
 }finally{await f.cleanup();}
});
