const urls=Object.freeze({
  call:new URL('./audio/horse/call.mp3',import.meta.url),
  whinny:new URL('./audio/horse/whinny.mp3',import.meta.url),
  snort:new URL('./audio/horse/snort.mp3',import.meta.url),
  gallop:new URL('./audio/horse/gallop.mp3',import.meta.url),
});
// Three complete hoof cycles between matching upward zero crossings in the
// approved 44.1 kHz recording. The original attack plays before the first loop.
const LOOP_START=26431/44100,LOOP_END=94485/44100;
const limit=v=>Math.max(0,Math.min(1,v));
const gallopRate=speed=>1.15+.4*limit((speed-5.8)/8.2);

export function createRidingAudio(audio){
  const samples=Object.fromEntries(Object.keys(urls).map(key=>[key,{
    key,bankKey:'v03-riding:'+key,buffer:null,loading:null,decoding:null,retryAt:0,voice:null,due:null,voiceRetry:0,
  }]));
  const all=Object.values(samples),hooves=samples.gallop;
  let disposed=false,context=null,offStop=null,runSpeed=0,runGain=1,breathIn=8;
  const allowed=()=>!disposed&&!audio.disposed&&!audio.suspended&&!audio.sfxMuted&&audio.context&&audio.context.state!=='closed';

  function stop(){
    if(audio.disposed)disposed=true;
    runSpeed=0;breathIn=8;
    for(const sample of all){
      sample.due=null;sample.voiceRetry=0;
      const load=sample.loading;sample.loading=null;load?.abort();
      sample.voice?.stop();sample.voice=null;
      if(disposed&&sample.buffer){
        if(audio.buffers.get(sample.bankKey)===sample.buffer)audio.buffers.delete(sample.bankKey);
        sample.buffer=null;
      }
    }
    context?.removeEventListener?.('statechange',wake);context=null;
    offStop?.();offStop=null;
  }
  function listen(){
    if(!allowed())return false;
    if(!offStop)offStop=audio.onEffectsStopped(stop);
    if(context!==audio.context){
      context?.removeEventListener?.('statechange',wake);
      context=audio.context;context.addEventListener?.('statechange',wake);
    }
    return true;
  }
  function wake(){
    if(allowed()&&context?.state==='running')for(const sample of all)playReady(sample);
  }
  async function read(sample,load,ctx){
    const check=()=>{load.check();if(!allowed()||ctx!==audio.context||sample.loading!==load)load.abort();load.check();};
    try{
      const response=await load.wait(audio.fetcher(urls[sample.key],{cache:'force-cache',signal:load.signal}),
        {onLate:r=>r.body?.cancel().catch(()=>{})});
      if(!response.ok)throw new Error('Horse audio fetch failed');
      const bytes=await load.wait(response.arrayBuffer());check();
      if(audio.sfxLoading){await load.wait(audio.sfxLoading);check();}
      // Share the effect bank's bound even if a browser decode outlives a map
      // or a timeout. A stopped download can retry without publishing stale PCM.
      while(audio.sfxDecodeJobs.size>=3){
        await load.wait(Promise.race([...audio.sfxDecodeJobs].map(job=>job.catch(()=>{}))));check();
      }
      const decode=Promise.resolve(ctx.decodeAudioData(bytes));sample.decoding=decode;audio.sfxDecodeJobs.add(decode);
      const release=()=>{audio.sfxDecodeJobs.delete(decode);if(sample.decoding===decode)sample.decoding=null;};
      decode.then(release,release);
      const buffer=await load.wait(decode);check();sample.buffer=buffer;
      audio.buffers.set(sample.bankKey,buffer);
    }catch(error){
      load.abort(error);
      if(sample.loading===load&&!disposed&&!audio.disposed){
        sample.retryAt=audio.now()+audio.retryDelayMs;audio.failed++;
      }
    }finally{
      audio.closeLoadLifetime(load);
      if(sample.loading===load){sample.loading=null;playReady(sample);}
    }
  }
  function prepare(sample){
    if(sample.buffer||sample.loading||sample.decoding||audio.now()<sample.retryAt)return;
    const load=audio.loadLifetime('riding-effect');
    sample.loading=load;void read(sample,load,context);
  }
  function playReady(sample){
    if(!sample.buffer||!allowed()||context?.state!=='running')return;
    const hoof=sample===hooves;
    if(hoof?runSpeed<=3:sample.due===null)return;
    const now=context.currentTime;
    if(sample.voice&&!sample.voice.cleaned)return;
    if(now<sample.voiceRetry)return;
    const when=hoof?now:Math.max(sample.due,now);
    const rate=hoof?gallopRate(runSpeed):1;
    const voice=audio.startEffectVoice(sample.buffer,{when,rate,volume:hoof?runGain:1,
      priority:hoof||sample===samples.snort?1:2,loop:hoof,loopStart:LOOP_START,loopEnd:LOOP_END});
    if(voice){sample.voice=voice;sample.due=null;}
    else sample.voiceRetry=now+.2;
  }
  function cue(sample,delay=0){
    if(sample.due!==null||sample.voice&&!sample.voice.cleaned)return;
    sample.due=context.currentTime+delay;sample.voiceRetry=0;prepare(sample);playReady(sample);
  }
  function pendingCues(){
    for(const sample of all)if(sample.due!==null){prepare(sample);playReady(sample);}
  }
  return {
    call(){
      if(!listen())return;
      cue(samples.call,.1);
      // Only an actual summon prepares the other three. A restored mount
      // loads its first gait or vocalization directly and remains quiet on foot.
      for(const sample of all)prepare(sample);
    },
    arrive(){
      if(!listen())return;
      // A cold connection may finish the whistle after the horse has arrived.
      // Its earlier cue has then passed; the whinny belongs to the arrival.
      samples.call.due=null;
      cue(samples.whinny);breathIn=9;
    },
    idle(dt){
      if(!listen())return;
      pendingCues();
      if(context.state!=='running'||!(dt>0)||!Number.isFinite(dt))return;
      breathIn-=dt;
      if(breathIn<=0){breathIn=12+Math.random()*8;cue(samples.snort);}
    },
    run(speed,gain=1){
      if(!(speed>3)||!Number.isFinite(speed)){
        if(runSpeed){runSpeed=0;hooves.voice?.stop();hooves.voice=null;hooves.voiceRetry=0;}
        return;
      }
      if(!listen())return;
      runSpeed=speed;runGain=limit(Number.isFinite(gain)?gain:1);
      samples.snort.due=null;
      if(hooves.voice&&!hooves.voice.cleaned){
        const rate=gallopRate(speed),source=hooves.voice.source,volume=hooves.voice.gain.gain;
        if(Math.abs(source.playbackRate.value-rate)>.001)source.playbackRate.value=rate;
        if(Math.abs(volume.value-runGain)>.001)volume.value=runGain;
      }else{prepare(hooves);playReady(hooves);}
      pendingCues();
    },
    stop,
    dispose(){if(disposed)return;disposed=true;stop();},
  };
}
