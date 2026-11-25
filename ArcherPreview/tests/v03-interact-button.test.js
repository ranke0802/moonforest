import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createInteractButton} from '../src/v03/interact-button.js';

function setup(input='touch'){
 const {document,window}=parseHTML(`<html><body><main id="app" data-hud-input="${input}"><nav class="action-controls"><button id="attack-button" aria-label="공격"><span id="attack-label">검</span></button></nav></main></body></html>`);
 const button=document.getElementById('attack-button'),seen=[];
 // main.js's own listeners on the button.
 for(const type of ['pointerdown','pointerup','click'])button.addEventListener(type,()=>seen.push(type));
 let interacted=0;const control=createInteractButton({doc:document,onInteract:()=>interacted++});
 const fire=(type,init={})=>{const event=new window.Event(type,{bubbles:true,cancelable:true});Object.assign(event,{pointerId:1,button:0,...init});button.dispatchEvent(event);return event;};
 return {document,button,seen,control,fire,get interacted(){return interacted;}};
}
const talk={act:'talk',name:'여관 주인',action:'말 걸기',label:'여관 주인에게 말 걸기'};

test('on touch, an actionable prompt turns the attack button into the interaction button',()=>{
 const h=setup();
 assert.equal(h.control.sync(talk),true);
 assert.ok(h.button.classList.contains('v03-interact'));assert.equal(h.button.dataset.v03Interact,'talk');
 assert.equal(h.button.getAttribute('aria-label'),'여관 주인에게 말 걸기');
 assert.equal(h.button.querySelector('.v03-interact-face b').textContent,'말 걸기');
 // The document takes the press in the capture phase, ahead of main.js's listeners on the button
 // (linkedom runs target listeners regardless of capture, so the stop itself is checked in the browser).
 const down=h.fire('pointerdown'),up=h.fire('pointerup'),click=h.fire('click',{detail:1});
 assert.equal(h.interacted,1,'one press, one interaction');
 for(const event of [down,up,click])assert.equal(event.defaultPrevented,true,event.type+' is taken');
 // A keyboard press on the focused button (click with detail 0) interacts too.
 h.fire('click',{detail:0});assert.equal(h.interacted,2);
});
test('the button is handed back when the prompt goes or cannot be acted on',()=>{
 const h=setup();h.control.sync(talk);
 h.control.sync({...talk,act:null,action:'마부를 기다리는 중'});
 assert.equal(h.button.classList.contains('v03-interact'),false);assert.equal(h.button.getAttribute('aria-label'),'공격','the attack label comes back');
 h.fire('pointerdown');h.fire('pointerup');h.fire('click',{detail:1});
 assert.equal(h.interacted,0);assert.deepEqual(h.seen,['pointerdown','pointerup','click']);
 h.control.sync({...talk,act:'push',action:'밀기 (1/3)'});assert.equal(h.button.dataset.v03Interact,'push');
 h.control.sync(null);assert.equal(h.button.classList.contains('v03-interact'),false);
});
test('a press that started as an attack is not taken over midway',()=>{
 const h=setup();h.fire('pointerdown');h.control.sync(talk);h.fire('pointerup');
 assert.equal(h.interacted,0);assert.deepEqual(h.seen,['pointerdown','pointerup']);
});
test('with keyboard controls the attack button stays an attack button',()=>{
 const h=setup('pc');
 assert.equal(h.control.sync(talk),false);assert.equal(h.button.classList.contains('v03-interact'),false);
 h.fire('pointerdown');assert.deepEqual(h.seen,['pointerdown']);
});
test('mounting by a resident hands the button to gallop and restores the same prompt on dismount',()=>{
 const h=setup(),app=h.document.getElementById('app');
 h.control.sync(talk);
 function setRide(value){
   app.dataset.v03Riding=value;
   app.dispatchEvent(new h.document.defaultView.Event('v03ridingchange',{bubbles:true}));
 }
 setRide('mounted');
 assert.equal(h.button.getAttribute('aria-label'),'공격');
 for(const event of ['pointerdown','pointerup','click'])assert.equal(h.fire(event,{detail:1}).defaultPrevented,false);
 assert.equal(h.interacted,0);
 assert.equal(h.control.sync(talk),false);
 setRide('on-foot');
 assert.equal(h.button.getAttribute('aria-label'),talk.label);
 h.fire('click',{detail:0});assert.equal(h.interacted,1);
});
test('dispose removes the listeners and the face',()=>{
 const h=setup();h.control.sync(talk);h.control.dispose();
 assert.equal(h.button.classList.contains('v03-interact'),false);assert.equal(h.button.querySelector('.v03-interact-face'),null);
 h.fire('pointerdown');assert.deepEqual(h.seen,['pointerdown']);assert.equal(h.control.sync(talk),false);
});
