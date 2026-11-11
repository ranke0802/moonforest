export const CINEMATIC_FORMAT='moonforest-cinematic';
export const CINEMATIC_LIMITS=Object.freeze({bytes:512*1024,duration:600,actors:20,shots:128,transforms:40,keys:2048,animations:256,subtitles:128,audio:128,events:128});
export const CINEMATIC_EVENTS=Object.freeze(['marker']);
const maps=['village','great-plains','monster-forest','witch-cave'];
const copy=value=>structuredClone(value),clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export const CINEMATIC_INTERPOLATIONS=Object.freeze(['step','linear','smooth','ease-in','ease-out','ease-in-out','sine','smoother']);
const interpolations=CINEMATIC_INTERPOLATIONS;
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
  const interpolation=(value,path)=>{if(!interpolations.includes(value))add(path,'Unknown cinematic interpolation');};
  if(!object(doc,['format','version','cutsceneId','mapId','catalogRevision','duration','anchor','actors','shots','tracks','presentation','media'],'$'))return {valid:false,errors};
  if(doc.format!==CINEMATIC_FORMAT)add('$.format','Unsupported cinematic format');if(doc.version!==1)add('$.version','Unsupported schema version');
  id(doc.cutsceneId,'$.cutsceneId');if(!maps.includes(doc.mapId))add('$.mapId','Unknown map');number(doc.duration,'$.duration',.1,CINEMATIC_LIMITS.duration);
  const sourceCatalogRevision=doc.catalogRevision;
  if(references.migrateCatalogRevision===true&&typeof doc.catalogRevision==='string'&&/^[a-f0-9]{64}$/.test(doc.catalogRevision)&&references.catalog?.revision)doc.catalogRevision=references.catalog.revision;
  if(!references.catalog?.revision||doc.catalogRevision!==references.catalog.revision)add('$.catalogRevision','Catalog revision differs from the current project');
  if(object(doc.anchor,['position','rotation'],'$.anchor')){vector(doc.anchor.position,'$.anchor.position');rotation(doc.anchor.rotation,'$.anchor.rotation');}
  if(doc.presentation!==undefined&&object(doc.presentation,['fadeIn','fadeOut','sceneryDistance'],'$.presentation')){
    for(const key of ['fadeIn','fadeOut'])if(doc.presentation[key]!==undefined)number(doc.presentation[key],'$.presentation.'+key,0,Math.min(10,doc.duration));
    if(doc.presentation.sceneryDistance!==undefined){number(doc.presentation.sceneryDistance,'$.presentation.sceneryDistance',100,240);if(!Number.isInteger(doc.presentation.sceneryDistance))add('$.presentation.sceneryDistance','Expected an integer percentage');}
  }
  const localAudioIds=new Set();let mediaBytes=0;
  if(doc.media!==undefined&&object(doc.media,['audio'],'$.media'))for(const [i,item]of array(doc.media.audio,'$.media.audio',8).entries()){
    const p='$.media.audio['+i+']';if(!object(item,['assetId','name','mime','bytes','sha256','duration'],p))continue;
    if(typeof item.sha256!=='string'||!/^[a-f0-9]{64}$/.test(item.sha256)||item.assetId!=='local:'+item.sha256)add(p+'.assetId','Imported audio must use its SHA-256 identity');
    if(localAudioIds.has(item.assetId))add(p+'.assetId','Duplicate imported audio');localAudioIds.add(item.assetId);string(item.name,p+'.name',160);if(!['audio/mpeg','audio/wav','audio/x-wav','audio/ogg','audio/mp4','audio/flac','audio/webm','audio/aac'].includes(item.mime))add(p+'.mime','Unsupported audio MIME type');number(item.bytes,p+'.bytes',1,16*1024*1024);if(!Number.isInteger(item.bytes))add(p+'.bytes','Expected whole bytes');mediaBytes+=item.bytes;number(item.duration,p+'.duration',.001,600);
  }
  if(mediaBytes>64*1024*1024)add('$.media.audio','Imported audio exceeds64MiB');
  const actors=array(doc.actors,'$.actors',CINEMATIC_LIMITS.actors),actorById=new Map(),catalogEntries=references.catalog?.entries??[],definitions=references.actorDefinitions??{};
  for(const [i,actor]of actors.entries()){
    const p='$.actors['+i+']';if(!object(actor,['actorId','assetId','assetVersion','contentHash','actorDefinitionId','instanceId','position','rotation','scale','start','end','mapId'],p))continue;
    id(actor.actorId,p+'.actorId');if(actorById.has(actor.actorId))add(p+'.actorId','Duplicate actor ID');actorById.set(actor.actorId,actor);
    id(actor.assetId,p+'.assetId');string(actor.assetVersion,p+'.assetVersion',200);vector(actor.position,p+'.position');rotation(actor.rotation,p+'.rotation');number(actor.scale,p+'.scale',.1,10);
    const entry=catalogEntries.find(e=>e.assetId===actor.assetId&&e.version===actor.assetVersion);if(!entry)add(p+'.assetVersion','Unknown asset/version reference');
    if(actor.contentHash!==undefined&&actor.contentHash!==entry?.contentHash)add(p+'.contentHash','Asset content hash differs from the catalog');
    const definition=definitions instanceof Map?definitions.get(actor.actorDefinitionId):definitions[actor.actorDefinitionId];
    if(actor.actorDefinitionId!==undefined&&(!definition||definition.assetId!==actor.assetId||definition.assetVersion!==actor.assetVersion))add(p+'.actorDefinitionId','Unknown or mismatched actor definition');
    if(entry?.geometry.skinned&&!definition)add(p+'.actorDefinitionId','Animated actors require a registered actor definition');
    if(!entry?.geometry.skinned&&!entry?.placement.supported&&actor.instanceId===undefined&&definition?.encounterType!=='cinematic-visual')add(p+'.assetId','Static visual requires a cinematic visual definition or certified prop');
    if(actor.start!==undefined)time(actor.start,p+'.start');if(actor.end!==undefined)time(actor.end,p+'.end');if((actor.end??doc.duration)<=(actor.start??0))add(p+'.end','Actor exit must follow entrance');if(actor.mapId!==undefined&&!maps.includes(actor.mapId))add(p+'.mapId','Unknown actor background');
    if(actor.instanceId!==undefined){id(actor.instanceId,p+'.instanceId');if(!new Set(references.instanceIds??[]).has(actor.instanceId)&&references.deferInstanceResolution!==true&&!new Set(references.deferredInstanceIds??[]).has(actor.instanceId))add(p+'.instanceId','Unknown existing instance reference');}
  }
  const shotIds=new Set(),shots=array(doc.shots,'$.shots',CINEMATIC_LIMITS.shots);
  const camera=(value,path)=>{
    if(!object(value,['position','target','fov'],path))return;vector(value.position,path+'.position');vector(value.target,path+'.target');number(value.fov,path+'.fov',.1,2.8);
    if(Array.isArray(value.position)&&Array.isArray(value.target)&&value.position.length===3&&value.target.length===3&&Math.hypot(...value.position.map((v,i)=>v-value.target[i]))<.001)add(path+'.target','Look-at target must differ from camera position');
  };
  if(!shots.length)add('$.shots','At least one camera shot is required');
  for(const [i,shot]of shots.entries()){
    const p='$.shots['+i+']';if(!object(shot,['shotId','start','end','interpolation','from','to','lookAtActorId','lookAtOffset','movement','orbitTurns','interpolationEnd'],p))continue;
    id(shot.shotId,p+'.shotId');if(shotIds.has(shot.shotId))add(p+'.shotId','Duplicate shot ID');shotIds.add(shot.shotId);interval(shot,p);interpolation(shot.interpolation,p+'.interpolation');camera(shot.from,p+'.from');camera(shot.to,p+'.to');
    if(shot.lookAtActorId!==undefined){id(shot.lookAtActorId,p+'.lookAtActorId');if(!actorById.has(shot.lookAtActorId))add(p+'.lookAtActorId','Unknown camera-follow actor');}
    if(shot.lookAtOffset!==undefined){vector(shot.lookAtOffset,p+'.lookAtOffset');if(shot.lookAtActorId===undefined)add(p+'.lookAtOffset','Camera-follow offset requires an actor');}
    if(shot.movement!==undefined&&!['linear','orbit'].includes(shot.movement))add(p+'.movement','Unknown camera movement');if(shot.orbitTurns!==undefined){number(shot.orbitTurns,p+'.orbitTurns',-2,2);if(shot.movement!=='orbit')add(p+'.orbitTurns','Orbit turns require orbit movement');}
    if(shot.interpolationEnd!==undefined)number(shot.interpolationEnd,p+'.interpolationEnd',1e-12,1);
    if(shot.start!==(i?shots[i-1]?.end:0))add(p+'.start','Camera shots must be ordered, contiguous and start at0');
  }
  if(shots.length&&shots.at(-1)?.end!==doc.duration)add('$.shots','Last shot must end at document duration');
  if(!object(doc.tracks,['transforms','animations','subtitles','audio','events','backgrounds'],'$.tracks'))return {valid:false,errors};
  if(doc.tracks.backgrounds!==undefined){const rows=array(doc.tracks.backgrounds,'$.tracks.backgrounds',32);for(const [i,row]of rows.entries()){const p='$.tracks.backgrounds['+i+']';if(!object(row,['time','mapId','transition','fadeDuration','anchor'],p))continue;time(row.time,p+'.time');if(!maps.includes(row.mapId))add(p+'.mapId','Unknown background map');if(!['cut','fade'].includes(row.transition))add(p+'.transition','Expected cut or fade');number(row.fadeDuration,p+'.fadeDuration',0,5);if(i===0&&(row.time!==0||row.mapId!==doc.mapId))add(p+'.time','First background must be the initial map at0');if(i&&row.time<=rows[i-1]?.time)add(p+'.time','Background times must increase');if(row.time===doc.duration)add(p+'.time','Background must begin before the end');if(row.anchor!==undefined&&object(row.anchor,['position','rotation'],p+'.anchor')){vector(row.anchor.position,p+'.anchor.position');rotation(row.anchor.rotation,p+'.anchor.rotation');}}}
  const knownActor=(value,path)=>{if(!actorById.has(value))add(path,'Unknown actor ID');};
  const transformActors=new Set();let keyCount=0;
  for(const [i,track]of array(doc.tracks.transforms,'$.tracks.transforms',CINEMATIC_LIMITS.transforms).entries()){
    const p='$.tracks.transforms['+i+']';if(!object(track,['actorId','keys','orientToPath'],p))continue;knownActor(track.actorId,p+'.actorId');
    if(track.orientToPath!==undefined&&typeof track.orientToPath!=='boolean')add(p+'.orientToPath','Expected boolean');
    if(transformActors.has(track.actorId))add(p+'.actorId','One transform track per actor');transformActors.add(track.actorId);
    const keys=array(track.keys,p+'.keys',CINEMATIC_LIMITS.keys);keyCount+=keys.length;
    keys.forEach((key,j)=>{const k=p+'.keys['+j+']';if(!object(key,['time','position','rotation','scale','interpolation','interpolationEnd'],k))return;time(key.time,k+'.time');vector(key.position,k+'.position');rotation(key.rotation,k+'.rotation');number(key.scale,k+'.scale',.1,10);interpolation(key.interpolation,k+'.interpolation');if(key.interpolationEnd!==undefined)number(key.interpolationEnd,k+'.interpolationEnd',1e-12,1);if(j&&key.time<=keys[j-1]?.time)add(k+'.time','Key times must increase strictly');});
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
  for(const [i,track]of array(doc.tracks.subtitles,'$.tracks.subtitles',CINEMATIC_LIMITS.subtitles).entries()){const p='$.tracks.subtitles['+i+']';if(object(track,['start','end','text','placement','position','effect'],p)){interval(track,p);string(track.text,p+'.text',1000);if(track.placement!==undefined&&!['bottom','center'].includes(track.placement))add(p+'.placement','Expected bottom or center');if(track.position!==undefined&&object(track.position,['x','y'],p+'.position')){number(track.position.x,p+'.position.x',0,100);number(track.position.y,p+'.position.y',0,100);}if(track.effect!==undefined&&object(track.effect,['enter','exit','inDuration','outDuration','charsPerSecond'],p+'.effect')){const effect=track.effect;if(!['none','fade','slide-up','slide-left','zoom','typewriter'].includes(effect.enter))add(p+'.effect.enter','Unknown entrance effect');if(!['none','fade','slide-down','zoom'].includes(effect.exit))add(p+'.effect.exit','Unknown exit effect');number(effect.inDuration,p+'.effect.inDuration',0,Math.max(0,track.end-track.start));number(effect.outDuration,p+'.effect.outDuration',0,Math.max(0,track.end-track.start));if(effect.charsPerSecond!==undefined)number(effect.charsPerSecond,p+'.effect.charsPerSecond',1,120);}}}
  const audioIds=new Set([...(references.audioIds??[]),...localAudioIds]);
  for(const [i,track]of array(doc.tracks.audio,'$.tracks.audio',CINEMATIC_LIMITS.audio).entries()){const p='$.tracks.audio['+i+']';if(object(track,['time','audioId','volume','end','loop','clipStart','fadeIn','fadeOut','kind'],p)){time(track.time,p+'.time');if(!audioIds.has(track.audioId))add(p+'.audioId','Unknown audio ID');number(track.volume,p+'.volume',0,1);if(track.end!==undefined){time(track.end,p+'.end');if(track.end<=track.time)add(p+'.end','Audio end must follow start');}if(track.loop!==undefined&&typeof track.loop!=='boolean')add(p+'.loop','Expected boolean');if(track.clipStart!==undefined)number(track.clipStart,p+'.clipStart',0,600);for(const key of ['fadeIn','fadeOut'])if(track[key]!==undefined)number(track[key],p+'.'+key,0,Math.min(10,(track.end??doc.duration)-track.time));if(track.kind!==undefined&&!['music','effect','ambience'].includes(track.kind))add(p+'.kind','Unknown audio track kind');}}
  for(const [i,track]of array(doc.tracks.events,'$.tracks.events',CINEMATIC_LIMITS.events).entries()){const p='$.tracks.events['+i+']';if(object(track,['time','type','label'],p)){time(track.time,p+'.time');if(!CINEMATIC_EVENTS.includes(track.type))add(p+'.type','Event is not allowlisted');string(track.label,p+'.label',160);}}
  return errors.length?{valid:false,errors}:{valid:true,errors:[],document:doc,...(sourceCatalogRevision!==doc.catalogRevision?{sourceCatalogRevision}:{})};
}

const factor=(t,kind)=>kind==='step'?(t>=1?1:0):kind==='smooth'?t*t*(3-2*t):kind==='ease-in'?t*t*t:kind==='ease-out'?1-(1-t)**3:kind==='ease-in-out'?(t<.5?4*t*t*t:1-(-2*t+2)**3/2):kind==='sine'?(1-Math.cos(Math.PI*t))/2:kind==='smoother'?t*t*t*(t*(t*6-15)+10):t;
export function cinematicInterpolationFactor(t,kind,end=1){const final=factor(end,kind);return final?factor(clamp(t,0,1)*end,kind)/final:0;}
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

// Cinematic paths are explicit authored transforms, independent of game AI.
// Hold the previous heading during stationary spans; choose the next heading
// only when no earlier movement exists. The asset's native facing stays in its
// existing model adapter, below this world-space actor transform.
function pathRotation(keys,time,fallback){
  if(keys.length<2||time<keys[0].time)return fallback;
  let index=keys.findIndex(key=>key.time>time)-1;if(index<0)index=keys.length-2;
  const direction=i=>{const a=keys[i]?.position,b=keys[i+1]?.position;if(!a||!b)return null;const x=b[0]-a[0],z=b[2]-a[2];return Math.hypot(x,z)>1e-7?Math.atan2(x,z):null;};
  let yaw=direction(index);for(let i=index-1;yaw===null&&i>=0;i--)yaw=direction(i);for(let i=index+1;yaw===null&&i<keys.length-1;i++)yaw=direction(i);
  return yaw===null?fallback:[0,Math.sin(yaw/2),0,Math.cos(yaw/2)];
}

export function cinematicBackgroundAt(document,time){
  const t=clamp(Number.isFinite(time)?time:0,0,document.duration),row=document.tracks.backgrounds?.findLast(row=>row.time<=t);
  return {time:row?.time??0,mapId:row?.mapId??document.mapId,anchor:row?.anchor??document.anchor,transition:row?.transition??'cut',fadeDuration:row?.fadeDuration??0};
}
export function cinematicSubtitlePresentation(cue,time){
  const e=cue.effect,elapsed=Math.max(0,time-cue.start),remaining=Math.max(0,cue.end-time),a=e.inDuration?clamp(elapsed/e.inDuration,0,1):1,b=e.outDuration?clamp(remaining/e.outDuration,0,1):1;
  const result={opacity:1,offsetX:0,offsetY:0,scale:1,text:cue.text};
  if(e.enter!=='none'&&e.enter!=='typewriter')result.opacity*=a;if(e.exit!=='none')result.opacity*=b;
  if(e.enter==='slide-up')result.offsetY+=40*(1-a);if(e.enter==='slide-left')result.offsetX-=60*(1-a);if(e.enter==='zoom')result.scale*=.6+.4*a;
  if(e.exit==='slide-down')result.offsetY+=40*(1-b);if(e.exit==='zoom')result.scale*=.6+.4*b;
  if(e.enter==='typewriter')result.text=[...cue.text].slice(0,Math.floor(elapsed*(e.charsPerSecond??30))).join('');return result;
}
export function cinematicPresentationAt(document,time){
  const t=clamp(time,0,document.duration),p=document.presentation??{};let blackOpacity=0;
  if(p.fadeIn&&t<p.fadeIn)blackOpacity=Math.max(blackOpacity,1-t/p.fadeIn);if(p.fadeOut&&t>document.duration-p.fadeOut)blackOpacity=Math.max(blackOpacity,(t-document.duration+p.fadeOut)/p.fadeOut);
  for(const row of document.tracks.backgrounds??[]){if(row.time===0||row.transition!=='fade'||!row.fadeDuration)continue;const half=row.fadeDuration/2,distance=Math.abs(t-row.time);if(distance<half)blackOpacity=Math.max(blackOpacity,1-distance/half);}
  return {blackOpacity:clamp(blackOpacity,0,1),...(p.sceneryDistance!==undefined?{sceneryDistance:p.sceneryDistance}:{})};
}
// Pure, absolute seconds: editor seek and game playback call this same sampler.
export function evaluateCinematic(document,time){
  const t=clamp(Number.isFinite(time)?time:0,0,document.duration),shot=document.shots.find(s=>t>=s.start&&t<s.end)??document.shots.findLast(s=>s.end<=t)??document.shots[0],u=cinematicInterpolationFactor((t-shot.start)/(shot.end-shot.start),shot.interpolation,shot.interpolationEnd),background=cinematicBackgroundAt(document,t),anchor=background.anchor;
  const actors=document.actors.map(actor=>{
    let transform=actor;const track=document.tracks.transforms.find(track=>track.actorId===actor.actorId),keys=track?.keys??[];
    if(keys.length&&t>=keys[0].time){
      const next=keys.findIndex(key=>key.time>t);if(next<0)transform=keys.at(-1);else{const a=keys[next-1],b=keys[next],f=cinematicInterpolationFactor((t-a.time)/(b.time-a.time),a.interpolation,a.interpolationEnd);transform={position:vec(a.position,b.position,f),rotation:quaternion(a.rotation,b.rotation,f),scale:lerp(a.scale,b.scale,f)};}
    }
    const animations=document.tracks.animations.filter(segment=>segment.actorId===actor.actorId&&t>=segment.start&&(t<segment.end||t===document.duration&&segment.end===document.duration)).map(segment=>{
      const elapsed=t-segment.start,range=segment.clipEnd-segment.clipStart,clipTime=segment.clipStart+(segment.loop?elapsed%range:Math.min(elapsed,range));
      const weight=Math.min(1,segment.blendIn?elapsed/segment.blendIn:1,segment.blendOut?(segment.end-t)/segment.blendOut:1);
      return {clipId:segment.clipId,time:clipTime,weight:Math.max(0,weight)};
    });
    const total=animations.reduce((sum,a)=>sum+a.weight,0);if(total)for(const a of animations)a.weight/=total;
    const scopedMap=actor.mapId??(actor.instanceId?document.mapId:null),visible=t>=(actor.start??0)&&(t<(actor.end??document.duration)||t===document.duration&&(actor.end??document.duration)===document.duration)&&(!scopedMap||scopedMap===background.mapId);
    return {actorId:actor.actorId,position:anchored(transform.position,anchor),rotation:multiplyQuaternion(anchor.rotation,track?.orientToPath?pathRotation(keys,t,transform.rotation):transform.rotation),scale:transform.scale,animations,...(actor.start!==undefined||actor.end!==undefined||actor.mapId!==undefined||document.tracks.backgrounds?.length?{visible}:{})};
  });
  let localPosition=vec(shot.from.position,shot.to.position,u);const localTarget=vec(shot.from.target,shot.to.target,u);
  if(shot.movement==='orbit'){const a=shot.from.position.map((v,i)=>v-shot.from.target[i]),b=shot.to.position.map((v,i)=>v-shot.to.target[i]),start=Math.atan2(a[0],a[2]),end=Math.atan2(b[0],b[2]),delta=((end-start+Math.PI*3)%(Math.PI*2)-Math.PI)+(shot.orbitTurns??0)*Math.PI*2,angle=start+delta*u,radius=lerp(Math.hypot(a[0],a[2]),Math.hypot(b[0],b[2]),u);localPosition=[localTarget[0]+Math.sin(angle)*radius,localTarget[1]+lerp(a[1],b[1],u),localTarget[2]+Math.cos(angle)*radius];}
  const position=anchored(localPosition,anchor),target=anchored(localTarget,anchor),follow=actors.find(actor=>actor.actorId===shot.lookAtActorId&&actor.visible!==false);
  if(follow){const offset=rotate(anchor.rotation,shot.lookAtOffset??[0,1,0]),next=follow.position.map((value,i)=>value+offset[i]);if(Math.hypot(...position.map((value,i)=>value-next[i]))>=.001){if(shot.movement==='orbit')for(let i=0;i<3;i++)position[i]+=next[i]-target[i];target.splice(0,3,...next);}}
  if(Math.hypot(...position.map((value,i)=>value-target[i]))<.001)target[2]+=.01;
  return {time:t,shotId:shot.shotId,camera:{position,target,fov:lerp(shot.from.fov,shot.to.fov,u)},actors,subtitles:document.tracks.subtitles.filter(s=>t>=s.start&&(t<s.end||t===document.duration&&s.end===document.duration)).map(s=>({text:s.text,start:s.start,end:s.end,...(s.placement?{placement:s.placement}:{}),...(s.position?{position:{x:s.position.x,y:s.position.y}}:{}),...(s.effect?{presentation:cinematicSubtitlePresentation(s,t)}:{})})),...(document.tracks.backgrounds?.length?{background}:{}),...(document.presentation||document.tracks.backgrounds?.some(row=>row.transition==='fade')?{presentation:cinematicPresentationAt(document,t)}:{})};
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
