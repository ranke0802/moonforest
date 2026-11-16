"""Original creature source/filter synthesis. No recordings or sampled assets.
Python 3, numpy, scipy. Outputs are local to this registered source directory.
"""
from pathlib import Path
import hashlib, json, math, wave
import numpy as np
from scipy import signal

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'sfx'
OUT.mkdir(parents=True, exist_ok=True)
SR = 32000
PROFILES = {
    'wolf': dict(pitch=132, formants=[440, 1120, 2350], rough=.27, air=.20, duration=.78),
    'fox': dict(pitch=318, formants=[820, 1820, 3250], rough=.14, air=.12, duration=.48),
    'boar': dict(pitch=103, formants=[520, 1050, 1980], rough=.32, air=.33, duration=.67),
    'bear': dict(pitch=81, formants=[340, 830, 1590], rough=.42, air=.29, duration=1.12),
}

def shaped_noise(rng, count, low, high):
    a = rng.standard_normal(count)
    a = signal.sosfilt(signal.butter(3, [low, high], btype='bandpass', fs=SR, output='sos'), a)
    return a / max(float(np.std(a)), 1e-9)

def smooth_random(rng, count, frequency):
    anchors = max(3, int(count / SR * frequency) + 2)
    return np.interp(np.arange(count), np.linspace(0, count - 1, anchors), rng.uniform(-1, 1, anchors))

def vocal(species, action, variant, rng):
    p = PROFILES[species]
    duration = p['duration'] * {'attack':1, 'hurt':.71, 'death':1.56, 'alert':1.16}[action]
    duration *= 1 + .07 * variant
    t = np.arange(round(duration * SR)) / SR
    u = t / duration
    if action == 'hurt':
        sweep = 1.15 + .72 * np.exp(-((u-.15)/.18)**2) - .30*u
        envelope = (1-np.exp(-t/.009))*np.exp(-u*3.7)
    elif action == 'death':
        sweep = 1.05 - .48*u + .10*np.sin(u*5)
        envelope = (1-np.exp(-t/.025))*(1-u)**1.3
        envelope *= .65 + .35*np.sin(2*np.pi*(2.8*t+.4))**2
    elif action == 'alert':
        sweep = .82 + .16*np.sin(np.pi*u)
        envelope = np.sin(np.pi*u)**.72
    else:
        sweep = .85 + .48*np.sin(np.pi*u)**.55 - .20*u
        envelope = (1-np.exp(-t/.014))*(1-u)**1.25
    # Slow irregular excitation and subharmonics distinguish a throat from a
    # pitched electronic sine. Formants are independently species-specific.
    pitch = p['pitch'] * sweep * (1 + .055*smooth_random(rng,len(t),32) + .025*np.sin(2*np.pi*17.7*t))
    pitch *= 1 + .035*variant
    phase = 2*np.pi*np.cumsum(pitch)/SR
    glottis = np.zeros(len(t))
    for harmonic in range(1, 24):
        glottis += np.sin(harmonic*phase + .09*np.sin(2*np.pi*(3+harmonic*.11)*t))/(harmonic**1.35)
    glottis += p['rough']*np.sin(phase*.5)*(1+.36*np.sin(phase/3))
    glottis *= 1 + .28*smooth_random(rng,len(t),24)
    airy = shaped_noise(rng,len(t),110,6600)
    excitation = glottis + p['air']*airy
    voice = .23*excitation
    for i, formant in enumerate(p['formants']):
        b,a = signal.iirpeak(formant*(1+.025*variant), [2.2,3.1,4.3][i], fs=SR)
        voice += signal.lfilter(b,a,excitation)*[2.5,1.8,1.05][i]
    if species == 'fox':
        # Fox-like dry bark/yelp clusters, avoiding a miniature bear roar.
        cluster = np.exp(-((u-.13)/.10)**2) + .58*np.exp(-((u-.46)/.09)**2) + .30*np.exp(-((u-.72)/.08)**2)
        voice *= .16+cluster
    elif species == 'boar':
        voice *= .48+.52*np.maximum(0,np.sin(2*np.pi*(5.2*t+.12)))**.55
        voice += shaped_noise(rng,len(t),500,4800)*.20*np.exp(-((u-.18)/.12)**2)
    elif species == 'bear':
        voice *= .75+.25*np.sin(phase*.17)**2
        voice += .16*shaped_noise(rng,len(t),55,550)
    else:
        voice += .13*shaped_noise(rng,len(t),1800,6400)*np.exp(-((u-.08)/.07)**2)
    return voice*envelope

def contact(species, action, variant, rng):
    duration = .20 if action=='step' else .34
    duration *= 1+.055*variant
    t = np.arange(round(duration*SR))/SR
    weight = {'fox':.48,'wolf':.70,'boar':.88,'bear':1.12}[species]
    base = {'fox':175,'wolf':124,'boar':99,'bear':72}[species]
    phase = 2*np.pi*np.cumsum(base*np.exp(-t*13)+43)/SR
    a = np.sin(phase)*np.exp(-t*(31 if action=='step' else 23))*.55*weight
    a += shaped_noise(rng,len(t),140,2100)*np.exp(-t*42)*.25
    a += shaped_noise(rng,len(t),900,6300)*np.exp(-t*66)*(.10 if action=='step' else .18)
    if action=='step':
        # Paw/hoof double contact + loose grit; no copied armored footsteps.
        delay=round((.024 if species=='boar' else .037)*SR)
        a[delay:] += a[:-delay].copy()*.24
        for at in rng.uniform(.035,.12,4):
            a += rng.uniform(.02,.05)*np.sin(2*np.pi*rng.uniform(1300,3400)*t)*np.exp(-np.maximum(0,t-at)*120)*(t>=at)
    else:
        a += .22*shaped_noise(rng,len(t),380,3800)*(1-np.exp(-t/.009))*np.exp(-t*24)
    return a

def save(name, audio):
    audio = np.asarray(audio,dtype=np.float64)
    audio = signal.sosfilt(signal.butter(2,45,btype='highpass',fs=SR,output='sos'),audio)
    audio -= audio.mean()
    audio = np.tanh(audio*.95)
    fade=min(round(.008*SR),len(audio)//8)
    audio[:fade] *= np.linspace(0,1,fade)
    tail=min(round(.025*SR),len(audio)//8)
    audio[-tail:] *= np.linspace(1,0,tail)
    level = -13 if '_step_' in name else -7
    audio *= 10**(level/20)/max(np.max(np.abs(audio)),1e-9)
    pcm=np.round(audio*32767).astype('<i2')
    target=OUT/(name+'.wav')
    with wave.open(str(target),'wb') as w:
        w.setnchannels(1);w.setsampwidth(2);w.setframerate(SR);w.writeframes(pcm.tobytes())
    data=target.read_bytes()
    return dict(file='sfx/'+target.name,seconds=len(audio)/SR,sampleRate=SR,channels=1,bytes=len(data),sha256=hashlib.sha256(data).hexdigest(),peakDbfs=float(20*np.log10(np.max(np.abs(audio)))),rmsDbfs=float(20*np.log10(np.sqrt(np.mean(audio*audio)))),clippedSamples=int(np.count_nonzero(np.abs(pcm)>=32767)),endpointMax=float(max(abs(audio[0]),abs(audio[-1]))))

if __name__=='__main__':
    checks=[];sounds={};settings={}
    counts={'attack':2,'hurt':2,'death':1,'step':3,'impact':2,'alert':1}
    for s, species in enumerate(PROFILES):
        for a,(action,count) in enumerate(counts.items()):
            paths=[]
            for variant in range(count):
                rng=np.random.default_rng(171100+s*100+a*10+variant)
                audio=contact(species,action,variant,rng) if action in ('step','impact') else vocal(species,action,variant,rng)
                row=save(f'{species}_{action}_{variant+1}',audio);checks.append(row);paths.append(row['file'])
            key=f'{species}_{action}';sounds[key]=paths if count>1 else paths[0]
            settings[key]={'volume':(.38 if species=='bear' else .28) if action=='step' else (.48 if action=='alert' else .65),'priority':0 if action=='step' else 3 if action=='death' else 2,'cooldown':{'attack':.22,'hurt':.12,'death':.7,'step':.10,'impact':.075,'alert':1.5}[action]}
    manifest={'version':1,'createdAt':'2026-11-17','method':'Original offline source/filter creature synthesis and original scored music; no reused recording or external samples in the new assets','sounds':sounds,'cueSettings':settings,'music':{'alpha_wolf':{'file':'music/alpha-wolf-r1.mp3','volume':.32,'seconds':40*4*60/136,'sampleRate':32000,'channels':2,'decodedBytes':round(40*4*60/136*32000)*2*4}},'creditsFile':'CREDITS.txt'}
    (ROOT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf8')
    (ROOT/'sfx-checks.json').write_text(json.dumps({'sampleRate':SR,'cues':len(sounds),'files':len(checks),'pcmDecodedBytes':sum(round(r['seconds']*SR)*4 for r in checks),'filesBytes':sum(r['bytes']for r in checks),'checks':checks},indent=2)+'\n',encoding='utf8')
    print(json.dumps({'cues':len(sounds),'files':len(checks),'clippedSamples':sum(r['clippedSamples']for r in checks),'fileBytes':sum(r['bytes']for r in checks)}))
