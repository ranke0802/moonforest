from pathlib import Path
import struct,random,subprocess,wave,json,sys
import numpy as np
R=Path(__file__).resolve().parent;O=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else R/'exports';O.mkdir(parents=True,exist_ok=True)
score=json.loads((R/'theme-score.json').read_text());harmony=score['harmony'];melody=score['melody']
SF=Path(sys.argv[2]).resolve() if len(sys.argv)>2 else R.parent/'GeneralUser-GS.sf2';rate=48000;ppq=960

def var(n):
 b=[n&127];n>>=7
 while n:b.insert(0,128|(n&127));n>>=7
 return bytes(b)
def chunk(events,end):
 out=b'';last=0
 for t,pri,data in sorted(events,key=lambda e:(e[0],e[1])):out+=var(t-last)+data;last=t
 out+=var(max(0,end-last))+b'\xff\x2f\x00'
 return b'MTrk'+struct.pack('>I',len(out))+out
reports=[]
for boss in [False,True]:
 name='Silver_Moonwolf' if boss else 'Moonlit_Forest';bpm=112 if boss else 64;tempo=round(60e6/bpm);barbeats=4 if boss else 3;beats=24*barbeats;tracks=[[]for _ in range(10)];rng=random.Random(412+boss)
 programs=[48,45,60,47,8,0,73,48,0,0] if boss else [73,46,0,48,8,0,0,0,0,0]
 volumes=[89,73,66,85,59,62,70,60,60,75] if boss else [73,66,58,63,62,60,60,60,60,60]
 pans=[60,38,79,58,77,63,63,67,64,64]
 def event(ch,t,data,pri=1):tracks[ch].append((round(t*ppq),pri,bytes(data)))
 def note(ch,t,p,d,v):
  if p is None:return
  t=max(0,t+rng.uniform(-.01,.01));v=max(1,v+rng.randint(-3,3));event(ch,t,[0x90+ch,p,v]);event(ch,t+d,[0x80+ch,p,0],0)
 for i,(bass,chord) in enumerate(harmony):
  b=i*barbeats
  if not boss:
   note(2,b,bass,2.5,35)
   for j,p in enumerate([chord[0],chord[2],chord[1]+12,chord[2]]):note(1,b+[0,.75,1.5,2.25][j],p,.9,34 if j==0 else 28)
   for p in chord[:3]:note(3,b+.04,p-12,2.88,24)
   if i%8<4 or i>=20:
    cursor=b
    for p,d in melody[i]:note(0,cursor,None if p is None else p-12,d*.9,48);cursor+=d
   if i%4 in (1,3):note(4,b+1.5,chord[2]+12,.75,33);note(4,b+2.25,chord[1]+12,.5,27)
  else:
   # Low string ostinato drives battle; horns state the title theme in augmentation.
   for k in range(8):note(1,b+k*.5,[bass+12,chord[2]-12,bass+12,chord[1]][k%4],.31,66 if k%2==0 else 49)
   for p in chord[:3]:note(0,b,p,1.65,55);note(0,b+2,p,1.65,61)
   if i%8<6:
    cursor=b
    for p,d in melody[i]:note(2,cursor,None if p is None else p-12,d*4/3*.87,64);cursor+=d*4/3
   else:note(4,b+.5,chord[2]+12,.6,48);note(4,b+2,chord[3]+12,.6,43)
   for t in [0,2]:note(3,b+t,bass,1.1,64);note(9,b+t,36,.12,66)
   for t in [1,3]:note(9,b+t,38,.12,39)
   for t in [.5,1.5,2.5,3.5]:note(9,b+t,42,.08,24)
   if i%8==7:
    for t in [2.5,3,3.5]:note(9,b+t,45,.15,48)
  for t,v in [(0,52),(.6,68),(barbeats-.35,53)]:event(0 if boss else 3,b+t,[0xB0+(0 if boss else 3),11,v])
 def write(cycles,path):
  end=round(beats*cycles*ppq);chunks=[chunk([(0,0,b'\xff\x51\x03'+tempo.to_bytes(3,'big')),(0,1,b'\xff\x58\x04'+(b'\x04\x02' if boss else b'\x06\x03')+b'\x18\x08')],end)]
  for ch,events in enumerate(tracks):
   if not events:continue
   ev=[(0,-1,bytes([0xC0+ch,programs[ch]]))]
   for cc,val in [(7,volumes[ch]),(10,pans[ch]),(91,36),(93,0)]:ev.append((0,0,bytes([0xB0+ch,cc,val])))
   for c in range(cycles):ev +=[(t+c*beats*ppq,pri,data)for t,pri,data in events]
   chunks.append(chunk(ev,end))
  path.write_bytes(b'MThd'+struct.pack('>IHHH',6,1,len(chunks),ppq)+b''.join(chunks))
 write(1,O/(name+'.mid'));write(3,R/(name+'-render.mid'))
 subprocess.run(['fluidsynth','-ni','-F',str(R/(name+'-raw.wav')),'-T','wav','-O','s16','-r',str(rate),'-g','.6','-C','0','-R','1','-o','synth.reverb.room-size=0.7','-o','synth.reverb.level=0.24',str(SF),str(R/(name+'-render.mid'))],check=True,stdout=subprocess.DEVNULL)
 with wave.open(str(R/(name+'-raw.wav')),'rb')as w:raw=np.frombuffer(w.readframes(w.getnframes()),'<i2').reshape(-1,2).astype(float)/32768
 n=round(beats*tempo/1e6*rate);a=raw[n:2*n].copy();a-=a.mean(0);m=240;ramp=np.linspace(0,1,m)[:,None];delta=a[-1]-a[0];a[:m]+=delta/2*(1-ramp);a[-m:]-=delta/2*ramp
 target=-20 if not boss else -19.5;a*=min(10**(-2.5/20)/abs(a).max(),10**(target/20)/np.sqrt(np.mean(a*a)))
 def save(path,data):
  with wave.open(str(path),'wb')as w:w.setnchannels(2);w.setsampwidth(2);w.setframerate(rate);w.writeframes((np.clip(data,-1,1)*32767).astype('<i2').tobytes())
 save(O/(name+'_Loop.wav'),a);preview=a.copy();fi=rate;fo=rate*3;preview[:fi]*=np.linspace(0,1,fi)[:,None];preview[-fo:]*=np.linspace(1,0,fo)[:,None];save(R/(name+'-preview.wav'),preview)
 subprocess.run(['lame','--quiet','-V','2',str(R/(name+'-preview.wav')),str(O/(name+'.mp3'))],check=True)
 reports.append(dict(name=name,seconds=n/rate,bpm=bpm,peakDBFS=float(20*np.log10(abs(a).max())),rmsDBFS=float(20*np.log10(np.sqrt(np.mean(a*a)))),rawClipped=int((abs(raw)>=.99996).sum()),loopBoundary=float(abs(a[-1]-a[0]).max())))
(O/'world-music-checks.json').write_text(json.dumps(reports,indent=2));print(reports)
