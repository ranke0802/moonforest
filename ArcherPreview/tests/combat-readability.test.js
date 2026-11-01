import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {NullEngine,Scene,ArcRotateCamera,TransformNode,Vector3} from '@babylonjs/core';
import {BossHealthBars} from '../src/boss-health-bar.js';
import {PlayerHealthBar} from '../src/player-health-bar.js';
import {primaryHealthBoss,damageScreenSlot} from '../src/combat-readability.js';
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

test('nearby damage uses separate lanes below fixed vital HUD and reuses a bounded 24-element pool without changing values',t=>{
 const f=fixture(t),host=f.doc.getElementById('damage-numbers'),numbers=createDamageNumbers(f.scene,host),projection={cssWidth:780,cssHeight:360,project:()=>({visible:true,x:750,y:60})};
 for(let i=1;i<=24;i++)numbers.show(new Vector3(),i,false,'enemy',0,true);numbers.update(.01,projection);
 assert.equal(host.children.length,24);assert.equal(new Set([...host.children].map(n=>n.style.transform)).size,24);assert.deepEqual([...host.children].map(n=>n.textContent),Array.from({length:24},(_,i)=>'치명타 '+(i+1)));
 for(const node of host.children){const [,x,y]=node.style.transform.match(/translate3d\(([^p]+)px,([^p]+)px/);assert.ok(+x-56>=12&&+x+56<=780-190);assert.ok(+y>=142&&+y<=328);}
 numbers.update(2,projection);assert.equal(host.children.length,0);assert.equal(numbers.inspect().pooled,24);
 for(let i=0;i<100;i++){numbers.show(new Vector3(),43,false,'enemy');numbers.update(2,projection);}assert.equal(numbers.inspect().created,24);
 numbers.show(new Vector3(),'+15 G',false,'gold');numbers.show(new Vector3(),'Dodge',false,'evade');numbers.show(new Vector3(),'BLOCK',false,'block');assert.deepEqual([...host.children].map(n=>n.textContent),['+15 G','Dodge','BLOCK']);numbers.dispose();assert.equal(host.children.length,0);
});

test('damage lane reservation handles both landscape devices and portrait without per-frame DOM layout reads',()=>{
 for(const [width,height] of [[780,360],[844,390],[568,320],[390,844]])for(const safeInsets of [{left:0,right:0,top:0,bottom:0},{left:44,right:20,top:5,bottom:8}]){
  const boxes=[];for(let lane=0;lane<24;lane++){
   const point=damageScreenSlot({x:width,y:0},lane,{width,height,safeInsets});assert.ok(Number.isFinite(point.x)&&Number.isFinite(point.y));if(!point.visible)continue;
   const box={left:point.x-56,right:point.x+56,top:point.y-20,bottom:point.y};assert.ok(box.left>=12+safeInsets.left);assert.ok(box.right<=width-12-safeInsets.right-(width>height?178:0));assert.ok(box.top>=122+safeInsets.top);assert.ok(box.bottom<=height-32-safeInsets.bottom);
   for(const other of boxes)assert.equal(box.left<other.right&&box.right>other.left&&box.top<other.bottom&&box.bottom>other.top,false,'visible label boxes do not overlap');boxes.push(box);
  }
 }
 const source=readFileSync(new URL('../src/damage-numbers.js',import.meta.url),'utf8');assert.doesNotMatch(source,/getBoundingClientRect|offsetWidth|offsetHeight|clientWidth|clientHeight/);
 const css=readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');assert.match(css,/#app > #player-hud\[data-hud="fixed"\][^}]*top:calc\(env\(safe-area-inset-top\) \+ 48px\)/);assert.match(css,/#app > \.boss-hud\[data-hud="fixed"\][^}]*top:calc\(env\(safe-area-inset-top\) \+ 82px\)/);
});

test('actual camera projection separates damage from distant limbs that overlap on screen',t=>{
 const f=fixture(t),host=f.doc.getElementById('damage-numbers'),numbers=createDamageNumbers(f.scene,host),ray=f.camera.getForwardRay(),a=ray.origin.add(ray.direction.scale(3)),b=ray.origin.add(ray.direction.scale(7));
 assert.ok(Vector3.Distance(a,b)>2);numbers.show(a,29,false,'enemy',0,true);numbers.show(b,33,false,'enemy',0,true);numbers.update(0,f.projection);
 const nodes=[...host.children];assert.equal(nodes.length,2);assert.equal(nodes.every(n=>n.style.display===''),true);assert.notEqual(nodes[0].style.transform,nodes[1].style.transform,'screen collision solved even when world anchors differ by four metres');numbers.dispose();
});
