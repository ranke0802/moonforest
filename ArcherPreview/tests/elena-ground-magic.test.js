import test from 'node:test';
import assert from 'node:assert/strict';
import {NullEngine,Scene,Vector3,VertexBuffer} from '@babylonjs/core';
import {ELENA_GROUND_PATTERNS,ELENA_GROUND_MAX_RANGE,ELENA_GROUND_FLASH_TIME,makeSpellPlan,spellContains,buildGroundSpellGeometry,GroundSpellTelegraph} from '../src/elena-ground-magic.js';
import {createWitchCaveTerrain} from '../src/witch-cave-terrain.js';

const at=(plan,across,along,center=plan.origin)=>({x:center.x+plan.direction.z*across+plan.direction.x*along,z:center.z-plan.direction.x*across+plan.direction.z*along});
const hit=(plan,position,radius=0)=>spellContains(plan,position,{radius});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
function fixture(t,terrain){
  const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;
  t.after(()=>{scene.dispose();engine.dispose();});return {scene,world:{scene,terrain}};
}

test('five immutable attack plans copy caller coordinates, clamp range, and have finite coincident aim',()=>{
  assert.deepEqual(ELENA_GROUND_PATTERNS,['corridor','fan','ring','cross','cluster']);
  const origin=new Vector3(29,6,-27),target=new Vector3(29,500,100);
  for(const pattern of ELENA_GROUND_PATTERNS){
    const plan=makeSpellPlan(pattern,origin,target,{range:999});
    assert.equal(plan.range,ELENA_GROUND_MAX_RANGE);assert.ok(Object.isFrozen(plan));assert.ok(Object.isFrozen(plan.shapes));assert.ok(Object.isFrozen(plan.shapes[0].center));
    assert.equal(plan.origin.y,6);assert.equal(plan.target.y,6);assert.equal(plan.target.z,-18);
    assert.throws(()=>{plan.origin.x=0;},TypeError);
    const same=makeSpellPlan(pattern,origin,origin);assert.deepEqual(same.direction,{x:0,z:1});
    assert.ok(buildGroundSpellGeometry(same).fill.positions.every(Number.isFinite));
  }
  const plan=makeSpellPlan('corridor',origin,target);origin.x=90;target.z=0;
  assert.equal(plan.origin.x,29);assert.equal(plan.target.z,-18);
  assert.throws(()=>makeSpellPlan('missing',origin,target),RangeError);
  assert.equal(spellContains(null,origin),false);assert.equal(spellContains(plan,{x:NaN,z:1}),false);
});

for(const angle of [0,Math.PI/2,.71,-2.4])test(`corridor and cross have exact rounded body-edge checks at rotation ${angle}`,()=>{
  const origin={x:29,y:6,z:-27},target={x:29+Math.sin(angle)*8,z:-27+Math.cos(angle)*8};
  const corridor=makeSpellPlan('corridor',origin,target),rect=corridor.shapes[0];
  assert.ok(hit(corridor,at(corridor,rect.halfWidth,0,rect.center)));
  assert.ok(!hit(corridor,at(corridor,rect.halfWidth+.01,0,rect.center)));
  assert.ok(hit(corridor,at(corridor,rect.halfWidth+.29,0,rect.center),.3));
  assert.ok(!hit(corridor,at(corridor,rect.halfWidth+.31,0,rect.center),.3));
  assert.ok(!hit(corridor,at(corridor,rect.halfWidth+.25,rect.halfLength+.25,rect.center),.3),'box corners must use a round body radius');
  assert.ok(!hit(corridor,at(corridor,0,-1)),'behind Elena remains safe');
  const cross=makeSpellPlan('cross',origin,target),shape=cross.shapes[0],{halfLength:l,halfWidth:w,center}=shape;
  for(const [x,z] of [[0,l],[l,0],[-l,0],[0,-l],[w,w]])assert.ok(hit(cross,at(cross,x,z,center)));
  assert.ok(!hit(cross,at(cross,w+.5,w+.5,center),.3),'four diagonal pockets stay safe');
  assert.ok(!hit(cross,at(cross,l+.31,0,center),.3));
});

for(const angle of [0,.8,-2.2])test(`fan retains radial safe zone and exact arc/side boundaries at rotation ${angle}`,()=>{
  const plan=makeSpellPlan('fan',{x:29,y:6,z:-27},{x:29+Math.sin(angle)*7,z:-27+Math.cos(angle)*7}),shape=plan.shapes[0],r=7;
  assert.ok(hit(plan,at(plan,0,r)));assert.ok(!hit(plan,plan.origin,.3));assert.ok(!hit(plan,at(plan,0,-r),.3));
  assert.ok(hit(plan,at(plan,0,shape.outerRadius+.29),.3));assert.ok(!hit(plan,at(plan,0,shape.outerRadius+.31),.3));
  for(const side of [-1,1]){
    const edge=shape.halfAngle*side;
    assert.ok(hit(plan,at(plan,Math.sin(edge)*r,Math.cos(edge)*r)));
    const outside=edge+side*.08;
    assert.ok(!hit(plan,at(plan,Math.sin(outside)*r,Math.cos(outside)*r),.3));
  }
});

test('ring keeps a usable inner refuge and includes only overlapping body discs',()=>{
  const plan=makeSpellPlan('ring',{x:29,y:6,z:-27},{x:31,z:-23}),shape=plan.shapes[0];
  assert.ok(!hit(plan,plan.origin,.3));
  assert.ok(!hit(plan,at(plan,0,shape.innerRadius-.31),.3));assert.ok(hit(plan,at(plan,0,shape.innerRadius-.3),.3));
  assert.ok(hit(plan,at(plan,0,shape.innerRadius)));assert.ok(hit(plan,at(plan,0,shape.outerRadius)));
  assert.ok(hit(plan,at(plan,0,shape.outerRadius+.3),.3));assert.ok(!hit(plan,at(plan,0,shape.outerRadius+.31),.3));
});

test('cluster locks three circle centers near the target and does not cover the entire arena',()=>{
  const plan=makeSpellPlan('cluster',{x:29,y:6,z:-27},{x:29,z:100});assert.equal(plan.shapes.length,3);
  for(const shape of plan.shapes){
    assert.ok(hit(plan,shape.center));assert.ok(Math.hypot(shape.center.x-29,shape.center.z+27)+shape.radius<=plan.range+1e-6);
  }
  assert.equal(plan.shapes[0].center.z,-18);assert.ok(!hit(plan,plan.origin,.3));
  assert.ok(!hit(plan,at(plan,0,12),.3));assert.ok(!hit(plan,at(plan,8,7),.3));
});

test('all shape geometry shares the analytical footprint, conforms to cave floor, and stays within a small fixed budget',()=>{
  const terrain=createWitchCaveTerrain(),origin={x:29,y:6,z:-27};
  for(const pattern of ELENA_GROUND_PATTERNS){
    const plan=makeSpellPlan(pattern,origin,{x:33,z:-22}),data=buildGroundSpellGeometry(plan,terrain);
    for(const [name,part] of Object.entries(data)){
      assert.ok(part.positions.length/3<3000,`${pattern} ${name} vertex budget`);assert.ok(part.indices.length/3<5000,`${pattern} ${name} triangle budget`);
      assert.ok(part.positions.every(Number.isFinite));assert.ok(part.normals.every(Number.isFinite));
      for(let i=0;i<part.positions.length;i+=3){
        const [x,y,z]=part.positions.slice(i,i+3);near(y,terrain.heightAt(x,z)+(name==='fill'?.045:.065));
        assert.ok(Math.hypot(x-origin.x,z-origin.z)<=plan.range+.07);
        if(name==='fill')assert.ok(hit(plan,{x,z},.00001),`${pattern} rendered fill vertex must be in the damaging footprint`);
      }
      assert.ok(part.indices.every(index=>Number.isInteger(index)&&index>=0&&index<part.positions.length/3));
    }
  }
});

test('cross fill contains no transparent double coverage and ring mesh leaves its inner refuge open',()=>{
  for(const pattern of ['cross','ring']){
    const plan=makeSpellPlan(pattern,{x:0,y:6,z:0},{x:0,z:7}),{fill}=buildGroundSpellGeometry(plan),shape=plan.shapes[0];let area=0;
    for(let i=0;i<fill.indices.length;i+=3){
      const [a,b,c]=fill.indices.slice(i,i+3).map(index=>[fill.positions[index*3],fill.positions[index*3+2]]);
      area+=Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))*.5;
      const center={x:(a[0]+b[0]+c[0])/3,z:(a[1]+b[1]+c[1])/3};assert.ok(hit(plan,center,.01));
    }
    if(pattern==='cross')near(area,8*shape.halfLength*shape.halfWidth-4*shape.halfWidth**2);
    else assert.ok(Math.abs(area-Math.PI*(shape.outerRadius**2-shape.innerRadius**2))<.3);
  }
});

test('extreme options cannot create unbounded, inverted, or nonfinite geometry',()=>{
  for(const pattern of ELENA_GROUND_PATTERNS)for(const options of [{range:2,radius:0,bossRadius:100,innerRadius:99,halfWidth:99},{range:Infinity,radius:NaN,halfAngle:Infinity},{range:999,radius:999,innerRadius:-9,halfWidth:999}]){
    const plan=makeSpellPlan(pattern,{x:29,y:6,z:-27},{x:200,z:300},options),{fill}=buildGroundSpellGeometry(plan,{heightAt:()=>NaN});
    assert.ok(fill.positions.every(Number.isFinite));
    for(let i=0;i<fill.positions.length;i+=3)assert.ok(Math.hypot(fill.positions[i]-29,fill.positions[i+2]+27)<=plan.range+1e-6);
  }
});

test('telegraph locks aim once, changes only opacity during warning, and reuses two meshes across casts',t=>{
  let samples=0;const {scene,world}=fixture(t,{heightAt:(x,z)=>{samples++;return 6+x*.001+z*.002;}}),fx=new GroundSpellTelegraph(world);
  const origin=new Vector3(29,6,-27),target=new Vector3(29,6,-20),plan=fx.aim(1,'corridor',origin,target),geometry=fx.mesh.geometry,buffer=fx.mesh.getVertexBuffer(VertexBuffer.PositionKind),count=samples;
  assert.strictEqual(fx.aim(1,'ring',new Vector3(0,0,0),new Vector3(4,0,0)),plan);assert.equal(samples,count);assert.equal(fx.plan.origin.y,6);
  assert.equal(scene.meshes.length,2);assert.equal(scene.materials.length,2);assert.equal(scene.textures.length,0);
  fx.show(0,2.2);const faint=fx.material.alpha;fx.show(1.9,2.2);assert.ok(fx.material.alpha>faint);assert.ok(fx.rimMaterial.alpha>fx.material.alpha);
  for(let i=0;i<100;i++)fx.show(i/100,2.2);
  assert.equal(samples,count);assert.strictEqual(fx.mesh.geometry,geometry);assert.strictEqual(fx.mesh.getVertexBuffer(VertexBuffer.PositionKind),buffer);
  assert.equal(fx.fired,false,'presentation never applies damage or consumes the release');
  fx.show(2.2,2.2,{flash:true});assert.equal(fx.material.alpha,.48);assert.equal(fx.rimMaterial.alpha,1);
  fx.show(2.2+ELENA_GROUND_FLASH_TIME+.01,2.2);assert.equal(fx.mesh.isEnabled(),false);assert.equal(fx.rim.isEnabled(),false);
  for(let i=0;i<100;i++){
    fx.aim(i+2,ELENA_GROUND_PATTERNS[i%5],origin,target);fx.show(.5,2.2);fx.fired=true;fx.reset();
    assert.equal(scene.meshes.length,2);assert.equal(scene.materials.length,2);assert.equal(scene.geometries.length,2);assert.equal(fx.fired,false);
    assert.equal(fx.plan,null);assert.equal(fx.mesh.isEnabled(),false);assert.equal(fx.rim.isEnabled(),false);
  }
  for(const mesh of [fx.mesh,fx.rim]){assert.equal(mesh.isPickable,false);assert.equal(mesh.receiveShadows,false);assert.equal(mesh.material.disableDepthWrite,true);}
  fx.dispose();fx.dispose();assert.equal(scene.meshes.length,0);assert.equal(scene.materials.length,0);assert.equal(scene.geometries.length,0);
  assert.equal(fx.aim(500,'ring',origin,target),null);fx.show(.1,2.2);
});
