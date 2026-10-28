"""Sequential, resumable local texture conversion. Never calls a model generator.

Outputs are reviewed separately; pack-village-ktx2.mjs installs approved results.
Each subprocess must finish successfully before the next texture begins.
"""
import argparse, hashlib, json, math, subprocess, time
from pathlib import Path
from PIL import Image, ImageDraw
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
DEFAULT = Path('C:/Users/ryank/Documents/ChatGPT/MM Project/output/village-warrior-v3/2026-10-28/ktx2')

def read(path): return json.loads(path.read_text(encoding='utf-8'))
def write(path, value): path.write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()

def main():
    p=argparse.ArgumentParser();p.add_argument('--output',type=Path,default=DEFAULT)
    p.add_argument('--ktx',default='C:/Program Files/KTX-Software/bin/ktx.exe')
    p.add_argument('--uastc',nargs='*',default=[]);p.add_argument('--rdo',action='store_true');args=p.parse_args();out=args.output;out.mkdir(parents=True,exist_ok=True)
    assets=ROOT/'public/assets'
    for name in ['village','village-ground']:
        backup=out/f'{name}-before.json'
        if not backup.exists(): backup.write_bytes((assets/f'{name}.json').read_bytes())
    manifest=read(out/'village-before.json');ground=read(out/'village-ground-before.json')
    jobs={}
    def add(uri,label,high=False,alpha=False):
        path=assets/uri;key=path.stem
        j=jobs.setdefault(key,{'source':str(path.resolve()),'labels':[],'high':False,'alpha':alpha})
        j['labels'].append(label);j['high']|=high
    for id,a in manifest['assets'].items():
        for tier in [*a['lods'],a['mobileNear']]:
            model=assets/tier['model'];g=read(model)
            for im in g.get('images',[]): add('./content/'+im['uri'],id)
        add(a['highTextures']['textures']['albedo']['url'],id,True)
    add(ground['color']['url'],'ground',True,True)
    # Packed 256px detail is data, not albedo; keep its tiny lossless source.
    ledgerPath=out/'conversions.json';ledger=read(ledgerPath) if ledgerPath.exists() else {}
    for i,(key,j) in enumerate(jobs.items()):
        codec='uastc' if j['high'] and any(x in args.uastc for x in j['labels']) else 'etc1s'
        profile=codec+('-rdo1' if codec=='uastc' and args.rdo else '')
        cacheKey=key+'-'+profile;dest=out/(cacheKey+'.ktx2')
        if cacheKey in ledger and dest.exists() and sha(dest)==ledger[cacheKey]['sha256']: continue
        if dest.exists(): raise RuntimeError('Unverified previous output; inspect before retrying: '+str(dest))
        im=Image.open(j['source']).convert('RGBA' if j['alpha'] else 'RGB')
        if max(im.size)>4096: raise RuntimeError('4K cap exceeded')
        png=out/'encoder-input.png';im.save(png)
        command=[args.ktx,'create','--format','R8G8B8A8_SRGB' if j['alpha'] else 'R8G8B8_SRGB','--assign-tf','srgb','--assign-primaries','bt709','--assign-texcoord-origin','top-left','--generate-mipmap','--encode','basis-lz' if codec=='etc1s' else 'uastc','--threads','4']
        command+=['--qlevel','255','--clevel','1','--no-endpoint-rdo','--no-selector-rdo'] if codec=='etc1s' else ['--uastc-quality','2','--zstd','18']
        if codec=='uastc' and args.rdo: command+=['--uastc-rdo','--uastc-rdo-l','1','--uastc-rdo-m']
        start=time.time();print(f'{i+1}/{len(jobs)} {j["labels"][0]} {im.width}px {codec}',flush=True)
        subprocess.run(command+[str(png),str(dest)],check=True,capture_output=True)
        subprocess.run([args.ktx,'validate',str(dest)],check=True,capture_output=True)
        row={**j,'codec':codec,'profile':profile,'width':im.width,'height':im.height,'file':dest.name,'sha256':sha(dest),'bytes':dest.stat().st_size,'sourceBytes':Path(j['source']).stat().st_size,'seconds':round(time.time()-start,2)}
        if j['high']:
            decoded=out/(cacheKey+'-decoded.png')
            subprocess.run([args.ktx,'extract','--transcode','rgba8',str(dest),str(decoded)],check=True,capture_output=True)
            original=np.asarray(im.convert('RGB')).astype(np.float32);decodedIm=Image.open(decoded).convert('RGB');d=np.asarray(decodedIm).astype(np.float32)
            error=np.abs(original-d);mse=float(np.mean((original-d)**2));row['psnr']=round(10*math.log10(255**2/max(mse,1e-8)),2)
            # Largest-error 256px crop + center crop, at source pixel scale.
            blocks=error.mean(2).reshape(im.height//256,256,im.width//256,256).mean((1,3));y,x=np.unravel_index(blocks.argmax(),blocks.shape)
            review=Image.new('RGB',(1024,300));draw=ImageDraw.Draw(review)
            for k,(cx,cy) in enumerate([(x*256,y*256),(im.width//2-128,im.height//2-128)]):
                box=(cx,cy,cx+256,cy+256);review.paste(im.convert('RGB').crop(box),(k*512,32));review.paste(decodedIm.crop(box),(k*512+256,32))
            draw.text((4,4),f'{j["labels"][0]} {codec} / original | decoded / PSNR {row["psnr"]}',fill='white')
            review.save(out/(j['labels'][0]+'-'+profile+'-review.png'))
        ledger[cacheKey]=row;write(ledgerPath,ledger)
    print('Complete. No manifest modified; review before packing.',flush=True)

if __name__=='__main__': main()
