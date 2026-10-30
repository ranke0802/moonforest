import test from 'node:test';
import assert from 'node:assert/strict';
import {NullEngine,Scene,MeshBuilder,PBRMaterial,FreeCamera,Vector3,Color3} from '@babylonjs/core';
import {WebGL2ShaderProcessor} from '@babylonjs/core/Engines/WebGL/webGL2ShaderProcessors.js';
import {applyElenaStyle} from '../src/elena-style.js';
import {applyHitFlash,canInlineHitFlash} from '../src/hit-feedback.js';
import {attachCharacterOutlines} from '../src/character-outlines.js';

function fixture(t){
  const engine=new NullEngine(),scene=new Scene(engine);engine._webGLVersion=2;engine._getShaderProcessor=()=>new WebGL2ShaderProcessor();engine.disableUniformBuffers=true;
  new FreeCamera('camera',new Vector3(0,0,-8),scene);
  scene.fogMode=Scene.FOGMODE_LINEAR;scene.fogStart=1;scene.fogEnd=15;scene.fogColor=new Color3(.2,.1,.3);scene.imageProcessingConfiguration.exposure=1.15;scene.imageProcessingConfiguration.contrast=1.08;
  const material=new PBRMaterial('painted',scene);material.unlit=true;
  const a=MeshBuilder.CreateBox('a',{},scene),b=MeshBuilder.CreateBox('b',{},scene);a.position.x=-1;b.position.x=1;
  for(const mesh of [a,b]){mesh.material=material;mesh.alwaysSelectAsActiveMesh=true;}
  const asset={meshes:[a,b]};applyElenaStyle(asset);attachCharacterOutlines(asset,'elena');
  t.after(()=>{scene.dispose();engine.dispose();});return {engine,scene,material,a,b,asset};
}

test('opaque Elena uses the exact final white alpha-combine RGB after fog/image processing',async t=>{
  const {scene,material,a,b,asset}=fixture(t),plugin=material.pluginManager.getPlugin('ElenaPaint');
  const fragment=plugin.getCustomCode('fragment').CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR;
  assert.match(fragment,/mix\(finalColor\.rgb, vec3\(1\.0\), elenaHitFlash\)/);assert.doesNotMatch(fragment,/finalColor\.a\s*=/);
  // Output-stage alpha-combine: white * flash + destination * (1 - flash).
  // Destination already contains fog and image processing, exactly as this hook does.
  let maximumError=0;
  for(const rgb of [[0,0,0],[1,1,1],[.2,.07,.85],[.4,.42,.46],[.95,.3,.1]])for(const flash of [0,.09,.18,.36,.72])for(const channel of rgb){
    const old=flash+channel*(1-flash),combined=channel+(1-channel)*flash;maximumError=Math.max(maximumError,Math.abs(old-combined));
  }
  assert.ok(maximumError<3e-16);
  applyHitFlash([a],.22,.22);applyHitFlash([b],.11,.22);assert.equal(a.renderOverlay,false);assert.equal(b.renderOverlay,false);
  assert.equal(a.overlayAlpha,.72);assert.equal(b.overlayAlpha,.36);assert.equal(canInlineHitFlash(a),true);
  for(const mesh of asset.meshes)await mesh.material.forceCompilationAsync(mesh);
  let bound;const bindings=[],update=material._uniformBuffer.updateFloat.bind(material._uniformBuffer);
  material._uniformBuffer.updateFloat=(name,value,...rest)=>{if(name==='elenaHitFlash')bound=value;return update(name,value,...rest);};
  material.onBindObservable.add(mesh=>bindings.push([mesh.name,bound]));
  const renderer=scene.getOutlineRenderer(),render=renderer.render.bind(renderer);let overlayCalls=0;
  renderer.render=(...args)=>{if(args[2])overlayCalls++;return render(...args);};
  scene.render();
  assert.deepEqual(bindings.filter(([name])=>name==='a'||name==='b'),[['a',.72],['b',.36]]);
  assert.equal(overlayCalls,0,'opaque flash never schedules the extra overlay pass');
  const effect=a.subMeshes[0].effect,code=effect.fragmentSourceCode;
  assert.ok(code.lastIndexOf('finalColor.rgb = mix')>code.lastIndexOf('finalColor=applyImageProcessing'));
  assert.match(code,/1\.35 \* elenaBand/);assert.match(code,/elenaHitFlash/);
  applyHitFlash([a],0);applyHitFlash([b],0);scene.render();assert.strictEqual(a.subMeshes[0].effect,effect,'flash weight changes never change shader variants');
  assert.equal(a.renderOverlay,false);assert.equal(a.overlayAlpha,0);assert.equal(overlayCalls,0);
});

test('transparent/fading Elena and non-Elena meshes retain their original overlay path',t=>{
  const {scene,material,a,b}=fixture(t),list=[a];
  applyHitFlash(list,.22,.22);assert.equal(a.renderOverlay,false);
  a.visibility=.6;applyHitFlash(list,.22,.22);assert.equal(a.renderOverlay,true,'same flash time still respects a new death fade');assert.equal(canInlineHitFlash(a),false);
  a.visibility=1;material.alpha=.5;applyHitFlash(list,.22,.22);assert.equal(a.renderOverlay,true);
  material.alpha=1;applyHitFlash(list,.22,.22);assert.equal(a.renderOverlay,false);
  material.transparencyMode=PBRMaterial.PBRMATERIAL_ALPHATEST;applyHitFlash(list,.22,.22);assert.equal(a.renderOverlay,true,'preserve separate alpha-test silhouette semantics');
  material.transparencyMode=PBRMaterial.PBRMATERIAL_OPAQUE;
  const bear=MeshBuilder.CreateBox('bear',{},scene);bear.material=material;applyHitFlash([bear],.22,.22);assert.equal(bear.renderOverlay,true);assert.equal(bear.overlayAlpha,.72);
  const plugin=material.pluginManager.getPlugin('ElenaPaint'),uniforms={};
  plugin.hardBindForSubMesh({updateFloat:(name,value)=>uniforms[name]=value},scene,scene.getEngine(),bear.subMeshes[0]);assert.equal(uniforms.elenaHitFlash,0,'a shared material does not mark unrelated meshes as Elena');
  b.visibility=.5;applyHitFlash([b],.11,.22);plugin.hardBindForSubMesh({updateFloat:(name,value)=>uniforms[name]=value},scene,scene.getEngine(),b.subMeshes[0]);assert.equal(uniforms.elenaHitFlash,0,'fallback never applies the flash twice');
});
