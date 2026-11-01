"""Two original-recording game edits using the established offline workflow.
No AI music service. Downloads are sequential, cached, and never auto-retried.
"""
import argparse,hashlib,json,subprocess,urllib.request
from pathlib import Path
import numpy as np
import imageio_ffmpeg

SR=32000
DURATION=60
CROSSFADE=2
FFMPEG=imageio_ffmpeg.get_ffmpeg_exe()
APP=Path(__file__).resolve().parents[1]
WORLD=APP.parent/'Assets/Resources/Audio/World'
TRACKS=[
 dict(key='elena_saint',file='ADragonsLullaby2023.mp3',url='https://www.scottbuckley.com.au/library/wp-content/uploads/2023/02/ADragonsLullaby2023.mp3',page='https://www.scottbuckley.com.au/library/a-dragons-lullaby-2023/',title="A Dragon's Lullaby (2023 Remaster)",source='elena-lullaby',label='타락한 성녀 엘레나 · 꺼진 축복',start=42,volume=.30),
 dict(key='elena_mourning',file='Balefire.mp3',url='https://www.scottbuckley.com.au/library/wp-content/uploads/2023/06/Balefire.mp3',page='https://www.scottbuckley.com.au/library/balefire/',title='Balefire',source='elena-balefire',label='비탄의 마녀 엘레나 · 비탄의 잔향',start=218,volume=.30)
]

def run(args,**kwargs):
    return subprocess.run([FFMPEG,'-v','error',*args],check=True,creationflags=0x08000000,**kwargs)

def decode(path,start=0,length=None):
    args=['-ss',str(start),'-i',str(path)]
    if length is not None:args+=['-t',str(length)]
    return np.frombuffer(run(args+['-f','f32le','-ac','2','-ar',str(SR),'pipe:1'],stdout=subprocess.PIPE).stdout,dtype='<f4').copy().reshape(-1,2)

def fetch_sources(folder):
    folder.mkdir(parents=True,exist_ok=True)
    records=[]
    for t in TRACKS:
        path=folder/t['file']
        if not path.exists():
            req=urllib.request.Request(t['url'],headers={'User-Agent':'Moonforest-licensed-audio-edit/1.0'})
            with urllib.request.urlopen(req,timeout=45) as response:data=response.read()
            if len(data)<10000 or data[:100].lstrip().startswith(b'<'):raise ValueError('Invalid source '+t['file'])
            path.write_bytes(data)
        data=path.read_bytes()
        records.append({**t,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'author':'Scott Buckley','license':'CC-BY 4.0'})
    (folder/'provenance.json').write_text(json.dumps(records,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    return records

def analyze(folder,records):
    rows=[]
    for t in records:
        x=decode(folder/t['file']);energy=[]
        for at in range(0,len(x),SR*10):
            part=x[at:at+SR*10]
            energy.append({'start':at/SR,'rms':round(float(np.sqrt(np.mean(part*part))),5)})
        rows.append({'key':t['key'],'seconds':len(x)/SR,'channels':2,'tenSecondEnergy':energy})
    (folder.parent/'source-analysis.json').write_text(json.dumps(rows,indent=2)+'\n')
    print(json.dumps(rows),flush=True)

def edit(folder,out,records):
    WORLD.mkdir(parents=True,exist_ok=True);out.mkdir(parents=True,exist_ok=True)
    report_path=WORLD/'mix-report.json'
    report=json.loads(report_path.read_text(encoding='utf-8'))
    source_path=APP/'scripts/world-audio-sources.json'
    sources=json.loads(source_path.read_text(encoding='utf-8'))
    result={}
    for t in records:
        # A 62-second source selection becomes a 60-second loop. A convex
        # two-second crossfade retains the original pitch and bounds the peak.
        source=decode(folder/t['file'],t['start'],DURATION+CROSSFADE)
        if len(source)!=(DURATION+CROSSFADE)*SR:raise ValueError('Requested excerpt extends beyond source: '+t['key'])
        n=CROSSFADE*SR;w=np.linspace(0,1,n,endpoint=False,dtype=np.float32)[:,None]
        x=np.concatenate((source[n:-n],source[-n:]*(1-w)+source[:n]*w))
        peak=float(np.max(np.abs(x)));rms=float(np.sqrt(np.mean(x*x)))
        gain=min(.80/max(peak,1e-8),.155/max(rms,1e-8))
        x*=gain
        path=WORLD/(t['key']+'.mp3')
        run(['-y','-f','f32le','-ar',str(SR),'-ac','2','-i','pipe:0','-c:a','libmp3lame','-b:a','128k',str(path)],input=x.astype('<f4').tobytes())
        decoded=decode(path);sample_peak=float(np.max(np.abs(decoded)));sample_rms=float(np.sqrt(np.mean(decoded*decoded)))
        # Decoder true peak at 4x catches inter-sample clipping as well.
        oversampled=np.frombuffer(run(['-i',str(path),'-f','f32le','-ac','2','-ar',str(SR*4),'pipe:1'],stdout=subprocess.PIPE).stdout,dtype='<f4')
        assert np.isfinite(decoded).all() and len(decoded)==DURATION*SR
        assert sample_peak<.99 and float(np.max(np.abs(oversampled)))<.99
        seams=np.max(np.abs(np.diff(np.concatenate((decoded[-SR:],decoded[:SR])),axis=0)),axis=1)
        boundary=float(np.max(np.abs(decoded[0]-decoded[-1])))
        context_p99=float(np.quantile(seams,.99))
        assert boundary<=max(.035,context_p99*1.5),(t['key'],'audible discontinuity candidate',boundary,context_p99)
        data=path.read_bytes()
        record=dict(file=path.name,group='music',label=t['label'],seconds=DURATION,channels=2,sampleRate=SR,decodedBytes=int(decoded.size*4),peak=round(sample_peak,6),truePeak4x=round(float(np.max(np.abs(oversampled))),6),rms=round(sample_rms,6),bytes=len(data),sha256=hashlib.sha256(data).hexdigest(),sources=[t['source']],volume=t['volume'],seamDelta=round(boundary,6),seamContextP99=round(context_p99,6),sourceStart=t['start'],sourceEnd=t['start']+DURATION+CROSSFADE,crossfadeSeconds=CROSSFADE,sourceSha256=t['sha256'],gain=round(gain,6),method='Licensed original recording excerpt, offline loop crossfade and gain only; not AI composition')
        report[t['key']]=record;result[t['key']]=record
        sources[t['source']]={'title':t['title'],'author':'Scott Buckley','license':'CC-BY 4.0','url':t['page'],'changes':f"{t['start']}–{t['start']+DURATION+CROSSFADE} s excerpt; 2 s loop crossfade; gain balanced, original pitch, 32 kHz stereo MP3 128 kbps. Game edit title: {t['label']}."}
        (out/path.name).write_bytes(data)
    report_path.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    source_path.write_text(json.dumps(sources,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    (out/'editing-verification.json').write_text(json.dumps({'tracks':result,'aiServiceCalls':0,'originalRecordingsPreserved':True,'noBrowserAutomation':True,'listeningLimit':'Decoded waveform/level/seam tests only; actual speaker listening is a user check.'},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(result,ensure_ascii=True),flush=True)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('sources',type=Path);parser.add_argument('output',type=Path);parser.add_argument('--analyze-only',action='store_true');args=parser.parse_args()
    records=fetch_sources(args.sources)
    if args.analyze_only:analyze(args.sources,records)
    else:edit(args.sources,args.output,records)
