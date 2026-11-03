import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PlaygroundInput} from '../src/input.js';
import {DodgeSprintGesture} from '../src/dodge-sprint-input.js';
import {WarriorV2Controller} from '../src/warrior-v2.js';
import {FrameLoop} from '../src/frame-loop.js';

const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const actionsSource=main.slice(main.indexOf('  dodge() { if(ready'),main.indexOf('  potion() { if(ready'));
const buttonIndex=main.indexOf("    const button=$('#dodge-button');let lastPress");
assert.ok(buttonIndex>0,'production dodge button binding must exist');
const buttonSource=main.slice(main.lastIndexOf('  {',buttonIndex),main.indexOf("  $('#boss-kind').addEventListener",buttonIndex));
class Surface {
 constructor(){this.events=new Map();this.style={};this.hidden=true;this.captured=new Set();}
 addEventListener(name,fn,options={}){if(!this.events.has(name))this.events.set(name,[]);this.events.get(name).push(fn);options.signal?.addEventListener('abort',()=>this.events.set(name,this.events.get(name).filter(f=>f!==fn)),{once:true});}
 emit(type,props={}){const e={type,target:this,cancelable:true,defaultPrevented:false,preventDefault(){if(this.cancelable)this.defaultPrevented=true;},...props};for(const fn of this.events.get(type)??[])fn(e);return e;}
 focus(){}getBoundingClientRect(){return {left:0,top:0,width:1000,height:800};}
 setPointerCapture(id){this.captured.add(id);}hasPointerCapture(id){return this.captured.has(id);}releasePointerCapture(id){this.captured.delete(id);}
}
function fixture(){
 const elements=Object.fromEntries(['#joystick','#joystick-knob','#joystick-hint'].map(key=>[key,new Surface()]));
 globalThis.window=new Surface();globalThis.document=new Surface();document.querySelector=key=>elements[key]??null;
 const canvas=new Surface(),button=new Surface(),root=new Surface();canvas.closest=()=>root;root.contains=()=>true;
 button.closest=selector=>selector==='#dodge-button'?button:null;
 let now=0,escapes=0;const controller=new WarriorV2Controller({durations:{idle:2,run:1,dodge:2.46},speeds:{run:4}}),boss={playerHp:100,active:false,playerAlive:true};
 const holder={current:null};const actions=new Function('controller','boss','holder','startDefense',`let input=holder;const ready=true,isV2=()=>true;const actions={${actionsSource}};return actions;`)(controller,boss,holder,(type)=>{if(controller.captured)escapes++;else if(type==='dodge')controller.dodge();});
 const input=new PlaygroundInput(canvas,{alpha:0,beta:1,radius:5},{canMove:()=>true,setDodgeHeld:actions.setDodgeHeld,cancelDodgeInput:actions.cancelDodgeInput,isHudDodgeHeld:actions.isHudDodgeHeld});
 holder.dodgeSprintGesture=new DodgeSprintGesture({now:()=>now,onDodge:()=>actions.dodge(),onSprint:(held,seconds)=>controller.setSprintHeld(held,seconds)});input.dodgeSprintGesture=holder.dodgeSprintGesture;
 new Function('$','performance','actions',buttonSource)(()=>button,{now:()=>now},actions);
 let movement={y:1,alive:true},last=null,position=0;const loop=new FrameLoop({stopRenderLoop(){},runRenderLoop(){}},dt=>{if(!dt)return;input.dodgeSprintGesture.advance(dt);last=controller.update(dt,movement);const requested=last.speed*(last.movementDt??dt);controller.commitSprintMovement(requested,requested);position+=requested;},()=>now);loop.frame();
 const step=ms=>{now+=ms;loop.frame();};return {controller,input,button,actions,step,boss,escapes:()=>escapes,last:()=>last,position:()=>position};
}
const down=f=>f.button.emit('pointerdown',{button:0,pointerId:7,pointerType:'touch'});
const up=f=>f.button.emit('pointerup',{pointerId:7,pointerType:'touch'});
test('production HUD pointer tap rolls once; hold sprints and release does not roll',()=>{
 let f=fixture();down(f);f.step(100);up(f);assert.equal(f.controller.action?.state,'dodge');assert.equal(f.controller.serial,1);assert.equal(f.controller.stamina,90);f.input.dispose();
 f=fixture();f.controller.stamina=50;down(f);for(let i=0;i<30;i++)f.step(1000/30);assert.equal(f.controller.sprintHeld,true);assert.equal(f.controller.serial,0);assert.equal(f.last().speed,7.2);assert.equal(f.last().timeScale,1.8);assert.ok(f.controller.stamina<50);up(f);f.step(1000/30);assert.equal(f.controller.sprintHeld,false);assert.equal(f.controller.serial,0);assert.equal(f.last().speed,4);f.input.dispose();
});
test('actual HUD dodge tap rejects insufficient stamina without starting the roll or spending',()=>{
 const f=fixture();f.controller.stamina=8;down(f);f.step(100);up(f);
 assert.equal(f.controller.action,null);assert.equal(f.controller.serial,0);assert.equal(f.controller.staminaRejectSerial,1);assert.equal(f.controller.stamina,9.5);
 f.controller.stamina=10;down(f);f.step(100);up(f);assert.equal(f.controller.action?.state,'dodge');assert.equal(f.controller.serial,1);assert.equal(f.controller.stamina,1.5);f.input.dispose();
});
test('HUD cancellation, blur and modal reset never become a roll; touch menu retains hold',()=>{
 for(const reason of ['pointercancel','lostpointercapture','blur','reset']){const f=fixture();down(f);f.step(100);if(reason==='blur')window.emit('blur');else if(reason==='reset')f.input.reset();else f.button.emit(reason,{pointerId:7});f.step(300);up(f);assert.equal(f.controller.serial,0,reason);assert.equal(f.controller.sprintHeld,false);f.input.dispose();}
 const f=fixture();down(f);f.step(100);const menu=document.emit('contextmenu',{target:f.button,pointerType:'touch'});assert.equal(menu.defaultPrevented,true);f.step(100);f.step(50);assert.equal(f.controller.sprintHeld,true);up(f);f.input.dispose();
});
test('keyboard Space uses the same release tap and held sprint; capture escapes immediately',()=>{
 const f=fixture();window.emit('keydown',{code:'Space',target:{tagName:'DIV'}});f.step(100);window.emit('keyup',{code:'Space'});assert.equal(f.controller.action?.state,'dodge');f.controller.cancelAttack();
 window.emit('keydown',{code:'Space',target:{tagName:'DIV'}});for(let i=0;i<8;i++)f.step(50);assert.equal(f.controller.sprintHeld,true);window.emit('keyup',{code:'Space'});assert.equal(f.controller.sprintHeld,false);
 f.controller.capture();down(f);assert.equal(f.escapes(),1);up(f);assert.equal(f.escapes(),1);f.input.dispose();
});
