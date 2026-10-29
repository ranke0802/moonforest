"""Bake non-repeating cave strata/footwear masks in world space; no AI calls."""
import hashlib,json,math,subprocess,os
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw,ImageFilter
root=Path(__file__).resolve().parent.parent;out=Path(os.environ.get('CAVE_REVIEW_OUT',str(root/'reports/witch-cave-v5')));out.mkdir(parents=True,exist_ok=True)
layout=json.loads((out/'layout.json').read_text());assets=root/'public/assets'
size=2048;span=160;unit=size/span;rng=np.random.default_rng(291005)
def pixel(x,z):return ((x+80)*unit,(80-z)*unit)
def field(n):return np.array(Image.fromarray(np.uint8(rng.random((n,n))*255)).resize((size,size),Image.Resampling.BICUBIC),dtype=np.float32)/255
broad,patch,fine=[field(n) for n in (17,73,369)]
route=Image.new('L',(size,size));draw=ImageDraw.Draw(route)
for points in layout['routes']:
 for a,b in zip(points,points[1:]):
  count=max(2,math.ceil(math.hypot(b[0]-a[0],b[1]-a[1])*3))
  for i in range(count+1):
   t=i/count;x=a[0]+(b[0]-a[0])*t;z=a[1]+(b[1]-a[1])*t;px,py=pixel(x,z);r=(a[3]+(b[3]-a[3])*t)*unit
   draw.ellipse((px-r,py-r,px+r,py+r),fill=255)
for c in layout['rooms']:
 x,y=pixel(c['x'],c['z']);r=c['r']*unit;draw.ellipse((x-r,y-r,x+r,y+r),fill=255)
walk=np.array(route.filter(ImageFilter.GaussianBlur(unit*.4)),dtype=np.float32)/255
wear=np.clip(walk+(patch-.5)*.4*walk*(1-walk)*4,0,1)
variation=(broad-.5)*21+(patch-.5)*15+(fine-.5)*6
stone=np.array([112,111,123])+variation[:,:,None]*[.9,.82,.9]
dust=np.array([139,131,120])+variation[:,:,None]*[1,.95,.9]
paint=Image.fromarray(np.uint8(np.clip(stone*(1-wear[:,:,None])+dust*wear[:,:,None],0,255)))
brush=ImageDraw.Draw(paint,'RGBA')
# Uneven worn slabs, exposed around the travel lane; scattered orientation and
# region-dependent coverage avoid a repeated paved grid. Reuses the same 2K map.
for i in range(6500):
 x,y=rng.integers(12,size-12,2)
 if wear[y,x]<.35 or rng.random()<.38:continue
 angle=rng.uniform(0,math.tau);r=rng.uniform(2.5,8.5);points=[]
 for k in range(6):
  a=angle+k*math.tau/6;rr=r*rng.uniform(.72,1.1);points.append((x+math.cos(a)*rr,y+math.sin(a)*rr*.7))
 brush.polygon(points,fill=(155,147,135,55),outline=(71,72,83,65),width=1)
 brush.line(points[:3],fill=(192,180,157,65),width=1)
for i in range(26000):
 x,y=rng.integers(3,size-3,2);r=rng.uniform(.6,2.2);shade=(180,165,146,70) if i%3 else (68,64,72,60)
 brush.polygon([(x-r,y),(x-r*.4,y-r*.5),(x+r,y-r*.25),(x+r*.6,y+r*.5)],fill=shade)
# Long irregular, sparse mineral seams break the macro shapes without a tile.
for i in range(160):
 x,y=rng.uniform(0,size,2);angle=rng.uniform(0,math.tau);points=[]
 for step in range(int(rng.integers(3,8))):
  x+=math.cos(angle)*rng.uniform(4,18);y+=math.sin(angle)*rng.uniform(4,18);angle+=rng.uniform(-.5,.5);points.append((x,y))
 brush.line(points,fill=(76,70,79,38),width=1)
# Static contact shade does not depend on camera rotation or a shadow slot.
contact=Image.new('RGBA',(size,size));cd=ImageDraw.Draw(contact)
for p in layout['placements']:
 if not any(key in p['asset'] for key in ['eroded-wall','great-column','workbench','shelf','cot','resurrection-altar']):continue
 x,y=pixel(p['x'],p['z']);s=p['scale'];r=(2.4 if 'wall' in p['asset'] else 1.2)*s*unit
 cd.ellipse((x-r,y-r*.65,x+r,y+r*.65),fill=(31,34,48,85 if 'wall' in p['asset'] else 65))
paint=Image.alpha_composite(paint.convert('RGBA'),contact.filter(ImageFilter.GaussianBlur(unit*.45)))
# Warm mineral tint beneath lanterns is baked once, without point-light passes.
glow=Image.new('RGBA',(size,size));gd=ImageDraw.Draw(glow)
for p in layout['placements']:
 if not p['asset'].endswith('votive-lantern'):continue
 x,y=pixel(p['x'],p['z']);r=2.2*unit;gd.ellipse((x-r,y-r,x+r,y+r),fill=(215,157,82,48))
paint=Image.alpha_composite(paint.convert('RGBA'),glow.filter(ImageFilter.GaussianBlur(unit*.7)))
paint.putalpha(Image.fromarray(np.uint8(64+191*wear)));paint.save(out/'cave-ground.png');paint.convert('RGB').save(out/'cave-ground-review.png')
ktx=Path('C:/Program Files/KTX-Software/bin/ktx.exe')
subprocess.run([str(ktx),'create','--format','R8G8B8A8_SRGB','--encode','basis-lz','--qlevel','255','--clevel','1','--generate-mipmap','--threads','4',str(out/'cave-ground.png'),str(out/'cave-ground.ktx2')],check=True,capture_output=True)
subprocess.run([str(ktx),'validate',str(out/'cave-ground.ktx2')],check=True,capture_output=True)
data=(out/'cave-ground.ktx2').read_bytes();url='./content/'+hashlib.sha256(data).hexdigest()+'.ktx2';(assets/url).write_bytes(data)

# Packed cave microdetail: irregular fractured stone in R, fine dust in G.
# The two runtime rotations keep its small repeated pattern unobtrusive.
detailSize=256
yy,xx=np.mgrid[:detailSize,:detailSize].astype(np.float32)
cell=32;gx=np.floor(xx/cell).astype(int);gy=np.floor(yy/cell).astype(int)
sites=rng.uniform(.18,.82,(10,10,2));distances=[]
for oy in [-1,0,1]:
 for ox in [-1,0,1]:
  ix=gx+ox;iy=gy+oy;site=sites[(iy+1)%10,(ix+1)%10]
  distances.append(((ix+site[:,:,0])*cell-xx)**2+((iy+site[:,:,1])*cell-yy)**2)
d=np.sort(np.stack(distances),axis=0);edge=np.sqrt(d[1])-np.sqrt(d[0])
grain=rng.random((256,256));stone=.50+.14*np.clip(edge/7,0,1)-.20*np.exp(-edge*1.8)+(grain-.5)*.13
dust=.50+(grain-.5)*.18
packed=np.uint8(np.clip(np.stack([stone,dust,np.full_like(stone,.5)],axis=2)*255,0,255))
Image.fromarray(packed).save(out/'cave-detail.png')
subprocess.run([str(ktx),'create','--format','R8G8B8_UNORM','--encode','basis-lz','--qlevel','255','--generate-mipmap',str(out/'cave-detail.png'),str(out/'cave-detail.ktx2')],check=True,capture_output=True)
detailBytes=(out/'cave-detail.ktx2').read_bytes();detailUrl='./content/'+hashlib.sha256(detailBytes).hexdigest()+'.ktx2';(assets/detailUrl).write_bytes(detailBytes)
village=json.loads((assets/'village-ground.json').read_text(encoding='utf-8'));detail={**village['detail'],'url':detailUrl,'bytes':len(detailBytes),'codec':'etc1s','gpuBlockBytes':8}

manifest={**village,'color':{'url':url,'width':size,'height':size,'bytes':len(data),'codec':'etc1s','alpha':True,'gpuBlockBytes':16},'detail':detail,'resources':[url,detail['url']],'gpuBytesWithMips':round((2048*2048+256*256/2)*4/3),'compression':'KTX2/Basis ETC1S color and linear packed detail','method':'unique-world-space-eroded-cave-rock-and-dust'}
(assets/'witch-cave-ground.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'bytes':len(data),'newGenerationCalls':0,'textureMax':2048}))
