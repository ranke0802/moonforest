import fs from 'node:fs';import path from 'node:path';import {execFileSync,spawnSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'../../..'),prefix='ArcherPreview/reports/wolf-v02-predator-r11/';
const stage=[
'AGENTS.md',...['SKILL.md','references/combat-runtime.md','references/rig-motion.md','references/wolf-reference.md'].map(p=>'.agents/skills/moonforest-canine-unit/'+p),
...['wolf-v02-authored-clips.js','wolf-v02-encounter.js','wolf-v02-locomotion.js','wolf-v02-spec.js','wolf-v02-predator-clips.json'].map(p=>'ArcherPreview/src/'+p),
...['wolf-v02-authored-attacks.test.js','wolf-v02-brain.test.js','wolf-v02-feral-integration.test.js','wolf-v02-hunt-integration.test.js','wolf-v02-hunt.test.js','wolf-v02-integration.test.js','wolf-v02-orbit-navigation.test.js','wolf-v02-predator-integration.test.js','wolf-v02-predator-runtime.test.js'].map(p=>'ArcherPreview/tests/'+p),
'ArcherPreview/scripts/export-wolf-r11-runtime-review.mjs','ArcherPreview/scripts/prepare-wolf-v02-predator.mjs','Tools/Verification/render-wolf-r11-runtime.py',
...['baseline-audit.mjs','baseline-r10.json','build-review.mjs','combined-regression.json','combined-regression.txt','independent-gameplay.json','independent-review.json','summarize-independent.mjs','obsolete-expectations.json','run-final-validation.mjs','verify-deployment.mjs','visual-review.json','validate-review.mjs','html-validation.json','stage-release.mjs'].map(p=>prefix+p),
'Docs/Reports/2026-11-13/MOONFOREST_0.2_늑대_R11_검토보고서.html','Docs/Reports/2026-11-13/MOONFOREST_0.2_늑대_R11_검토보고서.json',
...['index.json','render-cases.json','far-run-transition.jpg','runtime-contact-sheet.jpg','runtime-remaining-views.jpg'].map(p=>'Docs/Reviews/2026-11-13/wolf-predator-r11/runtime-poses/'+p),
'ArcherPreview/reports/publish-moonforest-0.2.json',...JSON.parse(fs.readFileSync(path.join(root,'ArcherPreview/reports/publish-moonforest-0.2.json'))).changedPaths];
for(const p of stage)if(!fs.existsSync(path.join(root,p)))throw Error('Missing stage file '+p);
const before=execFileSync('git',['diff','--cached','--name-only','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);if(before.length)throw Error('Index not empty: '+before.join(','));
execFileSync('git',['add','--',...stage],{cwd:root,stdio:'pipe'});
const previous=JSON.parse(execFileSync('git',['show','HEAD:Sources/source-inputs.json'],{cwd:root,encoding:'utf8',maxBuffer:16*1024*1024})),working=JSON.parse(fs.readFileSync(path.join(root,'Sources/source-inputs.json')));
const ids=['wolf-v02-predator-r11','wolf-predator-r11-review-reference'],folders=ids.map(id=>working.directories[id]);
for(const id of ids){if(!working.directories[id])throw Error('Missing new source ID');previous.directories[id]=working.directories[id];}
const selected=working.inputs.filter(row=>folders.some(p=>row.path===p||row.path.startsWith(p+'/')));
for(const row of selected){const i=previous.inputs.findIndex(old=>old.id===row.id);if(i>=0)previous.inputs[i]=row;else previous.inputs.push(row);}
const object=spawnSync('git',['hash-object','-w','--stdin'],{cwd:root,input:JSON.stringify(previous,null,2)+'\n',encoding:'utf8'});if(object.status)throw Error(object.stderr);
execFileSync('git',['update-index','--cacheinfo','100644,'+object.stdout.trim()+',Sources/source-inputs.json'],{cwd:root});
const staged=execFileSync('git',['diff','--cached','--name-only','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean),allow=new Set([...stage,'Sources/source-inputs.json']);
for(const p of staged)if(!allow.has(p))throw Error('Unexpected index path '+p);
const result={staged:staged.length,sourceInputsAddedOrUpdated:selected.length,sourceDirectories:ids,paths:staged};fs.writeFileSync(path.join(root,prefix,'staged-paths.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({staged:staged.length,sourceInputsAddedOrUpdated:selected.length}));
