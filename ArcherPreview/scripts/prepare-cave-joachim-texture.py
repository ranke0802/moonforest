"""Bounded offline ETC1S color profiles from the existing Joachim albedo."""
import hashlib,json,subprocess,sys
from pathlib import Path
from PIL import Image

source,out=map(Path,sys.argv[1:3]);out.mkdir(parents=True,exist_ok=True)
ktx=Path('C:/Program Files/KTX-Software/bin/ktx.exe')
image=Image.open(source).convert('RGB');profiles=[]
for size in (4096,1024,512,256):
    png=out/f'color-{size}.png';target=out/f'color-{size}.ktx2'
    image.resize((size,size),Image.Resampling.LANCZOS).save(png)
    subprocess.run([str(ktx),'create','--format','R8G8B8_SRGB','--assign-tf','srgb','--assign-primaries','bt709','--assign-texcoord-origin','top-left','--generate-mipmap','--encode','basis-lz','--qlevel','255','--clevel','1','--no-endpoint-rdo','--no-selector-rdo','--threads','4',str(png),str(target)],check=True,capture_output=True)
    subprocess.run([str(ktx),'validate',str(target)],check=True,capture_output=True)
    data=target.read_bytes()
    profiles.append({'file':str(target),'width':size,'height':size,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'codec':'etc1s','alpha':False,'gpuBlockBytes':8})
(out/'profiles.json').write_text(json.dumps(profiles,indent=2),encoding='utf-8')
print(json.dumps({'profiles':len(profiles),'sequential':True,'newGenerationCalls':0}))
