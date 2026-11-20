import test from 'node:test';
import assert from 'node:assert/strict';
import {Matrix,Quaternion,Vector3} from '@babylonjs/core';
import {createWagonRig,WAGON_TIP} from '../src/v03/wagon-rig.js';

// The wagon's measured cross section (2026-11-20), front and back.
const SECTION=[[-1.14,0],[1.14,0],[1.3,.6],[1.14,1.28],[.76,2.37],[0,3],[-.76,2.37],[-1.14,1.28],[-1.3,.6]];
const contact=new Float32Array(SECTION.flatMap(([x,y])=>[x,y,-2.6,x,y,4.1]));
const root=()=>({position:new Vector3(10,.5,-4),rotation:new Vector3(0,0,0),rotationQuaternion:Quaternion.RotationYawPitchRoll(.7,0,0),isDisposed:()=>false});
const lowest=(node,heightAt)=>{
 const turn=new Matrix(),point=new Vector3();node.rotationQuaternion.toRotationMatrix(turn);let gap=Infinity;
 for(let i=0;i<contact.length;i+=3){Vector3.TransformCoordinatesFromFloatsToRef(contact[i],contact[i+1],contact[i+2],turn,point);point.addInPlace(node.position);gap=Math.min(gap,point.y-heightAt(point.x,point.z));}
 return gap;
};

test('the tipped wagon touches the ground at every angle, on flat and sloping ground',()=>{
 for(const heightAt of [()=>.5,(x,z)=>.5+(x-10)*.05-(z+4)*.03]){
  const node=root(),rig=createWagonRig({getRoot:()=>node,heightAt,getContact:()=>contact});
  for(const side of [1,-1])for(let tip=WAGON_TIP.settleBy;tip<=1.0001;tip+=.04){
   assert.equal(rig.pose({along:0,tip:Math.min(1,tip),side}),true);
   assert.ok(Math.abs(lowest(node,heightAt))<1e-4,`tip ${tip.toFixed(2)} side ${side}: ${lowest(node,heightAt)}`);
  }
 }
});

test('lying on its side the wagon rests on the wheel rim and the canopy shoulder',()=>{
 const node=root(),heightAt=()=>.5,rig=createWagonRig({getRoot:()=>node,heightAt,getContact:()=>contact});
 rig.pose({along:0,tip:1,side:-1});
 const turn=new Matrix(),point=new Vector3();node.rotationQuaternion.toRotationMatrix(turn);
 const height=(x,y)=>{Vector3.TransformCoordinatesFromFloatsToRef(x,y,0,turn,point);return point.y+node.position.y-.5;};
 // wheel rim top and canopy shoulder on the fall side both within 6 cm of the ground
 assert.ok(height(-1.14,1.28)<.06,`rim ${height(-1.14,1.28)}`);
 assert.ok(height(-.76,2.37)<.06,`canopy ${height(-.76,2.37)}`);
 // set back upright it returns to its placed spot
 rig.upright();
 assert.ok(Vector3.Distance(node.position,new Vector3(10,.5,-4))<1e-6);
});

test('without outline points the rig still tips (no ground settling)',()=>{
 const node=root(),rig=createWagonRig({getRoot:()=>node,heightAt:()=>.5});
 assert.equal(rig.pose({along:0,tip:1,side:1}),true);
 assert.ok(rig.holds(1));
});
