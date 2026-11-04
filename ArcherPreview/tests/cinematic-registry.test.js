import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm,rename,symlink,unlink} from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createCinematicDraft} from '../src/cinematic-document.js';
import {CINEMATIC_REGISTRY,DEFAULT_CINEMATIC_REFERENCES,listRegisteredCinematics,loadRegisteredCinematic} from '../src/cinematic-registry.js';
import {registerCinematic} from '../scripts/register-cinematic.mjs';
import {createBasePlacementManifest,createEmptyPlacementDocument} from '../src/placement-document.js';

const refs=DEFAULT_CINEMATIC_REFERENCES,sha=value=>createHash('sha256').update(value).digest('hex'),run=promisify(execFile);
function draft(id='neutral:registered'){return createCinematicDraft({catalogRevision:refs.catalog.revision,cutsceneId:id});}
function registryFor(document,body=JSON.stringify(document,null,2)+'\n'){
  const bytes=Buffer.from(body),sha256=sha(bytes);return {registry:{version:1,entries:[{cutsceneId:document.cutsceneId,mapId:document.mapId,version:1,catalogRevision:document.catalogRevision,duration:document.duration,sha256,bytes:bytes.length,url:`authored/cinematics/${sha256}.json`}]},bytes};
}
async function fixture(t){
  const root=await mkdtemp(join(tmpdir(),'moonforest-registry-'));await mkdir(join(root,'src'));await writeFile(join(root,'src/cinematic-registry.json'),JSON.stringify({version:1,entries:[]},null,2)+'\n');
  t.after(async()=>{assert.ok(resolve(root).startsWith(resolve(tmpdir())+sep+'moonforest-registry-'));await rm(root,{recursive:true,force:true});});
  const inputPath=join(root,'input.json');return {root,inputPath,registryPath:join(root,'src/cinematic-registry.json')};
}

test('default registry is empty and strict metadata cannot hide arbitrary paths, duplicate IDs or malformed entries',()=>{
  assert.deepEqual(CINEMATIC_REGISTRY,{version:1,entries:[]});assert.deepEqual(listRegisteredCinematics(),[]);
  const valid=registryFor(draft()).registry;assert.equal(listRegisteredCinematics(valid).length,1);
  for(const change of [entry=>entry.url='../outside.json',entry=>entry.url='https://example.test/scene.json',entry=>entry.bytes=524289,entry=>entry.sha256='wrong',entry=>entry.duration=Infinity,entry=>entry.cutsceneId=12,entry=>entry.version=2,entry=>entry.autoplay=true]){const registry=structuredClone(valid);change(registry.entries[0]);assert.throws(()=>listRegisteredCinematics(registry),/Invalid cinematic registry/);}
  assert.throws(()=>listRegisteredCinematics({version:1,entries:[valid.entries[0],valid.entries[0]]}),/Invalid/);
});

test('CLI dryrun writes nothing; apply preserves the same LF JSON, colon ID and content-addressed path; verified loader consumes it',async t=>{
  const f=await fixture(t),document=draft(),lf=JSON.stringify(document,null,3)+'\n',crlf=lf.replaceAll('\n','\r\n');await writeFile(f.inputPath,crlf);
  const before=await readFile(f.registryPath,'utf8'),preview=await registerCinematic({inputPath:f.inputPath,projectRoot:f.root});
  assert.equal(preview.applied,false);assert.equal(await readFile(f.registryPath,'utf8'),before);await assert.rejects(readFile(preview.contentPath),{code:'ENOENT'});
  const result=await registerCinematic({inputPath:f.inputPath,projectRoot:f.root,apply:true});assert.equal(result.applied,true);assert.equal(await readFile(result.contentPath,'utf8'),lf);assert.equal(await readFile(f.inputPath,'utf8'),crlf);assert.equal(result.entry.sha256,sha(Buffer.from(lf)));assert.match(result.contentPath,/[a-f0-9]{64}\.json$/);assert.equal(result.contentPath.includes('neutral:registered'),false);
  const registry=JSON.parse(await readFile(f.registryPath,'utf8'));let calls=0;
  const loaded=await loadRegisteredCinematic(document.cutsceneId,{registry,baseUrl:'https://game.test/ArcherPreviewSite/',fetch:async(url,options)=>{calls++;assert.equal(url,'https://game.test/ArcherPreviewSite/'+result.entry.url);assert.ok(options.signal);return new Response(await readFile(result.contentPath));}});
  assert.deepEqual(loaded,document);assert.equal(calls,1);await registerCinematic({inputPath:f.inputPath,projectRoot:f.root,apply:true});assert.equal(JSON.parse(await readFile(f.registryPath,'utf8')).entries.length,1);
});

test('positional and --input CLI forms both default to dryrun and require explicit --apply',async t=>{
  const f=await fixture(t);await writeFile(f.inputPath,JSON.stringify(draft()));
  const script=new URL('../scripts/register-cinematic.mjs',import.meta.url),path=decodeURIComponent(script.pathname.replace(/^\/([A-Za-z]:)/,'$1'));
  for(const argumentsList of [[f.inputPath,'--project',f.root],['--input',f.inputPath,'--project',f.root]]){const result=await run(process.execPath,[path,...argumentsList]);assert.equal(JSON.parse(result.stdout).mode,'dry-run');}
  const result=await run(process.execPath,[path,f.inputPath,'--project',f.root,'--apply']);assert.equal(JSON.parse(result.stdout).mode,'applied');
});

test('shared validator/hash/size/metadata/stale failures reject before returning a playable document',async()=>{
  const document=draft(),{registry,bytes}=registryFor(document),options={registry,baseUrl:'https://game.test/',fetch:async()=>new Response(bytes)};
  await assert.rejects(loadRegisteredCinematic('missing',options),/Unknown registered/);
  const stale=structuredClone(registry);stale.entries[0].catalogRevision='0'.repeat(64);let fetched=false;await assert.rejects(loadRegisteredCinematic(document.cutsceneId,{...options,registry:stale,fetch:async()=>{fetched=true;}}),/stale/);assert.equal(fetched,false);
  const changed=Buffer.from(bytes);changed[10]^=1;await assert.rejects(loadRegisteredCinematic(document.cutsceneId,{...options,fetch:async()=>new Response(changed)}),/SHA256/);
  await assert.rejects(loadRegisteredCinematic(document.cutsceneId,{...options,fetch:async()=>new Response(Buffer.concat([bytes,Buffer.from('x')]))}),/byte count/);
  const mismatch=structuredClone(registry);mismatch.entries[0].mapId='witch-cave';await assert.rejects(loadRegisteredCinematic(document.cutsceneId,{...options,registry:mismatch}),/metadata differs/);
  const malformed=draft();malformed.tracks.events=[{time:1,type:'reward',label:'gold'}];const bad=registryFor(malformed);await assert.rejects(loadRegisteredCinematic(malformed.cutsceneId,{registry:bad.registry,baseUrl:'https://game.test/',fetch:async()=>new Response(bad.bytes)}),error=>error.errors?.some(e=>e.path==='$.tracks.events[0].type'));
});

test('logical45second deadline aborts an unanswered fetch and a late response body is cancelled',async()=>{
  const {registry}=registryFor(draft());let expire,now=0,signal,resolveFetch,cancelled=0;
  const timers={now:()=>now,setTimeout:callback=>{expire=callback;return 1;},clearTimeout:()=>{expire=null;}};
  const pending=loadRegisteredCinematic('neutral:registered',{registry,baseUrl:'https://game.test/',timers,fetch:async(_url,options)=>{signal=options.signal;return new Promise(resolve=>resolveFetch=resolve);}});
  while(!resolveFetch)await Promise.resolve();now=45000;expire();await assert.rejects(pending,{name:'TimeoutError'});assert.equal(signal.aborted,true);assert.equal(expire,null);
  resolveFetch({body:{cancel:async()=>{cancelled++;}}});
  // Drain the actual async fetch/onLate chain. Its promise-assimilation depth
  // is not a contract and can vary with Node optimization/suite scheduling.
  await new Promise(resolve=>setImmediate(resolve));assert.equal(cancelled,1);
});

test('failed final index rename preserves the previous registry/content and removes all owned staging artifacts',async t=>{
  const f=await fixture(t);await writeFile(f.inputPath,JSON.stringify(draft('neutral:first'))+'\n');const first=await registerCinematic({inputPath:f.inputPath,projectRoot:f.root,apply:true}),before=await readFile(f.registryPath,'utf8'),original=await readFile(first.contentPath,'utf8');
  await writeFile(f.inputPath,JSON.stringify(draft('neutral:second'))+'\n');
  await assert.rejects(registerCinematic({inputPath:f.inputPath,projectRoot:f.root,apply:true,renameFile:async(from,to)=>{if(to===f.registryPath)throw Error('injected index commit failure');return rename(from,to);}}),/injected index commit failure/);
  assert.equal(await readFile(f.registryPath,'utf8'),before);assert.equal(await readFile(first.contentPath,'utf8'),original);assert.deepEqual(await readdir(join(f.root,'public/authored/cinematics')),[first.entry.sha256+'.json']);assert.deepEqual((await readdir(join(f.root,'src'))).sort(),['cinematic-registry.json']);
  const invalid=draft();invalid.catalogRevision='0'.repeat(64);await writeFile(f.inputPath,JSON.stringify(invalid));await assert.rejects(registerCinematic({inputPath:f.inputPath,projectRoot:f.root,apply:true}),/validation failed/);assert.equal(await readFile(f.registryPath,'utf8'),before);
});

test('CLI derives exact base and SHA-validated registered overlay instance references, rejecting missing/stale overlays',async t=>{
  const f=await fixture(t),base=createBasePlacementManifest('village',{catalog:refs.catalog}),asset=refs.catalog.entries.find(e=>e.assetId==='handcart'),document=draft();
  document.actors=[{actorId:'existing-prop',instanceId:base.instances.find(value=>value.assetId===asset.assetId).instanceId,assetId:asset.assetId,assetVersion:asset.version,position:[0,0,0],rotation:[0,0,0,1],scale:1}];await writeFile(f.inputPath,JSON.stringify(document));assert.equal((await registerCinematic({inputPath:f.inputPath,projectRoot:f.root})).applied,false);
  const overlay=createEmptyPlacementDocument(base);overlay.instances.push({instanceId:'editor:registered-prop',assetId:asset.assetId,assetVersion:asset.version,transform:{position:[4,0,4],rotation:[0,0,0,1],scale:1},attachment:{surface:'ground',normal:[0,1,0],offset:0,supportId:'terrain'},collision:'solid'});
  const overlayBytes=Buffer.from(JSON.stringify(overlay)+'\n');await mkdir(join(f.root,'public/authored/maps'),{recursive:true});await writeFile(join(f.root,'public/authored/maps/village.json'),overlayBytes);await writeFile(join(f.root,'src/authored-map-index.json'),JSON.stringify({version:1,maps:{village:{path:'authored/maps/village.json',sha256:sha(overlayBytes),revision:overlay.revision,baseRevision:overlay.baseRevision}}}));
  document.actors[0].instanceId='editor:registered-prop';await writeFile(f.inputPath,JSON.stringify(document));assert.equal((await registerCinematic({inputPath:f.inputPath,projectRoot:f.root})).applied,false);
  await writeFile(join(f.root,'public/authored/maps/village.json'),JSON.stringify({...overlay,revision:1}));await assert.rejects(registerCinematic({inputPath:f.inputPath,projectRoot:f.root}),/overlay SHA256/);
});

test('project scope rejects a symlink/junction that points registry writes outside the named project',async t=>{
  const f=await fixture(t),outside=await mkdtemp(join(tmpdir(),'moonforest-registry-outside-'));t.after(async()=>{assert.ok(resolve(outside).startsWith(resolve(tmpdir())+sep+'moonforest-registry-outside-'));await rm(outside,{recursive:true,force:true});});
  const src=resolve(f.root,'src');assert.ok(src.startsWith(resolve(f.root)+sep));await rm(src,{recursive:true,force:true});await symlink(outside,src,process.platform==='win32'?'junction':'dir');t.after(async()=>{await unlink(src).catch(()=>{});});await writeFile(f.inputPath,JSON.stringify(draft()));
  await assert.rejects(registerCinematic({inputPath:f.inputPath,projectRoot:f.root,apply:true}),/outside the project/);assert.deepEqual(await readdir(outside),[]);
});
