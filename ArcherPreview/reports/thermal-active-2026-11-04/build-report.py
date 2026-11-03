import html, json
from pathlib import Path

base = Path(__file__).parent
read = lambda name: json.loads((base/name).read_text(encoding='utf-8-sig'))
escape = lambda value: html.escape(str(value))
release = read('release-review.json')
log = read('device-evidence.json')
maps = read('four-map-candidates.json')['rows']
names = {'village':'마을','great-plains':'대평원','monster-forest':'마물의 숲','witch-cave':'마녀의 동굴'}
rows = ''.join(f'<tr><td>{names[row["map"]]}</td><td>{row["stats"]["scanned"]:,}</td><td>{row["stats"]["skipped"]:,}</td><td>{row["stats"]["submitted"]:,}</td><td>동일</td></tr>' for row in maps)
items = lambda values: ''.join(f'<li>{escape(value)}</li>' for value in values)
url = f'<a class="button" href="{escape(release["url"])}">수정본 열기</a>' if release.get('url') else ''
tests = f'전체 자동 검사 {release["tests"]["pass"]:,}/{release["tests"]["total"]:,} 통과.' if release.get('tests') else '전체 자동 회귀 검사 진행 중.'
document = '''<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MOONFOREST · 모바일 프레임 후속 개선</title><style>
*{box-sizing:border-box}body{margin:0;background:#101a17;color:#e8eee6;font:16px/1.8 system-ui,sans-serif}main{max-width:1040px;margin:auto;padding:46px 24px 70px}h1{font-size:clamp(28px,5vw,42px);line-height:1.3;margin:14px 0 22px}h2{font-size:23px;margin:34px 0 12px}.muted,small{color:#b6c4b8}.panel{background:#1b2b22;border:1px solid #3d5746;padding:22px;border-radius:12px;margin:18px 0}.note{border-left:4px solid #ceb076;background:#292a21;padding:18px 22px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.number{font-size:30px;display:block;color:#cce0c7}.scroll{overflow:auto}table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}td,th{text-align:left;padding:12px 10px;border-bottom:1px solid #3c5143;white-space:nowrap}li{margin:8px 0}a{color:#d3e8be}.button{display:inline-block;padding:8px 18px;border:1px solid #b4c9a0;border-radius:7px;text-decoration:none}@media(max-width:600px){.grid{grid-template-columns:1fr}main{padding:24px 18px}}@media print{body,.panel,.note{background:white;color:#111}.muted,small{color:#444}}</style></head><body><main>
<small>MOONFOREST / 2026.11.04 / 새 기기 로그 기반 후속 개선</small><h1>꺼 둔 풍경의 반복 검사와<br>텍스처 교체의 중복 작업 감소</h1><p>PRESERVED</p><p>수정 전 로그: 2026년 11월 4일 02:15 KST · index-BmLa5VqP.js</p>
<div class="grid"><div class="panel"><span class="number">45.9 FPS</span>마을 최근 약 10초 평균</div><div class="panel"><span class="number">237 / 459</span>목표 시간 초과 프레임<br><small>60FPS 기준 20.83ms 초과</small></div><div class="panel"><span class="number">264.8 ms</span>텍스처 준비 중<br>단일 그리기 제출 CPU 시간</div></div>
<div class="note">마지막 표본 한 장만으로 정상이라고 볼 수 없습니다. 지속적인 프레임 하락과 300ms 수준의 순간 멈춤은 별도로 확인했습니다. GPU 측정은 미지원이며 기기 온도·스로틀링은 로그로 확정할 수 없습니다.</div>
<h2>확인한 원인과 적용</h2><div class="panel"><ul>CHANGES</ul></div><p>엔진은 비활성 인스턴스도 재질 준비 여부를 먼저 확인하고 나서 활성 상태를 확인했습니다. 새 경로는 등록된 정적 인스턴스 중 이미 비활성인 것만 앞에서 제외합니다. 동적 캐릭터·상자·사용자 후보 공급자·다중 카메라 등은 원래 동작을 유지합니다.</p>
<h2>네 맵에서 실제 데이터 비교</h2><div class="scroll"><table><thead><tr><th>지역</th><th>기존 검사 후보</th><th>비활성 사전 제외</th><th>엔진 전달 후보</th><th>활성 목록</th></tr></thead><tbody>ROWS</tbody></table></div><p class="muted">고정 시점의 실제 배치·압축 모델 데이터 + Babylon NullEngine 검사입니다. 새로 후보를 고르는 순회 비용도 포함해 비교했습니다. 이 숫자는 폰 FPS 증가율·GPU 절감률이 아닙니다.</p>
<h2>텍스처 품질을 유지한 교체</h2><p>재질 교체·원복 검증 장면에서 관련 없는 메시 부분 조회가 각각 512회에서 256회로 줄었습니다. 필요한 텍스처 갱신은 유지했습니다. 실제 4K 압축 텍스처의 13개 밉과 첫 표시 텍스처 연결, 두 색공간 처리, 반복 교체·해제 및 취소 후 늦은 완료를 검증했습니다.</p>
<h2>검수 결과</h2><div class="panel"><ul><li>TESTS</li><li>독립 검수: 가까운/중간/먼 LOD, 메인·그림자 그리기 배치, 전부 숨긴 뒤 다시 보이기, 기존 처리 경로 복구가 동일합니다.</li><li>품질 보호 대상 소스·배포 에셋 목록 48개 파일이 이전 버전과 동일합니다.</li><li>브라우저 자동조작과 추가 에셋 생성 없이 진행했습니다.</li></ul><p>STATUS</p>URL</div>
<h2>남은 확인 범위</h2><ul>LIMITS</ul><p>다음 기기 진단은 실제로 제외된 후보 수와 텍스처 준비 단계를 함께 기록합니다. 그리기 제출 시간이 다시 길어지면 단순 다운로드 대기·재질 교체·그 이후 그리기 지연을 더 명확히 구분할 수 있습니다.</p><p class="muted">최근 지연 목록은 느린 구간만 선택한 기록입니다. 이전 프레임 간격과 현재 CPU 처리 시간을 더하지 않으며, 장면 세부 시간 또한 서로 겹칠 수 있습니다. 진단의 마지막 재질 교체 시간은 GPU 업로드 시간과 다릅니다.</p></main></body></html>'''
for key, value in {'PRESERVED':escape(release['preserved']),'CHANGES':items(release['changes']),'ROWS':rows,'TESTS':escape(tests),'STATUS':escape(release['status']),'URL':url,'LIMITS':items(release['limits'])}.items():
    document = document.replace(key, value)
(base/'index.html').write_text(document, encoding='utf-8')
output = Path('C:/Users/ryank/Documents/ChatGPT/MM Project/output/thermal-active/2026-11-04')
output.mkdir(parents=True, exist_ok=True)
(output/'index.html').write_text(document, encoding='utf-8')
print(output/'index.html')
