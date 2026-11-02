import html,json,re,shutil,subprocess
from pathlib import Path

report=Path(__file__).resolve().parent
app=report.parents[1];repo=app.parent
out=Path('C:/Users/ryank/Documents/ChatGPT/MM Project/output/repeated-work-optimization/2026-11-03')
out.mkdir(parents=True,exist_ok=True)
def read(path):return json.loads(path.read_text(encoding='utf-8-sig'))
def esc(value):return html.escape(str(value))
log=(report/'all-tests.log').read_text(encoding='utf-8-sig')
counts={k:int(re.search(r'ℹ '+k+r' (\d+)',log).group(1)) for k in ['tests','pass','fail','cancelled']}
assert counts['tests']==counts['pass'] and counts['fail']==counts['cancelled']==0
navigation=read(report/'navigation-validation.json');assert navigation['passed']
combat=read(report/'combat-validation.json');assert all(c.get('equal',True) for c in combat['cases'])
candidates=read(report/'four-map-candidates.json')
cpu=read(report/'four-map-cpu.json')
baseline=json.loads(subprocess.check_output(['git','show','9ca3561:ArcherPreviewSite/assets/resource-index.json'],cwd=repo))
resources=read(repo/'ArcherPreviewSite/assets/resource-index.json');assert baseline==resources
unchanged=['src/input.js','src/warrior-v2.js','src/player-strikes.js','src/village-lod.js','src/village-shadow-policy.js','src/witch-cave-navigation.js']
assert not subprocess.check_output(['git','diff','9ca3561','--',*[f'ArcherPreview/{p}' for p in unchanged]],cwd=repo)
live=read(report/'live-verification.json') if (report/'live-verification.json').exists() else {}
rev=live['commit'][:7] if live.get('passed') else ''
status='배포 완료 · '+rev if rev else '검증 완료 · 배포 확인 중'
names={'village':'마을','great-plains':'대평원','monster-forest':'마물의 숲','witch-cave':'마녀의 동굴'}
rows=''
for c in candidates['cases']:
    if not c['touch']:continue
    before=c['baselineNarrowChecks']
    rows+=f'<tr><th>{names[c["map"]]} {int(c["scale"]*100)}%</th><td>{c["steps"]}장면</td><td>{before:,} → {c["demandNarrowCandidates"]:,}</td><td>{before:,} → {c["shadowNarrowCandidates"]:,}</td><td>선택·순서 동일</td></tr>'
navrows=''
for c in navigation['cases']:
    if c['case']!='cell-requests-and-informational-CPU':continue
    navrows+=f'<tr><th>{names[c["map"]]}</th><td>{c["queries"]}</td><td>{c["baselineCellRequests"]:,} → {c["optimizedCellRequests"]:,}</td><td>{c["reduction"]*100:.1f}% 감소</td></tr>'
combatrows=''
for c in combat['cases']:
    if 'baseline' not in c or 'optimized' not in c:continue
    before,after=c['baseline'],c['optimized']
    combatrows+=f'<tr><th>{names.get(c.get("map"),c.get("map","—"))}</th><td>{esc(c["scenario"])} / {c["frames"]}프레임</td><td>{before["constrain"]} → {after["constrain"]}</td><td>{before["place"]} → {after["place"]}</td><td>{before["playerMatrix"]} → {after["playerMatrix"]}</td><td>동일</td></tr>'
cpurows=''
for c in cpu['results']:
    if not c['touch'] or c['overview']:continue
    m=c['medianMs']
    cpurows+=f'<tr><th>{names[c["map"]]} {int(c["scale"]*100)}%</th><td>{m["demandBefore"]:.2f} → {m["demandAfter"]:.2f}ms</td><td>{m["shadowBefore"]:.2f} → {m["shadowAfter"]:.2f}ms</td></tr>'
summary={'baseline':'9ca3561','tests':counts,'navigation':navigation['summary'],'combatCases':len(combat['cases']),
 'resourceGraphUnchanged':True,'resourceRevision':resources['revision'],'inputAndNarrowPhaseFilesUnchanged':unchanged,
 'browserAutomation':False,'physicalDeviceTested':False,'deployment':live if live.get('passed') else {'status':'pending'},
 'notes':['Candidate counts exclude the cheap flag pass and cell selection overhead; they are not total loop counts.',
 'Local paired CPU timing is not phone FPS/GPU/thermal measurement.',
 'Combat oracle uses actual maps and SDK with synthetic animated rigs; shipped-asset regressions are in the full suite.']}
(report/'validation-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
evidence=['validation-summary.json','spatial-summary.json','four-map-candidates.json','four-map-cpu.json','navigation-validation.json','combat-validation.json','independent-review.json']
for name in evidence:shutil.copy2(report/name,out/name)
links=' · '.join(f'<a href="{name}">{name}</a>' for name in evidence)
url=lambda character:'https://ranke0802.github.io/moonforest/ArcherPreviewSite/?character='+character+'&uiTest=1'+('&rev='+rev if rev else '')
page=f'''<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>풍경·충돌·포즈 반복 작업 최적화</title><style>
*{{box-sizing:border-box}}body{{margin:0;background:#111914;color:#e7eee4;font:16px/1.8 system-ui,sans-serif}}main{{max-width:1120px;margin:auto;padding:36px 24px 70px}}h1{{font-size:36px;line-height:1.35}}h2{{margin:38px 0 10px;font-size:25px;color:#c9dca8}}h3{{font-size:19px}}a{{color:#dfc792}}small,.muted{{color:#aebcab}}.status{{padding:20px;background:#223024;border:1px solid #52684a;border-radius:10px}}.table{{overflow:auto}}table{{width:100%;border-collapse:collapse;font-size:14px}}td,th{{padding:12px 10px;border-bottom:1px solid #37463b;text-align:left;vertical-align:top}}th{{color:#c9dca8}}li{{margin:8px 0}}details{{margin:18px 0}}summary{{cursor:pointer;color:#c9dca8}}pre{{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}}.metrics{{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:22px 0}}.metrics div{{padding:18px;background:#1b281f;border-radius:9px}}strong{{color:#d3e6b0}}.metrics strong{{display:block;font-size:26px}}@media(max-width:650px){{main{{padding:24px 16px}}h1{{font-size:28px}}.metrics{{grid-template-columns:1fr}}}}@media print{{body{{background:white;color:#111}}a,h2,h3,strong,th,summary{{color:#234b26}}.status,.metrics div{{background:#eef2eb}}}}</style></head><body><main>
<small>MOONFOREST · 2026.11.03 · 기준 9ca3561 · 브라우저 자동조작 없이 검증</small><h1>풍경·충돌·포즈의<br>중복 처리 최적화</h1>
<p class="status"><b>{status}</b><br>기존 판정 결과를 유지하면서 후보 검색과 같은 프레임의 반복 보정을 줄였습니다. 플레이어 8K·배경 최대 4K·기존 LOD·대평원100~200% 설정은 유지했습니다.</p>
<p><a href="{esc(url('warrior-v3'))}">마을</a> · <a href="{esc(url('warrior-plains'))}">대평원</a> · <a href="{esc(url('warrior-v4'))}">마물의 숲</a> · <a href="{esc(url('warrior-v5'))}">전사 v5 / 마녀의 동굴</a></p>
<div class="metrics"><div><strong>{counts['pass']:,}개</strong>전체 자동 검사 통과</div><div><strong>{navigation['summary']['segmentQueries']:,}건</strong>기존 시야 판정과 결과 비교</div><div><strong>4개 맵</strong>지형·탐색·풍경 선택 검증</div></div>
<h2>적용한 변경</h2><ul>
<li><b>그림자 후보:</b> 네 맵에서 후보가 될 수 없는 먼 셀을 먼저 제외합니다. 카메라 뒤쪽의 그림자, 기존 유지 거리, 선택 순서·예산·갱신 주기는 그대로입니다.</li>
<li><b>풍경 모델 준비 후보:</b> 현재 대평원 규모에서만 셀 인덱스를 사용합니다. 마을·숲·동굴과 전체 조망에서는 로컬 CPU 비교상 이득이 불확실해 기존 직접 순회를 유지합니다. 전방위 근거리 미리 불러오기와 정확한 LOD 선택은 동일합니다.</li>
<li><b>시야 검색:</b> 두 점을 감싼 큰 사각형 대신 선분과 반경을 포함하는 보수적 셀 띠를 찾습니다. 실제 충돌 수식·EPS·후보 순서와 이동/회피/돌진의 접촉 검색은 변경하지 않았습니다.</li>
<li><b>보스 위치 보정:</b> 같은 프레임에서 앞선 보정이 완료됐고 관련 상태가 정확히 같을 때만 두 번째 보정을 생략합니다. 적끼리 밀림, 루트 이동, 맵·탐색·지형 변경, 알 수 없는 구현은 기존 갱신 경로를 유지합니다.</li>
<li><b>가림 판정 준비:</b> 매 프레임 새로 만들던 카메라 행렬 배열과 그룹별 필터 배열을 재사용 버퍼·직접 카운트로 바꿨습니다. 아주 작은 카메라 변화도 이전 프레임 기준으로 계속 반영합니다. GPU 가림 쿼리·준비용 그리기 자체는 유지했습니다.</li></ul>
<h2>네 맵 풍경 결과 동등성</h2><div class="table"><table><tr><th>맵 / 거리 설정</th><th>비교 장면</th><th>모델 수요 정밀 후보</th><th>그림자 정밀 후보</th><th>결과</th></tr>{rows}</table></div>
<p class="muted">숫자는 비싼 개별 기하 판단으로 넘기는 후보 수입니다. 가벼운 전체 플래그 순회와 셀 검사 비용은 남아 있으므로 전체 반복 횟수나 FPS 감소율이 아닙니다. 원본 배치·에셋 경계 기반 이동/회전 비교와 네 맵 실제 지형 높이 비교를 모두 수행했습니다. 가림 상태는 통제된 테스트 데이터입니다.</p>
<h3>로컬 CPU 참고 비교</h3><div class="table"><table><tr><th>터치 정책 / 맵</th><th>모델 수요 전 → 후</th><th>그림자 선택 전 → 후</th></tr>{cpurows}</table></div>
<p class="muted">각 320회 처리를 3라운드 짝지어 비교한 합계의 중앙값입니다. 한 프레임 시간이 아닙니다. 셀·플래그·후보·정책 처리를 포함하고 JIT·호스트 부하에 따른 변동이 있습니다. 원본 직접 순회를 유지한 경로의 작은 차이도 측정 잡음과 공통 코드 오버헤드로 해석해야 합니다. 휴대폰 FPS·GPU·발열 측정이 아닙니다.</p>
<h2>충돌·시야 검색</h2><p>기존 알고리즘과 {navigation['summary']['segmentQueries']:,}개 시야 질의 결과 및 남은 후보의 순서를 비교했습니다. 이동·접촉 {navigation['summary']['movementChecks']:,}건과 셀 포함성 {navigation['summary']['helperChecks']:,}건도 확인했습니다. 동굴의 실제 통로와 보스 구역, 음수 좌표·셀 모서리·축 정렬·큰 반경·짧은 구간을 포함합니다.</p>
<div class="table"><table><tr><th>맵</th><th>긴 대각선 검색</th><th>조회 셀 전 → 후</th><th>작업 수</th></tr>{navrows}</table></div><p class="muted">맵을 가로지르는 긴 대각선 시나리오의 결과입니다. 모든 게임 프레임에 같은 비율로 적용되는 수치가 아닙니다. 짧거나 축에 평행한 검색은 원래의 저렴한 경로를 유지합니다.</p>
<h2>전투 결과와 반복 보정</h2><p>실제 Babylon SDK와 네 맵 지형·탐색을 사용해 기존 전투 처리 순서와 비교했습니다. 단독·복수·겹침·넉백 상황에서 최종 좌표·체력·동작·이벤트가 같아야 통과합니다. 아래는 합성 애니메이션 리그에서 측정한 호출 횟수이며, 전체 회귀 검사에는 기존 실제 에셋·변신·피격·돌진 검사도 포함됩니다.</p>
<details><summary>맵별 반복 보정 호출 수</summary><div class="table"><table><tr><th>맵</th><th>시나리오</th><th>위치 제한 전 → 후</th><th>지면 배치 전 → 후</th><th>플레이어 행렬 전 → 후</th><th>전투 상태</th></tr>{combatrows}</table></div></details>
<p>강공격 예약·입력 처리·공격 판정창·피해량·모션 속도는 수정하지 않았습니다. 조건 확인 비용이 추가되므로, 호출 감소를 전체 프레임 성능 증가로 환산하지 않습니다. 안전 조건이 맞지 않는 경로는 원래대로 실행합니다.</p>
<p><b>플레이어 포즈 재사용은 보류했습니다.</b> 같은 자세인지 확인하는 비용까지 포함하면 반복 측정의 개선·악화가 뒤바뀌어 이득이 확인되지 않았습니다. 이 최적화 후보를 제거하고 기존 포즈 갱신을 유지했습니다. 보스 위치 보정과 가림 판정의 배열 재사용만 적용합니다.</p>
<h2>검증과 배포</h2><ul><li>전체 {counts['pass']:,}/{counts['tests']:,}개 통과, 실패·취소 0개.</li><li>8K/최대4K·LOD·리소스 그래프를 이전 배포의 JSON과 비교해 동일함을 확인했습니다.</li><li>입력·전사 컨트롤러·타격 표본·LOD·그림자 선택 정책·동굴 정밀 탐색 파일은 기준 버전과 같습니다.</li><li>공식 빌드·배포 목록 검증 후 GitHub Pages로 배포하며, 공개된 변경 파일의 해시를 검증본과 대조합니다.</li></ul>
<p class="status"><b>확인하지 않은 범위</b><br>실제 S23·iPhone에서의 FPS, GPU 시간, 발열 변화는 측정하지 않았습니다. Node/NullEngine 검사는 판정·처리 순서·자원 수명 검증이며 실제 화면 렌더 검수가 아닙니다. 기존 화질을 낮추거나 보이는 대상을 줄여 얻은 성능 개선은 없습니다.</p>
<h2>근거</h2><p>{links}</p><details><summary>전투 검증 세부 기록</summary><pre>{esc(json.dumps(combat,ensure_ascii=False,indent=2))}</pre></details>
<p class="muted">다음 측정은 같은 위치·카메라·목표 FPS에서의 이동/회전과 보스전 비교입니다. 대평원100%/200%, 30FPS/60FPS는 각각 구분해 평가해야 합니다.</p>
</main></body></html>'''
(out/'index.html').write_text(page,encoding='utf-8')
print(json.dumps({'report':str(out/'index.html'),'tests':counts,'resourceGraphUnchanged':True,'deployed':bool(rev)},ensure_ascii=False))
