import html,json
from pathlib import Path

base=Path(__file__).parent
read=lambda name:json.loads((base/name).read_text(encoding='utf-8-sig'))
escape=lambda value:html.escape(str(value))
release=read('release-review.json'); assessment=read('ab-assessment.json')
names={'village':'마을','great-plains':'대평원','monster-forest':'마물의 숲','witch-cave':'마녀의 동굴'}
rows=''
for row in assessment['views']:
    candidates=row['candidates']; active=row['activeEvaluationIncludingProviderMs']
    view='입구 시점' if row['view']=='fixed-front' else '반대 시점'
    rows+=f'<tr><td>{names[row["map"]]} · {view}</td><td>{candidates["before"]:,} → {candidates["after"]:,}</td><td>{active["baseline"]["median"]:.3f} → {active["new"]["median"]:.3f} ms</td><td>동일</td></tr>'
items=lambda values:''.join('<li>'+escape(value)+'</li>' for value in values)
url=f'<a class="button" href="{escape(release["url"])}">수정본 열기</a>' if release.get('url') else ''
document='''<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MOONFOREST · 렌더 후보와 그리기 지연 검수</title><style>
*{box-sizing:border-box}body{margin:0;background:#111b18;color:#e9eee8;font:16px/1.8 system-ui,sans-serif}main{max-width:1080px;margin:auto;padding:40px 24px 72px}h1{font-size:clamp(28px,5vw,42px);line-height:1.35}h2{font-size:23px;margin-top:34px}.panel{padding:20px 24px;background:#1c2d24;border:1px solid #405947;border-radius:12px;margin:18px 0}.note{border-left:4px solid #cbb47c;background:#2b2c22;padding:18px 22px}.muted,small{color:#b4c5b9}a{color:#d7e9c4}li{margin:8px 0}.scroll{overflow:auto}table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}td,th{padding:11px;text-align:left;border-bottom:1px solid #3c5144;white-space:nowrap}.button{display:inline-block;padding:8px 18px;border:1px solid #bdcea9;border-radius:6px;text-decoration:none}@media(max-width:600px){main{padding:24px 18px}.panel{padding:16px}}@media print{body,.panel,.note{color:#111;background:white}.muted,small{color:#444}}</style></head><body><main>
<small>MOONFOREST / 2026.11.04 / index-CCxf0g6u.js 로그 후속</small><h1>화면을 보존하며 후보 검사 감소<br>그리기 지연의 세부 진단 추가</h1><p>PRESERVED</p><div class="panel"><strong>판단: 제한된 범위에서 적용</strong><p>DECISION</p><p>STATUS</p>URL</div>
<h2>사용자 분석에서 확인된 부분</h2><p>저장된 지연 기록 32건 중 31건은 텍스처 작업이 idle이었고, 모델 대기까지 0인 기록은 28건입니다. 대평원 96초 구간에서 Active Mesh 최대 18.3ms, Draw Submission 최대 33.8ms가 관측돼 텍스처 업로드만으로 설명할 수 없습니다. 121.4초 Active Mesh 35.4ms도 별도 병목 조사 대상입니다.</p><p>40.66FPS는 최근 1초 값입니다. 최근 약 10초의 413표본은 평균 24.28ms, 역수 약 41.19FPS이며, 233/413개가 목표 초과 기준 20.83ms를 넘었습니다. 이전 로그와 위치·카메라·기기 열 상태가 달라 패치의 직접 회귀로 확정할 수 없습니다.</p><div class="note">프레임 간격 119.5ms는 현재 프레임 시작까지의 간격이고, JS 제출 25.4ms는 그 이후의 작업입니다. 동일 구간의 CPU/GPU 분해로 해석할 수 없습니다. GPU는 이 기기 로그에서 미지원이며 브라우저 스케줄링·드라이버 대기도 남아 있습니다.</div>
<h2>UX·UI에 영향을 주지 않는 적용 범위</h2><p>맵에는 이미 공간 셀과 기존 거리·시야 제한이 있습니다. 그 처리에서 비활성화된 오브젝트의 빈 glTF 복제 루트가 후보 목록에 남아 있었습니다. 등록된 빈 루트만 엔진의 준비 검사 전에 제외합니다. 활성 루트·원본·LOD 원본은 유지하고, 재질·지오메트리·사용자 동작이 추가되면 기존 경로로 돌아갑니다.</p><p>원본을 단순히 숨겼다는 이유로 제외하면 인스턴스 배치 준비가 빠질 수 있습니다. 임의 절반 제외나 활성 목록 전체 동결은 이번 해결책으로 채택하지 않았습니다. UI 배치·터치 영역·미니맵·전투 조작과 판정에는 변경이 없습니다.</p>
<h2>동일 시점 A/B 결과</h2><p>실제 압축 모델 90종과 네 맵 배치를 사용했습니다. 8개 고정 시점에서 같은 장면·카메라·조명·정점 데이터로 32쌍씩 A/B·B/A 순서를 바꿔 총 512프레임을 측정했습니다. 후보 공급자 자체의 추가 비용도 Active Mesh 평가 시간에 포함했습니다.</p><div class="scroll"><table><thead><tr><th>지역·시점</th><th>엔진 제출 후보</th><th>Active 평가 중앙값</th><th>화면·그림자 배치</th></tr></thead><tbody>ROWS</tbody></table></div><p class="muted">Node + Babylon NullEngine의 CPU 참고값입니다. 텍스처는 대체 재질이며 실제 폰·GPU·픽셀·입력 지연 검사가 아닙니다. 8시점 모두 Active 중앙값은 줄었으나 P95는 6개 개선·2개 악화, 전체 장면 중앙값은 7개 개선·1개 악화였습니다. 초기 소표본에서도 결과가 흔들렸으므로 큰 FPS 향상의 증거로 사용하지 않습니다.</p>
<h2>남은 Draw Submission을 확인하는 방법</h2><p>성능 진단을 수집하는 동안 초당 한 장면 프레임에서 후보 공급, 그리기 명령, 효과 활성화, 버퍼 연결·갱신, 텍스처 설정 메서드의 CPU 시간과 호출 수를 기록합니다. 효과는 엔진의 실제 캐시 참조 변경도 셉니다. 진단 복사에 drawCpu가 포함됩니다.</p><p>계측하지 않는 프레임에는 원래 메서드로 복구합니다. 진단 끄기·일시정지·맵 교체·오류·컨텍스트 손실·폐기 후 복원을 검사했습니다. 계측도 비용이 있으므로 표본 ID·장면 프레임 ID·경과 시간을 함께 남깁니다. 이 값은 GPU 시간, 실제 GL 호출 수 또는 드라이버 대기만의 시간이 아닙니다. 캐시 적중 호출과 중첩 시간이 포함돼 그룹을 합산할 수 없습니다.</p>
<h2>검수와 남은 한계</h2><div class="panel"><ul><li>전체 자동 검사 TESTS 통과</li><li>실제 SDK의 LOD·메인/그림자 배치·인스턴스 행렬·효과 연결·활성 순서 동일</li><li>거리별 모델의 준비 호출 유지, 위치·노멀·UV·인덱스 원시 데이터 해시 동일</li><li>재질·지오메트리·사용자 동작 등 변경 9종에서 기존 경로 복귀 확인</li><li>추가 에셋 생성·브라우저 자동조작 없이 검증</li></ul></div><ul>LIMITS</ul>
<h2>참고 근거</h2><p>구현 검증은 프로젝트에 설치된 Babylon.js 9.31.0 소스를 기준으로 했습니다. 일반 원칙은 <a href="https://doc.babylonjs.com/features/featuresDeepDive/scene/optimize_your_scene">Babylon.js 장면 최적화 문서</a>와 <a href="https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices">WebGL 권장 사항</a>를 대조했습니다. 활성 목록 동결이나 GPU 동기 조회는 각각 기능 갱신과 CPU 정지에 영향을 줄 수 있어 사용하지 않았습니다.</p></main></body></html>'''
values={'PRESERVED':escape(release['preserved']),'DECISION':escape(release['decision']),'STATUS':escape(release['status']),'URL':url,'ROWS':rows,'TESTS':f'{release["tests"]["passed"]:,}/{release["tests"]["total"]:,}','LIMITS':items(release['limits'])}
for key,value in values.items():document=document.replace(key,value)
(base/'index.html').write_text(document,encoding='utf-8')
output=Path('C:/Users/ryank/Documents/ChatGPT/MM Project/output/render-candidates/2026-11-04');output.mkdir(parents=True,exist_ok=True)
(output/'index.html').write_text(document,encoding='utf-8')
print(output/'index.html')
