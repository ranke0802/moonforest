import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {NullEngine} from '@babylonjs/core';
import {createWorld,replaceWorldMap} from '../src/world.js';
import {CAVE_STORY_INSPECTIONS,nearestCaveInspection,setupCaveStoryInspection} from '../src/cave-story-inspection.js';

function fixture(t){
 const {document:doc,window}=parseHTML(readFileSync(new URL('../index.html',import.meta.url),'utf8'));
 const dialog=doc.getElementById('help-dialog');dialog.showModal=()=>{dialog.open=true;dialog.setAttribute('open','');};dialog.close=()=>{dialog.open=false;dialog.removeAttribute('open');dialog.dispatchEvent(new window.Event('close'));};
 const engine=new NullEngine(),world=createWorld(engine,{cave:true,touchDevice:true}),point=CAVE_STORY_INSPECTIONS[0],state={position:{x:point.placement.x+2,z:point.placement.z},loading:false};
 world.caveFog.fog.ready=true;world.caveFog.fog.stateAt=()=>2;
 world.villageRenderRecords=CAVE_STORY_INSPECTIONS.map(p=>({placement:p.placement,root:{isEnabled:()=>true},meshes:[{isVisible:true,isEnabled:()=>true,metadata:{caveFogVisible:true}}]}));
 let time=0,opens=0;const options={world,getState:()=>state,onOpen:()=>opens++,document:doc,now:()=>time};
 const api=setupCaveStoryInspection(options);t.after(()=>{api.dispose();engine.dispose();});
 return {doc,window,dialog,world,state,api,options,advance(){time+=200;api.update();},opens:()=>opens};
}

test('existing refuge, laboratory and Joachim props offer a single nearby visible inspection only outside combat',t=>{
 const f=fixture(t),button=f.doc.getElementById('cave-inspect');
 for(const point of CAVE_STORY_INSPECTIONS){f.state.position={x:point.placement.x+1,z:point.placement.z};f.advance();assert.equal(button.hidden,false);assert.match(button.textContent,new RegExp(point.label));assert.equal(nearestCaveInspection(f.world,f.state),point);}
 for(const key of ['loading','dead','combat','busy']){f.state[key]=true;f.advance();assert.equal(button.hidden,true,key);f.state[key]=false;}
 f.world.caveFog.fog.stateAt=()=>1;f.advance();assert.equal(button.hidden,true,'unseen or memory-only prop cannot be inspected');
 f.world.caveFog.fog.stateAt=()=>2;f.world.villageRenderRecords.at(-1).meshes[0].isVisible=false;f.advance();assert.equal(button.hidden,true,'cold, culled or unloaded prop cannot be inspected');
 f.state.position={x:0,z:0};f.advance();assert.equal(button.hidden,true);
});

test('inspection reuses the existing help modal and restores the original guide without moving any action control',t=>{
 const f=fixture(t),button=f.doc.getElementById('cave-inspect'),ids=['attack-button','dodge-button','guard-button','potion-button','fullscreen-button'],controls=ids.map(id=>f.doc.getElementById(id));
 button.click();assert.equal(f.dialog.open,true);assert.equal(f.opens(),1);assert.equal(f.dialog.dataset.caveStory,'refuge');assert.equal(f.doc.querySelectorAll('.cave-story-content').length,1);
 assert.match(f.dialog.querySelector('.cave-story-content').textContent,/요아힘/);assert.equal(button.hidden,true);
 f.dialog.close();assert.equal(f.dialog.hasAttribute('data-cave-story'),false);assert.equal(f.dialog.querySelector('.cave-story-content').hidden,true);
 f.doc.getElementById('help-toggle').click();assert.equal(f.dialog.hasAttribute('data-cave-story'),false);assert.ok(f.dialog.querySelector('.help-columns'));
 for(const [i,id]of ids.entries())assert.strictEqual(f.doc.getElementById(id),controls[i]);
 f.advance();f.state.combat=true;button.click();assert.equal(f.dialog.open,false,'stale button cannot pause a newly started battle');
});

test('map trips and reinitialisation keep one observer, prompt and modal section and remove all ownership on dispose',async t=>{
 // Babylon Observable.remove unregisters in setTimeout(0), not a microtask.
 const settle=()=>new Promise(resolve=>setTimeout(resolve,5)),f=fixture(t);await settle();const before=f.world.scene.onBeforeRenderObservable.observers.length;
 for(let i=0;i<12;i++){
  replaceWorldMap(f.world,'warrior-v4');f.advance();assert.equal(f.doc.getElementById('cave-inspect').hidden,true);assert.equal(f.doc.getElementById('app').classList.contains('cave-map'),false);
  replaceWorldMap(f.world,'warrior-v5');f.world.caveFog.fog.ready=true;f.world.caveFog.fog.stateAt=()=>2;f.advance();await settle();assert.equal(f.doc.getElementById('app').classList.contains('cave-map'),true);assert.equal(f.world.scene.onBeforeRenderObservable.observers.length,before);
 }
 const again=setupCaveStoryInspection(f.options);await settle();assert.equal(f.doc.querySelectorAll('#cave-inspect').length,1);assert.equal(f.doc.querySelectorAll('.cave-story-content').length,1);assert.equal(f.world.scene.onBeforeRenderObservable.observers.length,before);
 again.dispose();again.dispose();await settle();assert.equal(f.doc.querySelector('#cave-inspect'),null);assert.equal(f.world.scene.onBeforeRenderObservable.observers.length,before-1);
});

test('cave-only screen mask preserves the lower walking surface, and the story dialog remains in the existing pause/input route',()=>{
 const css=readFileSync(new URL('../src/cave-story.css',import.meta.url),'utf8'),main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 assert.match(css,/#app\.cave-map > \.vignette/);assert.match(css,/transparent 87%,rgba\(6,10,20,\.15\)/);assert.match(css,/#cave-inspect\{[^}]*min-height:44px/);
 assert.match(css,/top:min\(calc\(env\(safe-area-inset-top\) \+ 138px\),calc\(55dvh - 56px\)\)/);
 for(const [w,h,safeTop]of [[320,568,0],[393,852,59],[852,393,0],[844,390,0],[568,320,0]]){
  const top=Math.min(safeTop+138,h*.55-56);assert.ok(top+44<=h*.55-12,'prompt hitbox stays wholly above the move zone at '+w+'x'+h);
 }
 assert.match(main,/setupCaveStoryInspection\(\{world/);assert.match(main,/'#help-dialog'\)\.open/);assert.match(main,/'#help-dialog',/);
});
