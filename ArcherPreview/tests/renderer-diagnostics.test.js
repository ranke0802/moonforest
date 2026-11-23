import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {createFrameDiagnostics} from '../src/frame-diagnostics.js';
import {readRendererInfo,showSoftwareRendererNotice} from '../src/renderer-diagnostics.js';

const info = name => readRendererInfo({webGLVersion:2,getGlInfo:()=>({renderer:name})});

test('report the actual WebGL renderer and identify only explicit software implementations',()=>{
  for(const name of ['ANGLE (Google, Vulkan SwiftShader Device (LLVM))','llvmpipe (LLVM 19)','Microsoft Basic Render Driver'])
    assert.deepEqual(info(name),{renderer:name,mode:'software',api:'WebGL 2'});
  for(const name of ['Adreno (TM) 740','ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 D3D11)','Apple M2'])
    assert.equal(info(name).mode,'hardware');
  for(const name of [null,'','WebKit WebGL','ANGLE','Unknown renderer','unrecognized GPU'])
    assert.equal(info(name).mode,'unknown');
  assert.deepEqual(readRendererInfo(null),{renderer:null,mode:'unknown',api:null});
});

function dialogFixture(view) {
  const {document:doc,window}=parseHTML('<html><body></body></html>');
  const create=doc.createElement.bind(doc);
  doc.createElement=tag=>{
    const el=create(tag);
    if(tag==='dialog'){
      el.showModal=()=>el.setAttribute('open','');
      el.close=()=>{el.removeAttribute('open');el.dispatchEvent(new window.Event('close'));};
    }
    return el;
  };
  let changes=0;
  return {doc,window,show:name=>showSoftwareRendererNotice(info(name),{doc,view,onChange:()=>changes++}),changes:()=>changes};
}

test('only software prompts, once across reloads; confirmation closes and restores play',()=>{
  const map=new Map();
  const storage={getItem:key=>map.get(key),setItem:(key,val)=>map.set(key,val)};
  const view={navigator:{userAgent:'Chrome/150'},localStorage:storage};
  const f=dialogFixture(view);
  f.show('WebKit WebGL');f.show('Adreno (TM) 740');
  assert.equal(f.changes(),0);assert.equal(map.size,0);
  f.show('SwiftShader');f.show('SwiftShader');
  assert.equal(f.changes(),1);assert.match(f.doc.querySelector('dialog p').textContent,/chrome:\/\/settings\/system/);
  f.doc.querySelector('dialog button').click();
  assert.equal(f.changes(),2);assert.equal(f.doc.querySelector('dialog'),null);
  const reload=dialogFixture(view);reload.show('SwiftShader');assert.equal(reload.changes(),0);
});

test('mobile guidance and once-per-tab fallback work with blocked persistent storage',()=>{
  const map=new Map();
  const view={navigator:{userAgent:'Android Mobile Chrome/150'},get localStorage(){throw Error('denied');},
    sessionStorage:{getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)}};
  const first=dialogFixture(view);first.show('softpipe');
  assert.doesNotMatch(first.doc.querySelector('dialog p').textContent,/chrome:\/\//);
  const next=dialogFixture(view);next.show('softpipe');assert.equal(next.changes(),0);
});

test('detail, copied snapshot and ten-minute download use the same renderer identity',async t=>{
  const {document:doc}=parseHTML(readFileSync(new URL('../moonforest-0.3.html',import.meta.url),'utf8'));
  for(const id of ['long-frame-start','long-frame-stop','long-frame-download']){
    const button=doc.createElement('button');button.id=id;doc.body.append(button);
  }
  const dialog=doc.getElementById('diagnostic-detail-dialog');dialog.showModal=()=>{dialog.open=true;};
  let blob, copied;
  t.mock.method(URL,'createObjectURL',data=>{blob=data;return 'blob:test';});
  const diagnostic=createFrameDiagnostics({doc,storage:{getItem:()=> '1'},clipboard:{writeText:s=>{copied=JSON.parse(s);}}});
  const gpu=info('Adreno (TM) 740');diagnostic.setGraphicsDevice(gpu);
  doc.getElementById('diagnostic-expand').click();
  assert.match(dialog.querySelector('#diagnostic-graphics-device').textContent,/Adreno \(TM\) 740.*하드웨어 GPU.*WebGL 2/);
  doc.getElementById('diagnostic-detail-copy').click();
  assert.deepEqual(copied.graphicsDevice,gpu);
  doc.getElementById('long-frame-start').click();
  doc.getElementById('long-frame-stop').click();
  const restored=info('SwiftShader');diagnostic.setGraphicsDevice(restored);
  doc.getElementById('long-frame-download').click();
  const report=JSON.parse(await blob.text());
  assert.deepEqual(report.metadata.graphicsDevice,gpu);
  assert.deepEqual(report.endSnapshot.graphicsDevice,restored);
});
