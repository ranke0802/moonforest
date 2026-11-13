import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import {setupHudRasterV1,hudRasterFrame} from '../src/hud-raster-v1.js';

function fixture(){
 const {document,window}=parseHTML(`<main id="app"><nav class="top-actions"><button data-chapter="bag">가방</button><button data-chapter="journal">일지</button><button id="motion-speed-toggle">설정</button><button id="open-summon">소환</button><button id="fullscreen-button">전체</button></nav><section id="player-hud"><progress max="500" value="173"></progress><progress id="player-stamina" value="41"></progress><span id="player-health">HP 173 / 500</span></section><section id="chapter-hud"><div class="chapter-stack"><div class="uit-track"><small>첫 장</small><strong>현재 의뢰</strong><span>실제 목표 0/1</span></div><div class="chapter-story"><button>이야기</button></div></div></section><div id="dot-minimap"><canvas></canvas><button class="minimap-travel-launch">지역 이동</button></div><nav class="action-controls"><button id="attack-button"><span>공격</span></button><button id="guard-button"><span>방어</span></button><button id="dodge-button"><span>회피</span></button><button id="potion-button"><span>물약 <b id="potion-count">2</b></span></button></nav><dialog id="settings"></dialog></main>`);
 // Linkedom omits descendant attribute notifications. Adapt that DOM contract
 // for the existing dialog rather than changing the browser implementation.
 const Observer=window.MutationObserver,FixtureObserver=class extends Observer{observe(node,options){super.observe(node,options);if(options.subtree&&options.attributes)for(const dialog of node.querySelectorAll('dialog'))super.observe(dialog,{...options,subtree:false});}};
 Object.defineProperty(document,'defaultView',{value:new Proxy(window,{get(target,key){return key==='MutationObserver'?FixtureObserver:Reflect.get(target,key);}})});
 let clock=0;const root=document.querySelector('#app'),api=setupHudRasterV1({root,now:()=>clock});
 const emit=(node,type,properties={})=>{const event=new window.Event(type,{bubbles:true});Object.assign(event,properties);node.dispatchEvent(event);};
 return {document,window,root,api,emit,tick(ms,state={}){clock+=ms;api.update(state);}};
}

test('eight sprite bindings reuse original live controls and never overwrite HUD data or saved transforms',()=>{
 const f=fixture(),attack=f.root.querySelector('#attack-button'),canvas=f.root.querySelector('canvas'),story=f.root.querySelector('.chapter-story button');let actions=0;
 attack.style.translate='14px 25px';attack.style.scale='1.2';attack.addEventListener('pointerdown',()=>actions++);
 assert.equal(f.api.inspect().sprites,8);assert.equal(setupHudRasterV1({root:f.root}),f.api);assert.equal(f.root.querySelectorAll('.hud-v1-sprite').length,8);
 f.emit(attack,'pointerdown',{button:0,pointerId:1,pointerType:'mouse'});f.tick(60);assert.equal(actions,1);assert.equal(attack.dataset.hudSpriteState,'held');
 assert.equal(f.root.querySelector('#player-hud progress').getAttribute('value'),'173');assert.equal(f.root.querySelector('#player-stamina').getAttribute('value'),'41');assert.equal(f.root.querySelector('#potion-count').textContent,'2');assert.equal(f.root.querySelector('canvas'),canvas);assert.equal(story.textContent,'이야기');assert.equal(f.root.querySelector('.uit-track').children.length,3);
 assert.equal(attack.style.translate,'14px 25px');assert.equal(attack.style.scale,'1.2');
 f.api.dispose();assert.equal(f.root.querySelectorAll('.hud-v1-sprite').length,0);assert.equal(attack.style.translate,'14px 25px');assert.equal(attack.style.scale,'1.2');assert.equal(f.root.hasAttribute('data-raster-hud'),false);
});

test('press/held/release timing joins existing frames and respects multiple guard sources',()=>{
 const f=fixture(),guard=f.root.querySelector('#guard-button');
 f.emit(guard,'pointerdown',{button:0,pointerId:9,pointerType:'touch'});assert.equal(guard.dataset.hudSpriteState,'press');assert.equal(f.root.dataset.hudInput,'touch');
 f.tick(45);assert.equal(guard.dataset.hudSpriteState,'held');f.emit(f.document,'keydown',{code:'KeyF',repeat:false});
 f.emit(f.window,'pointerup',{pointerId:9});f.tick(50,{guarding:true});assert.equal(guard.dataset.hudSpriteState,'held');assert.equal(f.api.inspect().sources,1);
 f.emit(f.document,'keyup',{code:'KeyF'});f.tick(0);assert.equal(guard.dataset.hudSpriteState,'release');f.tick(70);assert.equal(guard.dataset.hudSpriteState,'idle');f.api.dispose();
 assert.equal(hudRasterFrame({held:true,elapsed:44}),'press');assert.equal(hudRasterFrame({held:true,elapsed:45}),'held');assert.equal(hudRasterFrame({released:true,elapsed:69}),'release');assert.equal(hudRasterFrame({released:true,elapsed:70}),'idle');
});

test('cancel, focus loss, modal opening and blocked state clear cosmetic holds without dispatching actions',async()=>{
 const f=fixture(),attack=f.root.querySelector('#attack-button');let clicks=0;attack.addEventListener('click',()=>clicks++);
 f.emit(attack,'pointerdown',{button:0,pointerId:4});f.emit(f.window,'pointercancel',{pointerId:4});assert.equal(attack.dataset.hudSpriteState,'idle');
 f.emit(f.document,'keydown',{code:'KeyJ'});f.emit(f.window,'blur');assert.equal(attack.dataset.hudSpriteState,'idle');assert.equal(f.api.inspect().sources,0);
 f.emit(attack,'pointerdown',{button:0,pointerId:5});f.root.querySelector('dialog').setAttribute('open','');await new Promise(resolve=>setImmediate(resolve));assert.equal(attack.dataset.hudSpriteState,'idle');
 f.root.querySelector('dialog').removeAttribute('open');f.emit(attack,'pointerdown',{button:0,pointerId:6});f.tick(50,{blocked:true});assert.equal(attack.dataset.hudSpriteState,'idle');assert.equal(clicks,0);f.api.dispose();
});

test('runtime CSS references exactly two atlases and retains live circular map plus distinct PC/touch layouts',async()=>{
 const css=await fs.readFile(new URL('../src/hud-raster-v1.css',import.meta.url),'utf8'),code=await fs.readFile(new URL('../src/hud-raster-v1.js',import.meta.url),'utf8');
 assert.deepEqual([...css.matchAll(/url\('([^']+)'\)/g)].map(match=>match[1]),['./hud-v1-art/combat-press-4x4.png','./hud-v1-art/menu-press-4x4.png']);
 assert.match(css,/#dot-minimap canvas\{border-radius:50%/);assert.doesNotMatch(css,/content:'LIVE'/);assert.match(css,/#player-stamina\{grid-column:1;/);assert.match(css,/\[data-hud-input=pc\].*#joystick/);assert.match(css,/\[data-hud-input=touch\]/);assert.doesNotMatch(code,/requestAnimationFrame\(|setInterval\(|setTimeout\(/);
 const provenance=JSON.parse(await fs.readFile(new URL('../src/hud-v1-art/source.json',import.meta.url),'utf8'));assert.equal(provenance.files.length,2);for(const file of provenance.files){const bytes=await fs.readFile(new URL('../src/hud-v1-art/'+file.name,import.meta.url));assert.equal(bytes.readUInt32BE(16),1024);assert.equal(bytes.readUInt32BE(20),1024);}
});
