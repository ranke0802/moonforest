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
travel=Image.new('L',(size,size));td=ImageDraw.Draw(travel)
for points in layout['routes']:
 for a,b in zip(points,points[1:]):
  count=max(2,math.ceil(math.hypot(b[0]-a[0],b[1]-a[1])*3))
  for i in range(count+1):
   t=i/count;x=a[0]+(b[0]-a[0])*t;z=a[1]+(b[1]-a[1])*t;px,py=pixel(x,z);r=(a[3]+(b[3]-a[3])*t)*unit
   draw.ellipse((px-r,py-r,px+r,py+r),fill=255)
   worn=r*.38;px+=math.sin(x*.19+z*.12)*unit*.32
   td.ellipse((px-worn,py-worn,px+worn,py+worn),fill=210)
for c in layout['rooms']:
 x,y=pixel(c['x'],c['z']);r=c['r']*unit;draw.ellipse((x-r,y-r,x+r,y+r),fill=255)
walk=np.array(route.filter(ImageFilter.GaussianBlur(unit*.4)),dtype=np.float32)/255
# The route remains rock; dust follows actual foot traffic rather than
# painting every room as an identical pale disk. The three story areas have
# distinct, softly joined surfaces in this one world-space map.
traffic=np.array(travel.filter(ImageFilter.GaussianBlur(unit*.8)),dtype=np.float32)/255
Y,X=np.mgrid[:size,:size];wx=X/unit-80;wz=80-Y/unit
def ellipse(cx,cz,rx,rz):return np.exp(-(((wx-cx)/rx)**2+((wz-cz)/rz)**2)*1.8)
refuge=ellipse(-32,21,6,5);lab=ellipse(-37,-19,8,6);ritual=ellipse(29,-38,8,6)
activity=np.maximum.reduce([traffic,refuge*.70,lab*.65,ritual*.50])*walk
wear=np.clip(activity+(patch-.5)*.18*activity*(1-activity)*4,0,1)
variation=(broad-.5)*12+(patch-.5)*7+(fine-.5)*2.5
stone=np.array([106,108,113])+variation[:,:,None]*[.9,.95,1]
dust=np.array([134,125,110])+variation[:,:,None]*[1,.96,.9]
color=stone*(1-wear[:,:,None]*.68)+dust*wear[:,:,None]*.68
# Dampness is confined to pool shoulders, not a noisy overlay over every floor.
damp=np.zeros((size,size),dtype=np.float32)
for pool in layout.get('pools',[]):
 d=np.sqrt(((wx-pool['x'])/pool['rx'])**2+((wz-pool['z'])/pool['rz'])**2)
 damp=np.maximum(damp,np.exp(-((d-1.04)/.16)**2)*(.3+.7*(1-walk)))
color*=1-damp[:,:,None]*.10
color+=damp[:,:,None]*np.array([-2,1,3])
paint=Image.fromarray(np.uint8(np.clip(color,0,255)))
brush=ImageDraw.Draw(paint,'RGBA')
# Reused ritual stonework is local to the protected altar and its approaches.
# Asymmetric worn slabs do not turn the entire natural cave into a paved plaza.
for i in range(480):
 x,z=rng.uniform(19,39),rng.uniform(-44,-31)
 px,py=pixel(x,z);ix,iy=int(px),int(py)
 if ritual[iy,ix]<.18 or walk[iy,ix]<.8:continue
 angle=rng.uniform(-.16,.16);r=rng.uniform(.26,.56)*unit;points=[]
 for k in range(6):
  a=angle+k*math.tau/6;rr=r*rng.uniform(.78,1.08);points.append((px+math.cos(a)*rr,py+math.sin(a)*rr*.66))
 brush.polygon(points,fill=(143,136,124,42),outline=(72,74,81,40),width=1)
 brush.line(points[:3],fill=(179,168,147,40),width=1)
# Sparse fracture seams align with the main geology, without gravel speckles.
for i in range(240):
 x,y=rng.uniform(0,size,2);angle=-.38+rng.uniform(-.28,.28);points=[]
 for step in range(int(rng.integers(4,10))):
  x+=math.cos(angle)*rng.uniform(7,19);y+=math.sin(angle)*rng.uniform(7,19);angle+=rng.uniform(-.20,.20);points.append((x,y))
 brush.line(points,fill=(70,74,83,23),width=1)
# Static contact shade does not depend on camera rotation or a shadow slot.
contact=Image.new('RGBA',(size,size));cd=ImageDraw.Draw(contact)
for p in layout['placements']:
 if not any(key in p['asset'] for key in ['eroded-wall','great-column','workbench','shelf','cot','resurrection-altar']):continue
 x,y=pixel(p['x'],p['z']);s=p['scale'];r=(2.4 if 'wall' in p['asset'] else 1.2)*s*unit
 cd.ellipse((x-r,y-r*.65,x+r,y+r*.65),fill=(31,34,44,48 if 'wall' in p['asset'] else 48))
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

# Retain the already published microdetail map byte-for-byte. Only the macro
# paint/contact changes; no unrelated detail resources are recompressed.
previous=json.loads((assets/'witch-cave-ground.json').read_text(encoding='utf-8'))
detail=previous['detail']
manifest={**previous,'color':{'url':url,'width':size,'height':size,'bytes':len(data),'codec':'etc1s','alpha':True,'gpuBlockBytes':16},'resources':[url,detail['url']],'compression':'KTX2/Basis ETC1S color and linear packed detail','method':'unique-world-space-refuge-laboratory-resurrection-rock-and-dust'}
(assets/'witch-cave-ground.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'bytes':len(data),'newGenerationCalls':0,'textureMax':2048,'detailReused':True}))
