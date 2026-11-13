import fs from 'node:fs';import path from 'node:path';import {execFileSync,spawnSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'../../..'),prefix='ArcherPreview/reports/wolf-v02-ram-r12/';
const reports=['baseline-notes.md','baseline-r11.mjs','baseline-r11.txt','baseline-r11.json.gz','preservation-baseline.json','preserved-baseline.json','runtime-preservation-before.json','check-preservation.mjs','preservation-result.json','source-registration.json','build.txt','build-review.mjs','combined-regression.json','combined-regression.txt','independent-gameplay.json.gz','independent-review.json','skin-contact.mjs','obsolete-expectations.json','run-final-validation.mjs','verify-deployment.mjs','visual-review.json','validate-review.mjs','html-validation.json','package-evidence.mjs','evidence-files.json','stage-release.mjs'];
const stage=['AGENTS.md',...['SKILL.md','references/combat-runtime.md','references/rig-motion.md','references/wolf-reference.md'].map(p=>'.agents/skills/moonforest-canine-unit/'+p),
...['wolf-v02-authored-clips.js','wolf-v02-encounter.js','wolf-v02-spec.js','wolf-v02-ram.js','wolf-v02-ram-clips.json'].map(p=>'ArcherPreview/src/'+p),
...['wolf-v02-authored-attacks.test.js','wolf-v02-brain.test.js','wolf-v02-feral-integration.test.js','wolf-v02-hunt-integration.test.js','wolf-v02-hunt.test.js','wolf-v02-integration.test.js','wolf-v02-orbit-navigation.test.js','wolf-v02-predator-runtime.test.js','wolf-v02-predator-integration.test.js','wolf-v02-ram-runtime.test.js','wolf-v02-ram-integration.test.js','helpers/wolf-ram-fixture.js'].map(p=>'ArcherPreview/tests/'+p),
'ArcherPreview/scripts/export-wolf-r12-runtime-review.mjs','ArcherPreview/scripts/prepare-wolf-v02-ram.mjs','Tools/Verification/render-wolf-r12-runtime.py',...reports.map(p=>prefix+p),
'Docs/Reports/2026-11-13/MOONFOREST_0.2_늑대_R12_돌진_검토보고서.html','Docs/Reports/2026-11-13/MOONFOREST_0.2_늑대_R12_돌진_검토보고서.json','Docs/Reviews/2026-11-13/wolf-ram-r12/runtime-poses.json',
'Docs/Reviews/2026-11-13/wolf-ram-r12/runtime-poses/render-cases.json',
...['a','b'].map(p=>'Docs/Reviews/2026-11-13/wolf-ram-r12/runtime-poses/contact-sheet-'+p+'.jpg'),
...['prepare','head-ram','falling','ground-bite-1','ground-bite-2','recover'].flatMap(p=>['front','side','quarter','opposite'].map(v=>'Docs/Reviews/2026-11-13/wolf-ram-r12/runtime-poses/'+p+'-'+v+'.png')),
'ArcherPreview/reports/publish-moonforest-0.2.json',...JSON.parse(fs.readFileSync(path.join(root,'ArcherPreview/reports/publish-moonforest-0.2.json'))).changedPaths];
for(const p of stage)if(!fs.existsSync(path.join(root,p)))throw Error('Missing stage file '+p);
const before=execFileSync('git',['diff','--cached','--name-only','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);if(before.length)throw Error('Index is not empty: '+before.join(','));
execFileSync('git',['add','--',...stage],{cwd:root,stdio:'pipe'});
const previous=JSON.parse(execFileSync('git',['show','HEAD:Sources/source-inputs.json'],{cwd:root,encoding:'utf8',maxBuffer:16*1024*1024})),working=JSON.parse(fs.readFileSync(path.join(root,'Sources/source-inputs.json'))),id='wolf-v02-ram-r12',folder=working.directories[id];
if(!folder)throw Error('R12 source is not registered');previous.directories[id]=folder;
const selected=working.inputs.filter(row=>row.path===folder||row.path.startsWith(folder+'/'));
for(const row of selected){const i=previous.inputs.findIndex(old=>old.id===row.id);if(i>=0)previous.inputs[i]=row;else previous.inputs.push(row);}
const object=spawnSync('git',['hash-object','-w','--stdin'],{cwd:root,input:JSON.stringify(previous,null,2)+'\n',encoding:'utf8'});if(object.status)throw Error(object.stderr);
execFileSync('git',['update-index','--cacheinfo','100644,'+object.stdout.trim()+',Sources/source-inputs.json'],{cwd:root});
const staged=execFileSync('git',['diff','--cached','--name-only','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean),allow=new Set([...stage,'Sources/source-inputs.json']);for(const p of staged)if(!allow.has(p))throw Error('Unexpected index path '+p);
fs.writeFileSync(path.join(root,prefix,'staged-paths.json'),JSON.stringify({staged:staged.length,sourceInputsAddedOrUpdated:selected.length,sourceDirectories:[id],paths:staged},null,2)+'\n');console.log(JSON.stringify({staged:staged.length,sourceInputsAddedOrUpdated:selected.length}));
