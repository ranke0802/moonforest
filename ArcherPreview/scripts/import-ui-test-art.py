"""Extract the supplied UI study (no generated artwork or world textures)."""
from pathlib import Path
import base64, html, io, json, re, sys
from PIL import Image

source = Path(sys.argv[1])
dest = Path(__file__).resolve().parents[1] / 'src/ui-test-art'
dest.mkdir(exist_ok=True)
text = source.read_text(encoding='utf-8-sig')
embedded = list(re.finditer(r'data:([^;,]+);base64,([A-Za-z0-9+/=\r\n]+)', text))
# World background is deliberately omitted: exploration uses the live game.
images = {1:('dialogue',1280),2:('panel',1024),3:('paper',768),4:('button',768),
          5:('round',768),8:('pie',384),9:('apple',384),10:('bandage',384),
          11:('sword',384),12:('crest',192),13:('icons',768)}
records = []
for index,(name,maximum) in images.items():
    raw = base64.b64decode(embedded[index][2])
    image = Image.open(io.BytesIO(raw)).convert('RGBA')
    image.thumbnail((maximum, maximum), Image.Resampling.LANCZOS)
    target = dest / (name + '.webp')
    image.save(target, 'WEBP', quality=92, method=6)
    records.append(dict(file=target.name,sourceBytes=len(raw),bytes=target.stat().st_size,size=image.size))
for index,name in [(6,'galmuri-regular.woff2'),(7,'galmuri-bold.woff2')]:
    (dest/name).write_bytes(base64.b64decode(embedded[index][2]))
license_text = re.search(r'<details class="font-license">.*?<pre>(.*?)</pre>',text,re.S)[1]
(dest/'LICENSE.txt').write_text(html.unescape(html.unescape(license_text)),encoding='utf-8')
(dest/'provenance.json').write_text(json.dumps({'source':source.name,'purpose':'UI test only; reused user-supplied art','images':records},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'files':len(list(dest.iterdir())),'totalBytes':sum(p.stat().st_size for p in dest.iterdir()),'images':records},ensure_ascii=False))
