import {readFile,writeFile,rename,unlink} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {parseHudLayout} from '../src/hud-layout.js';

// Explicitly apply a reviewed HUD export as the default for future builds.
// Existing players' saved preferences remain authoritative.
const input=process.argv[2];
if(!input)throw new Error('사용법: node scripts/apply-hud-default.mjs <검수한 HUD JSON>');
const items=parseHudLayout(await readFile(input,'utf8'));
const target=fileURLToPath(new URL('../src/hud-layout-default.json',import.meta.url)),temp=target+'.'+randomUUID()+'.tmp';
try{await writeFile(temp,JSON.stringify({version:1,items},null,2)+'\n',{encoding:'utf8',flag:'wx'});await rename(temp,target);}catch(error){await unlink(temp).catch(()=>{});throw error;}
console.log('HUD 기본값을 반영했습니다. 다시 빌드해 배포하세요. 기존 사용자 저장값은 유지됩니다.');
