// Public GitHub API status only; never controls a browser.
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const repo=new URL('../../../',import.meta.url),file=new URL('workflow.json',import.meta.url);
const head=execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim();
let previous;try{previous=JSON.parse(await readFile(file,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
const base='https://api.github.com/repos/ranke0802/moonforest/actions/';
const known=previous?.head===head&&previous.id;
const response=await fetch(base+(known?'runs/'+previous.id:'workflows/pages.yml/runs?branch=archer&per_page=3'),{headers:{'User-Agent':'MoonForest-release-check'},signal:AbortSignal.timeout(20000)});
if(!response.ok)throw Error('GitHub HTTP '+response.status);
const data=await response.json(),run=known?data:data.workflow_runs.find(row=>row.head_sha===head);
if(run&&run.head_sha!==head)throw Error('Unexpected workflow commit');
const result=run?{id:run.id,status:run.status,conclusion:run.conclusion,head:run.head_sha,url:run.html_url}:{head,status:'awaiting-run'};
await writeFile(file,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
if(result.status==='completed'&&result.conclusion!=='success')process.exitCode=1;
