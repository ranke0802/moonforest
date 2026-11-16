// Explicit snapshots only. Read bounded owner records/counters, never traverse
// scene meshes/textures or change population, cache or resource ownership.
const bytes=value=>Number.isFinite(value)&&value>=0?value:null;
const count=value=>Number.isSafeInteger(value)&&value>=0?value:0;
const sum=values=>values.reduce((total,value)=>total+(value??0),0);
const emptyOwner=()=>({entries:0,live:0,preparing:0,dormant:0,disposing:0,pendingOperations:0});
function populationOwner(snapshot){
 if(!snapshot)return {...emptyOwner(),limits:null,definitionReservationBytes:0,adapterEstimateBytes:0,unclassifiedEstimateBytes:0};
 const states=snapshot.states??{},actors=snapshot.actors??[];
 let definitionReservationBytes=0,adapterEstimateBytes=0,unclassifiedEstimateBytes=0;
 for(const actor of actors){const value=bytes(actor.estimatedBytes)??0;if(actor.estimateKind==='definition-reservation')definitionReservationBytes+=value;else if(actor.estimateKind==='adapter-estimate')adapterEstimateBytes+=value;else unclassifiedEstimateBytes+=value;}
 // Older adapters may provide only the aggregate. Keep its meaning unresolved.
 if(!actors.length)unclassifiedEstimateBytes=bytes(snapshot.estimatedBytes)??0;
 return {entries:count(snapshot.entries),live:count(states.active)+count(states.dying)+count(states.corpse),preparing:count(states.preparing),dormant:count(states.dormant)+count(states.recycle),disposing:count(states.disposing),pendingOperations:count(snapshot.pending),queued:count(snapshot.queued),limits:snapshot.limits??null,definitionReservationBytes,adapterEstimateBytes,unclassifiedEstimateBytes};
}
function manualOwner(battle){
 const actors=new Set([...(battle?.pool??[]),...(battle?.wolfPool??[]),...Object.values(battle?.regularWolves??{}).flatMap(entry=>entry.pool??[]),...(battle?.goblinPool??[]),...(battle?.elenaPool??[]),...(battle?.mourningPool??[])]);
 const result={...emptyOwner(),entries:actors.size,unprepared:0,sourceLoadsPending:0,trim:battle?.poolTrim?{...battle.poolTrim}:null};
 for(const actor of actors){if(actor.hiddenPreparationPending||actor.loading){result.preparing++;continue;}if(actor.active&&!actor.corpseGone)result.live++;else result.dormant++;if(!actor.assetPrepared)result.unprepared++;}
 const libraries=new Set([battle?.models,battle?.wolfModels,battle?.goblinModels,battle?.elenaModels,battle?.mourningModels,...Object.values(battle?.regularWolves??{}).map(entry=>entry.models)].filter(Boolean));
 for(const library of libraries)if(library.lifetime&&!library.lifetime.signal?.aborted)result.sourceLoadsPending++;
 result.pendingOperations=(battle?.loading?1:0)+(battle?.residentPendingPreparation?1:0)+(battle?.mourningWarmJob?1:0)+(battle?.manualTransformPreparation?1:0);
 return result;
}
function npcOwner(runtime,snapshot){
 const result={...emptyOwner(),entries:count(runtime?.records?.size??snapshot?.actors),pendingOperations:count(snapshot?.pending),sources:count(snapshot?.resources?.sources)};
 if(!runtime)return result;
 if(runtime.records?.values){for(const record of runtime.records.values())if(record.ready)result.live++;else result.preparing++;}
 else if(result.entries){result.live=null;result.preparing=null;result.dormant=null;}
 return result;
}
function cinematicOwner(snapshot){
 const host=snapshot?.host??snapshot;
 if(!host)return {...emptyOwner(),leased:0,reservationAndEstimateBytes:0};
 const pool=host.pool;
 return {entries:count(host.actors),live:host.active?null:0,preparing:Array.isArray(pool)?pool.filter(slot=>slot.busy&&!slot.warmed&&!slot.retiring).length:null,dormant:Array.isArray(pool)?pool.filter(slot=>!slot.busy&&!slot.retiring).length:null,disposing:Array.isArray(pool)?pool.filter(slot=>slot.retiring).length:null,leased:Array.isArray(pool)?pool.filter(slot=>slot.busy&&!slot.retiring).length:null,pendingOperations:count(host.pendingRetirements),reservationAndEstimateBytes:bytes(host.estimatedBytes),limits:host.limits??null,scope:'Owned animated/visual pool only; borrowed existing actors are counted by their original owners. Static cutscene placements and visibility of leased actors are not supplied by this counter.'};
}

export function inspectContentRuntimeBudget({world,battle,audio,playerTextureProfile,decodeCache}={}){
 const unavailable=[];
 const inspect=(owner,label)=>{if(!owner?.inspect)return null;try{return owner.inspect();}catch{unavailable.push(label);return null;}};
 const development=inspect(world?.developmentActors,'development'),authored=inspect(world?.authoredMonsters,'authored'),npc=inspect(world?.npcWorld,'npc'),cinematic=inspect(world?.developmentCinema,'cinematic'),effects=inspect(world?.effectWorld,'effects'),sound=inspect(audio,'audio');
 const owners={manual:manualOwner(battle),development:populationOwner(development?.population),authored:populationOwner(authored?.population),npc:npcOwner(world?.npcWorld,npc),cinematic:cinematicOwner(cinematic)};
 for(const label of unavailable)if(owners[label]&&label!=='npc')for(const key of ['entries','live','preparing','dormant','disposing'])owners[label][key]=null;
 const actorRows=Object.values(owners),cpuPayloads={sfxDecodedBytes:audio?bytes(sound?.decodedSfxBytes):0,bedsDecodedBytes:audio?bytes(sound?.decodedBedBytes):0,geometryDecodeCacheBytes:decodeCache===undefined?null:bytes(decodeCache?.geometry?.bytes)??0,textureDecodeCacheBytes:decodeCache===undefined?null:bytes(decodeCache?.textures?.bytes)??0};
 const environment=world?.environment,profile=playerTextureProfile;
 const gpuEstimates={playerTextureResidentBytes:bytes(profile?.estimatedGpuBytes),sceneryExtraResidentBytes:bytes(environment?.highTextureBytes),scope:'Profile estimates, not measured GPU allocations. Base scenery, actors and other textures are outside these fields.'};
 const reservations={sceneryExtraPendingBytes:bytes(environment?.highTextureReserved),sceneryExtraBudgetBytes:bytes(environment?.highTextureBudget),actorDefinitionBytes:sum([owners.development.definitionReservationBytes,owners.authored.definitionReservationBytes]),actorAdapterEstimateBytes:sum([owners.development.adapterEstimateBytes,owners.authored.adapterEstimateBytes]),actorUnclassifiedEstimateBytes:sum([owners.development.unclassifiedEstimateBytes,owners.authored.unclassifiedEstimateBytes]),cinematicMixedReservationAndEstimateBytes:owners.cinematic.reservationAndEstimateBytes,scope:'Existing owner admission accounting. Adapter estimates may include shared geometry; do not sum these fields into resident GPU/process memory.'};
 const unknown=['Manual clone/source GPU and CPU payload bytes','NPC source/clone payload bytes','Cinematic static placements, borrowed visibility and media buffers','Actor skin/morph/instance allocations beyond supplied estimates','Base scenery/terrain/sky/quest/item textures and geometry','Render targets/depth/MSAA, driver and decoder workspace','Total browser/process/GPU/device residency'];
 if(!profile)unknown.push('Player texture profile estimate not supplied');
 for(const [name,value]of Object.entries(cpuPayloads))if(value===null)unknown.push(name+' counter unavailable');
 if(owners.cinematic.live===null)unknown.push('Live visibility of cinematic leased pool actors');
 if(unavailable.length)unknown.push('Owner inspection unavailable: '+unavailable.join(', '));
 const liveKnown=actorRows.filter(row=>row.live!==null).reduce((total,row)=>total+row.live,0),preparingKnown=actorRows.filter(row=>row.preparing!==null).reduce((total,row)=>total+row.preparing,0),dormantKnown=actorRows.filter(row=>row.dormant!==null).reduce((total,row)=>total+row.dormant,0);
 return {version:1,mapId:world?.mapId??null,collection:'on-demand-owned-records-and-existing-counters',owners,
  counts:{knownOwnedActorEntries:sum(actorRows.map(row=>row.entries)),liveKnown,liveComplete:actorRows.every(row=>row.live!==null),preparingKnown,preparingComplete:actorRows.every(row=>row.preparing!==null),dormantKnown,dormantComplete:actorRows.every(row=>row.dormant!==null),vfxActiveBursts:world?.effectWorld?bytes(effects?.activeBursts):0,vfxActiveSlots:world?.effectWorld?bytes(effects?.activeSlots):0,vfxCapacity:world?.effectWorld?bytes(effects?.capacity):0},
  memory:{knownCpuPayloads:cpuPayloads,knownCpuPayloadSubtotalBytes:sum(Object.values(cpuPayloads)),knownCpuPayloadCoverageComplete:Object.values(cpuPayloads).every(value=>value!==null),gpuEstimates,reservations,unknown},
  admission:{combinedHardLimitEnforced:false,policy:'Observation only. Existing owner limits remain independent; no live actors, quality settings or LOD are changed.'},
  transfers:world?.resourceDownloadStats?{cumulativeDownloadedBytes:bytes(world.resourceDownloadStats.downloadBytes),cacheHits:count(world.resourceDownloadStats.cacheHits),scope:'Transfer counters, not current persistent-cache size or RAM/GPU residency.'}:null,
  measurement:'Owner activity counts include dying/corpse states until their owner recycles them; they are not rendered mesh counts. Cinematic preparation counts only busy unwarmed slots, so additional shader/visibility preparation may be unreported. Known owned entries exclude unreported static actors. Byte counters cover named CPU payloads only; estimates, reservations, downloads and unknowns are kept separate. No total-memory or supported-population claim.'};
}
