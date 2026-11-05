import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2]/'Sources'))
from resolve_source import source_path, project_path, tool_path
"""Add mobile-only color tiers without rewriting any source texture or model."""
import argparse, copy, hashlib, json, subprocess, time
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
MAPS = ('village', 'great-plains', 'monster-forest', 'witch-cave', 'village-plains-outskirts')
def read(path): return json.loads(path.read_text(encoding='utf-8'))
def write(path, data): path.write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
def digest(data): return hashlib.sha256(data).hexdigest()
def protected(id, asset): return asset.get('category') == 'building' or id in ('village-approach', 'chapel') or id.startswith('house')
def target_size(asset):
    # Large timber/rock/tree surfaces retain 2K; compact props can use 1K.
    size = max(asset.get('bounds', [0]) or [0])
    small = asset.get('category') in ('prop','plant','fence','defense') and asset.get('height', size) <= 3 and size <= 4
    return 1024 if small else 2048

def main():
    parser=argparse.ArgumentParser(); parser.add_argument('--output',type=Path,default=ROOT/'reports/mobile-quality-2026-11-04/scenery-work')
    parser.add_argument('--apply',action='store_true'); args=parser.parse_args()
    out=args.output; out.mkdir(parents=True,exist_ok=True); assets=ROOT/'public/assets'; content=assets/'content'
    ledger_path=out/'conversions.json'; ledger=read(ledger_path) if ledger_path.exists() else {}
    ktx=tool_path('ktx')
    def run(command):
        result=subprocess.run(command,capture_output=True,text=True)
        if result.returncode: raise RuntimeError(result.stdout+'\n'+result.stderr)
    results=[]; manifests={name:read(assets/(name+'.json')) for name in MAPS}
    for name, manifest in manifests.items():
        for id, asset in manifest['assets'].items():
            original=asset.get('highTextures'); target=target_size(asset)
            if protected(id,asset) or not original or original.get('shading')!='toon-color': continue
            tex=original['textures']['albedo']
            if tex['width']<=target: continue
            source=assets/tex['url']; key=source.stem+'-'+str(target); start=time.monotonic()
            if key not in ledger:
                source_bytes=source.read_bytes()
                if digest(source_bytes)!=source.stem: raise RuntimeError('Source hash mismatch '+str(source))
                png=out/(key+'-source.png'); scaled=out/(key+'-scaled.png'); dest=out/(key+'.ktx2')
                run([ktx,'extract','--transcode','rgba8','--level','0',str(source),str(png)])
                with Image.open(png) as image:
                    image=image.convert('RGBA' if tex.get('alpha') else 'RGB')
                    image.resize((target,target),Image.Resampling.LANCZOS).save(scaled)
                command=[ktx,'create','--format','R8G8B8A8_SRGB' if tex.get('alpha') else 'R8G8B8_SRGB',
                    '--assign-tf','srgb','--assign-primaries','bt709','--assign-texcoord-origin','top-left',
                    '--generate-mipmap','--encode','uastc' if tex.get('codec')=='uastc' else 'basis-lz','--threads','2']
                if tex.get('codec')=='uastc': command+=['--uastc-quality','2','--zstd','18','--uastc-rdo','--uastc-rdo-l','0.5','--uastc-rdo-d','4096','--uastc-rdo-m']
                else: command+=['--qlevel','180','--clevel','1']
                run(command+[str(scaled),str(dest)]); run([ktx,'validate',str(dest)])
                data=dest.read_bytes(); filename=digest(data)+'.ktx2'; (content/filename).write_bytes(data)
                ledger[key]={'source':tex['url'],'sourceBytes':len(source_bytes),'url':'./content/'+filename,'width':target,'height':target,
                    'bytes':len(data),'codec':tex['codec'],'alpha':bool(tex.get('alpha')),'gpuBlockBytes':tex.get('gpuBlockBytes',16),'seconds':round(time.monotonic()-start,2)}
                write(ledger_path,ledger); print(f'{len(ledger)} {name}/{id} {tex["width"]} -> {target}: {len(data)} bytes',flush=True)
            row=ledger[key]; data=(assets/row['url']).read_bytes()
            if digest(data)!=Path(row['url']).stem: raise RuntimeError('Derived hash mismatch')
            profile=copy.deepcopy(original); profile['textures']['albedo']={k:row[k] for k in ('url','width','height','bytes','codec','alpha','gpuBlockBytes')}
            profile['resources']=[row['url']]; profile['colorResolution']=target
            profile['colorEncoding']=f'KTX2 {tex["codec"].upper()} / sRGB / full mip chain / mobile {target}'
            asset['mobileHighTextures']=profile; results.append({'map':name,'asset':id,'from':tex['width'],'to':target,'source':tex['url'],'derived':row['url']})
        if args.apply: write(assets/(name+'.json'),manifest)
    summary={'applied':args.apply,'profiles':results,'uniqueDerived':len(ledger),'sourceFilesUnmodified':True,'housesExcluded':True,'bossesExcluded':True,
        'downloadBytesBefore':sum(v['sourceBytes'] for v in ledger.values()),'downloadBytesAfter':sum(v['bytes'] for v in ledger.values())}
    write(out.parent/'scenery-profiles.json',summary); print(json.dumps({k:v for k,v in summary.items() if k!='profiles'}),flush=True)
if __name__=='__main__': main()
