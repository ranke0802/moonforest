import {readFile,writeFile,copyFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const root=resolve(import.meta.dirname,'..'),dir=resolve(root,'reports/elena-two-phase');
const out=resolve('C:/Users/ryank/Documents/ChatGPT/MM Project/output/elena-two-phase-review/2026-10-30');
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const baseline='8560c82',revision=process.argv[2]??'pending',deployed=process.argv.includes('--deployed');
const [asset,cpu,index]=await Promise.all([read(resolve(dir,'asset-pack-report.json')),read(resolve(dir,'animation-benchmark.json')),read(resolve(root,'public/assets/resource-index.json'))]);
const previous=JSON.parse(execFileSync('git',['show',baseline+':ArcherPreviewSite/assets/resource-index.json'],{cwd:root,encoding:'utf8',maxBuffer:8e6}));
const preserved=[];
for(const name of ['warrior-v3','warrior-v3-ios','village','village-ground','monster-forest','monster-forest-ground','witch-cave','witch-cave-ground','sky','audio']){
  const old=JSON.parse(execFileSync('git',['show',baseline+':ArcherPreview/public/assets/'+name+'.json'],{cwd:root,encoding:'utf8',maxBuffer:8e6}));
  assert.deepEqual(await read(resolve(root,'public/assets',name+'.json')),old,name+' must remain unchanged');preserved.push(name);
}
const added=Object.keys(index.files).filter(n=>previous.files[n]===undefined),removed=Object.keys(previous.files).filter(n=>index.files[n]===undefined);
const kept=Object.keys(previous.files).filter(n=>index.files[n]!==undefined);
for(const name of kept)assert.equal(index.files[name],previous.files[name]);
const testText=await readFile(resolve(dir,'full-tests.log'),'utf8'),passed=Number(testText.match(/pass (\d+)/)?.[1]),failed=Number(testText.match(/fail (\d+)/)?.[1]);
assert.equal(failed,0);assert.ok(passed>=522);
const summary={baseline,revision,deployed,resourceRevision:index.revision,tests:{passed,failed},preservedManifests:preserved,resources:{kept:kept.length,added:added.length,removed:removed.length,addedBytes:added.reduce((n,k)=>n+index.files[k],0),removedBytes:removed.reduce((n,k)=>n+previous.files[k],0)},
  phase1:{name:'타락한 성녀 엘레나',hp:1200,attackMotions:7},phase2:{name:'비탄의 마녀 엘레나',hp:1800,attackMotions:1,patterns:5},
  performance:{cpuMeanBefore:cpu.animationGroups.meanMs,cpuMeanAfter:cpu.optimized.meanMs,cpuP95Before:cpu.animationGroups.p95Ms,cpuP95After:cpu.optimized.p95Ms,triangles:143132,bodyDraws:3,outlineDraws:3,shadowDrawsPerMap:3,colorMemory:asset.textureMemory,morphTextureEstimateBytes:14417920,boneTextureEstimateBytes:16448,retainedMorphCopies:1},
  limits:{browserAutomation:false,newAIGeneration:false,physicalS23:false,gpuFrameTimeMeasured:false,offlineRuntimePoseRender:true,browserSavedSettingsRead:false}};
await writeFile(resolve(dir,'verification.json'),JSON.stringify(summary,null,2));await mkdir(out,{recursive:true});
for(const file of ['runtime-review-three-views.png','runtime-review-motion-sheet.png','asset-texture-comparison-sheet.png','animation-benchmark.json','verification.json','asset-review-report.json'])await copyFile(resolve(dir,file),resolve(out,file));
const url='https://ranke0802.github.io/moonforest/ArcherPreviewSite/?character=warrior-v5&rev='+revision;
const mb=n=>(n/1e6).toFixed(2),ms=n=>n.toFixed(3),tr=(a,b,c)=>`<tr><th>${a}</th><td>${b}</td><td>${c}</td></tr>`;
const html=`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>엘레나 · 2단계 보스 통합 검수</title><style>body{margin:0;background:#16161c;color:#e9e5ed;font:16px/1.75 system-ui,sans-serif}main{max-width:1040px;margin:auto;padding:36px 24px}h1,h2{line-height:1.3}h1{font-size:32px}h2{margin-top:40px;color:#cfb7e3}p{color:#cbc6d0}a{color:#dcbeff}.links{display:flex;flex-wrap:wrap;gap:12px}.links a{padding:10px 16px;border:1px solid #756382;border-radius:8px;text-decoration:none}table{width:100%;border-collapse:collapse;font-size:14px}th,td{padding:10px;text-align:left;border-bottom:1px solid #45404b}th{color:#e0d4ea}img{width:100%;border-radius:10px;background:#202028}small{color:#b9afc5}.badge{display:inline-block;padding:3px 10px;background:#384740;border-radius:6px}li{margin:6px 0}.note{padding:16px;background:#25232d;border-left:3px solid #ae8fca}</style><main>
<span class="badge">${deployed?'배포 · 온라인 파일 검증 완료':'배포 검증 대기'} · ${revision}</span><h1>타락한 성녀에서<br>비탄의 마녀로</h1><p>전사 v5의 기존 주인공과 동굴을 유지하고, 엘레나에게 2단계 전투를 연결했습니다. 원본 리깅·모핑을 보존했으며 추가 AI 에셋 생성은 없습니다.</p>
<div class="links"><a href="${url}">전사 v5 플레이</a><a href="${url}&elenaReview=battle">거처 앞에서 전투 검수</a><a href="${url}&elenaReview=witch">마녀 동작 직접 검수</a><a href="${url}&elenaReview=saint">성녀 동작 직접 검수</a></div>
<p>동작 검수: WASD/스틱 이동 · 좌클릭/J/공격 버튼 시전 · 기존 방식으로 카메라 회전. 마녀는 5패턴, 성녀는 7공격 모션을 순환합니다. 일반 플레이에서는 계속 전사를 조작합니다.</p>
<h2>전투와 외형</h2><ul><li>타락한 성녀 엘레나: HP 1,200. 6개 시전과 회전 공격 모션까지 모두 마법으로 사용.</li><li>1단계 쓰러짐 후 비탄의 마녀 엘레나: HP 1,800. 3초짜리 시전 동작으로 직선·부채꼴·고리·십자·다중 원형 공격.</li><li>최소 1초 예고. 마녀는 1.65초에 판정. 예고 조준 고정, 장판과 피격 계산 공유, 회피·방패·차폐 적용.</li><li>시전 중 이동 정지. 종료 후 보행 복귀. 기도 팔·손, 머리카락, 호흡, 시전 보정키, 회전 징표와 중력 천 유지.</li><li>카툰 / PBR 끔 / 외곽선 0.50px / 내부선 0.20 / 밝기 1.35. 정식 마법 이펙트는 아직 추가하지 않음.</li></ul>
<h2>실제 게임용 포즈 검수</h2><img src="runtime-review-three-views.png" alt="게임용 애니메이터에서 추출한 정면 측면 후면"><img src="runtime-review-motion-sheet.png" alt="보행 시전 복귀 포즈"><p class="note">게임용 애니메이터의 실제 모프·스키닝 좌표를 추출해 게임과 유사한 카메라로 오프라인 렌더했습니다. 얼굴·손·관절·실루엣 검사용이며, Babylon GPU 셰이더의 최종 화면 캡처는 아닙니다.</p>
<h2>성능 비교</h2><p>같은 PC에서 600프레임 예열 후 1,800프레임 측정. 기존 애니메이션 그룹 방식과 동일한 포즈를 계산하는 전용 샘플러를 비교했습니다. 수치는 CPU 애니메이션 처리 시간이며 전체 GPU 프레임 시간이나 S23 FPS가 아닙니다.</p>
<table><thead><tr><th>항목</th><th>전</th><th>후</th></tr></thead><tbody>${tr('CPU 평균',ms(cpu.animationGroups.meanMs)+' ms',ms(cpu.optimized.meanMs)+' ms')}${tr('CPU 상위 5% 경계',ms(cpu.animationGroups.p95Ms)+' ms',ms(cpu.optimized.p95Ms)+' ms')}${tr('모델 다운로드',mb(asset.source.bytes)+' MB',mb(asset.runtime.bytes)+' MB')}${tr('삼각형', '143,132','143,132 · 감량 없음')}${tr('동일 외형 기준 예상 패스','본체 3 + 외곽선 3 + 그림자 맵당 3','동일 · 장판은 시전 중 2회')}${tr('색상 GPU 메모리 추정','RGBA8+밉 85.33 MiB','ETC1S 변환 대상에 따라 10.67~21.33 MiB')}${tr('모프 텍스처 복제안 비교','템플릿+복제본 27.50 MiB','단일 상주 인스턴스 13.75 MiB')}</tbody></table>
<p>뼈 텍스처 추정 16.06 KiB. GPU 수치는 포맷/버퍼 계산이며 기기 실측이 아닙니다. 4K 텍스처 PSNR 40.88dB. 자동 리깅·재가중치·정점 감량·얼굴/손 LOD는 적용하지 않았습니다. 멀리 있는 비전투 보스만 애니메이션 갱신을 30/15Hz로 줄입니다.</p>
<img src="asset-texture-comparison-sheet.png" alt="4K 원본과 ETC1S 텍스처 비교">
<h2>검증과 보존</h2><p>${passed}개 자동테스트 통과. 반복 보행→시전→복귀, 재전투, 12회 단계 유지 왕복, 지연 로딩 중 이탈, 장판 단일 판정, 스킨·모프 외곽선 셰이더를 확인했습니다. 원본 935 accessor와 945 buffer view가 압축 해제 후 바이트 단위로 일치합니다. 기도 손 정점에 모프 변위가 없음을 검사했습니다.</p>
<p>플레이어 8K 및 마을·숲·동굴·지면·하늘·음향 JSON ${preserved.length}개가 기준 커밋과 동일합니다. 기존 콘텐츠 ${kept.length}개 재사용, 신규 ${added.length}개 ${mb(summary.resources.addedBytes)} MB, 사용하지 않는 구버전 ${removed.length}개는 현재 배포 그래프에서 제외됩니다. 성녀는 동굴 시작, 광폭화 모델은 교전 중 준비하며 왕복 재사용합니다.</p>
<h2>수정 파일과 남은 확인</h2><p>boss-battle / boss-models / boss-encounter: 단계 전환·단일 모델 수명·공통 연결. elena-spec / elena-encounter / elena-ground-magic: 마법 AI·장판·판정. mourning-elena-animation / mourning-elena-encounter: 새 리깅과 모핑 이식. character-outlines: 스킨·모프 외곽선. main / styles: 검수 입력·진입점·보스 이름. pack 스크립트 / JSON / README / 자동테스트도 갱신했습니다.</p>
<p class="note">브라우저 자동조작과 실제 S23 GPU 검수는 하지 않았습니다. 사용자가 저장한 로컬 브라우저 설정을 자동으로 읽지 않았고, 제공된 기준값과 검수 소스의 설정을 적용했습니다. 최종 색감·외곽선·실기기 FPS/발열은 위 플레이 링크에서 확인이 필요합니다.</p>
<p><a href="verification.json">검증 JSON</a> · <a href="animation-benchmark.json">CPU 측정 원자료</a> · <a href="asset-review-report.json">원본·압축 검증</a></p><small>기준 ${baseline} · resource revision ${index.revision}</small></main></html>`;
await writeFile(resolve(out,'index.html'),html);console.log(JSON.stringify({report:resolve(out,'index.html'),...summary.resources,tests:summary.tests}));
