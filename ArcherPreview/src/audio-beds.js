// Lazy, serialized decoding of recorded music/ambience. No per-frame audio DSP.
// At most two decoded scores and two short mono ambience loops are retained.
export class AudioBeds {
  constructor(owner){
    this.owner=owner;this.definitions={music:{},ambience:{}};this.desired={music:null,ambience:null};
    this.current={music:null,ambience:null};this.cache=new Map();this.voices=new Set();this.failed=new Set();
    this.pending=null;this.disposed=false;this.ready=false;this.abort=null;
  }
  configure(manifest,url){this.definitions={music:manifest.music??{},ambience:manifest.ambience??{}};this.base=url;}
  request(channel,key,fade=1.2){
    if(this.desired[channel]===key)return;
    this.desired[channel]=key;
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
  stop(){this.desired={music:null,ambience:null};for(const v of [...this.voices])this.end(v,0);}
  get canPlay(){return this.ready&&!this.disposed&&!this.owner.suspended&&this.owner.context?.state==='running';}
  sync(){
    if(!this.canPlay||this.pending)return this.pending;
    // An already satisfied selection must not allocate promises on every frame.
    if(!Object.keys(this.desired).some(c=>this.needs(c)))return;
    this.pending=this.drain().finally(()=>{this.pending=null;if(this.canPlay)this.sync();});
    return this.pending;
  }
  needs(channel){const key=this.desired[channel],v=this.current[channel];return key&&this.definitions[channel][key]&&!this.failed.has(channel+':'+key)&&(!v||v.ending||v.key!==key);}
  makeRoom(channel,key){
    // A third request during a crossfade releases the older fading voice before decode.
    for(const v of [...this.voices])if(v.channel===channel&&v.ending)this.end(v,0);
    const entries=[...this.cache].filter(([id])=>id.startsWith(channel+':')&&id!==channel+':'+key);
    while(entries.length>=2){
      const index=entries.findIndex(([id])=>!Array.from(this.voices).some(v=>v.id===id));
      if(index<0)break;
      this.cache.delete(entries.splice(index,1)[0][0]);
    }
  }
  async drain(){
    for(const channel of ['music','ambience']){
      if(!this.canPlay||!this.needs(channel))continue;
      const key=this.desired[channel],id=channel+':'+key,definition=this.definitions[channel][key];
      let buffer=this.cache.get(id);
      if(!buffer){
        this.makeRoom(channel,key);this.abort=new AbortController();
        const timeout=setTimeout(()=>this.abort?.abort(),20000);
        try{
          const r=await this.owner.fetcher(new URL(definition.url,this.base),{cache:'force-cache',signal:this.abort.signal});
          if(!r.ok)throw new Error('audio bed '+key);
          const data=await r.arrayBuffer();if(this.disposed)return;
          buffer=await this.owner.context.decodeAudioData(data);if(this.disposed)return;
          this.cache.set(id,buffer);
        }catch{if(!this.disposed){this.failed.add(id);this.owner.failed++;}}
        finally{clearTimeout(timeout);this.abort=null;}
      }
      if(buffer&&this.canPlay&&this.desired[channel]===key)this.start(channel,key,buffer,definition);
    }
  }
  start(channel,key,buffer,definition){
    const context=this.owner.context,now=context.currentTime,id=channel+':'+key;
    for(const v of [...this.voices])if(v.channel===channel)this.end(v,v.ending?0:1.2);
    const source=context.createBufferSource(),gain=context.createGain();source.buffer=buffer;source.loop=true;
    source.connect(gain);gain.connect(this.owner.master);
    gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(definition.volume??.25,now+1.2);
    const voice={channel,key,id,source,gain,volume:definition.volume??.25,ending:false,cleaned:false,cleanup:()=>{
      if(voice.cleaned)return;voice.cleaned=true;source.onended=null;source.disconnect();gain.disconnect();source.buffer=null;
      this.voices.delete(voice);if(this.current[channel]===voice)this.current[channel]=null;
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
  inspect(){return {context:this.current.music?.key??null,ambience:this.current.ambience?.key??null,loopVoices:this.voices.size,decodedBeds:this.cache.size,decodedBedBytes:[...this.cache.values()].reduce((n,b)=>n+(b.length??Math.round(b.duration*32000))*(b.numberOfChannels??2)*4,0)};}
  dispose(){this.disposed=true;this.abort?.abort();this.stop();this.cache.clear();}
}
