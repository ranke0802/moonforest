import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createDrawingProgress,createDrawingVeil,drawStage,dustCount,flashSize} from '../src/v03/drawing-veil.js';

test('drawing progress: download to 50%, world start, pending work and the quiet wait, never back',()=>{
 const p=createDrawingProgress({quiet:1.2,limit:25,loadEase:4});
 p.download(.4,'3.2 / 5.4MB');let r=p.update({dt:1});assert.equal(r.ratio,.2);assert.equal(r.remaining,'3.2 / 5.4MB');
 p.download(1,'');r=p.update({dt:1});assert.equal(r.ratio,.5);assert.equal(r.remaining,1);
 p.download(null);r=p.update({dt:4,ready:false});assert.ok(r.ratio>.5&&r.ratio<.65);
 const before=r.ratio;
 r=p.update({dt:.1,ready:true,pending:10,summoning:true});assert.ok(r.ratio>=before);assert.equal(r.remaining,11);
 r=p.update({dt:.1,ready:true,pending:20});assert.ok(r.ratio>=before,'a larger count does not go back');
 r=p.update({dt:.1,ready:true,pending:5});const mid=r.ratio;assert.ok(mid>.65&&mid<.95);assert.equal(r.remaining,5);
 r=p.update({dt:.1,ready:true,pending:0,quietTime:.6});assert.ok(r.ratio>mid&&r.ratio<1);
 r=p.update({dt:.1,ready:true,pending:0,quietTime:1.2});assert.equal(r.ratio,1);assert.equal(r.remaining,0);
 const q=createDrawingProgress();q.update({dt:.1,ready:true,pending:3});assert.equal(q.update({dt:.1,ready:true,pending:3,prepareTime:25}).ratio,1);
});

test('the veil writes progress only on change and lets go of its listeners on stop',()=>{
 const {document}=parseHTML('<html><body><section></section></body></html>');
 const mount=document.querySelector('section');const added=[],removed=[];
 const veil=createDrawingVeil({doc:document,mount,first:false,label:first=>first?'처음으로 세계를 그리는 중…':'그려 둔 세계를 펼치는 중',memory:()=>'한 번 그린 세계는 기억에 남습니다.',left:n=>`남은 것 ${n}개`});
 const root=veil.element;root.addEventListener=(k)=>added.push(k);root.removeEventListener=(k)=>removed.push(k);
 veil.start();assert.deepEqual(added,['pointerdown'],'no light follows the pointer, only clicks and taps');
 assert.equal(root.querySelector('.v03-veil-lens,.v03-veil-glow'),null);
 assert.equal(root.querySelector('.v03-veil-word').textContent,'그려 둔 세계를 펼치는 중');assert.equal(root.classList.contains('is-first'),false);
 veil.setFirst(true);assert.equal(root.querySelector('.v03-veil-word').textContent,'처음으로 세계를 그리는 중…');assert.equal(root.classList.contains('is-first'),true);
 assert.equal(root.querySelector('.v03-veil-memory').textContent,'한 번 그린 세계는 기억에 남습니다.');
 veil.setProgress(.426,12);
 assert.equal(root.querySelector('.v03-veil-pct').textContent,'42%');
 assert.equal(root.querySelector('.v03-veil-left').textContent,'남은 것 12개');
 const fill=root.querySelector('.v03-veil-bar>i');fill.style.transform='x';veil.setProgress(.429,12);assert.equal(fill.style.transform,'x','same percent: no write');
 veil.setProgress(.3,'3.2 / 5.4MB');assert.equal(root.querySelector('.v03-veil-left').textContent,'3.2 / 5.4MB');
 veil.setProgress(1,0);assert.equal(root.querySelector('.v03-veil-left').textContent,'');
 veil.stop();assert.deepEqual(removed.filter(kind=>kind==='pointerdown'),['pointerdown']);assert.equal(veil.active,false);
 assert.ok(added.includes('transitionend'),'the fade end takes it out of rendering');
 veil.dispose();assert.equal(veil.inspect().hidden,true);assert.equal(mount.querySelector('.v03-veil'),null);
});

test('after the download the note says what is being drawn, in order',()=>{
 assert.equal(drawStage(.5),'ground');assert.equal(drawStage(.6),'trees');assert.equal(drawStage(.7),'people');
 assert.equal(drawStage(.8),'critters');assert.equal(drawStage(.86),'beasts');assert.equal(drawStage(.95),'monsters');assert.equal(drawStage(1),'monsters');
});

test('progress returns one reused result and nothing screen-sized is kept as a layer',()=>{
 const p=createDrawingProgress(),input={dt:.1,ready:true,pending:4};
 assert.equal(p.update(input),p.update(input),'the same result object every frame');
 assert.equal(flashSize(1600,890),757);assert.equal(flashSize(1920,1080),760);assert.equal(flashSize(844,390),332);assert.equal(flashSize(320,240),260);
 assert.equal(dustCount(1600,890),64);assert.equal(dustCount(844,390),18);assert.equal(dustCount(320,240),14);
 const {document}=parseHTML('<html><body><section></section></body></html>');
 const veil=createDrawingVeil({doc:document,mount:document.querySelector('section')});
 assert.equal(veil.inspect().dots,veil.element.querySelectorAll('.v03-veil-dot').length);assert.ok(veil.inspect().dots>=14&&veil.inspect().dots<=64);
 for(const node of veil.element.querySelectorAll('*'))assert.equal(node.style.willChange||'',''); 
 veil.start();veil.stop();veil.start();assert.equal(veil.inspect().hidden,false,'shown again when restarted');
 veil.dispose();
});
