const DEFAULTS={volume:.55,priority:2,cooldown:.055};
const SETTINGS={
 foot_0:{volume:.32,priority:0,cooldown:.12},foot_1:{volume:.32,priority:0,cooldown:.12},foot_2:{volume:.32,priority:0,cooldown:.12},
 ui_click:{volume:.24,priority:0,cooldown:.1},ui_open:{volume:.28,priority:0},ui_back:{volume:.28,priority:0},
 death:{volume:.65,priority:4,cooldown:2},victory:{volume:.5,priority:3,cooldown:2},
 boss_warning:{volume:.28,cooldown:1.2},boss_appear:{volume:.5,priority:3},
 slash:{volume:.43},slash_heavy:{volume:.6},block:{volume:.62,priority:3},parry:{volume:.5,priority:3},
 boss_hit:{volume:.58,priority:3,cooldown:.045},player_hit:{volume:.55,priority:3},
 critical:{volume:.28,cooldown:.12},heal_tick:{volume:.25,cooldown:.3},charge_ready:{volume:.3,cooldown:.5},
};

export class GameAudio {
  constructor({contextFactory=()=>new (globalThis.AudioContext||globalThis.webkitAudioContext)({latencyHint:'interactive'}),fetcher=(...args)=>fetch(...args),maxVoices=12,manifestUrl}={}){
    this.contextFactory=contextFactory;this.fetcher=fetcher;this.maxVoices=maxVoices;
    this.buffers=new Map();this.voices=new Set();this.lastPlayed=new Map();this.listener={x:0,z:0};this.seed=27183;
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
      const {sounds}=await response.json();const queue=Object.entries(sounds);
      // Three in-flight decodes/downloads, rather than a burst of dozens on mobile.
      await Promise.all(Array.from({length:3},async()=>{while(queue.length&&!this.disposed){
        const [name,path]=queue.shift();
        try{const response=await this.fetcher(new URL(path,manifestUrl),{cache:'force-cache'});if(!response.ok)throw new Error(name);
          const buffer=await this.context.decodeAudioData(await response.arrayBuffer());if(!this.disposed)this.buffers.set(name,buffer);
        }catch{this.failed++;}
      }}));
    }catch{this.failed++;this.loading=null;}
  }
  setSuspended(value){
    this.suspended=value;
    if(value){this.stopAll();this.context?.suspend().catch(()=>{});}
    // A rejected resume is retried by the next pointer/key gesture.
    else if(this.context?.state==='suspended')this.context.resume().catch(()=>{});
  }
  stopAll(){for(const voice of [...this.voices]){try{voice.source.stop();}catch{}voice.cleanup();}this.lastPlayed.clear();}
  play(name,{position,volume=1,rate=1}={}){
    const context=this.context,buffer=this.buffers.get(name);
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
    const source=context.createBufferSource(),gain=context.createGain();source.buffer=buffer;
    this.seed=(Math.imul(this.seed,1664525)+1013904223)>>>0;
    source.playbackRate.value=rate*(.975+this.seed/4294967296*.05);
    gain.gain.value=Math.min(1,settings.volume*volume*attenuation);source.connect(gain);gain.connect(this.master);
    const voice={source,priority:settings.priority,started:now,cleanup:()=>{source.disconnect();gain.disconnect();this.voices.delete(voice);}};
    source.onended=voice.cleanup;this.voices.add(voice);this.lastPlayed.set(name,now);source.start();this.played++;
    this.peakVoices=Math.max(this.peakVoices,this.voices.size);return true;
  }
  inspect(){return {state:this.context?.state??'locked',loaded:this.buffers.size,active:this.voices.size,peak:this.peakVoices,played:this.played,dropped:this.dropped,failed:this.failed};}
  dispose(){this.disposed=true;this.stopAll();this.buffers.clear();this.context?.close().catch(()=>{});}
}
