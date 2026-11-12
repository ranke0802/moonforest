import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {releaseRoute,releaseSelectionUrl,releaseSelectionValue,MOONFOREST_RELEASE,MOONFOREST_RELEASE_V2} from '../src/release-route.js';
import {releaseStorage} from '../src/release-storage.js';
import {travelUrl} from '../src/map-route.js';
import {setupMotionSpeedControls} from '../src/motion-speed-controls.js';

const storage=initial=>{const values=new Map(Object.entries(initial??{}));return {values,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};};

test('0.2 entry, alias and query retain independent identity through four-map travel',()=>{
 for(const href of ['https://test.invalid/game/moonforest-0.2.html','https://test.invalid/game/moonforest-0.2.html?character=moonforest-0.2&uiTest=1&arrival=portal&from=warrior-v5','https://test.invalid/game/index.html?character=warrior-v3&release=moonforest-0.2']){
  let route=releaseRoute(href);assert.equal(route.enabled,true);assert.equal(route.release,MOONFOREST_RELEASE_V2);assert.equal(route.label,'MoonForest 0.2 ver');assert.equal(route.url.searchParams.get('character'),'warrior-v3');
  for(let round=0;round<3;round++)for(const character of ['warrior-plains','warrior-v4','warrior-v5','warrior-v4','warrior-plains','warrior-v3']){
   route=releaseRoute(travelUrl(route.url,character));assert.equal(route.release,MOONFOREST_RELEASE_V2);assert.equal(route.url.searchParams.get('character'),character);
   assert.equal(releaseSelectionValue(route.enabled,character,false,route.release),MOONFOREST_RELEASE_V2);
  }
 }
 const explicit=releaseRoute('https://test.invalid/game/moonforest-0.2.html?character=warrior-v5');assert.equal(explicit.url.searchParams.get('character'),'warrior-v5');
});
test('selecting 0.1 loads the preserved entry and legacy selections leave the 0.2 entry',()=>{
 const href='https://test.invalid/game/moonforest-0.2.html?release=moonforest-0.2&character=warrior-v5&arrival=portal&from=warrior-v4&rev=test';
 const old=releaseSelectionUrl(href,MOONFOREST_RELEASE);assert.equal(old.pathname,'/game/index.html');assert.equal(releaseRoute(old).release,MOONFOREST_RELEASE);assert.equal(old.searchParams.get('rev'),'test');
 const legacy=releaseSelectionUrl(href,'warrior-v5');assert.equal(legacy.pathname,'/game/index.html');assert.equal(releaseRoute(legacy).enabled,false);assert.equal(legacy.searchParams.has('arrival'),false);
 const next=releaseSelectionUrl('https://test.invalid/game/index.html?character=moonforest-0.1',MOONFOREST_RELEASE_V2);assert.equal(next.pathname,'/game/moonforest-0.2.html');assert.equal(releaseRoute(next).release,MOONFOREST_RELEASE_V2);
 const original=readFileSync(new URL('../index.html',import.meta.url),'utf8'),entry=readFileSync(new URL('../moonforest-0.2.html',import.meta.url),'utf8');
 assert.doesNotMatch(original,/<option value="moonforest-0\.2">/);assert.match(entry,/<option value="moonforest-0\.2">MoonForest 0\.2 ver<\/option>/);assert.match(entry,/moonforest-0\.2\.webmanifest/);
});
test('0.2 inherits preferences read-only, isolates boss patterns and keeps removals private',()=>{
 const raw=storage({preference:'approved','moonforest-boss-patterns-v1':'old patterns',journey:'old journey'}),wrapped=releaseStorage(raw,MOONFOREST_RELEASE_V2);
 assert.equal(releaseStorage(raw,MOONFOREST_RELEASE),raw);assert.equal(wrapped.getItem('preference'),'approved');assert.equal(wrapped.getItem('moonforest-boss-patterns-v1'),null);
 wrapped.setItem('preference','new');wrapped.setItem('moonforest-boss-patterns-v1','new patterns');wrapped.removeItem('journey');
 assert.equal(wrapped.getItem('preference'),'new');assert.equal(wrapped.getItem('journey'),null);assert.equal(raw.getItem('preference'),'approved');assert.equal(raw.getItem('journey'),'old journey');assert.equal(raw.getItem('moonforest-boss-patterns-v1'),'old patterns');
 wrapped.setItem('journey','new journey');assert.equal(wrapped.getItem('journey'),'new journey');assert.equal(raw.getItem('journey'),'old journey');
 assert.equal(releaseStorage(raw,MOONFOREST_RELEASE_V2,{inherit:false}).getItem('other'),null);
 assert.equal(releaseStorage(undefined,MOONFOREST_RELEASE_V2).getItem('missing'),null);
});
test('motion controls use injected version storage without touching the global store',t=>{
 const oldDocument=globalThis.document,globalStore=Object.getOwnPropertyDescriptor(globalThis,'localStorage'),dom=parseHTML(readFileSync(new URL('../moonforest-0.2.html',import.meta.url),'utf8'));
 globalThis.document=dom.document;Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw Error('Global storage must not be used');}});
 t.after(()=>{globalThis.document=oldDocument;if(globalStore)Object.defineProperty(globalThis,'localStorage',globalStore);else delete globalThis.localStorage;});
 const raw=storage({'warrior-v2-motion-speeds-v2':JSON.stringify({dodge:1.2})}),before=raw.getItem('warrior-v2-motion-speeds-v2'),values=[];
 setupMotionSpeedControls({storage:releaseStorage(raw,MOONFOREST_RELEASE_V2),getController:()=>({setMotionSpeed:(state,value)=>values.push({state,value})}),beforeOpen(){}});
 const input=dom.document.querySelector('#dodge-speed');assert.equal(input.value,'1.2');input.value='1.6';input.dispatchEvent(new dom.window.Event('input'));
 assert.equal(raw.getItem('warrior-v2-motion-speeds-v2'),before);assert.equal(JSON.parse(raw.getItem('moonforest-0.2:storage:warrior-v2-motion-speeds-v2')).dodge,1.6);assert.ok(values.some(value=>value.state==='dodge'&&value.value===1.6));
});
