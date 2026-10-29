import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {planResourceTransfers} from '../../src/resource-index.js';
const base='d27e4b2',assets=new URL('../../public/assets/',import.meta.url);
const read=async path=>JSON.parse(await readFile(new URL(path,assets),'utf8'));
const previous=JSON.parse(execFileSync('git',['show',base+':ArcherPreviewSite/assets/resource-index.json'],{encoding:'utf8',windowsHide:true}));
const current=await read('resource-index.json'),audio=await read('audio.json');
const added=Object.keys(current.files).filter(name=>!(name in previous.files)),removed=Object.keys(previous.files).filter(name=>!(name in current.files));
assert.equal(added.length,27);assert.equal(removed.length,0);
for(const [name,bytes]of Object.entries(previous.files))assert.equal(current.files[name],bytes);
const audioNames=new Set(audio.resources.map(path=>path.split('/').at(-1)));
for(const name of added){
 assert.ok(audioNames.has(name)&&/\.(wav|mp3)$/.test(name));const data=await readFile(new URL('content/'+name,assets));
 assert.equal(createHash('sha256').update(data).digest('hex'),name.slice(0,64));
}
const untouched=['village.json','monster-forest.json','witch-cave.json','warrior-v3.json','warrior-v3-ios.json','village-ground.json','monster-forest-ground.json','witch-cave-ground.json'];
for(const name of untouched){const old=JSON.parse(execFileSync('git',['show',base+':ArcherPreviewSite/assets/'+name],{encoding:'utf8',windowsHide:true}));assert.deepEqual(await read(name),old);}
const originalAudio=JSON.parse(execFileSync('git',['show',base+':ArcherPreviewSite/assets/audio.json'],{encoding:'utf8',windowsHide:true}));
for(const [key,value]of Object.entries(originalAudio.sounds))assert.deepEqual(audio.sounds[key],value);assert.deepEqual(audio.music.boss,originalAudio.music.boss);
const missing=added.map(name=>({url:'https://example.test/ArcherPreviewSite/assets/content/'+name,size:current.files[name]}));
const plan=planResourceTransfers(missing,current),downloaded=plan.files.map(item=>item.url.split('/').at(-1)).concat(plan.packs.flatMap(pack=>pack.files));
assert.deepEqual(downloaded.sort(),added.sort());assert.equal(planResourceTransfers([],current).bytes,0);
const html=await readFile(new URL('../../public/audio-credits.html',import.meta.url),'utf8'),tags=[...html.matchAll(/<audio\b[^>]*>/g)].map(match=>match[0]);
const expectedPreviews=Object.values(audio.sounds).reduce((n,paths)=>n+(Array.isArray(paths)?paths.length:1),0)+Object.keys(audio.music).length+Object.keys(audio.ambience).length;
assert.equal(tags.length,expectedPreviews);const previewFiles=new Set();
for(const tag of tags){assert.ok(!/\bautoplay\b/.test(tag));assert.match(tag,/preload="none"/);const file=tag.match(/src="\.\/assets\/content\/([^"]+)"/)?.[1];assert.ok(file&&audioNames.has(file));previewFiles.add(file);}
assert.deepEqual(previewFiles,audioNames,'all variations and audio files must be available in the report');
const log=await readFile(new URL('./full-tests.log',import.meta.url),'utf8');assert.match(log,/[ℹ#] tests 478/);assert.match(log,/[ℹ#] pass 478/);assert.match(log,/[ℹ#] fail 0/);
const deployment=JSON.parse(await readFile(new URL('../../dist-village/deployment-files.json',import.meta.url),'utf8'));
assert.equal(deployment.resourceRevision,current.revision);for(const file of ['audio-credits.html','AUDIO_CREDITS.txt'])assert.ok(deployment.files.some(f=>f.path===file));
const report={version:1,verifiedAt:new Date().toISOString(),sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),baseCommit:base,tests:{passed:478,failed:0},previousRevision:previous.revision,revision:current.revision,unchangedContentFiles:Object.keys(previous.files).length,addedContentFiles:added,removedContentFiles:removed,newAudioBytes:added.reduce((n,name)=>n+current.files[name],0),allAudioBytes:audio.resources.reduce((n,path)=>n+current.files[path.split('/').at(-1)],0),untouchedManifests:untouched,originalSoundDefinitions:Object.keys(originalAudio.sounds).length,originalBossMusicUnchanged:true,htmlPreviews:tags.length,creditsInDeployment:true,allNewFilesTransferPlan:{bytes:plan.bytes,packs:plan.packs.length,files:plan.files.length,oldFilesDownloaded:0,warmBytes:0,note:'Planner simulation for all new audio; actual gameplay requests selected BGM/ambience lazily and SFX separately through the unchanged service worker.'},quality:{playerMax:8192,backgroundMax:4096,lod:'unchanged'},browserAutomation:false,physicalS23Listening:false,status:'local_integration_checks_passed'};
await writeFile(new URL('./verification.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
