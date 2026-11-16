import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from '@babylonjs/core';
import {createAuthoredMonsterRuntime,MONSTER_SPAWN_STORAGE} from '../src/authored-monster-runtime.js';
import {emptyMonsterSpawns} from '../src/monster-spawn-document.js';
import {createPlainsMonsterSpawns,PLAINS_MONSTER_SPAWNS_REVISION} from '../src/plains-monster-spawns.js';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function settle(){for(let i=0;i<20;i++)await tick();}
const custom=(id,extra={})=>({id,definitionId:'hooded-goblin.standard',groupId:id,spawnMode:'start',respawn:false,rewardEnabled:true,x:120+Number(id.split('-').at(-1))*3,z:100,yaw:0,delaySeconds:30,randomRadius:0,drop:{assetId:'',effectEnabled:false},...extra});
function fixture({memory=new Map(),storage,hold}={}){
 const errors=[],state={ready:true,dead:false,paused:false},world={mapId:'great-plains',release:'moonforest-0.2',terrain:{heightAt:()=>2},navigation:{free:()=>true}},battle={encounters:[]},player={position:new Vector3(0,0,0)};let population,serial=0;
 const store=storage??{getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value)},Factory=()=>{const value=()=>{};value.dispose=()=>{};return value;};
 class Population{
  constructor(options){this.options=options;this.limits=options.limits;this.entries=[];population=this;}
  setPaused(value){this.paused=value;}update(){}observe(){}diagnostics(){return {entries:this.entries.length};}
  async spawn(id,context){assert.ok(this.options.definitions[id],id);const record={definitionId:id,state:'preparing',flags:{death:false},estimatedBytes:this.options.definitions[id].population.estimatedBytes,operation:{context},spawnContext:context,gone:false};this.entries.push(record);await hold?.(record);record.operation=null;record.state='active';const encounter={active:false,actor:{position:context.position},radius:this.options.definitions[id].collider.radius};record.adapter={id:'test-'+(++serial),encounter,reveal(){encounter.active=true;battle.encounters.push(encounter);return true;},snapshot:()=>({corpseGone:record.gone})};return record;}
  recycle(record){record.state='dormant';battle.encounters=battle.encounters.filter(value=>value!==record.adapter?.encounter);}
  leaveMap(){for(const record of this.entries)this.recycle(record);this.entries=[];}dispose(){this.leaveMap();}
 }
 const runtime=createAuthoredMonsterRuntime({world,battle,getPlayer:()=>player,getState:()=>state,storage:store,defaultDocument:createPlainsMonsterSpawns(),defaultRevision:PLAINS_MONSTER_SPAWNS_REVISION,Factory,Population,onError:error=>errors.push(error)});
 return {runtime,world,battle,player,state,memory,errors,get population(){return population;}};
}
test('fresh0.2 plains defaults seed14 approved actors in7 complete groups, with bounded preparation and terrain height',async()=>{
 const f=fixture();f.runtime.beforeBattle(0,f.player);await settle();assert.equal(f.battle.encounters.length,14);assert.equal(f.runtime.inspect().groups.length,7);assert.ok(f.runtime.inspect().groups.every(group=>group.state==='active'));
 assert.equal(f.population.limits.total,20);assert.equal(f.population.limits.estimatedMemoryBytes,512*1024*1024);assert.ok(f.population.entries.every(record=>record.spawnContext.position.y===2&&record.spawnContext.staged&&record.spawnContext.row.territory));
 assert.equal(JSON.parse(f.memory.get(MONSTER_SPAWN_STORAGE)).defaultRevisions[0],PLAINS_MONSTER_SPAWNS_REVISION);assert.equal(f.errors.length,0);f.runtime.dispose();
});
test('legacy custom20 are preserved; requested defaults reserve whole groups first while excess customs wait visibly',async()=>{
 const memory=new Map(),doc=emptyMonsterSpawns();doc.maps['great-plains']=Array.from({length:20},(_,i)=>custom('custom-'+i));memory.set(MONSTER_SPAWN_STORAGE,JSON.stringify(doc));const f=fixture({memory});
 assert.equal(f.runtime.getDocument().maps['great-plains'].length,34);assert.deepEqual(f.runtime.getDocument().maps['great-plains'].slice(14),doc.maps['great-plains']);f.runtime.beforeBattle(0,f.player);await settle();
 const groups=f.runtime.inspect().groups;assert.ok(groups.slice(0,7).every(group=>group.state==='active'));assert.equal(f.battle.encounters.length,20);assert.equal(groups.filter(group=>group.state==='capacity-wait').length,14);assert.ok(groups.filter(group=>group.state==='capacity-wait').every(group=>group.capacityReason==='population-capacity'));assert.equal(f.errors.length,0);f.runtime.dispose();
});
test('editing or deleting defaults persists across runtime recreation, including a replacement imported without migration metadata',()=>{
 const f=fixture(),edited=f.runtime.getDocument();edited.maps['great-plains'].shift();edited.maps['great-plains'][0].yaw=1.234;delete edited.defaultRevisions;delete edited.defaultRowIds;f.runtime.replace(edited);f.runtime.dispose();const again=fixture({memory:f.memory});
 assert.equal(again.runtime.getDocument().maps['great-plains'].length,13);assert.equal(again.runtime.getDocument().maps['great-plains'][0].yaw,1.234);assert.equal(again.runtime.inspect().defaultMigration.addedRows,0);again.runtime.dispose();
});
test('storage errors keep defaults active in memory without overwriting unreadable custom data',async()=>{
 let writes=0;const f=fixture({storage:{getItem(){throw Error('denied');},setItem(){writes++;throw Error('denied');}}});f.runtime.beforeBattle(0,f.player);await settle();assert.equal(f.battle.encounters.length,14);assert.equal(f.runtime.inspect().defaultMigration.persisted,false);assert.equal(writes,0);assert.equal(f.errors.length,1);f.runtime.dispose();
 const memory=new Map([[MONSTER_SPAWN_STORAGE,'{broken saved document']]),g=fixture({memory});assert.equal(memory.get(MONSTER_SPAWN_STORAGE),'{broken saved document');assert.equal(g.runtime.getDocument().maps['great-plains'].length,14);g.runtime.dispose();
 const quota=fixture({storage:{getItem:()=>null,setItem(){throw Error('quota');}}});quota.runtime.beforeBattle(0,quota.player);await settle();assert.equal(quota.battle.encounters.length,14);assert.equal(quota.runtime.inspect().defaultMigration.persisted,false);assert.equal(quota.errors.length,1);quota.runtime.dispose();
});
test('prepared groups wait through pause and a map departure cannot attach a late acquisition',async()=>{
 let finish;const f=fixture({hold:record=>record.spawnContext.row.id==='plains-fox-west-1'?new Promise(resolve=>finish=resolve):undefined});f.runtime.beforeBattle(0,f.player);f.state.paused=true;await settle();assert.ok(f.runtime.inspect().groups.some(group=>group.state==='prepared'));assert.equal(f.battle.encounters.length,0);f.runtime.afterBattle(f.player);assert.equal(f.battle.encounters.length,0);
 f.runtime.leaveMap();f.world.mapId='village';finish();await settle();assert.equal(f.battle.encounters.length,0);assert.deepEqual(f.runtime.inspect().groups,[]);f.runtime.dispose();
});
