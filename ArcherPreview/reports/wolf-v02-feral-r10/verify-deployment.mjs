import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const project=path.resolve(import.meta.dirname,'../../..'),site=path.join(project,'ArcherPreviewSite');
const commit=execFileSync('git',['rev-parse','HEAD'],{cwd:project,encoding:'utf8'}).trim(),rev=commit.slice(0,7);
const base='https://ranke0802.github.io/moonforest/ArcherPreviewSite/';
const primary=JSON.parse(fs.readFileSync(path.join(site,'deployment-files.json'))),next=JSON.parse(fs.readFileSync(path.join(site,'deployment-files-moonforest-0.2.json')));
const preserved=new Set(primary.files.map(f=>f.path)),descriptors=new Map([...primary.files,...next.files].map(f=>[f.path,f]));
const paths=[...new Set(['index.html','moonforest-0.2.html','moonforest-0.2.webmanifest','assets/alpha-wolf.json',...next.files.filter(f=>!preserved.has(f.path)).map(f=>f.path)])];
const hash=b=>createHash('sha256').update(b).digest('hex');
const retries=[];
async function get(url){
 for(let attempt=0;attempt<3;attempt++){
  try{const r=await fetch(url,{headers:{'Cache-Control':'no-cache','User-Agent':'MoonForest-release-verification'},signal:AbortSignal.timeout(30000)});if(r.ok)return r;if(![429,502,503,504].includes(r.status)||attempt===2)throw Error('HTTP '+r.status);retries.push({url,attempt:attempt+1,status:r.status});}
  catch(error){if(attempt===2)throw error;retries.push({url,attempt:attempt+1,error:error.message});}
  await new Promise(resolve=>setTimeout(resolve,500*(attempt+1)));
 }
}
const response=await fetch('https://api.github.com/repos/ranke0802/moonforest/actions/runs?head_sha='+commit+'&per_page=5',{headers:{'Cache-Control':'no-cache','User-Agent':'MoonForest-release-verification'},signal:AbortSignal.timeout(30000)});
if(!response.ok)throw Error('Workflow status HTTP '+response.status);
const runs=(await response.json()).workflow_runs.filter(run=>run.head_sha===commit),run=runs.find(r=>r.name==='Deploy reviewed game build');
if(!run||run.status!=='completed'||run.conclusion!=='success')throw Error('Deployment not ready: '+JSON.stringify(runs.map(r=>({id:r.id,status:r.status,conclusion:r.conclusion}))));
let cursor=0;const checked=[];
async function worker(){while(cursor<paths.length){const p=paths[cursor++],expected=descriptors.get(p),r=await get(base+p+'?rev='+rev);const bytes=Buffer.from(await r.arrayBuffer());if(bytes.length!==expected.bytes||hash(bytes)!==expected.sha256)throw Error('Deployed bytes differ: '+p);checked.push({path:p,bytes:bytes.length});}}
await Promise.all(Array.from({length:3},worker));
for(const p of ['deployment-files.json','deployment-files-moonforest-0.2.json','moonforest-0.2.html']){const r=await get(base+p);if(hash(Buffer.from(await r.arrayBuffer()))!==hash(fs.readFileSync(path.join(site,p))))throw Error('Stable URL differs: '+p);}
const evidence={commit,workflowRun:run.id,workflowConclusion:run.conclusion,checkedAt:new Date().toISOString(),verifiedFiles:checked.length,verifiedBytes:checked.reduce((n,f)=>n+f.bytes,0),preservedRelease:'a40d4ed',preservedFiles:primary.files.length,gameUrl:base+'moonforest-0.2.html?rev='+rev,browserAutomationUsed:false,deviceFpsGpuHeat:'not measured',retries,files:checked};
fs.writeFileSync(path.join(import.meta.dirname,'deployment.json'),JSON.stringify(evidence,null,2)+'\n');const {files,...summary}=evidence;console.log(JSON.stringify(summary));
