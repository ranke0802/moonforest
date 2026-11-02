import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {NullEngine,Scene,ArcRotateCamera,TransformNode,Vector3} from '@babylonjs/core';
import {BossHealthBars} from '../src/boss-health-bar.js';
import {PlayerHealthBar} from '../src/player-health-bar.js';
import {primaryHealthBoss} from '../src/combat-readability.js';
import {ScreenProjection} from '../src/screen-projection.js';
import {createDamageNumbers} from '../src/damage-numbers.js';

function fixture(t){
 const {document:doc}=parseHTML(readFileSync(new URL('../index.html',import.meta.url),'utf8')),old=globalThis.document;globalThis.document=doc;
 const engine=new NullEngine({renderWidth:780,renderHeight:360}),scene=new Scene(engine),camera=new ArcRotateCamera('camera',Math.PI/2,1.2,12,new Vector3(0,1,0),scene);
 const projection=new ScreenProjection(scene);projection.resize(780,360);const actor=new TransformNode('player',scene),head=new TransformNode('head',scene);head.parent=actor;head.position.y=1.55;
 const render=()=>{scene.render();projection.beginFrame();};render();t.after(()=>{scene.dispose();engine.dispose();globalThis.document=old;});
 const enemy=(id,x=0,z=0,kind='elena')=>{const actor=new TransformNode('enemy-'+id,scene);actor.position.set(x,0,z);return {id,actor,kind,phase:2,active:true,displayName:kind==='elena'?'비탄의 마녀 엘레나':'곰',brain:{hp:1800,maxHp:1800,label:'경계',mode:'idle',stagger:0},healthBarPosition:()=>actor.position.add(new Vector3(0,6,0))};};
 return {doc,engine,scene,camera,projection,actor,head,render,enemy};
}

test('primary boss stays stable, ignores hidden/goblins, and all health data remains owned by encounter',()=>{
 const boss=(id,x,extra={})=>({id,active:true,kind:'elena',actor:{position:{x,z:0}},...extra}),one=boss(1,3),two=boss(2,3.2);
 assert.equal(primaryHealthBoss([one,two],{x:0,z:0})?.id,1);assert.equal(primaryHealthBoss([one,two],{x:0,z:0},2)?.id,2,'small distance change does not flicker primary');
 assert.equal(primaryHealthBoss([one,two],{x:-10,z:0},1)?.id,1);assert.equal(primaryHealthBoss([one,{...two,fogVisible:false}],{x:0,z:0},2)?.id,1);
 assert.equal(primaryHealthBoss([boss(3,0,{kind:'goblin'}),boss(4,0,{renderVisible:false}),boss(5,0,{corpseGone:true})],{x:0,z:0}),null);
});

test('real camera changes cannot move fixed battle/player HP into head anchors; hidden enemies remain hidden',t=>{
 const f=fixture(t),bars=new BossHealthBars(f.doc.getElementById('boss-hud')),player=new PlayerHealthBar(f.doc.getElementById('player-health')),enemy=f.enemy(1,0,0);
 for(const [radius,beta,alpha] of [[13,.4,0],[.8,2.6,1],[40,1.2,3],[6,1.7,5]]){
  f.camera.radius=radius;f.camera.beta=beta;f.camera.alpha=alpha;f.head.position.y+=2;f.render();bars.update(f.scene,[enemy],f.projection,{playerPosition:f.actor.position});player.update(f.scene,{visible:true,actor:f.actor,head:f.head,hp:410,maxHp:500},f.projection);
  assert.equal(bars.items.get(1).element.dataset.hud,'fixed');assert.equal(bars.items.get(1).element.style.transform,'translateX(-50%)');assert.equal(bars.items.get(1).element.hidden,false);assert.equal(player.element.hidden,false);assert.equal(player.element.style.transform,'');assert.equal(player.label.textContent,'HP 410 / 500');
 }
 enemy.fogVisible=false;bars.update(f.scene,[enemy],f.projection,{playerPosition:f.actor.position});assert.equal(bars.items.get(1).element.hidden,true);
 enemy.fogVisible=true;enemy.brain.hp=0;bars.update(f.scene,[enemy],f.projection,{playerPosition:f.actor.position});assert.match(bars.items.get(1).text.textContent,/격파/);assert.equal(enemy.brain.hp,0);player.dispose();
});

test('repeated pooled summon/replacement has one fixed primary and does not accumulate cloned HP DOM',t=>{
 const f=fixture(t),bars=new BossHealthBars(f.doc.getElementById('boss-hud'));
 for(let i=0;i<60;i++){
  const enemies=[f.enemy(10+i*2,0,0),f.enemy(11+i*2,5,2)];f.render();bars.update(f.scene,enemies,f.projection,{playerPosition:f.actor.position});
  assert.equal([...bars.items.values()].filter(i=>i.element.dataset.hud==='fixed'&&!i.element.hidden).length,1);assert.ok(f.doc.querySelectorAll('.boss-hud').length<=3);assert.equal(bars.items.size,2);
 }
 bars.update(f.scene,[],f.projection);assert.equal(bars.items.size,0);assert.equal(f.doc.querySelectorAll('.boss-hud').length,1);assert.equal(bars.template.hidden,true);
});

test('foot/direction marker is fail-closed without structure clearance, follows actual root yaw, and allocates no scene resources',t=>{
 const f=fixture(t),player=new PlayerHealthBar(f.doc.getElementById('player-health')),counts=()=>[f.scene.meshes.length,f.scene.materials.length,f.scene.textures.length],before=counts(),state={visible:true,actor:f.actor,head:f.head,hp:500,maxHp:500};
 for(const marker of [undefined,{enabled:true},{enabled:true,clearToPlayer:false},{enabled:false,clearToPlayer:true}]){player.update(f.scene,{...state,marker},f.projection);assert.equal(player.marker.hidden,true);}
 f.render();player.update(f.scene,{...state,marker:{enabled:true,clearToPlayer:true,groundY:0}},f.projection);assert.equal(player.marker.hidden,false);const first=player.arrow.style.transform;
 f.actor.rotation.y=Math.PI/2;f.render();player.update(f.scene,{...state,marker:{enabled:true,clearToPlayer:true,groundY:0}},f.projection);assert.notEqual(player.arrow.style.transform,first);assert.doesNotMatch(player.marker.style.transform,/NaN|Infinity/);
 const actual=JSON.parse(readFileSync(new URL('../public/assets/warrior-v3.json',import.meta.url),'utf8'));
 f.actor.scaling.setAll(actual.scale);f.camera.radius=4;f.camera.alpha=0;f.camera.beta=1.18;f.render();
 player.update(f.scene,{...state,marker:{enabled:true,clearToPlayer:true,groundY:0}},f.projection);
 assert.ok(Math.abs(player.direction.length()-1)<1e-6,'actual warrior scaling must not stretch the projected direction');assert.equal(player.marker.hidden,false,'on-screen foot remains marked at the independently reproduced close-camera angle');
 player.update(f.scene,{...state,hp:0,marker:{enabled:true,clearToPlayer:true}},f.projection);assert.equal(player.marker.hidden,true);assert.deepEqual(counts(),before);assert.equal(f.doc.querySelectorAll('.player-ground-marker').length,1);player.dispose();assert.equal(f.doc.querySelectorAll('.player-ground-marker').length,0);
});

test('damage retains its original hit anchor, Critical wording and sequential rise with a bounded reusable pool',t=>{
 const f=fixture(t),host=f.doc.getElementById('damage-numbers'),numbers=createDamageNumbers(f.scene,host),projection={cssWidth:780,cssHeight:360,project:p=>({visible:true,x:750,y:60-p.y*20})};
 numbers.show(new Vector3(),29,false,'enemy',0,true);numbers.update(.2,projection);
 const first=host.firstElementChild;assert.match(first.style.transform,/translate3d\(750px,57\.4px/);
 numbers.show(new Vector3(),33,false,'enemy',0,true);numbers.update(0,projection);
 assert.equal(host.lastElementChild.textContent,'Critical 33');assert.match(host.lastElementChild.style.transform,/translate3d\(750px,60px/);assert.notEqual(first.style.transform,host.lastElementChild.style.transform);
 for(let i=1;i<=24;i++)numbers.show(new Vector3(),i,false,'enemy',0,true);numbers.update(.01,projection);
 assert.equal(host.children.length,24);assert.equal(new Set([...host.children].map(n=>n.style.transform)).size,1,'simultaneous same-point hits are not relocated into a grid');assert.deepEqual([...host.children].map(n=>n.textContent),Array.from({length:24},(_,i)=>'Critical '+(i+1)));
 numbers.update(2,projection);assert.equal(host.children.length,0);assert.equal(numbers.inspect().pooled,24);
 for(let i=0;i<100;i++){numbers.show(new Vector3(),43,false,'enemy');numbers.update(2,projection);}assert.equal(numbers.inspect().created,24);
 numbers.show(new Vector3(),'+15 G',false,'gold');numbers.show(new Vector3(),'Dodge',false,'evade');numbers.show(new Vector3(),'BLOCK',false,'block');assert.deepEqual([...host.children].map(n=>n.textContent),['+15 G','Dodge','BLOCK']);numbers.dispose();assert.equal(host.children.length,0);
});

test('original burst offsets remain local to the hit instead of reserving HUD columns or reading DOM layout',t=>{
 const f=fixture(t),host=f.doc.getElementById('damage-numbers'),numbers=createDamageNumbers(f.scene,host),projection={project:()=>({visible:true,x:400,y:220})};
 for(const burst of [0,1,2,3])numbers.show(new Vector3(),29,false,'enemy',burst);numbers.update(0,projection);
 assert.deepEqual([...host.children].map(n=>+n.style.transform.match(/translate3d\(([^p]+)px/)[1]),[400,376,400,424]);numbers.dispose();
 const source=readFileSync(new URL('../src/damage-numbers.js',import.meta.url),'utf8');assert.doesNotMatch(source,/getBoundingClientRect|offsetWidth|offsetHeight|clientWidth|clientHeight/);
 const css=readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');assert.match(css,/#app > #player-hud\[data-hud="fixed"\][^}]*top:calc\(env\(safe-area-inset-top\) \+ 48px\)/);assert.match(css,/#app > \.boss-hud\[data-hud="fixed"\][^}]*top:calc\(env\(safe-area-inset-top\) \+ 82px\)/);
});

test('downed moving enemy labels follow its torso and retire on reuse or map removal',t=>{
 const f=fixture(t),host=f.doc.getElementById('damage-numbers'),numbers=createDamageNumbers(f.scene,host),point=new Vector3(2,1,3),owner={active:true,brain:{},damageNumberPosition:()=>point};
 const projected=[],projection={project:p=>{projected.push(p.clone());return {visible:true,x:p.x*10,y:200-p.y*20};}};
 numbers.show(point,43,true,'enemy',0,true,owner);point.set(7,.3,9);numbers.update(.1,projection);
 assert.equal(projected[0].x,7);assert.equal(projected[0].z,9);assert.ok(Math.abs(projected[0].y-.365)<1e-8);assert.equal(host.firstElementChild.textContent,'Critical 43');
 owner.brain={};numbers.update(0,projection);assert.equal(host.children.length,0);
 numbers.show(point,20,false,'enemy',0,false,owner);owner.active=false;numbers.update(0,projection);assert.equal(host.children.length,0);numbers.dispose();
});

test('actual camera projection preserves overlapping hit anchors without an automatic screen grid',t=>{
 const f=fixture(t),host=f.doc.getElementById('damage-numbers'),numbers=createDamageNumbers(f.scene,host),ray=f.camera.getForwardRay(),a=ray.origin.add(ray.direction.scale(3)),b=ray.origin.add(ray.direction.scale(7));
 assert.ok(Vector3.Distance(a,b)>2);numbers.show(a,29,false,'enemy',0,true);numbers.show(b,33,false,'enemy',0,true);numbers.update(0,f.projection);
 const nodes=[...host.children];assert.equal(nodes.length,2);assert.equal(nodes.every(n=>n.style.display===''),true);
 for(const [i,p]of [a,b].entries()){const projected=f.projection.project(p),[,x,y]=nodes[i].style.transform.match(/translate3d\(([^p]+)px,([^p]+)px/);assert.ok(Math.abs(+x-projected.x)<1e-6);assert.ok(Math.abs(+y-projected.y)<1e-6);}
 numbers.dispose();
});
