import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Constants,FreeCamera,MeshBuilder,NullEngine,Scene,Skeleton,Bone,Matrix,StandardMaterial,TransformNode,Vector3,VertexBuffer} from '@babylonjs/core';
import {parseHTML} from 'linkedom';
import {createLevelUpFx,levelUpGeometry,LEVELUP_FX_NAME,LEVELUP_FX_SECONDS,LEVELUP_MOTES,PILLAR_SEGMENTS} from '../src/v03/levelup-fx.js';
import {createRewardCelebration,LEVEL_SECONDS,REWARD_SECONDS,MERGE_SECONDS} from '../src/v03/reward-celebration.js';
import {createRewardHud,REWARD_CHIP_LIMIT,COUNT_SECONDS} from '../src/v03/reward-hud.js';
import {REWARD_CUES,playRewardCue} from '../src/v03/reward-cues.js';
import {setupTownServices} from '../src/v03/town-services.js';
import {GoldLoot} from '../src/gold-loot.js';
import {t} from '../src/v03/i18n.js';

function warrior(scene){
 const root=new TransformNode('player-world-transform',scene),hips=new TransformNode('mixamorig:Hips',scene);
 hips.parent=root;hips.position.y=.9;
 const paint=new StandardMaterial('paint',scene),skeleton=new Skeleton('rig','rig',scene);
 new Bone('hips',skeleton,null,Matrix.Identity());skeleton.useTextureToStoreBoneMatrices=true;
 const body=MeshBuilder.CreateSphere('Warrior_Body_primitive0',{segments:24},scene);body.parent=root;body.material=paint;
 const n=body.getTotalVertices();
 body.setVerticesData(VertexBuffer.MatricesIndicesKind,new Float32Array(n*4));
 body.setVerticesData(VertexBuffer.MatricesWeightsKind,new Float32Array(n*4).map((_,i)=>i%4?0:1));
 body.skeleton=skeleton;body.computeBonesUsingShaders=true;body.numBoneInfluencers=1;
 return {root,body};
}
function world(){
 const engine=new NullEngine(),scene=new Scene(engine);new FreeCamera('camera',new Vector3(0,1.5,-4),scene);
 const clock={ms:1000};
 return {engine,scene,clock,now:()=>clock.ms,...warrior(scene),close(){scene.dispose();engine.dispose();}};
}
function page(){
 const {document}=parseHTML('<html><body></body></html>');return document;
}
// A celebration over a NullEngine scene with a controllable clock and gate.
function celebration({reduced=false}={}){
 const w=world(),doc=page(),cues=[];
 const c=createRewardCelebration({doc,reduced:()=>reduced,playCue:cue=>cues.push(cue),createFx:({scene})=>createLevelUpFx({scene,now:w.now})});
 const frame={scene:w.scene,player:w.root,mapId:'village',free:true,allowed(){return this.free;}};
 const step=(seconds,n=1)=>{for(let i=0;i<n;i++){w.clock.ms+=seconds*1000;c.update(seconds,frame);}};
 return {w,doc,c,cues,frame,step,close(){c.dispose();w.close();}};
}
const drawn=scene=>scene.meshes.filter(m=>m.isEnabled()&&(m.name===LEVELUP_FX_NAME||m.metadata?.moonforestStarfallAura)).length;

test('the light is one mesh with fixed capacity; it is prepared, idle with no draw, and never picked, shadowed or depth-writing',async()=>{
 const w=world(),fx=createLevelUpFx({scene:w.scene,now:w.now});
 await fx.ready;
 const shape=levelUpGeometry();
 assert.equal(fx.mesh.getTotalVertices(),4+(PILLAR_SEGMENTS+1)*2+LEVELUP_MOTES*4);
 assert.equal(shape.indices.length/3,2+PILLAR_SEGMENTS*2+LEVELUP_MOTES*2);
 assert.equal(fx.mesh.isEnabled(false),false);assert.equal(fx.draws,0);assert.equal(drawn(w.scene),0);
 assert.equal(fx.mesh.isPickable,false);assert.equal(fx.mesh.receiveShadows,false);assert.equal(fx.mesh.renderOutline,false);
 assert.equal(fx.material.alphaMode,Constants.ALPHA_ADD);assert.equal(fx.material.disableDepthWrite,true);
 assert.equal(fx.mesh.isWorldMatrixFrozen,true);assert.equal(fx.mesh.alwaysSelectAsActiveMesh,true);
 fx.dispose();assert.equal(fx.mesh.isDisposed(),true);
 w.close();
});

test('one level-up: banner, light and cue once; everything ends inside the time and returns to zero draws',async()=>{
 const f=celebration();
 f.step(1/60);await f.c.fx.ready;
 assert.equal(f.c.fx.root,f.w.root,'bound to the warrior while loading');
 const meshes=f.w.scene.meshes.length;
 assert.equal(f.c.levelUp({level:3,points:1,cap:20,ratio:.2,fromRatio:.8}),true);
 f.step(1/60);
 const hud=f.c.hud;
 assert.equal(hud.banner.hidden,false);assert.equal(hud.edge.hidden,false);
 assert.equal(hud.banner.querySelector('.v03-lvup-title').textContent,t('levelup.title'));
 assert.equal(hud.banner.querySelector('.v03-lvup-level').textContent,t('levelup.level',{level:3}));
 const stats=[...hud.banner.querySelectorAll('.v03-lvup-stats li')].filter(li=>!li.hidden).map(li=>li.textContent);
 assert.deepEqual(stats,[t('levelup.points',{n:1})],'only what rose: one skill point');
 assert.equal(hud.banner.querySelector('.v03-lvup-bar').style.getPropertyValue('--lv-from'),'0.800');
 assert.deepEqual(f.cues,['levelup']);
 assert.equal(f.c.fx.active,true);assert.ok(f.c.fx.draws>=2,'one light draw plus the body flash');
 assert.equal(f.c.fx.aura.active,true,'the full-body gold');
 f.step(.1,Math.ceil(LEVELUP_FX_SECONDS/.1));
 assert.equal(f.c.fx.active,false);assert.equal(f.c.fx.draws,0);assert.equal(drawn(f.w.scene),0);
 assert.ok(LEVELUP_FX_SECONDS>=1.6&&LEVELUP_FX_SECONDS<=2.2);
 f.step(.1,Math.ceil((LEVEL_SECONDS-LEVELUP_FX_SECONDS)/.1)+1);
 assert.equal(hud.banner.hidden,true);assert.equal(f.c.active,false);
 // Five more: still the same single mesh (pooled, nothing created per moment).
 for(let i=0;i<5;i++){f.c.levelUp({level:4+i,points:1});f.step(.1,30);}
 assert.equal(f.w.scene.meshes.length,meshes);
 assert.equal(f.w.scene.meshes.filter(m=>m.name===LEVELUP_FX_NAME).length,1);
 assert.equal(drawn(f.w.scene),0);
 f.close();
});

test('several levels at once are one banner with the final level and summed points; a late one in the first moment merges',()=>{
 const f=celebration();
 f.c.levelUp({level:2,points:1,ratio:.1,fromRatio:.5});f.c.levelUp({level:4,points:2,ratio:.3});
 f.step(1/60);
 assert.equal(f.c.hud.banner.querySelector('.v03-lvup-level').textContent,t('levelup.level',{level:4}));
 assert.equal(f.c.hud.banner.querySelector('.v03-lvup-stats li').textContent,t('levelup.points',{n:3}));
 f.step(.1,Math.floor(MERGE_SECONDS/.1)-2);
 f.c.levelUp({level:5,points:1,ratio:.05});f.step(1/60);
 assert.equal(f.c.hud.banner.querySelector('.v03-lvup-level').textContent,t('levelup.level',{level:5}));
 assert.equal(f.c.hud.banner.querySelector('.v03-lvup-stats li').textContent,t('levelup.points',{n:4}));
 assert.deepEqual(f.cues,['levelup'],'one cue for the merged moment');
 assert.equal(f.c.waiting,false);
 // Reaching the cap says so and keeps the bar full.
 f.step(.1,40);f.c.levelUp({level:20,points:1,cap:20,ratio:0});f.step(1/60);
 const rows=[...f.c.hud.banner.querySelectorAll('.v03-lvup-stats li')].filter(li=>!li.hidden).map(li=>li.textContent);
 assert.deepEqual(rows,[t('levelup.points',{n:1}),t('levelup.max')]);
 assert.equal(f.c.hud.banner.querySelector('.v03-lvup-fill').dataset.full,'1');
 f.close();
});

test('during dialogue, a cutscene or loading the moment waits, then plays once the screen is free',()=>{
 const f=celebration();let asked=0;
 f.frame.allowed=function(){asked++;return this.free;};
 f.step(1/60,3);assert.equal(asked,0,'nothing waiting: the gate is not even read');
 f.frame.free=false;f.c.levelUp({level:2,points:1});f.c.reward({gold:30,xp:40});
 f.step(.1,40);
 assert.equal(f.c.hud.banner.hidden,true);assert.equal(f.c.hud.strip.hidden,true);assert.equal(f.c.fx.active,false);
 assert.equal(f.c.waiting,true);assert.deepEqual(f.cues,[]);
 f.frame.free=true;f.step(1/60);
 assert.equal(f.c.hud.banner.hidden,false);assert.equal(f.c.hud.strip.hidden,false);assert.equal(f.c.fx.active,true);
 assert.deepEqual(f.cues,['levelup','quest:complete']);
 // A dialogue that opens over a playing moment ends it; nothing replays later.
 f.frame.free=false;f.step(1/60);
 assert.equal(f.c.hud.banner.hidden,true);assert.equal(f.c.fx.active,false);assert.equal(f.c.waiting,false);
 // A map change ends what plays; what waits survives the trip.
 f.frame.free=true;f.c.levelUp({level:3,points:1});f.step(1/60);assert.equal(f.c.fx.active,true);
 f.frame.mapId='great-plains';f.step(1/60);assert.equal(f.c.fx.active,false);
 f.close();
});

test('reduced motion: no body flash and a dimmer light; the banner and numbers stay',()=>{
 const f=celebration({reduced:true});
 f.c.levelUp({level:2,points:1});f.step(1/60);
 assert.equal(f.c.fx.active,true);assert.equal(f.c.fx.aura.active,false);
 assert.ok(f.c.fx.material._vectors4.lvBody.w<=.56);
 assert.equal(f.c.hud.banner.hidden,false);
 assert.equal(f.c.hud.banner.querySelector('.v03-lvup-stats li').textContent,t('levelup.points',{n:1}));
 const css=readFileSync(new URL('../src/v03/reward-fx.css',import.meta.url),'utf8');
 for(const part of ['.v03-lvup-edge','.v03-lvup-rays','.v03-lvup-flare','.v03-reward-rays'])assert.match(css,new RegExp('html\\[data-mf-motion="reduce"\\] \\'+part));
 f.close();
});

test('reward chips: gold and experience count up with few writes, items pop in, at most four chips',()=>{
 const doc=page(),hud=createRewardHud({doc,icon:(d,id)=>{const s=d.createElement('span');s.dataset.itemIcon=id;return s;}});
 assert.equal(hud.showReward({}),false);
 assert.equal(hud.showReward({gold:120,xp:60,potions:2,armor:'leather'}),true);
 const live=hud.chips.filter(c=>!c.li.hidden);assert.equal(live.length,4);assert.ok(hud.chips.length===REWARD_CHIP_LIMIT);
 let writes=0;const value=live[0].value;
 const seen=[];
 for(let i=0;i<60;i++){hud.tick(1/60);if(seen.at(-1)!==value.textContent){seen.push(value.textContent);writes++;}}
 assert.equal(value.textContent,'+'+t('reward.gold',{n:'120'}));
 assert.equal(live[1].value.textContent,t('reward.xp',{n:'60'}));
 assert.equal(live[2].value.textContent,t('reward.potions',{n:2}));
 assert.equal(live[3].art.querySelector('[data-item-icon]').dataset.itemIcon,'leather-coat');
 assert.ok(writes<=60&&writes>5);assert.equal(hud.counting,false);
 assert.ok(COUNT_SECONDS<=1);
 hud.dispose();
});

test('sound places are event names only: no new sound is joined yet',()=>{
 assert.deepEqual(Object.keys(REWARD_CUES).sort(),['levelup','quest:complete']);
 const played=[];
 assert.equal(playRewardCue('levelup',cue=>played.push(cue)),false);
 assert.equal(playRewardCue('levelup',cue=>played.push(cue),{levelup:'levelup_fanfare'}),true);
 assert.deepEqual(played,['levelup_fanfare']);
});

test('town services hand a level-up to the 0.3 moment, and keep the old message without one',ctx=>{
 const {document}=parseHTML('<html><body><main></main></body></html>'),root=document.querySelector('main');
 const store=()=>{const map=new Map();return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};};
 const open=onLevelUp=>{
  const notes=[],events=[];
  const town=setupTownServices({root,world:{},wallet:new GoldLoot({storage:store()}),legacy:()=>({}),player:()=>({}),battle:()=>null,controls:()=>null,appearance:()=>null,
   notify:m=>notes.push(m),onPause(){},...(onLevelUp?{onLevelUp:e=>{events.push(e);return onLevelUp(e);}}:{})});
  ctx.after(()=>town.dispose());return {town,notes,events};
 };
 const a=open(()=>true);
 assert.ok(a.town.creditQuestExperience(['M03'])>0);
 assert.equal(a.events.length,1);// M03: 100 XP from level 1 (40 for level 2, 90 for level 3).
 assert.equal(a.events[0].level,3);assert.equal(a.events[0].points,2);
 assert.equal(a.events[0].cap,20);assert.ok(a.events[0].ratio>=0&&a.events[0].ratio<1);
 assert.deepEqual(a.notes,[]);
 const b=open(null);b.town.creditQuestExperience(['M03']);
 assert.deepEqual(b.notes,[t('reward.levelUp',{level:3})]);
 const c=open(()=>false);c.town.creditQuestExperience(['M00']);
 assert.deepEqual(c.notes,[t('reward.levelUp',{level:2})],'a refused moment falls back to the message');
 assert.equal(c.town.creditQuestExperience(['M00']),0);
});

test('every banner word exists in the five languages',async()=>{
 for(const lang of ['ko','en','ja','vi','zh']){
  const {default:pack}=await import(`../src/v03/locales/${lang}.js`);
  for(const key of ['levelup.title','levelup.level','levelup.points','levelup.max','levelup.hint'])assert.equal(typeof pack.ui[key],'string',lang+' '+key);
  assert.match(pack.ui['levelup.level'],/\{level\}/);assert.match(pack.ui['levelup.points'],/\{n\}/);
 }
});
