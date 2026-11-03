"""Create a portable review from measured results and inspected pose renders."""
import base64,html,json,re
from pathlib import Path
report=Path(__file__).parent
out=Path('C:/Users/ryank/Documents/ChatGPT/MM Project/output/forest-stamina-kneel/2026-11-03')
out.mkdir(parents=True,exist_ok=True)
data=json.loads((report/'release-review.json').read_text(encoding='utf-8'))
quality=json.loads((report/'quality-preservation.json').read_text(encoding='utf-8'))
def image(path,caption):
    p=Path(path);encoded=base64.b64encode(p.read_bytes()).decode()
    return '<figure><img src="data:image/png;base64,'+encoded+'" alt="'+html.escape(caption)+'"><figcaption>'+html.escape(caption)+'</figcaption></figure>'
figures=''.join(image(p['path'],p['caption']) for p in data['images'])
rows=''.join('<tr><th>'+html.escape(a)+'</th><td>'+html.escape(b)+'</td></tr>' for a,b in [
 ('일반공격 / 강공격','10 / 30'),('회피 / 방패 밀치기','10 / 20'),
 ('달리기','기본 이동의 1.8배, 초당 스테미나 5 소모'),
 ('부족 안내','몸이 짧게 반짝이며 “스테미나가 부족합니다.” 표시'),
 ('대평원 나무','기존 24그루의 수종·높이 조정. 나무 수·충돌 배치 증가 없음.'),
 ('유지 사항','플레이어 8K · 배경 최대 4K · 기존 LOD · 대평원 풍경 거리 240%')])
checks=''.join('<li>'+html.escape(x)+'</li>' for x in data['checks'])
page='''<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Moonforest · 다리 자세와 후속 반영 검수</title>
<style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#111819;color:#e7e5da;font:16px/1.7 system-ui,sans-serif}main{max-width:1160px;margin:auto;padding:50px 24px 80px}h1{font-size:32px;line-height:1.3}h2{font-size:23px;margin-top:40px}p{max-width:920px}a{color:#d5c487}.kicker{color:#b6c7bc;letter-spacing:.16em;font-size:13px}.note{border-left:3px solid #c9b37d;padding:12px 18px;background:#1a2526}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}figure{margin:0;background:#192224;border:1px solid #344142}img{display:block;width:100%;height:auto}figcaption{padding:12px 15px;font-size:14px;color:#c6cecb}table{border-collapse:collapse;width:100%;margin:20px 0}th,td{text-align:left;padding:13px;border-bottom:1px solid #344142}th{width:31%;color:#d3c58f}.muted{color:#a9b8b4}li{margin:7px 0}@media(max-width:700px){.grid{grid-template-columns:1fr}h1{font-size:26px}main{padding:30px 18px}th{width:37%}}</style><main>
<div class="kicker">MOONFOREST / 2026.11.03</div><h1>정면 실루엣을 유지한<br>한쪽 다리 자세 보정</h1>'''
page+='<p>'+html.escape(data['poseSummary'])+'</p><p class="note">최종 기준은 사용자가 빨간 선으로 지정한 측면 윤곽, 기존 정면 자세, “무릎을 완전히 접지 않아도 된다”는 조건입니다. 최초 AI 예상 이미지는 방향을 검토한 참고안이며, 최종 적용 결과와 구분했습니다.</p>'
page+='<h2>예상안과 실제 모델</h2><p class="muted">실제 모델 이미지는 게임에 쓰는 리그·스킨·텍스처를 사용한 오프라인 자세 검수입니다. 브라우저 화면 캡처가 아니며, 게임 조명·외곽선과는 차이가 있습니다.</p><div class="grid">'+figures+'</div>'
page+='<h2>함께 반영한 요청</h2><table>'+rows+'</table>'
page+='<h2>검증 결과</h2><ul>'+checks+'</ul><p>원본 품질·자원 검사 '+str(quality['checks']['passed'])+'개 통과. GPU 처리 시간과 S23·iPhone의 실측 FPS는 이번 검증에 포함되지 않았습니다.</p>'
page+='<p class="muted">이미지 생성 방식: 제공된 측면 이미지를 기준으로 내장 imagegen 편집. 생성 이미지를 게임 텍스처로 사용하지 않았습니다.</p><details><summary>예상 이미지 생성 프롬프트</summary><pre style="white-space:pre-wrap">'+html.escape(Path(data['promptPath']).read_text(encoding='utf-8'))+'</pre></details>'
if data.get('gameUrl'):page+='<p><a href="'+html.escape(data['gameUrl'])+'">반영된 게임 열기</a></p>'
page+='</main></html>'
(out/'index.html').write_text(page,encoding='utf-8')
print(json.dumps({'path':str(out/'index.html'),'bytes':(out/'index.html').stat().st_size,'embeddedImages':len(data['images'])},ensure_ascii=False))
