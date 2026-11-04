import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {releaseRoute,releaseSelectionUrl,releaseSelectionValue,MOONFOREST_RELEASE} from '../src/release-route.js';
import {travelUrl} from '../src/map-route.js';
import {uiTestRoute,uiTestSelectionUrl} from '../src/ui-test-route.js';

test('MoonForest 0.1 entry starts in the production village with a separate release identity',()=>{
 const route=releaseRoute('https://test.invalid/?character=moonforest-0.1&uiTest=1&arrival=portal&from=warrior-v5&elenaReview=battle&rev=abc');
 assert.equal(route.enabled,true);assert.equal(route.url.searchParams.get('character'),'warrior-v3');
 assert.equal(route.url.searchParams.get('rev'),'abc');assert.equal(uiTestRoute(route.url).enabled,false);
 for(const key of ['arrival','from','elenaReview'])assert.equal(route.url.searchParams.has(key),false);
 assert.equal(releaseSelectionValue(true,'warrior-v3'),MOONFOREST_RELEASE);
});
test('release identity survives repeated four-map portal travel without replacing map IDs or input options',()=>{
 let href=releaseRoute('https://test.invalid/?character=moonforest-0.1&fps=60&camera=follow').url.href;
 for(let round=0;round<3;round++)for(const id of ['warrior-plains','warrior-v4','warrior-v5','warrior-v4','warrior-plains','warrior-v3']){
  href=travelUrl(href,id);const route=releaseRoute(href);
  assert.equal(route.enabled,true);assert.equal(route.url.searchParams.get('character'),id);
  assert.equal(route.url.searchParams.get('fps'),'60');assert.equal(route.url.searchParams.get('camera'),'follow');
 }
});
test('selecting another version or UI test exits release mode; legacy links remain identical',()=>{
 const release='https://test.invalid/?character=warrior-v5&release=moonforest-0.1&arrival=portal&from=warrior-v4';
 for(const id of ['archer','warrior-v3','warrior-v5','ui-test']){
  let url=releaseSelectionUrl(release,id);if(id==='ui-test')url=uiTestSelectionUrl(url,id);
  assert.equal(releaseRoute(url).enabled,false);assert.equal(url.searchParams.has('arrival'),false);
  assert.equal(uiTestRoute(url).enabled,id==='ui-test');
 }
 const legacy='https://test.invalid/?character=warrior-v5&uiTest=1';
 assert.equal(releaseRoute(legacy).url.href,legacy);assert.equal(releaseSelectionValue(false,'warrior-v5'),'warrior-v5');
 assert.equal(releaseSelectionValue(true,'warrior-v3',true),'ui-test');
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(html,/<option value="moonforest-0\.1">MoonForest 0\.1 ver<\/option>/);
});
