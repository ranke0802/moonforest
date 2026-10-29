import { AudioBeds } from './audio-beds.js';
const DEFAULTS={volume:.55,priority:2,cooldown:.055};
const SETTINGS={
 foot_0:{volume:.19,priority:0,cooldown:.12},foot_1:{volume:.19,priority:0,cooldown:.12},foot_2:{volume:.19,priority:0,cooldown:.12},
 ui_click:{volume:.24,priority:0,cooldown:.1},ui_open:{volume:.28,priority:0},ui_back:{volume:.28,priority:0},
 death:{volume:.65,priority:4,cooldown:2},victory:{volume:.5,priority:3,cooldown:2},
 boss_warning:{volume:.33,cooldown:1.2},boss_appear:{volume:.48,priority:3},
 slash:{volume:.5},slash_heavy:{volume:.7},block:{volume:.75,priority:3},parry:{volume:.65,priority:3},
 boss_hit:{volume:.8,priority:3,cooldown:.045},player_hit:{volume:.75,priority:3},land:{volume:.78,priority:3},
 critical:{volume:.35,cooldown:.12},heal_tick:{volume:.16,cooldown:.3},charge_ready:{volume:.28,cooldown:.5},
 low_health:{volume:.3,priority:3,cooldown:5},
};

export class GameAudio {
  constructor({contextFactory=()=>new (globalThis.AudioContext||globalThis.webkitAudioContext)({latencyHint:'interactive',sampleRate:32000}),fetcher=(...args)=>fetch(...args),maxVoices=12,manifestUrl}={}){
    this.contextFactory=contextFactory;this.fetcher=fetcher;this.maxVoices=maxVoices;
    this.buffers=new Map();this.variants=new Map();this.variantIndex=new Map();this.voices=new Set();this.lastPlayed=new Map();this.listener={x:0,z:0};this.seed=27183;
    this.musicWanted=false;this.beds=new AudioBeds(this);this.environment=null;this.combatMode=null;
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
      const manifest=await response.json(),{sounds}=manifest;this.cueSettings=manifest.cueSettings;this.beds.configure(manifest,manifestUrl);this.resolvedManifestUrl=manifestUrl;
      const queue=[],byPath=new Map();
      for(const [name,paths] of Object.entries(sounds)){
        const variants=(Array.isArray(paths)?paths:[paths]).map((path,i)=>({key:i?`${name}_${i}`:name,path}));
        this.variants.set(name,variants.map(v=>v.key));for(const v of variants){if(!byPath.has(v.path)){byPath.set(v.path,[]);queue.push([v.key,v.path]);}byPath.get(v.path).push(v.key);}
      }
      // Three in-flight decodes/downloads, rather than a burst of dozens on mobile.
      await Promise.all(Array.from({length:3},async()=>{while(queue.length&&!this.disposed){
        const [name,path]=queue.shift();
        try{const response=await this.fetcher(new URL(path,manifestUrl),{cache:'force-cache'});if(!response.ok)throw new Error(name);
          const buffer=await this.context.decodeAudioData(await response.arrayBuffer());if(!this.disposed)for(const key of byPath.get(path))this.buffers.set(key,buffer);
        }catch{this.failed++;}
      }}));
      this.beds.ready=true;this.syncMusic();
    }catch{this.failed++;this.loading=null;}
  }
  setSuspended(value){
    this.suspended=value;
    if(value){this.stopVoices();this.context?.suspend().catch(()=>{});}
    // A rejected resume is retried by the next pointer/key gesture.
    else if(this.context?.state==='suspended')this.context.resume().then(()=>this.syncMusic()).catch(()=>{});
  }
  stopVoices(){for(const voice of [...this.voices]){try{voice.source.stop();}catch{}voice.cleanup();}this.lastPlayed.clear();}
  stopAll(){this.stopVoices();this.environment=null;this.combatMode=null;this.musicWanted=false;this.beds.stop();}
  setEnvironment(character){
    const map=character==='warrior-v5'?'cave':character==='warrior-v4'?'forest':'village';
    this.environment=map;this.combatMode=null;this.selectBed();
    this.beds.request('ambience','ambience_'+map);
  }
  setCombat({active=false,boss=false,alive=true}={}){
    const mode=!alive?'dead':active?(boss?'boss':'combat'):null;
    if(mode===this.combatMode)return;this.combatMode=mode;this.selectBed();
  }
  selectBed(){
    const key=this.combatMode==='dead'?null:this.combatMode||this.environment;
    this.musicWanted=key==='boss';this.beds.request('music',key);
  }
  // Compatibility for existing integrations that only request the boss score.
  setBossMusic(active,fade=.8){this.musicWanted=active;this.beds.request('music',active?'boss':this.environment,fade);if(!active&&!fade&&!this.environment)for(const v of [...this.beds.voices])if(v.channel==='music')this.beds.end(v,0);}
  syncMusic(){return this.beds.sync();}
  get music(){return this.beds.current.music;}
  get musicBuffer(){return this.beds.cache.get('music:boss')??null;}
  get musicLoading(){return this.beds.pending;}
  duckMusic(now){this.beds.duck(now);}
  play(name,{position,volume=1,rate=1}={}){
    const variants=this.variants.get(name)||[name],index=this.variantIndex.get(name)||0;
    const context=this.context,buffer=this.buffers.get(variants[index%variants.length])||this.buffers.get(name);
    if(this.suspended||context?.state!=='running'||!buffer){this.dropped++;return false;}
    const settings={...DEFAULTS,...this.cueSettings?.[name],...SETTINGS[name]},now=context.currentTime;
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
    const voice={source,priority:settings.priority,started:now,cleaned:false,cleanup:()=>{if(voice.cleaned)return;voice.cleaned=true;source.onended=null;source.disconnect();gain.disconnect();source.buffer=null;this.voices.delete(voice);}};
    source.onended=voice.cleanup;this.voices.add(voice);this.lastPlayed.set(name,now);source.start();this.played++;
    if(['boss_hit','player_hit','land','block','parry'].includes(name))this.duckMusic(now);
    this.peakVoices=Math.max(this.peakVoices,this.voices.size);return true;
  }
  inspect(){return {state:this.context?.state??'locked',sampleRate:this.context?.sampleRate??null,loaded:this.buffers.size,active:this.voices.size,peak:this.peakVoices,played:this.played,dropped:this.dropped,failed:this.failed,music:this.music&&!this.music.ending?(this.suspended?'paused':'playing'):'stopped',musicLoaded:!!this.musicBuffer,...this.beds.inspect()};}
  dispose(){this.disposed=true;this.stopAll();this.buffers.clear();this.beds.dispose();this.context?.close().catch(()=>{});}
}
