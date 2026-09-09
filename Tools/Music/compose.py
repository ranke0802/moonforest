"""Original 24-bar title waltz, Moonlit First Steps. No borrowed melody/MIDI.
Run with Python 3 + numpy; requires fluidsynth and adjacent GeneralUser-GS.sf2.
"""
from pathlib import Path
import struct, random, subprocess, wave, json, math, shutil, sys
import numpy as np
ROOT=Path(__file__).resolve().parent
OUT=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else ROOT/'exports'
OUT.mkdir(parents=True,exist_ok=True)
RATE=48000; PPQ=960; TEMPO=round(60_000_000/76); BEATS=72
SECONDS=BEATS*TEMPO/1e6; rng=random.Random(411)
# Bass note + voiced chord. A minor, with warm relative-major excursions.
harmony=[
 (45,[57,60,64,71]),(41,[57,60,64,69]),(48,[55,59,64,67]),(43,[55,59,62,69]),
 (38,[57,60,64,65]),(40,[57,60,64,69]),(47,[57,59,62,65]),(40,[56,59,62,64]),
 (45,[57,60,64,71]),(41,[57,60,64,69]),(48,[55,59,64,67]),(43,[55,59,62,69]),
 (38,[57,60,64,65]),(40,[57,60,64,69]),(47,[57,59,62,65]),(40,[56,59,62,64]),
 (41,[57,60,64,69]),(43,[55,59,62,69]),(40,[55,59,62,67]),(45,[57,60,64,71]),
 (38,[57,60,64,65]),(43,[55,60,62,67]),(41,[57,60,64,69]),(40,[56,59,62,64])]
# Each list is exactly three quarter-note beats; None gives an intentional breath.
melody=[
 [(76,.5),(81,.5),(83,.5),(84,1),(83,.5)],
 [(81,1),(76,.5),(77,.5),(76,.5),(None,.5)],
 [(79,.75),(76,.25),(74,.5),(76,1),(79,.5)],
 [(78,.5),(79,.5),(83,.5),(81,1),(None,.5)],
 [(77,.5),(81,.5),(84,.5),(83,.5),(81,.5),(77,.5)],
 [(76,1.5),(72,.5),(74,.5),(76,.5)],
 [(77,.75),(76,.25),(74,.5),(71,1),(None,.5)],
 [(71,.5),(74,.5),(80,.5),(83,.75),(None,.75)],
 [(76,.5),(81,.5),(83,.5),(84,.75),(83,.25),(81,.5)],
 [(81,.75),(79,.25),(76,.5),(77,1),(None,.5)],
 [(79,.5),(84,.5),(83,.5),(79,1),(76,.5)],
 [(74,.75),(79,.25),(83,.5),(81,1),(None,.5)],
 [(81,.5),(84,.5),(86,.5),(84,.5),(81,.5),(77,.5)],
 [(76,1),(79,.5),(81,1),(None,.5)],
 [(77,.5),(76,.5),(74,.5),(71,1),(None,.5)],
 [(76,.5),(80,.5),(83,.5),(80,.75),(None,.75)],
 [(81,1),(79,.5),(76,.5),(77,.5),(None,.5)],
 [(79,.5),(83,.5),(86,1),(83,.5),(81,.5)],
 [(79,1),(76,.5),(74,.5),(71,.5),(None,.5)],
 [(76,.5),(81,.5),(84,1),(83,.5),(81,.5)],
 [(77,.5),(81,.5),(84,.5),(81,1),(77,.5)],
 [(79,.75),(76,.25),(74,.5),(72,1),(None,.5)],
 [(76,.5),(77,.5),(81,1),(79,.5),(77,.5)],
 [(76,.5),(74,.5),(71,.5),(68,.75),(None,.75)]
]
assert all(abs(sum(d for _,d in bar)-3)<1e-6 for bar in melody)
tracks=[[] for _ in range(5)]
note_counts=[0]*5

def event(ch,beat,data,priority=1): tracks[ch].append((round(beat*PPQ),priority,bytes(data)))
def note(ch,beat,pitch,duration,velocity):
 if pitch is None:return
 # Timing is fixed across repetitions; preserve exact loop boundaries.
 beat=max(0,beat+rng.uniform(-.013,.013));velocity=max(1,min(110,velocity+rng.randint(-3,3)))
 event(ch,beat,[0x90+ch,pitch,velocity]);event(ch,beat+duration,[0x80+ch,pitch,0],0);note_counts[ch]+=1
for bar,(bass,chord) in enumerate(harmony):
 b=bar*3
 # Harp: rolling compound meter with a gap before phrase cadences.
 arp=[chord[0],chord[2],chord[3],chord[1]+12,chord[2],chord[1]]
 for k,pitch in enumerate(arp):
  if bar in (7,15,23) and k==5:continue
  note(1,b+k*.5,pitch,.66,43 if k in (0,3) else 35)
 # Felt-like piano lower register, intentionally sparse.
 note(2,b,bass,1.9,39);note(2,b+1.5,chord[1],1.1,29)
 for pitch in [chord[0]-12,chord[1],chord[2]]:note(3,b+.035,pitch,2.87,25 if bar<8 else 29)
 # Celesta presents and reprises the tune; flute answers in the second section.
 cursor=b
 for pitch,duration in melody[bar]:
  if 8<=bar<16:
   note(4,cursor,None if pitch is None else pitch-12,duration*.89,57)
   if cursor-b in (0,1.5):note(0,cursor,pitch,min(.45,duration*.8),43)
  else:note(0,cursor,pitch,duration*.86,61 if bar<8 else 65)
  cursor+=duration
 # A small answering sparkle, never a constant doubled melody.
 if bar in (1,5,17,21):note(0,b+2.75,chord[2]+12,.18,35)
 # Shape strings gently instead of blasting a block chord at fixed volume.
 for offset,exp in [(0,44),(.5,62),(1.5,69),(2.5,52),(2.88,42)]:event(3,b+offset,[0xB3,11,exp])

def varlen(n):
 b=[n&127];n>>=7
 while n:b.insert(0,(n&127)|128);n>>=7
 return bytes(b)
def chunk(events,end):
 result=b'';last=0
 for tick,priority,msg in sorted(events,key=lambda e:(e[0],e[1])):
  result+=varlen(tick-last)+msg;last=tick
 result+=varlen(max(0,end-last))+b'\xff\x2f\x00'
 return b'MTrk'+struct.pack('>I',len(result))+result
programs=[8,46,0,48,73];volumes=[89,75,71,66,80];pans=[65,39,84,56,76]
def midi(cycles,path):
 meta=[(0,0,b'\xff\x51\x03'+TEMPO.to_bytes(3,'big')),(0,1,b'\xff\x58\x04\x06\x03\x18\x08'),(0,1,b'\xff\x59\x02\x00\x01')]
 chunks=[chunk(meta,round(cycles*BEATS*PPQ))]
 for ch in range(5):
  name=['Moonlight celesta','Silver harp','Quiet piano','Forest strings','Flute reply'][ch].encode()
  ev=[(0,-1,b'\xff\x03'+varlen(len(name))+name),(0,0,bytes([0xC0+ch,programs[ch]]))]
  for cc,value in [(7,volumes[ch]),(10,pans[ch]),(91,45),(93,0)]:ev.append((0,0,bytes([0xB0+ch,cc,value])))
  for c in range(cycles):ev +=[(tick+c*BEATS*PPQ,pri,msg) for tick,pri,msg in tracks[ch]]
  chunks.append(chunk(ev,round(cycles*BEATS*PPQ)))
 path.write_bytes(b'MThd'+struct.pack('>IHHH',6,1,len(chunks),PPQ)+b''.join(chunks))
midi(1,OUT/'Moonlit_First_Steps.mid');midi(3,ROOT/'render-three-cycles.mid')
subprocess.run(['fluidsynth','-ni','-F',str(ROOT/'render.wav'),'-T','wav','-O','s16','-r',str(RATE),'-g','.7','-C','0','-R','1','-o','synth.reverb.room-size=0.68','-o','synth.reverb.damp=0.35','-o','synth.reverb.level=0.27',str(ROOT/'GeneralUser-GS.sf2'),str(ROOT/'render-three-cycles.mid')],check=True)
with wave.open(str(ROOT/'render.wav'),'rb') as w:
 assert w.getnchannels()==2 and w.getsampwidth()==2
 full=np.frombuffer(w.readframes(w.getnframes()),dtype='<i2').reshape(-1,2).astype(np.float64)/32768
length=round(SECONDS*RATE)
# Middle cycle contains the previous cadence's natural reverb; no silent tail at the loop.
loop=full[length:2*length].copy()
loop-=loop.mean(axis=0)
# Symmetric tiny seam correction removes any waveform jump without shifting musical timing.
seam=loop[-1]-loop[0]; n=round(.005*RATE);ramp=np.linspace(0,1,n)[:,None]
loop[:n]+=seam/2*(1-ramp);loop[-n:]-=seam/2*ramp
peak=np.max(np.abs(loop));gain=min(10**(-2.2/20)/peak,10**(-20/20)/np.sqrt(np.mean(loop**2)))
loop*=gain
preview=loop.copy();fadein=round(.65*RATE);fadeout=round(2.6*RATE)
preview[:fadein]*=np.sin(np.linspace(0,np.pi/2,fadein))[:,None]**2
preview[-fadeout:]*=np.cos(np.linspace(0,np.pi/2,fadeout))[:,None]**2

def save(name,a):
 with wave.open(str(OUT/name),'wb') as w:
  w.setnchannels(2);w.setsampwidth(2);w.setframerate(RATE);w.writeframes(np.round(np.clip(a,-1,1)*32767).astype('<i2').tobytes())
save('Moonlit_First_Steps_Loop.wav',loop);save('Moonlit_First_Steps_Preview.wav',preview)
# MP3 is a convenient audition copy; Unity gets the sample-exact WAV loop.
subprocess.run(['/opt/homebrew/bin/lame','--quiet','-V','2',str(OUT/'Moonlit_First_Steps_Preview.wav'),str(OUT/'Moonlit_First_Steps.mp3')],check=True)
report={'title':'달빛 아래 첫걸음 / Moonlit First Steps','seconds':len(loop)/RATE,'bpm':76,'meter':'6/8','bars':24,'sampleRate':RATE,'channels':2,'notesPerTrack':note_counts,'peakDBFS':20*np.log10(np.max(np.abs(loop))),'rmsDBFS':20*np.log10(np.sqrt(np.mean(loop**2))),'clippedSamples':int(np.sum(np.abs(loop)>=1)),'loopBoundaryStep':float(np.max(np.abs(loop[-1]-loop[0]))),'soundfont':'GeneralUser GS 2.0.3','composer':'Original melody and arrangement created for this project by Codex'}
(OUT/'audio-checks.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
shutil.copy2(ROOT/'GeneralUser-LICENSE.txt',OUT/'GeneralUser-LICENSE.txt')
print(json.dumps(report,ensure_ascii=False,indent=2))
