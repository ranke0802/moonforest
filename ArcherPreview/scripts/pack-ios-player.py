"""Derive an 8K UASTC player profile, one existing texture at a time.

Original player, geometry, UVs, rig, and village assets remain untouched.
Requires installed KTX-Software, Pillow, numpy. Outputs are hash-addressed.
"""
import argparse, copy, hashlib, json, math, shutil, struct, subprocess
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
def read(p): return json.loads(p.read_text(encoding='utf-8'))
def write(p, x): p.write_text(json.dumps(x, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--ktx', default='C:/Program Files/KTX-Software/bin/ktx.exe')
    args=parser.parse_args(); out=args.output; out.mkdir(parents=True, exist_ok=True)
    assets=ROOT/'public/assets'; config=read(assets/'warrior-v3.json')
    model=assets/config['model']; original=read(model); gltf=copy.deepcopy(original)
    ledger_path=out/'conversions.json'; ledger=read(ledger_path) if ledger_path.exists() else {}
    def run(command):
        result=subprocess.run(command, capture_output=True, text=True)
        if result.returncode: raise RuntimeError(result.stdout+'\n'+result.stderr)
    for index, image in enumerate(gltf['images']):
        source=model.parent/image['uri']; key=sha(source); dest=out/(key+'.ktx2')
        if key not in ledger:
            if dest.exists(): raise RuntimeError('Unverified output exists; inspect before retry: '+str(dest))
            im=Image.open(source); im=im.convert('RGBA' if 'A' in im.getbands() else 'RGB')
            if max(im.size)>8192: raise RuntimeError('Player exceeds 8K')
            print(f'{index+1}/{len(gltf["images"])} {image.get("name", key)} {im.size}', flush=True)
            png=out/'encoder-input.png'; im.save(png)
            run([args.ktx,'create','--format','R8G8B8A8_SRGB' if im.mode=='RGBA' else 'R8G8B8_SRGB',
                 '--assign-tf','srgb','--assign-primaries','bt709','--assign-texcoord-origin','top-left',
                 '--generate-mipmap','--encode','uastc','--threads','4','--uastc-quality','2','--zstd','18',
                 '--uastc-rdo','--uastc-rdo-l','0.5','--uastc-rdo-d','4096','--uastc-rdo-m',str(png),str(dest)])
            run([args.ktx,'validate',str(dest)])
            decoded=out/(key+'-decoded.png')
            run([args.ktx,'extract','--transcode','rgba8',str(dest),str(decoded)])
            result=Image.open(decoded).convert(im.mode)
            if result.size!=im.size: raise RuntimeError('Resolution changed')
            squared=np.zeros(len(im.getbands()),dtype=np.float64); count=0; worst=(-1,None)
            for y in range(0,im.height,256):
                for x in range(0,im.width,256):
                    box=(x,y,min(x+256,im.width),min(y+256,im.height))
                    a=np.asarray(im.crop(box)).astype(np.float32); b=np.asarray(result.crop(box)).astype(np.float32)
                    e=(a-b)**2; squared+=e.sum((0,1)); count+=a.shape[0]*a.shape[1]
                    if e[:,:,:3].mean()>worst[0]: worst=(float(e[:,:,:3].mean()),box)
            psnr=[round(10*math.log10(255**2/max(float(v/count),1e-12)),2) for v in squared]
            # Halt rather than silently accept a visibly damaging encoding.
            if min(psnr[:3])<38 or (len(psnr)==4 and psnr[3]<40): raise RuntimeError(f'Quality review required: {psnr}')
            review=Image.new('RGB',(1024,292),(30,30,30)); draw=ImageDraw.Draw(review)
            draw.text((5,5),f'{index}: original | UASTC; worst crop / center; PSNR {psnr}',fill='white')
            for n,box in enumerate([worst[1],(im.width//2-128,im.height//2-128,im.width//2+128,im.height//2+128)]):
                review.paste(im.convert('RGB').crop(box),(n*512,30)); review.paste(result.convert('RGB').crop(box),(n*512+256,30))
            review.save(out/f'review-{index}.png')
            ledger[key]={'name':image.get('name'),'source':source.name,'sourceBytes':source.stat().st_size,
                         'bytes':dest.stat().st_size,'sha256':sha(dest),'width':im.width,'height':im.height,
                         'profile':'UASTC quality 2, RDO 0.5, Zstd 18','psnrPerChannel':psnr}
            write(ledger_path,ledger)
            print(f'  validated {dest.stat().st_size/1e6:.2f} MB; PSNR {psnr}',flush=True)
        row=ledger[key]
        if sha(dest)!=row['sha256']: raise RuntimeError('Conversion checksum mismatch')
        target=assets/'content'/(row['sha256']+'.ktx2'); shutil.copyfile(dest,target)
        image['uri']=target.name; image['mimeType']='image/ktx2'
    for texture in gltf['textures']:
        extensions=texture.setdefault('extensions',{})
        source=texture.pop('source',None)
        if 'EXT_texture_webp' in extensions: source=extensions.pop('EXT_texture_webp')['source']
        if source is None: raise RuntimeError('Missing texture source')
        extensions['KHR_texture_basisu']={'source':source}
    for field in ['extensionsUsed','extensionsRequired']:
        gltf[field]=[x for x in gltf.get(field,[]) if x!='EXT_texture_webp']
        if 'KHR_texture_basisu' not in gltf[field]: gltf[field].append('KHR_texture_basisu')
    gltf['asset'].setdefault('extras',{})['moonforestSerialTextures']=True
    raw=(json.dumps(gltf,ensure_ascii=False,separators=(',',':'))+'\n').encode()
    model_name=hashlib.sha256(raw).hexdigest()+'.gltf'; (assets/'content'/model_name).write_bytes(raw)
    config['model']='./content/'+model_name
    config['resources']=list(dict.fromkeys([config['model']]+['./content/'+v['uri'] for v in gltf.get('buffers',[]) if 'uri' in v]+['./content/'+v['uri'] for v in gltf['images']]))
    config['textureProfile']={**config['textureProfile'],'encoding':'ktx2-uastc-8k-ios',
        'sourceManifest':'warrior-v3.json','requiresGpuCompression':True,'serialTextureUploads':True}
    write(assets/'warrior-v3-ios.json',config)
    write(out/'summary.json',{'images':list(ledger.values()),'originalModel':model.name,'iosModel':model_name,
        'gpuRgbaBytesWithMips':sum(r['width']*r['height']*4*4//3 for r in ledger.values()),
        'gpuAstc4x4BytesWithMips':sum(r['width']*r['height']*4//3 for r in ledger.values())})
    print('Packed iOS variant. Default player and all village assets unchanged.',flush=True)

if __name__=='__main__': main()
