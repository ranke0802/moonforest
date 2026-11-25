import assert from 'node:assert/strict';
import test from 'node:test';
import {parseHTML} from 'linkedom';
import {arrangeTopActions} from '../src/hud-top-actions.js';
import {setupHudTooltips} from '../src/v03/hud-tooltips.js';
import {t,useLanguage} from '../src/v03/i18n.js';

test('top HUD hints follow pointer and keyboard, stay inside the viewport, and leave touch controls clear',async tcase=>{
 const {document,window}=parseHTML('<html><body><main><div class="top-actions"><button id="fullscreen-button" aria-label="전체화면" title="전체화면" aria-describedby="help"></button><button class="v03-ride-toggle" aria-label="말 타기"></button><button data-chapter="bag"><i></i></button></div></main></body></html>');
 const root=document.querySelector('main'),bag=root.querySelector('[data-chapter]'),ride=root.querySelector('.v03-ride-toggle'),fullscreen=root.querySelector('#fullscreen-button');
 window.innerWidth=320;window.innerHeight=180;
 arrangeTopActions(root);const hud=setupHudTooltips(root),tip=root.querySelector('[role=tooltip]');
 tcase.after(()=>hud.dispose());
 tcase.after(()=>useLanguage('ko'));
 bag.getBoundingClientRect=()=>({left:0,top:5,bottom:45,width:40});
 fullscreen.getBoundingClientRect=()=>({left:279,top:135,bottom:175,width:40});
 ride.getBoundingClientRect=bag.getBoundingClientRect;
 tip.getBoundingClientRect=()=>({width:140,height:30});
 const fire=(node,name,props={})=>node.dispatchEvent(Object.assign(new window.Event(name,{bubbles:true}),props));
 for(const lang of ['ko','en','ja','vi','zh']){
  await useLanguage(lang);
  fire(bag.firstElementChild,'pointerover',{pointerType:'mouse'});
  assert.equal(tip.textContent,t('hud.tip.bag'));assert.equal(tip.style.left,'8px');assert.equal(tip.style.top,'45px');
  fire(bag,'pointerout',{pointerType:'mouse',relatedTarget:tip});assert.equal(tip.hidden,false);
  fire(tip,'pointerout',{pointerType:'mouse',relatedTarget:root});assert.equal(tip.hidden,true);
 }
 fire(document,'keydown',{key:'Tab'});fire(fullscreen,'focusin');
 assert.equal(tip.textContent,t('hud.tip.fullscreen'));assert.equal(tip.style.left,'172px');assert.equal(tip.style.top,'105px');
 assert.equal(fullscreen.getAttribute('aria-describedby'),'help '+tip.id);assert.equal(fullscreen.hasAttribute('title'),false);
 fullscreen.setAttribute('aria-pressed','true');await Promise.resolve();
 assert.equal(tip.textContent,t('hud.tip.exitFullscreen'));
 fire(document,'keydown',{key:'Escape'});assert.equal(tip.hidden,true);assert.equal(fullscreen.getAttribute('aria-describedby'),'help');assert.equal(fullscreen.title,'전체화면');
 fire(ride,'pointerover',{pointerType:'touch'});fire(ride,'pointerdown',{pointerType:'touch'});fire(ride,'focusin');assert.equal(tip.hidden,true);
 fire(ride,'pointerover',{pointerType:'mouse'});assert.equal(tip.textContent,'말 타기 (H)');
 ride.setAttribute('aria-label','말에서 내리기');await Promise.resolve();assert.equal(tip.textContent,'말에서 내리기 (H)');
 fire(ride,'click');assert.equal(tip.hidden,true);
 hud.dispose();fire(bag,'pointerover',{pointerType:'mouse'});assert.equal(root.querySelector('[role=tooltip]'),null);
});

test('missing HUDs are inert and a late settings label survives hover, focus changes and removal',async()=>{
 const {document,window}=parseHTML('<html><body><main></main></body></html>'),root=document.querySelector('main');
 setupHudTooltips(null).dispose();setupHudTooltips(root).dispose();assert.equal(root.querySelector('[role=tooltip]'),null);
 root.innerHTML='<div class="top-actions"><button data-top-action="settings" title="Settings" aria-label="Open settings"></button><button data-top-action="bag"></button></div>';
 const settings=root.querySelector('button'),bag=settings.nextElementSibling,hud=setupHudTooltips(root),tip=root.querySelector('[role=tooltip]');
 const fire=(node,name,props={})=>node.dispatchEvent(Object.assign(new window.Event(name,{bubbles:true}),props));
 try{
  fire(settings,'pointerover',{pointerType:'mouse'});assert.equal(settings.hasAttribute('title'),false);
  settings.title='Options';settings.setAttribute('aria-label','Open options');await Promise.resolve();
  assert.equal(settings.hasAttribute('title'),false);assert.equal(settings.getAttribute('aria-label'),'Open options');
  fire(document,'keydown',{key:'Tab'});fire(bag,'focusin');assert.equal(tip.textContent,t('hud.tip.bag'));assert.equal(settings.title,'Options');
  bag.remove();await Promise.resolve();assert.equal(tip.hidden,true);
  fire(settings,'focusin');hud.dispose();assert.equal(settings.title,'Options');assert.equal(settings.hasAttribute('aria-describedby'),false);
 }finally{hud.dispose();}
});
