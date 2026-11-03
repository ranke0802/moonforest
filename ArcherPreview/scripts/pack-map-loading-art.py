"""Compress the four user-supplied loading paintings; never crop or generate art."""
import argparse,hashlib,json,math
from pathlib import Path
import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parent.parent
SOURCES=[
 ('village','warrior-v3','마을','55% 50%','exec-020585e1-23d7-487c-8007-0cb40ebdb524.png'),
 ('great-plains','warrior-plains','대평원','50% 50%','exec-d37b659a-c395-414a-bd75-3bc9b5be1aa9.png'),
 ('monster-forest','warrior-v4','마물의 숲','50% 50%','exec-23d473e0-edd5-4eb6-9f91-32ebb3de4ed2.png'),
 ('witch-cave','warrior-v5','마녀의 동굴','42% 50%','exec-ddc00fac-296d-4c87-894d-74dfe3c873d3.png'),
]
def digest(data):return hashlib.sha256(data).hexdigest()
def main(source_root):
 assets=ROOT/'public/assets';content=assets/'content';report=ROOT/'reports/map-loading-art-2026-11-03';content.mkdir(parents=True,exist_ok=True);report.mkdir(parents=True,exist_ok=True)
 manifest={'version':1,'format':'WebP','artworks':{},'characters':{},'resources':[]};rows=[]
 for region,character,label,position,filename in SOURCES:
  source=source_root/filename;original=source.read_bytes()
  with Image.open(source) as image:
   image.load();assert image.size==(1672,941),(filename,image.size)
   image=image.convert('RGBA' if 'A' in image.getbands() else 'RGB')
   import io
   encoded=io.BytesIO();image.save(encoded,format='WEBP',quality=90,method=6);data=encoded.getvalue();sha=digest(data);url='./content/'+sha+'.webp';(assets/url).write_bytes(data)
   with Image.open(io.BytesIO(data)) as decoded:
    decoded.load();assert decoded.size==image.size
    difference=np.asarray(image.convert('RGB'),dtype=np.float32)-np.asarray(decoded.convert('RGB'),dtype=np.float32);mse=float(np.mean(difference*difference));psnr=99 if mse==0 else 10*math.log10(255*255/mse)
   manifest['artworks'][region]={'url':url,'label':label,'position':position,'width':image.width,'height':image.height,'bytes':len(data)};manifest['characters'][character]=region;manifest['resources'].append(url)
   rows.append({'region':region,'character':character,'sourceFile':str(source),'sourceSha256':digest(original),'sourceBytes':len(original),'sourceSize':list(image.size),'url':url,'sha256':sha,'format':'WebP','width':image.width,'height':image.height,'bytes':len(data),'quality':90,'method':6,'retainedByteRatio':round(len(data)/len(original),6),'rgbPSNRdB':round(psnr,3),'position':position})
 (assets/'map-loading-art.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 validation={'source':'Four user-supplied PNG artworks, content verified against assigned region','generationCalls':0,'resized':False,'cropped':False,'totalSourceBytes':sum(r['sourceBytes']for r in rows),'totalWebPBytes':sum(r['bytes']for r in rows),'artworks':rows,'limitations':['PSNR is a pixel-compression metric. Final visual inspection is recorded separately.']}
 (report/'art-validation.json').write_text(json.dumps(validation,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print(json.dumps({'images':4,'sourceBytes':validation['totalSourceBytes'],'webpBytes':validation['totalWebPBytes'],'items':[{k:r[k]for k in['region','width','height','bytes','url']}for r in rows]},ensure_ascii=False))
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--source-root',type=Path,required=True);main(parser.parse_args().source_root)
