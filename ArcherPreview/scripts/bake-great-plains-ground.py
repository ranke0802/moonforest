"""Paint terrain from traversable road coordinates; reuse the game's detail map."""
import hashlib,json,math,subprocess,os
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw,ImageFilter
root=Path(__file__).resolve().parent.parent;out=root/os.environ.get('PLAINS_REVIEW_DIR','reports/great-plains-2026-11-02');assets=root/'public/assets'
layout=json.loads((out/'layout.json').read_text());size=2048;span=layout['span'];unit=size/span;rng=np.random.default_rng(261102)
def pixel(x,z):return ((x+span/2)*unit,(span/2-z)*unit)
def field(n):return np.asarray(Image.fromarray(np.uint8(rng.random((n,n))*255)).resize((size,size),Image.Resampling.BICUBIC),dtype=np.float32)/255
broad,patch,fine=[field(n) for n in (23,91,401)]
road=Image.new('L',(size,size));draw=ImageDraw.Draw(road)
for route in layout['routes']:
 for i,(x,z) in enumerate(route['samples']):
  px,py=pixel(x,z);r=route['width']*.5*unit*(1+.04*math.sin(i*.17));draw.ellipse((px-r,py-r,px+r,py+r),fill=255)
for c in layout['clearings']:
 px,py=pixel(c['x'],c['z']);r=c['r']*unit;draw.ellipse((px-r,py-r,px+r,py+r),fill=245)
wear=np.asarray(road.filter(ImageFilter.GaussianBlur(unit*.25)),dtype=np.float32)/255
variation=(broad-.5)*18+(patch-.5)*12+(fine-.5)*5
soil=np.array([189,163,117])+variation[:,:,None]*[.8,.75,.6]
grass=np.array([144,148,83])+variation[:,:,None]*[.9,.9,.6]
paint=Image.fromarray(np.uint8(np.clip(grass*(1-wear[:,:,None])+soil*wear[:,:,None],0,255))).convert('RGBA')
# Exposed stone on the lookout's steep face, with a grass cap and east ramp.
wx=np.linspace(-span/2,span/2,size)[None,:];wz=np.linspace(span/2,-span/2,size)[:,None]
d=np.sqrt(((wx+28)/1.1)**2+(wz+20)**2)
t=np.clip((d-9)/3,0,1);height=8*(1-t*t*(3-2*t))
cliff=np.clip((d-9.1)*2,0,1)*np.clip((12-d)*2,0,1)
cliff*=1-np.clip((wx+20)/3,0,1)*(1-np.clip((np.abs(wz+20)-3)/6,0,1))
stone=np.array([162,158,140])+(variation*.6+np.sin(height*5)*3)[:,:,None]
rgb=np.asarray(paint)[:,:,:3];rgb=rgb*(1-cliff[:,:,None])+stone*cliff[:,:,None]
paint=Image.fromarray(np.uint8(np.clip(rgb,0,255))).convert('RGBA')
marks=Image.new('RGBA',(size,size));brush=ImageDraw.Draw(marks)
for route in layout['routes']:
 if route['width']<4:continue
 for side in [-1,1]:
  track=[]
  for i,(x,z) in enumerate(route['samples']):
   a=route['samples'][max(0,i-1)];b=route['samples'][min(len(route['samples'])-1,i+1)];dx=b[0]-a[0];dz=b[1]-a[1];length=math.hypot(dx,dz) or 1
   track.append(pixel(x-dz/length*.85*side,z+dx/length*.85*side))
  brush.line(track,fill=(122,99,65,45),width=max(1,round(.18*unit)),joint='curve')
for i in range(22000):
 x,y=rng.integers(2,size-2,2);r=rng.uniform(.4,1.8)
 if wear[y,x]>.65:brush.ellipse((x-r,y-r*.6,x+r,y+r*.6),fill=(204,181,137,65))
 else:brush.line((x,y,x+r,y-r*1.2),fill=(166,166,93,65),width=1)
# A damp bank on the baked map aligns with the physical water ribbon.
brush.line([pixel(x,z) for x,z in layout['stream']],fill=(133,136,104,200),width=round(8.8*unit),joint='curve')
brush.line([pixel(x,z) for x,z in layout['stream']],fill=(94,119,110,230),width=round(5.8*unit),joint='curve')
paint=Image.alpha_composite(paint,marks)
paint.putalpha(Image.fromarray(np.uint8(64+191*wear)));paint.save(out/'plains-ground.png')
ktx=Path('C:/Program Files/KTX-Software/bin/ktx.exe');target=out/'plains-ground.ktx2'
subprocess.run([str(ktx),'create','--format','R8G8B8A8_SRGB','--encode','basis-lz','--qlevel','235','--clevel','1','--generate-mipmap','--threads','4',str(out/'plains-ground.png'),str(target)],check=True,capture_output=True)
data=target.read_bytes();url='./content/'+hashlib.sha256(data).hexdigest()+'.ktx2';(assets/url).write_bytes(data)
v=json.loads((assets/'village-ground.json').read_text());detail=v['detail']
manifest={**v,'span':span,'color':{'url':url,'width':size,'height':size,'bytes':len(data),'codec':'etc1s','alpha':True,'gpuBlockBytes':16},'resources':[url,detail['url']],'method':'approved-plains-crossroads-and-stream'}
(assets/'great-plains-ground.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({'bytes':len(data),'span':span,'paidCalls':0}))
