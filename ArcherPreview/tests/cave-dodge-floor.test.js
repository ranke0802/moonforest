import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NullEngine,Scene,TransformNode,Vector3} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/index.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {CharacterAnimator} from '../src/animation.js';
import {orderPoseNodes,refreshPoseMatrices} from '../src/pose-matrices.js';
import {caveForegroundCutaway,caveTerrainCutaway,CAVE_VIEW_GLSL} from '../src/witch-cave-visibility.js';

test('actual player roll cannot cut a black hole in flat ground or a walkable ramp',async t=>{
 const base=new URL('../public/assets/',import.meta.url),config=JSON.parse(readFileSync(new URL('warrior-v3.json',base))),source=await readRuntimeGltf(new URL(config.model,base)),gltf=structuredClone(source.gltf);
 for(const key of ['extensionsUsed','extensionsRequired'])gltf[key]=(gltf[key]??[]).filter(x=>x!=='EXT_meshopt_compression');
 for(const b of gltf.buffers)if(b.uri)b.uri='data:application/octet-stream;base64,'+source.files.get(b.uri).data.toString('base64');
 const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;scene.useConstantAnimationDeltaTime=true;
 const loader=new GLTFFileLoader();loader.skipMaterials=true;
 const asset=await loader.loadAssetContainerAsync(scene,{json:gltf},'');asset.addAllToScene();for(const g of asset.animationGroups)g.stop();
 t.after(()=>{loader.dispose();scene.dispose();engine.dispose();});
 const actor=new TransformNode('player',scene);actor.scaling.setAll(config.scale);for(const n of [...asset.meshes,...asset.transformNodes])if(!n.parent)n.parent=actor;
 const animator=new CharacterAnimator(asset.animationGroups,config.animations),nodes=orderPoseNodes([...asset.meshes,...asset.transformNodes]),head=asset.transformNodes.find(n=>n.name==='mixamorig:Head');
 assert.ok(head);let lowHead=Infinity,previouslyCut=0,probes=0;
 for(let frame=0;frame<=75;frame++){
  animator.transition('dodge',{clipTime:frame/30,actionId:1,blendDuration:.001});animator.update(1/30);scene._animate(0);refreshPoseMatrices(nodes);
  const focus=head.getAbsolutePosition();lowHead=Math.min(lowHead,focus.y);
  for(let turn=0;turn<12;turn++){
   const angle=turn*Math.PI/6,eye=focus.add(new Vector3(Math.cos(angle)*8,3,Math.sin(angle)*8));
   for(const along of [.85,.9,.95,.97]){
    const point=Vector3.Lerp(eye,focus,along);point.y=0;
    if(caveForegroundCutaway(point,eye,focus))previouslyCut++;
    for(const normal of [new Vector3(0,1,0),new Vector3(.6,.8,0),new Vector3(.8,.6,0)]){
     assert.equal(caveTerrainCutaway(point,normal,eye,focus),false,`floor remains during roll ${frame}, turn ${turn}`);probes++;
    }
   }
  }
 }
 assert.ok(lowHead<.3,'test reaches actual low roll pose');assert.ok(previouslyCut>0,'unrestricted foreground rule would cut the floor');assert.equal(probes,10944);
 const surface=readFileSync(new URL('../src/witch-cave-surfaces.js',import.meta.url),'utf8');
 assert.match(surface,/if\(caveMoodActive>\.5 && caveTerrainCutaway\(vPositionW,vNormalW,caveEye,caveFocus\)\)discard/,'production ground uses the protected rule');
 assert.match(CAVE_VIEW_GLSL,/abs\(normalize\(normal\)\.y\)<\.45&&caveForegroundCutaway/);
 t.diagnostic(JSON.stringify({poses:76,probes,previouslyCut,minimumHeadY:lowHead}));
});
