import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Constants,FreeCamera,MeshBuilder,NullEngine,Scene,Skeleton,Bone,Matrix,StandardMaterial,TransformNode,Vector3,VertexBuffer,VertexData} from '@babylonjs/core';
import {parseHTML} from 'linkedom';
import {createStarfallAura,auraChargeStrength,auraFill,auraLevelGain,auraWhiteness,STARFALL_AURA_SHADERS,AURA_NAME_PREFIX,AURA_HALO_NAME,
 AURA_RELEASE_PEAK,AURA_RELEASE_END,AURA_CANCEL_SECONDS} from '../src/v03/starfall-aura.js';
import {inspectPreparedEffects} from '../src/prepared-effect-lifetime.js';
import {setupV03} from '../src/v03/boot.js';
import {createSaveSession} from '../src/v03/save-slots.js';

// A warrior-shaped stand-in: a skinned body, a rigid sword under a hand node, a small
// neck part and a baked outline (both skipped), and the hips bone the halo follows.
function warrior(scene){
 const root=new TransformNode('player-world-transform',scene),hips=new TransformNode('mixamorig:Hips',scene),hand=new TransformNode('mixamorig:RightHand',scene);
 hips.parent=root;hips.position.y=.9;hand.parent=root;
 const paint=new StandardMaterial('paint',scene),ink=new StandardMaterial('V6_Outline_Black',scene);
 const skeleton=new Skeleton('rig','rig',scene);new Bone('hips',skeleton,null,Matrix.Identity());skeleton.useTextureToStoreBoneMatrices=true;
 const body=MeshBuilder.CreateSphere('Warrior_Body_primitive0',{segments:24},scene);body.parent=root;body.material=paint;
 const n=body.getTotalVertices();
 body.setVerticesData(VertexBuffer.MatricesIndicesKind,new Float32Array(n*4));
 body.setVerticesData(VertexBuffer.MatricesWeightsKind,new Float32Array(n*4).map((_,i)=>i%4?0:1));
 body.skeleton=skeleton;body.computeBonesUsingShaders=true;body.numBoneInfluencers=1;
 const sword=MeshBuilder.CreateCylinder('Golden_Oathblade',{tessellation:128,subdivisions:8},scene);sword.parent=hand;sword.material=paint;
 const neck=MeshBuilder.CreateBox('Warrior_Neck',{},scene);neck.parent=root;neck.material=paint;
 const outline=MeshBuilder.CreateSphere('Warrior_Body_Outline',{segments:24},scene);outline.parent=root;outline.material=ink;
 return {root,hips,body,sword,neck,outline};
}
function fixture(){
 const engine=new NullEngine(),scene=new Scene(engine);new FreeCamera('camera',new Vector3(0,1.5,-4),scene);
 let time=1000;
 const parts=warrior(scene),aura=createStarfallAura({scene,now:()=>time});
 return {engine,scene,aura,...parts,advance(ms){time+=ms;aura.tick();},get time(){return time;}};
}
const cast=(over={})=>({actionId:1,level:1,charging:true,chargeProgress:0,progress:0,phase:'windup',releaseCharge:0,...over});
const glowOf=aura=>aura.material._vectors4.auraGlow;
const near=(a,b,eps=1e-6)=>assert.ok(Math.abs(a-b)<=eps,`${a} ≈ ${b}`);

test('shells follow the warrior parts, share their geometry and rig, and are never picked, shadowed, outlined or depth-writing',async()=>{
 const f=fixture();
 await f.aura.bind(f.root);
 const names=f.aura.shells.map(s=>s.name).sort();
 assert.deepEqual(names,[AURA_NAME_PREFIX+'Golden_Oathblade',AURA_NAME_PREFIX+'Warrior_Body_primitive0']);
 for(const shell of f.aura.shells){
  const source=shell.parent;
  assert.ok(source===f.body||source===f.sword);
  assert.equal(shell.geometry,source.geometry,'the GPU geometry is shared');
  assert.equal(shell.skeleton,source.skeleton);
  assert.equal(shell.material,f.aura.material);
  assert.equal(shell.isPickable,false);assert.equal(shell.receiveShadows,false);assert.equal(shell.renderOutline,false);assert.equal(shell.renderOverlay,false);
  assert.equal(shell.metadata.moonforestOutline,undefined);
  assert.equal(shell.isEnabled(false),false);
 }
 // Story and riding hide arms by name (story.js ARMS, riding-horse.js): a shell never matches.
 for(const shell of f.aura.shells)assert.equal(/^(Golden_Oathblade|Bunnyguard_Shield)( \/|$)/.test(shell.name),false);
 for(const material of [f.aura.material,f.aura.halo.material]){
  assert.equal(material.disableDepthWrite,true);assert.equal(material.alphaMode,Constants.ALPHA_ADD);
 }
 assert.equal(f.aura.halo.isPickable,false);assert.equal(f.aura.halo.receiveShadows,false);assert.equal(f.aura.halo.renderOutline,false);
 f.aura.dispose();f.scene.dispose();f.engine.dispose();
});

test('idle draws nothing; charging draws the shells plus one halo and stops again',async()=>{
 const f=fixture();await f.aura.bind(f.root);await f.scene.whenReadyAsync();
 let draws=0;for(const mesh of [...f.aura.shells,f.aura.halo])mesh.onAfterRenderObservable.add(()=>draws++);
 f.scene.render();assert.equal(draws,0);assert.equal(f.aura.draws,0);
 f.aura.update(cast({chargeProgress:.5}));f.advance(200);f.scene.render();
 assert.equal(f.aura.draws,f.aura.shells.length+1);assert.equal(draws,f.aura.shells.length+1);
 const info=f.aura.inspect();assert.equal(info.haloVertices,4);assert.equal(info.drawnVertices,info.vertices+4);
 f.aura.reset();draws=0;f.scene.render();assert.equal(draws,0);assert.equal(f.aura.active,false);assert.equal(f.aura.inspect().drawnVertices,0);
 f.aura.dispose();f.scene.dispose();f.engine.dispose();
});

test('the glow builds with the charge and the skill level, and pulses at 2 Hz when full',async()=>{
 assert.ok(auraChargeStrength(0,1)>0&&auraChargeStrength(0,1)<.15,'faint at the start');
 assert.ok(auraChargeStrength(.3,1)>.4,'clearly visible by 30 %');
 near(auraChargeStrength(1,1),auraLevelGain(1));
 assert.ok(auraLevelGain(5)>auraLevelGain(1)&&auraWhiteness(5)>auraWhiteness(1)&&auraWhiteness(5)<.25,'level 5: stronger, a little paler, still gold');
 near(auraFill(auraChargeStrength(.3,1)),.12,.02);near(auraFill(auraChargeStrength(1,1)),.24,.01);assert.equal(auraFill(9),.45);
 const f=fixture();await f.aura.bind(f.root);
 let last=0;
 for(const charge of [.1,.3,.6,.9]){f.aura.update(cast({chargeProgress:charge}));f.advance(150);assert.ok(f.aura.strength>last);last=f.aura.strength;}
 near(glowOf(f.aura).x,f.aura.strength);near(glowOf(f.aura).w,auraFill(f.aura.strength));
 f.aura.update(cast({chargeProgress:1}));const base=auraChargeStrength(1,1);near(f.aura.strength,base);
 f.advance(125);near(f.aura.strength,base*1.12,1e-6);
 f.advance(250);near(f.aura.strength,base*.88,1e-6);
 f.aura.reset();
 f.aura.update(cast({actionId:2,level:5,chargeProgress:1}));f.advance(200);
 assert.ok(f.aura.strength>base);near(glowOf(f.aura).y,auraWhiteness(5));
 f.aura.dispose();f.scene.dispose();f.engine.dispose();
});

test('release peaks within 0.12 s and is gone by 0.35 s; cancel fades in 0.2 s',async()=>{
 const f=fixture();await f.aura.bind(f.root);
 const c=cast({chargeProgress:1});f.aura.update(c);f.advance(500);
 const held=f.aura.strength;
 c.charging=false;c.phase='release';c.releaseCharge=1;f.aura.update(c);
 f.advance(60);const peak=f.aura.strength;assert.ok(peak>held,'brighter than the charge');
 assert.ok(glowOf(f.aura).y>auraWhiteness(1),'whiter core at the peak');
 f.advance(50);near(f.aura.strength,peak);
 f.advance(100);assert.ok(f.aura.strength<peak*.7);
 c.phase='impact';f.aura.update(c);
 f.advance(AURA_RELEASE_END*1000-210-1);assert.equal(f.aura.active,true);
 f.advance(2);assert.equal(f.aura.active,false);assert.equal(f.aura.draws,0);
 for(const shell of f.aura.shells)assert.equal(shell.isEnabled(false),false);
 assert.equal(f.aura.halo.isEnabled(false),false);
 // Cancel: the cast is cleared while charging (hit, menu, death).
 f.aura.update(cast({actionId:2,chargeProgress:.6}));f.advance(300);
 const before=f.aura.strength;f.aura.update(null);
 f.advance(AURA_CANCEL_SECONDS*500);assert.ok(f.aura.strength<before&&f.aura.strength>0);
 f.advance(AURA_CANCEL_SECONDS*500+1);assert.equal(f.aura.active,false);assert.equal(f.aura.draws,0);
 assert.ok(AURA_RELEASE_PEAK<AURA_RELEASE_END);
 f.aura.dispose();f.scene.dispose();f.engine.dispose();
});

test('a sword model swap, a new player and player disposal re-bind or release every shell without leftovers',async()=>{
 const f=fixture();
 const meshes=f.scene.meshes.length,materials=f.scene.materials.length,observers=f.scene.onDisposeObservable.observers.length;
 await f.aura.bind(f.root);
 assert.equal(f.aura.bind(f.root),f.aura.bind(f.root),'the same player costs nothing');
 // equipment.js wear(): another geometry on the standard blade.
 const blade=f.aura.shells.find(s=>s.parent===f.sword);
 const other=MeshBuilder.CreateCylinder('soldier-sword',{tessellation:140,subdivisions:8},f.scene);
 other.geometry.applyToMesh(f.sword);
 f.aura.update(cast({chargeProgress:.5}));f.advance(100);
 assert.equal(blade.geometry,f.sword.geometry);
 other.dispose();
 // A reloaded character: the old root is disposed, its shells with it.
 const next=warrior(f.scene);
 await f.aura.bind(next.root);
 assert.ok(f.aura.shells.every(s=>s.parent.parent===next.root||s.parent.parent?.parent===next.root));
 assert.equal(blade.isDisposed(),true,'the previous shells are released');
 next.root.dispose();
 assert.equal(f.aura.shells.length,0);assert.equal(f.aura.root,null);assert.equal(f.aura.active,false);
 assert.equal(f.scene.meshes.filter(m=>m.name.startsWith(AURA_NAME_PREFIX)).length,0);
 f.root.dispose();
 f.aura.dispose();
 assert.equal(meshes,4+1,'four stand-in parts and the halo');
 assert.deepEqual(f.scene.meshes.map(m=>m.name),[],'no shell, no halo, no stand-in left');
 assert.equal(f.scene.getMeshByName(AURA_HALO_NAME),null);
 assert.equal(f.scene.materials.length,materials,'aura materials released');
 // Babylon removes observers on the next task (Observable._deferUnregister).
 await new Promise(resolve=>setTimeout(resolve,5));
 assert.equal(observers,1,'the aura\'s own scene observer');
 assert.equal(f.scene.onDisposeObservable.observers.length,0,'no aura or preparation observer is left on the scene');
 f.scene.dispose();f.engine.dispose();
});

// GLSL ES 3.00 words (the checker of tests/review-shader-es300-words.test.js, 2026-11-26).
const RESERVED=`coherent volatile restrict readonly writeonly resource atomic_uint noperspective patch sample subroutine common partition active filter
 image1D image2D image3D imageCube iimage1D iimage2D iimage3D iimageCube uimage1D uimage2D uimage3D uimageCube image1DArray image2DArray iimage1DArray iimage2DArray uimage1DArray uimage2DArray
 imageBuffer iimageBuffer uimageBuffer sampler1DShadow sampler1DArray sampler1DArrayShadow isampler1D isampler1DArray usampler1D usampler1DArray sampler2DRect sampler2DRectShadow isampler2DRect usampler2DRect
 samplerBuffer isamplerBuffer usamplerBuffer sampler2DMS isampler2DMS usampler2DMS sampler2DMSArray isampler2DMSArray usampler2DMSArray
 uint uvec2 uvec3 uvec4 layout centroid flat smooth mat2x2 mat2x3 mat2x4 mat3x2 mat3x3 mat3x4 mat4x2 mat4x3 mat4x4 sampler3D sampler3DRect sampler2DShadow samplerCubeShadow sampler2DArray sampler2DArrayShadow
 isampler2D isampler3D isamplerCube isampler2DArray usampler2D usampler3D usamplerCube usampler2DArray input output texture`.split(/\s+/).filter(Boolean);
const NEW_BUILTINS=`sinh cosh tanh asinh acosh atanh trunc round roundEven modf isnan isinf floatBitsToInt floatBitsToUint intBitsToFloat uintBitsToFloat packSnorm2x16 unpackSnorm2x16 packUnorm2x16 unpackUnorm2x16
 packHalf2x16 unpackHalf2x16 outerProduct transpose determinant inverse textureSize textureProj textureLod textureOffset texelFetch texelFetchOffset textureProjOffset textureLodOffset textureProjLod textureProjLodOffset
 textureGrad textureGradOffset textureProjGrad textureProjGradOffset dFdx dFdy fwidth`.split(/\s+/).filter(Boolean);
const strip=text=>text.replace(/\/\*[\s\S]*?\*\//g,' ').replace(/\/\/[^\n]*/g,' ').replace(/^[ \t]*#[^\n]*/gm,' ');
function problems(shader){
 const code=strip(shader),bad=new Set(),forbidden=new Set(RESERVED);
 for(const [word] of code.matchAll(/[A-Za-z_][A-Za-z0-9_]*/g))if(forbidden.has(word))bad.add(word);
 // This program must also link on WebGL1: it calls no 3.00-only built-in at all.
 for(const name of NEW_BUILTINS)if(new RegExp('\\b'+name+'\\s*\\(').test(code))bad.add(name+'()');
 return [...bad];
}
test('the assembled aura programs use no GLSL ES 3.00 reserved word and share precision across stages',()=>{
 const engine=new NullEngine(),scene=new Scene(engine);
 for(const cave of [false,true]){
  const aura=createStarfallAura({scene,cave,now:()=>0});
  for(const material of [aura.material,aura.halo.material]){
   const {vertexSource,fragmentSource}=material.shaderPath;
   assert.deepEqual(problems(vertexSource),[],material.name+' vertex');assert.deepEqual(problems(fragmentSource),[],material.name+' fragment');
   assert.match(vertexSource,/precision highp float/);assert.match(fragmentSource,/precision highp float/);
   if(cave)assert.match(fragmentSource,/caveFogHidesInk/);else assert.doesNotMatch(fragmentSource,/caveFog/);
  }
  aura.dispose();
 }
 assert.ok(STARFALL_AURA_SHADERS.vertexSource.includes('#include<bonesVertex>'),'bones are supported');
 assert.deepEqual(problems('uniform vec4 patch; void main(){gl_Position=transpose(mat4(1.))*patch;}'),['patch','transpose()'],'the checker itself');
 scene.dispose();engine.dispose();
});

test('the programs are prepared when bound, so the first charge compiles nothing',async()=>{
 const f=fixture();
 await f.aura.bind(f.root);
 const prepared=inspectPreparedEffects(f.engine);assert.ok(prepared.liveEffects>=2,'shell and halo programs are held ready');
 for(const shell of f.aura.shells)for(const sub of shell.subMeshes)assert.equal(f.aura.material.isReadyForSubMesh(shell,sub,false),true);
 for(const sub of f.aura.halo.subMeshes)assert.equal(f.aura.halo.material.isReadyForSubMesh(f.aura.halo,sub,false),true);
 await f.scene.whenReadyAsync();f.scene.render();
 const compiled=Object.keys(f.engine._compiledEffects).length;
 f.aura.update(cast({chargeProgress:.4}));f.advance(150);f.scene.render();f.scene.render();
 assert.equal(Object.keys(f.engine._compiledEffects).length,compiled,'no new program at the first charge');
 f.aura.dispose();f.scene.dispose();f.engine.dispose();
});

test('boot: rank 0 creates nothing; a learned Starfall prepares the aura on the player and follows the cast',async()=>{
 const {document}=parseHTML('<html><body><main id="app"></main></body></html>');
 const engine=new NullEngine(),scene=new Scene(engine);new FreeCamera('camera',new Vector3(0,1.5,-4),scene);
 const parts=warrior(scene);
 const memory=()=>{const map=new Map();return {get length(){return map.size;},key:i=>[...map.keys()][i]??null,getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)};};
 const api={root:document.getElementById('app'),save:createSaveSession({local:memory(),session:memory(),edition:'moonforest-0.3',now:()=>1000}),world:{scene,mapId:'great-plains',camera:{alpha:1,beta:1,radius:5},terrain:{heightAt:()=>0}},
  battle:{encounters:[],combat:{hp:1,maxHp:1}},input:{setSuspended(){}},getPlayer:()=>parts.root,getController:()=>({}),getState:()=>({ready:false}),projectFeet:()=>null,wait:()=>Promise.resolve()};
 let shell;try{shell=setupV03(api);}catch(error){assert.fail('setupV03 fixture: '+error.message);}
 const before=scene.meshes.length,beforeMaterials=scene.materials.length;
 shell.prepareGreatAttack(0);
 assert.equal(scene.meshes.length,before);assert.equal(scene.materials.length,beforeMaterials);
 shell.prepareGreatAttack(2);
 const shells=scene.meshes.filter(m=>m.name.startsWith(AURA_NAME_PREFIX));
 assert.equal(shells.length,2);assert.ok(scene.getMeshByName(AURA_HALO_NAME));
 shell.prepareGreatAttack(2);assert.equal(scene.meshes.filter(m=>m.name.startsWith(AURA_NAME_PREFIX)).length,2,'no duplicate on the per-frame call');
 shell.greatAttackFrame(cast({level:2,chargeProgress:.5}),null);
 assert.ok(shells.every(m=>m.isEnabled(false)));
 shell.resetGreatAttackFx();assert.ok(shells.every(m=>!m.isEnabled(false)));
 shell.prepareGreatAttack(0);
 assert.equal(scene.meshes.filter(m=>m.name.startsWith(AURA_NAME_PREFIX)||m.name===AURA_HALO_NAME).length,0,'unlearning releases the aura');
 shell.dispose?.();scene.dispose();engine.dispose();
});
