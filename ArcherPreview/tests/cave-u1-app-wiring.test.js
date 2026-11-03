import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Vector3} from '@babylonjs/core';
import {WarriorV2Controller} from '../src/warrior-v2.js';
const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const healthSource=main.slice(main.indexOf('function updateHealthBars()'),main.indexOf('\nfunction syncCaveFog'));

test('actual game HUD wiring keeps health readable and only enables a nearby living visible giant marker with structural LOS',()=>{
 const controller=new WarriorV2Controller({durations:{idle:2,run:1}});controller.stamina=73;
 const calls=[],env={controller,Vector3,ready:true,isV2:()=>true,actor:{position:new Vector3(29,6,-23)},playerHead:null,
  world:{cave:true,scene:{},camera:{globalPosition:new Vector3(29,12,-15)},terrain:{heightAt:()=>6}},
  boss:{playerHp:442,playerMaxHp:500,encounters:[]},screenProjection:{},
  bossHealthBars:{update:(...args)=>calls.push(['boss',args])},playerHealthBar:{update:(...args)=>calls.push(['player',args])},
  cavePlayerMarkerClear:()=>true};
 const update=Function('env','with(env){'+healthSource+';return updateHealthBars;}')(env);
 const giant={active:true,phase:2,brain:{hp:1590},actor:{position:new Vector3(29,6,-25)}};env.boss.encounters=[giant];update();
 assert.strictEqual(calls.at(-2)[1][3].playerPosition,env.actor.position);
 assert.deepEqual(calls.at(-1)[1][1].marker,{enabled:true,clearToPlayer:true,groundY:6});
 assert.equal(calls.at(-1)[1][1].stamina,73);assert.equal(calls.at(-1)[1][1].maxStamina,100);
 env.cavePlayerMarkerClear=()=>false;update();assert.equal(calls.at(-1)[1][1].marker.clearToPlayer,false);
 for(const mutation of [()=>giant.fogVisible=false,()=>{giant.fogVisible=true;giant.brain.hp=0;},()=>{giant.brain.hp=1590;giant.actor.position.z=-40;},()=>{giant.actor.position.z=-25;env.world.cave=false;}]){
  mutation();update();assert.equal(Boolean(calls.at(-1)[1][1].marker.enabled),false);
 }
 env.ready=false;env.actor=undefined;update();assert.equal(calls.at(-1)[1][1].visible,false,'startup redraw without a loaded actor stays safe');
});

test('viewport resize resolves notch padding once; damage layout can consume it without DOM reads per frame',()=>{
 const source=main.slice(main.indexOf('function resizeScreenProjection()'),main.indexOf('\nfunction applyRenderQuality'));
 let reads=0;const env={screenProjection:{resize(w,h){this.size=[w,h];}},canvas:{clientWidth:852,clientHeight:393},$:()=>({}),getComputedStyle:()=>{reads++;return {getPropertyValue:n=>n.endsWith('left')?'59px':n.endsWith('bottom')?'21px':'0px'};}};
 const resize=Function('env','with(env){'+source+';return resizeScreenProjection;}')(env);resize();
 assert.deepEqual(env.screenProjection.size,[852,393]);assert.deepEqual(env.screenProjection.safeInsets,{top:0,right:0,bottom:21,left:59});assert.equal(reads,1);
});
