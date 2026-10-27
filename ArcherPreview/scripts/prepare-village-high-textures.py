"""Preserve the original 8K dimensions; package web delivery without AI calls."""
from pathlib import Path
from PIL import Image
import argparse, hashlib, json, shutil, time

def sha(path):
    with path.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--source',required=True);ap.add_argument('--out',required=True)
    args=ap.parse_args();source=Path(args.source);out=Path(args.out);content=out/'assets/content';content.mkdir(parents=True,exist_ok=True)
    manifest=json.loads((out/'baseline-manifest.json').read_text(encoding='utf-8'));report_path=out/'high-textures.json'
    report=json.loads(report_path.read_text(encoding='utf-8')) if report_path.exists() else {'version':1,'assets':{}}
    for asset_id in manifest['assets']:
        if asset_id in report['assets']:
            if all((out/'assets'/r).is_file() for r in report['assets'][asset_id]['resources']):continue
            raise ValueError('Partial previous output; inspect before resuming '+asset_id)
        started=time.time();audit=json.loads((source/'runtime'/asset_id/'asset-audit.json').read_text(encoding='utf-8'))
        folder=Path(audit['source']).parent;roles={}
        for p in folder.rglob('*.png'):
            if any(x.lower().endswith('.fbm') for x in p.parts):continue
            role=next((r for r in ('normal','roughness','metallic') if r in p.stem.lower()),'albedo')
            if role in roles:raise ValueError('Ambiguous original texture '+asset_id)
            roles[role]=p
        textures={};resources=[]
        def store(path,role,size):
            name=sha(path)+path.suffix;target=content/name
            if not target.exists():shutil.copyfile(path,target)
            textures[role]={'url':'./content/'+name,'width':size[0],'height':size[1]};resources.append('./content/'+name)
        color=Image.open(roles['albedo']).convert('RGB')
        if color.size!=(8192,8192):raise ValueError(f'{asset_id}: unexpected original color size {color.size}')
        # No resizing. High-quality WebP keeps 8K detail with practical delivery size.
        temp=out/f'{asset_id}-8k.webp'
        if asset_id=='tree-01-round-oak' and (out/'color8k-stream-probe.webp').exists():
            shutil.copyfile(out/'color8k-stream-probe.webp',temp)
        else:color.save(temp,quality=98,method=4)
        store(temp,'albedo',color.size)
        with Image.open(roles['normal']) as normal:store(roles['normal'],'normal',normal.size)
        rough=Image.open(roles['roughness']).convert('L');metal=Image.open(roles['metallic']).convert('L')
        if rough.size!=metal.size:raise ValueError('Auxiliary source dimensions disagree')
        orm=Image.merge('RGB',(Image.new('L',rough.size,255),rough,metal));packed=out/f'{asset_id}-orm.png';orm.save(packed,optimize=True)
        store(packed,'orm',orm.size)
        item={'textures':textures,'resources':resources,'colorResolution':8192,'colorEncoding':'WebP quality 98, no resize',
              'sourceColorSha256':sha(roles['albedo']),'sourcePath':str(roles['albedo']),
              'bytes':sum((out/'assets'/p).stat().st_size for p in resources),'seconds':round(time.time()-started,2)}
        report['assets'][asset_id]=item;report_path.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
        print(json.dumps({'id':asset_id,'colorSize':8192,'bytes':item['bytes'],'seconds':item['seconds']}),flush=True)
    print('RESULT '+json.dumps({'assets':len(report['assets']),'bytes':sum(a['bytes'] for a in report['assets'].values())}),flush=True)
if __name__=='__main__':main()
