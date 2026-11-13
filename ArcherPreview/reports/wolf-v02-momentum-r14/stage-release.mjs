import fs from 'node:fs';import path from 'node:path';import {execFileSync,spawnSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'../../..'),prefix='ArcherPreview/reports/wolf-v02-momentum-r14/',run=args=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024});
if(run(['diff','--cached','--name-only']).trim())throw Error('Index is occupied; do not mix another task');
const changed=run(['diff','--name-only']).split(/\r?\n/).filter(Boolean),source=changed.filter(p=>/^ArcherPreview\/src\/wolf-v02-/.test(p));
for(const name of fs.readdirSync(path.join(root,'ArcherPreview/src')))if((name.startsWith('wolf-v02-')&&/\.(js|json)$/.test(name))&&run(['ls-files','--',`ArcherPreview/src/${name}`]).trim()==='')source.push('ArcherPreview/src/'+name);
const tests=changed.filter(p=>/^ArcherPreview\/tests\/(?:wolf-v02-[^/]+\.test\.js|helpers\/wolf-[^/]+\.js)$/.test(p));
for(const dir of ['ArcherPreview/tests','ArcherPreview/tests/helpers'])for(const name of fs.readdirSync(path.join(root,dir)))if(name.includes('momentum-r14')&&name.endsWith('.js')&&!name.includes('review-draft'))tests.push(dir+'/'+name);
const previewReports=new Set(['check-preservation.mjs','preserved-baseline.json','preservation-result.json','stage-release.mjs','verify-deployment.mjs','runtime-fast-smoke.mjs','preview-smoke.json','preview-smoke.mjs','optimization.json','build-result.json','source-registration.json','source-audit.json','preview-notes.md']);
const reports=fs.readdirSync(import.meta.dirname).filter(name=>previewReports.has(name)).map(name=>prefix+name);
const publish=JSON.parse(fs.readFileSync(path.join(root,'ArcherPreview/reports/publish-moonforest-0.2.json')));
const files=[...new Set(['AGENTS.md',...['SKILL.md','references/runtime-r14-profile.md'].map(p=>'.agents/skills/moonforest-canine-unit/'+p),'ArcherPreview/src/main.js','ArcherPreview/src/boss-battle.js',...source,...tests,...reports,
 'ArcherPreview/scripts/prepare-wolf-v02-momentum-r14.mjs','ArcherPreview/scripts/check-wolf-v02-pose-cost.mjs','ArcherPreview/reports/publish-moonforest-0.2.json',...publish.changedPaths])];
run(['add','-A','--',...files]);
const previous=JSON.parse(run(['show','HEAD:Sources/source-inputs.json'])),working=JSON.parse(fs.readFileSync(path.join(root,'Sources/source-inputs.json'))),selected=[];
for(const id of ['wolf-v02-momentum-r14','wolf-combat-r14-approved-reference']){
 const folder=working.directories[id];if(!folder)throw Error('R14 source not registered '+id);previous.directories[id]=folder;
 for(const entry of working.inputs.filter(row=>row.path===folder||row.path.startsWith(folder+'/'))){const i=previous.inputs.findIndex(row=>row.id===entry.id);if(i<0)previous.inputs.push(entry);else previous.inputs[i]=entry;selected.push(entry);}
}
const object=spawnSync('git',['hash-object','-w','--stdin'],{cwd:root,input:JSON.stringify(previous,null,2)+'\n',encoding:'utf8'});if(object.status)throw Error(object.stderr);run(['update-index','--cacheinfo','100644,'+object.stdout.trim()+',Sources/source-inputs.json']);
const actual=run(['diff','--cached','--name-only','-z']).split('\0').filter(Boolean),allow=new Set([...files,'Sources/source-inputs.json']);for(const p of actual)if(!allow.has(p))throw Error('Unexpected staged file '+p);
const evidence={files:actual.length,sourceFiles:selected.length,sourceDirectories:['wolf-v02-momentum-r14','wolf-combat-r14-approved-reference'],paths:actual};fs.writeFileSync(path.join(import.meta.dirname,'staged-paths.json'),JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify({files:actual.length,sourceFiles:selected.length}));
