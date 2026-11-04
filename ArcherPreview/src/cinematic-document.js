export const CINEMATIC_FORMAT='moonforest-cinematic';
export const CINEMATIC_LIMITS=Object.freeze({bytes:512*1024,duration:600,actors:20,shots:128,transforms:40,keys:2048,animations:256,subtitles:128,audio:128,events:128});
export const CINEMATIC_EVENTS=Object.freeze(['marker']);
const maps=['village','great-plains','monster-forest','witch-cave'];
const copy=value=>structuredClone(value),clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const interpolations=['step','linear','smooth'];
const encode=value=>new TextEncoder().encode(typeof value==='string'?value:JSON.stringify(value)).length;
const plain=value=>!!value&&typeof value==='object'&&!Array.isArray(value);

export function validateCinematicDocument(input,references={}){
  const errors=[],add=(path,message)=>{if(errors.length<100)errors.push({path,message});};let doc;
  try{if(encode(input)>CINEMATIC_LIMITS.bytes)throw new Error('File exceeds512KiB');doc=typeof input==='string'?JSON.parse(input):copy(input);}catch(error){return {valid:false,errors:[{path:'$',message:'Invalid cinematic JSON: '+error.message}]};}
  const object=(value,keys,path)=>{if(!plain(value)){add(path,'Expected an object');return false;}for(const key of Object.keys(value))if(!keys.includes(key))add(path+'.'+key,'Unknown field');return true;};
  const number=(value,path,min=-10000,max=10000)=>{if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)add(path,`Expected a finite number in[${min},${max}]`);};
  const string=(value,path,max=1000)=>{if(typeof value!=='string'||!value.length||value.length>max)add(path,'Expected nonempty text within'+max+'characters');};
  const id=(value,path)=>{if(typeof value!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/.test(value))add(path,'Invalid identifier');};
  const array=(value,path,max)=>{if(!Array.isArray(value)){add(path,'Expected an array');return [];}if(value.length>max)add(path,'Too many entries; maximum'+max);return value.slice(0,max);};
  const vector=(value,path)=>{if(!Array.isArray(value)||value.length!==3){add(path,'Expected[x,y,z] in metres');return;}value.forEach((n,i)=>number(n,path+'['+i+']'));};
  const rotation=(value,path)=>{if(!Array.isArray(value)||value.length!==4){add(path,'Expected quaternion[x,y,z,w]');return;}value.forEach((n,i)=>number(n,path+'['+i+']',-1,1));if(Math.abs(Math.hypot(...value)-1)>.001)add(path,'Quaternion must have unit length');};
  const time=(value,path)=>number(value,path,0,Number.isFinite(doc?.duration)?doc.duration:CINEMATIC_LIMITS.duration);
  const interval=(value,path)=>{time(value.start,path+'.start');time(value.end,path+'.end');if(!(value.end>value.start))add(path+'.end','End must be after start');};
  const interpolation=(value,path)=>{if(!interpolations.includes(value))add(path,'Expected step, linear or smooth');};
  if(!object(doc,['format','version','cutsceneId','mapId','catalogRevision','duration','anchor','actors','shots','tracks'],'$'))return {valid:false,errors};
  if(doc.format!==CINEMATIC_FORMAT)add('$.format','Unsupported cinematic format');if(doc.version!==1)add('$.version','Unsupported schema version');
  id(doc.cutsceneId,'$.cutsceneId');if(!maps.includes(doc.mapId))add('$.mapId','Unknown map');number(doc.duration,'$.duration',.1,CINEMATIC_LIMITS.duration);
  if(!references.catalog?.revision||doc.catalogRevision!==references.catalog.revision)add('$.catalogRevision','Catalog revision differs from the current project');
  if(object(doc.anchor,['position','rotation'],'$.anchor')){vector(doc.anchor.position,'$.anchor.position');rotation(doc.anchor.rotation,'$.anchor.rotation');}
  const actors=array(doc.actors,'$.actors',CINEMATIC_LIMITS.actors),actorById=new Map(),catalogEntries=references.catalog?.entries??[],definitions=references.actorDefinitions??{};
  for(const [i,actor]of actors.entries()){
    const p='$.actors['+i+']';if(!object(actor,['actorId','assetId','assetVersion','contentHash','actorDefinitionId','instanceId','position','rotation','scale'],p))continue;
    id(actor.actorId,p+'.actorId');if(actorById.has(actor.actorId))add(p+'.actorId','Duplicate actor ID');actorById.set(actor.actorId,actor);
    id(actor.assetId,p+'.assetId');string(actor.assetVersion,p+'.assetVersion',200);vector(actor.position,p+'.position');rotation(actor.rotation,p+'.rotation');number(actor.scale,p+'.scale',.1,10);
    const entry=catalogEntries.find(e=>e.assetId===actor.assetId&&e.version===actor.assetVersion);if(!entry)add(p+'.assetVersion','Unknown asset/version reference');
    if(actor.contentHash!==undefined&&actor.contentHash!==entry?.contentHash)add(p+'.contentHash','Asset content hash differs from the catalog');
    const definition=definitions instanceof Map?definitions.get(actor.actorDefinitionId):definitions[actor.actorDefinitionId];
    if(actor.actorDefinitionId!==undefined&&(!definition||definition.assetId!==actor.assetId||definition.assetVersion!==actor.assetVersion))add(p+'.actorDefinitionId','Unknown or mismatched actor definition');
    if(entry?.geometry.skinned&&!definition)add(p+'.actorDefinitionId','Animated actors require a registered actor definition');
    if(!entry?.geometry.skinned&&!entry?.placement.supported&&actor.instanceId===undefined)add(p+'.assetId','Static visual must be a certified prop or an existing map instance');
    if(actor.instanceId!==undefined){id(actor.instanceId,p+'.instanceId');if(!new Set(references.instanceIds??[]).has(actor.instanceId))add(p+'.instanceId','Unknown existing instance reference');}
  }
  const shotIds=new Set(),shots=array(doc.shots,'$.shots',CINEMATIC_LIMITS.shots);
  const camera=(value,path)=>{
    if(!object(value,['position','target','fov'],path))return;vector(value.position,path+'.position');vector(value.target,path+'.target');number(value.fov,path+'.fov',.1,2.8);
    if(Array.isArray(value.position)&&Array.isArray(value.target)&&value.position.length===3&&value.target.length===3&&Math.hypot(...value.position.map((v,i)=>v-value.target[i]))<.001)add(path+'.target','Look-at target must differ from camera position');
  };
  if(!shots.length)add('$.shots','At least one camera shot is required');
  for(const [i,shot]of shots.entries()){
    const p='$.shots['+i+']';if(!object(shot,['shotId','start','end','interpolation','from','to'],p))continue;
    id(shot.shotId,p+'.shotId');if(shotIds.has(shot.shotId))add(p+'.shotId','Duplicate shot ID');shotIds.add(shot.shotId);interval(shot,p);interpolation(shot.interpolation,p+'.interpolation');camera(shot.from,p+'.from');camera(shot.to,p+'.to');
    if(shot.start!==(i?shots[i-1]?.end:0))add(p+'.start','Camera shots must be ordered, contiguous and start at0');
  }
  if(shots.length&&shots.at(-1)?.end!==doc.duration)add('$.shots','Last shot must end at document duration');
  if(!object(doc.tracks,['transforms','animations','subtitles','audio','events'],'$.tracks'))return {valid:false,errors};
  const knownActor=(value,path)=>{if(!actorById.has(value))add(path,'Unknown actor ID');};
  const transformActors=new Set();let keyCount=0;
  for(const [i,track]of array(doc.tracks.transforms,'$.tracks.transforms',CINEMATIC_LIMITS.transforms).entries()){
    const p='$.tracks.transforms['+i+']';if(!object(track,['actorId','keys'],p))continue;knownActor(track.actorId,p+'.actorId');
    if(transformActors.has(track.actorId))add(p+'.actorId','One transform track per actor');transformActors.add(track.actorId);
    const keys=array(track.keys,p+'.keys',CINEMATIC_LIMITS.keys);keyCount+=keys.length;
    keys.forEach((key,j)=>{const k=p+'.keys['+j+']';if(!object(key,['time','position','rotation','scale','interpolation'],k))return;time(key.time,k+'.time');vector(key.position,k+'.position');rotation(key.rotation,k+'.rotation');number(key.scale,k+'.scale',.1,10);interpolation(key.interpolation,k+'.interpolation');if(j&&key.time<=keys[j-1]?.time)add(k+'.time','Key times must increase strictly');});
  }
  if(keyCount>CINEMATIC_LIMITS.keys)add('$.tracks.transforms','Too many total transform keys');
  const animations=array(doc.tracks.animations,'$.tracks.animations',CINEMATIC_LIMITS.animations);
  for(const [i,track]of animations.entries()){
    const p='$.tracks.animations['+i+']';if(!object(track,['actorId','start','end','clipId','clipStart','clipEnd','loop','blendIn','blendOut'],p))continue;knownActor(track.actorId,p+'.actorId');interval(track,p);string(track.clipId,p+'.clipId',160);
    const actor=actorById.get(track.actorId),entry=catalogEntries.find(e=>e.assetId===actor?.assetId&&e.version===actor?.assetVersion),definition=definitions instanceof Map?definitions.get(actor?.actorDefinitionId):definitions[actor?.actorDefinitionId];
    const duration=entry?.geometry.clipDurations?.[track.clipId],allowed=Object.values(definition?.animation??{});
    if(!entry?.geometry.clipNames.includes(track.clipId)||(definition&&!allowed.includes(track.clipId)))add(p+'.clipId','Clip is not supported by the selected actor');
    number(track.clipStart,p+'.clipStart',0,Number.isFinite(duration)?duration:0);number(track.clipEnd,p+'.clipEnd',0,Number.isFinite(duration)?duration:0);
    if(!(track.clipEnd>track.clipStart))add(p+'.clipEnd','Clip end must follow clip start');if(typeof track.loop!=='boolean')add(p+'.loop','Expected boolean');
    number(track.blendIn,p+'.blendIn',0,Math.max(0,track.end-track.start));number(track.blendOut,p+'.blendOut',0,Math.max(0,track.end-track.start));
  }
  for(const actor of actors){if(!plain(actor))continue;const segments=animations.filter(a=>plain(a)&&a.actorId===actor.actorId);for(const point of segments.flatMap(a=>[a.start,a.end]))if(segments.filter(a=>a.start<=point&&a.end>point).length>2){add('$.tracks.animations','At most two clip segments may blend per actor');break;}}
  for(const [i,track]of array(doc.tracks.subtitles,'$.tracks.subtitles',CINEMATIC_LIMITS.subtitles).entries()){const p='$.tracks.subtitles['+i+']';if(object(track,['start','end','text'],p)){interval(track,p);string(track.text,p+'.text',1000);}}
  const audioIds=new Set(references.audioIds??[]);
  for(const [i,track]of array(doc.tracks.audio,'$.tracks.audio',CINEMATIC_LIMITS.audio).entries()){const p='$.tracks.audio['+i+']';if(object(track,['time','audioId','volume'],p)){time(track.time,p+'.time');if(!audioIds.has(track.audioId))add(p+'.audioId','Unknown audio ID');number(track.volume,p+'.volume',0,1);}}
  for(const [i,track]of array(doc.tracks.events,'$.tracks.events',CINEMATIC_LIMITS.events).entries()){const p='$.tracks.events['+i+']';if(object(track,['time','type','label'],p)){time(track.time,p+'.time');if(!CINEMATIC_EVENTS.includes(track.type))add(p+'.type','Event is not allowlisted');string(track.label,p+'.label',160);}}
  return errors.length?{valid:false,errors}:{valid:true,errors:[],document:doc};
}

const factor=(t,kind)=>kind==='step'?(t>=1?1:0):kind==='smooth'?t*t*(3-2*t):t;
const lerp=(a,b,t)=>a+(b-a)*t;
const vec=(a,b,t)=>a.map((n,i)=>lerp(n,b[i],t));
function quaternion(a,b,t){
  let dot=a.reduce((sum,v,i)=>sum+v*b[i],0);if(dot<0){b=b.map(v=>-v);dot=-dot;}
  const angle=Math.acos(clamp(dot,-1,1)),s=Math.sin(angle),out=s<.00001?vec(a,b,t):a.map((v,i)=>(v*Math.sin((1-t)*angle)+b[i]*Math.sin(t*angle))/s),length=Math.hypot(...out);
  return out.map(v=>v/length);
}
function multiplyQuaternion(a,b){const [x,y,z,w]=a,[X,Y,Z,W]=b;return [w*X+x*W+y*Z-z*Y,w*Y-x*Z+y*W+z*X,w*Z+x*Y-y*X+z*W,w*W-x*X-y*Y-z*Z];}
function rotate(q,p){const v=multiplyQuaternion(multiplyQuaternion(q,[...p,0]),[-q[0],-q[1],-q[2],q[3]]);return v.slice(0,3);}
function anchored(position,anchor){return rotate(anchor.rotation,position).map((v,i)=>v+anchor.position[i]);}

// Pure, absolute seconds: editor seek and game playback call this same sampler.
export function evaluateCinematic(document,time){
  const t=clamp(Number.isFinite(time)?time:0,0,document.duration),shot=document.shots.find(s=>t>=s.start&&t<s.end)??document.shots.findLast(s=>s.end<=t)??document.shots[0],u=factor(clamp((t-shot.start)/(shot.end-shot.start),0,1),shot.interpolation),anchor=document.anchor;
  const actors=document.actors.map(actor=>{
    let transform=actor;const keys=document.tracks.transforms.find(track=>track.actorId===actor.actorId)?.keys??[];
    if(keys.length&&t>=keys[0].time){
      const next=keys.findIndex(key=>key.time>t);if(next<0)transform=keys.at(-1);else{const a=keys[next-1],b=keys[next],f=factor((t-a.time)/(b.time-a.time),a.interpolation);transform={position:vec(a.position,b.position,f),rotation:quaternion(a.rotation,b.rotation,f),scale:lerp(a.scale,b.scale,f)};}
    }
    const animations=document.tracks.animations.filter(segment=>segment.actorId===actor.actorId&&t>=segment.start&&(t<segment.end||t===document.duration&&segment.end===document.duration)).map(segment=>{
      const elapsed=t-segment.start,range=segment.clipEnd-segment.clipStart,clipTime=segment.clipStart+(segment.loop?elapsed%range:Math.min(elapsed,range));
      const weight=Math.min(1,segment.blendIn?elapsed/segment.blendIn:1,segment.blendOut?(segment.end-t)/segment.blendOut:1);
      return {clipId:segment.clipId,time:clipTime,weight:Math.max(0,weight)};
    });
    const total=animations.reduce((sum,a)=>sum+a.weight,0);if(total)for(const a of animations)a.weight/=total;
    return {actorId:actor.actorId,position:anchored(transform.position,anchor),rotation:multiplyQuaternion(anchor.rotation,transform.rotation),scale:transform.scale,animations};
  });
  return {time:t,shotId:shot.shotId,camera:{position:anchored(vec(shot.from.position,shot.to.position,u),anchor),target:anchored(vec(shot.from.target,shot.to.target,u),anchor),fov:lerp(shot.from.fov,shot.to.fov,u)},actors,subtitles:document.tracks.subtitles.filter(s=>t>=s.start&&t<s.end).map(s=>({text:s.text,start:s.start,end:s.end}))};
}

export function cinematicEventsBetween(document,from,to){
  if(to<from)return [];
  return [...document.tracks.audio.map((cue,index)=>({...cue,kind:'audio',cueId:'audio:'+index})),...document.tracks.events.map((cue,index)=>({...cue,kind:'event',cueId:'event:'+index}))].filter(cue=>cue.time>from&&cue.time<=to).sort((a,b)=>a.time-b.time||a.cueId.localeCompare(b.cueId));
}

export function createCinematicDraft({catalogRevision,mapId='village',cutsceneId='neutral-development-shot',duration=6}={}){
  return {format:CINEMATIC_FORMAT,version:1,cutsceneId,mapId,catalogRevision,duration,anchor:{position:[0,0,0],rotation:[0,0,0,1]},actors:[],shots:[{shotId:'shot-1',start:0,end:duration,interpolation:'smooth',from:{position:[6,4,-6],target:[0,1,0],fov:.65},to:{position:[-6,3,-4],target:[0,1,0],fov:.65}}],tracks:{transforms:[],animations:[],subtitles:[{start:0,end:Math.min(3,duration),text:'중립 개발 샷 · 일반 플레이 자동 실행 없음'}],audio:[],events:[]}};
}

export class CinematicHistory{
  constructor(document,{references,limit=100}={}){this.references=references;this.limit=limit;this.past=[];this.future=[];this.current=this.checked(document);}
  checked(value){const result=validateCinematicDocument(value,this.references);if(!result.valid)throw Object.assign(new Error(result.errors.map(e=>e.path+': '+e.message).join('\n')),{errors:result.errors});return result.document;}
  get value(){return copy(this.current);}get canUndo(){return !!this.past.length;}get canRedo(){return !!this.future.length;}
  commit(value){const next=this.checked(value);if(JSON.stringify(next)===JSON.stringify(this.current))return this.value;this.past.push(this.current);if(this.past.length>this.limit)this.past.shift();this.current=next;this.future=[];return this.value;}
  undo(){if(this.canUndo){this.future.push(this.current);this.current=this.past.pop();}return this.value;}
  redo(){if(this.canRedo){this.past.push(this.current);this.current=this.future.pop();}return this.value;}
}

export function buildCinematicAiPrompt({request,document,references}){
  const definitions=references.actorDefinitions instanceof Map?[...references.actorDefinitions.values()]:Object.values(references.actorDefinitions??{}),selected=new Set(document.actors.map(a=>a.actorDefinitionId)),allowed=definitions.filter(d=>!selected.size||selected.has(d.actorDefinitionId)).map(d=>({actorDefinitionId:d.actorDefinitionId,assetId:d.assetId,assetVersion:d.assetVersion,clips:Object.values(d.animation)}));
  return ['Draft a MoonForest cinematic as JSON only. This is a request to the user’s chosen conversational AI; no API call or generation has already occurred.',String(request??''),'Preserve format/version/catalogRevision. Use seconds, metres, unit quaternions[x,y,z,w], FOV radians0.1–2.8. Shots cover[0,duration] contiguously. Return the same strict field structure as the document. No URLs, JS, eval, geometry, textures, new assets, rewards or quest events. Events may only be marker(time,type,label). Keep duration<=600, actors<=20; use only listed references. Animation ranges must fit authored clip durations.','Allowed actor references: '+JSON.stringify(allowed),'Allowed audio IDs: '+JSON.stringify([...(references.audioIds??[])]),'Allowed catalog clip durations: '+JSON.stringify(references.catalog.entries.filter(e=>allowed.some(d=>d.assetId===e.assetId&&d.assetVersion===e.version)).map(e=>({assetId:e.assetId,version:e.version,clipDurations:e.geometry.clipDurations}))),'Current editable draft/schema example:\n'+JSON.stringify(document,null,2)].join('\n\n');
}
