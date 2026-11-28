import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {AbstractMesh,FreeCamera,Frustum,MeshBuilder,NullEngine,Plane,Scene,SharpenPostProcess,TransformNode,Vector3} from '@babylonjs/core';
import {VillageOcclusion} from '../src/village-occlusion.js';
import {caveFogRootEnabled} from '../src/cave-fog-of-war.js';

const source=readFileSync(new URL('../src/village-occlusion.js',import.meta.url),'utf8').replaceAll('\r\n','\n');
const currentWarm=/        if\(!queryShaderReady\(renderer,g\.proxy,engine\)\)\{\n          renderer\.renderOcclusionBoundingBox\(g\.proxy\);\n          if\(!queryShaderReady\(renderer,g\.proxy,engine\)\)continue;\n        \}/;
assert.match(source,currentWarm,'production query warmup guard must exist');
const previous=source.replace(currentWarm,"        renderer.renderOcclusionBoundingBox(g.proxy);\n        if(!renderer._colorShaderForOcclusionQuery?.isReady(g.proxy,undefined,g.proxy.subMeshes[0]))continue;");
const LegacyOcclusion=Function('AbstractMesh','Frustum','MeshBuilder','Plane','Vector3','caveFogRootEnabled',previous.replace(/^import .*;\n/gm,'').replaceAll('export ','')+';return VillageOcclusion;')(AbstractMesh,Frustum,MeshBuilder,Plane,Vector3,caveFogRootEnabled);
const report=[];
const turn=()=>new Promise(resolve=>setImmediate(resolve));

function fixture(t,{Implementation=VillageOcclusion,clock={now:0},diagnostics,gameplayV03=false}={}){
  const engine=new NullEngine({renderWidth:800,renderHeight:400}),scene=new Scene(engine);engine.getCaps().supportOcclusionQuery=true;
  const camera=new FreeCamera('camera',new Vector3(13,5,-25),scene);camera.setTarget(new Vector3(13,1,0));camera.getViewMatrix();camera.getProjectionMatrix();scene.setTransformMatrix(camera.getViewMatrix(),camera.getProjectionMatrix());
  const records=[0,13,26].map((x,index)=>({placement:{id:'prop'+index,kind:'prop',x,z:0},min:new Vector3(x-1,0,-1),max:new Vector3(x+1,2,1),root:new TransformNode('root'+index,scene),cellActive:true,fogVisible:true,occluded:false}));
  const world={scene,camera,frameDiagnostics:diagnostics,gameplayV03},stats={},occlusion=new Implementation(world,records,stats),renderer=scene.getBoundingBoxRenderer();
  let active=null,next=0,canBegin=true;const draws=[],queries=[],events=[],deleted=[],renderCalls=[];
  const render=renderer.renderOcclusionBoundingBox.bind(renderer);renderer.renderOcclusionBoundingBox=mesh=>{renderCalls.push({query:active?.id??null});return render(mesh);};
  const draw=engine.drawElementsType.bind(engine);engine.drawElementsType=(...args)=>{draws.push({query:active?.id??null,pass:engine.currentRenderPassId,indexCount:args[2]});events.push('draw');return draw(...args);};
  engine.createQuery=()=>{const query={id:++next,available:false,visible:false};queries.push(query);return query;};
  engine.beginOcclusionQuery=(algorithm,query)=>{events.push('begin');if(!canBegin)return false;assert.equal(active,null);active=query;return true;};
  engine.endOcclusionQuery=()=>{events.push('end');assert.ok(active);active=null;};
  engine.isQueryResultAvailable=query=>query.available;
  engine.getQueryResult=query=>{assert.equal(query.available,true,'never read an unavailable query');return Number(query.visible);};
  engine.deleteQuery=query=>deleted.push(query.id);
  const warm=async()=>{
    for(const group of occlusion.groups){
      let ready=false;
      for(let attempt=0;attempt<100;attempt++){
        const before=draws.length;renderer.renderOcclusionBoundingBox(group.proxy);
        if(draws.length>before){ready=true;break;}await turn();
      }
      assert.equal(ready,true,'real SDK query material must finish compiling');
      // The legacy policy checked this unrelated wrapper after warming; prepare
      // it too so the paired steady-state test compares only redundant draws.
      for(let attempt=0;attempt<100&&!renderer._colorShaderForOcclusionQuery.isReady(group.proxy,undefined,group.proxy.subMeshes[0]);attempt++)await turn();
    }
    draws.length=0;events.length=0;
    for(let frame=0;frame<4;frame++)occlusion.beforeRender();
  };
  const state=()=>({epoch:occlusion.epoch,stableFrames:occlusion.stableFrames,stats:{...stats},groups:occlusion.groups.map(g=>({pending:g.pending,epoch:g.epoch,hiddenSamples:g.hiddenSamples,lastQuery:g.lastQuery,occluded:g.items.map(r=>r.occluded),enabled:g.items.map(r=>r.root.isEnabled())}))});
  const step=(time,{available=true,visible=false,move=false}={})=>{
    clock.now=time;for(const query of queries){query.available=available;query.visible=visible;}
    if(move){camera.position.x+=2;camera.setTarget(new Vector3(13,1,0));camera.getViewMatrix(true);scene.setTransformMatrix(camera.getViewMatrix(),camera.getProjectionMatrix());}
    occlusion.beforeRender();occlusion.afterRender();return state();
  };
  t.after(()=>{occlusion.dispose();engine.dispose();});
  return {engine,scene,camera,records,world,occlusion,renderer,stats,draws,queries,events,deleted,renderCalls,warm,step,state,denyBegin:()=>{canBegin=false;}};
}

test('ready native occlusion queries draw once instead of twice with identical query cadence and visibility',async t=>{
  const clock={now:0};t.mock.method(performance,'now',()=>clock.now);
  const old=fixture(t,{Implementation:LegacyOcclusion,clock}),current=fixture(t,{clock});await old.warm();await current.warm();
  for(let frame=0;frame<70;frame++){
    const time=frame*50,options={available:!(frame>=25&&frame<35),visible:frame%19>=14,move:frame===20};
    assert.deepEqual(current.step(time,options),old.step(time,options),'query result changed at frame '+frame);
  }
  const count=current.stats.occlusionQueries;assert.ok(count>10);assert.equal(old.stats.occlusionQueries,count);
  assert.equal(old.draws.length,count*2);assert.equal(current.draws.length,count);
  assert.equal(current.draws.filter(draw=>draw.query===null).length,0);assert.equal(old.draws.filter(draw=>draw.query===null).length,count);
  assert.equal(current.draws.every(draw=>draw.indexCount===36&&draw.pass===current.renderer._renderPassIdForOcclusionQuery),true);
  report.push({case:'native-ready-query-draws',queries:count,oldDraws:old.draws.length,currentDraws:current.draws.length,visibilityCadenceTimeoutAndEpochEqual:true,drawReductionPercent:50});
});

test('the 0.3 village skips offscreen proxy draws and resumes querying when the camera turns back',async t=>{
  const clock={now:0};t.mock.method(performance,'now',()=>clock.now);
  const baseline=fixture(t,{clock}),current=fixture(t,{clock});
  current.world.edition='moonforest-0.3';current.world.mapId='village';
  function position(f,x){
    f.camera.position.x=x;f.camera.setTarget(new Vector3(x,1,0));
    f.scene.setTransformMatrix(f.camera.getViewMatrix(true),f.camera.getProjectionMatrix());
  }
  for(const f of [baseline,current]){position(f,150);await f.warm();f.step(0);}
  assert.equal(baseline.stats.occlusionQueries,2);assert.equal(current.stats.occlusionQueries,0);
  assert.ok(current.records.every(r=>r.root.isEnabled()&&!r.occluded));
  position(current,13);
  for(let i=0;i<4;i++)current.step((i+1)*50,{visible:true});
  assert.equal(current.stats.occlusionQueries,2);
  assert.ok(current.records.every(r=>r.root.isEnabled()&&!r.occluded));
});

test('phone sharpen skips 0.3 village queries without scene depth and discards pending results',async t=>{
  const clock={now:0};t.mock.method(performance,'now',()=>clock.now);
  const f=fixture(t,{clock,gameplayV03:true});
  f.world.edition='moonforest-0.3';f.world.mapId='village';
  await f.warm();f.step(0,{available:false});
  const oldQueries=f.queries.slice(),draws=f.draws.length;
  assert.ok(oldQueries.length>0);
  const available=f.engine.isQueryResultAvailable;
  f.engine.isQueryResultAvailable=query=>{assert.ok(!oldQueries.includes(query),'discarded queries must never be polled');return available(query);};
  for(const r of f.records){r.occluded=true;r.root.setEnabled(false);}
  f.records[1].fogVisible=false;f.records[2].cellActive=false;
  const sharpen=new SharpenPostProcess('phone-sharpen',1,f.camera);
  for(let i=1;i<=5;i++)f.step(i*50);
  assert.equal(f.stats.occludedProps,0);
  assert.deepEqual(f.records.map(record=>record.root.isEnabled()),[true,false,false]);
  assert.ok(f.records.every(record=>!record.occluded));
  assert.deepEqual(f.deleted,oldQueries.map(query=>query.id));
  assert.equal(f.queries.length,oldQueries.length);
  assert.equal(f.draws.length,draws);
  assert.ok(f.occlusion.groups.every(group=>!group.pending&&group.query===null&&group.hiddenSamples===0));

  sharpen.dispose(f.camera);
  for(let i=6;i<=8;i++)f.step(i*50);
  assert.equal(f.queries.length,oldQueries.length,'wait for fresh stable frames after switching back');
  f.step(450);
  assert.equal(f.queries.length,oldQueries.length+1);
  assert.ok(f.draws.length>draws);
  f.step(500,{visible:true});
  assert.equal(f.records[0].root.isEnabled(),true);
});

test('unsharpened target and 0.2 keep their existing query path',async t=>{
  const clock={now:0};t.mock.method(performance,'now',()=>clock.now);
  const older=fixture(t,{clock}),current=fixture(t,{clock,gameplayV03:true});
  older.world.edition='moonforest-0.2';older.world.mapId='village';
  current.world.edition='moonforest-0.3';current.world.mapId='village';
  current.scene.postProcessesEnabled=false;
  for(const f of [older,current]){
    new SharpenPostProcess('phone-sharpen',1,f.camera);
    await f.warm();f.step(0);
    assert.equal(f.stats.occlusionQueries,2);
  }
});

test('a cold dedicated query pass cannot be approved by a ready ordinary scene pass',async t=>{
  const clock={now:0};t.mock.method(performance,'now',()=>clock.now);const f=fixture(t,{clock});await f.warm();
  const shader=f.renderer._colorShaderForOcclusionQuery,native=shader.isReady.bind(shader),pass=f.renderer._renderPassIdForOcclusionQuery,scenePass=f.engine.currentRenderPassId,checked=[];
  let queryReady=false;shader.isReady=(...args)=>{checked.push(f.engine.currentRenderPassId);return f.engine.currentRenderPassId===pass&&!queryReady?false:native(...args);};
  f.step(0);assert.equal(f.queries.length,0);assert.equal(f.draws.length,0);assert.equal(f.engine.currentRenderPassId,scenePass);assert.ok(checked.length>0);assert.ok(checked.every(value=>value===pass));
  assert.equal(f.records.every(record=>!record.occluded&&record.root.isEnabled()),true);
  queryReady=true;f.step(50);assert.equal(f.stats.occlusionQueries,2);assert.equal(f.draws.length,2);assert.equal(f.draws.some(draw=>draw.query===null),false);
  report.push({case:'query-pass-readiness',unreadyQueries:0,unreadyDraws:0,readyQueries:2,readyDraws:2,restoredScenePass:true});
});

test('fresh SDK initialization stays outside a query and begins only once the actual pass becomes ready',async t=>{
  const clock={now:0};t.mock.method(performance,'now',()=>clock.now);const f=fixture(t,{clock});
  for(let frame=0;frame<4;frame++)f.occlusion.beforeRender();
  assert.equal(f.renderer._colorShaderForOcclusionQuery,undefined);f.occlusion.afterRender();
  assert.equal(f.stats.occlusionQueries,0);assert.equal(f.records.every(record=>!record.occluded),true);
  for(let frame=0;frame<100&&f.stats.occlusionQueries===0;frame++){await turn();clock.now++;f.occlusion.afterRender();}
  assert.ok(f.stats.occlusionQueries>0);assert.equal(f.renderCalls[0].query,null,'the cold SDK initialization call stays outside a query');
  assert.equal(f.engine.currentRenderPassId,0);
  report.push({case:'native-cold-initialization',queriesBeforeReadiness:0,firstRendererInitializationOutsideQuery:true});
});

test('failed query admission and readiness exceptions fail open and restore the ordinary render pass',async t=>{
  const clock={now:0};t.mock.method(performance,'now',()=>clock.now);const f=fixture(t,{clock});await f.warm();f.denyBegin();f.step(0);
  assert.equal(f.draws.length,0);assert.equal(f.stats.occlusionQueries,0);assert.equal(f.occlusion.groups.some(group=>group.pending),false);
  const pass=f.engine.currentRenderPassId;for(const record of f.records){record.occluded=true;record.root.setEnabled(false);}
  f.renderer._colorShaderForOcclusionQuery.isReady=()=>{throw Error('lost shader');};f.occlusion.afterRender();
  assert.equal(f.engine.currentRenderPassId,pass);assert.equal(f.occlusion.disabled,true);assert.equal(f.records.every(record=>!record.occluded&&record.root.isEnabled()),true);
  report.push({case:'fail-open-and-pass-restore',failedAdmissionDraws:0,readinessExceptionRevealsAll:true});
});

test('optional observer diagnostics measure the entire callback in finally and disposal removes the observer',t=>{
  const calls=[],f=fixture(t,{diagnostics:{mark:()=>null,measure:(...args)=>calls.push(args)}});
  f.scene.onAfterRenderObservable.notifyObservers();assert.deepEqual(calls,[['sceneryOcclusionMs',null]]);
  f.occlusion.afterRender=()=>{throw Error('test callback');};assert.throws(()=>f.scene.onAfterRenderObservable.notifyObservers(),/test callback/);
  assert.deepEqual(calls.at(-1),['sceneryOcclusionMs',null]);f.occlusion.dispose();const count=calls.length;
  f.scene.onAfterRenderObservable.notifyObservers();assert.equal(calls.length,count);
  report.push({case:'observer-cost-lifetime',finallyMeasured:true,removedOnDispose:true,noPollingTimersAdded:true});
});

test('0.3 WebGL loss invalidates query handles and rebuilt proxy draws use new fill indices',async t=>{
  const clock={now:0};t.mock.method(performance,'now',()=>clock.now);
  const f=fixture(t,{clock,gameplayV03:true});await f.warm();f.step(0,{available:false});
  const previousQueries=new Set(f.queries),previousIndices=f.renderer._fillIndexBuffer;
  assert.ok(previousQueries.size>0);assert.ok(previousIndices);
  assert.ok(f.occlusion.groups.some(group=>group.pending));
  for(const record of f.records){record.occluded=true;record.root.setEnabled(false);}
  f.records[1].fogVisible=false;f.records[2].cellActive=false;
  f.stats.occludedProps=3;

  const isAvailable=f.engine.isQueryResultAvailable,begin=f.engine.beginOcclusionQuery;
  f.engine.isQueryResultAvailable=query=>{assert.ok(!previousQueries.has(query));return isAvailable(query);};
  f.engine.beginOcclusionQuery=(algorithm,query)=>{assert.ok(!previousQueries.has(query));return begin(algorithm,query);};
  const submissions=f.stats.occlusionQueries;
  f.engine.onContextLostObservable.notifyObservers(f.engine);
  assert.equal(f.renderer._fillIndexBuffer,null);
  assert.equal(f.stats.occludedProps,0);
  assert.deepEqual(f.records.map(record=>record.root.isEnabled()),[true,false,false]);
  assert.ok(f.records.every(record=>!record.occluded));
  assert.ok(f.occlusion.groups.every(group=>!group.pending&&group.query===null&&group.hiddenSamples===0));
  assert.deepEqual(f.deleted,[]);
  for(let i=1;i<=8;i++)f.step(i*50);
  assert.equal(f.stats.occlusionQueries,submissions);
  assert.equal(f.occlusion.stableFrames,0);

  f.engine.onContextRestoredObservable.notifyObservers(f.engine);
  f.step(450);f.step(500);
  assert.equal(f.stats.occlusionQueries,submissions);
  f.step(550);
  assert.equal(f.stats.occlusionQueries,submissions+1);
  assert.ok(f.renderer._fillIndexBuffer);
  assert.notEqual(f.renderer._fillIndexBuffer,previousIndices);
  f.step(600,{visible:true});
  assert.equal(f.records[0].root.isEnabled(),true);
  assert.deepEqual(f.deleted,[]);
});
test('the 0.3 scene can lose its context between maps and discard the previous map proxy indices',async t=>{
  const f=fixture(t,{gameplayV03:true});await f.warm();f.step(0,{available:false});
  const previous=f.renderer._fillIndexBuffer;
  assert.ok(previous);
  f.occlusion.dispose();
  assert.ok(f.deleted.length>0);
  assert.equal(f.renderer._fillIndexBuffer,previous);
  f.engine.onContextLostObservable.notifyObservers(f.engine);
  assert.equal(f.renderer._fillIndexBuffer,null);
  f.engine.onContextRestoredObservable.notifyObservers(f.engine);
  f.renderer.renderOcclusionBoundingBox(MeshBuilder.CreateBox('next-map-proxy',{},f.scene));
  assert.ok(f.renderer._fillIndexBuffer);
  assert.notEqual(f.renderer._fillIndexBuffer,previous);
});
test.after(()=>{
  const directory=new URL('../reports/bear-combat-2026-11-05/',import.meta.url);mkdirSync(directory,{recursive:true});
  writeFileSync(new URL('occlusion-validation.json',directory),JSON.stringify({baseline:'99fcd56',passed:report.length===5,cases:report,limitations:['Real Babylon 9.31 BoundingBoxRenderer/ShaderMaterial/NullEngine drawElementsType is exercised; query availability/results are controlled.','Counts demonstrate removal of redundant outside-query draw calls, not actual GPU time, mobile FPS or causation of a recorded delay.','Cold shaders initialize outside queries; readiness is checked under the same dedicated render pass as the actual query draw.']},null,2)+'\n');
});
