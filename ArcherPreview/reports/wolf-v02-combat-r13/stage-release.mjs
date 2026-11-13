import fs from 'node:fs';import path from 'node:path';import{execFileSync,spawnSync}from'node:child_process';
const root=path.resolve(import.meta.dirname,'../../..'),prefix='ArcherPreview/reports/wolf-v02-combat-r13/';
const run=args=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:20*1024*1024});
if(run(['diff','--cached','--name-only']).trim())throw Error('Index is not empty; do not mix another task');
const source=['wolf-v02-authored-clips.js','wolf-v02-authored-history.js','wolf-v02-encounter.js','wolf-v02-spec.js','wolf-v02-ram.js','wolf-v02-hurt.js','wolf-v02-shield.js','wolf-v02-support.js','wolf-v02-telegraph.js','wolf-v02-contact-shapes.js','wolf-v02-combat-r13-clips.json'];
const tests=run(['diff','--name-only','--','ArcherPreview/tests']).split(/\r?\n/).filter(p=>/^ArcherPreview\/tests\/wolf-v02-.*\.test\.js$/.test(p));
for(const name of fs.readdirSync(path.join(root,'ArcherPreview/tests')))if(/^wolf-v02-combat-r13.*\.test\.js$/.test(name))tests.push('ArcherPreview/tests/'+name);
const helpers=fs.readdirSync(path.join(root,'ArcherPreview/tests/helpers')).filter(n=>/^wolf-combat-r13.*\.js$/.test(n)).map(n=>'ArcherPreview/tests/helpers/'+n);
const skip=new Set(['ram-proof.json','incoming-proof.json','tactics-proof.json','legacy-ram-independent-gameplay.json','staged-paths.json','adapt-obsolete.mjs','adapt-ram.mjs']);
const finalText=new Set(['combined-regression.txt','baseline-autonomy.txt','runtime-export.txt']);
const reports=fs.readdirSync(import.meta.dirname).filter(n=>!skip.has(n)&&/\.(?:mjs|json|json\.gz|txt)$/.test(n)&&(!n.endsWith('.txt')||finalText.has(n))&&(!n.endsWith('.json')||!fs.existsSync(path.join(import.meta.dirname,n+'.gz')))).map(n=>prefix+n);
const review='Docs/Reviews/2026-11-13/wolf-combat-r13/',views=review+'runtime-poses/';
const pictures=fs.readdirSync(path.join(root,views)).filter(n=>/\.jpg$/.test(n)||n==='render-cases.json').map(n=>views+n);
const published=JSON.parse(fs.readFileSync(path.join(root,'ArcherPreview/reports/publish-moonforest-0.2.json')));
const stage=[...new Set(['AGENTS.md',...['SKILL.md','references/combat-runtime.md','references/rig-motion.md','references/wolf-reference.md'].map(n=>'.agents/skills/moonforest-canine-unit/'+n),...source.map(n=>'ArcherPreview/src/'+n),...tests,...helpers,...reports,...pictures,
 'ArcherPreview/scripts/prepare-wolf-v02-combat-r13.mjs','ArcherPreview/scripts/export-wolf-r13-runtime-review.mjs','Tools/Verification/render-wolf-r13-runtime.py',review+'runtime-poses.json',
 'Docs/Reports/2026-11-13/MOONFOREST_0.2_늑대_R13_전투_검토보고서.html','Docs/Reports/2026-11-13/MOONFOREST_0.2_늑대_R13_전투_검토보고서.json',
 'ArcherPreview/reports/publish-moonforest-0.2.json',...published.changedPaths])];
for(const file of stage)if(!fs.existsSync(path.join(root,file)))throw Error('Missing reviewed stage input '+file);
run(['add','--',...stage]);
// Only this task's two source trees enter the commit. Other working registry
// additions remain on disk for their owners and portable package inventory.
const previous=JSON.parse(run(['show','HEAD:Sources/source-inputs.json'])),working=JSON.parse(fs.readFileSync(path.join(root,'Sources/source-inputs.json'))),selected=[];
for(const id of ['wolf-v02-knockdown-r13','wolf-combat-r13-review-reference']){
 const folder=working.directories[id];if(!folder)throw Error('Required source not registered '+id);previous.directories[id]=folder;
 for(const entry of working.inputs.filter(row=>row.path===folder||row.path.startsWith(folder+'/'))){const i=previous.inputs.findIndex(row=>row.id===entry.id);if(i<0)previous.inputs.push(entry);else previous.inputs[i]=entry;selected.push(entry);}
}
const obj=spawnSync('git',['hash-object','-w','--stdin'],{cwd:root,input:JSON.stringify(previous,null,2)+'\n',encoding:'utf8'});if(obj.status)throw Error(obj.stderr);
run(['update-index','--cacheinfo','100644,'+obj.stdout.trim()+',Sources/source-inputs.json']);
const actual=run(['diff','--cached','--name-only','-z']).split('\0').filter(Boolean),allow=new Set([...stage,'Sources/source-inputs.json']);
for(const p of actual)if(!allow.has(p))throw Error('Unexpected staged path '+p);
const result={files:actual.length,sourceDirectories:['wolf-v02-knockdown-r13','wolf-combat-r13-review-reference'],sourceFiles:selected.length,paths:actual};fs.writeFileSync(path.join(import.meta.dirname,'staged-paths.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({files:actual.length,sourceFiles:selected.length}));
