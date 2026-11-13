import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';
const root=path.resolve(import.meta.dirname,'../../..'),file='Docs/Reports/2026-11-13/MOONFOREST_0.2_늑대_R11_검토보고서.html',html=fs.readFileSync(path.join(root,file),'utf8');
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]);for(const s of scripts)new vm.Script(s);
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);if(ids.length!==new Set(ids).size)throw Error('Duplicate ID');
const resources=[...html.matchAll(/\b(?:src|poster)="([^"]+)"/g)].map(m=>m[1]);if(resources.some(p=>!p.startsWith('data:')))throw Error('External media');
if(!html.includes('141/141')||html.includes('pending external test corrections'))throw Error('Stale report summary');
const result={file,bytes:Buffer.byteLength(html),inlineScripts:scripts.length,embeddedMedia:resources.length,uniqueIds:ids.length,syntax:true,externalRequiredMedia:false,checks:'Static DOM/inline script and data-URL validation only; no browser automation.'};fs.writeFileSync(path.join(import.meta.dirname,'html-validation.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
