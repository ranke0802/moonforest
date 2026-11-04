import manifest from '../public/assets/audio.json' with {type:'json'};
import {mediaStore} from './cinematic-media.js';
export const CINEMATIC_AUDIO_IDS=Object.freeze([...Object.keys(manifest.sounds),...Object.keys(manifest.music??{}).map(key=>'music:'+key),...Object.keys(manifest.ambience??{}).map(key=>'ambience:'+key)]);
const musicNames={boss:'보스 전투',village:'마을',forest:'숲',cave:'동굴',combat:'일반 전투',elena_saint:'성녀 엘레나',elena_mourning:'비탄의 마녀'};
export const cinematicAudioChoices=Object.freeze([...Object.keys(manifest.music??{}).map(key=>({value:'music:'+key,label:(musicNames[key]??key)+' 배경음악',kind:'music'})),...Object.keys(manifest.ambience??{}).map(key=>({value:'ambience:'+key,label:(key.includes('village')?'마을':key.includes('forest')?'숲':'동굴')+' 환경음',kind:'ambience'})),...Object.keys(manifest.sounds).map(key=>({value:key,label:key,kind:'effect'}))]);
const decodedBytes=buffer=>(buffer.length??Math.ceil(buffer.duration*(buffer.sampleRate??32000)))*(buffer.numberOfChannels??1)*4;
const abortError=()=>Object.assign(new Error('음원 준비를 취소했습니다.'),{name:'AbortError'});

export function createCinematicAudioTimeline({audio,manifest:definitions=manifest,store=mediaStore,baseUrl=new URL('assets/audio.json',globalThis.location?.href??'http://localhost/')}={}){
 const buffers=new Map(),voices=new Map();let disposed=false,generation=0,lastTime=0,lastDocument=null,lastPlaying=false,prepared=false;const stats={starts:0,stops:0,decoded:0,decodedBytes:0,failed:0};
 function stopVoice(key){const voice=voices.get(key);if(!voice)return;voices.delete(key);try{voice.source.stop();}catch{}voice.cleanup();stats.stops++;}
 function stop(){for(const key of [...voices.keys()])stopVoice(key);lastPlaying=false;}
 function bufferFor(id){return buffers.get(id)??audio?.buffers?.get(id);}
 async function load(id,document,signal,epoch){
  if(buffers.has(id))return;const check=()=>{if(disposed||epoch!==generation||signal?.aborted)throw signal?.reason??abortError();};check();
  let buffer=audio?.buffers?.get(id),bytes;
  if(!buffer&&id.startsWith('music:'))buffer=audio?.beds?.cache?.get(id);
  if(!buffer){if(id.startsWith('local:')){const meta=document.media?.audio.find(item=>item.assetId===id),record=await store.get(id);check();if(!meta||!record||record.metadata.sha256!==meta.sha256||record.bytes.byteLength!==meta.bytes)throw new Error('추가한 음원을 다시 열어 주세요.');bytes=record.bytes;}
   else{const split=id.indexOf(':'),kind=split<0?'sounds':id.slice(0,split)==='music'?'music':id.slice(0,split)==='ambience'?'ambience':null,key=split<0?id:id.slice(split+1),entry=definitions[kind]?.[key],url=kind==='sounds'?(Array.isArray(entry)?entry[0]:entry):entry?.url;if(!url)throw new Error('사용할 수 없는 음원입니다: '+id);const response=await (audio?.fetcher??fetch)(new URL(url,baseUrl),{signal,cache:'force-cache'});check();if(!response.ok)throw new Error('음원을 불러오지 못했습니다: '+id);bytes=await response.arrayBuffer();check();}
   buffer=await audio.context.decodeAudioData(bytes.slice(0));check();stats.decoded++;
  }
  const size=decodedBytes(buffer);if(stats.decodedBytes+size>48*1024*1024)throw new Error('선택한 음원들의 재생 메모리가48MiB를 넘습니다. 짧은 음원을 사용하거나 트랙 수를 줄여 주세요.');buffers.set(id,buffer);stats.decodedBytes+=size;
 }
 async function prepare(document,{signal}={}){
  if(disposed)throw abortError();const epoch=++generation;stop();prepared=false;const needed=new Set(document.tracks.audio.map(cue=>cue.audioId));for(const id of buffers.keys())if(!needed.has(id))buffers.delete(id);stats.decodedBytes=[...buffers.values()].reduce((sum,buffer)=>sum+decodedBytes(buffer),0);lastDocument=document;lastTime=0;
  if(!document.tracks.audio.length){prepared=true;return;}
  if(!audio)throw new Error('소리 재생 기능을 사용할 수 없습니다.');if(!audio.context)audio.makeContext?.();if(!audio.context?.decodeAudioData||!audio.master)throw new Error('소리를 켠 뒤 다시 재생해 주세요.');
  audio.environment=null;audio.combatMode=null;audio.bossTheme=null;audio.musicWanted=false;audio.beds?.stop?.();
  try{for(const id of new Set(document.tracks.audio.map(cue=>cue.audioId)))await load(id,document,signal,epoch);if(disposed||epoch!==generation||signal?.aborted)throw signal?.reason??abortError();prepared=true;}catch(error){stats.failed++;if(epoch===generation){buffers.clear();stats.decodedBytes=0;}throw error;}
 }
 function gainAt(cue,time){const elapsed=time-cue.time,remaining=(cue.end??Infinity)-time;return Math.max(0,Math.min(1,cue.volume??1,(cue.fadeIn?elapsed/cue.fadeIn:1)*(cue.volume??1),(cue.fadeOut?remaining/cue.fadeOut:1)*(cue.volume??1)));}
 function start(key,cue,time){
  if(disposed||!prepared||voices.has(key)||audio?.suspended||audio?.context?.state!=='running')return false;const buffer=bufferFor(cue.audioId);if(!buffer)return false;if(voices.size>=16)return false;
  const elapsed=Math.max(0,time-cue.time),clipStart=cue.clipStart??0,range=buffer.duration-clipStart;if(range<=0)return false;const offset=clipStart+(cue.loop?elapsed%range:elapsed);if(offset>=buffer.duration)return false;
  const source=audio.context.createBufferSource(),gain=audio.context.createGain();source.buffer=buffer;source.loop=!!cue.loop;if(cue.loop){source.loopStart=clipStart;source.loopEnd=buffer.duration;}gain.gain.value=gainAt(cue,time);source.connect(gain);gain.connect(audio.master);let cleaned=false;const voice={source,gain,cue,cleanup(){if(cleaned)return;cleaned=true;source.onended=null;try{source.disconnect();gain.disconnect();}catch{}source.buffer=null;if(voices.get(key)===voice)voices.delete(key);}};voices.set(key,voice);source.onended=voice.cleanup;try{source.start(0,offset);if(cue.end!==undefined)source.stop(audio.context.currentTime+Math.max(0,cue.end-time));stats.starts++;return true;}catch{voice.cleanup();stats.failed++;return false;}
 }
 function interval(cue){return cue.end!==undefined||cue.loop||cue.audioId.startsWith('music:')||cue.audioId.startsWith('ambience:');}
 function sample(document,time,{playing=false,seeking=false}={}){
  if(disposed)return;const jumped=seeking||Math.abs(time-lastTime)>.3||time<lastTime,lastChanged=lastDocument?.cutsceneId!==document.cutsceneId;if(!playing||jumped||lastChanged)stop();lastDocument=document;lastTime=time;lastPlaying=playing;if(!playing)return;
  const active=new Set();document.tracks.audio.forEach((cue,index)=>{if(!interval(cue))return;const key='track:'+index;if(time>=cue.time&&time<(cue.end??document.duration)){active.add(key);start(key,cue,time);const voice=voices.get(key);if(voice)voice.gain.gain.setValueAtTime?.(gainAt(cue,time),audio.context.currentTime);}});for(const key of [...voices.keys()])if(key.startsWith('track:')&&!active.has(key))stopVoice(key);
 }
 function emit(cue){if(disposed||!prepared||interval(cue))return false;return start(cue.cueId??'effect:'+stats.starts,cue,cue.time);}
 return {prepare,sample,emit,stop,dispose(){if(disposed)return;disposed=true;generation++;stop();buffers.clear();stats.decodedBytes=0;},inspect:()=>({...stats,active:voices.size,buffers:buffers.size,prepared,disposed,playing:lastPlaying,time:lastTime})};
}
