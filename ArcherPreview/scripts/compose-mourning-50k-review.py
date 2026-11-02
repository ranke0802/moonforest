from pathlib import Path
from PIL import Image,ImageDraw,ImageFont,ImageChops
import json,html
import numpy as np

OUT=Path('C:/Users/ryank/Documents/ChatGPT/MM Project/output/mourning-50k-review/2026-11-02')
ROOT=Path(__file__).resolve().parents[1]
font_path='C:/Windows/Fonts/malgun.ttf'
def font(size):return ImageFont.truetype(font_path,size)
BG=(24,27,35);FG=(239,235,226)
titles={'idle-front':'전체 정면','idle-quarter':'전체 사선','idle-side':'측면','idle-back':'후면','face-detail':'얼굴 · 기도하는 손 확대','cast':'한쪽 팔 마법 시전','slam':'전진 내려찍기','alternate':'교대 시전','death':'사망 자세'}
metrics=[]
for shot,title in titles.items():
    left=Image.open(OUT/(shot+'-original.png')).convert('RGBA');right=Image.open(OUT/(shot+'-candidate.png')).convert('RGBA')
    board=Image.new('RGB',(2048,1200),BG);d=ImageDraw.Draw(board)
    d.text((28,20),title,font=font(36),fill=FG)
    d.text((28,78),'원본 143,228 삼각형',font=font(31),fill=FG)
    d.text((1052,78),'감량 후보 49,982 삼각형',font=font(31),fill=(183,225,206))
    for x,im in [(24,left),(1048,right)]:board.paste(im,(x,136),im)
    d.line((1024,70,1024,1140),fill=(76,79,87),width=2)
    d.text((28,1150),'같은 텍스처 · 같은 자세 · 같은 카메라 | 배포 전 검수 후보',font=font(24),fill=(178,182,192))
    board.save(OUT/(shot+'-comparison.jpg'),quality=95,subsampling=0)
    a=np.asarray(left);b=np.asarray(right);ma=a[:,:,3]>128;mb=b[:,:,3]>128
    union=ma|mb;intersection=ma&mb
    metrics.append({'shot':shot,'silhouetteIoU':float(intersection.sum()/union.sum()),'differentMaskPixels':int((ma^mb).sum()),'unionPixels':int(union.sum()),'sourcePaintOnly':True})
report=json.loads((ROOT/'reports/mourning-50k-2026-11-02/candidate-report.json').read_text(encoding='utf-8'))
validation=json.loads((ROOT/'reports/mourning-50k-2026-11-02/motion-validation.json').read_text(encoding='utf-8'))
(OUT/'image-comparison-metrics.json').write_text(json.dumps(metrics,indent=2),encoding='utf-8')
blocks=''.join('<figure><h2>'+title+'</h2><a href="'+shot+'-comparison.jpg"><img loading="lazy" src="'+shot+'-comparison.jpg" alt="'+title+' 원본과 후보 비교"></a></figure>' for shot,title in titles.items())
page='''<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>비탄의 마녀 5만 삼각형 후보 비교</title><style>body{background:#181b23;color:#eeebe2;max-width:1400px;margin:32px auto;padding:0 20px;font:17px/1.7 system-ui}h1{font-size:30px}h2{font-size:22px}p{max-width:1000px}img{width:100%;height:auto}figure{margin:40px 0}strong{color:#b7e1ce}.note{background:#242936;padding:20px;border-radius:10px}a{color:#b7e1ce}</style><h1>비탄의 마녀 엘레나: 5만 삼각형 후보</h1><p><strong>143,228 → 49,982 삼각형 (65.1% 감소)</strong><br>텍스처: 기존 4K KTX2 파일 바이트 단위 동일. 원본·현재 배포본 보존.</p><div class="note"><p>얼굴·목·기도 손·손가락·발가락의 정점을 보호했습니다. 10개 애니메이션의 원본 키, 골격과 가중치, 11개 본체 모프를 유지했습니다. 14개 자세에서 남겨진 정점의 변형 위치가 원본과 일치했습니다.</p><p>면 연결과 보간은 달라집니다. 이번 후보를 <b>외형 무손실</b>로 확정하지 않습니다. 실제 4.5m 설정의 표면 표본 비교에서 99% 지점의 오차는 자세별 약 1.7~2.3cm 이내였고, 최대 약 10.4cm 차이가 있는 일부 지점은 추가 확인이 필요합니다.</p><p>아래는 게임의 현재 애니메이터로 변형한 메시를 Blender에서 같은 텍스처·카메라로 렌더한 비교입니다. 형상·UV 비교를 위해 원본 색상 텍스처를 동일하게 사용했으며, 실제 게임의 카툰 셰이더·내부선·외곽선이나 모바일 GPU 성능 검증을 대신하지 않습니다. 배포하지 않았습니다.</p></div>'''+blocks+'</html>'
(OUT/'index.html').write_text(page,encoding='utf-8')
print(json.dumps({'comparisons':len(metrics),'minSilhouetteIoU':min(m['silhouetteIoU'] for m in metrics),'path':str(OUT)},ensure_ascii=True))
