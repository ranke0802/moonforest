import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {createCombatTrail} from '../src/v03/combat-trail.js';
import {createFrameDiagnostics} from '../src/frame-diagnostics.js';

function store() {
  const values=new Map();
  return {writes:0,getItem:key=>values.get(key),setItem(key,value){values.set(key,value);this.writes++;}};
}
const bear=()=>({active:true,kind:'bear',id:'river-bear',brain:{state:'Claw',mode:'attack',hp:820}});
const map='great-plains';

test('a freeze without pagehide survives tab close, title-only visits, and another combat',()=>{
  const local=store(), session=store(), foe=bear();
  let clock=10000;
  const start=tab=>createCombatTrail({local,session:tab,now:()=>clock});
  const first=start(session);
  first.sample(1,map,[foe],500);
  clock+=2500;
  first.hit(map,'player',foe,460);
  const title=start(store());
  const last=title.previous.events.at(-1);
  assert.deepEqual([last.at,last.map,last.event,last.opponent.name,last.opponent.motion,last.opponent.hp,last.playerHp],
    [12500,map,'hit-player','수호 곰','Claw',820,460]);
  assert.equal(title.current,null);
  const next=start(store());
  assert.deepEqual(next.previous,title.previous);
  next.sample(1,map,[{...foe,kind:'wolf'}],500);
  assert.deepEqual(next.previous,title.previous);
});

test('idle/watching groups do not write and sustained crowded combat has bounded storage work',()=>{
  let clock=10000;
  const local=store(),run=createCombatTrail({local,now:()=>clock});
  const foes=Array.from({length:80},(_,id)=>({...bear(),id,territoryState:{enabled:true,engaged:false}}));
  for(let frame=0;frame<600;frame++){clock+=17;run.sample(1/60,map,foes,500);}
  assert.equal(local.writes,0);
  for(const foe of foes)foe.territoryState.engaged=true;
  for(let frame=0;frame<600;frame++){
    clock+=17;run.sample(1/60,map,foes,500);run.hit(map,'enemy',foes[frame%80],500);
  }
  run.flush();
  assert.ok(local.writes<=7);
  assert.equal(run.current.events.length,16);
  assert.ok(JSON.stringify(run.current).length<6000);
  assert.deepEqual(createCombatTrail({local}).previous,run.current);
});

test('records the before/after defeat boundary and flushes a GPU or frame fault even with storage restrictions',()=>{
  const local=store();
  const denied={getItem(){throw Error();},setItem(){throw Error();}};
  const run=createCombatTrail({local:denied,session:local,now:()=>10000}),foe=bear();
  run.hit(map,'enemy',foe,400);
  const death={...foe,brain:{...foe.brain,hp:0}};
  run.defeat(map,death,400);
  assert.equal(createCombatTrail({session:local}).previous.events.at(-1).event,'defeat-handler-enter');
  run.defeat(map,death,400,true);
  assert.equal(createCombatTrail({session:local}).previous.events.at(-1).event,'defeat-handler-return');
  run.fault(map,'webgl-context-lost',400);
  assert.equal(createCombatTrail({session:local}).previous.events.at(-1).event,'webgl-context-lost');
  run.fault(map,'frame-error',400,'frame failed');
  assert.equal(createCombatTrail({session:local}).previous.events.at(-1).detail,'frame failed');
});

test('both 0.3 diagnostic surfaces copy/download the previous fight without a long recording or diagnostics enabled',async t=>{
  const {document:doc}=parseHTML(readFileSync(new URL('../moonforest-0.3.html',import.meta.url),'utf8'));
  const local=store(),run=createCombatTrail({local});run.sample(1,map,[bear()],500);
  const previousCombat=createCombatTrail({local}).previous;
  let copied,blob;
  t.mock.method(URL,'createObjectURL',b=>{blob=b;return 'blob:review';});
  t.mock.method(URL,'revokeObjectURL',()=>{});
  const controller=createFrameDiagnostics({doc,storage:{getItem:()=>null},clipboard:{writeText:s=>{copied=JSON.parse(s);}},metadata:()=>({previousCombat})});
  assert.equal(controller.enabled,false);
  for(const [copyId,fileId] of [['copy-frame-diagnostics','download-frame-diagnostics'],['diagnostic-detail-copy','diagnostic-detail-download']]){
    const copy=doc.getElementById(copyId);
    assert.notEqual(copy.disabled,true);copy.click();
    assert.deepEqual(copied.previousCombat,previousCombat);
    blob=null;doc.getElementById(fileId).click();
    assert.deepEqual(JSON.parse(await blob.text()).previousCombat,previousCombat);
  }
});
