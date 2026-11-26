import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Process} from '@babylonjs/core/Engines/Processors/shaderProcessor.js';
import {WebGL2ShaderProcessor} from '@babylonjs/core/Engines/WebGL/webGL2ShaderProcessors.js';
import {FreeCamera, NullEngine, Scene, Vector3} from '@babylonjs/core';
import {createGreatAttackFx} from '../src/v03/great-attack-fx.js';
import {createTownEconomy} from '../src/v03/town-economy.js';
import {GoldLoot} from '../src/gold-loot.js';
import {CaveFogRuntime,fogBoundsFullyVisible} from '../src/cave-fog-runtime.js';

function visualFixture(view,hidden=false,ground=(x,z)=>1+(x-4)*.2+(z-3)*.1,cave=false){
 const engine=new NullEngine(),scene=new Scene(engine);
 new FreeCamera('camera',new Vector3(0,2,-5),scene);
 const elements=[];
 const root={append(node){elements.push(node);},ownerDocument:{defaultView:view,hidden,createElement(){return {style:{},setAttribute(){},append(node){this.child=node;},remove(){this.removed=true;}};}}};
 let time=100,queries=0;
 const fx=createGreatAttackFx({scene,root,cave,now:()=>time,ground:(x,z)=>{queries++;return ground(x,z);},project:()=>({x:22,y:33,visible:true})});
 const light=scene.getMeshByName('v03-starfall'),scars=scene.getMeshByName('v03-starfall-ground');
 return {engine,scene,fx,light,scars,gauge:elements[0],advance(ms){time+=ms;fx.tick();},get queries(){return queries;}};
}
// NullEngine checks mesh lifetimes but does not compile GLSL. The Pages build
// also links the two real materials after Babylon has converted them for WebGL 2.
for(const cave of [false,true])test('the '+(cave?'cave':'outdoor')+' Starfall shaders link as GLSL ES 3.00', {skip:!process.env.MOONFOREST_GLSL_VALIDATOR}, async t=>{
 const {fx,scene,engine,light,scars}=visualFixture(null,false,undefined,cave);
 const dir=mkdtempSync(join(tmpdir(),'moonforest-starfall-'));
 t.after(()=>{fx.dispose();scene.dispose();engine.dispose();rmSync(dir,{recursive:true,force:true});});
 for(const mesh of [light,scars]){
  const shader=mesh.material.shaderPath;
  const files=[];
  for(const [stage,ext] of [['vertexSource','vert'],['fragmentSource','frag']]){
   const options={defines:[],isFragment:ext==='frag',shouldUseHighPrecisionShader:true,processor:new WebGL2ShaderProcessor(),version:'300',platformName:'WEBGL2',includesShadersStore:{},indexParameters:{}};
   const code=await new Promise(resolve=>Process(shader[stage],options,resolve));
   const file=join(dir,mesh.name+'.'+ext);
   writeFileSync(file,'#version 300 es\n#define WEBGL2\n'+code);
   files.push(file);
  }
  const result=spawnSync(process.env.MOONFOREST_GLSL_VALIDATOR,['-l',...files],{encoding:'utf8'});
  assert.ifError(result.error);
  assert.equal(result.status,0,mesh.name+'\n'+result.stdout+result.stderr);
 }
});
test('a visible touch client vibrates once per landing, while unsupported or denied vibration leaves the impact playable',async()=>{
 for(const device of ['touch','desktop','unsupported','denied','hidden']){
  const pulses=[];
  const navigator={};
  if(device!=='unsupported')navigator.vibrate=ms=>{pulses.push(ms);if(device==='denied')throw Error('NotAllowedError');};
  const {fx,scene,engine,scars}=visualFixture({navigator,matchMedia:()=>({matches:device!=='desktop'})},device==='hidden');
  await scene.whenReadyAsync();
  const at=new Vector3(4,1,3),cast={actionId:1,center:at,radius:2,phase:'windup',charging:true,progress:.5};
  fx.update(cast,null,at);
  assert.equal(pulses.length,0);
  cast.phase='impact';cast.charging=false;fx.update(cast,null,at);fx.update(cast,null,at);
  cast.phase='recovery';fx.update(cast,null,at);
  assert.equal(scars.isEnabled(),true);
  cast.phase='impact';cast.actionId=2;fx.update(cast,null,at);
  assert.deepEqual(pulses,device==='touch'||device==='denied'?[55,55]:[]);
  fx.dispose();scene.dispose();engine.dispose();
 }
});
test('Starfall gathers on the blade throughout a full hold and preserves two independently timed impacts',async()=>{
 const fixture=visualFixture(),{engine,scene,fx,light,scars,gauge,advance}=fixture;
 assert.equal(light.isEnabled(),false);assert.equal(scars.isEnabled(),false);
 const actor=new Vector3(4,1,3),blade=[[4,2,3],[4,3,3]],cast={actionId:1,center:actor,radius:2,level:2,phase:'windup',charging:true,progress:.5};
 fx.update(cast,blade,actor);
 assert.equal(gauge.hidden,false);assert.equal(gauge.child.style.transform,'scaleX(0.5)');
 assert.equal(light.material._vectors3.tip.y,3);assert.equal(scars.isEnabled(),false);assert.equal(fixture.queries,0);
 cast.progress=1;fx.update(cast,blade,actor);const fullAt=light.material._floats.clock;
 advance(3000);fx.update(cast,blade,actor);
 assert.equal(light.material._floats.charge,1);assert.equal(light.material._floats.clock,fullAt+3);
 cast.charging=false;cast.phase='release';cast.progress=.4;fx.update(cast,blade,actor);
 assert.equal(gauge.hidden,true);assert.equal(light.isEnabled(),true);assert.equal(fixture.queries,0);
 cast.phase='impact';fx.update(cast,blade,actor);fx.update(cast,blade,actor);
 const one=scars.subMeshes[0].indexCount,anchors=scars.material._vectors4Arrays.anchors,queriesPerImpact=fixture.queries;
 assert.equal(light.isEnabled(),false);assert.equal(scars.isEnabled(),true);assert.ok(queriesPerImpact>0);
 assert.deepEqual([...anchors.subarray(0,3)],[4,1,3]);assert.ok(anchors[3]>cast.radius);
 actor.x=12;fx.update(null,null,actor);advance(1300);
 assert.deepEqual([...anchors.subarray(0,3)],[4,1,3]);assert.equal(scars.isEnabled(),true);
 const next={...cast,phase:'windup',charging:true,actionId:2};
 fx.update(next,blade,actor);assert.equal(light.isEnabled(),true);assert.equal(scars.subMeshes[0].indexCount,one);
 fx.update({...next,phase:'impact',charging:false},blade,actor);assert.equal(scars.subMeshes[0].indexCount,one*2);
 fx.update({...next,phase:'windup',actionId:3},blade,actor);fx.update(null,null,actor);
 advance(3699);assert.equal(scars.subMeshes[0].indexCount,one*2);assert.equal(fixture.queries,queriesPerImpact*2);
 advance(1);assert.equal(scars.subMeshes[0].indexCount,one);assert.deepEqual([...anchors.subarray(0,3)],[12,1,3]);
 advance(1301);assert.equal(scars.isEnabled(),false);assert.equal(fx.active,false);
 await scene.whenReadyAsync();
 fx.dispose();assert.equal(scene.meshes.length,0);assert.equal(scene.geometries.length,0);assert.equal(gauge.removed,true);scene.dispose();engine.dispose();
});
test('the first impact, partial and full batches, expiry and the first hit after a map reset all render',async()=>{
 const {engine,scene,fx,light,scars,gauge,advance}=visualFixture(),actor=new Vector3(4,1,3);
 const geometry=scars.geometry,limit=scars.getTotalIndices();
 await scene.whenReadyAsync();scene.render();
 const cast={actionId:1,center:actor,radius:2,level:2,phase:'impact',charging:false,progress:1};
 for(let i=0;i<20;i++){
  cast.actionId=i;actor.set(i,1+(i-4)*.2,3);fx.update(cast,null,actor);scene.render();
  assert.ok(scars.subMeshes[0].getBoundingInfo().intersectsPoint(actor));
  advance(20);
 }
 assert.equal(scene.meshes.length,2);assert.equal(scene.geometries.length,2);assert.equal(scars.geometry,geometry);
 assert.equal(scars.subMeshes[0].indexCount,limit);assert.equal(scars.material._vectors4Arrays.anchors[0],8);
 advance(4800);scene.render();
 assert.ok(scars.subMeshes[0].indexCount>0&&scars.subMeshes[0].indexCount<limit);
 fx.reset();assert.equal(fx.active,false);assert.equal(scars.subMeshes[0].indexCount,0);
 scene.render();
 actor.set(-58,-3,14);fx.update(cast,null,actor);scene.render();
 assert.equal(scars.isEnabled(),true);assert.equal(scars.subMeshes[0].getBoundingInfo().boundingSphere.centerWorld.x,-58);
 scene.dispose();assert.equal(light.isDisposed(),true);assert.equal(scars.isDisposed(),true);assert.equal(gauge.removed,true);
 fx.dispose();engine.dispose();
});
test('fracture vertices follow a sharp ridge and share the depth-writing cutout pass with their airborne debris',()=>{
 const height=(x,z)=>.73*Math.abs(x-.31*z)+.44*Math.abs(z+.12);
 const {fx,scars,scene,engine}=visualFixture(null,false,height),at=new Vector3(.1,17,.15);
 const cast={actionId:1,phase:'impact',center:at,radius:2};
 fx.update(cast,null,at);
 const {material}=scars,[c,s]=material._vectors4Arrays.groundFrame,r=material._vectors4Arrays.anchors[3];
 const uv=scars.getVerticesData('uv'),xy=scars.getVerticesData('position'),h=scars.getVerticesData('sampleY');
 const travel=scars.getVerticesData('uv2'),color=scars.getVerticesData('color');
 let groundVertices=0;
 let brightOuterLips=0;
 while(uv[groundVertices*2+1]<1){
  const i=groundVertices++,dx=r*xy[3*i],dz=r*xy[3*i+2];
  assert.ok(Math.abs(at.y+h[2*i]-height(at.x+c*dx-s*dz,at.z+s*dx+c*dz))<.00001);
  if(Math.hypot(dx,dz)>cast.radius&&color[4*i]>.95&&color[4*i+1]>.6)brightOuterLips++;
 }
 assert.ok(brightOuterLips>0,'fractures keep a sunlit edge outside a target-sized footprint');
 const plumes=new Set(),jets=new Set();
 for(let i=groundVertices;uv[i*2]===0&&i<uv.length/2;i++){
  const kind=uv[i*2+1];
  if(kind<2)continue;
  const dx=r*travel[2*i],dz=r*travel[2*i+1];
  assert.ok(Math.abs(at.y+h[2*i]-height(at.x+c*dx-s*dz,at.z+s*dx+c*dz))<.00001);
  if(Math.hypot(dx,dz)>cast.radius)(kind>=3?plumes:jets).add(kind);
 }
 assert.ok(plumes.size>0&&jets.size>0,'dust and light erupt beyond the foe at contact');
 assert.ok(groundVertices>100);assert.equal(cast.radius,2);
 assert.equal(material.needAlphaBlendingForMesh(scars),false);assert.equal(material.needAlphaTestingForMesh(scars),true);
 assert.equal(material.disableDepthWrite,false);assert.equal(scars.renderingGroupId,0);
 fx.dispose();scene.dispose();engine.dispose();
});
test('Starfall is optional in old saves, capped at five, and resets with existing skills',()=>{
 const values=new Map(), storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
 const wallet=new GoldLoot({storage});wallet.creditCumulative('seed',100);
 const game=createTownEconomy(wallet);
 assert.equal(game.progression.skills.greatAttack,0);game.gainExperience(100000);
 for(let i=1;i<=5;i++){assert.equal(game.learnSkill('greatAttack'),true);assert.equal(game.progression.skills.greatAttack,i);}
 assert.equal(game.learnSkill('greatAttack'),false);
 const restored=createTownEconomy(new GoldLoot({storage}));
 assert.equal(restored.progression.skills.greatAttack,5);assert.equal(restored.refundSkills(),true);
 assert.equal(restored.progression.skills.greatAttack,0);assert.equal(restored.progression.points,20);
});

test('cave sight submits partially visible Starfall marks and blade light, and hides fully occluded effects',t=>{
 const {fx:outdoors,scene,engine,light:outdoorLight,scars:outdoorScars}=visualFixture();
 for(const mesh of [outdoorLight,outdoorScars])assert.ok(!mesh.material.options.samplers.includes('caveFogMap'));
 assert.ok(!scene.textures.some(texture=>texture.name==='cave-fog-inactive-sampler'));
 outdoors.dispose();
 const camera=scene.activeCamera,terrain={heightAt:()=>0},world={scene,camera,terrain,cave:true};
 const fog=new CaveFogRuntime(world,{isOpaque:x=>x>=0&&x<1});world.caveFog=fog;
 // NullEngine does not upload the mask. The real draw uses the same texture.
 fog.texture.getInternalTexture().isReady=true;
 const root={append(){},ownerDocument:{createElement(){return {style:{},setAttribute(){},append(){},remove(){}};}}};
 const fx=createGreatAttackFx({scene,root,ground:terrain.heightAt});
 const light=scene.getMeshByName('v03-starfall'),scars=scene.getMeshByName('v03-starfall-ground');
 t.after(()=>{fx.dispose();fog.dispose();scene.dispose();engine.dispose();});
 const player=new Vector3(-6,0,30);camera.position.set(-6,5,36);camera.setTarget(player);
 fog.update(player,0,{force:true});
 const visibleAt=new Vector3(-2,0,30),behindWall=new Vector3(14,0,30);
 assert.ok(fog.allowsPoint(visibleAt));assert.ok(!fog.allowsPoint(behindWall));
 const cast={actionId:1,phase:'windup',charging:true,progress:1,center:visibleAt,radius:2.5};
 let draws=0;scars.onAfterRenderObservable.add(()=>draws++);
 fx.update(cast,[[-6,1,30],[-6,2,31]],player);fog.beforeRender();
 assert.equal(light.metadata.caveFogVisible,true);
 assert.ok(light.getBoundingInfo().intersectsPoint(player));assert.ok(!light.getBoundingInfo().intersectsPoint(Vector3.Zero()));
 fog.restore();
 cast.phase='impact';fx.update(cast,null,player);fog.beforeRender();
 const b=scars.getBoundingInfo().boundingBox;
 assert.equal(fogBoundsFullyVisible(fog.fog,b.minimumWorld,b.maximumWorld),false);
 assert.equal(scars.metadata.caveFogVisible,true);fog.restore();
 scene.render();assert.ok(draws>0,'visible part of the crack was submitted');
 for(const mesh of [light,scars]){
  assert.equal(mesh.material._textures.caveFogMap,fog.texture);
  assert.match(mesh.material.shaderPath.fragmentSource,/if\(caveFogHidesInk\(fogPoint\)\)discard/);
 }
 fx.reset();cast.actionId++;cast.center=behindWall;fx.update(cast,null,player);fog.beforeRender();
 assert.equal(scars.isVisible,false);assert.equal(scars.metadata.caveFogVisible,false);fog.restore();
 const before=draws;scene.render();assert.equal(draws,before);
});
