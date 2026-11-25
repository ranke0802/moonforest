import { AudioBeds } from './audio-beds.js';
import {bossMusicContext,availableBossMusic} from './boss-music.js';
import {MapLoadLifetime,mapLoadAbortError} from './map-load-lifetime.js';
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
  constructor({contextFactory=()=>new (globalThis.AudioContext||globalThis.webkitAudioContext)({latencyHint:'interactive',sampleRate:32000}),fetcher=(...args)=>fetch(...args),maxVoices=12,manifestUrl,audioSession=globalThis.navigator?.audioSession,now=()=>Date.now(),loadTimeoutMs=20000,retryDelayMs=5000,timers}={}){
    this.contextFactory=contextFactory;this.fetcher=fetcher;this.maxVoices=maxVoices;
    this.buffers=new Map();this.variants=new Map();this.variantIndex=new Map();this.voices=new Set();this.lastPlayed=new Map();this.listener={x:0,z:0};this.seed=27183;
    this.musicWanted=false;this.beds=new AudioBeds(this);this.environment=null;this.combatMode=null;this.bossTheme=null;
    this.manifestUrl=manifestUrl;
    this.audioSession=audioSession;this.now=now;this.resumeAttempts=0;this.resumePending=null;this.gestureCleanup=null;
    this.suspended=false;this.sfxMuted=false;this.score=null;this.played=0;this.dropped=0;this.failed=0;this.peakVoices=0;this.disposed=false;
    this.loadTimeoutMs=loadTimeoutMs;this.retryDelayMs=retryDelayMs;this.timers=timers;this.audioGeneration=0;this.audioLifetimes=new Set();this.sfxSources=new Map();this.sfxDecodeJobs=new Set();this.sfxLoading=null;
  }
  bindUnlock(target){
    this.gestureCleanup?.();
    const types=['pointerdown','pointerup','touchend','click','keydown'],listener=()=>this.unlock();
    for(const type of types)target.addEventListener(type,listener,{capture:true,passive:true});
    this.gestureCleanup=()=>{for(const type of types)target.removeEventListener(type,listener,true);this.gestureCleanup=null;};
    return this.gestureCleanup;
  }
  selectAudioSession(){
    // Safari's default Web Audio session may be silent with the hardware mute
    // switch. Request playback for this user-started music/effects session.
    try{if(this.audioSession){this.previousSessionType??=this.audioSession.type;if(this.audioSession.type!=='playback')this.audioSession.type='playback';}}catch{}
  }
  makeContext(){
    this.context=this.contextFactory();this.master=this.context.createGain();this.master.gain.value=.75;this.master.connect(this.context.destination);
    const context=this.context;
    this.contextStateChanged=()=>{if(!this.disposed&&this.context===context&&context.state==='running'&&!this.suspended)this.syncMusic();};
    context.addEventListener?.('statechange',this.contextStateChanged);
    // A one-frame silent source is started in the same gesture as resume,
    // rather than waiting for the first downloaded sound to unlock the route.
    if(context.createBuffer){const source=context.createBufferSource();source.buffer=context.createBuffer(1,1,context.sampleRate||32000);source.connect(this.master);source.onended=()=>{source.disconnect();source.buffer=null;if(this.primer===source)this.primer=null;};source.start();this.primer=source;}
  }
  resumeContext({gesture=false}={}){
    const context=this.context;if(!context||context.state==='closed'||this.suspended||this.disposed)return Promise.resolve();
    if(context.state==='running'){this.syncMusic();return Promise.resolve();}
    // A fresh trusted tap must be able to retry a WebKit resume promise which
    // never settled. Automatic visibility updates still share one request.
    if(this.resumePending&&!gesture)return this.resumePending;
    this.selectAudioSession();this.resumeAttempts++;
    let pending;try{pending=Promise.resolve(context.resume());}catch{this.failed++;return Promise.resolve();}
    const settled=pending.then(()=>{if(this.disposed||this.context!==context)return;if(this.suspended&&context.state==='running')context.suspend().catch(()=>{});else if(context.state==='running')this.syncMusic();},()=>{if(!this.disposed)this.failed++;}).finally(()=>{if(this.resumePending===settled)this.resumePending=null;});
    this.resumePending=settled;return settled;
  }
  unlock(){
    if(this.disposed||this.suspended)return;
    try{
      this.selectAudioSession();
      if(!this.context)this.makeContext();
      const resumed=this.resumeContext({gesture:true});
      // Fetch/decode must not be held hostage by a pending iOS resume promise.
      if(!this.loading)this.loading=this.preload();else this.loadSoundEffects();
      this.beds.retryFailed();this.selectBed();this.syncMusic();return resumed;
    }catch{this.failed++;}
  }
  async preload(){
    const generation=++this.audioGeneration,context=this.context,lifetime=this.loadLifetime('audio-manifest');
    try{
      const manifestUrl=this.manifestUrl||new URL(`${import.meta.env?.BASE_URL??'/'}assets/audio.json`,globalThis.location.href);
      // Start I/O in the trusted gesture, even when WebKit resume never settles.
      const response=await lifetime.wait(this.fetcher(manifestUrl,{cache:'no-cache',signal:lifetime.signal}));if(!response.ok)throw new Error('audio manifest');
      const manifest=await lifetime.wait(response.json());this.checkAudioLoad(generation,context,lifetime);this.closeLoadLifetime(lifetime);
      const {sounds}=manifest;this.cueSettings=manifest.cueSettings;this.beds.configure(manifest,manifestUrl);this.resolvedManifestUrl=manifestUrl;this.selectBed();
      this.sfxSources.clear();
      for(const [name,paths] of Object.entries(sounds)){
        const variants=(Array.isArray(paths)?paths:[paths]).map((path,i)=>({key:i?`${name}_${i}`:name,path}));
        this.variants.set(name,variants.map(v=>v.key));for(const v of variants){const url=new URL(v.path,manifestUrl).href;let source=this.sfxSources.get(url);if(!source){source={url,keys:[],status:'new',retryAt:0};this.sfxSources.set(url,source);}source.keys.push(v.key);}
      }
      const soundsLoading=this.loadSoundEffects();
      // A stalled effect must not hold the selected map's music/ambience hostage.
      // AudioBeds still owns suspension, map selection and stale-load checks.
      this.beds.ready=true;this.syncMusic();
      await soundsLoading;
    }catch(error){lifetime.abort(error);if(!this.disposed&&this.audioGeneration===generation){this.failed++;this.loading=null;}}
    finally{this.closeLoadLifetime(lifetime);}
  }
  loadLifetime(stage){const lifetime=new MapLoadLifetime({timeoutMs:this.loadTimeoutMs,timers:this.timers,stage});this.audioLifetimes.add(lifetime);return lifetime;}
  closeLoadLifetime(lifetime){lifetime.close();this.audioLifetimes.delete(lifetime);}
  checkAudioLoad(generation,context,lifetime){
    if(this.disposed||generation!==this.audioGeneration||this.context!==context||context?.state==='closed')lifetime.abort(mapLoadAbortError());lifetime.check();
  }
  loadSoundEffects(){
    if(this.disposed||!this.context||this.context.state==='closed'||this.sfxLoading)return this.sfxLoading;
    const queue=[...this.sfxSources.values()].filter(source=>source.status==='new'||source.status==='failed'&&this.now()>=source.retryAt);
    if(!queue.length)return;
    const generation=this.audioGeneration,context=this.context;
    const pending=Promise.all(Array.from({length:3},async()=>{while(queue.length&&!this.disposed&&this.audioGeneration===generation){
      const source=queue.shift(),lifetime=this.loadLifetime('audio-effect');source.status='loading';
      try{
        this.checkAudioLoad(generation,context,lifetime);
        const response=await lifetime.wait(this.fetcher(source.url,{cache:'force-cache',signal:lifetime.signal}),{onLate:response=>response.body?.cancel().catch(()=>{})});if(!response.ok)throw new Error('audio effect');
        const bytes=await lifetime.wait(response.arrayBuffer());this.checkAudioLoad(generation,context,lifetime);
        // Native decode cannot be interrupted. Do not accumulate new native
        // decodes after timed-out calls; late results have no publication path.
        if(this.sfxDecodeJobs.size>=3)throw new Error('Audio decoder is still busy');
        const decode=Promise.resolve(context.decodeAudioData(bytes));this.sfxDecodeJobs.add(decode);
        decode.then(()=>this.sfxDecodeJobs.delete(decode),()=>this.sfxDecodeJobs.delete(decode));
        const buffer=await lifetime.wait(decode);this.checkAudioLoad(generation,context,lifetime);
        for(const key of source.keys)this.buffers.set(key,buffer);source.status='loaded';
      }catch(error){
        lifetime.abort(error);
        if(!this.disposed&&this.audioGeneration===generation){source.status='failed';source.retryAt=this.now()+this.retryDelayMs;this.failed++;}
      }finally{this.closeLoadLifetime(lifetime);}
    }})).finally(()=>{if(this.sfxLoading===pending)this.sfxLoading=null;});
    this.sfxLoading=pending;return pending;
  }
  setSuspended(value){
    this.suspended=value;
    if(value){this.resumePending=null;this.stopVoices();this.context?.suspend().catch(()=>{});}
    // A rejected resume is retried by the next pointer/key gesture.
    else {this.beds.retryFailed();this.selectBed();this.resumeContext();}
  }
  onEffectsStopped(callback){
    (this.effectStopListeners??=new Set()).add(callback);
    return ()=>this.effectStopListeners.delete(callback);
  }
  stopVoices(){
    for(const callback of this.effectStopListeners??[])callback();
    for(const voice of this.voices)voice.stop();
    this.lastPlayed.clear();
  }
  stopAll(){this.stopVoices();this.environment=null;this.combatMode=null;this.bossTheme=null;this.musicWanted=false;this.beds.stop();}
  setEnvironment(character){
    const map=character==='warrior-v5'?'cave':character==='warrior-v4'?'forest':'village';
    this.environment=map;this.combatMode=null;this.bossTheme=null;this.selectBed();
    this.beds.request('ambience','ambience_'+map);
  }
  setCombat({active=false,boss=false,alive=true}={}){
    const mode=!alive?'dead':active?(boss?'boss':'combat'):null;
    if(mode===this.combatMode){if(mode!=='boss')this.bossTheme=null;return;}this.combatMode=mode;if(mode!=='boss')this.bossTheme=null;this.selectBed();
  }
  setBossContext(encounters){
    if(this.disposed)return;
    const theme=bossMusicContext(encounters);
    // Keep the last score through transformation and ActionAudio's short
    // victory hold; map/death/reset explicitly clear this small string state.
    if(!theme&&this.combatMode==='boss')return;
    if(theme===this.bossTheme)return;this.bossTheme=theme;
    if(this.combatMode==='boss')this.selectBed();
  }
  onBedError(channel,key){
    if(channel==='music'&&key===this.bossTheme&&this.combatMode==='boss')this.selectBed();
  }
  // A screen score (0.3 title / prologue) overrides the map's music; the
  // screen's own sound effects can be muted (the title's demo fight).
  prefetchScore(key){if(!key||!this.beds.definitions?.music?.[key])return Promise.resolve(false);if(!this.context)this.makeContext?.();return this.beds.prefetch('music',key);}
  setScore(key,fade=1.6){key=key&&this.beds.definitions.music?.[key]?key:null;if(key===this.score)return;this.score=key;if(key){this.musicWanted=false;this.beds.request('music',key,fade);}else this.selectBed();}
  setSfxMuted(value){this.sfxMuted=!!value;if(this.sfxMuted)this.stopVoices();}
  selectBed(){
    if(this.score){this.beds.request('music',this.score);return;}
    const mode=this.combatMode==='dead'?null:this.combatMode||this.environment;
    const key=mode==='boss'?availableBossMusic(this.bossTheme,this.beds.definitions.music,this.beds.failed):mode;
    this.musicWanted=mode==='boss';this.beds.request('music',key);
  }
  // Compatibility for existing integrations that only request the boss score.
  setBossMusic(active,fade=.8){this.musicWanted=active;this.combatMode=active?'boss':null;this.bossTheme=null;this.beds.request('music',active?'boss':this.environment,fade);if(!active&&!fade&&!this.environment)for(const v of [...this.beds.voices])if(v.channel==='music')this.beds.end(v,0);}
  syncMusic(){this.selectBed();return this.beds.sync();}
  get music(){return this.beds.current.music;}
  get musicBuffer(){return this.music?.source.buffer??this.beds.cache.get('music:boss')??null;}
  get musicLoading(){return this.beds.pending;}
  duckMusic(now){this.beds.duck(now);}
  play(name,{position,volume=1,rate=1,duck=true}={}){
    const variants=this.variants.get(name)||[name],index=this.variantIndex.get(name)||0;
    const context=this.context,buffer=this.buffers.get(variants[index%variants.length])||this.buffers.get(name);
    if(this.suspended||this.sfxMuted||context?.state!=='running'||!buffer){this.dropped++;return false;}
    const settings={...DEFAULTS,...this.cueSettings?.[name],...SETTINGS[name]},now=context.currentTime;
    if(now-(this.lastPlayed.get(name)??-Infinity)<settings.cooldown)return false;
    const distance=position?Math.hypot(position.x-this.listener.x,position.z-this.listener.z):0;
    if(distance>18)return false;
    const attenuation=1/(1+Math.max(0,distance-1.5)*.18);
    const voice=this.startEffectVoice(buffer,{rate,jitter:true,volume:settings.volume*volume*attenuation,priority:settings.priority});
    if(!voice)return false;
    this.variantIndex.set(name,index+1);this.lastPlayed.set(name,now);
    if(duck&&['boss_hit','player_hit','land','block','parry'].includes(name))this.duckMusic(now);
    return true;
  }
  startEffectVoice(buffer,{rate=1,volume=1,priority=2,jitter=false,when=0,loop=false,loopStart=0,loopEnd=0}={}){
    const context=this.context;
    if(this.disposed||this.suspended||this.sfxMuted||context?.state!=='running'||!buffer)return null;
    if(this.voices.size>=this.maxVoices){
      let victim=null;
      for(const voice of this.voices)if(voice.priority<priority&&(!victim||voice.priority<victim.priority||voice.priority===victim.priority&&voice.started<victim.started))victim=voice;
      if(!victim){this.dropped++;return null;}victim.stop();
    }
    const source=context.createBufferSource(),gain=context.createGain();
    source.buffer=buffer;
    if(jitter){this.seed=(Math.imul(this.seed,1664525)+1013904223)>>>0;rate*=.975+this.seed/4294967296*.05;}
    source.playbackRate.value=rate;gain.gain.value=Math.min(1,volume);
    if(loop){source.loop=true;source.loopStart=loopStart;source.loopEnd=loopEnd;}
    source.connect(gain);gain.connect(this.master);
    const voice={source,gain,priority,started:context.currentTime,cleaned:false,
      stop(){if(voice.cleaned)return;try{source.stop();}catch{}voice.cleanup();},
      cleanup:()=>{if(voice.cleaned)return;voice.cleaned=true;source.onended=null;source.disconnect();gain.disconnect();source.buffer=null;this.voices.delete(voice);}};
    source.onended=voice.cleanup;this.voices.add(voice);
    try{source.start(when);}catch{voice.cleanup();this.failed++;return null;}
    this.played++;this.peakVoices=Math.max(this.peakVoices,this.voices.size);return voice;
  }
  inspect(){const unique=new Set(this.buffers.values());let decodedSfxBytes=0;for(const buffer of unique){const bytes=(buffer.length??Math.round((buffer.duration??0)*(buffer.sampleRate??32000)))*(buffer.numberOfChannels??2)*4;if(Number.isFinite(bytes))decodedSfxBytes+=bytes;}return {state:this.context?.state??'locked',sampleRate:this.context?.sampleRate??null,loaded:this.buffers.size,decodedSfxBuffers:unique.size,decodedSfxBytes,pendingSfxDecodes:this.sfxDecodeJobs.size,failedSfxSources:[...this.sfxSources.values()].filter(source=>source.status==='failed').length,active:this.voices.size,peak:this.peakVoices,played:this.played,dropped:this.dropped,failed:this.failed,resumeAttempts:this.resumeAttempts,audioSession:this.audioSession?.type??null,music:this.music&&!this.music.ending?(this.suspended||this.context?.state!=='running'?'paused':'playing'):'stopped',musicLoaded:!!this.musicBuffer,bossThemeRequested:this.bossTheme,bossThemeAvailable:!!this.beds.definitions.music[this.bossTheme]?.url,...this.beds.inspect()};}
  dispose(){this.disposed=true;this.audioGeneration++;for(const lifetime of this.audioLifetimes)lifetime.abort(mapLoadAbortError());this.gestureCleanup?.();this.stopAll();this.buffers.clear();this.sfxSources.clear();this.beds.dispose();this.context?.removeEventListener?.('statechange',this.contextStateChanged);if(this.primer){this.primer.onended=null;try{this.primer.stop();}catch{}this.primer.disconnect();this.primer.buffer=null;this.primer=null;}this.context?.close().catch(()=>{});try{if(this.audioSession?.type==='playback'&&this.previousSessionType!=null)this.audioSession.type=this.previousSessionType;}catch{}}
}
