import json,re,hashlib,subprocess,html
from pathlib import Path
from datetime import datetime,timezone

folder=Path(__file__).resolve().parent
app=folder.parents[1]
source=Path('C:/Users/ryank/.codex/attachments/bfdfbe05-7100-4ab9-9a03-fe7c2f490dbf/붙여넣은 텍스트.txt')
log=json.loads(source.read_text(encoding='utf-8-sig'))
bench=json.loads((folder/'collision-comparison.json').read_text())
tests=(folder/'all-tests.txt').read_text(encoding='utf-8-sig')
passed=int(re.findall(r'pass (\d+)',tests)[-1]); failed=int(re.findall(r'fail (\d+)',tests)[-1]);assert not failed
final_tests=(folder/'final-model-preparation.txt').read_text(encoding='utf-8-sig');final_passed=int(re.findall(r'pass (\d+)',final_tests)[-1]);assert int(re.findall(r'fail (\d+)',final_tests)[-1])==0
hidden=json.loads((app/'reports/elena-transform-performance-2026-11-02/hidden-preparation-validation.json').read_text())
(folder/'hidden-preparation-validation.json').write_text(json.dumps(hidden,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
index=json.loads((app/'public/assets/resource-index.json').read_text())
baseline=json.loads(subprocess.check_output(['git','show','e9dcaf0:ArcherPreviewSite/deployment-files.json'],cwd=app,text=True,encoding='utf-8'))
assert index['revision']==baseline['resourceRevision']
case=[e for e in log['recentDelays'] if e['frameMs']>=100 or e['jsSubmitMs']>=100]
report={'generatedAt':datetime.now(timezone.utc).isoformat(),'sourceLog':{'createdAt':log['createdAt'],'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'bundle':log['bundle'],'note':'Old capture before approved model reductions, not a post-fix measurement.'},'sourceSummary':log['summary'],'sourceLoading':log['loading'],'sourceStalls':case,'sourceTransform':{k:log['bossComparison'].get(k) for k in ['prepareMs','during','after','delta','cameraChanged','positionChanged']},'tests':{'passed':passed,'failed':failed,'browserAutomation':False},'collisionBenchmark':bench,'quality':{'resourceRevision':index['revision'],'unchangedFrom':'e9dcaf0','player':'8K','background':'max4K','LOD':'unchanged','newGeneration':False},'limits':['NullEngine tests do not measure real GPU compilation, S23 temperature or device FPS.','Source capture GPU timer unsupported; sceneMs does not prove GPU duration.','Only bounded recent delays are retained, not every frame in the session.','No claim that all physical-device 100-250ms pauses are eliminated.']}
(folder/'analysis.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
warm=next(r for r in hidden['reports'] if r['case']=='warm-transform')
speed=100*(1-bench['afterMedianMs']/bench['beforeMedianMs'])
page=f'''<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>전투·모델 준비 지연 점검</title><style>body{{margin:0;background:#12171c;color:#e8e9e6;font:16px/1.75 system-ui,sans-serif}}main{{max-width:1040px;margin:auto;padding:40px 24px}}h1{{font-size:30px}}h2{{font-size:21px;margin-top:34px;color:#c8d7ad}}table{{border-collapse:collapse;width:100%;font-size:15px}}td,th{{padding:13px;border:1px solid #41484b;text-align:left;vertical-align:top}}.note{{padding:18px;background:#222d32;border-left:4px solid #9bb287}}a{{color:#bbd4ed}}small{{color:#b3bdc5}}code{{word-break:break-all}}li{{margin:9px 0}}</style><main>
<small>MOONFOREST · 2026-11-02 · 코드 및 실제 리그 자동 검증</small><h1>모델 준비·전투 중 멈춤과 입력 회귀 점검</h1>
<p class="note">전체 {passed:,}개 검사와 마지막 성녀 준비 분할 수정의 관련 {final_passed}개 검사 통과. 플레이어 8K·배경 최대 4K·승인 감량 모델·기존 LOD를 유지했습니다. 브라우저 자동조작 및 추가 에셋 생성은 하지 않았습니다.</p>
<h2>진단 로그 평가</h2><p>첨부 기록은 2026-11-02 08:57 KST에 수집된 <code>{html.escape(log['bundle'])}</code>입니다. 이후 적용한 승인 감량 모델과 이번 수정의 실기기 결과로 취급하지 않았습니다. 마지막 10초는 약 30.2FPS, p95 33.9ms로 안정적이지만, 전체 전투에는 짧고 큰 멈춤이 남아 있습니다.</p>
<table><tr><th>구간</th><th>확인한 수치</th><th>대응과 판단</th></tr>
<tr><td>최초 모델 준비</td><td>총 7.29초 / 모델 5.73초<br>새 다운로드 약 81KB, 캐시 약 84.8MB</td><td>네트워크 용량만으로 설명되지 않습니다. 비탄의 마녀에만 적용되던 준비 분할을 1단계 성녀에도 적용했고, 모델 재사용을 재검증했습니다. 그림자/장판 셰이더도 숨긴 준비에 포함했습니다. 실제 기기 GPU 업로드 한 번의 지연까지 분할됐다고 주장하지 않습니다.</td></tr>
<tr><td>광폭화 전환</td><td>준비 중 최대 CPU 약 228ms<br>등장 후 최대 프레임 간격 234.6ms</td><td>준비된 인스턴스·모핑·외곽선 재사용, 취소/재진입을 검증했습니다. 현재 실제 리그 검사에서 준비 후 전환은 새 정점 검사·본체 셰이더 준비 호출 없이 완료됐습니다.</td></tr>
<tr><td>사망 시작</td><td>190.3초: CPU 214.4ms, scene 210.2ms<br>다음 프레임 간격 217.5ms</td><td>두 기록은 앞 작업과 다음 간격으로 연결될 수 있으며 별도 2회 멈춤으로 단정하지 않았습니다. 기존 투명 사망 변형 준비를 유지하고, 그림자 패스 준비 누락과 장판 렌더 큐 전환을 제거했습니다. 이 로그만으로 210ms의 정확한 드라이버/GC 원인을 확정할 수는 없습니다.</td></tr>
<tr><td>반복 전투·사망 진행</td><td>50~90ms 지연도 여러 회<br>GPU 계측 미지원</td><td>충돌 계산의 임시 배열을 줄였고, 엘레나에게 보이지 않는 기존 원형 예고 갱신을 생략했습니다. 긴 현재 CPU 작업도 즉시 진단에 기록해 다음 프레임의 원인으로 잘못 읽지 않게 했습니다.</td></tr></table>
<h2>이전 요청 반영</h2><ul>
<li><b>화면 버튼 강공격:</b> 회피/방패 밀치기 중 충전 완료·해제·포인터 캡처 해제 순서를 15/30/60FPS로 검사했습니다. 완료된 예약이 버튼의 캡처 해제 또는 방패 회복 중 일반 피격으로 지워지는 경로를 수정했고, HUD 내부 포인터 이동의 잘못된 창 이탈 취소를 방지했습니다. 미완료 충전 취소가 일반 공격으로 바뀌지 않으며, 실제 창 이탈/일시정지/강제 넘어짐/잡기/차단 경직의 취소는 유지합니다.</li>
<li><b>보스 시전 중 피격:</b> 공격 모션으로 높아지는 몸통 아래에 제한된 근접 판정도 유지합니다. 실제 무기 궤적·유효 타격 시간·벽 차단·1회 피해 제한은 유지합니다. 일반 검 공격은 보스 기술을 끊지 않고 피해와 흰 피격을 적용합니다.</li>
<li><b>쓰러진 적의 숫자:</b> 머리 대신 해당 적의 움직이는 몸통 위를 따라갑니다. 맵 퇴장·재소환 시 이전 숫자를 정리합니다. Critical 문구·연속 상승·원래 연타 오프셋을 유지합니다.</li></ul>
<h2>측정한 개선과 한계</h2><table><tr><th>항목</th><th>결과</th></tr><tr><td>충돌 계산 12,000사례 · 7회 교대 실행 중앙값</td><td>이전 {bench['beforeMedianMs']:.1f}ms → 현재 {bench['afterMedianMs']:.1f}ms (약 {speed:.1f}% 감소). 모든 명중 결과 동일.</td></tr><tr><td>실제 모델 전환 검사</td><td>이미 준비된 변신 전환 {warm['handoffDesktopMs']:.2f}ms. 데스크톱 NullEngine 값이며 S23 프레임 수치가 아닙니다.</td></tr><tr><td>검증 범위</td><td>실제 감량 리그의 시전 36자세, 보행/공격/사망, 장판 피해·회피·벽, 준비 취소·타임아웃·재시도·맵 왕복, 리소스 수 제한, 입력/표시 회귀 검사.</td></tr><tr><td>화질·다운로드 보존</td><td>리소스 revision이 e9dcaf0과 동일. 모델·텍스처·LOD를 다시 만들거나 낮추지 않았습니다.</td></tr></table>
<p class="note">실기기에서 100~250ms 멈춤이 전부 사라졌다는 판정은 아직 할 수 없습니다. GPU 계측이 없는 예전 로그와 브라우저 없는 CPU 검사는 드라이버·실제 발열까지 검증하지 못합니다. 새 진단의 <code>trigger</code>는 이전 프레임 간격과 현재 긴 CPU 작업을 구분합니다.</p>
<p><a href="analysis.json">구조화된 분석</a> · <a href="collision-comparison.json">충돌 계산 비교</a> · <a href="hidden-preparation-validation.json">모델 준비·취소·왕복 검사</a> · <a href="all-tests.txt">전체 검사 기록</a></p></main></html>'''
(folder/'index.html').write_text(page,encoding='utf-8')
print(json.dumps({'passed':passed,'report':str(folder/'index.html'),'resourceRevision':index['revision']}))
