"""Local terrain paint from the authored map; no generated artwork or service calls."""
import hashlib,json,math,subprocess
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw,ImageFilter
root=Path(__file__).resolve().parent.parent
out=root/'reports/monster-forest-v4';out.mkdir(parents=True,exist_ok=True)
layout=json.loads((out/'layout.json').read_text());assets=root/'public/assets'
size=2048;span=160;unit=size/span;rng=np.random.default_rng(281104)
def pixel(x,z):return ((x+80)*unit,(80-z)*unit)
def field(n):return np.array(Image.fromarray(np.uint8(rng.random((n,n))*255)).resize((size,size),Image.Resampling.BICUBIC),dtype=np.float32)/255
broad,patch,fine=[field(n) for n in (21,89,333)]
road=Image.new('L',(size,size));draw=ImageDraw.Draw(road)
for ri,route in enumerate(layout['routes']):
 for i,(x,z) in enumerate(route['samples']):
  px,py=pixel(x,z);r=route['width']*.5*unit*(1+.12*math.sin(i*.13+ri));draw.ellipse((px-r,py-r,px+r,py+r),fill=255)
for c in layout['clearings']:
 pts=[]
 for i in range(90):
  a=i*math.tau/90;r=c['r']*(1+.06*math.sin(a*5+c['x']));pts.append(pixel(c['x']+math.cos(a)*r,c['z']+math.sin(a)*r))
 draw.polygon(pts,fill=245)
wear=np.array(road.filter(ImageFilter.GaussianBlur(unit*.55)),dtype=np.float32)/255
wear=np.clip(wear+(patch-.5)*.32*wear*(1-wear)*4,0,1)
variation=(broad-.5)*22+(patch-.5)*17+(fine-.5)*8
soil=np.array([153,132,94])+variation[:,:,None]*[.8,.75,.6]
moss=np.array([108,106,77])+variation[:,:,None]*[.9,.9,.6]
paint=Image.fromarray(np.uint8(np.clip(moss*(1-wear[:,:,None])+soil*wear[:,:,None],0,255)))
brush=ImageDraw.Draw(paint,'RGBA')
for i in range(28000):
 x,y=rng.integers(2,size-2,2);r=rng.uniform(.7,2)
 if wear[y,x]>.65:
  brush.ellipse((x-r,y-r*.6,x+r,y+r*.6),fill=(195,176,137,90) if i%3 else (75,68,48,70))
 else:
  brush.polygon([(x-r,y),(x,y-r*.7),(x+r,y),(x,y+r*.7)],fill=(133,112,68,95) if i%3 else (54,61,38,65))
contacts=Image.new('RGBA',(size,size));cd=ImageDraw.Draw(contacts)
for p in layout['placements']:
 x,y=pixel(p['x'],p['z']);r=(.6 if p['kind']=='tree' else .85)*p['scale']*unit
 cd.ellipse((x-r,y-r*.7,x+r,y+r*.7),fill=(30,34,27,55))
paint=Image.alpha_composite(paint.convert('RGBA'),contacts.filter(ImageFilter.GaussianBlur(unit*.2)))
paint.putalpha(Image.fromarray(np.uint8(64+191*wear)));paint.save(out/'forest-ground.png');paint.convert('RGB').save(out/'forest-ground-review.png')
ktx=Path('C:/Program Files/KTX-Software/bin/ktx.exe')
subprocess.run([str(ktx),'create','--format','R8G8B8A8_SRGB','--encode','basis-lz','--qlevel','255','--clevel','1','--generate-mipmap','--threads','4',str(out/'forest-ground.png'),str(out/'forest-ground.ktx2')],check=True,capture_output=True)
data=(out/'forest-ground.ktx2').read_bytes();url='./content/'+hashlib.sha256(data).hexdigest()+'.ktx2';(assets/url).write_bytes(data)
village=json.loads((assets/'village-ground.json').read_text());detail=village['detail']
manifest={**village,'color':{'url':url,'width':size,'height':size,'bytes':len(data),'codec':'etc1s','alpha':True,'gpuBlockBytes':16},'resources':[url,detail['url']],'method':'curved-forest-paths-clearings-and-leaf-litter'}
(assets/'monster-forest-ground.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({'bytes':len(data),'newGenerationCalls':0,'textureMax':2048}))
