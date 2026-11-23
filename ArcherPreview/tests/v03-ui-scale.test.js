// 0.3 screen UI on large PC windows (2026-11-23): one zoom factor above the
// 1280x720 reference window, touch screens untouched, guide cards within three
// lines, and every zoomed rule divides its viewport units by the same factor.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseHTML} from 'linkedom';
import {UI_REFERENCE,uiScaleFor,setupUiScale} from '../src/v03/ui-scale.js';
import * as chapter1 from '../src/v03/data/chapter1.js';
import {LANGUAGES} from '../src/v03/i18n.js';

const css=fs.readFileSync(new URL('../src/v03/v03.css',import.meta.url),'utf8');

test('the UI scale follows the window above the reference and never below it',()=>{
 assert.equal(uiScaleFor({width:1280,height:720}),1);
 assert.equal(uiScaleFor({width:1024,height:640}),1,'small windows keep the pixel layout');
 assert.equal(uiScaleFor({width:1920,height:1080}),1.5);
 assert.equal(uiScaleFor({width:2560,height:1440}),2);
 assert.equal(uiScaleFor({width:3440,height:1440}),2,'an ultra-wide window is bound by its height');
 assert.equal(uiScaleFor({width:1920,height:900}),1.25,'rounded to the 0.05 step');
 assert.equal(uiScaleFor({width:7680,height:4320}),UI_REFERENCE.max);
 assert.equal(uiScaleFor({width:1920,height:1080,coarse:true}),1,'touch screens keep their tuned layout');
 assert.equal(uiScaleFor({width:0,height:0}),1);
});

test('setupUiScale writes the factor only when it changes and clears it on dispose',()=>{
 const {document}=parseHTML('<!doctype html><html><body></body></html>'),listeners={},root=document.documentElement;let coarse=false,writes=0;
 const doc={documentElement:{dataset:root.dataset,style:{setProperty:(name,value)=>{writes++;root.style.setProperty(name,value);},removeProperty:name=>root.style.removeProperty(name)}}};
 const view={innerWidth:1920,innerHeight:1080,addEventListener:(type,fn)=>{listeners[type]=fn;},removeEventListener:type=>{delete listeners[type];},
  matchMedia:()=>({get matches(){return coarse;},addEventListener:(type,fn)=>{listeners.media=fn;},removeEventListener:()=>{delete listeners.media;}})};
 const scale=setupUiScale({view,doc});
 assert.equal(root.style.getPropertyValue('--v03-ui'),'1.5');assert.equal(root.dataset.v03Zoom,'');assert.equal(scale.scale,1.5);
 listeners.resize();listeners.resize();assert.equal(writes,1,'an unchanged size writes nothing');
 view.innerWidth=1280;view.innerHeight=720;listeners.resize();
 assert.equal(root.style.getPropertyValue('--v03-ui'),'');assert.equal(root.dataset.v03Zoom,undefined);
 view.innerWidth=2560;view.innerHeight=1440;listeners.resize();assert.equal(root.style.getPropertyValue('--v03-ui'),'2');
 coarse=true;listeners.media();assert.equal(root.dataset.v03Zoom,undefined,'a touch screen drops the zoom');
 coarse=false;listeners.media();scale.dispose();
 assert.equal(root.style.getPropertyValue('--v03-ui'),'');assert.equal(root.dataset.v03Zoom,undefined);assert.equal(listeners.resize,undefined);
});

// Selectors zoomed by html[data-v03-zoom] (or inside a zoomed panel). A
// viewport unit in one of their rules, in 0.3's or the shared stylesheets, must
// be divided by --v03-ui, or a large window counts its size twice.
const ZOOMED=['v03-quest','v03-hint','v03-banner','v03-place','v03-tip','v03-prompt','v03-caption','v03-dialogue-box','v03-dialogue-who','v03-dialogue-text','v03-dialogue-next','v03-title-inner','v03-title-head','v03-menu','v03-title-foot','v03-panel','v03-opening-line','v03-opening-skip','v03-vital',
 'hud-layout-panel','hud-layout-options','topbar','top-actions','gold-balance','dot-minimap','right-tools','boss-hud','keyboard-hint','action-controls','action-button','player-hud','map-travel','motion-speed-dialog','help-dialog','minimap-travel-dialog','death-dialog','death-screen'];
const FIXED=['portrait','bubble','v03-ring','v03-focus','toast'];
const SHEETS=['v03/v03.css','styles.css','mobile-ui.css','hud-layout.css','hud-raster-v1.css','dot-minimap.css','chapter-quest.css','commercial-ui.css'];
test('zoomed rules divide their viewport units by the UI scale',()=>{
 const raw=[];
 for(const sheet of SHEETS){
  const text=fs.readFileSync(new URL(`../src/${sheet}`,import.meta.url),'utf8').replace(/\/\*[\s\S]*?\*\//g,'');
  for(const [,selector,body] of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)){
   if(!ZOOMED.some(name=>selector.includes(name))||FIXED.some(name=>selector.includes(name)))continue;
   for(const [unit] of body.matchAll(/\b\d*\.?\d+(?:vw|vh|vmin|vmax|dvh|svh|lvh|dvw)\b(?! \/ var\(--v03-ui,1\))/g))raw.push(`${sheet}: ${selector.trim().slice(0,60)} → ${unit}`);
  }
  // Custom properties are substituted where they are used, so a size variable
  // set on #app and read by a zoomed panel needs the same division.
  for(const [declaration] of text.matchAll(/--[\w-]+:[^;{}]*/g))for(const [unit] of declaration.matchAll(/\b\d*\.?\d+(?:vw|vh|vmin|vmax|dvh|svh)\b(?! \/ var\(--v03-ui,1\))/g))raw.push(`${sheet}: ${declaration.slice(0,40)} → ${unit}`);
 }
 assert.deepEqual(raw,[]);
 const zoom=[...css.matchAll(/html\[data-v03-zoom\][^{]*\{zoom:var\(--v03-ui,1\)\}/g)].map(m=>m[0]).join('\n');
 for(const name of ['v03-dialogue-box','v03-tip','v03-quest','player-hud','dot-minimap','action-controls','.boss-hud','hud-layout-panel','.help-dialog','.motion-speed-dialog','.minimap-travel-dialog','.death-screen'])assert.ok(zoom.includes(name),`${name} is zoomed`);
 for(const name of ['portrait','v03-bubble','v03-ring','#toast'])assert.ok(!zoom.includes(name),`${name} stays at its anchored pixel size`);
});

test('a guide card shows its whole text: the copy fits, nothing is clipped',()=>{
 const body=css.match(/\.v03-tip-body\{[^}]*\}/)?.[0]??'';
 assert.ok(body,'one body paragraph under the title');assert.doesNotMatch(body,/line-clamp|overflow:hidden|text-overflow/);
});

// Coarse width budget for the two body lines (lead + text). The real check is a
// font measurement in the browser (2026-11-23: every tip fits two lines at the
// 300px PC card and the 256px phone card); this keeps new copy near that size.
const wide=/[ᄀ-ᇿ　-ヿ㄰-㆏㐀-鿿가-힯＀-￯]/u;
const units=text=>[...text].reduce((sum,ch)=>sum+(wide.test(ch)?1:ch===' '?.45:.6),0);
const BUDGET={ko:39.5,ja:39.5,zh:39.5,en:41,vi:45};
test('guide card copy fits the two-line budget in every language',async()=>{
 const over=[];
 for(const {id} of LANGUAGES){
  const tips=id==='ko'?null:(await import(`../src/v03/locales/${id}.js`)).default.story.tips;
  for(const tip of chapter1.TIPS){const row=tips?.[tip.id]??tip;for(const key of ['keys','touch']){const size=units(`${row[key]} ${row.text}`);if(size>BUDGET[id])over.push(`${id}.${tip.id}.${key} ${size.toFixed(1)}`);}}
 }
 assert.deepEqual(over,[]);
});
