import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {Observable,Vector3} from '@babylonjs/core';
import {actorScenarioIds,setupDeveloperActors} from '../src/developer-actors.js';

test('development scenarios retain requested counts and explicitly fixed NPC/high-triangle cases',()=>{
 for(const count of [1,5,10,20])for(const mode of ['monsters','mixed','boss']){
  const ids=actorScenarioIds(mode,count);assert.equal(ids.length,count);
  if(mode==='boss')assert.equal(ids.filter(id=>id==='guardian-bear.standard').length,1);
  if(mode==='mixed'&&count>1)assert.equal(new Set(ids).size,2);
 }
 assert.equal(actorScenarioIds('npc',20).length,1);assert.equal(actorScenarioIds('poses',20).length,2);
 assert.throws(()=>actorScenarioIds('monsters',21));
});

test('explicit lab UI dispatches exact counts, reuses production travel and tears down its optional hooks',async t=>{
 const {document,window}=parseHTML('<html><body><main id="app"></main></body></html>'),root=document.getElementById('app');
 const player={position:Vector3.Zero(),rotation:Vector3.Zero()},scene={onDisposeObservable:new Observable()},travelled=[],calls=[],state={ready:true,dead:false,paused:false};
 let factoryDisposed=0,cleared=0,left=0,disposed=0;
 const world={mapId:'village',scene,terrain:{heightAt:()=>0},navigation:{free:()=>true,segmentClear:()=>true,findFree:point=>point}};
 const battle={encounters:[],developmentPool:[]};
 class Population{
  constructor(options){this.options=options;this.entries=[];}
  clear(){this.entries=[];cleared++;}leaveMap(){this.clear();left++;}dispose(){disposed++;this.clear();}
  setPaused(){}update(){}observe(){}
  diagnostics(){return {entries:this.entries.length,limits:{total:20},pending:0,states:{active:this.entries.length},estimatedBytes:0,stats:{created:this.entries.length,reused:0,respawns:0},memoryMeaning:'estimate'};}
  async spawn(id,context){calls.push({id,context});const encounter={actor:{position:context.position},brain:{time:0}},adapter={encounter,snapshot:()=>({active:true,position:context.position}),interact:()=>true};const record={definition:{collider:{radius:.34}},adapter,category:id==='village.guard'?'npc':'monster'};this.entries.push(record);return record;}
 }
 const api=setupDeveloperActors({root,world,battle,getPlayer:()=>player,getState:()=>state,travel:async id=>travelled.push(id),Population,createFactory:()=>Object.assign(()=>{},{dispose:()=>factoryDisposed++,inspect:()=>({})})});
 t.after(()=>api.dispose());
 for(const select of root.querySelectorAll('select'))Object.defineProperty(select,'value',{writable:true,value:select.querySelector('option').value});
 const click=command=>root.querySelector(`[data-command="${command}"]`).dispatchEvent(new window.Event('click',{bubbles:true}));
 root.querySelector('[data-count]').value='20';root.querySelector('[data-scenario]').value='mixed';click('spawn');
 for(let i=0;i<30;i++)await new Promise(resolve=>setImmediate(resolve));
 assert.equal(calls.length,20);assert.equal(new Set(calls.map(call=>call.id)).size,2);assert.ok(calls.every(call=>call.context.player===player));
 state.ready=false;click('spawn');await new Promise(resolve=>setImmediate(resolve));assert.equal(calls.length,20,'loading cannot admit actors');state.ready=true;
 root.querySelector('[data-map]').value='warrior-v5';click('travel');await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(travelled,['warrior-v5']);
 api.leaveMap();assert.equal(left,1);assert.equal(api.population.entries.length,0);assert.ok(cleared>0);
 battle.developmentLifecycle();assert.ok(cleared>1);
 api.dispose();api.dispose();assert.equal(factoryDisposed,1);assert.equal(disposed,1);assert.equal(root.querySelector('.actor-lab'),null);assert.equal(battle.developmentLifecycle,undefined);
});

test('ordinary game entry only imports the actor lab behind its release opt-in route',()=>{
 const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 assert.match(source,/if\(releaseEnabled&&new URLSearchParams\(location.search\).get\('actorLab'\)==='1'\)\{\s*import\('\.\/developer-actors.js'\)/);
 assert.doesNotMatch(source,/import\s+[^;]*from\s+['"]\.\/actor-(?:population|definitions|encounter-adapter)/);
});
