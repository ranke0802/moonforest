import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createDrawingProgress,createDrawingVeil} from '../src/v03/drawing-veil.js';

test('drawing progress rises through loading, pending work and the quiet wait, never back',()=>{
 const p=createDrawingProgress({quiet:1.2,limit:25,loadEase:8});
 let r=p.update({dt:4,ready:false});assert.ok(r.ratio>0&&r.ratio<.3);assert.equal(r.remaining,1);
 const before=r.ratio;
 r=p.update({dt:.1,ready:true,pending:10,summoning:true});assert.ok(r.ratio>=before);assert.equal(r.remaining,11);
 r=p.update({dt:.1,ready:true,pending:20});assert.ok(r.ratio>=before,'a larger count does not go back');
 r=p.update({dt:.1,ready:true,pending:5});const mid=r.ratio;assert.ok(mid>.3&&mid<.9);assert.equal(r.remaining,5);
 r=p.update({dt:.1,ready:true,pending:0,quietTime:.6});assert.ok(r.ratio>mid&&r.ratio<1);
 r=p.update({dt:.1,ready:true,pending:0,quietTime:1.2});assert.equal(r.ratio,1);assert.equal(r.remaining,0);
 const q=createDrawingProgress();q.update({dt:.1,ready:true,pending:3});assert.equal(q.update({dt:.1,ready:true,pending:3,prepareTime:25}).ratio,1);
});

test('the veil writes progress only on change and lets go of its listeners on stop',()=>{
 const {document}=parseHTML('<html><body><section></section></body></html>');
 const mount=document.querySelector('section');const added=[],removed=[];
 const veil=createDrawingVeil({doc:document,mount,label:()=>'세계를 그리는 중',left:n=>`남은 것 ${n}개`});
 const root=veil.element;root.addEventListener=(k)=>added.push(k);root.removeEventListener=(k)=>removed.push(k);
 veil.start();assert.deepEqual(added.sort(),['pointerdown','pointerleave','pointermove']);
 assert.equal(root.querySelector('.v03-veil-word').textContent,'세계를 그리는 중');
 veil.setProgress(.426,12);
 assert.equal(root.querySelector('.v03-veil-pct').textContent,'42%');
 assert.equal(root.querySelector('.v03-veil-left').textContent,'남은 것 12개');
 const fill=root.querySelector('.v03-veil-bar>i');fill.style.transform='x';veil.setProgress(.429,12);assert.equal(fill.style.transform,'x','same percent: no write');
 veil.setProgress(1,0);assert.equal(root.querySelector('.v03-veil-left').textContent,'');
 veil.stop();assert.deepEqual(removed.sort(),['pointerdown','pointerleave','pointermove']);assert.equal(veil.active,false);
 veil.dispose();assert.equal(mount.querySelector('.v03-veil'),null);
});
