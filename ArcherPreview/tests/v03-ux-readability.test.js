// Readability and touch targets on 0.3 (2026-11-26, audit "화면·조작", DESIGN.md:
// text 13 px and targets 44 px on phones, nothing under 12 px). CSS-text checks:
// the 0.3 stylesheets keep every font at 12 px or more, the touch block keeps the
// 13 px / 44 px minimums, the shared sheets are overridden only under the 0.3
// edition, and the settings dialog uses the 0.3 tokens.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {releaseRoute} from '../src/release-route.js';

const read=path=>fs.readFileSync(new URL(`../src/${path}`,import.meta.url),'utf8').replace(/\/\*[\s\S]*?\*\//g,'');
const V03=read('v03/v03.css'),MENU=read('v03/character-menu.css'),SHOP=read('v03/town-shop.css'),CARD=read('v03/equipment-card.css'),BENCH=read('v03/forge-bench.css');
const EDITION='html[data-edition="moonforest-0.3"]';
// Every rule with its selector and the media query it sits in ('' at top level).
function rules(text){
 const out=[];let depth=0,media=[''],start=0;
 for(let i=0;i<text.length;i++){
  if(text[i]==='{'){const head=text.slice(start,i).trim();if(head.startsWith('@')){media.push(head);start=i+1;depth++;continue;}
   const end=text.indexOf('}',i);out.push({media:media.at(-1),selector:head,body:text.slice(i+1,end)});i=end;start=i+1;continue;}
  if(text[i]==='}'){media.pop();start=i+1;depth--;}
 }
 return out;
}
// The smallest size a font declaration can reach: px, rem (16 px root) or the clamp() floor.
function floorPx(value){
 const clamp=/clamp\(\s*([\d.]+)(px|rem)/.exec(value);if(clamp)return +clamp[1]*(clamp[2]==='rem'?16:1);
 const size=/(?:^|\s)([\d.]+)(px|rem)\b/.exec(value);return size?+size[1]*(size[2]==='rem'?16:1):null;
}
function fonts(text){
 const out=[];
 for(const rule of rules(text))for(const [,prop,value] of rule.body.matchAll(/(?:^|;)\s*(font-size|font)\s*:([^;]+)/g)){const px=floorPx(value.trim());if(px!==null)out.push({...rule,prop,value:value.trim(),px});}
 return out;
}

test('no 0.3 stylesheet sets a font under 12 px',()=>{
 const small=[];
 for(const [name,text] of [['v03.css',V03],['character-menu.css',MENU],['town-shop.css',SHOP],['equipment-card.css',CARD]])
  for(const f of fonts(text))if(f.px<12)small.push(`${name}: ${f.selector.slice(0,70)} → ${f.prop}:${f.value}`);
 assert.deepEqual(small,[]);
});

test('phones read 13 px in the play HUD, menus and settings',()=>{
 const touch=rules(V03).filter(r=>r.media.includes('pointer:coarse'));
 const size=name=>touch.filter(r=>r.selector.includes(name)).map(r=>floorPx(/font-size:([^;]+)/.exec(r.body)?.[1]??'')).filter(v=>v!==null);
 for(const name of ['.v03-quest-kicker','.v03-errand-title','.v03-errand-step','.v03-prompt-action','.v03-tip-text','#player-health','#gold-balance','.mf-weapon-condition','#dot-minimap>strong','.v03-title-kicker','.v03-title-sub','.v03-slot-detail','#motion-speed-description']){
  assert.ok(size(name).length,`${name} has a touch size`);assert.ok(Math.min(...size(name))>=13,`${name} ≥ 13 px on touch`);
 }
});

test('pressed things are 44 px on phones',()=>{
 const touch=rules(V03).filter(r=>r.media.includes('pointer:coarse'));
 const has=(list,name,re)=>list.some(r=>r.selector.includes(name)&&re.test(r.body));
 for(const name of ['.v03-menu-item','.v03-panel-back','.v03-panel-accept','.settings-section>summary','#close-motion-speed'])assert.ok(has(touch,name,/min-height:44px/),name);
 assert.match(V03,/\.mf-potion-picker button\{[^}]*min-height:44px/);
 assert.match(V03,/\.v03-language-row select\{[^}]*min-height:44px/);
 assert.match(MENU,/\.mf-character-menu nav button,\.mf-menu-filters button,\.mf-character-menu select,\.mf-menu-item button\{min-height:44px/);
 assert.match(MENU,/\.mf-menu-filters button\{min-width:44px\}/);
 const menuTouch=rules(MENU).filter(r=>r.media.includes('pointer:coarse'));
 for(const name of ['.mf-menu-potion-slots button','.mf-skill-training button','.mf-skill-invest','button.mf-skill-node'])assert.ok(has(menuTouch,name,/min-height:44px/),name);
 const shopTouch=rules(SHOP).filter(r=>r.media.includes('pointer:coarse'));
 assert.ok(has(shopTouch,'.mf-town-shop button',/min-height:2\.75rem/),'shop buttons 2.75rem (44 px)');
});

test('the bag detail labels and the forge cells read at the body size',()=>{
 assert.match(MENU,/\.mf-menu-item \.mf-equipment-card small,\.mf-menu-item \.mf-menu-quantity\{[^}]*font-size:inherit/);
 // The forge is the bench since 2026-11-27 (forge-bench.css); the old gauge view's rules are gone.
 const sizes=(selector,media='')=>rules(BENCH).filter(r=>r.media===media&&r.selector.split(',').includes(selector)).map(r=>/font-size:([^;}]+)/.exec(r.body)?.[1]).filter(Boolean);
 const body=+/([\d.]+)rem/.exec(sizes('.mf-bench .mf-forge-item dl')[0])[1];
 const cells=sizes('.mf-bench-legend li').map(v=>+/([\d.]+)rem/.exec(v)[1]);
 assert.ok(cells.length&&cells.every(v=>v>=body),`forge cells ${cells} ≥ the card's ${body}rem`);
 // On touch screens both read at the same 13 px floor.
 assert.ok(rules(BENCH).some(r=>r.media.includes('pointer:coarse')&&/\.mf-bench-legend li/.test(r.selector)&&/\.mf-bench \.mf-forge-item dl/.test(r.selector)&&/font-size:max\(13px/.test(r.body)));
 // On short landscape screens the card and the cells share the left column beside the bench.
 const short=rules(BENCH).filter(r=>r.media.includes('max-height:500px'));
 assert.ok(short.some(r=>r.selector==='.mf-bench'&&/grid-template-areas:"side focus" "legend focus" "legend foot"/.test(r.body)));
 assert.equal(/\.mf-forge-(gauge|legend|track|rail)\b/.test(SHOP),false,'no old gauge rules left in town-shop.css');
});

test('shared stylesheets are overridden only under the 0.3 edition',()=>{
 // The edition attribute is written by main.js from releaseRoute(): 0.3 (and its
 // 0.4 world entry) only, never the 0.2 entry.
 assert.equal(releaseRoute('http://127.0.0.1:4173/moonforest-0.2.html').edition,null);
 assert.equal(releaseRoute('http://127.0.0.1:4173/moonforest-0.3.html').edition,'moonforest-0.3');
 const shared=['#dot-minimap','#potion-count','.keyboard-hint strong','#motion-speed-dialog'];
 const loose=rules(V03).filter(r=>shared.some(name=>r.selector.includes(name))&&!/html\[data-v03-talk\]|html\[data-v03-zoom\]/.test(r.selector))
  .flatMap(r=>r.selector.split(/,(?![^()]*\))/)).filter(sel=>shared.some(name=>sel.includes(name))&&!sel.trim().startsWith(EDITION));
 assert.deepEqual(loose,[]);
 for(const name of ['#dot-minimap>strong','#potion-count','.keyboard-hint strong'])
  assert.ok(fonts(V03).some(f=>f.selector.startsWith(EDITION)&&f.selector.includes(name)&&f.px>=12),name);
});

test('the settings dialog is drawn with the 0.3 tokens',()=>{
 const S=`${EDITION} #motion-speed-dialog.game-settings`;
 const own=rules(V03).filter(r=>r.selector.startsWith(S));
 const body=sel=>own.find(r=>r.selector===S+sel)?.body??'';
 assert.match(body(''),/background:var\(--mf-panel\)/);assert.match(body(''),/border:1px solid var\(--mf-line-mid\)/);
 assert.match(body(''),/border-radius:var\(--mf-radius-lg\)/);assert.match(body(''),/font-family:var\(--v03-font\)/);
 assert.match(own.map(r=>r.selector+'{'+r.body).join('\n'),/:is\(select,button,input[^{]*\{[^}]*background:var\(--mf-panel-raised\)[^}]*border-radius:var\(--mf-radius\)/);
 assert.ok(own.some(r=>/accent-color:var\(--mf-gold-hi\)/.test(r.body)),'sliders and boxes take the gold accent');
 assert.ok(own.some(r=>/:focus-visible/.test(r.selector)&&/outline:2px solid var\(--mf-focus\)/.test(r.body)),'one focus ring');
 for(const r of own)assert.doesNotMatch(r.body,/#(131b2b|111a2c|171e31|252b42|726286)/i,'no 0.1/0.2 navy');
});
