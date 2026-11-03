import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {WarriorV2Controller} from '../src/warrior-v2.js';
import {FrameLoop} from '../src/frame-loop.js';

const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const attackFunctions=main.slice(main.indexOf('function setAttackHeld('),main.indexOf('function faceHeading('));
const binding=main.slice(main.indexOf('  let lastPointerAttack'),main.indexOf('  const releaseAttack'));
const durations={idle:2,run:1,slash:1.5,attack:3,judgment:4.33,shieldPush:2.37,dodge:2.46};

function fixture(kind){
 let now=0;const controller=new WarriorV2Controller({durations,holdNow:()=>now,staminaEnabled:false});controller.startAttack(kind);
 const attackSources=new Set(),{document,Event}=parseHTML('<button id="attack"></button>'),attackButton=document.getElementById('attack');attackButton.setPointerCapture=()=>{};
 const actions=new Function('attackSources','attackPointerTypes','controller','ready','boss','elenaReview',attackFunctions+';return {setAttackHeld,cancelAttackInput};')(attackSources,new Map(),controller,true,null,null);
 new Function('attackButton','ready','performance','setAttackHeld','cancelAttackInput','actions',binding)(attackButton,true,{now:()=>now},actions.setAttackHeld,actions.cancelAttackInput,{attack:()=>controller.attack()});
 const event=(type,id=7)=>{const value=new Event(type);Object.assign(value,{pointerId:id,button:0});attackButton.dispatchEvent(value);};
 const loop=new FrameLoop({stopRenderLoop(){},runRenderLoop(){}},dt=>controller.update(dt),()=>now);loop.frame();
 const step=ms=>{now+=ms;loop.frame();};
 return {controller,attackSources,event,step,actions,advanceTime:ms=>{now+=ms;}};
}

test('real HUD and capped frame loop retain a physical long hold through current motion',()=>{
 for(const kind of ['slash','attack','judgment','dodge','shieldPush'])for(const release of ['before-recovery','keep-holding','no-frame','lost-capture']){
  const f=fixture(kind),{controller:c,event,step}=f;event('pointerdown');
  if(release==='no-frame'||release==='lost-capture')f.advanceTime(600);else{step(300);step(300);assert.equal(c.queuedAttack,'judgment');}
  if(release==='before-recovery'||release==='no-frame')event('pointerup');
  if(release==='lost-capture')event('lostpointercapture');
  assert.equal(c.queuedAttack,'judgment',`${kind}/${release}`);
  for(let i=0;i<120&&c.serial<2;i++)step(100);
  assert.equal(c.serial,2,`${kind}/${release}`);assert.equal(c.action?.state,'judgment');
  event('pointerup');event('lostpointercapture');for(let i=0;i<60;i++)step(100);
  assert.equal(c.serial,2,'one physical hold must never fire a second attack');
 }
});

test('short release remains a normal tap; cancellation and death paths never create a queued heavy',()=>{
 for(const cancel of ['none','global','pointercancel','death']){
  const f=fixture('shieldPush'),{controller:c,event,step}=f;event('pointerdown');f.advanceTime(cancel==='none'?300:600);
  if(cancel==='global')f.actions.cancelAttackInput();
  if(cancel==='pointercancel')event('pointercancel');
  if(cancel==='death'){f.actions.cancelAttackInput();c.dead=true;}
  event('pointerup');
  if(cancel==='none')assert.equal(c.queuedAttack,'normal');else assert.equal(c.queuedAttack,null);
  for(let i=0;i<60;i++)step(100);
  if(cancel!=='none')assert.equal(c.serial,1);
 }
});

test('defensive transitions and ordinary hits preserve the physical hold timestamp',()=>{
 for(const transition of ['dodge','shieldPush','hit']){
  const f=fixture('slash'),{controller:c,event,step}=f;event('pointerdown');step(200);
  if(transition==='hit')c.hit(.2);else c[transition]();
  f.advanceTime(300);event('pointerup');assert.equal(c.queuedAttack,'judgment');
  for(let i=0;i<100&&c.action?.state!=='judgment';i++)step(100);
  assert.equal(c.action?.state,'judgment');
 }
});

test('normal frame rates retain a full HUD charge through repeated same-defense input',()=>{
 for(const kind of ['slash','attack','judgment','dodge','shieldPush'])for(const fps of [15,30,60])for(const release of [true,false]){
  const f=fixture(kind),{controller:c,event,step}=f;event('pointerdown');
  for(let i=0;i<Math.ceil(.47*fps);i++)step(1000/fps);
  assert.equal(c.queuedAttack,'judgment',`${kind}/${fps}`);
  if(kind==='dodge'||kind==='shieldPush'){assert.equal(c[kind](),false);assert.equal(c.queuedAttack,'judgment');}
  if(release)event('pointerup');
  for(let i=0;i<fps*6&&c.serial<2;i++)step(1000/fps);
  assert.equal(c.action?.state,'judgment');assert.equal(c.serial,2);
  event('pointerup');for(let i=0;i<fps*5;i++)step(1000/fps);assert.equal(c.serial,2);
 }
});
