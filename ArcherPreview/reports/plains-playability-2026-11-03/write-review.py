"""Build the local, evidence-linked review without controlling a browser."""
import html, json, re, shutil, subprocess
from pathlib import Path

report = Path(__file__).resolve().parent
app = report.parents[1]
repo = app.parent
out = Path('C:/Users/ryank/Documents/ChatGPT/MM Project/output/playability-optimization-review/2026-11-03')
out.mkdir(parents=True, exist_ok=True)
def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))
def e(value):
    return html.escape(str(value))
def source(ref):
    path, _, line = ref.partition(':')
    return f'<a href="{(app/path).as_uri()}">{e(path)}{":"+line if line else ""}</a>'
log = (report/'all-tests.log').read_text(encoding='utf-8-sig')
counts = {key: int(re.search(r'ℹ '+key+r' (\d+)', log).group(1)) for key in ['tests','pass','fail','cancelled']}
assert counts['pass'] == counts['tests'] and counts['fail'] == counts['cancelled'] == 0, counts
env = read(report/'environment-performance-audit.json')
combat = read(report/'combat-performance-audit.json')
layout = read(report/'plains-layout-audit.json')
plains = read(report/'plains-performance-audit.json')
chests = read(app/'reports/chest-context-2026-11-03/placement-validation.json')
outline = read(app/'reports/outline-cost-2026-11-03/four-map-validation.json')
assert chests['passed'] and outline['passed']
baseline = json.loads(subprocess.check_output(['git','show','d03de5b:ArcherPreviewSite/assets/resource-index.json'], cwd=repo))
index = read(repo/'ArcherPreviewSite/assets/resource-index.json')
assert baseline == index, 'Resource models, texture graph or bundles changed'
deployment = read(repo/'ArcherPreviewSite/deployment-files.json')
live = read(report/'live-verification.json') if (report/'live-verification.json').exists() else {}
rev = live['commit'][:7] if live.get('passed') else ''
status = '배포 완료 · '+rev if rev else '통합 검증 완료 · 배포 확인 중'
baseurl = 'https://ranke0802.github.io/moonforest/ArcherPreviewSite/?uiTest=1'
def game(character):
    return baseurl+'&character='+character+('&rev='+rev if rev else '')
names = {'village':'마을','great-plains':'대평원','monster-forest':'마물의 숲','witch-cave':'마녀의 동굴'}
kind_names = {'tree':'나무 아래','house':'집 곁','cart':'수레 곁','wall':'암벽 곁'}
for name in ['before-entry','after-entry','before-junction','after-junction','before-summit','after-summit']:
    shutil.copy2(report/(name+'.png'), out/(name+'.png'))
data_files = {
    '환경 감사': report/'environment-performance-audit.json',
    '전투 감사': report/'combat-performance-audit.json',
    '대평원 감사': report/'plains-performance-audit.json',
    '상자 접근 검사': app/'reports/chest-context-2026-11-03/placement-validation.json',
    '네 맵 외곽선 검사': app/'reports/outline-cost-2026-11-03/four-map-validation.json',
    '배치 비교': report/'plains-layout-audit.json',
}
for path in data_files.values():
    shutil.copy2(path, out/path.name)
summary = {'baseline':'d03de5b', 'tests':counts, 'resourceGraphUnchanged':True,
    'resourceRevision':index['revision'], 'deploymentFiles':len(deployment['files']),
    'deploymentBytes':deployment['bytes'], 'chests':chests['counts'],
    'plainsPlacementCount':layout['staticCount'], 'browserAutomation':False,
    'physicalDeviceTested':False, 'offlineCompositionRender':True,
    'limits':['No phone FPS, thermal, GPU rasterization or total GPU memory measurement.',
              'Offline Blender views verify composition, not the exact game shader/fog/camera output.',
              'Four-map SDK fixture uses actual chest geometry and quest points; scenery/LOD and occluding wall fixtures are controlled.'],
    'preserved':['Player 8K','Background maximum 4K','Existing LOD and budgets',
                 'Five chest colors/thickness/IDs/rewards/save keys','Plains range 100–200%'],
    'release':live if live.get('passed') else {'status':'pending'}}
(report/'validation-summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
shutil.copy2(report/'validation-summary.json', out/'validation-summary.json')
map_rows = ''.join(f'<tr><th>{names[k]}</th><td>{v["placements"]:,}</td><td>{v["uniqueAssets"]}</td><td>{v["chests"]}</td><td>'+{
    'village':'집·수목의 반복 선택, 그림자, 상자용 공통 경로',
    'great-plains':'넓은 시야·수목 중첩, 200% 거리, 이동 중 준비 작업',
    'monster-forest':'겹친 잎과 양면 재질, 그림자·외곽선, 시야 검사',
    'witch-cave':'가림·안개 갱신, 랜턴 정합, 보스 전투·변신 준비'}[k]+'</td></tr>' for k,v in env['maps'].items())
chest_rows = ''
for p in chests['points']:
    c = p['context']
    gap = '암벽 확인 ≤2.4m' if c['anchorId']=='cave-terrain-wall' else f'지지물 경계 {c["gap"]:.2f}m'
    chest_rows += f'<tr><td>{names[p["map"]]}</td><td>{e(p["id"])}</td><td><span class="tier t{p["tier"]}">등급 {p["tier"]}</span></td><td>{kind_names[c["kind"]]}<small>{e(c["anchorId"])} · {gap}</small></td><td>({p["x"]:.2f}, {p["z"]:.2f})</td><td>접근·시야·경로 통과</td></tr>'
environment_cards = ''
for f in env['findings']:
    environment_cards += f'<article class="finding"><div class="eyebrow">{f["priority"]} · {e(f["status"])}</div><h3>{e(f["area"])}</h3><p>{e(f["detail"])}</p><dl><dt>개선안</dt><dd>{e(f["proposal"])}</dd><dt>검증</dt><dd>{e(f["validation"])}</dd><dt>주의할 회귀</dt><dd>{e(f["risk"])}</dd></dl><small>'+ ' · '.join(source(s) for s in f['evidence'])+'</small></article>'
combat_titles = ['적 시야·경로 탐색의 넓은 셀 검색','분리 전후 이동 보정·경고 고리 중복','적마다 반복하는 플레이어 포즈 갱신','실제 타격 창 밖의 교차 검사 준비','활성 캐릭터의 애니메이션·스키닝','다량의 금화와 화면 라벨','진단창 자체의 관찰 비용']
combat_cards = ''
for title,f in zip(combat_titles,combat['findings']):
    combat_cards += f'<article class="finding"><div class="eyebrow">추가 개선 후보 · 실기기 기여도 미측정</div><h3>{title}</h3><p>{e(f["confirmed"])}</p><p class="muted">{e(f["cost"])}</p><dl><dt>판단</dt><dd>{e(f["hypothesis"])}</dd><dt>품질 유지 방법</dt><dd>{e(f["quality_preserving_option"])}</dd><dt>검증</dt><dd>{e(f["measurement"])}</dd></dl><small>'+ ' · '.join(source(s) for s in f['sources'])+'</small></article>'
views = ''.join(f'<article><h3>{label}</h3><div class="compare"><figure><figcaption>변경 전</figcaption><a href="before-{key}.png"><img loading="lazy" src="before-{key}.png" alt="{label} 변경 전"></a></figure><figure><figcaption>변경 후</figcaption><a href="after-{key}.png"><img loading="lazy" src="after-{key}.png" alt="{label} 변경 후"></a></figure></div></article>' for key,label in [('entry','마을에서 대평원으로'),('junction','중앙 갈림길'),('summit','언덕 위 조망')])
evidence_links = ' · '.join(f'<a href="{p.name}">{label} JSON</a>' for label,p in data_files.items())
page = f'''<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MOONFOREST — 플레이 개선·통합 최적화 보고서</title>
<style>:root{{--bg:#101713;--panel:#19231c;--line:#344338;--text:#e9eee6;--muted:#aebcac;--accent:#cadd9e}}*{{box-sizing:border-box}}html{{scroll-behavior:smooth}}body{{margin:0;background:var(--bg);color:var(--text);font:16px/1.8 system-ui,-apple-system,sans-serif}}main{{max-width:1240px;margin:auto;padding:42px 28px 80px}}h1{{font-size:clamp(30px,4vw,48px);line-height:1.25;max-width:900px}}h2{{font-size:27px;color:var(--accent);margin:52px 0 14px}}h3{{font-size:20px;line-height:1.5;margin:12px 0}}a{{color:#e1c890;text-underline-offset:3px}}p{{max-width:1050px}}small,.muted{{color:var(--muted)}}small{{font-size:12px;display:block;overflow-wrap:anywhere}}.eyebrow{{font-size:13px;letter-spacing:.04em;color:var(--accent)}}.notice,.finding,.card{{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:20px}}.notice{{border-left:4px solid var(--accent)}}.metrics{{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:26px 0}}.card strong{{display:block;font-size:27px;color:var(--accent)}}nav{{display:flex;gap:12px 20px;flex-wrap:wrap;margin:24px 0;padding:16px 0;border-block:1px solid var(--line)}}.table{{overflow:auto}}table{{border-collapse:collapse;width:100%;font-size:14px}}td,th{{text-align:left;vertical-align:top;border-bottom:1px solid var(--line);padding:12px 10px}}th{{color:var(--accent)}}.compare{{display:grid;grid-template-columns:1fr 1fr;gap:14px}}figure{{margin:0}}figcaption{{font-size:13px;color:var(--muted);padding:5px 0}}img{{display:block;width:100%;border-radius:8px;border:1px solid var(--line)}}.finding{{margin:16px 0}}dt{{color:var(--accent);font-weight:650;margin-top:8px}}dd{{margin:0}}li{{margin:8px 0}}details{{margin:18px 0}}summary{{cursor:pointer;color:var(--accent);font-weight:650}}.tier{{white-space:nowrap;border:1px solid;padding:3px 7px;border-radius:5px}}.t1{{color:#d0d1d3}}.t2{{color:#8bc58d}}.t3{{color:#88baff}}.t4{{color:#f39591}}.t5{{color:#eed384}}.links{{display:flex;gap:16px;flex-wrap:wrap}}code{{font-size:.88em;overflow-wrap:anywhere}}@media(max-width:700px){{main{{padding:24px 16px 50px}}.metrics{{grid-template-columns:1fr 1fr}}.compare{{grid-template-columns:1fr}}h2{{font-size:23px}}}}@media print{{body{{background:white;color:#111}}main{{padding:0}}.finding,.notice,.card{{background:#f6f7f4;border-color:#bbb}}a,h2,h3,dt,th,.eyebrow,.card strong{{color:#263b26}}small,.muted{{color:#555}}details{{display:block}}.finding{{break-inside:avoid}}}}</style></head><body><main>
<div class="eyebrow">MOONFOREST · 2026.11.03 · 통합 담당 + 입력·배치·접근성 담당 교차 검토</div>
<h1>플레이 개선과<br>전반적인 최적화·병목 검토</h1>
<p class="notice"><b>{status}</b><br>일반 풍경의 불필요한 등급색 처리와 외곽선 반복 계산을 줄이고, 강공격 입력·대평원 구도·전 맵 상자 위치를 수정했습니다. 다음 단계는 공통 CPU 반복 작업과 준비 작업의 겹침을 줄이는 것입니다. 실제 기기 FPS·발열 개선 폭은 아직 측정하지 않았습니다.</p>
<div class="metrics"><div class="card"><strong>{counts['pass']:,}</strong>자동 검사 통과</div><div class="card"><strong>29개</strong>상자 위치·접근 검사</div><div class="card"><strong>1,210 → 1,209</strong>대평원 풍경 배치</div><div class="card"><strong>8K / 최대4K</strong>텍스처·기존 LOD 유지</div></div>
<div class="links"><a href="{e(game('warrior-plains'))}">대평원 접속</a><a href="{e(game('warrior-v5'))}">전사 v5 / 동굴 접속</a><a href="{e(game('warrior-v3'))}">마을 접속</a><a href="{e(game('warrior-v4'))}">마물의 숲 접속</a></div>
<nav><a href="#done">이번 수정</a><a href="#composition">대평원 전후</a><a href="#chests">상자 29개</a><a href="#assessment">현재 구조 평가</a><a href="#priority">작업 우선순위</a><a href="#environment">환경 병목</a><a href="#combat">전투·HUD 병목</a><a href="#verification">검증·배포·한계</a></nav>
<h2 id="done">이번에 반영한 수정</h2>
<div class="table"><table><tr><th>문제</th><th>원인과 수정</th><th>보존한 조건</th></tr>
<tr><td>일반 풍경까지 상자용 색상 처리</td><td>등급이 없는 풍경은 단색 외곽선 경로로 분리했습니다. 인스턴스마다 3개 색상값을 등록·갱신하던 일을 제거하고, 등급이 있는 소스만 색상 변형을 준비합니다.</td><td>상자 5등급 색, 굵기 0.028, 인스턴스 일괄 그리기 유지.</td></tr>
<tr><td>같은 외곽선 후보 반복 계산</td><td>한 선택 주기 안에서 모델별 LOD 정렬과 메시 삼각형 수를 재사용합니다. 540개 후보 검사에서 LOD 조회 450→1회, 삼각형 조회 300회 초과→4회로 줄고 선택 결과는 동일했습니다.</td><td>다음 선택 주기에 캐시를 비워 늦게 온 LOD·인덱스 변경 반영. 기존 거리·예산·정렬 보존.</td></tr>
<tr><td>사용하지 않는 외곽선 준비 대기</td><td>해당 소스와 LOD가 실제 사용하는 셰이더만 화면 준비 대상으로 검사합니다.</td><td>색상/단색 변형과 본체 준비를 건너뛰지 않음.</td></tr>
<tr><td>다른 모션 도중 충전한 강공격 소실</td><td>다른 손가락의 조이스틱·카메라 터치 취소가 공격 예약까지 지우던 전역 초기화를 분리했습니다. 긴 프레임에서 실제 누른 시간보다 충전이 짧아지던 문제도 실제 경과시간 기준으로 수정했습니다.</td><td>공격·회피·방패 모션 종료 뒤 강공격 1회. 창 이탈·메뉴·사망 시 입력 취소와 안전 정지는 유지.</td></tr>
<tr><td>대평원 중앙은 비고 외곽은 반복</td><td>마을 출구, 중앙 갈림길, 언덕 아래, 숲 입구에 기존 군집을 재배치했습니다. 입구 22m 안 나무 3→10개. 중앙에는 외곽 나무 5개·바위 2개·덤불 2개를 이동했습니다.</td><td>기존 에셋·큰 언덕·길과 통행 여유·포탈·100~200% 옵션 유지. 풍경 전체 수는 1개 감소.</td></tr>
<tr><td>길가에 단독으로 놓인 상자</td><td>마을 6·대평원 9·숲 7·동굴 7개를 기존 집·나무·수레·실제 암벽 곁에 놓고 열린 전면으로 방향을 정했습니다.</td><td>상자 ID·등급·보상·열림 저장키와 조건 모두 동일. 재접속 보상 중복 없음.</td></tr></table></div>
<p class="muted">작업 수 감소는 현재 코드와 실제 SDK 경로에서 확인했습니다. 이를 휴대폰 FPS 증가율로 환산하지 않았습니다.</p>
<h2 id="composition">대평원 배치 전후</h2><p>아래는 기존 모델·텍스처·지형을 사용한 오프라인 Blender 비교입니다. 세 구도의 전후 카메라는 동일합니다. 게임의 카툰 셰이더·안개·지면 세부 합성·실제 LOD 선택을 그대로 재현한 화면은 아닙니다. 배치와 조망 검토용이며 클릭하면 원본 크기로 열립니다.</p>
{views}
<p>나무 193→198개, 덤불 39→33개이며 바위 364개·지면 장식 580개는 유지했습니다. 중앙에서 나무가 더 보이므로 전체 개수가 줄어도 특정 구도의 GPU 비용이 줄었다고 보장할 수 없습니다. 중앙 조망은 다음 실기기 비교의 필수 구간입니다.</p>
<h2 id="chests">상자는 주변 맥락과 접근성을 함께 검사</h2><p>실제 지형과 충돌 데이터를 사용해 29개 모두 입구에서 전면 접근점까지 경로가 이어지고, 상호작용 시야가 통하는지 검사했습니다. 몸체의 9개 표본이 주변 장애물과 겹치지 않고, 바닥 높이 편차는 0.25m 미만입니다. 런타임의 빈자리 보정으로 다시 밀려나는 위치도 없습니다.</p>
<p>동굴 6개는 2.4m 안의 막힌 암벽 표본이 상자 바닥보다 최소 1.2m 높은지 확인했고, 연구실 상자는 기존 손수레 곁입니다. 이 2.4m는 정확한 벽 최단거리 측정값이 아니라 검증된 암벽이 존재하는 거리 상한입니다.</p>
<details><summary>상자 29개 위치와 지지물 보기</summary><div class="table"><table><tr><th>맵</th><th>상자 ID</th><th>등급</th><th>주변 맥락</th><th>좌표 X / Z</th><th>검사</th></tr>{chest_rows}</table></div></details>
<h2 id="assessment">현재 최적화 구조에 대한 판단</h2>
<p><b>상자 자체의 폴리곤만으로 모든 맵의 저하를 설명할 수는 없습니다.</b> 이번 조사에서는 상자 등급색 처리가 일반 풍경에도 확장된 공통 경로와 외곽선 선택의 반복 계산을 확인해 수정했습니다. 이 경로는 네 맵 모두에 영향을 줍니다. 다만 현재 실기기 A/B 기록이 없어 이것이 FPS 저하의 전부였다고 단정하지 않습니다.</p>
<p>배포 상자 메시의 기준 삼각형 수는 4,479개이며 같은 소스를 인스턴스로 사용합니다. 전체 상자 29개가 한 화면에 동시에 그려지는 구조도 아닙니다. 상자 수만 줄이는 조치보다 실제 보이는 상자·외곽선 제출 수와 공통 풍경의 CPU 작업을 나누어 보는 편이 근거가 있습니다.</p>
<div class="table"><table><tr><th>맵</th><th>풍경 배치</th><th>사용 에셋 종류</th><th>상자</th><th>중점 비교 구간</th></tr>{map_rows}</table></div><small>배치 수는 장면의 정적 배치 목록입니다. 동적 적·HUD·지형 전체와 최종 그리기 횟수를 뜻하지 않습니다.</small>
<div class="table"><table><tr><th>이미 적용된 방식</th><th>효과와 남은 한계</th></tr>
<tr><td>리소스 JSON·내용 해시·묶음 다운로드·캐시</td><td>변경된 파일만 교체하며 중복 다운로드를 줄입니다. 캐시가 있어도 디코드·씬 재구성·GPU 준비는 남습니다. 이번 모델/텍스처 리소스 그래프는 이전 배포와 동일합니다.</td></tr>
<tr><td>기존 LOD·16m 셀·시야/거리 제외·인스턴스</td><td>화면에 제출하는 양을 제한합니다. 여러 기능이 같은 후보를 따로 훑는 CPU 비용과 겹친 잎의 픽셀 비용까지 없애지는 못합니다.</td></tr>
<tr><td>고해상도 텍스처 1개씩 준비·교체 유예·상주 예산</td><td>반복 교체와 동시 업로드를 줄입니다. 압축 모바일 추가 배경 96MiB 예산은 플레이어8K·기본 LOD·프레임버퍼를 제외하므로 전체 GPU 메모리로 읽으면 안 됩니다.</td></tr>
<tr><td>CPU 디코드/지형/탐색 캐시·제한된 셰이더 보존</td><td>반복 준비 일부를 재사용하면서 메모리를 제한합니다. 작은 캐시가 왕복 시 유용 데이터를 내보내는지 hit/miss 측정이 필요합니다.</td></tr>
<tr><td>그림자·외곽선 후보 예산과 점진적 전환</td><td>품질을 유지하며 후보 수를 제한합니다. 스킨·양면 잎·여러 패스가 만드는 총 GPU 비용은 별도입니다.</td></tr>
<tr><td>기본30FPS·선택60FPS, 비활성 중지·거리별 보스 갱신</td><td>불필요한 상시 작업을 줄입니다. 60FPS는 같은 프레임 비용이어도 초당 일이 늘어납니다. 30FPS 유지 여부만으로 발열이 해결됐다고 판단할 수 없습니다.</td></tr>
<tr><td>비동기 GPU 진단·시간초과·수동 재시도·작업 세대 격리</td><td>긴 대기를 제한하고 원인 구분을 돕습니다. GPU 타이머 미지원은 측정 불가이며 0ms가 아닙니다. 취소된 작업의 늦은 완료를 계속 회귀 검사해야 합니다.</td></tr></table></div>
<p>대평원 거리 200%는 안개·가시 거리·미리 준비할 범위를 넓히며 기존 LOD 단계 자체는 바꾸지 않습니다. 모바일 셀 거리 82→164m, 메시 거리 90→180m입니다. 기본은 100%이고 다른 맵에는 적용되지 않습니다. 탐험하며 준비한 지오메트리는 맵 해제까지 남으므로 고해상도 텍스처 예산만으로 장면 총량을 통제할 수는 없습니다.</p>
<p><b>첫 접속의 JavaScript 준비도 따로 봐야 합니다.</b> 이번 빌드의 주요 앱 청크는 약 2.53MB(압축 0.55MB), 큰 Babylon 청크는 약 5.99MB(압축 1.27MB)입니다. 런타임 참조 그래프는 254개 청크로 누락 없이 검증됐지만, 다운로드 크기만으로 파싱·컴파일·초기 실행 비용을 설명하지 못합니다. 최초 진입 지연에서 이 비용을 분리 계측하고, 나중에만 쓰는 기능을 분리할 때는 이전 탭의 삭제된 청크 요청·재시도 회귀까지 검사해야 합니다. 이 항목을 평상시 전투 FPS 저하의 확정 원인으로 보지는 않습니다.</p>
<h2 id="priority">다음 작업의 우선순위</h2>
<ol><li><b>P0 · 최신 버전의 비교 기준 고정.</b> 같은 기기·위치·시점·렌더 크기·30/60FPS·대평원100/200%를 구분해 수집합니다. 11월 1일 구버전 로그를 이번 버전의 결과로 재사용하지 않습니다.</li>
<li><b>P1 · 반복 계산부터 줄이기.</b> 같은 프레임의 시야 검사, 실제 이동하지 않은 적의 두 번째 보정, 외곽선·가림 통계용 임시 배열을 먼저 정리합니다. 기존 선택·충돌 결과와 완전히 같은지 자동 비교합니다.</li>
<li><b>P1 · 준비 작업이 한 프레임에 겹치는 경로 제어.</b> 풍경 지오메트리·의뢰 소품·보스·고해상도 업로드가 각각 직렬이어도 서로 겹칠 수 있습니다. 하나의 제한된 작업 예산으로 중첩을 줄이는 후보를 실측합니다. 필요한 물체가 늦게 나타나는 부작용도 함께 검사합니다.</li>
<li><b>P1 · GPU가 실제 병목일 때 패스별 처리.</b> 잎·그림자·외곽선·캐릭터를 분리 계측하고 중복 거리 계산과 준비용 제출만 동등한 출력 조건에서 줄입니다. 외곽선 끄기·텍스처 축소·그림자 모션 저하는 적용하지 않습니다.</li>
<li><b>P2 · 반복 왕복과 장시간 플레이.</b> 캐시 보존 정책과 금화·진단·동굴 갱신을 정리하고, 자원이 워밍업 후 일정 범위에 머무는지 검사합니다. 메모리 증가가 유용한 제한 캐시인지 누수인지 분리합니다.</li></ol>
<h2 id="environment">환경·로딩의 병목 가능 구간</h2><p>아래 항목은 후속 계획입니다. 이번 배포에서 모두 수정했다고 표현하지 않습니다. 반복 경로는 코드로 확인했으며 실기기 프레임 비용과 우선순위는 다음 측정으로 좁혀야 합니다.</p>{environment_cards}
<h2 id="combat">전투·애니메이션·HUD의 비효율 후보</h2>{combat_cards}
<h2 id="verification">검증 결과와 배포 기준</h2>
<ul><li>현재 통합 코드의 전체 자동 검사 <b>{counts['pass']:,}/{counts['tests']:,}</b> 통과, 실패·취소 0건.</li>
<li>실제 HUD 이벤트 처리·입력·프레임 루프·전사 제어를 연결한 검사에서 공격/회피/방패 모션 도중 길게 누르기, 놓기, 다른 손가락 취소, 15/30/60FPS 및 300ms 정지 후 예약 강공격 1회 실행을 확인했습니다.</li>
<li>네 맵의 실제 의뢰 포인트·상자 지오메트리를 사용하는 SDK 검사에서 로드·해제 8회 후 워밍업 기준 자원 수가 일정했습니다. 가림과 늦은 LOD의 외곽선 결합도 검사했습니다.</li>
<li>상자 29개 실제 지형·충돌·전면 접근·입구 경로 검사 통과. 전체 포인트의 위치/방향을 제외한 메타데이터 해시가 이전과 같습니다.</li>
<li>플레이어8K·배경최대4K·기존LOD·등급 보상·대평원100~200%를 유지했습니다. 추가 에셋 생성과 브라우저 자동조작은 하지 않았습니다.</li>
<li>배포 목록 {len(deployment['files']):,}개, {deployment['bytes']/1024/1024:.1f}MiB의 파일 해시·리소스 JSON·묶음 관계를 검증합니다. 이는 배포 목록 전체 용량이며 첫 접속 다운로드량이 아닙니다.</li></ul>
<p class="notice"><b>검증 범위의 한계</b><br>Node/Babylon NullEngine 검사는 코드·그리기 제출·자원 수명 검증이며 실제 GPU 픽셀 출력이나 폰 발열 측정이 아닙니다. 풍경/대체 LOD 및 가림 벽은 통제된 검사 데이터도 포함합니다. Blender 비교는 구도 검토용입니다. 네 실제 맵을 휴대폰에서 왕복해 모두 안정화됐다는 주장이나 2~3초 이동·60FPS 보장은 하지 않습니다.</p>
<h3>실기기에서 결론을 내릴 비교 절차</h3><ol><li>기기 온도·전원 상태와 화질을 맞추고 네 맵을 한 번 방문해 캐시를 준비합니다. 이후 동일 순서로 3회 왕복합니다. 30FPS와60FPS는 별도로 비교합니다.</li><li>각 맵에서 10초 정지 → 20초 같은 방향 회전 → 같은 길 이동을 기록합니다. 대평원은 입구·갈림길·언덕·숲 경계에서100%와200%를 별도로 기록합니다.</li><li>동굴은 성녀→마녀 변신, 시전 중 공격·회피·방패 후 강공격, 사망·10초 소멸, 재시작을 비교합니다. 100~250ms 멈춤은 최초 화면준비/텍스처 준비/변신/소멸/전투 판정 중 어느 단계인지 이벤트와 함께 분류합니다.</li><li>frame p95·최대값·CPU 제출·장면·애니메이션·접촉·draw calls·실제 활성 셀/LOD·캐시 hit/miss·업로드 횟수를 함께 봅니다. GPU 타이머는 유효한 비동기 결과만 비교하고 CPU 시간과 더하지 않습니다.</li><li>진단 OFF/ON도 번갈아 비교해 관찰 비용을 구분합니다. 지원되지 않는 JS/GPU 메모리는 추정치로 채우지 않습니다. 왕복 횟수에 따라 자원 수가 계속 증가하는지 확인합니다.</li></ol>
<h3>채택 조건</h3><p>플레이어·상자·보스의 외형과 텍스처, 기존 LOD 선택, 그림자·외곽선, 장판 범위·피해·입력 예약·벽 가림이 동일해야 합니다. 같은 조건에서 프레임 p95 또는 준비 지연의 개선이 재현되고, 메모리와 끊김이 악화되지 않을 때만 후속 최적화를 채택합니다. 무제한 병렬 로드·전 맵 GPU 상주·임의 화질 감소는 해결책으로 사용하지 않습니다.</p>
<h3>증거 파일</h3><p>{evidence_links} · <a href="validation-summary.json">통합 검사 요약 JSON</a></p>
<p class="muted">기준 배포 d03de5b → 이번 통합 수정. 근거의 파일:줄 표시는 이번 소스의 검토 위치입니다. 변경 이후 줄 번호는 달라질 수 있습니다. 실제 배포 상태: {status}.</p>
</main></body></html>'''
(out/'index.html').write_text(page, encoding='utf-8')
print(json.dumps({'report':str(out/'index.html'),'tests':counts,'deployed':bool(rev),'chests':chests['chests'],'resourceGraphUnchanged':True},ensure_ascii=False))
