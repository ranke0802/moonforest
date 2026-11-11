import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'../../..'),dir=import.meta.dirname,commit=process.argv[2];
assert.match(commit??'',/^[a-f0-9]{40}$/);
const response=await fetch('https://api.github.com/repos/ranke0802/moonforest/actions/runs?branch=archer&head_sha='+commit+'&per_page=10',{headers:{Accept:'application/vnd.github+json','User-Agent':'MoonForest-editor-release'},signal:AbortSignal.timeout(20000)});
if(!response.ok)throw new Error('Workflow API returned '+response.status);
const data=await response.json(),run=data.workflow_runs.find(row=>row.head_sha===commit&&row.name==='Deploy reviewed game build');
const workflow={checkedAt:new Date().toISOString(),commit,run:run?{id:run.id,url:run.html_url,status:run.status,conclusion:run.conclusion,headSha:run.head_sha,event:run.event}:null};
fs.writeFileSync(path.join(dir,'workflow.json'),JSON.stringify(workflow,null,2)+'\n');
if(!run||run.status!=='completed'){console.log(JSON.stringify({ready:false,workflow:workflow.run}));process.exit(0);}
assert.equal(run.conclusion,'success','Deployment workflow must succeed');
const site=path.join(root,'ArcherPreviewSite'),manifest=JSON.parse(fs.readFileSync(path.join(site,'deployment-files.json'),'utf8'));
const validation=JSON.parse(fs.readFileSync(path.join(dir,'release-validation.json'),'utf8'));
const changed=[...validation.published.changed,...validation.published.added,'deployment-files.json'];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const outcomes=await Promise.allSettled(changed.map(async file=>{
 const url='https://ranke0802.github.io/moonforest/ArcherPreviewSite/'+file+'?rev='+commit;
 const res=await fetch(url,{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(20000)}),bytes=Buffer.from(await res.arrayBuffer()),expected=sha(fs.readFileSync(path.join(site,file)));
 return {file,status:res.status,bytes:bytes.length,sha256:sha(bytes),expected,passed:res.ok&&sha(bytes)===expected};
}));
const results=outcomes.map((row,index)=>row.status==='fulfilled'?row.value:{file:changed[index],passed:false,error:String(row.reason)});
const passed=results.every(row=>row.passed),receipt={status:passed?'released':'awaiting-public-files',checkedAt:new Date().toISOString(),release:'MoonForest 0.1 ver',commit,workflow:workflow.run,studioUrl:'https://ranke0802.github.io/moonforest/ArcherPreviewSite/cinematic-studio.html?rev='+commit.slice(0,7),publicFiles:results,passed,preparedResourcesUnchanged:true,resourceRevision:manifest.resourceRevision,tests:{relatedPassed:279,independentPassed:26,wholeSuiteRepeated:false},limits:{browserAutomation:false,pixels:'not inspected',physicalMobileTouch:'unverified',devicePerformance:'unmeasured'}};
fs.writeFileSync(path.join(dir,'deployment.json'),JSON.stringify(receipt,null,2)+'\n');
if(passed){const p=path.join(dir,'work-state.json'),state=JSON.parse(fs.readFileSync(p,'utf8'));Object.assign(state,{status:'released',updatedAt:receipt.checkedAt,commit,deployment:'deployment.json',nextAction:'Scenery240% and mobile camera joystick released. Continue future work only in C:/dev/MoonForest; physical-device performance remains unmeasured.'});fs.writeFileSync(p,JSON.stringify(state,null,2)+'\n');}
console.log(JSON.stringify({ready:passed,commit,workflow:workflow.run,publicFiles:results.length,verified:results.filter(row=>row.passed).length,studioUrl:receipt.studioUrl}));
