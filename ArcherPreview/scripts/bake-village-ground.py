"""Bake the authored terrain paint once, instead of repainting it on phones.

No AI service or source artwork is generated. The existing procedural ground is
repainted as a unique world map plus a small packed surface-detail texture.
"""
import argparse,json,hashlib,math
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw,ImageFilter

def bake(layout,root,out):
    size=2048;span=160;unit=size/span;rng=np.random.default_rng(281028)
    def field(cells):
        grid=np.uint8(rng.random((cells,cells))*255)
        return np.asarray(Image.fromarray(grid).resize((size,size),Image.Resampling.BICUBIC),dtype=np.float32)/255
    broad,patch,fine,grain=[field(n) for n in (19,87,251,1024)]
    def pixel(x,z):return ((x+span/2)*unit,(span/2-z)*unit)
    road=Image.new('L',(size,size));draw=ImageDraw.Draw(road)
    for ri,route in enumerate(layout['routes']):
        for i,(x,z) in enumerate(route['samples']):
            width=route['width']*(1+.11*math.sin(i*.041+ri*2.1)+.065*math.sin(i*.113+ri))
            px,py=pixel(x,z);r=width*.5*unit;draw.ellipse((px-r,py-r,px+r,py+r),fill=255)
    # Irregular market apron joins the paths without a circular stamped border.
    plaza=[]
    for i in range(96):
        a=i*math.tau/96;r=6.6+.7*math.sin(3*a+.4)+.42*math.cos(5*a)
        plaza.append(pixel(math.cos(a)*r,math.sin(a)*r))
    draw.polygon(plaza,fill=255)
    yards=Image.new('L',(size,size));yd=ImageDraw.Draw(yards)
    for p in layout['placements']:
        if p['kind'] not in ['building','garden','prop','tower','landmark']:continue
        building=p['kind']=='building';foot=p.get('footprint',p.get('colliderFootprint',[2,2]));scale=p['scale']
        rx=(foot[0]*.52+(1.1 if building else .25))*scale;rz=(foot[1]*.52+(1.1 if building else .25))*scale
        c,s=math.cos(p['yaw']),math.sin(p['yaw']);points=[]
        for i in range(40):
            a=i*math.tau/40;r=1+.09*math.sin(a*5+p['x'])+.07*math.cos(a*3+p['z'])
            x,z=math.cos(a)*r*rx,math.sin(a)*r*rz
            points.append(pixel(p['x']+x*c+z*s,p['z']-x*s+z*c))
        yd.polygon(points,fill=225 if building else 170)
    shoulders=np.asarray(road.filter(ImageFilter.GaussianBlur(unit*1.1)),dtype=np.float32)/255
    road=np.asarray(road.filter(ImageFilter.GaussianBlur(unit*.24)),dtype=np.float32)/255
    yards=np.asarray(yards.filter(ImageFilter.GaussianBlur(unit*.5)),dtype=np.float32)/255
    y,x=np.mgrid[0:size,0:size];wx=x/unit-span/2;wz=span/2-y/unit
    # Warp only the paint, never the walkable terrain or asset positions.
    ix=np.clip(x+np.rint((patch-.5)*unit*.85).astype(int),0,size-1);iy=np.clip(y+np.rint((fine-.5)*unit*.55).astype(int),0,size-1)
    wear=np.maximum(np.maximum(road[iy,ix],shoulders*.68),yards)
    inside=np.clip((47-np.hypot(wx,wz))/20,0,1)
    wear=np.maximum(wear,inside*(.19+np.clip((broad-.5)*.32,0,.16)))
    wear=np.clip(wear+(fine-.5)*.34*wear*(1-wear)*4,0,1)
    variation=(broad-.5)*13+(patch-.5)*17+(fine-.5)*8+(grain-.5)*5
    grass=np.array([117,126,77],np.float32)[None,None,:]+variation[:,:,None]*np.array([1,.95,.64])
    soil=np.array([170,151,115],np.float32)[None,None,:]+variation[:,:,None]*np.array([.72,.66,.51])
    color=np.uint8(np.clip(grass*(1-wear[:,:,None])+soil*wear[:,:,None],0,255))
    paint=Image.fromarray(color);brush=ImageDraw.Draw(paint,'RGBA')
    # Cluster brush strokes at irregular spacings. No square pixels or repeated
    # tiled color patches; the world map carries all placement-scale variation.
    for i in range(53000):
        px,py=rng.integers(3,size-3,2);soil_weight=wear[py,px]
        if soil_weight<.65 and rng.random()<(1-soil_weight)*.85:
            r=rng.uniform(1.2,3.2);angle=rng.uniform(0,math.tau)
            for k in range(3):
                a=angle+(k-1)*.65;dx,dy=math.cos(a)*r,math.sin(a)*r
                brush.line((px,py,px+dx,py+dy),fill=(77,93,48,40) if k%2 else (170,175,111,60),width=1)
        elif soil_weight>.45 and rng.random()<.42:
            r=rng.uniform(.5,1.35);brush.ellipse((px-r,py-r*.6,px+r,py+r*.6),fill=(98,88,63,30) if i%3 else (224,211,174,72))
    # Soft contact and scattered leaf litter follow the same authored objects.
    contacts=Image.new('RGBA',(size,size));cd=ImageDraw.Draw(contacts)
    for p in layout['placements']:
        if p['kind'] not in ['tree','building','rock','tower','landmark','prop']:continue
        px,py=pixel(p['x'],p['z']);scale=p['scale'];tree=p['kind']=='tree';foot=p.get('colliderFootprint',[1.6,1.6])
        rx=(.55 if tree else foot[0]*.42)*scale*unit;ry=(.45 if tree else foot[1]*.42)*scale*unit
        cd.ellipse((px-rx,py-ry,px+rx,py+ry),fill=(39,46,26,55))
        if tree:
            for _ in range(20):
                a=rng.uniform(0,math.tau);r=rng.uniform(.4,1.8)*scale*unit;lx,ly=px+math.cos(a)*r,py+math.sin(a)*r
                brush.ellipse((lx-1.2,ly-.7,lx+1.2,ly+.7),fill=(133,115,68,85))
    paint=Image.alpha_composite(paint.convert('RGBA'),contacts.filter(ImageFilter.GaussianBlur(unit*.14)))
    # Keep alpha nonzero: browser image decoders may discard RGB behind fully
    # transparent pixels even though the ground material itself is opaque.
    paint.putalpha(Image.fromarray(np.uint8(64+wear*191)))
    out.mkdir(parents=True,exist_ok=True);paint.convert('RGB').save(out/'ground-paint-review.png')
    # Packed neutral detail: R = brushy grass, G = granular earth. Small mirrored
    # borders make bilinear wrap seamless; two rotated scales hide tile repeats.
    n=256;detail_rng=np.random.default_rng(4891)
    detail=np.uint8(np.clip(detail_rng.normal(128,11,(n,n)),48,208));soil_detail=Image.fromarray(detail);sd=ImageDraw.Draw(soil_detail)
    for _ in range(640):
        x0,y0=detail_rng.uniform(0,n,2);r=detail_rng.uniform(.8,2.5);value=int(detail_rng.uniform(72,182))
        for ox in (-n,0,n):
            for oy in (-n,0,n):sd.ellipse((x0+ox-r,y0+oy-r*.6,x0+ox+r,y0+oy+r*.6),fill=value)
    grass_detail=Image.fromarray(np.uint8(np.clip(detail_rng.normal(128,9,(n,n)),64,192)))
    gd=ImageDraw.Draw(grass_detail)
    for _ in range(1350):
        x0,y0=detail_rng.uniform(0,n,2);angle=detail_rng.uniform(0,math.tau);length=detail_rng.uniform(6,18);value=int(detail_rng.uniform(53,201))
        for ox in (-n,0,n):
            for oy in (-n,0,n):gd.line((x0+ox,y0+oy,x0+ox+math.cos(angle)*length,y0+oy+math.sin(angle)*length),fill=value,width=2)
    detail_image=Image.merge('RGB',(grass_detail,soil_detail,Image.new('L',(n,n),128)))
    content=root/'content';content.mkdir(parents=True,exist_ok=True)
    def store(image,name,**kwargs):
        file=out/name;image.save(file,**kwargs);data=file.read_bytes();ref='./content/'+hashlib.sha256(data).hexdigest()+file.suffix;(root/ref).write_bytes(data);return {'url':ref,'width':image.width,'height':image.height,'bytes':len(data)}
    color_info=store(paint,'ground-color.webp',quality=91,method=6)
    detail_info=store(detail_image,'ground-detail.png',optimize=True)
    manifest={'version':1,'span':span,'color':color_info,'detail':detail_info,'soilMaskAlphaRange':[64,255],'gpuBytesWithMips':round((size*size+n*n)*4*4/3),'extraDrawCalls':0,'detailSamples':2,'method':'unique-painted-world-map-and-packed-microdetail','resources':[color_info['url'],detail_info['url']]}
    (root/'village-ground.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8');print(json.dumps(manifest))

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--layout',required=True);parser.add_argument('--root',required=True);parser.add_argument('--out',required=True);args=parser.parse_args()
    bake(json.loads(Path(args.layout).read_text(encoding='utf-8')),Path(args.root),Path(args.out))
