const DEFAULTS={volume:.55,priority:2,cooldown:.055};
const SETTINGS={
 foot_0:{volume:.19,priority:0,cooldown:.12},foot_1:{volume:.19,priority:0,cooldown:.12},foot_2:{volume:.19,priority:0,cooldown:.12},
 ui_click:{volume:.24,priority:0,cooldown:.1},ui_open:{volume:.28,priority:0},ui_back:{volume:.28,priority:0},
 death:{volume:.65,priority:4,cooldown:2},victory:{volume:.5,priority:3,cooldown:2},
 boss_warning:{volume:.33,cooldown:1.2},boss_appear:{volume:.48,priority:3},
 slash:{volume:.5},slash_heavy:{volume:.7},block:{volume:.75,priority:3},parry:{volume:.65,priority:3},
 boss_hit:{volume:.8,priority:3,cooldown:.045},player_hit:{volume:.75,priority:3},land:{volume:.78,priority:3},
 critical:{volume:.35,cooldown:.12},heal_tick:{volume:.16,cooldown:.3},charge_ready:{volume:.28,cooldown:.5},
};

export class GameAudio {
  constructor({contextFactory=()=>new (globalThis.AudioContext||globalThis.webkitAudioContext)({latencyHint:'interactive'}),fetcher=(...args)=>fetch(...args),maxVoices=12,manifestUrl}={}){
    this.contextFactory=contextFactory;this.fetcher=fetcher;this.maxVoices=maxVoices;
    this.buffers=new Map();this.variants=new Map();this.variantIndex=new Map();this.voices=new Set();this.lastPlayed=new Map();this.listener={x:0,z:0};this.seed=27183;
    this.musicWanted=false;this.music=null;this.musicBuffer=null;
    this.manifestUrl=manifestUrl;
    this.suspended=false;this.played=0;this.dropped=0;this.failed=0;this.peakVoices=0;this.disposed=false;
  }
  async unlock(){
    if(this.disposed||this.suspended)return;
    try{
      if(!this.context){this.context=this.contextFactory();this.master=this.context.createGain();this.master.gain.value=.75;this.master.connect(this.context.destination);}
      // resume must be requested in the gesture, before any fetch/decode awaits.
      if(this.context.state==='suspended')await this.context.resume();
      this.loading??=this.preload();
    }catch{this.failed++;}
  }
  async preload(){
    try{
      const manifestUrl=this.manifestUrl||new URL(`${import.meta.env?.BASE_URL??'/'}assets/audio.json`,globalThis.location.href);
      const response=await this.fetcher(manifestUrl,{cache:'no-cache'});if(!response.ok)throw new Error('audio manifest');
      const {sounds,music}=await response.json();this.musicDefinition=music?.boss;this.resolvedManifestUrl=manifestUrl;
      const queue=[];
      for(const [name,paths] of Object.entries(sounds)){
        const variants=(Array.isArray(paths)?paths:[paths]).map((path,i)=>({key:i?`${name}_${i}`:name,path}));
        this.variants.set(name,variants.map(v=>v.key));queue.push(...variants.map(v=>[v.key,v.path]));
      }
      // Three in-flight decodes/downloads, rather than a burst of dozens on mobile.
      await Promise.all(Array.from({length:3},async()=>{while(queue.length&&!this.disposed){
        const [name,path]=queue.shift();
        try{const response=await this.fetcher(new URL(path,manifestUrl),{cache:'force-cache'});if(!response.ok)throw new Error(name);
          const buffer=await this.context.decodeAudioData(await response.arrayBuffer());if(!this.disposed)this.buffers.set(name,buffer);
        }catch{this.failed++;}
      }}));
      this.syncMusic();
    }catch{this.failed++;this.loading=null;}
  }
  setSuspended(value){
    this.suspended=value;
    if(value){this.stopVoices();this.context?.suspend().catch(()=>{});}
    // A rejected resume is retried by the next pointer/key gesture.
    else if(this.context?.state==='suspended')this.context.resume().then(()=>this.syncMusic()).catch(()=>{});
  }
  stopVoices(){for(const voice of [...this.voices]){try{voice.source.stop();}catch{}voice.cleanup();}this.lastPlayed.clear();}
  stopAll(){this.stopVoices();this.setBossMusic(false,0);}
  setBossMusic(active,fade=.8){
    if(active===this.musicWanted&&(active||!this.music||fade>0))return;
    this.musicWanted=active;
    if(active)this.syncMusic();
    else if(this.music){
      const {source,gain}=this.music,now=this.context.currentTime;this.music.ending=true;
      gain.gain.cancelScheduledValues(now);gain.gain.setValueAtTime(gain.gain.value,now);
      gain.gain.linearRampToValueAtTime(0,now+fade);try{source.stop(now+fade);}catch{}
      if(!fade)this.music.cleanup();
    }
  }
  async syncMusic(){
    if(!this.musicWanted||this.suspended||this.disposed||!this.musicDefinition||this.context?.state!=='running')return;
    if(!this.musicBuffer){
      // Download/decode the compressed score only on the first boss encounter.
      this.musicLoading??=(async()=>{
        try{
          const response=await this.fetcher(new URL(this.musicDefinition.url,this.resolvedManifestUrl),{cache:'force-cache'});
          if(!response.ok)throw new Error('boss music');
          const buffer=await this.context.decodeAudioData(await response.arrayBuffer());if(!this.disposed)this.musicBuffer=buffer;
        }catch{this.failed++;}
      })();
      await this.musicLoading;
    }
    if(!this.musicBuffer||!this.musicWanted||this.suspended||this.disposed||this.context.state!=='running')return;
    if(this.music&&!this.music.ending)return;
    if(this.music){try{this.music.source.stop();}catch{}this.music.cleanup();}
    const source=this.context.createBufferSource(),gain=this.context.createGain(),now=this.context.currentTime;
    source.buffer=this.musicBuffer;source.loop=true;source.connect(gain);gain.connect(this.master);
    gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(this.musicDefinition.volume,now+1.5);
    const voice={source,gain,ending:false,cleanup:()=>{source.disconnect();gain.disconnect();if(this.music===voice)this.music=null;}};
    source.onended=voice.cleanup;this.music=voice;source.start();
  }
  duckMusic(now){
    if(!this.music||this.music.ending)return;
    const param=this.music.gain.gain,volume=this.musicDefinition.volume;
    param.cancelScheduledValues(now);param.setValueAtTime(Math.min(param.value,volume),now);
    param.linearRampToValueAtTime(volume*.48,now+.012);param.linearRampToValueAtTime(volume,now+.28);
  }
  play(name,{position,volume=1,rate=1}={}){
    const variants=this.variants.get(name)||[name],index=this.variantIndex.get(name)||0;
    const context=this.context,buffer=this.buffers.get(variants[index%variants.length])||this.buffers.get(name);
    if(this.suspended||context?.state!=='running'||!buffer){this.dropped++;return false;}
    const settings={...DEFAULTS,...SETTINGS[name]},now=context.currentTime;
    if(now-(this.lastPlayed.get(name)??-Infinity)<settings.cooldown)return false;
    const distance=position?Math.hypot(position.x-this.listener.x,position.z-this.listener.z):0;
    if(distance>18)return false;
    const attenuation=1/(1+Math.max(0,distance-1.5)*.18);
    if(this.voices.size>=this.maxVoices){
      const victim=[...this.voices].filter(v=>v.priority<settings.priority).sort((a,b)=>a.priority-b.priority||a.started-b.started)[0];
      if(!victim){this.dropped++;return false;}try{victim.source.stop();}catch{}victim.cleanup();
    }
    const source=context.createBufferSource(),gain=context.createGain();source.buffer=buffer;this.variantIndex.set(name,index+1);
    this.seed=(Math.imul(this.seed,1664525)+1013904223)>>>0;
    source.playbackRate.value=rate*(.975+this.seed/4294967296*.05);
    gain.gain.value=Math.min(1,settings.volume*volume*attenuation);source.connect(gain);gain.connect(this.master);
    const voice={source,priority:settings.priority,started:now,cleanup:()=>{source.disconnect();gain.disconnect();this.voices.delete(voice);}};
    source.onended=voice.cleanup;this.voices.add(voice);this.lastPlayed.set(name,now);source.start();this.played++;
    if(['boss_hit','player_hit','land','block','parry'].includes(name))this.duckMusic(now);
    this.peakVoices=Math.max(this.peakVoices,this.voices.size);return true;
  }
  inspect(){return {state:this.context?.state??'locked',loaded:this.buffers.size,active:this.voices.size,peak:this.peakVoices,played:this.played,dropped:this.dropped,failed:this.failed,music:this.music&&!this.music.ending?(this.suspended?'paused':'playing'):'stopped',musicLoaded:!!this.musicBuffer};}
  dispose(){this.disposed=true;this.stopAll();this.buffers.clear();this.musicBuffer=null;this.context?.close().catch(()=>{});}
}
