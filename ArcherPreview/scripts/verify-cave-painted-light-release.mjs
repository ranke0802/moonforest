import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const project=resolve(import.meta.dirname,'..'),repo=resolve(project,'..');
const baseline=JSON.parse(await readFile(resolve(project,'reports/cave-u1-lab/baseline.json'),'utf8'));
const sha=b=>createHash('sha256').update(b).digest('hex');
const report={baseline:baseline.head,checkedAt:new Date().toISOString(),manifests:0,protectedFiles:0,resourceRevision:null,contentFiles:0,changedContent:[],unapprovedShellImported:false};
for(const [name,expected]of Object.entries(baseline.manifests)){
 if(sha(await readFile(resolve(project,'public/assets',name)))!==expected)throw new Error('Changed protected manifest: '+name);
 report.manifests++;
}
for(const [name,expected]of Object.entries(baseline.protectedFiles)){
 if(sha(await readFile(resolve(project,'src',name)))!==expected)throw new Error('Changed protected terrain/layout/bake: '+name);
 report.protectedFiles++;
}
const current=JSON.parse(await readFile(resolve(project,'public/assets/resource-index.json'),'utf8'));
const original=JSON.parse(execFileSync('git',['show','ff86a79:ArcherPreviewSite/assets/resource-index.json'],{cwd:repo,encoding:'utf8'}));
report.resourceRevision=current.revision;
if(current.revision!==baseline.resourceRevision)throw new Error('Resource revision changed');
for(const [name,record]of Object.entries(current.files)){
 if(JSON.stringify(record)!==JSON.stringify(original.files[name]))report.changedContent.push(name);
 report.contentFiles++;
}
if(report.contentFiles!==Object.keys(original.files).length||report.changedContent.length)throw new Error('Model/texture content graph changed');
const deployment=JSON.parse(await readFile(resolve(repo,'ArcherPreviewSite/deployment-files.json'),'utf8'));
if(deployment.resourceRevision!==current.revision)throw new Error('Site revision differs');
for(const item of deployment.files.filter(f=>f.path.endsWith('.js'))){
 const body=await readFile(resolve(repo,'ArcherPreviewSite',item.path),'utf8');
 if(body.includes('laboratory-shell')||body.includes('P1_A_LABORATORY'))throw new Error('Unapproved shell entered publish bundle');
}
report.status='pass';
await mkdir(resolve(project,'reports/cave-painted-light-release'),{recursive:true});
await writeFile(resolve(project,'reports/cave-painted-light-release/protected-resources.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
