#!/usr/bin/env python3
"""Original MoonForest alpha-wolf score and sample-free offline instruments.

All notes, envelopes, oscillators, filtered noise and the room response are
created here. No soundfont, recorded instrument, reference song or cloud model
is used. Render three identical musical cycles and retain the middle cycle.
"""
from pathlib import Path
import hashlib
import json
import math
import struct
import subprocess

import numpy as np
from scipy import signal
from scipy.io import wavfile

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'music'
SR = 32000
BPM = 136
BEAT = 60.0 / BPM
BARS = 40
BEATS = BARS * 4
FRAMES = round(BEATS * BEAT * SR)
SEED = 261117136
RNG = np.random.default_rng(SEED)
EVENTS = []

INSTRUMENTS = {
    'celli': {'program': 42, 'channel': 0, 'pan': -.28},
    'bass': {'program': 43, 'channel': 1, 'pan': .05},
    'strings': {'program': 48, 'channel': 2, 'pan': .22},
    'horn': {'program': 60, 'channel': 3, 'pan': -.15},
    'reed': {'program': 70, 'channel': 4, 'pan': .30},
    'answer': {'program': 48, 'channel': 5, 'pan': .40},
    'taiko': {'program': 0, 'channel': 9, 'pan': -.10, 'drum': 41},
    'tom': {'program': 0, 'channel': 9, 'pan': .26, 'drum': 45},
    'war_drum': {'program': 0, 'channel': 9, 'pan': -.22, 'drum': 38},
    'cymbal': {'program': 0, 'channel': 9, 'pan': .30, 'drum': 49},
}
SECTIONS = [
    {'bars': [1, 8], 'name': 'Tracks in the dark', 'dynamic': .52},
    {'bars': [9, 16], 'name': 'The pack gives chase', 'dynamic': .88},
    {'bars': [17, 24], 'name': 'Call and answering shadows', 'dynamic': .65},
    {'bars': [25, 32], 'name': 'The alpha closes in', 'dynamic': 1.00},
    {'bars': [33, 40], 'name': 'Circling back into the hunt', 'dynamic': .70},
]


def note(instrument, beat, pitch, duration, velocity, pan=None):
    EVENTS.append({'instrument': instrument, 'beat': round(beat, 5),
                   'pitch': int(pitch), 'duration': round(duration, 5),
                   'velocity': round(velocity, 4),
                   'pan': INSTRUMENTS[instrument]['pan'] if pan is None else pan})


def phrase(instrument, bar, rows, velocity=1., transpose=0):
    for start, pitch, duration, accent in rows:
        note(instrument, bar * 4 + start, pitch + transpose, duration,
             velocity * accent)


def compose():
    # D minor, with a raised C# only in the dominant. This original motif is
    # developed across registers and answered, rather than repeating one bar.
    roots = [50, 50, 46, 43, 50, 48, 46, 45]
    minor = [True, True, False, True, True, False, False, False]
    for bar in range(BARS):
        section = bar // 8
        dynamic = SECTIONS[section]['dynamic']
        r, small = roots[bar % 8], minor[bar % 8]
        third = 3 if small else 4
        if section == 4:
            dynamic *= .85 if bar < 36 else 1.05
        # The cello's eight-note figure changes its upper neighbouring tones
        # with the chord; small gaps let the bass and drum attacks breathe.
        pattern = [r, r+7, r, r+third, r, r+7, r+10, r+7]
        if bar % 4 == 3:
            pattern[-2:] = [r+third+7, r+third]
        for i, pitch in enumerate(pattern):
            if section == 2 and i in (3, 7):
                continue
            if section == 0 and bar < 2 and i % 2:
                continue
            accent = [.96, .64, .80, .62, .90, .65, .78, .61][i]
            note('celli', bar*4+i*.5, pitch, .34 if i % 2 else .40,
                 dynamic * accent)
        for beat, vel in [(0, .88), (2.0, .63)]:
            note('bass', bar*4+beat, r-12, 1.28 if beat == 0 else 1.05,
                 dynamic * vel)
        # Open voicings avoid a heavy block chord around the low ostinato.
        for pitch, pan, vel in [(r, -.48, .48), (r+7, .35, .42),
                                (r+third+12, .48, .35)]:
            note('strings', bar*4+.03, pitch, 3.72, dynamic*vel, pan)
        if section == 3:
            note('strings', bar*4+.04, r+12, 3.64, .35, -.35)

        # Large but short-bodied drums: articulated weight, not sustained sub.
        if not (section == 0 and bar < 2):
            for beat, vel in [(0, .96), (2.0, .70)]:
                note('taiko', bar*4+beat, 41, .12, dynamic*vel)
            if section in (1, 3):
                note('war_drum', bar*4+1.0, 38, .1, dynamic*.62)
                note('war_drum', bar*4+3.0, 38, .1, dynamic*.68)
                if bar % 2:
                    note('tom', bar*4+2.75, 45, .1, dynamic*.43)
        if bar % 4 == 3:
            for beat, pitch, vel in [(3.0, 45, .56), (3.5, 43, .65),
                                     (3.75, 41, .55)]:
                note('tom', bar*4+beat, pitch, .1, dynamic*vel)
        if bar in (8, 16, 24, 32):
            note('cymbal', bar*4, 49, 1.0, .50 if bar == 24 else .30)

    # Eight-bar main statement, clear enough to recognise through combat SFX.
    melody = [
        [(0,62,1.35,.93),(1.5,69,.42,.80),(2,67,.82,.86),(3,65,.90,.83)],
        [(0,64,.65,.76),(.75,65,.20,.72),(1,64,.88,.82),(2,62,1.78,.88)],
        [(0,65,.88,.89),(1,69,.88,.94),(2,70,1.30,.98),(3.5,69,.40,.76)],
        [(0,67,.85,.86),(1,65,.40,.76),(1.5,64,.40,.75),(2,62,1.65,.88)],
        [(0,62,.40,.82),(.5,65,.40,.84),(1,69,.82,.96),(2,72,.40,.91),
         (2.5,70,.40,.83),(3,69,.84,.88)],
        [(0,67,.84,.88),(1,64,.84,.79),(2,65,.84,.86),(3,62,.84,.88)],
        [(0,58,.86,.78),(1,62,.86,.82),(2,65,.86,.88),(3,67,.84,.91)],
        [(0,64,.88,.88),(1,61,.88,.86),(2,57,1.72,.90)],
    ]
    for start, dynamic in [(8, .88), (24, .98)]:
        for i, rows in enumerate(melody):
            phrase('horn', start+i, rows, dynamic)
            if start == 24 and i in (0, 2, 4, 6):
                phrase('answer', start+i, rows, .28, 12)
    # Fragments announce the melody without spending the full opening eight.
    phrase('horn', 4, [(0,62,1.6,.62),(2.5,65,.75,.56)], .65)
    phrase('horn', 6, [(0,58,1.1,.58),(1.5,62,1.2,.62)], .65)

    answers = [
        [(0,74,.78,.82),(1,72,.42,.72),(1.5,69,.42,.78),(2.5,65,1.10,.79)],
        [(1,67,.75,.74),(2,69,.75,.82),(3,65,.72,.77)],
        [(0,74,.70,.88),(1,77,.70,.86),(2,76,.72,.80),(3,74,.72,.78)],
        [(0,70,.78,.82),(1,69,.40,.74),(1.5,67,.40,.76),(2.5,65,.96,.80)],
    ]
    for i in range(8):
        phrase('reed' if i % 2 == 0 else 'answer', 16+i, answers[i % 4], .66)
        if i % 2:
            phrase('horn', 16+i, [(0,roots[i]+12,1.5,.68),
                                  (2.5,roots[i]+7,.86,.60)], .56)
    for i in range(8):
        r = roots[i]
        if i < 4:
            phrase('answer', 32+i, [(1,r+19,.74,.65),(2,r+15,.74,.64),
                                  (3,r+12,.76,.66)], .59)
        else:
            phrase('horn', 32+i, [(0,r+12,1.25,.75),(2,r+7,.75,.68)], .72)
    # Dominant pickup joins bar 1 naturally; no terminal fade or victory ending.
    phrase('reed', 39, [(2.75,61,.40,.62),(3.25,64,.40,.68),
                       (3.75,61,.22,.54)], .54)
    EVENTS.sort(key=lambda event: (event['beat'], event['instrument'], event['pitch']))


def envelope(length, gate, attack, release):
    t = np.arange(length, dtype=np.float64) / SR
    attack = max(.003, attack)
    a = np.minimum(1., t / attack)
    a = a*a*(3-2*a)
    r = np.clip((gate+release-t)/max(.01, release), 0, 1)
    r = r*r*(3-2*r)
    return t, a * r


def noise_band(length, low, high):
    data = RNG.standard_normal(length)
    return signal.sosfilt(signal.butter(2, [low, high], fs=SR,
                                      btype='bandpass', output='sos'), data)


def tone(kind, pitch, beats, velocity):
    gate = beats * BEAT
    release = {'celli':.075,'bass':.18,'strings':.44,'horn':.24,
               'reed':.17,'answer':.24}.get(kind, .3)
    attack = {'celli':.014,'bass':.025,'strings':.20,'horn':.045,
              'reed':.032,'answer':.040}.get(kind, .01)
    if kind in ('taiko', 'tom', 'war_drum', 'cymbal'):
        return drum(kind, pitch, velocity)
    length = math.ceil((gate+release)*SR)
    t, env = envelope(length, gate, attack, release)
    frequency = 440. * 2.**((pitch-69)/12)
    out = np.zeros(length, np.float64)
    if kind in ('celli', 'bass', 'strings', 'answer'):
        # Several independently detuned bowed voices, dark harmonic roll-off,
        # restrained bow noise and a soft body resonance; not a sine loop.
        detunes = [-4.8, -.8, 3.5] if kind != 'bass' else [-2.3, 1.9]
        brightness = {'celli':2100,'bass':1200,'strings':2700,'answer':3200}[kind]
        for cents in detunes:
            f = frequency * 2.**(cents/1200)
            vibrato = .0012*(1-np.exp(-t/.24))*np.sin(2*np.pi*4.6*t+.3)
            phase = 2*np.pi*f*t + vibrato
            for harmonic in range(1, min(22, int(6500/f))+1):
                weight = math.exp(-(harmonic*f/brightness)**1.35)/harmonic**1.23
                out += weight*np.sin(phase*harmonic+RNG.uniform(-.15,.15))
        out /= len(detunes)*1.25
        out += noise_band(length, 350, 2800)*(.026 if kind == 'celli' else .009)
        if kind == 'celli':
            env *= (.76+.24*np.exp(-t/.085))*np.exp(-.65*t/max(.1,gate))
        else:
            env *= 1+.045*np.sin(2*np.pi*.8*t+1)
        gain = {'celli':.135,'bass':.105,'strings':.050,'answer':.105}[kind]
    else:
        # Original lip/reed oscillators. Formants colour the harmonic series;
        # a slow vibrato onset, mild scoop and filtered breath soften the edge.
        phase = 2*np.pi*frequency*t - .007*frequency*.055*(1-np.exp(-t/.055))
        phase += .0018*frequency*(1-np.exp(-t/.28))*np.sin(2*np.pi*4.9*t)/(4.9)
        for harmonic in range(1, min(26, int(8000/frequency))+1):
            hf = harmonic*frequency
            if kind == 'horn':
                formant = .5+.65*math.exp(-((hf-650)/480)**2)+.30*math.exp(-((hf-1250)/650)**2)
                weight = formant*math.exp(-(hf/3400)**1.5)/harmonic**1.15
            else:
                formant = .6+.65*math.exp(-((hf-1100)/550)**2)
                weight = formant*(1 if harmonic % 2 else .45)*math.exp(-(hf/3900)**1.6)/harmonic**1.10
            out += weight*np.sin(phase*harmonic+.02*harmonic)
        out = np.tanh(out*.85)/1.1
        out += noise_band(length, 450, 3500)*(.008 if kind == 'horn' else .021)
        env *= .92+.08*np.sin(np.pi*np.minimum(1,t/max(.1,gate)))
        gain = .158 if kind == 'horn' else .112
    return (out*env*gain*velocity**1.15).astype(np.float32)


def drum(kind, pitch, velocity):
    length = math.ceil(SR * {'taiko':.72,'tom':.46,'war_drum':.36,'cymbal':2.1}[kind])
    t = np.arange(length)/SR
    out = np.zeros(length)
    if kind in ('taiko', 'tom'):
        fundamental = 63. if kind == 'taiko' else 108.*2**((pitch-45)/12)
        for ratio, decay, level in [(1,.17,1),(1.51,.12,.60),(2.18,.085,.35),(3.46,.055,.13)]:
            phase = 2*np.pi*fundamental*ratio*(t+.003*(1-np.exp(-t/.02)))
            out += np.sin(phase)*np.exp(-t/decay)*level
        out += noise_band(length, 160, 2300)*np.exp(-t/.033)*.55
        out *= np.minimum(1,t/.003)
        gain = .24 if kind == 'taiko' else .17
    elif kind == 'war_drum':
        out = noise_band(length, 300, 3600)*np.exp(-t/.070)*.72
        out += .52*np.sin(2*np.pi*174*t)*np.exp(-t/.080)
        out += .20*np.sin(2*np.pi*263*t)*np.exp(-t/.045)
        out *= np.minimum(1,t/.0025)
        gain = .17
    else:
        # Inharmonic metallic modes plus a diffuse air tail, deliberately dark.
        for f, level in [(773,.20),(1171,.16),(1823,.13),(2671,.10),
                         (3527,.075),(4703,.04),(5911,.025)]:
            out += level*np.sin(2*np.pi*f*t+RNG.random()*6.28)*np.exp(-t/(.27+1000/f))
        out += noise_band(length, 900, 6500)*np.exp(-t/.48)*.32
        out *= np.minimum(1,t/.012)
        gain = .11
    return (out*gain*velocity**1.3).astype(np.float32)


def room_ir(channel):
    length = round(1.40*SR)
    t = np.arange(length)/SR
    data = RNG.standard_normal(length)*np.exp(-t/.29)
    data = signal.sosfilt(signal.butter(2,[220,4700],fs=SR,btype='bandpass',output='sos'),data)
    data *= .27/max(1e-12,np.sqrt(np.sum(data*data)))
    for delay, level in [(0.021,.13),(0.038,.10),(0.063,.08),(0.101,.06),(0.167,.04)]:
        data[round((delay+channel*.004)*SR)] += level
    return data.astype(np.float32)


def render():
    tail = round(3*SR)
    dry = np.zeros((FRAMES+tail,2),np.float32)
    for event in EVENTS:
        wave = tone(event['instrument'],event['pitch'],event['duration'],event['velocity'])
        start = round(event['beat']*BEAT*SR)
        pan = event['pan']
        # Equal-power instrumental positions; all drums retain a solid centre.
        gain_l, gain_r = math.cos((pan+1)*math.pi/4), math.sin((pan+1)*math.pi/4)
        dry[start:start+len(wave),0] += wave*gain_l
        dry[start:start+len(wave),1] += wave*gain_r
    full = np.zeros((FRAMES*3+tail,2),np.float32)
    for cycle in range(3):
        start=cycle*FRAMES
        full[start:start+len(dry)] += dry
    for channel in range(2):
        room = signal.fftconvolve(full[:,channel],room_ir(channel),mode='full')[:len(full)]
        full[:,channel] = full[:,channel]*.91+room*.26
    filters = np.vstack([signal.butter(2,36,fs=SR,btype='highpass',output='sos'),
                         signal.butter(2,10500,fs=SR,btype='lowpass',output='sos')])
    full=signal.sosfiltfilt(filters,full,axis=0)
    middle=np.tanh(full[FRAMES:2*FRAMES]*1.1)/1.1
    true_peak=float(np.max(np.abs(signal.resample_poly(middle,4,1,axis=0))))
    gain=10**(-3.5/20)/max(true_peak,1e-12)
    return (middle*gain).astype(np.float32),gain


def vlq(value):
    value=int(value);data=[value&127]
    while value>127:
        value>>=7;data.insert(0,(value&127)|128)
    return bytes(data)


def midi_track(events):
    out=bytearray();previous=0
    for tick,priority,message in sorted(events,key=lambda row:(row[0],row[1])):
        out.extend(vlq(tick-previous));out.extend(message);previous=tick
    out.extend(vlq(max(0,BEATS*480-previous)));out.extend(b'\xff\x2f\x00')
    return b'MTrk'+struct.pack('>I',len(out))+out


def write_midi(path):
    tempo=round(60_000_000/BPM)
    conductor=[(0,0,b'\xff\x51\x03'+tempo.to_bytes(3,'big')),
               (0,0,b'\xff\x58\x04\x04\x02\x18\x08'),
               (0,0,b'\xff\x59\x02\xff\x01')]
    for section in SECTIONS:
        label=section['name'].encode('ascii')
        conductor.append(((section['bars'][0]-1)*4*480,0,b'\xff\x06'+vlq(len(label))+label))
    tracks=[midi_track(conductor)]
    for name,settings in INSTRUMENTS.items():
        label=name.encode('ascii');channel=settings['channel']
        events=[(0,0,b'\xff\x03'+vlq(len(label))+label)]
        if channel!=9:events.append((0,1,bytes([0xc0|channel,settings['program']])))
        events.append((0,1,bytes([0xb0|channel,10,round((settings['pan']+1)*63.5)])))
        for event in EVENTS:
            if event['instrument']!=name:continue
            pitch=settings.get('drum',event['pitch']);velocity=max(1,min(127,round(event['velocity']*105)))
            events.append((round(event['beat']*480),3,bytes([0x90|channel,pitch,velocity])))
            events.append((round((event['beat']+event['duration'])*480),2,bytes([0x80|channel,pitch,0])))
        tracks.append(midi_track(events))
    path.write_bytes(b'MThd'+struct.pack('>IHHH',6,1,len(tracks),480)+b''.join(tracks))


def db(value):
    return 20*math.log10(max(1e-12,float(value)))


def audio_stats(audio):
    mono=audio.mean(axis=1)
    spectrum=np.abs(np.fft.rfft(mono))**2
    frequencies=np.fft.rfftfreq(len(mono),1/SR)
    power=max(float(spectrum.sum()),1e-12)
    block=audio[:len(audio)//SR*SR].reshape(-1,SR,2)
    rms=np.sqrt(np.mean(block.astype(np.float64)**2,axis=(1,2)))
    seam=np.abs(audio[0]-audio[-1])
    local=np.concatenate([np.diff(audio[-640:],axis=0),np.diff(audio[:640],axis=0)])
    return {'frames':len(audio),'sampleRate':SR,'channels':2,'durationSeconds':len(audio)/SR,
            'samplePeakDbfs':db(np.max(np.abs(audio))),
            'truePeak4xDbfs':db(np.max(np.abs(signal.resample_poly(audio,4,1,axis=0)))),
            'rmsDbfs':db(np.sqrt(np.mean(audio.astype(np.float64)**2))),
            'dcMaxAbs':float(np.max(np.abs(audio.mean(axis=0)))),
            'clippedSamples':int(np.count_nonzero(np.abs(audio)>=1)),
            'stereoCorrelation':float(np.corrcoef(audio.T)[0,1]),
            'monoToStereoRmsRatio':float(np.sqrt(np.mean(mono**2))/max(1e-12,np.sqrt(np.mean(audio**2)))),
            'powerBelow100HzFraction':float(spectrum[frequencies<100].sum()/power),
            'powerAbove6000HzFraction':float(spectrum[frequencies>6000].sum()/power),
            'oneSecondRmsP90MinusP10Db':db(np.percentile(rms,90))-db(np.percentile(rms,10)),
            'loopBoundaryJumpAbsMax':float(seam.max()),
            'loopBoundaryVsLocalDerivativeRms':float(seam.max()/max(1e-12,np.sqrt(np.mean(local**2))))}


def encode_and_check(audio):
    wav=OUT/'alpha-wolf-r1.wav';mp3=OUT/'alpha-wolf-r1.mp3'
    for attempt in range(3):
        wavfile.write(wav,SR,audio)
        subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(wav),
                        '-ar',str(SR),'-ac','2','-codec:a','libmp3lame','-b:a','128k',
                        '-write_xing','1','-id3v2_version','3','-metadata',
                        'title=MoonForest - The Alpha Gives Chase (Original R1)',
                        '-metadata','artist=MoonForest original offline composition',str(mp3)],check=True)
        decoded=subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-i',str(mp3),
                                '-f','f32le','-acodec','pcm_f32le','-ar',str(SR),'-ac','2','-'],check=True,stdout=subprocess.PIPE).stdout
        decoded=np.frombuffer(decoded,dtype='<f4').reshape(-1,2)
        peak=float(np.max(np.abs(signal.resample_poly(decoded,4,1,axis=0))))
        if db(peak)<=-2.0:break
        audio*=10**((-2.4-db(peak))/20)
    probe=json.loads(subprocess.run(['ffprobe','-v','error','-show_entries',
                                   'stream=codec_name,sample_rate,channels,bit_rate,duration,start_time:format=duration,size',
                                   '-of','json',str(mp3)],check=True,stdout=subprocess.PIPE,text=True).stdout)
    return audio,decoded,probe


def main():
    OUT.mkdir(parents=True,exist_ok=True)
    compose();write_midi(OUT/'alpha-wolf-r1.mid')
    audio,gain=render();audio,decoded,probe=encode_and_check(audio)
    wav_stats,mp3_stats=audio_stats(audio),audio_stats(decoded)
    loudness=subprocess.run(['ffmpeg','-hide_banner','-i',str(OUT/'alpha-wolf-r1.mp3'),
                             '-af','ebur128=peak=true','-f','null','-'],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,check=True).stderr
    summary=loudness[loudness.rfind('Summary:'):].strip()
    score={'format':'moonforest-original-offline-score','version':1,'title':'The Alpha Gives Chase',
           'bpm':BPM,'meter':[4,4],'bars':BARS,'beats':BEATS,'key':'D minor, dominant A major',
           'requestedDurationSeconds':BEATS*BEAT,'renderFrames':FRAMES,'sampleRate':SR,
           'seed':SEED,'sections':SECTIONS,'instruments':INSTRUMENTS,'notes':EVENTS,
           'provenance':{'composition':'New original note-level composition in compose_alpha.py',
                         'instrumentSource':'Analytic additive oscillators, procedural filtered noise, modal drums and generated room impulse',
                         'externalSongs':[],'externalSamples':[],'soundfonts':[],'cloudGeneration':False},
           'loopMethod':'Render three musical cycles with instrument/reverb tails, retain the middle cycle. No ending fade.'}
    (OUT/'score.json').write_text(json.dumps(score,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    checks={'version':1,'scope':'Offline composition and numerical audio checks; not listener approval, in-game loudness or device playback certification',
            'requested':{'bpm':BPM,'bars':BARS,'seconds':BEATS*BEAT,'sampleRate':SR,'channels':2,'mp3Bitrate':128000},
            'noteCount':len(EVENTS),'initialMasterGain':gain,'wav':wav_stats,'mp3Decoded':mp3_stats,'mp3Container':probe,
            'decodedFrameDifferenceFromWav':len(decoded)-len(audio),'ffmpegLoudnessSummary':summary,
            'passed':bool(wav_stats['truePeak4xDbfs']<=-2 and mp3_stats['truePeak4xDbfs']<=-2 and
                          wav_stats['clippedSamples']==mp3_stats['clippedSamples']==0 and
                          len(decoded)==len(audio)==FRAMES and wav_stats['loopBoundaryJumpAbsMax']<.012 and
                          wav_stats['oneSecondRmsP90MinusP10Db']>2.5),
            'assets':{name:{'bytes':(OUT/name).stat().st_size,'sha256':hashlib.sha256((OUT/name).read_bytes()).hexdigest()}
                      for name in ['alpha-wolf-r1.mid','alpha-wolf-r1.wav','alpha-wolf-r1.mp3','score.json']}}
    (OUT/'music-checks.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'passed':checks['passed'],'notes':len(EVENTS),'frames':FRAMES,
                      'wav':wav_stats,'mp3Decoded':mp3_stats,'loudness':summary,
                      'outputs':[str(OUT/name) for name in checks['assets']]},ensure_ascii=False))
    if not checks['passed']:raise SystemExit('Audio checks require attention')


if __name__=='__main__':
    main()
