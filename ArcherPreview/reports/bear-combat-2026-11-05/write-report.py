from pathlib import Path
import json, html, shutil

root = Path(__file__).resolve().parent
load = lambda name: json.loads((root / name).read_text(encoding='utf-8'))
review = load('implementation-review.json')
animation = load('animation-validation.json')
bear = load('bear-validation.json')
occlusion = load('occlusion-validation.json')
scenery = load('scenery-validation.json')
log = load('log-analysis.json')
mixed = [row for row in animation['cases'] if row['case'] in ['player-pose-strike-equivalence', 'bear-pose-event-equivalence'] and row['fps'] == 60]
rows = ''.join(f"<tr><td>{'전사' if row['case'].startswith('player') else '곰'}</td><td>{row['baselineCreated']:,} → {row['cachedCreated']:,}</td><td>{100*(1-row['cachedCreated']/row['baselineCreated']):.1f}% 감소</td><td>{row['maxWorldMatrixError']}</td></tr>" for row in mixed)
tests = review.get('tests', {})
link = f'<a href="{html.escape(review["url"])}">배포본 실행</a>' if review.get('url') else '배포 확인 중'
page = f'''<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MoonForest · 곰 전투 지연 개선</title>
<style>body{{margin:0;background:#f3f1e9;color:#263f35;font:16px/1.8 'Malgun Gothic',sans-serif}}main{{max-width:960px;margin:auto;padding:28px 20px}}header{{background:#203c32;color:#f4ecd8;padding:24px;border-radius:8px}}h1{{font-size:27px;line-height:1.4}}h2{{margin-top:30px;font-size:21px}}a{{color:#426c54}}header a{{color:#e5c785}}table{{width:100%;border-collapse:collapse;background:white}}td,th{{text-align:left;padding:10px;border-bottom:1px solid #d3d9ce}}li{{margin:8px 0}}.note{{padding:16px;background:#e9dfbf;border-left:4px solid #ae9254}}@media(max-width:600px){{body{{font-size:14px}}main{{padding:14px}}td,th{{padding:7px}}}}</style>
<main><header><small>MOONFOREST 0.1 · 2026.11.05</small><h1>대평원 곰 전투 · 반복 준비 비용 줄이기</h1><p>{link} · {html.escape(review['status'])}</p></header>
<h2>제공 로그에서 확인한 것</h2><p>game-CVnh_UER.js의 곰 전투 중 243초 부근에서 50~75ms CPU 지연이 반복됐습니다. 이때 텍스처는 idle이고 화면 크기도 안정돼 있어 회전 처리만으로 설명할 수 없습니다. 곰이 없는 대평원·마을에도 긴 지연이 있습니다.</p>
<table><tr><th>기록</th><th>관측</th><th>판단 범위</th></tr><tr><td>곰 회복 · 243초</td><td>대체로 118~119 드로콜 · 여러 CPU 구간 지연</td><td>드로콜 폭증이나 AI 단독 원인으로 확정 불가</td></tr><tr><td>곰 넘어짐 · 261.5초</td><td>현재 제출 107.5ms · Draw Submission 81ms</td><td>GPU 미지원이라 드라이버·스케줄링·GPU 실행 분리 불가</td></tr><tr><td>마을 · 349초</td><td>sceneCall 156.4ms · SDK scene 48.7ms</td><td>후속 관찰자 비용을 추가 계측. 텍스처 resources 표시는 업로드 원인 증명이 아님</td></tr><tr><td>마지막 10초 · 마을</td><td>평균 {log['finalWindow']['meanFrameMs']:.2f}ms · 약 {log['finalWindow']['inverseMeanFrameFps']:.1f}FPS</td><td>표시된 현재 59.93FPS는 다른 시간 창. 곰 전투 요약으로 사용하지 않음</td></tr></table>
<h2>반영한 개선</h2><ol><li><strong>전사·곰 애니메이션 연결 재사용.</strong> 모션을 바꿀 때 네이티브 애니메이션 연결을 해제했다가 다시 만드는 비용을 줄였습니다. 비활성 클립은 최대 2개, 가중치 0·일시정지 상태로만 보관하고 포즈를 샘플링하지 않습니다. 이벤트·콜백·부분 채널·가산 애니메이션 등 안전 조건을 만족하지 않으면 기존 경로를 사용합니다. 해제·클립 교체 수명도 검사했습니다.</li><li><strong>곰의 중복 행렬 계산 감소.</strong> 동일 부모를 강제 재계산하던 호출 10→3회, 실제 행렬 재구성은 70→67회로 줄었습니다. 작은 개선이며 수십 ms 지연 전체를 해결했다는 의미는 아닙니다.</li><li><strong>가려짐 검사 중복 그리기 제거.</strong> 이미 준비된 검사 셰이더로 같은 프록시를 밖에서 한 번, 쿼리 안에서 한 번 그리던 작업을 한 번으로 줄였습니다. 33개 쿼리 검사에서 실제 SDK 그리기 호출 66→33회. 쿼리 간격·보이는 대상·시간 초과 시 복구는 동일합니다. 모든 지도 드로콜이 절반이 된 것은 아닙니다.</li><li><strong>진단 경계 보완.</strong> 전사 컨트롤러·수동 애니메이션·효과음, 렌더 후 지오메트리·텍스처·가려짐 관찰자 비용을 따로 기록합니다. 진단 OFF에서는 추가 시계를 읽지 않습니다. 중첩 시간이며 GPU 시간으로 합산하지 않습니다.</li></ol>
<h2>실제 에셋 비교 결과</h2><p>동일한 입력·클립 시간을 넣은 혼합 전투 추적입니다. 아래 숫자는 네이티브 연결 생성 횟수이며 FPS 측정값이 아닙니다. 반복 3클립 전용 검사에서는 95% 감소했지만 다양한 모션을 쓰는 혼합 추적 결과를 우선 제시합니다.</p><table><tr><th>대상</th><th>연결 생성</th><th>변화</th><th>최대 포즈 오차</th></tr>{rows}</table><p>15·30·60FPS 입력 간격에서 전사 포즈와 검·방패 타격 궤적을 비교했습니다. 곰 9개 공격·잡기·넘어짐·회복 포즈에서는 월드/뼈 행렬, 41,898개 스킨 정점, 접촉 캡슐이 동일했습니다. 곰 본체는 30,000삼각형이며 이번에 폴리곤을 줄이지 않았습니다. 검사한 최초 모션·사망 페이드·피격 재질도 준비된 6개 SDK 효과를 재사용했습니다.</p>
<h2>네 지도 검증과 유지 조건</h2><p>전체 검사 <strong>{tests.get('pass','진행 중')} / {tests.get('tests','—')} 통과</strong>. 마을·대평원·마물의 숲·마녀의 동굴의 72개 시점에서 텍스처 후보 순서·커버리지·프로필이 동일한지 비교했습니다. 텍스처 탐색 변경 후보는 로컬 비교에서 효과가 작거나 느려져 반영하지 않았습니다.</p><p>플레이어·집·보스·배경의 현행 텍스처 프로필, 모든 모델·LOD·풍경거리, 그림자 품질, 전투 입력·타이밍·판정, HUD 위치와 30/60FPS 선택을 유지했습니다. 리소스 revision: <code>{review.get('resourceRevision','확인 중')}</code></p>
<p class="note">브라우저 자동조작 없이 실제 출하 에셋과 Babylon NullEngine으로 코드·연산·수명·판정 동등성을 검증했습니다. S23의 실제 FPS·발열·GPU 대기 시간을 재측정한 결과가 아닙니다. 제공 로그의 100ms 이상 순간 지연이 모두 제거됐다고 확정할 수 없습니다.</p><p><a href="implementation-review.json">통합 검증</a> · <a href="animation-validation.json">애니메이션</a> · <a href="bear-validation.json">곰 포즈</a> · <a href="occlusion-validation.json">가려짐 검사</a> · <a href="scenery-validation.json">네 지도</a> · <a href="live-verification.json">배포 확인</a></p></main></html>'''
(root / 'index.html').write_text(page, encoding='utf-8')
destination = Path('C:/Users/ryank/Documents/ChatGPT/MM Project/output/bear-combat-review/2026-11-05')
destination.mkdir(parents=True, exist_ok=True)
for name in ['index.html', 'implementation-review.json', 'log-analysis.json', 'animation-validation.json', 'bear-validation.json', 'occlusion-validation.json', 'scenery-validation.json', 'live-verification.json']:
    if (root / name).exists():
        shutil.copy2(root / name, destination / name)
print(json.dumps({'report': str(destination / 'index.html'), 'status': review['status']}))
