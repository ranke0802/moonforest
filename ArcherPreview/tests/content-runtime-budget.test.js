import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectContentRuntimeBudget} from '../src/content-runtime-budget.js';

test('combines owner activity without double counting battle development aliases or borrowed cutscene actors',()=>{
 const live={active:true,corpseGone:false,assetPrepared:true},idle={active:false,assetPrepared:true},preparing={active:false,hiddenPreparationPending:Promise.resolve()},authoredActor={active:true};
 const battle={pool:[live,idle],wolfPool:[preparing],regularWolves:{wolf:{pool:[live]}},developmentPool:[authoredActor],models:{lifetime:{signal:{aborted:false}}},loading:true};
 const population={entries:3,states:{active:1,preparing:1,dormant:1},pending:1,queued:0,limits:{total:20},actors:[{estimatedBytes:10,estimateKind:'definition-reservation'},{estimatedBytes:20,estimateKind:'adapter-estimate'},{estimatedBytes:30,estimateKind:'adapter-estimate'}]};
 const world={mapId:'village',authoredMonsters:{inspect:()=>({population})},npcWorld:{records:new Map([['ready',{ready:true}],['pending',{ready:false}]]),inspect:()=>({actors:2,pending:1,resources:{sources:1}})},developmentCinema:{inspect:()=>({host:{active:true,actors:3,estimatedBytes:90,pendingRetirements:1,pool:[{busy:true,warmed:true},{busy:false,warmed:true},{busy:false,retiring:true}]}})},effectWorld:{inspect:()=>({activeBursts:2,activeSlots:16,capacity:768})}};
 const report=inspectContentRuntimeBudget({world,battle,decodeCache:null});
 assert.equal(report.owners.manual.entries,3);assert.equal(report.owners.manual.live,1);assert.equal(report.owners.manual.preparing,1);assert.equal(report.owners.manual.dormant,1);assert.equal(report.owners.manual.sourceLoadsPending,1);
 assert.equal(report.owners.authored.live,1);assert.equal(report.owners.authored.preparing,1);assert.equal(report.owners.authored.dormant,1);assert.equal(report.owners.npc.live,1);assert.equal(report.owners.npc.preparing,1);
 assert.equal(report.owners.cinematic.live,null);assert.equal(report.owners.cinematic.leased,1);assert.equal(report.owners.cinematic.dormant,1);assert.equal(report.owners.cinematic.disposing,1);
 assert.equal(report.counts.knownOwnedActorEntries,11);assert.equal(report.counts.liveKnown,3);assert.equal(report.counts.liveComplete,false);assert.equal(report.counts.vfxActiveBursts,2);assert.equal(report.counts.vfxActiveSlots,16);
 assert.equal(report.memory.reservations.actorDefinitionBytes,10);assert.equal(report.memory.reservations.actorAdapterEstimateBytes,50);assert.equal(report.memory.reservations.cinematicMixedReservationAndEstimateBytes,90);
 assert.equal(report.admission.combinedHardLimitEnforced,false);assert.equal(battle.pool.length,2);assert.equal(battle.wolfPool[0],preparing);
});

test('keeps actual named CPU payload counters, GPU estimates, reservations and transfer bytes in separate scopes',()=>{
 const world={environment:{highTextureBytes:100,highTextureReserved:25,highTextureBudget:200},resourceDownloadStats:{downloadBytes:999999,cacheHits:4}};
 const report=inspectContentRuntimeBudget({world,audio:{inspect:()=>({decodedSfxBytes:40,decodedBedBytes:60})},decodeCache:{geometry:{bytes:80},textures:{bytes:90}},playerTextureProfile:{estimatedGpuBytes:1000}});
 assert.equal(report.memory.knownCpuPayloadSubtotalBytes,270);assert.equal(report.memory.knownCpuPayloadCoverageComplete,true);assert.equal(report.memory.gpuEstimates.playerTextureResidentBytes,1000);assert.equal(report.memory.gpuEstimates.sceneryExtraResidentBytes,100);assert.equal(report.memory.reservations.sceneryExtraPendingBytes,25);assert.equal(report.transfers.cumulativeDownloadedBytes,999999);
 assert.equal(report.memory.totalGpuBytes,undefined);assert.equal(report.memory.totalDeviceBytes,undefined);assert.ok(report.memory.unknown.some(value=>value.includes('driver')));
});

test('missing and failing owner counters remain explicit unknowns and do not trigger a scene scan',()=>{
 const world={authoredMonsters:{inspect(){throw Error('owner released');}}};Object.defineProperty(world,'scene',{get(){throw Error('Scene scans forbidden');}});
 const report=inspectContentRuntimeBudget({world,audio:{inspect:()=>({decodedSfxBytes:NaN})}});
 assert.equal(report.owners.authored.live,null);assert.equal(report.counts.liveComplete,false);assert.equal(report.memory.knownCpuPayloads.sfxDecodedBytes,null);assert.equal(report.memory.knownCpuPayloads.geometryDecodeCacheBytes,null);assert.equal(report.memory.knownCpuPayloadCoverageComplete,false);assert.ok(report.memory.unknown.some(value=>value.includes('authored')));
});

test('repeated snapshots retain no ownership state and a map release immediately reflects smaller dormant pools',()=>{
 const idle={active:false,assetPrepared:true},battle={pool:[idle]},world={mapId:'village'};
 const first=inspectContentRuntimeBudget({world,battle,decodeCache:null});battle.pool.length=0;world.mapId='witch-cave';const second=inspectContentRuntimeBudget({world,battle,decodeCache:null});
 assert.equal(first.owners.manual.dormant,1);assert.equal(second.owners.manual.dormant,0);assert.equal(second.mapId,'witch-cave');assert.equal(first.mapId,'village');assert.equal(first.owners.manual.entries,1);
});
