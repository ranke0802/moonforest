import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {setupSettingsPanel} from '../src/settings-panel.js';
import {readFrameDiagnosticPreference} from '../src/frame-diagnostics.js';

test('real settings keep performance prose collapsed while toggle/copy/export and persistent top buttons retain identity',t=>{
 const {document:doc}=parseHTML(readFileSync(new URL('../index.html',import.meta.url),'utf8')),previous=globalThis.document;globalThis.document=doc;t.after(()=>{globalThis.document=previous;});
 const ids=['frame-diagnostics-toggle','copy-frame-diagnostics','reset-frame-diagnostics','frame-diagnostics-export','fullscreen-button','motion-speed-toggle','attack-button','guard-button','dodge-button','potion-button'],original=new Map(ids.map(id=>[id,doc.getElementById(id)]));
 let clicks=0;original.get('copy-frame-diagnostics').addEventListener('click',()=>clicks++);setupSettingsPanel();
 const options=doc.getElementById('frame-diagnostics-options'),help=doc.getElementById('frame-diagnostics-help'),quick=options.querySelector('.diagnostic-quick');
 assert.ok(help);assert.equal(help.hasAttribute('open'),false);assert.match(help.querySelector('summary').textContent,/측정 기준/);assert.ok(help.querySelectorAll('small,p').length>=3);assert.match(help.textContent,/캐시|JS 메모리/);assert.ok(quick.textContent.length<80);assert.match(quick.textContent,/탐색 중/);
 for(const id of ids)assert.equal(doc.getElementById(id),original.get(id),id+' is reparented, never replaced');
 assert.equal(help.contains(original.get('copy-frame-diagnostics')),false);assert.equal(help.contains(original.get('frame-diagnostics-toggle')),false);assert.equal(original.get('frame-diagnostics-export').hasAttribute('readonly'),true);
 original.get('copy-frame-diagnostics').dispatchEvent(new doc.defaultView.Event('click'));assert.equal(clicks,1);assert.ok(doc.querySelector('.top-actions').contains(original.get('fullscreen-button')));assert.ok(doc.querySelector('.action-controls').contains(original.get('dodge-button')));
});

test('preference migration preserves only enabled state and tolerates unavailable or malformed storage',()=>{
 for(const [raw,expected] of [['1',true],['0',false],['true',true],['false',false],[JSON.stringify({enabled:true,expanded:true}),true],[JSON.stringify({enabled:false,view:'expanded'}),false],[JSON.stringify({expanded:true}),false],['broken',false]]){
  let written;assert.equal(readFrameDiagnosticPreference({getItem:()=>raw,setItem:(_k,v)=>written=v}),expected);if(raw.startsWith('{')||raw==='true'||raw==='false')assert.equal(written,expected?'1':'0');
 }
 assert.equal(readFrameDiagnosticPreference({getItem(){throw Error('storage unavailable');}}),false);
});
