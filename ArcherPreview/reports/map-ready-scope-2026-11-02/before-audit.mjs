import {mkdirSync,writeFileSync} from 'node:fs';
import {NullEngine,Scene,MeshBuilder,StandardMaterial,TransformNode,FreeCamera,Vector3} from '@babylonjs/core';
import {MovingSky} from '../../src/sky.js';
import {waitForSceneReady} from '../../src/scene-ready.js';
const dir=new URL('./',import.meta.url);mkdirSync(dir,{recursive:true});
const engine=new NullEngine(),scene=new Scene(engine),camera=new FreeCamera('camera',new Vector3(0,1,6),scene);camera.setTarget(Vector3.Zero());
const box=MeshBuilder.CreateBox('visible-player',{},scene);box.material=new StandardMaterial('visible-ready',scene);await box.material.forceCompilationAsync(box);
const initialReady=scene.isReady(),retired=MeshBuilder.CreateBox('retained-hidden-boss',{},scene),parent=new TransformNode('retired-parent',scene);retired.parent=parent;parent.setEnabled(false);retired.material=new StandardMaterial('hidden-pending',scene);let hiddenChecks=0;retired.material.isReadyForSubMesh=()=>{hiddenChecks++;return false;};
let time=0,error;try{await waitForSceneReady(scene,{now:()=>time,wait:async()=>{time+=1000;}});}catch(e){error=e.message;}
parent.dispose();engine._compiledEffects.ghost={isReady:()=>false,getCompilationError:()=> 'old-unused-error',allFallbacksProcessed:()=>true};let globalError;try{await waitForSceneReady(scene);}catch(e){globalError=e.message;}delete engine._compiledEffects.ghost;
const sky=new MovingSky(scene),fetch=globalThis.fetch;globalThis.fetch=()=>new Promise(()=>{});let skySettled=false;const pending=sky.load(new URL('https://scope-audit.test/sky.json')).then(()=>skySettled=true);await new Promise(resolve=>setTimeout(resolve,20));globalThis.fetch=fetch;
const report={scope:'Actual Babylon9.31 Scene/Mesh readiness and actual MovingSky.load. Controlled hidden material readiness and never-answer fetch, no browser/GPU timing.',initialReady,disabledBossStillChecked:hiddenChecks,globalSceneGateTimeoutMs:time,hiddenGateError:error,unrelatedGlobalShaderError:globalError,skySettledAfter20ms:skySettled,skyMemoizesSamePending:sky.loadPromise===sky.load(new URL('https://scope-audit.test/sky.json')),reason:'Sky has no logical deadline, so a Promise with no resolution/rejection also never reaches fallback; Scene.isReady checks disabled meshes and all engine effects.'};
writeFileSync(new URL('before.json',dir),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));void pending;scene.dispose();engine.dispose();
