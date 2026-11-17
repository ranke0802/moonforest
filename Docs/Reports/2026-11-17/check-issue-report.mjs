import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html=readFileSync(resolve(import.meta.dirname,'MOONFOREST_미해결문제_개선과제_현황.html'),'utf8');
const data=JSON.parse(html.match(/<script id="report-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
const code=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x=>x[1]).join('\n');
new vm.Script(code);
assert.equal(data.issues.length,26);assert.equal(new Set(data.issues.map(x=>x.id)).size,26);
const summaries=[...html.matchAll(/<details class="issue"[^>]*>/g)];
assert.equal(summaries.length,26);assert(summaries.every(x=>! /\bopen\b/.test(x[0])));
assert(!/<(?:script|link)\b[^>]*(?:src|href)=["']https?:/i.test(html));
assert(!/[\u3040-\u30ff]/u.test(html));
const nodes=new Map();function node(id){if(!nodes.has(id))nodes.set(id,{id,value:'',textContent:'',hidden:false,open:false,classList:{toggle(){},contains:()=>true},addEventListener(){},append(){},click(){},remove(){}});return nodes.get(id)}
node('report-data').textContent=JSON.stringify(data);
const cards=data.issues.map(x=>node(x.id));
const sandbox={console,JSON,String,Map,Blob,decodeURIComponent,setTimeout:f=>f(),URL:{createObjectURL:()=> 'blob:report',revokeObjectURL(){}},navigator:{},
 location:{hash:''},document:{getElementById:node,querySelectorAll:()=>cards,addEventListener(){},body:node('body'),createElement:()=>node('download')}};
vm.createContext(sandbox);vm.runInContext(code,sandbox);
vm.runInContext('filter()',sandbox);assert(cards.every(x=>!x.hidden));
node('priority').value='1';vm.runInContext('filter()',sandbox);assert.equal(cards.filter(x=>!x.hidden).length,7);
node('expand').onclick();assert.equal(cards.filter(x=>x.open).length,7);
node('collapse').onclick();assert(cards.every(x=>!x.open));
node('priority').value='';node('category').value='음향';vm.runInContext('filter()',sandbox);assert.equal(cards.filter(x=>!x.hidden).length,2);
node('category').value='';node('status').value='review';vm.runInContext('filter()',sandbox);assert.equal(cards.filter(x=>!x.hidden).length,1);
node('status').value='';node('search').value='no-matching-issue';vm.runInContext('filter()',sandbox);assert(cards.every(x=>x.hidden));
node('search').value='';node('new-only').checked=true;vm.runInContext('filter()',sandbox);assert.equal(cards.filter(x=>!x.hidden).length,10);
node('new-only').checked=false;vm.runInContext('filter()',sandbox);node('export').onclick();
console.log(JSON.stringify({items:26,ownerAdditions:10,initiallyCollapsed:true,scriptSyntax:'passed',filters:'passed',expandCollapse:'passed',downloadHandler:'passed-in-node-mock',standalone:true,browserAutomation:false,gameCodeChanged:!!data.implementation?.applied?.length}));
