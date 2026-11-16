import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {EnemySeparationWorkspace,separateEnemies} from '../../src/enemy-separation.js';
const root=resolve(import.meta.dirname,'../../..'),app=resolve(root,'ArcherPreview');
const hash=data=>createHash('sha256').update(data).digest('hex');
const primary=await readFile(resolve(root,'ArcherPreviewSite/deployment-files.json'));
const index=JSON.parse(await readFile(resolve(root,'ArcherPreviewSite/assets/resource-index.json'),'utf8'));
const expectedPrimary='0726cc807e86a0c60378e1815a8445f2137fd22116686140a66f2efda42a9f1b';
if(hash(primary)!==expectedPrimary)throw Error('Preserved 0.1 inventory changed');
if(index.revision!=='a10ad88fda3ae2f003331c1985252023d7c24742d78357960e89e8e6ddff7fd1')throw Error('Approved resource graph changed');
const suites=[];
for(const file of ['integration-test.log','four-map-test.log']){
 const log=await readFile(resolve(import.meta.dirname,file),'utf8');
 const value=name=>Number(log.match(new RegExp('tests '+name))?.[1]);
 const tests=Number(log.match(/tests (\d+)/)?.[1]),pass=Number(log.match(/pass (\d+)/)?.[1]),fail=Number(log.match(/fail (\d+)/)?.[1]);
 if(!tests||pass!==tests||fail!==0)throw Error('Incomplete test run: '+file);
 suites.push({file,tests,pass,fail,sha256:hash(log)});
}
const log=await readFile(resolve(import.meta.dirname,'integration-test.log'),'utf8');
const cache=log.split(/\r?\n/).filter(line=>line.includes('"scope":"CPU-only Babylon')).map(line=>JSON.parse(line.slice(line.indexOf('{'))))[0];
const actors=Array.from({length:80},(_,i)=>({active:true,brain:{hp:300,mode:'idle'},actor:{position:{x:(i%10)*8,y:0,z:Math.floor(i/10)*8}},separationRadius:.8}));
const spatial={...separateEnemies(actors,null,new EnemySeparationWorkspace())};
const files=['animation.js','boss-battle.js','boss-encounter.js','boss-models.js','chapter-quest-state.js','character-interior-ink.js','frame-diagnostics.js','game-audio.js','main.js','map-resource-inspector.js','mourning-camera-culling.js','content-runtime-budget.js','dormant-encounter-pool.js','enemy-separation.js'];
const sourceHashes={};for(const file of files)sourceHashes[file]=hash(await readFile(resolve(app,'src',file)));
const published=JSON.parse(await readFile(resolve(app,'reports/publish-moonforest-0.2.json'),'utf8'));
const result={date:'2026-11-16',release:'moonforest-0.2',baseCommit:'5af659e894546a2eabd37c8114ddf08c0e408366',scope:'R2 첫 적용 묶음. 조건부 대규모 구조 변경은 미적용.',tests:suites,totalTests:suites.reduce((n,row)=>n+row.tests,0),quality:{preserved01InventorySha256:hash(primary),resourceRevision:index.revision,modelTextureLodAndCombatAuthoredFilesChanged:false},animationCache:cache,spatial,published,sourceHashes,realDevice:{tested:false,fps:null,gpuMs:null,thermal:null,browserAutomation:false},remaining:['지형 분할과 추가 thin instance의 조건부 시범','교차 로더 입장 제어 및 GPU 업로드 충돌 확인','디코더 보존·고해상도 캐시 수명 실험','NPC 시간원 통합','모든 소유자를 강제하는 전역 자원 입장 상한']};
await writeFile(resolve(import.meta.dirname,'verification.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({tests:result.totalTests,resourceRevision:index.revision,preserved01:true,spatial,files:published.verifiedFiles}));
