import html,json,re,shutil,subprocess
from pathlib import Path

folder=Path(__file__).resolve().parent
app=folder.parents[1];repo=app.parent
out=Path('C:/Users/ryank/Documents/ChatGPT/MM Project/output/clone-upload-review/2026-11-03')
out.mkdir(parents=True,exist_ok=True)
def read(name):return json.loads((folder/name).read_text(encoding='utf-8-sig'))
def esc(value):return html.escape(str(value))
log=(folder/'all-tests.log').read_text(encoding='utf-8-sig')
tests={key:int(re.search(r'ℹ '+key+r' (\d+)',log).group(1)) for key in ['tests','pass','fail','cancelled']}
assert tests['tests']==tests['pass'] and tests['fail']==tests['cancelled']==0
clone=read('clone-comparison.json');assert all(r['boundsAndPropertiesEqual'] for r in clone['results'])
upload=read('upload-validation.json');assert upload['passed'] and len(upload['cases'])==8
life=read('four-map-lifecycle.json');assert len(life['maps'])==4
unchanged=['src/input.js','src/warrior-v2.js','src/player-strikes.js','src/melee-collision.js','src/enemy-death.js','src/elena-spec.js','src/mourning-elena-animation.js','src/village-lod.js','src/village-shadow-policy.js']
assert not subprocess.check_output(['git','diff','c020469','--',*[f'ArcherPreview/{p}' for p in unchanged]],cwd=repo)
original=json.loads(subprocess.check_output(['git','show','c020469:ArcherPreviewSite/assets/resource-index.json'],cwd=repo))
resource=json.loads((repo/'ArcherPreviewSite/assets/resource-index.json').read_text(encoding='utf-8'))
assert resource==original
live=read('live-verification.json') if (folder/'live-verification.json').exists() else {}
revision=live['commit'][:7] if live.get('passed') else ''
summary={'baseline':'c020469','tests':tests,'resourceGraphUnchanged':True,'resourceRevision':resource['revision'],
 'unchangedRuntimeContracts':unchanged,'browserAutomation':False,'physicalDeviceTested':False,
 'deployment':live if revision else {'status':'pending'},
 'scope':['Native outline clone with unchanged posed bounds; omit unused per-vertex point cache only during construction','Resident adopt/reuse versus independent bear/goblin clone confirmed with synchronous CPU timing records','Identical morph texture payloads are prepared once through a scoped loader option','Four-map load/revisit/cancel/retry and full gameplay regressions'],
 'limits':['NullEngine measures SDK calls and CPU work, not actual GPU driver upload time or mobile FPS.','Ordinary model clones still perform required posed bounds and preserve independent rigs.','Outline cache omission applies only to current non-pickable, non-collision silhouettes. A future direct intersection workflow needs the normal posed refresh.','No guarantee that every physical-device 100-250ms stall is eliminated.']}
(folder/'validation-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
names={'warrior-v3':'전사','guardian-bear':'곰','hooded-goblin':'고블린','elena':'타락한 성녀','mourning-elena':'비탄의 마녀','village':'마을','great-plains':'대평원','monster-forest':'마물의 숲','witch-cave':'마녀의 동굴'}
rows=''.join(f'<tr><th>{names[r["id"]]}</th><td>{esc(r["name"])}</td><td>{r["vertices"]:,}개</td><td>{r["warmMedianMs"]["native"]:.2f} → {r["warmMedianMs"]["optimized"]:.2f}ms</td><td>동일</td></tr>' for r in clone['results'])
lifeRows=''.join(f'<tr><th>{names[r["map"]]}</th><td>{r["revisits"]}</td><td>{r["cancelRetry"]}</td><td>{r["lateDisposed"]}</td></tr>' for r in life['maps'])
artifacts=sorted(p.name for p in folder.glob('*.json') if p.name not in ['staged-paths.json','release-status.json','report-validation.json'])
for filename in artifacts:shutil.copy2(folder/filename,out/filename)
links=' · '.join(f'<a href="{esc(f)}">{esc(f)}</a>' for f in artifacts)
url=lambda character:'https://ranke0802.github.io/moonforest/ArcherPreviewSite/?character='+character+'&uiTest=1'+('&rev='+revision if revision else '')
status='배포 완료 · '+revision if revision else '검증 완료 · 배포 확인 중'
page=f'''<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>모델 복제·최초 GPU 입력 준비 개선</title><style>
*{{box-sizing:border-box}}body{{margin:0;background:#131b19;color:#e6eee7;font:16px/1.85 system-ui,sans-serif}}main{{max-width:1100px;margin:auto;padding:36px 22px 70px}}h1{{font-size:36px;line-height:1.4}}h2{{margin:34px 0 12px;font-size:24px;color:#cadcb4}}a{{color:#d8c48d}}.muted,small{{color:#afbeb4}}.callout{{padding:20px;border:1px solid #526a51;background:#213126;border-radius:10px}}table{{width:100%;border-collapse:collapse;font-size:14px}}td,th{{border-bottom:1px solid #3a4b40;padding:11px 10px;text-align:left}}.table{{overflow:auto}}li{{margin:9px 0}}.grid{{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:22px 0}}.grid div{{background:#213126;padding:18px;border-radius:8px}}.grid b{{display:block;font-size:27px;color:#d0e4b9}}summary{{cursor:pointer;color:#d0e4b9}}pre{{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}}@media(max-width:650px){{main{{padding:24px 16px}}h1{{font-size:27px}}.grid{{grid-template-columns:1fr}}}}</style></head><body><main>
<small>MOONFOREST · 2026.11.03 · 기준 c020469 · 브라우저 자동조작 없음</small><h1>모델 복제와 최초 GPU 입력 준비<br>순간 부하 추가 개선</h1>
<p class="callout"><b>{status}</b><br>외곽선 생성의 미사용 정점 캐시와 마녀 모프 텍스처의 중복 준비를 줄였습니다. 전투 입력·판정·모션과 플레이어8K·배경최대4K·기존LOD는 유지합니다.</p>
<p><a href="{esc(url('warrior-v3'))}">마을</a> · <a href="{esc(url('warrior-plains'))}">대평원</a> · <a href="{esc(url('warrior-v4'))}">마물의 숲</a> · <a href="{esc(url('warrior-v5'))}">전사 v5 / 마녀의 동굴</a></p>
<div class="grid"><div><b>{tests['pass']:,}개</b>전체 자동 검사 통과</div><div><b>약 12.4MiB</b>마녀 초기 모프 중복 입력 제거</div><div><b>리소스 동일</b>모델·텍스처·LOD JSON 유지</div></div>
<h2>무엇이 병목이었나</h2><ol>
<li><b>외곽선 복제:</b> Babylon은 초기 복제에서 스킨·모프를 적용해 경계를 계산하면서 정점마다 Vector3 객체를 만들었습니다. 외곽선은 선택·충돌 대상으로 사용하지 않으므로 이 점 배열은 불필요했습니다. 기존 SDK 복제와 정확한 경계 계산은 유지하고 초기 점 캐시만 생략했습니다. 사용자 정의 복제·갱신이나 복제 관찰자가 있으면 원래 경로를 사용합니다.</li>
<li><b>일반 모델 복제:</b> 곰·고블린은 독립 스켈레톤과 애니메이션 상태가 필요합니다. 비용의 큰 부분은 초기 자세의 경계 계산이었습니다. 정확성을 손상시킬 수 있는 계산 생략은 적용하지 않았습니다. 성녀·마녀는 이미 직접 채택·재사용하므로 일반 경로의 전체 모델 복제는 0회입니다.</li>
<li><b>마녀의 초기 모프 입력:</b> 로더가 모프 관리자 동결을 풀어 텍스처를 만든 뒤, 최대 모프 슬롯 수를 바꾸며 같은 텍스처를 다시 만들었습니다. 본체 12,976,128바이트와 입 안쪽 8,960바이트가 각각 동일한 내용으로 두 번 준비됐습니다. 해당 로더에만 최대 슬롯 설정을 앞당겨 같은 결과를 한 번에 준비하도록 변경했습니다.</li>
<li><b>실제 첫 그리기:</b> 검사한 경로에서는 최초 표시 시 대형 지오메트리나 모프 텍스처가 새로 만들어지지 않았습니다. 남아 있는 매 프레임 뼈 행렬 갱신은 애니메이션을 유지하는 정상 작업입니다. 이를 줄이거나 프레임을 건너뛰지 않았습니다.</li></ol>
<h2>외곽선 생성 CPU 비교</h2><div class="table"><table><tr><th>모델</th><th>메시</th><th>미사용 점 객체 생략</th><th>기존 → 수정 중앙값</th><th>경계·셰이더 입력</th></tr>{rows}</table></div>
<p class="muted">실제 배포 모델 5종의 외곽선 8개를 Node/Babylon NullEngine에서 교차 비교했습니다. 텍스처 이미지는 생략했습니다. 전체 다운로드·모델 로딩·GPU 업로드·휴대폰 프레임 시간이 아니라 외곽선 구성 단계의 CPU 시간입니다. 정점 수는 삼각형 수와 다릅니다.</p>
<h2>조작감·외형·자원 수명 검증</h2><ul>
<li>geometry·UV·인덱스·스켈레톤·모프 공유, 로컬/월드 경계, 행렬·바인드 포즈·submesh·가시성·외곽선 재질 및 셰이더 입력을 비교했습니다.</li>
<li>곰 5마리 → 2마리 → 5마리 재소환에서 추가 모델 복제와 모델 자원 증가가 없음을 확인했습니다.</li>
<li>전투 판정은 원본 검·방패와 몸체를 사용합니다. 외곽선을 향후 직접 교차 판정이나 충돌에 사용하려면 기존 posed refresh로 점 배열을 준비해야 합니다.</li>
<li>모델의 동기 복제·채택·노드 수집 시간을 기존 준비 진단에 값 복사로 추가했습니다. CPU 시간이며 네트워크 대기나 GPU 완료 시간이 아닙니다.</li></ul>
<h2>네 맵 왕복·재시도</h2><div class="table"><table><tr><th>맵</th><th>재방문</th><th>취소 후 재시도</th><th>늦은 자원 해제</th></tr>{lifeRows}</table></div>
<p>네 맵의 실제 지형과 배치·배포 지오메트리를 사용한 수명 검사입니다. 전체 회귀 검사에는 보스 준비·변신·사망·재시작, 강공격 입력과 전투 판정, 맵 전환·시간 초과 후 재시도가 포함됩니다.</p>
<h2>확인 범위와 남은 한계</h2><p class="callout">GPU 입력 바이트 감소와 실제 GPU 처리 시간은 다릅니다. 이번에는 SDK의 생성·갱신 호출과 데이터 동일성, CPU 작업을 확인했습니다. 브라우저 자동조작이나 실기기 측정은 하지 않았으므로 S23/iPhone의 100~250ms 멈춤이 모두 사라졌다고 판정하지 않았습니다.</p>
<p>일반 보스 복제의 자세 계산, 정상적인 최초 텍스처·버퍼 준비, 드라이버 처리 지연은 남아 있습니다. 강제 숨김 렌더, 새 렌더 타깃, GPU 완료 동기 대기, 해상도·LOD 하향은 추가하지 않았습니다.</p>
<h2>검증 자료</h2><p>{links}</p><details><summary>초기 업로드 준비 검증 원문</summary><pre>{esc(json.dumps(upload,ensure_ascii=False,indent=2))}</pre></details></main></body></html>'''
(out/'index.html').write_text(page,encoding='utf-8')
print(json.dumps({'report':str(out/'index.html'),'tests':tests,'resourceGraphUnchanged':True,'deployed':bool(revision)},ensure_ascii=False))
