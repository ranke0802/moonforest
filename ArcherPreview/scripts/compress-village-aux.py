"""Lossless packaging of original normal/ORM maps, with decoded-pixel proof."""
from pathlib import Path
from PIL import Image
import argparse,json,hashlib,time

ap=argparse.ArgumentParser();ap.add_argument('directory');args=ap.parse_args();root=Path(args.directory)
report=json.loads((root/'high-textures.json').read_text(encoding='utf-8'))
if len(report['assets'])!=25:raise ValueError('Finish sequential source preparation before packaging')
for asset_id,asset in report['assets'].items():
    for role in ('normal','orm'):
        entry=asset['textures'][role]
        if entry['url'].endswith('.webp'):continue
        old=root/'assets'/entry['url'];source=Image.open(old).convert('RGB');temp=root/f'{asset_id}-{role}-lossless.webp'
        source.save(temp,lossless=True,quality=75,method=4)
        with Image.open(temp) as restored:
            if restored.size!=source.size or restored.convert('RGB').tobytes()!=source.tobytes():raise ValueError('Lossless pixel check failed')
        digest=hashlib.sha256(temp.read_bytes()).hexdigest();url='./content/'+digest+'.webp';target=root/'assets'/url
        if not target.exists():target.write_bytes(temp.read_bytes())
        asset['resources']=[url if r==entry['url'] else r for r in asset['resources']];entry['url']=url;entry['encoding']='lossless WebP; decoded pixels unchanged'
    asset['bytes']=sum((root/'assets'/r).stat().st_size for r in asset['resources'])
    (root/'high-textures.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'id':asset_id,'bytes':asset['bytes']}),flush=True)
print('RESULT '+str(sum(a['bytes'] for a in report['assets'].values())))
