import test from 'node:test';
import assert from 'node:assert/strict';
import {ArcRotateCamera,Mesh,MeshBuilder,NullEngine,Scene,StandardMaterial,Vector3} from '@babylonjs/core';
import {createForgeBench} from '../src/v03/forge-bench.js';

// 2026-11-27 browser playtest: the worn sword's copy had metadata null, and the character
// outline/paint bind hooks read mesh.metadata.characterStyleGroup, so the first frame threw
// and the bench fell back to 2D. The copies carry their own copy of the source metadata.
test('the forge bench copies of the worn piece and its ink shell keep the style metadata',()=>{
 const engine=new NullEngine(),scene=new Scene(engine);
 try{
  const camera=new ArcRotateCamera('play',.6,1.1,11,new Vector3(2,1,5),scene);
  const sword=MeshBuilder.CreateBox('Golden_Oathblade',{height:1.2,width:.1,depth:.03},scene);sword.material=new StandardMaterial('sword',scene);
  sword.metadata={characterStyleGroup:'player'};
  const ink=MeshBuilder.CreateBox('Golden_Oathblade_ink',{height:1.22,width:.12,depth:.05},scene);ink.parent=sword;ink.material=new StandardMaterial('ink',scene);
  ink.metadata={moonforestOutline:true,characterStyleGroup:'player',characterInkNormalSign:-1};
  const canvas={getBoundingClientRect:()=>({left:0,top:0,width:1280,height:720})};
  const bench=createForgeBench({scene,camera,canvas,piece:{mesh:sword},slot:'sword'});
  try{
   const surface=scene.getMeshByName('v03-forge-piece-surface'),copy=scene.getMeshByName('v03-forge-piece-ink');
   assert.ok(surface&&copy,'both copies exist');
   assert.equal(surface.metadata?.characterStyleGroup,'player');
   assert.equal(copy.metadata?.characterStyleGroup,'player');
   assert.equal(copy.metadata?.characterInkNormalSign,-1);
   assert.notEqual(copy.metadata,ink.metadata,'its own object, so writes on the copy never reach the worn piece');
  }finally{bench?.dispose?.();}
 }finally{engine.dispose();}
});
