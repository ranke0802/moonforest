// UI tone pass (2026-11-26): the tokens, the shared keycap and focus ring, the
// riding art on the base sprite layer, and focus release on play-HUD buttons.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import postcss from 'postcss';
import {parseHTML} from 'linkedom';
import {setupHudRasterV1,HUD_RASTER_SPRITES} from '../src/hud-raster-v1.js';
import {createRidingControls} from '../src/v03/riding-controls.js';
import {createPlayHud} from '../src/v03/play-hud.js';
import {releaseFocusAfterPointer} from '../src/v03/hud-focus.js';

const read=path=>readFileSync(new URL('../src/'+path,import.meta.url),'utf8');
const strip=css=>css.replace(/\/\*[\s\S]*?\*\//g,'');
const rules=path=>{const out=[];postcss.parse(read(path)).walkRules(rule=>{const decls={};rule.walkDecls(d=>{decls[d.prop]=d.value;});out.push({selector:rule.selector,decls,text:rule.toString()});});return out;};
const v03=read('v03/v03.css'),riding=read('v03/riding-horse.css');

test('tokens of the tone table live in v03.css :root with the measured values',()=>{
 const root=rules('v03/v03.css').filter(rule=>rule.selector===':root').reduce((all,rule)=>Object.assign(all,rule.decls),{});
 const expect={'--mf-icon-box':'44px','--mf-icon-pad':'10%','--mf-line-icon-color':'#efe1b4','--mf-disc-face':'#524937','--mf-disc-rim':'#dfb481','--mf-disc-ink':'#ebd1aa',
  '--mf-line':'#c9b980','--mf-panel':'#14271e','--mf-panel-raised':'#223b29','--mf-radius':'3px','--mf-kbd-bg':'#1a140c','--mf-kbd-ink':'#f2dc9c','--mf-kbd-line':'var(--mf-line)',
  '--mf-badge-bg':'#1d3027','--mf-badge-line':'#cab984','--mf-badge-ink':'#f2e5bd','--mf-press-scale':'.94','--mf-touch-art':'.58','--mf-touch-art-press':'.84','--mf-focus':'#f1d99a','--mf-disabled':'.45'};
 for(const [name,value] of Object.entries(expect))assert.equal(root[name],value,name);
 // The 0.2 sprite CSS the tokens were measured against still has the badge it copies.
 assert.match(read('hud-raster-v1.css'),/#potion-count\{[^}]*border:1px solid #cab984;[^}]*background:#1d3027;color:#f2e5bd/);
});

test('one keycap rule styles every key on the play screen; the 0.1 blue is overridden',()=>{
 const keys=['.v03-prompt-key','.keyboard-hint kbd','[data-hud-sprite]>kbd','.mf-potion-bar kbd'];
 const shared=rules('v03/v03.css').filter(rule=>keys.every(key=>rule.selector.includes(key)));
 assert.equal(shared.length,1,'exactly one shared keycap rule');
 const d=shared[0].decls;assert.equal(d.color,'var(--mf-kbd-ink)');assert.equal(d.background,'var(--mf-kbd-bg)');assert.equal(d.border,'1px solid var(--mf-kbd-line)');assert.equal(d['border-radius'],'var(--mf-radius)');assert.equal(d['font-family'],'var(--v03-font)');
 for(const rule of rules('v03/v03.css'))if(rule.selector!==shared[0].selector&&keys.some(key=>rule.selector.split(',').some(part=>part.trim().endsWith(key.replace(/^\./,'.'))))){
  for(const prop of ['border','border-color','font-family'])assert.equal(rule.decls[prop],undefined,`${rule.selector} must not restyle ${prop}`);
  if(!/:hover|:focus-visible/.test(rule.selector))for(const prop of ['color','background','background-color'])assert.equal(rule.decls[prop],undefined,`${rule.selector} must not restyle ${prop}`);
 }
 assert.match(strip(v03),/html\[data-edition\] #app \.keyboard-hint\{color:var\(--mf-text-2\)\}/);
 assert.match(strip(v03),/html\[data-edition\] #app \.joystick-hint\{color:#ece0bcb3\}/);
 assert.doesNotMatch(strip(v03),/#47536d|#7c89a2|#7d8aa3/);
});

test('riding pictures use the raster strips on the base sprite layer, never the background shorthand',()=>{
 const css=strip(riding);
 assert.doesNotMatch(css,/(^|[;{\s])background\s*:/m,'no background shorthand in riding-horse.css');
 assert.doesNotMatch(css,/riding-horse\.svg|riding-gallop\.svg|scale\(\.9[34]\)/,'old SVG art and the scale stand-in are out of use');
 assert.match(css,/\.top-actions \.v03-ride-toggle > \.hud-v1-ride \{[^}]*background-image: url\('\.\/art\/menu-press-ride-1x4\.png'\);[^}]*background-size: 400% 100%;[^}]*background-position: var\(--hud-sprite-column, 0%\) 0%;/);
 assert.match(css,/:is\(#attack-button,#guard-button,#dodge-button\) > \.hud-v1-sprite \{[^}]*url\('\.\/art\/combat-press-ride-2x4\.png'\);[^}]*background-size: 400% 200%;/);
 assert.match(css,/:is\(#attack-button,#dodge-button\) > \.hud-v1-sprite \{\s*background-position: var\(--hud-sprite-column, 0%\) 0%;/);
 assert.match(css,/#guard-button > \.hud-v1-sprite \{\s*background-position: var\(--hud-sprite-column, 0%\) 100%;/);
 assert.match(css,/border: 1px solid var\(--mf-badge-line, #cab984\);[^}]*background-color: var\(--mf-badge-bg, #1d3027\);/);
 assert.equal((css.match(/%23f2e5bd/g)??[]).length,2,'badge marks use the badge ink');
 const meta=JSON.parse(read('v03/art/hud-ride-source.json'));
 for(const file of meta.files){const bytes=readFileSync(new URL('../src/v03/art/'+file.name,import.meta.url));
  assert.equal(bytes.length,file.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256);
  assert.equal(bytes.readUInt32BE(16),file.width);assert.equal(bytes.readUInt32BE(20),file.height);assert.equal(file.width,4*meta.cellSize);assert.equal(file.height,file.rows.length*meta.cellSize);}
});

test('top-bar line icons share the cream and glow tokens; fullscreen has round caps',()=>{
 const css=strip(v03);
 const fullscreen=rules('v03/v03.css').filter(rule=>rule.selector.includes('.commercial-top-fullscreen'));
 assert.ok(fullscreen.some(rule=>rule.decls.background==='var(--mf-line-icon-color)'));
 assert.ok(fullscreen.some(rule=>rule.decls.filter==='var(--mf-line-icon-glow)'&&rule.decls.width==='var(--mf-icon-box)'));
 assert.doesNotMatch(css,/stroke-linecap='square'|#e7d4a2/);
 assert.equal((css.match(/stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M(4 9V4h5|9 4v5H4)/g)??[]).length,4,'both marks, -webkit-mask and mask');
});

test('the riding toggle is a sprite of the base HUD: same layer, frame timing and key handling as the bag',()=>{
 assert.deepEqual(HUD_RASTER_SPRITES.ride,{selector:'.top-actions .v03-ride-toggle',atlas:'ride',row:0,key:'KeyH'});
 const {document,window}=parseHTML('<main id="app"><nav class="top-actions"><button data-chapter="bag">가방</button></nav><nav class="action-controls"><button id="attack-button"></button><button id="guard-button"></button><button id="dodge-button"></button></nav></main>');
 const root=document.querySelector('#app');let clock=0;
 const controls=createRidingControls(root,()=>{});const api=setupHudRasterV1({root,now:()=>clock});
 const labels={mount:'타기',dismount:'내리기',cancel:'취소',gallop:'질주'};
 controls.show('on-foot',true,labels);
 const ride=root.querySelector('.v03-ride-toggle');
 assert.equal(ride.dataset.hudSprite,'ride');assert.ok(ride.querySelector(':scope>.hud-v1-sprite.hud-v1-ride'));
 controls.show('mounted',true,labels);
 assert.ok(ride.querySelector('.hud-v1-ride'),'a caption change keeps the sprite layer');assert.equal(ride.textContent,'내리기');
 const key=new window.Event('keydown',{bubbles:true});Object.assign(key,{code:'KeyH',repeat:false});document.dispatchEvent(key);
 assert.equal(ride.dataset.hudSpriteState,'press');clock+=45;api.update();assert.equal(ride.dataset.hudSpriteState,'held');
 const up=new window.Event('keyup',{bubbles:true});up.code='KeyH';document.dispatchEvent(up);clock+=70;api.update();assert.equal(ride.dataset.hudSpriteState,'idle');
 controls.show('mounting',true,labels);assert.equal(ride.disabled,true);
 api.dispose();controls.dispose();
});

// linkedom has no focus model: give it the browser's (a mouse press focuses a
// button unless mousedown is prevented; Space/Enter on a focused button clicks it).
function focusDom(html){
 const {document,window}=parseHTML(html);let active=null;
 Object.defineProperty(document,'activeElement',{get:()=>active??document.body,configurable:true});
 const proto=Object.getPrototypeOf(document.createElement('button'));
 proto.focus=function(){active=this;};proto.blur=function(){if(active===this)active=null;};
 const press=node=>{
  const down=new window.Event('mousedown',{bubbles:true,cancelable:true});down.button=0;node.dispatchEvent(down);if(!down.defaultPrevented)node.focus();
  const click=new window.Event('click',{bubbles:true,cancelable:true});click.detail=1;node.dispatchEvent(click);
 };
 const key=code=>{const event=new window.Event('keydown',{bubbles:true,cancelable:true});event.code=code;(document.activeElement??document.body).dispatchEvent(event);
  const target=document.activeElement;if(target?.tagName==='BUTTON'&&(code==='Space'||code==='Enter')){const click=new window.Event('click',{bubbles:true});click.detail=0;target.dispatchEvent(click);}};
 return {document,window,press,key};
}

test('play-HUD buttons give focus back after a pointer press; Space/Enter cannot press them again',()=>{
 const f=focusDom('<html><body></body></html>');let interactions=0;
 const hud=createPlayHud({doc:f.document,onInteract:()=>interactions++});
 hud.setPrompt({key:'E',name:'노년 여성',action:'말 걸기',mark:null,act:'talk'});
 const prompt=f.document.querySelector('.v03-prompt');
 f.press(prompt);assert.equal(interactions,1);assert.notEqual(f.document.activeElement,prompt,'a mouse or touch press leaves no focus');
 f.key('Space');f.key('Enter');assert.equal(interactions,1,'game keys do not press the prompt');
 prompt.focus();const click=new f.window.Event('click',{bubbles:true});click.detail=0;prompt.dispatchEvent(click);
 assert.equal(f.document.activeElement,prompt,'a keyboard user who tabbed to it keeps focus');assert.equal(interactions,2);
 hud.dispose();
 const g=focusDom('<html><body><button id="b">b</button></body></html>'),b=g.document.getElementById('b'),stop=releaseFocusAfterPointer(b);
 b.focus();const c=new g.window.Event('click',{bubbles:true});c.detail=1;b.dispatchEvent(c);assert.notEqual(g.document.activeElement,b,'a pointer click that left focus releases it');
 stop();b.focus();b.dispatchEvent(c);assert.equal(g.document.activeElement,b,'dispose removes the listeners');
});

test('every 0.3 root outside #app and the shells has the one focus ring; nothing falls back to the browser ring',()=>{
 const css=strip(v03);
 assert.match(css,/\.v03-hud :is\(button,\[tabindex\]\):focus-visible,\.v03-bench :is\(button,\[tabindex\]\):focus-visible\{outline:2px solid var\(--mf-focus\);outline-offset:3px\}/);
 assert.match(css,/\[data-v03-layer\] button:focus-visible\{outline:2px solid var\(--mf-focus\);outline-offset:3px\}/);
 assert.match(css,/html\[data-edition\] :where\(button,\[tabindex\],a,select,input,summary,textarea\):focus-visible\{outline:2px solid var\(--mf-focus\);outline-offset:3px\}/);
 // Roots that src/v03 mounts on <body>: each must be covered by one of the rules above.
 const bodyRoots={'play-hud.js':'v03-hud','bench.js':'v03-bench'};
 for(const [file,cls] of Object.entries(bodyRoots)){assert.match(read('v03/'+file),new RegExp(`'${cls}'`));assert.match(css,new RegExp(`\\.${cls} :is\\(button`));}
 for(const file of ['dialogue.js','opening.js','orientation-gate.js','title-screen.js'])assert.match(read('v03/'+file),/v03Layer=/,file+' is a [data-v03-layer] shell');
 assert.doesNotMatch(css,/#f5d897;outline-offset/);
});
