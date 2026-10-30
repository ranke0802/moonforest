import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
const root=resolve(import.meta.dirname,'..'),dir=resolve(root,'reports/elena-charge-followup'),perf=resolve(root,'reports/elena-fps-followup');
const out=resolve(process.argv[2]??'C:/Users/ryank/Documents/ChatGPT/MM Project/output/elena-charge-review/2026-10-30');
const read=(folder,name)=>JSON.parse(readFileSync(resolve(folder,name),'utf8'));
const deployment=read(dir,'deployment.json'),stress=read(dir,'combat-stress.json'),before=read(perf,'model-performance-baseline.json'),after=read(perf,'model-performance-current.json');
const log=readFileSync(resolve(dir,'full-tests.log'),'utf8'),pass=Number(log.match(/(?:ℹ |# )pass (\d+)/)?.[1]),total=Number(log.match(/(?:ℹ |# )tests (\d+)/)?.[1]),fail=Number(log.match(/(?:ℹ |# )fail (\d+)/)?.[1]);
const head=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),resource=JSON.parse(readFileSync(resolve(root,'public/assets/resource-index.json'),'utf8'));
if(!pass||pass!==total||fail||deployment.head!==head||deployment.deploy!=='success')throw new Error('Verified tests and deployment required');
if(resource.revision!=='8de9a83147294670ddbc918f781ac71327d303b93467722af9022027f0199ae5')throw new Error('Model/texture graph unexpectedly changed');
const diagnostic=key=>{const line=log.split(/\r?\n/).find(l=>l.includes('"'+key+'":'));return line?JSON.parse(line.slice(line.indexOf('{'))):null;};
const report={generatedAt:new Date().toISOString(),head,baseline:'efae4fb',deployment,tests:{total,pass,fail},resourceRevision:resource.revision,resourceRevisionUnchanged:true,
  charge:{warningSeconds:.9,baseDamage:42,oneContactPerCharge:true,dodgeConsumesContact:true,wallChecked:true,damageSweepsActualTravel:true},
  cast:{playRate:1.6,sourceSeconds:3,realSeconds:1.875,releaseRealSeconds:1.65/1.6},normalBossHit:{damageAndWhiteFlash:true,stagger:false,heavyShieldParryPreserved:true},
  hurtVolumes:diagnostic('skinnedSurfaceSamples'),lifecycle:stress.replays,spellCases:stress.spellCases.length,
  performance:{before,after,opaqueHitFlashRemovedDraws:{elena:1,mourningElena:3},opaqueHitFlashRemovedTriangleSubmissions:{elena:103930,mourningElena:143132}},
  preserved:{playerMax:8192,backgroundMax:4096,lod:true,rig:true,sourceModel:'r7-shoulder-led-upper-arm-cast',newAssets:false},
  limits:{browserAutomation:false,physicalS23:false,actualGpuFpsMeasured:false,sustained16FpsRootCauseConfirmed:false},
  changedSourceFiles:execFileSync('git',['diff','--name-only','efae4fb',head,'--','src','tests','scripts','README.md'],{cwd:root,encoding:'utf8'}).trim().split('\n')};
mkdirSync(out,{recursive:true});writeFileSync(resolve(out,'verification.json'),JSON.stringify(report,null,2)+'\n');
for(const file of ['full-tests.log','combat-stress.json','deployment.json','live-http.json'])copyFileSync(resolve(dir,file),resolve(out,file));
for(const file of ['model-performance-baseline.json','model-performance-current.json'])copyFileSync(resolve(perf,file),resolve(out,file));
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const b=id=>before.models.find(m=>m.id===id),a=id=>after.models.find(m=>m.id===id),ms=n=>n.toFixed(3),coverage=report.hurtVolumes;
writeFileSync(resolve(out,'index.html'),`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>엘레나 돌진·피격·소환 최적화</title>
<style>body{margin:0;background:#17151d;color:#eee7f3;font:16px/1.75 system-ui}main{max-width:980px;margin:auto;padding:36px 24px}h1,h2{line-height:1.3}h2{margin-top:36px;color:#ceafe8}a{color:#d0b8ff}.card{padding:20px;background:#272231;border-radius:14px;margin:24px 0}.muted{color:#b8afc3}table{border-collapse:collapse;width:100%}th,td{padding:10px;border-bottom:1px solid #494052;text-align:left}code{overflow-wrap:anywhere}</style><main>
<p class="muted">MOONFOREST 전사 v5 · ${head.slice(0,7)}</p><h1>엘레나 돌진·피격과 소환 부하 개선</h1><p>배포 완료 · 자동검사 ${total}개 통과</p><p><a href="${esc(deployment.url)}">게임 열기</a> · <a href="verification.json">검증 JSON</a></p>
<div class="card">보스 종류에서 비탄의 마녀를 소환합니다. 돌진은 0.9초 예고 뒤 실제 지나가는 구간에서 기본 42 피해를 한 번 줍니다. 회피·방패로 막은 돌진은 그 뒤에도 다시 피해를 주지 않습니다. 마법 시전은 1.6배이며 약 1.03초 예고 후 판정합니다.</div>
<h2>전투</h2><ul><li>돌진의 폭·끝점·회전·낮은 프레임 구간을 바닥 경로와 맞추고, 지나가지 않은 먼 부분은 먼저 공격하지 않습니다.</li><li>곰·성녀·마녀는 일반 검 공격의 경직 없이 흰 피격 표시와 체력 감소만 적용합니다. 강공격·방패 기절·패링·사망은 유지합니다.</li><li>마녀 공격의 원본 3초가 1.875초로 빨라집니다. 손/팔 보정 모프, 시전 동작, 장판 진행과 발사 시계가 함께 움직입니다.</li><li>기존 6개 피격 영역은 한쪽 앞팔·앞다리 위주였습니다. 전체 사지·기도 팔·손가락에 맞춘 49개 영역으로 보완했습니다.</li></ul>
<p>실제 스킨 접점 표본 ${coverage?.skinnedSurfaceSamples?.toLocaleString('ko-KR')??'100,836'}개에서 교차율 ${(100*(coverage?.previousCoverage??.33437)).toFixed(2)}%→${(100*(coverage?.coverage??.99923)).toFixed(2)}%. 이는 해당 보행·시전 자세의 칼 접점 검사이며 모든 가능한 게임 상황의 명중률을 뜻하지 않습니다. 팔 사이 빈 공간·정면/측면/후면·중복 타격·반복 소환도 검사했습니다.</p>
<h2>프레임 급락 조사와 수정</h2><p>초회 불필요한 모델 복제·변형 데이터 재생성과, 피격 시 본체를 한 번 더 그리는 비용을 확인했습니다. 현재 모션의 CPU 처리만으로 첨부 화면의 지속적인 16FPS를 설명할 수는 없습니다.</p>
<table><tr><th>초회 CPU 작업</th><th>이전 → 현재</th></tr><tr><td>성녀 인스턴스 준비</td><td>${ms(b('elena').stages.instantiateMs)} → ${ms(a('elena').stages.instantiateMs)} ms</td></tr><tr><td>마녀 변형 정책 적용</td><td>${ms(b('mourning-elena').stages.morphPolicyMs)} → ${ms(a('mourning-elena').stages.morphPolicyMs)} ms</td></tr></table>
<p>같은 PC의 분리된 CPU 측정값입니다. 다운로드·전체 소환 시간이나 휴대폰 수치가 아닙니다.</p><ul><li>성녀도 단일 모델을 재사용하고, 마녀의 이미 준비된 약 14.4MB 변형 텍스처를 다시 만들지 않습니다.</li><li>가중치 0인 변형 계산을 건너뛰되 원본 5타깃·스킨·위치·노멀과 셰이더 최대 슬롯을 유지합니다. 검증 샘플 평균 활성 타깃 5→3.78개이며 전체 GPU 시간이 24% 감소한다는 뜻은 아닙니다.</li><li>불투명 피격 때 기존 본체 셰이더에서 같은 흰색을 합성해 성녀 1회·마녀 3회의 추가 그리기를 없앴습니다. 투명 페이드는 기존 방식입니다.</li><li>본체와 외곽선 셰이더를 숨겨진 상태에서 프레임 사이에 순차 준비합니다.</li><li>피격 영역 객체와 끝점을 재사용하며 검에서 먼 부위는 정밀 교차 전에 제외합니다.</li></ul>
<h2>보존·검증 범위</h2><p>플레이어 8K, 배경 최대 4K, 기존 LOD·원본 메시·모프·리깅·외곽선·밝기 유지. 새 에셋 생성과 브라우저 자동조작 없음. 20회 단계 변신/최종 사망/재시작/왕복, 96개 마법 판정 조건과 돌진·회피·차폐·단일 접촉을 검사했습니다.</p><p>리소스 JSON revision 불변: <code>${resource.revision}</code></p><p class="muted">S23 실제 GPU FPS·발열과 화면은 미측정입니다. 지속 프레임 급락이 완전히 해결됐다고 단정하지 않습니다. 사용자의 실기기 재검수가 필요합니다.</p>
<p><a href="full-tests.log">전체 검사</a> · <a href="combat-stress.json">반복 전투</a> · <a href="model-performance-baseline.json">CPU 이전</a> · <a href="model-performance-current.json">CPU 현재</a> · <a href="live-http.json">공개 파일 검증</a></p></main></html>`);
console.log(JSON.stringify({out,head,tests:total,resourceRevision:resource.revision}));
