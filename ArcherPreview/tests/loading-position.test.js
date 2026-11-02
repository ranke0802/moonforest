import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {createRequire} from 'node:module';
import {createLoadingView} from '../src/loading-view.js';
const require=createRequire(import.meta.url),{parse}=require('@acemir/cssom');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
function loadingStyle(doc,height){
 const result={},element=doc.getElementById('loading');
 function walk(rules){for(const rule of rules){if(rule.media){const max=Number(rule.media.mediaText.match(/max-height:\s*(\d+)px/)?.[1]);if(height<=max)walk(rule.cssRules);}else if(rule.selectorText&&element.matches(rule.selectorText)){for(let i=0;i<rule.style.length;i++){const key=rule.style[i];result[key]=rule.style.getPropertyValue(key);}}}}
 walk(parse(doc.querySelector('head style').textContent).cssRules);return result;
}
test('short landscape loading stays centered for every map/retry; expanded failure stays scrollable',()=>{
 const {document}=parseHTML(html),view=createLoadingView(document);
 for(const height of [294,360,393,412,590,852])for(let trip=0;trip<6;trip++){
  view.begin();let style=loadingStyle(document,height);assert.equal(style.position,'fixed');assert.equal(style.height,'100%');assert.equal(style.transform,'none');assert.equal(style['justify-content'],'center',`${height}px normal loading`);
  view.preparing();assert.equal(loadingStyle(document,height)['justify-content'],'center');view.fail('오류','시간 초과',{error:new Error('timeout')});style=loadingStyle(document,height);assert.equal(style.overflow,'auto');assert.equal(style['justify-content'],height<=450?'flex-start':'center');
  view.begin();assert.equal(loadingStyle(document,height)['justify-content'],'center','retry removes error-only alignment');view.reveal();
 }
});
