import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {NullEngine,Scene,FreeCamera,TransformNode,Vector3,Animation,AnimationGroup} from '@babylonjs/core';
import {CharacterAnimator} from '../../src/animation.js';
import {sha} from './phase2-verification-fixtures.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),baseline='2c4ed67',source=execFileSync('git',['show',baseline+':ArcherPreview/src/animation.js'],{cwd:root,encoding:'utf8'}),Baseline=new Function(source.replace('export class CharacterAnimator','class CharacterAnimator')+'\nreturn CharacterAnimator;')();
const candidateSourceSha256=sha(readFileSync(new URL('../../src/animation.js',import.meta.url))),cases=[];
function fixture(Type,retain){
 const engine=new NullEngine(),scene=new Scene(engine);scene.useConstantAnimationDeltaTime=true;new FreeCamera('camera',new Vector3(0,1,-4),scene);const target=new TransformNode('authored-channel',scene),names={idle:'Idle',walk:'Walk',attack:'Attack'},groups=[];let starts=0;
 for(const [index,[state,name]]of Object.entries(names).entries()){
  const animation=new Animation(name,'position.y',30,Animation.ANIMATIONTYPE_FLOAT,Animation.ANIMATIONLOOPMODE_CYCLE);animation.setKeys([{frame:0,value:index*10},{frame:60,value:index*10+2}]);const group=new AnimationGroup(name,scene);group.addTargetedAnimation(animation,target);const start=group.start;group.start=function(...args){starts++;return start.apply(this,args);};groups.push(group);
 }
 let animator=new Type(groups,names);animator.retainBindings=retain;
 return {scene,target,groups,get animator(){return animator;},get starts(){return starts;},reset(){if(retain)animator.resetForReuse();else{animator.dispose();animator=new Type(groups,names);}},step(state,time,dt,actionId=state){animator.transition(state,{clipTime:time,actionId,loop:state!=='attack'});animator.update(dt);scene.render();return target.position.y;},dispose(){animator.dispose();scene.dispose();engine.dispose();}};
}
const fixtures=[fixture(Baseline,false),fixture(CharacterAnimator,true)];
try{
 const values=[],sequence=[['idle',.1,.2],['walk',.2,.2],['attack',.3,.2],['walk',.8,.05],['idle',.4,.05],['attack',.5,.2],['idle',.1,.2]];
 for(const [index,args]of sequence.entries()){
  const pair=fixtures.map(f=>f.step(...args));assert.ok(Math.abs(pair[0]-pair[1])<1e-6,'retained blend pose equals immutable baseline at step '+index+': '+pair);
  for(const entry of fixtures[1].animator.active.values())if(entry.weight===0&&entry.target===0)assert.ok(entry.group.animatables.every(animatable=>animatable.weight===0),'inactive native animatables must have zero contribution');
  values.push({step:index,state:args[0],baseline:pair[0],candidate:pair[1]});
 }
 cases.push({name:'retained paused clips preserve exact native crossfade and interrupted-blend pose',passed:true,values});
 const startsBefore=fixtures.map(f=>f.starts),warm=[];
 for(let life=0;life<6;life++){
  for(const f of fixtures)f.reset();
  for(const args of [['idle',.1,.2],['walk',.3,.2],['attack',.7,.2],['idle',.2,.2]]){const pair=fixtures.map(f=>f.step(...args,life));assert.ok(Math.abs(pair[0]-pair[1])<1e-6,'warm pose life '+life+': '+pair);}
  warm.push(fixtures[1].starts-startsBefore[1]);
 }
 assert.equal(fixtures[1].starts,startsBefore[1],'warm reuse creates no new native animation-group bindings');cases.push({name:'six warm lives retain prepared native bindings and exact baseline pose',passed:true,baselineNewGroupStarts:fixtures[0].starts-startsBefore[0],candidateNewGroupStarts:fixtures[1].starts-startsBefore[1],candidateStartsByLife:warm});
}catch(error){cases.push({passed:false,error:error.stack});}
finally{for(const f of fixtures)f.dispose();}
assert.equal(sha(readFileSync(new URL('../../src/animation.js',import.meta.url))),candidateSourceSha256,'animation source frozen during probe');
const report={generatedAt:new Date().toISOString(),baseline,baselineSourceSha256:sha(source),candidateSourceSha256,passed:cases.every(row=>row.passed),cases,scope:'Actual Babylon native animation groups/animatables and transform pose against immutable phase1 source. No pixels/GPU/device claim.'};writeFileSync(new URL('phase2-verification-animation.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(!report.passed)process.exitCode=1;
