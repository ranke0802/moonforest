import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
const root=resolve(import.meta.dirname,'..'),reports=resolve(root,'reports/elena-combat-followup');
const output=resolve(process.argv[2]??'C:/Users/ryank/Documents/ChatGPT/MM Project/output/elena-combat-review/2026-10-30');
const read=name=>JSON.parse(readFileSync(resolve(reports,name),'utf8'));
const stress=read('combat-stress.json'),before=read('performance-baseline.json'),after=read('performance-current.json');
const deployment=read('deployment.json'),log=readFileSync(resolve(reports,'full-tests.log'),'utf8');
const total=Number(log.match(/(?:ℹ |# )tests (\d+)/)?.[1]),passed=Number(log.match(/(?:ℹ |# )pass (\d+)/)?.[1]),failed=Number(log.match(/(?:ℹ |# )fail (\d+)/)?.[1]);
if(!total||passed!==total||failed)throw new Error('A complete passing regression log is required');
const head=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
if(deployment.head!==head||deployment.build!=='success'||deployment.deploy!=='success')throw new Error('Deploy evidence must match current HEAD');
const resourceRevision=JSON.parse(readFileSync(resolve(root,'public/assets/resource-index.json'),'utf8')).revision;
const expected='8de9a83147294670ddbc918f781ac71327d303b93467722af9022027f0199ae5';
if(resourceRevision!==expected)throw new Error('This release must preserve all model and texture resources');
const ground=(p)=>p.ground.find(x=>x.pattern==='mixed-five'),oldGround=ground(before),newGround=ground(after);
const comparison={
  navigation:after.navigation.map(current=>({scenario:current.scenario,before:before.navigation.find(x=>x.scenario===current.scenario),after:current})),
  ground:{before:oldGround,after:newGround},
  scope:'Node/NullEngine CPU and engine buffer-object lifetime. Not real GPU driver, S23 frame rate, temperature, or visual certification.'
};
const report={generatedAt:new Date().toISOString(),head,baseline:'b983cfc',resourceRevision,resourceRevisionUnchanged:true,tests:{total,passed,failed},deployment,
  movement:{walkMetresPerSecond:1.05,skitterMetresPerSecond:3.6,chargeMetresPerSecond:5.4,chargeWarningSeconds:.9,chargeContactDamage:0,stationaryDuringCast:true,actualRigContinuousTestSeconds:60},
  lifecycle:stress.replays,spellCaseCount:stress.spellCases.length,comparison,
  preserved:{playerMax:8192,backgroundMax:4096,lod:true,currentModel:'r7-shoulder-led-upper-arm-cast',toon:true,pbr:false,outlinePixels:.5,interiorLine:.2,brightness:1.35},
  limits:{browserAutomation:false,physicalS23Tested:false,gpuFrameTimesMeasured:false},
  futureHandoff:'C:/Users/ryank/Documents/ChatGPT/MM Project/output/integration-coordination/elena-runtime-handoff.json'};
mkdirSync(output,{recursive:true});writeFileSync(resolve(output,'verification.json'),JSON.stringify(report,null,2)+'\n');
for(const name of ['combat-stress.json','performance-baseline.json','performance-current.json','full-tests.log','final-movement-regression.log'])copyFileSync(resolve(reports,name),resolve(output,name));
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ms=v=>v.toFixed(4),rows=comparison.navigation.map(x=>`<tr><td>${x.scenario==='stationary-cast'?'정지 시전':'정지 대기'}</td><td>${ms(x.before.timing.p50Ms)} → ${ms(x.after.timing.p50Ms)}</td><td>${ms(x.before.timing.p95Ms)} → ${ms(x.after.timing.p95Ms)}</td><td>${x.before.callsPerFrame.segmentClear} → ${x.after.callsPerFrame.segmentClear}</td></tr>`).join('');
const url=deployment.url,witchUrl=url+'&elenaReview=battle';
writeFileSync(resolve(output,'index.html'),`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>엘레나 전투·이동 검증</title>
<style>body{margin:0;background:#17151d;color:#e9e3f0;font:16px/1.7 system-ui,sans-serif}main{max-width:1000px;margin:auto;padding:40px 24px}h1,h2{line-height:1.3}h2{margin-top:40px;color:#cfb6ee}a{color:#d0b4ff}table{border-collapse:collapse;width:100%;font-size:14px}th,td{padding:10px;text-align:left;border-bottom:1px solid #45404d}.card{background:#27232e;padding:20px;border-radius:14px;margin:18px 0}.muted{color:#b5adbf}code{overflow-wrap:anywhere}.status{color:#b7e4c5}li{margin:.35em 0}</style><main>
<p class="muted">MOONFOREST · 전사 v5 · ${esc(head.slice(0,7))}</p><h1>엘레나 전투와 이동 개선</h1>
<p class="status">배포 완료 · 전체 ${total}개 자동검사 통과</p><p><a href="${esc(url)}">게임 열기</a> · <a href="${esc(witchUrl)}">엘레나 전투 위치에서 시작</a> · <a href="verification.json">검증 JSON</a></p>
<div class="card"><b>확인 방법</b><p>동굴에서 보스 종류를 ‘비탄의 마녀 엘레나’로 선택하고 소환합니다. 일반 보행과 빠른 횡이동, 바닥 경로를 0.9초 예고한 돌진 뒤 다섯 마법을 순환합니다. 돌진 자체의 접촉 피해는 없고 이후 마법으로 공격합니다. 시전 중에는 현재 공격 모션을 재생하며 멈춥니다.</p></div>
<h2>전투와 생명주기</h2><ul><li>성녀는 공격 사이에 위치를 바꾸고, 마녀는 교전 중 대기 공백 없이 이동과 마법을 번갈아 사용합니다.</li><li>실제 현재 모델로 60초 이동 검사: 보행 1.05, 급속 이동 3.6, 돌진 5.4 m/s. 시전 정지, 벽·단차·거처 경계, 조준 고정과 다섯 마법을 검사했습니다.</li><li>12개 공격 동작/패턴 조합 × 8가지 피격 조건, 총 ${stress.spellCases.length}개 시나리오: 예고 전/후, 경계, 범위 밖, 회피, 방패, 벽, 피격 취소.</li><li>20회 1단계→변신→최종 사망→재시작과 중간 맵 이탈/복귀를 검사했습니다. 최종 처치 20회, 단계별 모델은 각각 1벌입니다.</li><li>이탈 시 중단한 시전은 취소하고 새 예고부터 시작합니다. 돌아오자마자 짧은 예고만 보이고 피해가 발생하던 경로를 수정했습니다.</li><li>종류 선택은 곰·성녀·마녀. 엘레나는 동굴에서 1명만 소환하고, 반복 소환해도 체력·물약·장비는 유지합니다.</li></ul>
<h2>측정한 개선과 한계</h2><p>동일 PC에서 순차 측정한 분리된 CPU 구간입니다. 전체 게임 프레임 시간이나 S23 실측값이 아닙니다.</p>
<table><thead><tr><th>정지 구간</th><th>CPU 중앙값 ms</th><th>CPU p95 ms</th><th>시야 검사 / 프레임</th></tr></thead><tbody>${rows}</tbody></table>
<p>장판 5패턴을 준비한 뒤 200회 교체했을 때 새 버퍼 객체 생성은 위치 400→0, 노멀 400→0, 인덱스 400→0입니다. 현재 캐시 한도는 보스당 7쌍이며 폐기 시 모두 해제합니다. 새 위치 배열과 지형 샘플은 계속 계산합니다.</p>
<p>혼합 장판 생성 CPU 중앙값은 ${ms(oldGround.timing.p50Ms)}→${ms(newGround.timing.p50Ms)} ms, p95는 ${ms(oldGround.timing.p95Ms)}→${ms(newGround.timing.p95Ms)} ms로 증가했습니다. CPU 전체가 빨라졌다고 주장하지 않습니다. 이번 장판 변경의 목적은 버퍼 생성·폐기 반복을 줄이는 것이며 실제 GPU 드라이버 효과는 미측정입니다.</p>
<p>20회 반복 후 scene의 메시 ${stress.replays.final.meshes}개·geometry ${stress.replays.final.geometries}개·재질 ${stress.replays.final.materials}개가 준비 이후 동일하게 유지됐습니다. 준비 이후 Node 힙 차이는 ${(stress.replays.heap.delta/1024).toFixed(1)} KiB입니다. 이 제한된 검사에서는 지속적인 자원 수 증가가 관찰되지 않았으며 브라우저의 전체 메모리나 장시간 누수 부재를 보증하지 않습니다.</p>
<h2>화질·리소스·후속 모션</h2><p>플레이어 8K, 배경 최대 4K, 기존 LOD와 카툰·PBR 해제·외곽선 0.50px·내부선 0.20·밝기 1.35를 유지했습니다. 모델/텍스처 JSON revision은 변경되지 않았으므로 코드 변경 때문에 기존 리소스를 다시 받을 필요가 없습니다.</p><p><code>${resourceRevision}</code></p>
<p>현재 r7 모델로 배포했습니다. 다른 채팅에서 완성 모션을 인계하면 클립·리깅·보정키를 검증하고 현재 게임 AI에 통합한 뒤 동일 절차로 배포합니다. 사용 중인 리소스는 보존하고 더 이상 참조하지 않는 구버전만 게시 목록에서 정리합니다.</p>
<p class="muted">추가 생성·브라우저 자동조작 없음. 실기기 S23의 최종 외형, 프레임·발열은 사용자 화면 검수가 필요합니다.</p>
<p><a href="combat-stress.json">반복 전투</a> · <a href="performance-baseline.json">성능 이전</a> · <a href="performance-current.json">성능 현재</a> · <a href="full-tests.log">전체 검사 로그</a></p></main></html>`);
console.log(JSON.stringify({output,head,tests:total,resourceRevision}));
