import test from 'node:test';
import assert from 'node:assert/strict';
import {NullEngine,Scene,VertexBuffer,Vector3,TransformNode} from '@babylonjs/core';
import {TerrainHeightField} from '../src/terrain.js';
import {createTerrainGround,createTerrainRing} from '../src/terrain-mesh.js';
import {ArenaNavigation} from '../src/navigation.js';
import {constrainDodge} from '../src/dodge-collision.js';
import {createTrainingTargets} from '../src/targets.js';
import {GoldLoot} from '../src/gold-loot.js';
import {BossGrab} from '../src/boss-grab.js';

function fixture(t){const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;t.after(()=>{scene.dispose();engine.dispose();});return scene;}
test('central arena stays flat; visible hills retain walkable slopes and the same mesh budget',()=>{
  const terrain=new TerrainHeightField();let maximum=0,maxSlope=0;
  for(let x=-11;x<=11;x+=.15)for(let z=-11;z<=11;z+=.15){
    const r=Math.hypot(x,z);if(r>11)continue;const y=terrain.heightAt(x,z);assert.ok(y>=0);if(r<=3.1)assert.equal(y,0);
    maximum=Math.max(maximum,y);maxSlope=Math.max(maxSlope,Math.hypot((terrain.heightAt(x+.01,z)-terrain.heightAt(x-.01,z))/.02,(terrain.heightAt(x,z+.01)-terrain.heightAt(x,z-.01))/.02));
  }
  assert.ok(maximum>1.5&&maximum<1.8);assert.ok(maxSlope<.43,`slope ${maxSlope}`);assert.equal(terrain.heights.byteLength,16900);
  assert.ok(terrain.heightAt(1,8)>1,'forest shoulder must be visible above the clearing');
  assert.equal(terrain.heightAt(100,100),terrain.heightAt(35,35));
});
test('ground height lookup exactly matches rendered triangles, with upward smooth normals and one mesh',t=>{
  const scene=fixture(t),terrain=new TerrainHeightField(),ground=createTerrainGround(scene,terrain);
  const positions=ground.getVerticesData(VertexBuffer.PositionKind),indices=ground.getIndices(),normals=ground.getVerticesData(VertexBuffer.NormalKind);
  assert.equal(indices.length/3,8192);assert.equal(scene.meshes.length,1);assert.equal(ground.getTotalVertices(),4225);
  for(let i=0;i<indices.length;i+=21){const a=indices[i]*3,b=indices[i+1]*3,c=indices[i+2]*3;
    const x=positions[a]*.2+positions[b]*.3+positions[c]*.5,z=positions[a+2]*.2+positions[b+2]*.3+positions[c+2]*.5,y=positions[a+1]*.2+positions[b+1]*.3+positions[c+1]*.5;
    assert.ok(Math.abs(terrain.heightAt(x,z)-y)<1e-6);
  }
  for(let i=1;i<normals.length;i+=3)assert.ok(normals[i]>.9);
  assert.ok(ground.getBoundingInfo().boundingBox.maximum.y>2);
});
test('grounded movement and rolling retain existing obstacle sliding without shifting enemies',()=>{
  const terrain=new TerrainHeightField(),navigation=new ArenaNavigation([{x:6,z:3,radius:.5}]),position=new Vector3(4,0,3),enemy={active:true,kind:'goblin',radius:.34,brain:{hp:180,mode:'move'},actor:{position:new Vector3(7,0,3)}};
  terrain.place(position);const initial=enemy.actor.position.clone();
  for(let i=0;i<30;i++){const previous=position.clone();position.x+=.15;constrainDodge(position,previous,navigation,[enemy]);terrain.place(position);assert.ok(Math.abs(position.y-previous.y)<.075);assert.ok(Math.hypot(position.x-6,position.z-3)>.81);}
  assert.ok(enemy.actor.position.equals(initial));assert.equal(position.y,terrain.heightAt(position.x,position.z));
});
test('warning ring follows hills, costs 128 triangles, and does not update while hidden',t=>{
  const scene=fixture(t),terrain=new TerrainHeightField(),warning=createTerrainRing(scene,terrain),center=new Vector3(6,0,3);
  warning.update(center,2);const positions=warning.mesh.getVerticesData(VertexBuffer.PositionKind);assert.equal(warning.mesh.getTotalIndices()/3,128);
  for(let i=0;i<positions.length;i+=3)assert.ok(Math.abs(positions[i+1]-terrain.heightAt(center.x+positions[i],center.z+positions[i+2])-.025)<1e-6);
  const before=Array.from(positions);warning.mesh.isVisible=false;warning.update(new Vector3(-7,0,4),2);assert.deepEqual(Array.from(warning.mesh.getVerticesData(VertexBuffer.PositionKind)),before);
});
test('flat outer skirt hides the floor edge without adding geometry or altering playable terrain',t=>{
 const scene=fixture(t),terrain=new TerrainHeightField(),normal=createTerrainGround(scene,terrain),extended=createTerrainGround(scene,terrain,{borderExtension:32});
 const a=normal.getVerticesData(VertexBuffer.PositionKind),b=extended.getVerticesData(VertexBuffer.PositionKind);
 assert.equal(extended.getTotalIndices(),normal.getTotalIndices());assert.equal(extended.getTotalVertices(),4225);
 assert.equal(extended.getBoundingInfo().boundingBox.maximum.x,67);
 for(let i=0;i<a.length;i+=3)if(Math.hypot(a[i],a[i+2])<30)assert.deepEqual(Array.from(b.slice(i,i+3)),Array.from(a.slice(i,i+3)));
});
test('scarecrow and gold sit on terrain instead of world zero',t=>{
  const scene=fixture(t),terrain=new TerrainHeightField({height:()=>.3}),training=createTrainingTargets(scene,null,()=>{},terrain),loot=new GoldLoot();
  const target=training.targets[0];assert.ok(Math.abs(target.position.y-.3)<1e-7);assert.ok(target.aimPoint.y>1.3);
  const position=terrain.place(new Vector3(7,0,3));loot.drop('goblin',position);assert.ok(Math.abs(loot.drops[0].position.y-.34)<1e-7);
});
test('throw and escape use the current terrain height without flattening airborne poses',t=>{
  const scene=fixture(t),terrain=new TerrainHeightField({height:(x,z)=>.5+x*.03}),player=new TransformNode('player',scene),boss=new TransformNode('boss',scene);
  terrain.place(player.position);terrain.place(boss.position);
  const node=(name,parent,y)=>{const n=new TransformNode(name,scene);n.parent=parent;n.position.y=y;return n;};
  const nodes={'mixamorig:RightFoot':node('foot',player,.1),'mixamorig:Head':node('head',player,1.7)};
  const hands={'mixamorig:RightHand':node('hand',boss,1.5),'mixamorig:RightForeArm':node('forearm',boss,1.3)};
  const grab=new BossGrab(()=>{},()=>{},{heightAt:(x,z)=>terrain.heightAt(x,z)});
  grab.start(player,nodes,1);player.position.y=2;assert.ok(grab.escape());assert.ok(Math.abs(player.position.y-.5)<1e-7);
  grab.start(player,nodes,2);player.position.y=2;grab.velocity.set(1,0,0);grab.throw();
  assert.ok(grab.flightEnd.y>terrain.heightAt(grab.flightEnd.x,grab.flightEnd.z));
  for(let i=0;i<100;i++)grab.update(.02,{boss,nodes:hands,serial:2,state:'Skill_02',clipTime:2,duration:2});
  assert.equal(grab.active,false);assert.equal(player.position.y,terrain.heightAt(player.position.x,player.position.z));assert.ok(player.position.y>.5);
});
