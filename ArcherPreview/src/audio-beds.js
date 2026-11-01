// Lazy, serialized decoding of recorded music/ambience. No per-frame audio DSP.
// At most two decoded scores and two short mono ambience loops are retained.
export const AUDIO_BED_LIMITS=Object.freeze({perChannel:2,decodedBytes:48*1024*1024});
export const decodedBedBytes=buffer=>(buffer.length??Math.round(buffer.duration*(buffer.sampleRate??32000)))*(buffer.numberOfChannels??2)*4;
export class AudioBeds {
  constructor(owner){
    this.owner=owner;this.definitions={music:{},ambience:{}};this.desired={music:null,ambience:null};
    this.current={music:null,ambience:null};this.cache=new Map();this.voices=new Set();this.failed=new Set();
    this.pending=null;this.disposed=false;this.ready=false;this.abort=null;this.retryAfter=0;
    this.generation=0;this.fades={music:1.2,ambience:1.2};this.loadingChannel=null;
  }
  configure(manifest,url){this.definitions={music:manifest.music??{},ambience:manifest.ambience??{}};this.base=url;}
  request(channel,key,fade=1.2){
    if(this.disposed)return;
    if(this.desired[channel]===key)return;
    this.desired[channel]=key;
    this.fades[channel]=Number.isFinite(fade)?Math.max(0,Math.min(5,fade)):1.2;
    if(!key){for(const voice of [...this.voices])if(voice.channel===channel)this.end(voice,fade);}
    this.sync();
  }
  end(voice,fade=0){
    if(voice.cleaned)return;
    if(voice.ending&&fade>0)return;
    voice.ending=true;
    const now=this.owner.context.currentTime,param=voice.gain.gain;
    param.cancelScheduledValues(now);param.setValueAtTime(param.value,now);param.linearRampToValueAtTime(0,now+fade);
    try{voice.source.stop(now+fade);}catch{}
    if(!fade)voice.cleanup();
  }
  stop(){this.desired={music:null,ambience:null};this.generation++;this.abort?.abort();for(const v of [...this.voices])this.end(v,0);}
  get canPlay(){return this.ready&&!this.disposed&&!this.owner.suspended&&this.owner.context?.state==='running';}
  retryFailed(){if(this.failed.size&&(this.owner.now?.()??Date.now())>=this.retryAfter){this.failed.clear();this.sync();}}
  sync(){
    if(!this.canPlay||this.pending)return this.pending;
    // An already satisfied selection must not allocate promises on every frame.
    if(!Object.keys(this.desired).some(c=>this.needs(c)))return;
    // Establish ownership before a cached start or failure can request another
    // bed synchronously. There is still only one fetch/decode drain at a time.
    let complete,fail;const drain=new Promise((resolve,reject)=>{complete=resolve;fail=reject;});
    this.pending=drain.finally(()=>{this.pending=null;if(this.canPlay)this.sync();});
    this.drain().then(complete,fail);
    return this.pending;
  }
  needs(channel){const key=this.desired[channel],v=this.current[channel];return key&&this.definitions[channel][key]&&!this.failed.has(channel+':'+key)&&(!v||v.ending||v.key!==key);}
  makeRoom(channel,key,bytes=0){
    // A third request during a crossfade releases the older fading voice before decode.
    for(const v of [...this.voices])if(v.channel===channel&&v.ending)this.end(v,0);
    const entries=[...this.cache].filter(([id])=>id.startsWith(channel+':')&&id!==channel+':'+key);
    while(entries.length>=AUDIO_BED_LIMITS.perChannel){
      const index=entries.findIndex(([id])=>!Array.from(this.voices).some(v=>v.id===id));
      if(index<0)break;
      this.cache.delete(entries.splice(index,1)[0][0]);
    }
    // A score is admitted only if its crossfade and the active ambience fit.
    // Never stop the currently audible bed just to make an oversized track fit.
    for(const [id]of this.cache){
      if(this.cacheBytes()+bytes<=AUDIO_BED_LIMITS.decodedBytes)break;
      if(![...this.voices].some(v=>v.id===id))this.cache.delete(id);
    }
    return bytes<=AUDIO_BED_LIMITS.decodedBytes&&this.cacheBytes()+bytes<=AUDIO_BED_LIMITS.decodedBytes;
  }
  cacheBytes(){return [...this.cache.values()].reduce((sum,buffer)=>sum+decodedBedBytes(buffer),0);}
  async drain(){
    for(const channel of ['music','ambience']){
      if(!this.canPlay||!this.needs(channel))continue;
      const key=this.desired[channel],generation=this.generation,id=channel+':'+key,definition=this.definitions[channel][key];
      let buffer=this.cache.get(id);
      if(!buffer){
        const controller=new AbortController();this.abort=controller;this.loadingChannel=channel;
        const timeout=setTimeout(()=>controller.abort(),20000);
        try{
          const estimate=definition.decodedBytes;
          if(!this.makeRoom(channel,key,Number.isSafeInteger(estimate)&&estimate>0?estimate:0))throw new Error('Audio bed exceeds decoded budget');
          const r=await this.owner.fetcher(new URL(definition.url,this.base),{cache:'force-cache',signal:controller.signal});
          if(!r.ok)throw new Error('audio bed '+key);
          const data=await r.arrayBuffer();if(this.disposed||this.generation!==generation)continue;
          if(controller.signal.aborted)throw new Error('Audio bed cancelled');
          buffer=await this.owner.context.decodeAudioData(data);if(this.disposed||this.generation!==generation)continue;
          if(controller.signal.aborted)throw new Error('Audio bed cancelled');
          if(!this.makeRoom(channel,key,decodedBedBytes(buffer)))throw new Error('Audio bed exceeds decoded budget');
          this.cache.set(id,buffer);
        }catch{buffer=null;if(!this.disposed&&this.generation===generation){this.failed.add(id);this.retryAfter=(this.owner.now?.()??Date.now())+5000;this.owner.failed++;this.owner.onBedError?.(channel,key);}}
        finally{clearTimeout(timeout);if(this.abort===controller){this.abort=null;this.loadingChannel=null;}}
      }
      if(buffer&&this.canPlay&&this.desired[channel]===key)this.start(channel,key,buffer,definition);
    }
  }
  start(channel,key,buffer,definition){
    const context=this.owner.context,now=context.currentTime,id=channel+':'+key,fade=this.fades[channel];
    for(const v of [...this.voices])if(v.channel===channel)this.end(v,v.ending?0:fade);
    const source=context.createBufferSource(),gain=context.createGain();source.buffer=buffer;source.loop=true;
    source.connect(gain);gain.connect(this.owner.master);
    gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(definition.volume??.25,now+fade);
    const voice={channel,key,id,source,gain,volume:definition.volume??.25,ending:false,cleaned:false,cleanup:()=>{
      if(voice.cleaned)return;voice.cleaned=true;source.onended=null;source.disconnect();gain.disconnect();source.buffer=null;
      this.voices.delete(voice);if(this.current[channel]===voice){this.current[channel]=null;if(!voice.ending&&this.canPlay)this.sync();}
    }};
    source.onended=voice.cleanup;this.voices.add(voice);this.current[channel]=voice;
    // Touch LRU without retaining redundant promises/ArrayBuffers.
    this.cache.delete(id);this.cache.set(id,buffer);source.start();
  }
  duck(now){
    const voice=this.current.music;if(!voice||voice.ending)return;
    const param=voice.gain.gain,volume=voice.volume;
    param.cancelScheduledValues(now);param.setValueAtTime(Math.min(param.value,volume),now);
    param.linearRampToValueAtTime(volume*.48,now+.012);param.linearRampToValueAtTime(volume,now+.28);
  }
  inspect(){return {context:this.current.music?.key??null,ambience:this.current.ambience?.key??null,loopVoices:this.voices.size,decodedBeds:this.cache.size,decodedBedBytes:this.cacheBytes(),decodedBedLimit:AUDIO_BED_LIMITS.decodedBytes};}
  dispose(){this.disposed=true;this.abort?.abort();this.stop();this.cache.clear();}
}
