"""Additive recorded-audio edit; originals stay unchanged. No online generation.
Usage: python mix-world-audio.py <new-source-folder> <existing-foley-folder> <Summoning.mp3>
Requires existing numpy/scipy/imageio_ffmpeg. All source URLs/licenses are in world-audio-sources.json.
"""
import sys,json,subprocess,hashlib
from pathlib import Path
import numpy as np
from scipy.signal import butter,sosfilt,resample_poly
import imageio_ffmpeg

SR=32000; FFMPEG=imageio_ffmpeg.get_ffmpeg_exe()
NEW,OLD,SUMMONING=map(Path,sys.argv[1:4])
OUT=Path(__file__).resolve().parents[2]/'Assets/Resources/Audio/World'
OUT.mkdir(parents=True,exist_ok=True);report={}
def decode(p,channels=1,start=0,length=None):
 args=[FFMPEG,'-v','error','-ss',str(start),'-i',str(p)]
 if length:args+=['-t',str(length)]
 data=subprocess.check_output(args+['-f','f32le','-ac',str(channels),'-ar',str(SR),'pipe:1'],creationflags=0x08000000)
 return np.frombuffer(data,dtype='<f4').copy().reshape(-1,channels)
def read(name,old=False):return decode(next((OLD if old else NEW).rglob(name)))[:,0]
def band(x,lo=55,hi=7000):return sosfilt(butter(2,[lo,hi],btype='band',fs=SR,output='sos'),x,axis=0)
def norm(x,peak=.75):return x*(peak/max(float(abs(x).max()),1e-8))
def rate(x,r):return resample_poly(x,100,round(r*100),axis=0)
def fade(x,seconds=.05):
 x=x.copy();n=min(round(seconds*SR),len(x)//2);a=min(160,n)
 x[:a]*=np.linspace(0,1,a);x[-n:]*=np.linspace(1,0,n);return x
def take(x,seconds):
 active=np.flatnonzero(abs(x)>max(float(abs(x).max())*.12,.0001));start=max(0,int(active[0])-160) if len(active) else 0
 return fade(x[start:start+round(seconds*SR)])
def mix(*parts):
 x=np.zeros(max(len(a)+round(t*SR) for a,g,t in parts))
 for a,g,t in parts:s=round(t*SR);x[s:s+len(a)]+=a*g
 return x
def echo(x,amount=.14):return mix((x,1,0),(band(x,100,3200),amount,.071),(band(x,180,2400),amount*.5,.137))
def save(name,x,group,label,sources,volume=.35):
 if x.ndim==1:x=x[:,None]
 assert np.isfinite(x).all() and len(x)>100
 ext='wav' if group=='sounds' else 'mp3';p=OUT/(name+'.'+ext)
 args=[FFMPEG,'-y','-v','error','-f','f32le','-ar',str(SR),'-ac',str(x.shape[1]),'-i','pipe:0']
 args+=['-c:a','pcm_s16le'] if ext=='wav' else ['-c:a','libmp3lame','-b:a','128k' if group=='music' else '80k']
 subprocess.run(args+[str(p)],input=np.asarray(x,dtype='<f4').tobytes(),check=True,creationflags=0x08000000)
 decoded=decode(p,x.shape[1]);peak=float(abs(decoded).max());assert peak<.99,(name,peak)
 record=dict(file=p.name,group=group,label=label,seconds=round(len(decoded)/SR,4),channels=x.shape[1],sampleRate=SR,peak=round(peak,5),rms=round(float(np.sqrt(np.mean(decoded**2))),5),bytes=p.stat().st_size,sha256=hashlib.sha256(p.read_bytes()).hexdigest(),sources=sources,volume=volume)
 if group!='sounds':record['seamDelta']=round(float(abs(decoded[0]-decoded[-1]).max()),6)
 report[name]=record;print(name,record['seconds'],record['bytes'],flush=True)
def cue(name,x,label,sources,volume=.4):save(name,fade(norm(band(x),.72)), 'sounds',label,sources,volume)
def loop(x,cross=2):
 n=min(round(cross*SR),len(x)//4);w=np.linspace(0,1,n)[:,None]
 return np.concatenate((x[n:-n],x[-n:]*(1-w)+x[:n]*w))
def score(name,file,start,label,source,volume):
 x=decode(file,2,start,74);x=loop(x);x*=min(.86/max(abs(x).max(),1e-8),.16/max(float(np.sqrt(np.mean(x*x))),1e-8))
 save(name,x,'music',label,[source],volume)
score('village',NEW/'village.mp3',20,'마을 · 귀향의 불빛','echoes',.27)
score('forest',NEW/'forest.mp3',35,'마물의 숲 · 잠들지 않는 숲','anabasis',.25)
score('cave',SUMMONING,119,'마녀의 동굴 · 잊힌 기도','summoning',.24)
score('combat',NEW/'combat.mp3',12,'일반 전투 · 경계의 검','legionnaire',.29)

birds=read('birds.ogg');drips=read('drips.flac')
for name,x,label,source,vol in [
 ('ambience_village',band(birds,110,7200),'마을 · 바람과 새','birds',.12),
 ('ambience_forest',band(rate(birds,.8),65,1900),'마물의 숲 · 낮은 수관 바람','birds',.11),
 ('ambience_cave',band(drips,90,6200),'동굴 · 물방울과 공간 잔향','drips',.14)]:
 if len(x)<20*SR:x=np.tile(x,int(np.ceil(20*SR/len(x))))
 x=loop(x[:20*SR,None]);x*=min(.6/max(abs(x).max(),1e-8),.1/max(float(np.sqrt(np.mean(x*x))),1e-8))
 save(name,x,'ambience',label,[source],vol)

swish=norm(take(read('swish-7.wav',True),.4));leather=norm(take(read('Katana Sheath Fast.wav',True),.6))
stone=norm(take(read('qubodupImpactStone.flac',True),.4));wood=norm(take(read('qubodupImpactWood.flac',True),.35))
tele=norm(take(read('teleport.wav'),1.8));coins=norm(take(read('coins.ogg'),.6))
cue('portal_depart',echo(mix((rate(tele,.82),.65,0),(rate(swish,.5)[::-1],.25,0))),'포탈 · 보라 연무 진입',['teleport','swishes'],.38)
cue('portal_arrive',echo(mix((rate(tele,.92)[::-1],.5,0),(rate(swish,.6),.35,.18))),'포탈 · 도착',['teleport','swishes'],.32)
cue('gold_pickup',mix((coins,.8,0),(leather,.12,.035)),'금화 획득',['coins','weapon-textures'],.32)
cue('potion_drink',mix((norm(take(read('bottle-open-01.flac'),.25)),.65,0),(norm(take(read('swallow-01.flac'),.65)),.5,.15)),'물약 · 병 개봉과 마시기',['bottle'],.35)
cue('grab_caught',mix((rate(leather,.72),.8,0),(rate(wood,.7),.45,.06)),'곰에게 붙잡힘',['weapon-textures','impact'],.48)
cue('grab_escape',echo(mix((rate(leather,1.1),.5,0),(swish,.8,.04)),.07),'곰 잡기에서 탈출',['weapon-textures','swishes'],.44)
cue('evade_success',band(rate(swish,1.3),200,5500),'공격 회피 성공',['swishes'],.2)
for kind,samples,r in [('bear',['Beast Growl 1.wav','Beast Growl 4.wav','Dieing Beast.wav'],.83),('goblin',['Yucky Beast 1.wav','Yucky Beast 4.wav','Dieing pixie.wav'],1.13)]:
 for action,file,length,vol in [('attack',samples[0],.8,.28),('hurt',samples[1],.48,.27),('death',samples[2],1.7,.4)]:
  cue(kind+'_'+action,echo(rate(take(read(file),length),r),.06),('곰' if kind=='bear' else '고블린')+' · '+dict(attack='공격 발성',hurt='피격 발성',death='쓰러짐')[action],['monsters'],vol)
cue('goblin_appear',mix((rate(take(read('Yucky Beast 3.wav'),.85),1.08),.7,0),(leather,.12,0)),'고블린 등장',['monsters','weapon-textures'],.32)
for i in range(3):
 boot=norm(take(read(['step_metal.ogg','step_metal (2).ogg','step_metal (3).ogg'][i],True),.35))
 cue('foot_cave_'+str(i),echo(mix((band(boot,70,2800),.75,0),(rate(stone,.88+i*.06),.2,.01)),.12),'동굴 돌바닥 발걸음 '+str(i+1),['armor-footsteps','impact'],.18)
 cue('foot_forest_'+str(i),mix((band(boot,65,1800),.8,0),(band(rate(leather,.9+i*.05),180,3000),.06,.02)),'숲 흙바닥 발걸음 '+str(i+1),['armor-footsteps','weapon-textures'],.18)
(OUT/'mix-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('Completed',len(report),'additive edits')
