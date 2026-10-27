"""Resize original source maps, sequentially; never calls a generation service."""
from pathlib import Path
from PIL import Image
import argparse, hashlib, json, time

PROFILE = 'mobile-4k-v1'
LARGE = {'house-01-cottage','house-02-tall-home','house-03-workshop','house-04-forest-hut',
         'tree-01-round-oak','tree-02-slender-pine','chapel','watchtower','market-stall','covered-wagon'}

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--previous',required=True);ap.add_argument('--out',required=True)
    args=ap.parse_args();previous=Path(args.previous);out=Path(args.out)
    content=out/'assets/content';content.mkdir(parents=True,exist_ok=True)
    old=json.loads((previous/'high-textures.json').read_text(encoding='utf-8'))
    report_path=out/'high-textures.json'
    report=json.loads(report_path.read_text(encoding='utf-8')) if report_path.exists() else {'version':2,'profile':PROFILE,'assets':{}}
    if report.get('profile')!=PROFILE:raise ValueError('Output belongs to another texture profile')
    for asset_id,original in old['assets'].items():
        if asset_id in report['assets']:
            if all((out/'assets'/r).is_file() for r in report['assets'][asset_id]['resources']):continue
            raise ValueError('Incomplete previous output: '+asset_id)
        started=time.time();color_path=Path(original['sourcePath']);roles={}
        for p in color_path.parent.rglob('*.png'):
            if any(x.lower().endswith('.fbm') for x in p.parts):continue
            for role in ('normal','roughness','metallic'):
                if role in p.stem.lower():
                    if role in roles:raise ValueError('Ambiguous source: '+asset_id)
                    roles[role]=p
        color_size=4096 if asset_id in LARGE else 2048;aux_size=color_size//4
        textures={};resources=[];total=0
        def store(im,role,lossless=False):
            nonlocal total
            temp=out/(asset_id+'-'+role+'.webp');im.save(temp,format='WEBP',quality=92,lossless=lossless,method=4)
            data=temp.read_bytes();name=hashlib.sha256(data).hexdigest()+'.webp';target=content/name
            if not target.exists():temp.replace(target)
            else:temp.unlink()
            with Image.open(target) as decoded:
                if decoded.size!=im.size:raise ValueError('Unexpected encoded dimensions')
                if lossless and decoded.convert('RGB').tobytes()!=im.convert('RGB').tobytes():raise ValueError('Auxiliary pixels changed')
            textures[role]={'url':'./content/'+name,'width':im.width,'height':im.height}
            resources.append('./content/'+name);total+=len(data)
        with Image.open(color_path) as im:
            store(im.convert('RGB').resize((color_size,color_size),Image.Resampling.LANCZOS),'albedo')
        with Image.open(roles['normal']) as im:
            # Data-map filtering in linear channel space; the material normalizes sampled vectors.
            store(im.convert('RGB').resize((aux_size,aux_size),Image.Resampling.LANCZOS),'normal',True)
        with Image.open(roles['roughness']) as im:rough=im.convert('L').resize((aux_size,aux_size),Image.Resampling.LANCZOS)
        with Image.open(roles['metallic']) as im:metal=im.convert('L').resize((aux_size,aux_size),Image.Resampling.LANCZOS)
        store(Image.merge('RGB',(Image.new('L',rough.size,255),rough,metal)),'orm',True)
        report['assets'][asset_id]={'textures':textures,'resources':resources,'colorResolution':color_size,
            'colorEncoding':'WebP quality 92; original PNG resized with Lanczos','auxEncoding':'lossless WebP',
            'sourcePath':str(color_path),'sourceColorSha256':original['sourceColorSha256'],
            'bytes':total,'previousBytes':original['bytes'],'seconds':round(time.time()-started,2)}
        report_path.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
        print(json.dumps({'id':asset_id,'colorSize':color_size,'auxSize':aux_size,'bytes':total}),flush=True)
    report['summary']={'assets':len(report['assets']),'bytes':sum(a['bytes'] for a in report['assets'].values()),
                       'previousBytes':sum(a['bytes'] for a in old['assets'].values())}
    report_path.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps(report['summary']),flush=True)

if __name__=='__main__':main()
