"""Offline Foley editing. No procedural tone generators or runtime DSP.

Usage: python mix-combat-audio.py <download/extract directory> <sb_thesummoning.mp3>
Source credits and licenses: Assets/Resources/Audio/LICENSES.txt.
Requires numpy, scipy, soundfile, imageio-ffmpeg. Source archives stay outside Git.
"""
import sys, json, subprocess
from pathlib import Path
import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfilt, resample_poly
import imageio_ffmpeg

ROOT=Path(__file__).resolve().parents[2]/'Assets/Resources/Audio'
SOURCE=Path(sys.argv[1]); MUSIC=Path(sys.argv[2]); SR=32000
OUT=ROOT/'SFX';OUT.mkdir(parents=True,exist_ok=True)
report={}
def read(name):
    path=next(SOURCE.rglob(name)); x,sr=sf.read(path,always_2d=True)
    return resample_poly(x.mean(axis=1),SR,sr)
def band(x,lo=45,hi=7800):
    return sosfilt(butter(2,[lo,hi],btype='band',fs=SR,output='sos'),x)
def trim(x,limit=1):
    # Recordings contain multiple takes. Keep a single early transient and tail.
    envelope=np.sqrt(np.convolve(x*x,np.ones(160)/160,mode='same'))
    active=np.flatnonzero(envelope>max(envelope.max()*.12,.00005))
    if len(active):x=x[max(0,active[0]-160):max(0,active[0]-160)+int(limit*SR)]
    return x
def rate(x,r):return resample_poly(x,100,int(r*100))
def norm(x,peak=.8):return x*(peak/max(np.max(np.abs(x)),.00001))
def fade(x,end=.055):
    x=x.copy();n=min(int(end*SR),len(x)//2);a=min(64,len(x)//2)
    x[:a]*=np.linspace(0,1,a);x[-n:]*=np.linspace(1,0,n);return x
def mix(*layers):
    size=max(len(x)+int(delay*SR) for x,gain,delay in layers);out=np.zeros(size)
    for x,gain,delay in layers:
        start=int(delay*SR);out[start:start+len(x)]+=x*gain
    return out
def tail(x,amount=.1):
    # Short offline early reflections; no ringing oscillator or per-frame reverb.
    return mix((x,1,0),(band(x,90,3400),amount,.047),(band(x,90,2600),amount*.55,.101))
def save(name,x,peak=.85):
    x=fade(norm(band(x,38,9000),peak));sf.write(OUT/(name+'.wav'),x,SR,subtype='PCM_16')
    report[name]={'seconds':round(len(x)/SR,3),'peak':round(float(abs(x).max()),4),'rms':round(float(np.sqrt(np.mean(x*x))),4)}

flesh=[norm(trim(read('sword-1'+v+'.wav'),.55)) for v in ['a','b']]
hammer=[norm(trim(read('hammer-1'+v+'.wav'),.65)) for v in ['a','b']]
armor=norm(trim(read('hammer-arm-2a.wav'),.65))
wood=norm(trim(read('qubodupImpactWood.flac'),.4))
stone=norm(trim(read('qubodupImpactStone.flac'),.5))
metal=norm(trim(read('Mace Axe Blade and Haft.wav'),.65))
clash=norm(trim(read('Axe Norse Sword Blade on Blade.wav'),.65))
leather=norm(trim(read('Katana Sheath Fast.wav'),.55))
swings=[norm(trim(read('swish-'+str(n)+'.wav'),.3)) for n in [7,8,9]]
bow=norm(trim(read('English Longbow Draw.wav'),.65))
release=norm(trim(read('English Longbow Shoot.wav'),.4))
for i in range(3):
    suffix='' if i==0 else '_'+str(i)
    swoosh=rate(swings[i],.66+.04*i)
    save('slash'+suffix,tail(mix((swoosh,1,0),(rate(leather,.9),.14,0)),.06))
    save('boss_hit'+suffix,tail(mix((rate(flesh[i%2],.88),1,0),(rate(hammer[i%2],.7),.65,.012),(band(armor,200,4200),.16,.01))))
    save('block'+suffix,tail(mix((rate(metal,.82+i*.025),.6,0),(rate(wood,.7),.9,.008),(band(clash,400,4800),.25,0)),.13))
    save('foot_'+str(i),mix((rate(wood,.82+i*.08),1,0),(band(leather,500,6200),.16,.025)),.56)
save('slash_heavy',tail(mix((rate(swings[0],.5),1,0),(rate(swings[2],.62),.65,.09),(band(leather,150,2500),.3,0)),.1))
save('shield_up',mix((leather,.7,0),(band(metal,130,2400),.22,.055)),.7)
save('parry',tail(mix((rate(clash,.92),.7,0),(rate(wood,.67),.85,.008)),.12))
save('roll',mix((rate(leather,.66),.7,0),(band(swings[1],80,2500),.55,.04),(wood,.35,.11)),.65)
save('land',tail(mix((rate(hammer[0],.62),.8,0),(rate(stone,.65),.75,.01),(band(armor,170,2600),.5,.03)),.12))
save('jump',mix((wood,.5,0),(leather,.3,.01)),.58)
save('player_hit',tail(mix((rate(armor,.83),.8,0),(rate(hammer[1],.7),.7,.005)),.08))
save('critical',mix((rate(hammer[1],.6),1,0),(rate(flesh[1],.7),.5,0)),.7)
save('equip',leather,.55)
save('bow_draw',bow,.6);save('bow_release',release,.8)
save('arrow_hit',mix((norm(trim(read('piercing-1a.wav'),.4)),.9,0),(wood,.3,.008)),.8)
save('ui_click',wood[:int(SR*.07)],.36)
save('ui_open',band(leather[:int(SR*.16)],150,3500),.4)
save('ui_back',band(leather[:int(SR*.12)][::-1],150,3500),.35)
save('ui_error',band(wood[:int(SR*.11)],80,1000),.38)
save('heal_start',tail(mix((bow,.5,0),(rate(swings[1],.4)[::-1],.35,.08)),.15),.55)
save('heal_tick',band(rate(swings[2],.6),150,1800),.35)
save('charge_ready',tail(mix((rate(leather,.65)[::-1],.65,0),(rate(metal,.6),.18,.18)),.12),.7)
save('boss_warning',tail(mix((rate(leather,.45)[::-1],.6,0),(rate(hammer[0],.4),.5,.12)),.22),.8)
save('low_health',mix((band(rate(hammer[0],.6),45,300),1,0),(band(rate(hammer[1],.65),45,300),.65,.25)),.65)

# A real orchestral recording, licensed for commercial use with attribution.
music,sr=sf.read(MUSIC,always_2d=True);music=resample_poly(music,SR,sr)
for name,start,length,peak in [('boss_appear',33,2.8,.75),('death',177,3.5,.65),('revive',23,1.4,.45),('victory',196,3.4,.6)]:
    save(name,music[int(start*SR):int((start+length)*SR)].mean(axis=1),peak)
# 90-second combat bed, three-second equal-gain edit to join the loop without clicks.
music=music[24*SR:117*SR];cross=3*SR
weights=np.linspace(0,1,cross)[:,None]
join=music[-cross:]*(1-weights)+music[:cross]*weights
loop=np.concatenate([music[cross:-cross],join]);loop*=.9/max(abs(loop).max(),.00001)
music_dir=ROOT/'Music';music_dir.mkdir(exist_ok=True)
temp=music_dir/'boss_battle_mix.wav';sf.write(temp,loop,SR,subtype='PCM_16')
subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),'-y','-loglevel','error','-i',str(temp),'-codec:a','libmp3lame','-b:a','128k',str(music_dir/'boss_battle.mp3')],check=True)
temp.unlink()
report['boss_music']={'seconds':len(loop)/SR,'channels':2,'sampleRate':SR,'source':'The Summoning — Scott Buckley','sourceExcerpt':[24,117],'crossfadeSeconds':3}
(ROOT/'mix-report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print('Prepared',len(report)-1,'sampled cues and',len(loop)/SR,'seconds of orchestral music')
