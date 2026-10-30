"""Objective texture comparison and compact visual evidence sheets."""
import json, math
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont

OUT=Path(__file__).resolve().parents[1]/'reports/elena-two-phase'
font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',18)
def sheet(paths,labels,out,cols=3,tile=384):
    rows=math.ceil(len(paths)/cols);canvas=Image.new('RGB',(cols*tile,rows*(tile+32)),(27,33,40));d=ImageDraw.Draw(canvas)
    for i,(p,label)in enumerate(zip(paths,labels)):
        image=Image.open(p).convert('RGB');ratio=tile/max(image.size);image=image.resize((round(image.width*ratio),round(image.height*ratio)),Image.Resampling.LANCZOS);x=(i%cols)*tile;y=(i//cols)*(tile+32)
        canvas.paste(image,(x+(tile-image.width)//2,y));d.text((x+9,y+tile+6),label,font=font,fill='white')
    canvas.save(OUT/out)
sheet([OUT/f'asset-source-{v}.png'for v in ['front','side','back']],['Source / front','Source / side','Source / back'],'asset-source-views-sheet.png')
labels=['Walk 0.3s','Walk 0.9s','Cast 0.0s','Cast 0.6s','Cast 1.2s','Cast 1.8s','Cast 2.4s','Cast 3.0s','Walk 0.0s','Walk 0.6s']
sheet([OUT/f'asset-source-sequence-{i:02d}.png'for i in range(10)],labels,'asset-source-motion-sheet.png',cols=5,tile=320)
sheet([OUT/'asset-source-front.png',OUT/'asset-source-front-low.png'],['960px source','384px same camera'],'asset-source-resolution-sheet.png',cols=2,tile=480)
src=np.asarray(Image.open(OUT/'asset-source-texture-0.png').convert('RGB'),dtype=np.float32)
decoded=np.asarray(Image.open(OUT/'asset-decoded-texture-0.png').convert('RGB'),dtype=np.float32)
assert src.shape==decoded.shape
diff=decoded-src;absdiff=abs(diff);mse=float(np.mean(diff*diff));psnr=10*math.log10(255**2/mse)
report={'size':list(src.shape[:2]),'mseRGB':mse,'psnrRGBdB':psnr,'maeRGB':float(absdiff.mean()),'rmseRGB':math.sqrt(mse),'maxChannelError':float(absdiff.max()),'p95ChannelError':float(np.percentile(absdiff,95)),'p99ChannelError':float(np.percentile(absdiff,99)),'preservedAlpha':True,'hasSourceAlpha':False,'codec':'ETC1S q255; endpoint and selector RDO disabled; 13 mip levels','comparison':'KTX2 transcoded to RGBA8, mip 0 vs decoded original JPEG RGB; same pixels, no resampling'}
(OUT/'asset-texture-comparison.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
Image.fromarray(np.clip(absdiff*8,0,255).astype('uint8')).save(OUT/'asset-texture-error-x8.png')
sheet([OUT/'asset-source-texture-0.png',OUT/'asset-decoded-texture-0.png',OUT/'asset-texture-error-x8.png'],['Original 4K JPEG decoded','ETC1S q255 decoded','Absolute error x8'],'asset-texture-comparison-sheet.png',tile=512)
print(json.dumps(report))

frames=[OUT/f'asset-motion-frame-{i:03d}.png'for i in range(78)]
if all(p.exists()for p in frames):
    animation=[]
    for i,p in enumerate(frames):
        frame=Image.open(p).convert('RGB');canvas=Image.new('RGB',(320,348),(27,33,40));canvas.paste(frame,(0,28));d=ImageDraw.Draw(canvas)
        phase='WALK'if i<24 or i>=54 else 'CAST';d.text((8,5),f'Source rig: {phase}  |  {i/10:.1f}s',font=font,fill='white');animation.append(canvas)
    gif=OUT/'asset-source-walk-cast-walk.gif';animation[0].save(gif,save_all=True,append_images=animation[1:],duration=100,loop=0,optimize=False)
    with Image.open(gif)as verified:assert verified.n_frames==78
    for p in frames:
        assert p.resolve().parent==OUT.resolve() and p.name.startswith('asset-motion-frame-')
        p.unlink()
    mr=OUT/'asset-blender-motion-report.json';data=json.loads(mr.read_text(encoding='utf-8'));data['animationArtifact']=str(gif);data['fps']=10;data['durationSeconds']=7.8
    for i,s in enumerate(data['samples']):s.pop('path',None);s['gifFrame']=i
    mr.write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
    print('Created 78-frame source action animation:',gif)
