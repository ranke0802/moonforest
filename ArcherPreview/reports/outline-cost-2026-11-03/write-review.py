import html,json,re,subprocess
from pathlib import Path

report=Path(__file__).parent;app=report.parents[1];repo=app.parent
log=(report/'all-tests.log').read_text(encoding='utf-8-sig')
counts={key:int(re.search(r'ℹ '+key+r' (\d+)',log).group(1)) for key in ['tests','pass','fail','cancelled']}
assert counts['tests']==counts['pass'] and counts['fail']==counts['cancelled']==0,counts
previous=json.loads(subprocess.check_output(['git','show','d03de5b:ArcherPreviewSite/assets/resource-index.json'],cwd=repo))
current=json.loads((repo/'ArcherPreviewSite/assets/resource-index.json').read_text())
assert previous==current,'Model/texture resource graph changed'
qa=json.loads((report/'four-map-validation.json').read_text(encoding='utf-8-sig'))
assert qa.get('passed') is True,'Four-map validation did not pass'
summary={'baseline':'d03de5b','tests':counts,'resourceGraphUnchanged':True,'resourceRevision':current['revision'],'browserAutomation':False,'physicalDeviceTested':False,'changes':['Ordinary scenery has no tint instance attribute; only graded sources use a tinted variant.','LOD ordering and selected mesh triangle counts are reused only within a single selection.','Screen readiness checks only the applicable source/LOD outline variant.'],'preserved':['Five chest grade colors and width 0.028','Instanced chest ink draw batching','Original selection order, hysteresis and triangle/count budgets','Player 8K, background max 4K, geometry LOD thresholds','Plains 100–200% range preference'],'fourMapValidation':qa}
(report/'validation-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
livePath=report/'live-verification.json';live=json.loads(livePath.read_text()) if livePath.exists() else None
commit=live['commit'][:7] if live and live.get('passed') else ''
status='배포 완료 · '+commit if commit else '검증 완료 · 배포 확인 중'
url='https://ranke0802.github.io/moonforest/ArcherPreviewSite/?character=warrior-v5&uiTest=1'+('&rev='+commit if commit else '')
page=f'''<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>풍경·외곽선 최적화 검증</title><style>body{{margin:0;background:#121b16;color:#e6eee7;font:16px/1.8 system-ui,sans-serif}}main{{max-width:1000px;margin:auto;padding:36px 24px}}h1{{font-size:32px;line-height:1.3}}h2{{font-size:22px;color:#c8dca8;margin-top:32px}}a{{color:#ddc794}}.status{{padding:16px;border:1px solid #57704b;border-radius:9px;background:#243124}}td,th{{text-align:left;border-bottom:1px solid #3b493e;padding:12px;vertical-align:top}}table{{border-collapse:collapse;width:100%}}small{{color:#b3c1b4}}pre{{white-space:pre-wrap;word-break:break-word;background:#1c2720;padding:16px;font-size:12px}}li{{margin:8px 0}}</style><main><small>MOONFOREST · 2026.11.03 · 통합 최적화 / 독립 에이전트 교차 검증</small><h1>일반 풍경 색상 처리 제거와<br>외곽선 반복 계산 축소</h1><p class="status">{status}<br>전체 검사 {counts['pass']:,}건 통과</p><p><a href="{html.escape(url)}">전사 v5 접속</a></p>
<h2>적용한 변경</h2><ul><li>일반 풍경과 등급 없는 소품은 기존 단색 외곽선을 사용합니다. 상자용 색상 속성을 등록하지 않아 해당 인스턴스 데이터 직렬화·버퍼 갱신 경로를 제거했습니다.</li><li>등급이 있는 상자만 색상 셰이더를 준비합니다. 다섯 색·굵기 0.028·동일 모델의 인스턴스 그리기는 유지합니다.</li><li>같은 선택 주기 안에서 모델별 LOD 목록과 메시별 삼각형 수를 재사용합니다. 다음 주기에는 다시 확인하여 스트리밍 교체나 인덱스 변경을 반영합니다.</li><li>화면 준비 단계에서 해당 소스/LOD에 사용하는 외곽선 셰이더만 검사합니다. 사용하지 않는 셰이더 때문에 대기하는 경로를 막습니다.</li></ul>
<h2>작업 수 비교</h2><table><tr><th>검증 사례</th><th>이전</th><th>이후</th></tr><tr><td>같은 LOD 소스를 공유하는 540개 후보의 선택</td><td>LOD 목록 조회 450회</td><td>1회, 선택 순서·합계 동일</td></tr><tr><td>같은 후보의 삼각형 수 조회</td><td>300회 초과</td><td>4회, 모바일/PC 예산 동일</td></tr><tr><td>일반 인스턴스 100개의 등급색 데이터</td><td>3-float 색상 속성 및 갱신 경로</td><td>해당 속성·버퍼 갱신 없음</td></tr><tr><td>같은 상자 모델의 5개 등급</td><td>인스턴스 외곽선 1회</td><td>1회 유지, 색·두께 동일</td></tr></table><p>실제 Babylon SDK의 CPU 경로와 그리기 제출 검증입니다. 위 수치는 FPS 증가율이나 휴대폰 GPU 처리 시간 측정치가 아닙니다.</p>
<h2>네 맵과 품질 유지</h2><p>마을·대평원·마물의 숲·마녀의 동굴의 실제 의뢰 포인트 및 상자 지오메트리 경로를 검사하고 반복 로딩·해제와 외곽선 준비를 확인했습니다. 추가 검사에는 실제 base/LOD 그리기에 맞춘 외곽선, 늦은 LOD·등급 전환, 동굴 가림, 취소·시간 초과와 지연 완료 격리를 포함합니다.</p><p>리소스 JSON은 이전 배포와 동일합니다. 플레이어 8K·배경 최대 4K·기존 LOD·외곽선 예산·상자 보상은 유지했습니다. 대평원 100~200% 옵션도 유지합니다. 원거리 색 보정 셰이더와 식생 밀도는 이번 변경 범위에 포함하지 않았습니다.</p>
<h2>검증 한계</h2><p>브라우저 자동조작과 추가 에셋 생성은 하지 않았습니다. 실기기에서의 화면·FPS·GPU 메모리·발열 개선 폭은 아직 측정하지 않았으므로 전 맵 FPS 저하가 완전히 해결됐다고 단정하지 않습니다. 같은 기기·맵·위치·카메라·화질·목표 FPS에서 이전 기록과 비교해야 합니다.</p>
<details><summary>네 맵 자동 검증 기록</summary><pre>{html.escape(json.dumps(qa,ensure_ascii=False,indent=2))}</pre></details></main></html>'''
out=Path('C:/Users/ryank/Documents/ChatGPT/MM Project/output/outline-cost-review/2026-11-03');out.mkdir(parents=True,exist_ok=True);(out/'index.html').write_text(page,encoding='utf-8')
print(json.dumps({'tests':counts,'resourceGraphUnchanged':True,'deployed':bool(commit),'report':str(out/'index.html')},ensure_ascii=False))
