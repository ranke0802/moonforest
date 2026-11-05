import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Vector3} from '@babylonjs/core';
import {PlayerCombat} from '../src/player-combat.js';
import {BossBattle} from '../src/boss-battle.js';
import {WarriorV2Controller} from '../src/warrior-v2.js';
import {DodgeSprintGesture} from '../src/dodge-sprint-input.js';
import {StaminaFailureFeedback,applyPlayerFlash} from '../src/stamina-feedback.js';

const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8').replaceAll('\r\n','\n'),noop=()=>{};
function between(a,b){const start=source.indexOf(a),end=source.indexOf(b,start);assert.ok(start>=0&&end>start);return source.slice(start,end);}
function bind(env,body){return Function(...Object.keys(env),body)(...Object.values(env));}

test('actual map prepare cancels held sprint and resets recovery time while preserving carried HP/stamina',()=>{
  const combat=new PlayerCombat(),controller=new WarriorV2Controller({durations:{idle:1}}),actor={position:Vector3.Zero()},events=[];
  combat.hp=317;controller.stamina=37;combat.recover(1.9,actor,(...args)=>events.push(args));
  const staminaFeedback=new StaminaFailureFeedback({now:()=>0});controller.staminaRejectSerial++;assert.equal(staminaFeedback.observe(controller),true);assert.ok(staminaFeedback.remaining>0);
  const gesture=new DodgeSprintGesture({now:()=>0,onSprint:held=>controller.setSprintHeld(held)});gesture.begin('button:7',{pointerType:'touch'});
  const marker=source.indexOf('mapTransition=createMapTransition({'),start=source.indexOf('    prepare:href=>{',marker),end=source.indexOf('\n    release:',start);assert.ok(start>marker&&end>start);
  const mesh={metadata:{},renderOverlay:true,overlayAlpha:.72},reaction={flashRemaining:.2,flashDuration:.2};
  const boss={combat,playerReaction:reaction,allPooled:[],hide:()=>{reaction.flashRemaining=0;}},env={staminaNoticeAnchor:{reset:noop,dispose:noop,setOffset:noop},boss,controller,container:{meshes:[mesh]},staminaFeedback,applyPlayerFlash,input:{reset:()=>gesture.cancel()},saveMapPosition:noop,hudLayout:null,minimapTravel:null,minimap:{hide:noop},chapterQuests:null,leaveElenaReview:noop,frameDiagnostics:{mapChanged:noop,suspend:noop},loadDiagnostics:{begin:noop},loadingView:{begin:noop},updateButtons:noop,cancelAttackInput:noop,frameLoop:{setPaused:noop},audio:{stopAll:noop,play:noop},actionAudio:{reset:noop},goldLoot:{clearDrops:noop},goldLootView:{clear:noop},projectiles:{clear:noop},training:{setSelected:noop},strikeSampler:{reset:noop},world:{}};
  const runtime=bind(env,`let resumePose={},ready=true,loadingAsset=false,combatResult={},mapPortal=null,mapLoadingGeneration;const location={href:'https://example.test/'};const hooks=({${source.slice(start,end)}});return {prepare:hooks.prepare,state:()=>({ready,loadingAsset})};`);
  runtime.prepare('https://example.test/?character=warrior-v5');assert.deepEqual(runtime.state(),{ready:false,loadingAsset:true});assert.equal(combat.hp,317);assert.equal(controller.stamina,37);
  assert.equal(gesture.sources.size,0);assert.equal(staminaFeedback.remaining,0);assert.equal(staminaFeedback.observe(controller),false);assert.equal(mesh.renderOverlay,false,'the hit reset cannot leave the player white during the destination loading frames');assert.equal(combat.passiveRecovery.elapsed,0);assert.equal(combat.recover(.1,actor,(...args)=>events.push(args)),0);assert.equal(events.length,0);
});

test('actual new-life restart restores resource owners and cannot inherit the old recovery or held input',()=>{
  const combat=new PlayerCombat(),controller=new WarriorV2Controller({durations:{idle:1}}),actor={position:Vector3.Zero(),rotation:Vector3.Zero(),rotationQuaternion:null};
  combat.hp=117;controller.stamina=9;combat.recover(1.9,actor,noop);
  const gesture=new DodgeSprintGesture({now:()=>0,onSprint:held=>controller.setSprintHeld(held)});gesture.begin('keyboard');
  const boss={combat,hide:noop,onChange:noop};boss.resetBattle=()=>BossBattle.prototype.resetBattle.call(boss);
  const env={staminaNoticeAnchor:{reset:noop,dispose:noop,setOffset:noop},boss,controller,actor,staminaFeedback:{reset:noop},input:{reset:()=>gesture.cancel()},goldLoot:{clearDrops:noop},goldLootView:{clear:noop},audio:{stopAll:noop,play:noop,setEnvironment:noop},actionAudio:{reset:noop},character:'warrior-v3',attackSources:new Set(),strikeSampler:{reset:noop},config:{forwardYaw:0},isVillage:()=>false,isCave:()=>false,syncCaveFog:noop,animator:{transition:noop,update:noop},applyHitFlash:noop,container:{meshes:[]},resetCamera:noop,updateButtons:noop,canvas:{focus:noop}};
  const restart=bind(env,`let combatResult={},shotActionId=7;${between('function resetBeforeBoss()','\nfunction setAttackHeld')}return resetBeforeBoss;`);restart();
  assert.equal(combat.hp,combat.maxHp);assert.equal(controller.stamina,controller.maxStamina);assert.equal(combat.potions.remaining,3);assert.equal(combat.passiveRecovery.elapsed,0);assert.equal(gesture.sources.size,0);
  combat.hp=400;assert.equal(combat.recover(.1,actor,noop),0);
});

for(const loading of [false,true])test(`actual zero/loading render cannot retain recovery debt (loading=${loading})`,()=>{
  const combat=new PlayerCombat(),actor={position:Vector3.Zero()},events=[];combat.hp=400;combat.recover(1.9,actor,(...args)=>events.push(args));
  const env={cinematicAuthoringPreview:false,mapDeparture:null,mapTransition:{busy:false},ready:!loading,loadingAsset:loading,boss:{combat},actor,controller:{dead:false},frameDiagnostics:{mark:()=>null,measure:noop},syncCameraFocus:noop,syncCaveFog:noop,world:{tick:noop,scene:{render:noop},caveCamera:{beginFrame:noop,endFrame:noop,applied:false}},screenProjection:{beginFrame:noop},updateStaminaNotice:noop,updateHealthBars:noop,goldLootView:{project:noop},training:{update:noop},projectiles:{update:noop},damageNumbers:null};
  const render=bind(env,`let simulateFrame=false,elapsed=0,statusTime=0;${between('function render(dt)','\nfunction bindMapPortal')}return render;`);render(loading ? .1 : 0);
  assert.equal(combat.hp,400);assert.equal(combat.passiveRecovery.elapsed,0);assert.equal(events.length,0);assert.equal(combat.recover(.1,actor,noop),0);
});
