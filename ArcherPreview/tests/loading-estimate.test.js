import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {createLoadingView} from '../src/loading-view.js';
import {phaseShare,expectedPhaseMs,rememberPhaseMs} from '../src/phase-share.js';
import {createDrawingProgress} from '../src/v03/drawing-veil.js';

const html=readFileSync(new URL('../moonforest-0.3.html',import.meta.url),'utf8');
const memory=()=>{const map=new Map();return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),map};};
function fixture(storage=memory()){
 const {document}=parseHTML(html),view=createLoadingView(document,{clipboard:null});
 let clock=0;const timers=[];
 const options={now:()=>clock,setInterval:(fn,ms)=>{const t={fn,ms,next:clock+ms};timers.push(t);return t;},clearInterval:t=>{const i=timers.indexOf(t);if(i>=0)timers.splice(i,1);},storage};
 const width=()=>parseFloat(document.getElementById('loading-progress').style.width)||0;
 const pass=ms=>{const end=clock+ms;for(;;){const t=[...timers].sort((a,b)=>a.next-b.next)[0];if(!t||t.next>end)break;clock=t.next;t.next+=t.ms;t.fn();}clock=end;};
 return {view,options,width,pass,timers,storage};
}

test('phaseShare: 90% of the stretch at the expected time, then ever slower, never all of it',()=>{
 assert.equal(phaseShare(0,5000),0);assert.ok(Math.abs(phaseShare(2500,5000)-.45)<1e-9);assert.ok(Math.abs(phaseShare(5000,5000)-.9)<1e-9);
 let last=0;for(let t=0;t<=60000;t+=250){const v=phaseShare(t,5000);assert.ok(v>=last&&v<1);if(t&&t<=15000)assert.ok(v>last,'still moving at '+t);last=v;}
 assert.ok(phaseShare(60000,5000)<.991);
});

test('the time a phase took is kept for the next run, halfway to the new figure',()=>{
 const storage=memory();
 assert.equal(expectedPhaseMs('card:x',5000,storage),5000);
 assert.equal(rememberPhaseMs('card:x',6200,storage),true);assert.equal(expectedPhaseMs('card:x',5000,storage),6200);
 rememberPhaseMs('card:x',3400,storage);assert.equal(expectedPhaseMs('card:x',5000,storage),4800);
 assert.equal(rememberPhaseMs('card:x',40,storage),false,'a phase that did not happen is not a measurement');
 assert.equal(rememberPhaseMs('card:x',9e6,storage),false);
 const broken={getItem(){throw new Error('denied');},setItem(){throw new Error('denied');}};
 assert.equal(expectedPhaseMs('card:x',5000,broken),5000);assert.equal(rememberPhaseMs('card:x',900,broken),false);
 storage.setItem('moonforest:phasetimes:v1','[1,2]');assert.equal(expectedPhaseMs('card:x',5000,storage),5000);
});

test('without the estimate the loading card keeps its old figures (0.2)',()=>{
 const f=fixture();const g=f.view.begin('warrior-v3');
 f.view.download({loaded:5,total:10,ratio:.5},g);assert.equal(f.width(),35);
 f.view.preparing(undefined,g);assert.equal(f.width(),70);f.pass(5000);assert.equal(f.width(),70);assert.equal(f.timers.length,0);
 f.view.preparing({completed:50,total:100},g);assert.equal(f.width(),84.5);
});

test('with the estimate the model stage moves the bar by the time it took last time, and remembers how long it took',()=>{
 const f=fixture();f.view.enableEstimate(f.options);
 let g=f.view.begin('warrior-v3');
 f.view.download({loaded:5,total:10,ratio:.5},g);assert.equal(f.width(),17.5);
 f.view.download({complete:true},g);assert.equal(f.width(),35);
 f.view.preparing(undefined,g);assert.equal(f.width(),35);assert.equal(f.timers.length,1,'one timer for the stage');
 const seen=[];for(let i=0;i<62;i++){f.pass(100);seen.push(f.width());}
 for(let i=1;i<seen.length;i++)assert.ok(seen[i]>seen[i-1],'moves on every tick ('+i+')');
 assert.ok(Math.max(...seen.slice(1).map((v,i)=>v-seen[i]))<1.2,'in steps of about a percent, no jumps');
 assert.ok(seen.at(-1)>75.5&&seen.at(-1)<80,'past the expected five seconds it slows but stays short of the next stage');
 f.view.preparing({completed:0,total:145},g);assert.equal(f.timers.length,0,'the timer ends with the stage');
 assert.equal(f.width(),80,'the stage ending puts the bar on the next stage: a step of under five points');
 f.view.preparing({completed:145,total:145},g);assert.equal(f.width(),99);
 assert.equal(expectedPhaseMs('card:warrior-v3',5000,f.storage),6200);
 f.view.preparing(undefined,g);assert.equal(f.timers.length,0,'never restarted after counting began');
 assert.equal(f.view.reveal(g),true);
 // next run on this device: 6.2 s expected, so the same stage takes the same share at 6.2 s
 g=f.view.begin('warrior-v3');f.view.preparing(undefined,g);f.pass(6200);
 assert.ok(Math.abs(f.width()-(35+45*.9))<.01);
 f.view.reveal(g);assert.equal(f.timers.length,0);assert.equal(expectedPhaseMs('card:warrior-v3',5000,f.storage),6200);
 // another map keeps its own figure; a failure measures nothing and stops the timer
 g=f.view.begin('warrior-plains');f.view.preparing(undefined,g);f.pass(1000);
 f.view.fail('오류','오류');assert.equal(f.timers.length,0);assert.equal(expectedPhaseMs('card:warrior-plains',5000,f.storage),5000);
});

test('the title keeps moving between counts and remembers its own phases',()=>{
 let clock=0;const p=createDrawingProgress({expectedStart:4,expectedPending:6,glide:.35,now:()=>clock});p.download(1,'');p.update({});for(let i=0;i<20;i++){clock+=100;p.update({});}p.download(null);
 let last=p.ratio;assert.equal(last,.5);for(let i=0;i<60;i++){clock+=100;const r=p.update({dt:.1,ready:false}).ratio;assert.ok(r>last&&r<.65);last=r;}
 // six pending items that finish one every two seconds: no 5% jumps, no standing still
 const steps=[];let pending=6;
 for(let i=0;i<120;i++){if(i&&i%20===0)pending--;clock+=100;const r=p.update({dt:.1,ready:true,pending}).ratio;steps.push(r-last);last=r;}
 assert.ok(Math.max(...steps)<=.035+1e-9,'largest step '+Math.max(...steps));assert.equal(steps.filter(step=>step>0).length,120,'never stands still, even after a count ran ahead of the clock');
 assert.ok(last<=.95);
 assert.deepEqual([Math.round(p.measured.start*10),Math.round(p.measured.pending*10)],[60,120]);
 assert.equal(p.update({dt:.1,ready:true,pending:0,quietTime:1.2}).ratio,1);
});

test('a lump of finished work is run up to, not leapt to (glide)',()=>{
 let clock=0;const p=createDrawingProgress({glide:.35,now:()=>clock});
 p.download(.74,'');assert.equal(p.update({}).ratio,0,'the first call only starts the clock');
 const seen=[];for(let i=0;i<40;i++){clock+=16;seen.push(p.update({}).ratio);}
 for(let i=1;i<seen.length;i++)assert.ok(seen[i]-seen[i-1]<=.35*.016+1e-9);
 assert.ok(seen.at(-1)>.2&&seen.at(-1)<.37);
 p.download(.98,'');clock+=5000;const after=p.update({}).ratio;assert.ok(after-seen.at(-1)<=.035+1e-9,'a long stall does not turn into a leap');
 for(let i=0;i<200;i++){clock+=16;p.update({});}assert.ok(Math.abs(p.ratio-.49)<1e-9,'and it arrives');
 p.download(null);assert.equal(p.update({ready:true,pending:0,quietTime:1.2}).ratio,1,'the end is never held back');
});
