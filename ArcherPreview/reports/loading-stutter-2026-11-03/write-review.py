import html,json,re,shutil,subprocess
from pathlib import Path

folder=Path(__file__).resolve().parent
app=folder.parents[1];repo=app.parent
out=Path('C:/Users/ryank/Documents/ChatGPT/MM Project/output/loading-stutter-review/2026-11-03')
out.mkdir(parents=True,exist_ok=True)
def read(name):return json.loads((folder/name).read_text(encoding='utf-8-sig'))
def esc(value):return html.escape(str(value))
log=(folder/'all-tests.log').read_text(encoding='utf-8-sig')
tests={key:int(re.search(r'ℹ '+key+r' (\d+)',log).group(1)) for key in ['tests','pass','fail','cancelled']}
assert tests['tests']==tests['pass'] and tests['fail']==tests['cancelled']==0
promotion=read('promotion-bounds.json');shader=read('shader-cache-validation.json');assert shader['passed']
assert all(row['exactBoundsAndFrustum'] for row in promotion['results'])
lifecycle=read('four-map-lifecycle.json');assert len(lifecycle['maps'])==4
summon=read('boss-incremental-summon.json');resident=read('resident-preparation.json')
unchanged=['src/input.js','src/warrior-v2.js','src/player-strikes.js','src/enemy-death.js','src/elena-spec.js','src/mourning-elena-animation.js','src/village-lod.js','src/village-shadow-policy.js']
assert not subprocess.check_output(['git','diff','71f9165','--',*[f'ArcherPreview/{p}' for p in unchanged]],cwd=repo)
original=json.loads(subprocess.check_output(['git','show','71f9165:ArcherPreviewSite/assets/resource-index.json'],cwd=repo))
resource=json.loads((repo/'ArcherPreviewSite/assets/resource-index.json').read_text(encoding='utf-8'))
assert resource==original
live=read('live-verification.json') if (folder/'live-verification.json').exists() else {}
revision=live['commit'][:7] if live.get('passed') else ''
status='배포 완료 · '+revision if revision else '검증 완료 · 배포 확인 중'
summary={'baseline':'71f9165','tests':tests,'resourceGraphUnchanged':True,'resourceRevision':resource['revision'],
 'unchangedRuntimeContracts':unchanged,'browserAutomation':False,'physicalDeviceTested':False,
 'deployment':live if revision else {'status':'pending'},
 'verified':['Four-map actual static LOD bounds and frustum equivalence','Four-map revisit, cancellation, retry and stale completion isolation','Real packed bear/goblin incremental preparation and hidden group publication','Packed saint/witch cold/reset/transform initial pose and shader Effect reuse','Bounded foreground preparation diagnostic snapshots'],
 'limits':['Node/NullEngine is not a browser or physical GPU/thermal/FPS measurement.','SDK model and outline cloning remain synchronous; no claim that every 100-250ms pause is eliminated.','Preparation is distributed to reduce per-frame work; total load/summon latency is not guaranteed to decrease.']}
(folder/'validation-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
names={'village':'마을','great-plains':'대평원','monster-forest':'마물의 숲','witch-cave':'마녀의 동굴'}
rows=''.join(f'<tr><th>{names[r["map"]]}</th><td>{r["instances"]}개</td><td>{r["oracleDataReads"]} → {r["optimizedDataReads"]}</td><td>{r["medianMs"]["original"]:.2f} → {r["medianMs"]["optimized"]:.2f}ms</td><td>동일</td></tr>' for r in promotion['results'])
life=''.join(f'<tr><th>{names[r["map"]]}</th><td>{r["revisits"]}</td><td>{r["cancelRetry"]}</td><td>{r["lateDisposed"]}</td></tr>' for r in lifecycle['maps'])
artifacts=['validation-summary.json','promotion-bounds.json','four-map-lifecycle.json','boss-incremental-summon.json','resident-preparation.json','shader-cache-baseline.json','shader-cache-validation.json','auxiliary-shader-audit.json','shader-path-assessment.json','independent-shader-review.json','core-validation.json','setup-validation.json','three-way-validation.json','map-compressed-lifecycle.json']
for filename in artifacts:shutil.copy2(folder/filename,out/filename)
links=' · '.join(f'<a href="{esc(filename)}">{esc(filename)}</a>' for filename in artifacts)
url=lambda character:'https://ranke0802.github.io/moonforest/ArcherPreviewSite/?character='+character+'&uiTest=1'+('&rev='+revision if revision else '')
page=f'''<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>로딩·보스 등장과 사망의 순간 멈춤 개선</title><style>
*{{box-sizing:border-box}}body{{margin:0;background:#131b19;color:#e6eee7;font:16px/1.85 system-ui,sans-serif}}main{{max-width:1060px;margin:auto;padding:36px 22px 70px}}h1{{font-size:36px;line-height:1.4}}h2{{margin:34px 0 12px;font-size:24px;color:#cadcb4}}a{{color:#d8c48d}}.muted,small{{color:#afbeb4}}.callout{{padding:20px;border:1px solid #526a51;background:#213126;border-radius:10px}}table{{width:100%;border-collapse:collapse;font-size:14px}}td,th{{border-bottom:1px solid #3a4b40;padding:11px 10px;text-align:left}}.table{{overflow:auto}}li{{margin:9px 0}}.grid{{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:22px 0}}.grid div{{background:#213126;padding:18px;border-radius:8px}}.grid b{{display:block;font-size:27px;color:#d0e4b9}}summary{{cursor:pointer;color:#d0e4b9}}pre{{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}}@media(max-width:650px){{main{{padding:24px 16px}}h1{{font-size:27px}}.grid{{grid-template-columns:1fr}}}}</style></head><body><main>
<small>MOONFOREST · 2026.11.03 · 기준 71f9165 · 브라우저 자동조작 없음</small><h1>로딩·보스 등장과 사망의<br>순간 멈춤 개선</h1>
<p class="callout"><b>{status}</b><br>확인된 반복 계산을 줄이고, 등장·사망 직후로 밀리던 셰이더 준비를 숨겨진 준비 단계로 옮겼습니다. 전투 입력·피격 판정·모션·사망 시간·플레이어8K·배경최대4K·기존LOD를 유지합니다.</p>
<p><a href="{esc(url('warrior-v3'))}">마을</a> · <a href="{esc(url('warrior-plains'))}">대평원</a> · <a href="{esc(url('warrior-v4'))}">마물의 숲</a> · <a href="{esc(url('warrior-v5'))}">전사 v5 / 마녀의 동굴</a></p>
<div class="grid"><div><b>{tests['pass']:,}개</b>전체 자동 검사 통과</div><div><b>4개 맵</b>실제 지형·모델과 수명 검증</div><div><b>리소스 동일</b>텍스처·모델·LOD JSON 유지</div></div>
<h2>확인된 원인과 반영 내용</h2><ol>
<li><b>풍경 모델이 더 정밀한 LOD로 바뀔 때:</b> 같은 소스 정점을 인스턴스마다 다시 읽어 경계를 계산했습니다. 이제 안전한 정적 모델은 소스 경계를 각 인스턴스의 독립 경계에 복사하고 월드 좌표와 충돌 캐시를 기존 순서로 갱신합니다. 변형·잠긴 경계·다중 서브메시·사용자 정의 동작은 기존 SDK 경로를 사용합니다. 초기 createInstance는 이미 효율적으로 처리돼 변경하지 않았습니다.</li>
<li><b>소환 준비를 한 번에 실행:</b> 곰·고블린은 성녀 계열과 달리 정점 검사·외곽선 준비를 동기 경로로 수행했습니다. 기존 증분 준비 예산을 연결하고, 여러 마리는 전부 숨긴 채 준비한 다음 함께 활성화합니다. 다른 종류의 기존 적은 계속 동작합니다.</li>
<li><b>실제로 준비되지 않은 불투명 셰이더:</b> 준비 프레임에 장면 렌더가 없으면 엔진의 동일 renderId 최적화가 반투명 상태의 성공 결과를 불투명 상태에도 재사용했습니다. 현재 동결하지 않는 보스 재질에서 준비 호출 동안만 실제 재검사를 강제하고 설정을 즉시 복원합니다. 원래 경로에서 첫 등장 시 새 PBR Effect 1개가 생성되는 사례를 재현했습니다.</li>
<li><b>사망 첫 순간의 흰 피격 효과:</b> 엘레나는 불투명일 때와 사라지기 시작할 때 사용하는 피격 패스가 다릅니다. 남은 흰 효과와 첫 fade가 겹칠 때 새 outline Effect 1개가 생성됐습니다. 정확한 기존 오버레이 패스를 미리 준비해, 검증한 첫 등장·fade·복원 순서에서 새 Effect가 0개임을 확인했습니다. 색·투명도·실제 그리기 방식은 바꾸지 않았습니다.</li>
<li><b>첫 소환·첫 공격의 보조 표시:</b> 성녀·마녀의 발밑 접지 효과와 곰·고블린의 공격 예고 고리는 본체 준비 대상에서 빠져 있었습니다. 기존 효과를 숨긴 상태에서 먼저 준비하고 같은 자원을 재사용합니다. 접지 크기와 예고 범위·타이밍은 유지합니다.</li><li><b>진단 근거 보강:</b> 성녀·마녀의 전경 소환·변신 완료/실패/취소 기록에 준비 블록과 단계별 CPU 시간을 값 복사로 저장합니다. 기존 진단 복사의 bossComparison.preparation에서 확인할 수 있습니다.</li></ol>
<h2>풍경 승격의 경계 갱신 비교</h2><div class="table"><table><tr><th>맵</th><th>인스턴스</th><th>정점 데이터 읽기 전 → 후</th><th>경계 갱신 CPU 전 → 후</th><th>경계·시야 판정</th></tr>{rows}</table></div>
<p class="muted">해당 맵의 실제 정적 모델과 여러 고정 인스턴스를 사용한 데스크톱 NullEngine 비교입니다. 읽기 횟수의 최적화 수치에는 소스 준비를 포함하고, CPU 수치는 인스턴스 경계 갱신 단계만 교차 순서로 비교한 중앙값입니다. 전체 모델 로딩·GPU 업로드·한 프레임 시간이 아닙니다.</p>
<h2>소환·변신·사망 검증</h2><ul><li>네 맵에서 실제 곰·고블린 모델의 동기 준비 결과와 증분 준비 결과를 비교했습니다. 메시·외곽선·본 영향 수·애니메이션·초기 상태를 유지했습니다.</li><li>여러 보스의 준비 프레임마다 요청된 보스의 표시·활성·그림자가 꺼져 있고, 다른 종류의 기존 적은 계속 동작하는지 검사했습니다.</li><li>실제 성녀·마녀 모델의 첫 등장·재소환·숨겨진 광폭화 준비·변신 초기 포즈를 비교했습니다. 준비된 모델과 모션은 재사용합니다.</li><li>고정 renderId, 기존 불투명 셰이더 유무, 최초 피격·반투명 전환·복원, 스킨·모프 변형과 기존 shadow/overlay 패스를 검사했습니다. 준비 취소·시간 초과·셰이더 실패 시 상태 복원과 늦은 폴링 중단도 확인했습니다.</li></ul>
<h2>네 맵 왕복과 취소</h2><div class="table"><table><tr><th>맵</th><th>재방문</th><th>취소 후 재시도</th><th>늦게 완료된 자원 해제</th></tr>{life}</table></div>
<p>실제 배치·압축 해제된 배포 지오메트리를 사용한 Node/SDK 수명 검사입니다. 전체 회귀에는 기존 강공격·피격·돌진·변신·사망·재시작 및 디코더 시간 초과·맵 왕복 검사도 포함됐습니다. 배포 목록 전체의 해시와 리소스 JSON을 검증하고 공개된 변경 파일을 다시 대조합니다.</p>
<h2>유지한 처리와 남은 한계</h2><p>성녀의 animator 재생성은 측정된 이득이 작았고, 마녀의 reset은 천·모핑 초기화 의미가 있어 제거하지 않았습니다. 독립 검토에서 동결한 PBR 재질의 준비 생략은 별도 경로임을 확인했습니다. 현재 보스는 동결하지 않으며 실제 모델 검사에서 이를 고정합니다. 보스 모델 복제와 외곽선 복제, 일부 glTF 준비 및 최초 GPU 업로드는 여전히 한 번에 실행될 수 있습니다. 작은 준비 블록의 최대 시간만 보고 전체 프레임 멈춤이 해소됐다고 해석하면 안 됩니다.</p>
<p class="callout"><b>실기기 100~250ms 멈춤이 모두 사라졌다는 판정은 하지 않았습니다.</b><br>이번 검증은 실제 SDK의 계산·캐시·상태·자원 수명에 대한 것입니다. NullEngine은 GPU 드라이버 컴파일과 텍스처 업로드 시간을 측정하지 않습니다. 실기기 FPS·온도·화면 검수는 하지 않았습니다. 준비를 여러 프레임에 나누므로 전체 소환 대기 시간이 반드시 짧아지는 것도 아닙니다.</p>
<h2>근거 파일</h2><p>{links}</p><details><summary>셰이더 캐시 검증 세부 기록</summary><pre>{esc(json.dumps(shader,ensure_ascii=False,indent=2))}</pre></details>
</main></body></html>'''
(out/'index.html').write_text(page,encoding='utf-8')
print(json.dumps({'report':str(out/'index.html'),'tests':tests,'resourceGraphUnchanged':True,'deployed':bool(revision)},ensure_ascii=False))
