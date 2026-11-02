import test from 'node:test';
import assert from 'node:assert/strict';
import {createMapTransition} from '../src/map-transition.js';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
async function until(check){for(let i=0;i<30;i++){if(check())return;await Promise.resolve();}assert.fail('transition stage not reached');}

test('transition diagnostics show the actual pending stage and elapsed time without touching callbacks or graphics',async()=>{
 let time=0;const frames=[],release=deferred(),load=deferred(),finish=deferred(),events=[],t=createMapTransition({now:()=>time,prepare(){events.push('prepare');},frame:()=>new Promise(r=>frames.push(r)),release:()=>release.promise,load:()=>load.promise,finish:()=>finish.promise});
 assert.equal(t.inspect().phase,'idle');const job=t.travel('forest');assert.equal(t.inspect().phase,'curtain');time=20;assert.equal(t.inspect().stageElapsedMs,20);assert.equal(t.inspect().totalElapsedMs,20);assert.equal(t.recover(),false);
 frames.shift()();await until(()=>frames.length);frames.shift()();await until(()=>t.inspect().phase==='release');time=35;assert.equal(t.inspect().stageElapsedMs,15);
 release.resolve();await until(()=>t.inspect().phase==='load');time=50;assert.equal(t.inspect().stageElapsedMs,15);load.resolve();await until(()=>t.inspect().phase==='finish');time=60;finish.resolve();assert.equal(await job,true);
 const snapshot=t.inspect();assert.equal(snapshot.phase,'complete');assert.equal(snapshot.busy,false);assert.equal(snapshot.totalElapsedMs,60);time=500;assert.deepEqual(t.inspect(),snapshot,'complete times are frozen rather than increasing while settings are open');assert.deepEqual(events,['prepare']);
});

for(const failing of ['release','load','finish'])test('failed '+failing+' releases busy but keeps its error until explicit successful-reload recovery',async()=>{
 let fail=true,time=0;const t=createMapTransition({now:()=>++time,prepare(){},frame:async()=>{},release:async()=>{if(fail&&failing==='release')throw Error('lost release');},load:async()=>{if(fail&&failing==='load')throw Error('lost load');},finish:async()=>{if(fail&&failing==='finish')throw Error('lost finish');},onError(){}});
 assert.equal(await t.travel('forest'),false);const failed=t.inspect();assert.equal(failed.phase,'error');assert.equal(failed.busy,false);assert.equal(failed.failed,true);assert.equal(failed.lastFailure.phase,failing);assert.equal(failed.lastFailure.recovered,false);assert.equal(await t.travel('forest'),false,'no automatic retry from a partial map');
 const copy=t.inspect();copy.lastFailure.phase='mutated';assert.equal(t.inspect().lastFailure.phase,failing,'copied diagnostics cannot change state');
 assert.equal(t.recover(),true);assert.equal(t.failed,false);assert.equal(t.inspect().lastError,null);assert.equal(t.inspect().phase,'idle');assert.equal(t.inspect().lastFailure.phase,failing);assert.equal(t.inspect().lastFailure.recovered,true);fail=false;assert.equal(await t.travel('forest'),true);assert.equal(t.inspect().lastFailure.phase,failing,'previous failure remains explicitly historical after later success');
});

test('only explicit retries reuse the failed destination, preserve timeout diagnostics and reject duplicate requests',async()=>{
 const targets=[],held=deferred();let attempts=0;
 const timeout=()=>Object.assign(Error('맵 모델 준비 시간이 초과되었습니다.'),{name:'TimeoutError',code:'MAP_MODEL_TIMEOUT',timeoutMs:45000,stage:'model',assetId:'cave-derived-laboratory-rock',level:2});
 const t=createMapTransition({prepare(){},frame:async()=>{},release:async()=>{},load:async url=>{targets.push(url);if(++attempts<3)throw timeout();await held.promise;},finish:async()=>{},onError(){}});
 assert.equal(await t.retry(),false);assert.equal(await t.travel('cave-destination'),false);assert.equal(t.inspect().retryAvailable,true);assert.equal(t.inspect().lastFailure.timeoutMs,45000);assert.equal(t.inspect().lastFailure.operation,'model');assert.equal(t.inspect().lastFailure.assetId,'cave-derived-laboratory-rock');assert.equal(t.inspect().lastFailure.level,2);
 assert.equal(await t.travel('different-map'),false);assert.equal(attempts,1,'ordinary portal events cannot automatically recover a failed map');
 assert.equal(await t.retry(),false);assert.equal(t.inspect().retryCount,1);assert.equal(t.inspect().retryAvailable,true);assert.equal(t.inspect().lastFailure.recovered,false);
 const final=t.retry();await until(()=>targets.length===3);assert.equal(t.inspect().retryAvailable,false);assert.equal(await t.retry(),false);assert.equal(await t.travel('different-map'),false);
 held.resolve();assert.equal(await final,true);assert.deepEqual(targets,['cave-destination','cave-destination','cave-destination']);assert.equal(t.inspect().retryCount,2);assert.equal(t.inspect().lastFailure.code,'MAP_MODEL_TIMEOUT');assert.equal(t.inspect().lastFailure.recovered,true);assert.equal(t.inspect().retryAvailable,false);assert.equal(await t.retry(),false);
});
