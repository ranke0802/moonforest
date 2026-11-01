import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
const app=resolve(import.meta.dirname,'..'),repo=resolve(app,'..');
const baseline=JSON.parse(await readFile(resolve(app,'reports/cave-u1-lab/baseline.json'),'utf8'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const before=path=>execFileSync('git',['show','9cfbda1:'+path],{cwd:repo,maxBuffer:16*1024*1024});
const report={baseline:'9cfbda1',checkedAt:new Date().toISOString(),manifests:0,modelTextureFiles:0,resourceRevision:null,protected:{},browserAutomation:false};
for(const [name,expected]of Object.entries(baseline.manifests)){
 if(sha(await readFile(resolve(app,'public/assets',name)))!==expected)throw Error('Changed resource JSON: '+name);
 report.manifests++;
}
for(const name of Object.keys(baseline.protectedFiles)){
 const prior=sha(before('ArcherPreview/src/'+name)),current=sha(await readFile(resolve(app,'src',name)));
 report.protected[name]={prior,current,unchanged:prior===current};
 if(!['witch-cave-camera-data.js','witch-cave-sight-data.js'].includes(name)&&prior!==current)throw Error('Changed protected floor/layout/body/boss area: '+name);
}
const current=JSON.parse(await readFile(resolve(app,'public/assets/resource-index.json'),'utf8'));
const original=JSON.parse(before('ArcherPreviewSite/assets/resource-index.json'));
if(JSON.stringify(current)!==JSON.stringify(original))throw Error('Resource content or bundle graph changed');
report.resourceRevision=current.revision;report.modelTextureFiles=Object.keys(current.files).length;
for(const name of ['warrior-v3.json','warrior-v3-ios.json'])if(JSON.parse(await readFile(resolve(app,'public/assets',name),'utf8')).textureProfile.maxSize!==8192)throw Error('Player 8K profile changed');
const deployment=JSON.parse(await readFile(resolve(repo,'ArcherPreviewSite/deployment-files.json'),'utf8'));
if(deployment.resourceRevision!==current.revision)throw Error('Published resource version differs');
report.publishedFiles=deployment.files.length;report.playerMax=8192;report.backgroundMax=4096;report.status='pass';
await mkdir(resolve(app,'reports/cave-player-fixes'),{recursive:true});
await writeFile(resolve(app,'reports/cave-player-fixes/preservation.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,manifests:report.manifests,modelTextureFiles:report.modelTextureFiles,resourceRevision:report.resourceRevision,bodyAndBossPreserved:true}));
