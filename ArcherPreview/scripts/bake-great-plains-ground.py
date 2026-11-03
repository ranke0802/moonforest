"""Paint terrain from traversable road coordinates; reuse the game's detail map."""
import hashlib,json,math,subprocess,os
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw,ImageFilter
root=Path(__file__).resolve().parent.parent;out=root/os.environ.get('PLAINS_REVIEW_DIR','reports/great-plains-2026-11-02');assets=root/'public/assets'
layout=json.loads((out/'layout.json').read_text());size=2048;span=layout['span'];unit=size/span;rng=np.random.default_rng(261102)
def pixel(x,z):return ((x+span/2)*unit,(span/2-z)*unit)
def field(n):return np.asarray(Image.fromarray(np.uint8(rng.random((n,n))*255)).resize((size,size),Image.Resampling.BICUBIC),dtype=np.float32)/255
# Match the village's existing brush palette and spatial noise scales in metres.
# The plains retains its own roads, river, clearings and lookout mask.
broad,patch,fine,grain=[field(round(n*span/160)) for n in (19,87,251,1024)]
road=Image.new('L',(size,size));draw=ImageDraw.Draw(road)
for route in layout['routes']:
 for i,(x,z) in enumerate(route['samples']):
  px,py=pixel(x,z);r=route['width']*.5*unit*(1 if route.get('gateway') else 1+.04*math.sin(i*.17));draw.ellipse((px-r,py-r,px+r,py+r),fill=255)
for c in layout['clearings']:
 px,py=pixel(c['x'],c['z']);r=c['r']*unit;draw.ellipse((px-r,py-r,px+r,py+r),fill=245)
shoulders=np.asarray(road.filter(ImageFilter.GaussianBlur(unit*1.1)),dtype=np.float32)/255
wear=np.maximum(np.asarray(road.filter(ImageFilter.GaussianBlur(unit*.24)),dtype=np.float32)/255,shoulders*.68)
wear=np.maximum(wear,np.clip((patch-.46)*.42,0,.10))
wear=np.clip(wear+(fine-.5)*.34*wear*(1-wear)*4,0,1)
variation=(broad-.5)*13+(patch-.5)*17+(fine-.5)*8+(grain-.5)*5
soil=np.array([170,151,115])+variation[:,:,None]*[.72,.66,.51]
grass=np.array([117,126,77])+variation[:,:,None]*[1,.95,.64]
paint=Image.fromarray(np.uint8(np.clip(grass*(1-wear[:,:,None])+soil*wear[:,:,None],0,255))).convert('RGBA')
# Exposed stone follows the same village-facing hill contract as the terrain.
wx=np.linspace(-span/2,span/2,size)[None,:];wz=np.linspace(span/2,-span/2,size)[:,None]
hill=layout.get('lookout',{'x':-28,'z':-20,'height':8,'stretchX':1.1,'capRadius':9,'cliffWidth':3,'rampTopX':-37,'rampHalfWidth':3,'rampShoulder':6})
d=np.sqrt(((wx-hill['x'])/hill['stretchX'])**2+(wz-hill['z'])**2)
t=np.clip((d-hill['capRadius'])/hill['cliffWidth'],0,1);height=hill['height']*(1-t*t*(3-2*t))
cliff=np.clip((d-hill['capRadius']-.1)*2,0,1)*np.clip((hill['capRadius']+hill['cliffWidth']-d)*2,0,1)
ramp=(wx<hill['rampTopX']+2)*(1-np.clip((np.abs(wz-hill['z'])-hill['rampHalfWidth'])/hill['rampShoulder'],0,1))
cliff*=1-ramp
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
for i in range(round(53000*(span/160)**2)):
 x,y=rng.integers(3,size-3,2);soil_weight=wear[y,x]
 if soil_weight<.65 and rng.random()<(1-soil_weight)*.85:
  r=rng.uniform(1.2,3.2)*160/span;angle=rng.uniform(0,math.tau)
  for k in range(3):
   a=angle+(k-1)*.65;dx,dy=math.cos(a)*r,math.sin(a)*r
   brush.line((x,y,x+dx,y+dy),fill=(77,93,48,40) if k%2 else (170,175,111,60),width=1)
 elif soil_weight>.45 and rng.random()<.42:
  r=rng.uniform(.5,1.35)*160/span;brush.ellipse((x-r,y-r*.6,x+r,y+r*.6),fill=(98,88,63,30) if i%3 else (224,211,174,72))
# A damp bank on the baked map aligns with the physical water ribbon.
brush.line([pixel(x,z) for x,z in layout['stream']],fill=(133,136,104,200),width=round(8.8*unit),joint='curve')
brush.line([pixel(x,z) for x,z in layout['stream']],fill=(94,119,110,230),width=round(5.8*unit),joint='curve')
paint=Image.alpha_composite(paint,marks)
contacts=Image.new('RGBA',(size,size));cd=ImageDraw.Draw(contacts);litter=Image.new('RGBA',(size,size));ld=ImageDraw.Draw(litter)
for p in layout['placements']:
 if p['kind'] not in ['tree','rock','tower','landmark','prop']:continue
 px,py=pixel(p['x'],p['z']);scale=p['scale'];tree=p['kind']=='tree';foot=p.get('colliderFootprint',[1.6,1.6])
 rx=(.55 if tree else foot[0]*.42)*scale*unit;ry=(.45 if tree else foot[1]*.42)*scale*unit
 cd.ellipse((px-rx,py-ry,px+rx,py+ry),fill=(39,46,26,55))
 if tree:
  for _ in range(20):
   a=rng.uniform(0,math.tau);r=rng.uniform(.4,1.8)*scale*unit;lx,ly=px+math.cos(a)*r,py+math.sin(a)*r
   ld.ellipse((lx-.7,ly-.4,lx+.7,ly+.4),fill=(133,115,68,85))
paint=Image.alpha_composite(Image.alpha_composite(paint,litter),contacts.filter(ImageFilter.GaussianBlur(unit*.14)))
paint.putalpha(Image.fromarray(np.uint8(64+191*wear)))
# The gateway reuses the village's actual paint through the same rigid transform.
# This is a derived existing image, with unchanged 2K resolution/detail textures.
boundary=layout.get('boundary');village_paint=out/'ground-color.png'
if boundary and village_paint.exists():
 y,x=np.mgrid[0:size,0:size];px=x/unit-span/2-boundary['plainsPortal']['x'];pz=span/2-y/unit-boundary['plainsPortal']['z'];c=math.cos(boundary['yaw']);s=math.sin(boundary['yaw'])
 vx=boundary['villagePortal']['x']+c*px-s*pz;vz=boundary['villagePortal']['z']+s*px+c*pz
 def smooth(v):
  t=np.clip(v,0,1);return t*t*(3-2*t)
 blend=(1-smooth((np.abs(vx)-38)/8))*(1-smooth((30-vz)/8))*(1-smooth((vz-88)/10))
 source=np.asarray(Image.open(village_paint).convert('RGBA'));sx=np.clip(np.rint((vx+80)/160*source.shape[1]).astype(int),0,source.shape[1]-1);sy=np.clip(np.rint((80-vz)/160*source.shape[0]).astype(int),0,source.shape[0]-1)
 paint=Image.fromarray(np.uint8(np.clip(np.asarray(paint)*(1-blend[:,:,None])+source[sy,sx]*blend[:,:,None],0,255)))
forest_boundary=layout.get('forestBoundary');forest_paint=out/'forest-ground-color.png'
if forest_boundary and forest_paint.exists():
 y,x=np.mgrid[0:size,0:size];px=x/unit-span/2-forest_boundary['plainsPortal']['x'];pz=span/2-y/unit-forest_boundary['plainsPortal']['z'];c=math.cos(forest_boundary['yaw']);s=math.sin(forest_boundary['yaw'])
 fx=forest_boundary['forestPortal']['x']+c*px-s*pz;fz=forest_boundary['forestPortal']['z']+s*px+c*pz
 def forest_smooth(v):
  t=np.clip(v,0,1);return t*t*(3-2*t)
 # The native road ends at z55. Keep its exact painted gate, then blend to
 # the plains' traversable continuation around the existing outer trunks.
 blend=(1-forest_smooth((np.abs(fx)-29)/9))*(1-forest_smooth((24-fz)/10))*(1-forest_smooth((fz-58)/12))
 source=np.asarray(Image.open(forest_paint).convert('RGBA'));sx=np.clip(np.rint((fx+80)/160*source.shape[1]).astype(int),0,source.shape[1]-1);sy=np.clip(np.rint((80-fz)/160*source.shape[0]).astype(int),0,source.shape[0]-1)
 paint=Image.fromarray(np.uint8(np.clip(np.asarray(paint)*(1-blend[:,:,None])+source[sy,sx]*blend[:,:,None],0,255)))
paint.save(out/'plains-ground.png')
ktx=Path('C:/Program Files/KTX-Software/bin/ktx.exe');target=out/'plains-ground.ktx2'
subprocess.run([str(ktx),'create','--format','R8G8B8A8_SRGB','--encode','basis-lz','--qlevel','235','--clevel','1','--generate-mipmap','--threads','4',str(out/'plains-ground.png'),str(target)],check=True,capture_output=True)
data=target.read_bytes();url='./content/'+hashlib.sha256(data).hexdigest()+'.ktx2';(assets/url).write_bytes(data)
v=json.loads((assets/'village-ground.json').read_text());detail=v['detail']
manifest={**v,'span':span,'color':{'url':url,'width':size,'height':size,'bytes':len(data),'codec':'etc1s','alpha':True,'gpuBlockBytes':16},'resources':[url,detail['url']],'method':'plains-village-palette-brushwork-own-roads-lookout-and-stream'}
(assets/'great-plains-ground.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({'bytes':len(data),'span':span,'paidCalls':0}))
