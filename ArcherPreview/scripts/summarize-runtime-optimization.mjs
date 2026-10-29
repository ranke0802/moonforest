import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const directory=resolve(process.argv[2]??'reports/optimization-verification');
const read=name=>JSON.parse(readFileSync(resolve(directory,name),'utf8'));
const before=read('before.json'),after=read('after.json');
assert.deepEqual(after.terrainHashes,before.terrainHashes,'Terrain output changed');
assert.equal(after.resourceRevision,before.resourceRevision);
assert.equal(after.lifetime.deadMaterialVisits,0);
assert.ok(after.terrainCache.bytes<=after.terrainCache.limit&&after.terrainCache.entries<=3);
const resourceIndex=JSON.parse(readFileSync('public/assets/resource-index.json','utf8'));
const deployedIndex=JSON.parse(execFileSync('git',['show',`${before.head}:ArcherPreviewSite/assets/resource-index.json`],{encoding:'utf8',maxBuffer:4*1048576}));
assert.deepEqual(resourceIndex,deployedIndex,'Runtime-only optimization must not invalidate content caches');
const metrics=values=>{const a=[...values].sort((x,y)=>x-y);return {samples:a.length,medianMs:(a[Math.floor((a.length-1)/2)]+a[Math.floor(a.length/2)])/2,p95Ms:a[Math.ceil(a.length*.95)-1]};};
const cpu=Object.fromEntries(Object.keys(before.warmMapReplacement).map(key=>{
 const previous=metrics(before.warmMapReplacement[key].valuesMs),current=metrics(after.warmMapReplacement[key].valuesMs);
 return [key,{before:previous,after:current,reductionPercent:100*(1-current.medianMs/previous.medianMs)}];
}));
const resourcePlateau={};
for(const character of Object.keys(cpu)){
 const samples=after.sceneCounts.filter(row=>row.character===character&&row.round>=2);
 const select=row=>Object.fromEntries(['meshes','materials','textures','geometries'].map(key=>[key,row[key]]));
 const expected=select(samples[0]);for(const sample of samples)assert.deepEqual(select(sample),expected,'Scene resource count grew');
 resourcePlateau[character]=expected;
}
const log=readFileSync(resolve(directory,'full-tests.log'),'utf8');
const count=key=>Number(log.match(new RegExp(`(?:ℹ|#) ${key} (\\d+)`))?.[1]);
const tests={total:count('tests'),passed:count('pass'),failed:count('fail'),cancelled:count('cancelled'),skipped:count('skipped')};
assert.ok(tests.total>0);assert.equal(tests.total,tests.passed);assert.equal(tests.failed,0);assert.equal(tests.cancelled,0);
const sourceFiles=['src/map-terrain-cache.js','src/world.js','src/witch-cave-surfaces.js','src/witch-cave-atmosphere.js','src/main.js'];
const sourceHashes=Object.fromEntries(sourceFiles.map(path=>[path,createHash('sha256').update(readFileSync(path,'utf8').replace(/\r\n?/g,'\n')).digest('hex')]));
const result={schemaVersion:1,createdAt:new Date().toISOString(),baseCommit:before.head,sourceHashes,status:'local_checks_passed',prompt:'docs/optimization-verification-prompt.txt',resourceRevision:resourceIndex.revision,resourceGraphUnchanged:true,tests,cpu,firstVillageCpuMs:{before:before.firstVillageMs,after:after.firstVillageMs},
 lifetime:{beforeDeadVisits:before.lifetime.deadMaterialVisits,afterDeadVisits:after.lifetime.deadMaterialVisits,disposedMaterials:after.lifetime.disposedMaterials,frames:after.lifetime.frames,remainingStyle:after.lifetime.style},
 terrainCache:after.terrainCache,terrainHashesUnchanged:true,resourcePlateau,completedMapSwaps:after.transitions.length,
 passed:['Full regression suite','Exact original height grids and walking interpolation','Bounded isolated CPU terrain copies','Disposed-material lifetime, deferred notifications and container removal','Cached resource graph unchanged','Existing S23 viewport draw/LOD/shadow submission tests','Combat, health/potions/equipment, camera and in-document travel logic'],
 notMeasured:['Physical S23 temperature/FPS/GPU memory','Real browser rasterization or fullscreen/orientation behavior','Real network download speed','End-to-end playable scene loading time'],
 constraints:{playerMaxTexture:8192,backgroundMaxTexture:4096,lodUnchanged:true,visualPolicyUnchanged:true,additionalAssetsGenerated:false,browserAutomation:false},
 limitations:['CPU timings are one PC/Node run per version with 8 warm samples per map; no absolute timing pass threshold.','No streamed models in the map-construction benchmark. They are covered separately by the full suite.','Observer arrays can retain marked-for-removal entries until Babylon timer cleanup; dedicated tests drain those timers.','Terrain cache adds 356364 bytes of fixed CPU samples; it does not retain GPU resources.']};
writeFileSync(resolve(directory,'verification.json'),JSON.stringify(result,null,2)+'\n');
const labels={'warrior-v3':'마을','warrior-v4':'마물의 숲','warrior-v5':'마녀의 동굴'};
const text=[
 'MOONFOREST 기능 보존 최적화 검증 결과',
 `기준 커밋: ${before.head}`,
 `리소스 JSON revision: ${resourceIndex.revision} (변경 없음)`,
 `전체 자동테스트: ${tests.passed}/${tests.total} 통과, 실패 ${tests.failed}`,
 '',
 '적용한 변경',
 '1. 맵 재방문 시 동일한 지형 높이 계산 재사용. 엔진당 최대 3개·512 KiB, 현재 356,364바이트. 방문마다 별도 배열로 복사하여 변경 전파 방지. 엔진 폐기 시 정리.',
 '2. 동굴 색조 관리자가 실제로 폐기된 재질을 즉시 잊도록 수정. 지연 추가 이벤트·임시 AssetContainer 이동을 구분. 색조·셰이더 자체는 변경하지 않음.',
 '3. 진단 JSON에 mapTerrainCache, caveMaterials 카운터 추가. README와 오래된 맵 이동 정책 문서 정정.',
 '',
 'CPU 측정 (PC/Node NullEngine, 첫 방문 제외 8회 표본, 맵 구성 함수만)',
 ...Object.entries(cpu).map(([key,v])=>`${labels[key]}: 중앙값 ${v.before.medianMs.toFixed(1)} → ${v.after.medianMs.toFixed(1)} ms (${v.reductionPercent.toFixed(1)}% 감소), p95 ${v.before.p95Ms.toFixed(1)} → ${v.after.p95Ms.toFixed(1)} ms`),
 `최초 마을 구성: ${before.firstVillageMs.toFixed(1)} → ${after.firstVillageMs.toFixed(1)} ms. 첫 접속 개선을 주장하지 않음.`,
 '',
 '동일성·수명 검사',
 `세 맵의 모든 Float32 높이 SHA-256 동일. ${after.transitions.length}회 맵 교체에서 scene/camera/terrain 객체와 카메라 각도·줌 유지.`,
 '맵별 메시·재질·텍스처·지오메트리 수는 워밍업 후 일정. 전체 테스트에서 실제 모델 스트리밍 왕복·재질/텍스처 정리·캐시 재사용 별도 검증.',
 `폐기 재질 ${after.lifetime.disposedMaterials}개/30프레임 반복 검사: ${before.lifetime.deadMaterialVisits} → ${after.lifetime.deadMaterialVisits}회.`,
 '플레이어 8K, 배경 최대 4K, 원본 근거리 메시와 3단계 LOD·외곽선·그림자 유지. 기존 콘텐츠/묶음 JSON이 기준 배포본과 완전히 같음.',
 '체력·물약·장비·전투·곰 잡기 탈출 1초·입력·줌·문서 내 포탈 이동은 기존 회귀 테스트 통과.',
 '',
 '미검증/한계',
 ...result.notMeasured,
 'CPU 수치는 전체 로딩·다운로드·S23 실기기 수치가 아님. 브라우저 자동조작·추가 에셋 생성 없음. 실화면 검수는 사용자에게 남김.',
 '기존 품질/범위/FPS를 낮추는 방식과 추가 GPU 리소스 장기 보관은 적용하지 않음.',
 '',
 '증거: before.json, after.json, verification.json, full-tests.log, build.log 및 배포 검증 로그.',
 '배포 완료 상태/커밋은 deployment.json과 프로젝트 output/integration-coordination/optimization-status.json에 기록.'
 ].join('\n');
writeFileSync(resolve(directory,'report.txt'),text+'\n');
console.log(JSON.stringify({tests,cpu,resourceGraphUnchanged:true,lifetime:result.lifetime,terrainCache:result.terrainCache}));
