"""Publish a self-contained review of measured changes, without browser automation."""
import html, json, re, subprocess
from pathlib import Path

here = Path(__file__).resolve().parent
app = here.parents[1]
repo = app.parent
log = (here / 'full-tests-final.log').read_text(encoding='utf-8-sig')
def metric(name):
    match = re.search(r'ℹ ' + name + r' (\d+(?:\.\d+)?)', log)
    if not match:
        raise ValueError('Missing complete test summary: ' + name)
    return float(match.group(1)) if '.' in match.group(1) else int(match.group(1))
tests = {key: metric(key) for key in ['tests', 'pass', 'fail', 'skipped', 'duration_ms']}
assert tests['fail'] == 0 and tests['tests'] == tests['pass']
manifest = json.loads((repo / 'ArcherPreviewSite/deployment-files.json').read_text())
baseline = json.loads(subprocess.check_output(['git', 'show', 'e62979f:ArcherPreviewSite/deployment-files.json'], cwd=repo, text=True))
assert manifest['resourceRevision'] == baseline['resourceRevision']
summary = {
    'baseline': 'e62979f', 'tests': tests,
    'resourceRevisionUnchanged': True,
    'resourceRevision': manifest['resourceRevision'],
    'publishedFiles': len(manifest['files']),
    'publishedBytes': manifest['bytes'],
    'publishedBytesDelta': manifest['bytes'] - baseline['bytes'],
    'browserAutomation': False,
    'deviceFPSMeasured': False,
    'combatAnchorsUnchanged': True,
    'player8KBackgroundMax4KAndLODUnchanged': True,
    'sharedChestLidAttributeBytesAdded': 49056,
}
(here / 'validation-summary.json').write_text(json.dumps(summary, indent=2) + '\n', encoding='utf-8')
live_path = here / 'live-verification.json'
live = json.loads(live_path.read_text()) if live_path.exists() else None
deployed = bool(live and live.get('passed'))
rev = live['commit'][:7] if deployed else None
play = f'https://ranke0802.github.io/moonforest/ArcherPreviewSite/?character=warrior-v5&uiTest=1&rev={rev}' if deployed else ''
status = f'배포 · 파일 해시 확인 완료 / {rev}' if deployed else '로컬 검증 완료 · 배포 확인 전'
link = f'<a class="play" href="{html.escape(play)}">반영된 게임 열기 ↗</a>' if deployed else ''
page = '''<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MOONFOREST · UI 적용 및 프레임 저하 점검</title>
<style>
:root{color-scheme:dark;--paper:#e8e3ce;--muted:#a6b1a4;--gold:#d9bd7e;--line:#405043}*{box-sizing:border-box}body{margin:0;background:#101912;color:var(--paper);font:16px/1.75 system-ui,'Malgun Gothic',sans-serif}main{max-width:1100px;margin:auto;padding:54px 24px 80px}.eyebrow{color:var(--gold);font-size:12px;letter-spacing:.16em}h1{font-size:clamp(29px,5vw,46px);line-height:1.3;margin:14px 0}h2{font-size:23px;margin:0 0 15px}h3{font-size:17px;margin:0 0 8px}p{margin:10px 0}.lead{font-size:19px;max-width:900px}.muted,small{color:var(--muted)}.status{display:inline-block;border:1px solid var(--line);border-radius:30px;padding:6px 14px;font-size:12px;margin:8px 0 24px}section{padding:30px 0;border-top:1px solid var(--line);margin-top:28px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.card{padding:20px;background:#1a281d;border:1px solid #3b4b3c;border-radius:8px}.number{font-size:28px;color:#ddca95;font-weight:650;line-height:1.3}.card p{font-size:14px}.table{overflow-x:auto}table{width:100%;border-collapse:collapse;min-width:620px;font-size:14px}th,td{padding:13px 12px;text-align:left;border-bottom:1px solid var(--line);vertical-align:top}th{color:var(--gold)}a{color:#e3ce93}.play{display:inline-block;padding:10px 18px;border:1px solid #aa9567;background:#2b3c2a;text-decoration:none;border-radius:4px;margin:6px 0 20px}.note{padding:17px 20px;border-left:3px solid var(--gold);background:#203024;margin-top:18px}li{margin:7px 0}footer{font-size:12px;color:var(--muted);margin-top:35px}code{font-size:12px;overflow-wrap:anywhere}@media(max-width:720px){main{padding:30px 18px}.grid{grid-template-columns:1fr}.lead{font-size:17px}}
</style><main><div class="eyebrow">MOONFOREST / 2026.11.03</div><h1>실제 UI 적용과<br>프레임 저하 점검 결과</h1><div class="status">@@STATUS@@</div>
<p class="lead">상자 외곽선의 반복 준비와 나무 시야 검사의 불필요한 작업을 줄였습니다. 실제 게임의 가방·수첩·설정·HUD를 정리하고, 위치·크기 편집 기능을 연결했습니다.</p>
<p class="muted">확인된 코드 문제를 수정한 결과입니다. 모든 맵의 프레임 저하가 한 가지 원인으로 설명되거나, 휴대폰 FPS가 회복됐다고 단정하지 않습니다.</p>@@LINK@@
<div class="grid"><article class="card"><h3>상자 외곽선 반복 요청</h3><div class="number">480 → 0회</div><p>240프레임의 실제 엔진 코드 경로 검사. 기존 캐시 프로그램 재요청이며, 480회 새 GPU 컴파일을 뜻하지 않습니다.</p></article><article class="card"><h3>전체 회귀 검사</h3><div class="number">@@TESTS@@ / @@TESTS@@</div><p>입력·맵 이동·재시도·보스·저장·화질 정책과 새 UI 검사 통과. 브라우저 자동조작은 하지 않았습니다.</p></article><article class="card"><h3>게임 자산 유지</h3><div class="number">8K / 최대 4K</div><p>플레이어·배경 해상도, 기존 LOD, 대평원 풍경 거리 240% 유지. 모델·텍스처 배포 리비전 동일.</p></article></div>
<section><h2>프레임 저하 조사와 조치</h2><div class="table"><table><thead><tr><th>대상</th><th>확인한 현상</th><th>조치와 남은 비용</th></tr></thead><tbody>
<tr><td>상자 본체·뚜껑</td><td>두 부분의 색상 데이터 구성 차이로 공유 외곽선 재질이 매번 설정을 바꾸고 캐시 참조를 추가.</td><td>뚜껑에 원래 색을 바꾸지 않는 흰색 데이터를 공유해 반복 요청·참조 증가를 제거. 공유 데이터 49,056B 증가. 본체·뚜껑과 외곽선의 기존 그리기 횟수는 유지.</td></tr>
<tr><td>경계에 추가된 풍경</td><td>멀리 있거나 시야 밖인 구간의 표시 제한은 작동. 나무 시야 검사는 관련 없는 나무에도 두 번씩 수행.</td><td>카메라와 플레이어 사이 구간과 겹치지 않는 나무를 먼저 제외. 겹치는 나무의 정밀 판정·투명도·LOD는 그대로 유지.</td></tr>
<tr><td>로딩 화면 4장</td><td>압축 이미지 총 1,926,640B. 표시 요소는 1개이며 플레이 시작 시 이미 숨김·src 해제가 적용돼 있었음.</td><td>100회 전환 검사에서 해제 확인. 불필요한 재구현 없음. 브라우저 내부 이미지 캐시가 실제로 해제되는 시점은 측정하지 못함.</td></tr>
<tr><td>대기 중 상자 작업</td><td>대기열 선택 시 배열 복사, 열리는 상자가 없어도 빈 순회.</td><td>배열 복사 없이 선택하고 애니메이션이 없으면 조기 종료. 이 작은 수정만으로 FPS 개선을 주장하지 않음.</td></tr>
</tbody></table></div>
<h3 style="margin-top:22px">네 맵에서 보존한 판정</h3><p>실제 배치 자료를 사용한 64프레임 검사에서 정밀 가림 검사 호출은 마을 3,294→34회, 대평원 6,376→48회, 숲 9,658→96회였습니다. 동굴은 해당 나무 검사 0회로 동일합니다. 이는 검사 시나리오의 호출 수이며 전체 게임 부하나 FPS 비율이 아닙니다.</p>
<p>네 맵의 상자 검사에서는 각각 120프레임 동안 반복 캐시 요청과 참조 증가가 없었습니다. 상자의 등급 색·외곽선 굵기·열림 모션·획득 보상은 유지했습니다.</p></section>
<section><h2>실제 게임에 적용한 UI</h2><div class="grid"><article class="card"><h3>HUD와 전투</h3><p>보유 중인 그림 에셋으로 전투 버튼을 정리했습니다. 공격·회피·방패 밀치기·물약의 기존 중심 위치와 입력 노드는 유지합니다. FPS / 가방 / 수첩 / 소환 / 전체화면 / 설정 순서도 유지합니다.</p></article><article class="card"><h3>가방과 수첩</h3><p>실제 소지품 필터·선택·수량·등급·설명·사용과 퀵슬롯 등록을 연결했습니다. 수첩 목표 계층은 유지하고, 보상은 실제 지급 품목·수량·경험치 기준으로 표시합니다.</p></article><article class="card"><h3>설정</h3><p>설정 창의 패널과 옵션 표현을 통일했습니다. 아직 구현되지 않은 할인·무료 수리를 확정 보상처럼 표시하던 부분을 정리했습니다. 보상 규칙 자체는 변경하지 않았습니다.</p></article></div>
<div class="note"><strong>남은 아트 제한</strong><p>소환·전체화면·설정은 기존 보유 그림 중 전용 아이콘이 없어 공통 문장 그림과 짧은 기능명을 함께 사용했습니다. 가방·수첩·전투 그림은 기존 전용 에셋을 사용합니다. 이를 완성된 전용 아이콘 세트라고 보지는 않습니다.</p></div></section>
<section><h2>HUD 위치·크기 편집</h2><p><strong>설정 → 화면·카메라 → HUD 위치 · 크기</strong>에서 사용합니다.</p><ol><li>체력·스태미나, 골드, 의뢰·이야기, 상단 도구, 미니맵, 성능 진단 중 항목을 선택합니다.</li><li>드래그 또는 가로·세로 슬라이더로 이동하고 크기를 조절합니다. 전투 버튼 4개는 중심 위치를 고정하고 크기만 조절합니다.</li><li>저장하면 재접속·맵 이동 후에도 적용됩니다. 취소, 선택 초기화, 전체 초기화, 배치 내보내기·가져오기를 제공합니다.</li></ol><p class="muted">편집 중에는 게임이 일시정지됩니다. 저장은 현재 브라우저 기준이며, 저장 공간을 사용할 수 없으면 이번 접속에서만 유지한다는 안내가 표시됩니다. UI 간 겹침은 자동으로 재배치하지 않습니다.</p></section>
<section><h2>검증 범위와 다음 확인 지점</h2><ul><li>맵 이동·시간 초과·재시도·늦게 끝난 작업 분리, HUD 편집 중 정지·맵 준비 시 닫기·단일 실행 루프 재개를 검사했습니다.</li><li>기존 공격 버튼의 입력 연결을 보존했고, 저장·취소·잘못된 배치 가져오기·다중 터치·크기 변경·포커스 복귀를 검사했습니다.</li><li>독립 UI 검사에서 19개 의뢰의 표시 보상과 지급 데이터 일치, 600프레임 동안 불필요한 모달 재생성·HUD 문구 재작성 0회를 확인했습니다.</li><li>작은 화면 7개 크기의 CSS 규칙과 스크롤 구조를 검사했습니다. 실제 브라우저 픽셀·S23/iPhone 터치·GPU·발열 측정은 하지 않았습니다.</li></ul>
<p>휴대폰에서 남는 저하가 있다면 같은 위치·시점·30/60FPS 설정에서 상자가 보일 때와 아닐 때, 경계 풍경이 보일 때와 아닐 때를 비교해야 합니다. 특히 대평원 240%에서 실제로 보이는 풍경의 그리기 비용과 나무 투명 픽셀 비용은 이번 수정으로 사라지지 않습니다.</p>
<p class="muted">빌드 파일 합계 @@BYTES@@B / 이전 대비 +@@DELTA@@B. 이 차이는 배포 파일 크기이며 실행 메모리 증가량이 아닙니다. 새 UI에는 상시 프레임 순회를 추가하지 않았고, HUD 배치 재계산은 편집·화면 크기 변경 시에만 수행합니다.</p></section>
<footer>기준 코드 e62979f · 검증은 Node / 실제 Babylon 코드 경로 / DOM·CSS 검사 / 배포 파일 해시 기준. 브라우저 자동조작 및 추가 이미지 생성 없이 진행했습니다.</footer></main></html>'''
page = page.replace('@@STATUS@@', status).replace('@@LINK@@', link).replace('@@TESTS@@', str(tests['pass'])).replace('@@BYTES@@', f"{manifest['bytes']:,}").replace('@@DELTA@@', f"{summary['publishedBytesDelta']:,}")
out = Path('C:/Users/ryank/Documents/ChatGPT/MM Project/output/ui-performance-integration/2026-11-03')
out.mkdir(parents=True, exist_ok=True)
(out / 'index.html').write_text(page, encoding='utf-8')
print(json.dumps({'report': str(out / 'index.html'), 'deployed': deployed, 'tests': tests, 'buildDelta': summary['publishedBytesDelta']}, ensure_ascii=False))
