import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2]/'Sources'))
from resolve_source import source_path, project_path, tool_path
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import json, sys
import numpy as np

OUT = Path(str(project_path("ArcherPreview/reports/archive/saint-50k-review/2026-11-02")))
FONT = __import__('os').environ.get('REVIEW_FONT', 'DejaVuSans.ttf')
BG = (24, 27, 35)
FG = (239, 235, 226)
DEPLOYED = '--deployed' in sys.argv
titles = {'front': '전체 정면', 'quarter': '전체 사선', 'side': '측면', 'back': '후면', 'face': '얼굴 확대', 'walk': '보행', 'cast2': '마법 시전 2', 'cast4': '마법 시전 4', 'cast6': '마법 시전 6', 'death': '사망 자세'}
metrics = []
for shot, title in titles.items():
    left = Image.open(OUT / (shot + '-original.png')).convert('RGBA')
    right = Image.open(OUT / (shot + '-candidate.png')).convert('RGBA')
    board = Image.new('RGB', (2048, 1200), BG)
    draw = ImageDraw.Draw(board)
    draw.text((28, 20), title, font=ImageFont.truetype(FONT, 36), fill=FG)
    draw.text((28, 78), '원본 103,930 삼각형', font=ImageFont.truetype(FONT, 31), fill=FG)
    draw.text((1052, 78), '감량 후보 56,918 삼각형', font=ImageFont.truetype(FONT, 31), fill=(183, 225, 206))
    for x, image in [(24, left), (1048, right)]:
        board.paste(image, (x, 136), image)
    draw.line((1024, 70, 1024, 1140), fill=(76, 79, 87), width=2)
    draw.text((28, 1150), '같은 텍스처 · 같은 자세 · 같은 카메라 | ' + ('승인 감량본 · 전사 v5 반영' if DEPLOYED else '검수 후보 · 게임 미적용'), font=ImageFont.truetype(FONT, 24), fill=(178, 182, 192))
    board.save(OUT / (shot + '-comparison.jpg'), quality=95, subsampling=0)
    a = np.asarray(left)[:, :, 3] > 128
    b = np.asarray(right)[:, :, 3] > 128
    metrics.append({'shot': shot, 'silhouetteIoU': float((a & b).sum() / (a | b).sum()), 'differentMaskPixels': int((a ^ b).sum())})
(OUT / 'image-comparison-metrics.json').write_text(json.dumps(metrics, indent=2), encoding='utf-8')
blocks = ''.join(f'<figure><h2>{title}</h2><a href="{shot}-comparison.jpg"><img loading="lazy" src="{shot}-comparison.jpg" alt="{title} 원본과 후보 비교"></a></figure>' for shot, title in titles.items())
page = '''<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>타락한 성녀 엘레나 감량 비교</title><style>body{background:#181b23;color:#eeebe2;max-width:1400px;margin:32px auto;padding:0 20px;font:17px/1.7 system-ui}h1{font-size:30px}h2{font-size:22px}p{max-width:1000px}img{width:100%;height:auto}figure{margin:40px 0}strong,a{color:#b7e1ce}.note{background:#242936;padding:20px;border-radius:10px}</style><h1>타락한 성녀 엘레나: 감량 후보 비교</h1><p><strong>103,930 → 56,918 삼각형 (45.2% 감소)</strong><br>기존 4K KTX2 텍스처는 파일 단위로 동일합니다. 키 1.7m와 기존 골격·애니메이션을 유지했습니다.</p><div class="note"><p><b>5만 삼각형 목표에는 아직 도달하지 않았습니다.</b> 얼굴·목·손·손가락과 열린 경계의 정점을 보호하고 UV 이음매도 보존한 첫 후보입니다. 현재 보호 조건과 오차 한도에서 56,918개까지 줄었습니다. 원본과 현재 배포본은 보존했으며, 이 후보는 게임에 적용하지 않았습니다.</p><p>12개 동작의 36개 자세에서 남겨진 정점의 변형 위치가 원본과 일치했습니다. 면 연결과 면 안쪽 보간은 달라집니다. 실제 1.7m 크기의 표면 표본 비교에서 각 자세의 99% 지점 오차는 최대 약 5mm, 전체 표본의 최대 차이는 약 40mm였습니다. 외형이 수학적으로 무손실이라는 뜻은 아닙니다.</p><p>아래 이미지는 현재 게임 애니메이터로 변형한 메시를 Blender에서 같은 텍스처·카메라로 렌더한 비교입니다. 실제 게임의 카툰 셰이딩·내부선·외곽선, 모바일 GPU 시간은 검증 범위에 포함되지 않습니다. 브라우저 자동조작은 사용하지 않았습니다.</p></div>''' + blocks + '</html>'
if DEPLOYED:
    page = page.replace('이 후보는 게임에 적용하지 않았습니다.', '사용자가 56,918개 후보 반영을 승인하여 전사 v5에 배포했습니다. 텍스처와 모션·전투 설정은 유지합니다.')
    page = page.replace('<h1>타락한 성녀 엘레나: 감량 후보 비교</h1>', '<h1>타락한 성녀 엘레나: 승인 감량본 비교</h1>')
(OUT / 'index.html').write_text(page, encoding='utf-8')
print(json.dumps({'comparisons': len(metrics), 'minSilhouetteIoU': min(m['silhouetteIoU'] for m in metrics), 'path': str(OUT)}, ensure_ascii=True))
