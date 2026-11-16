import test from 'node:test';
import assert from 'node:assert/strict';
import {NullEngine,Scene,ArcRotateCamera,MeshBuilder,TransformNode,Vector3,InternalTexture,InternalTextureSource,PostProcess,PBRMaterial} from '@babylonjs/core';
import {registerNpcInteriorInk,inspectNpcInteriorInk,releaseNpcInteriorInkResources} from '../src/npc-interior-ink.js';
import {prepareActorCameraCulling} from '../src/mourning-camera-culling.js';
import {applyNpcLook,NpcToonBands} from '../src/npc-look.js';

function fixture(t){
 const engine=new NullEngine({renderWidth:800,renderHeight:600}),scene=new Scene(engine),camera=new ArcRotateCamera('main',0,.6,10,Vector3.Zero(),scene);scene.activeCamera=camera;scene.updateTransformMatrix(true);
 // NullEngine has no framebuffer pixels or depth attachment support. Supply
 // only its public depth-allocation boundary, retaining real RTT/PP ownership,
 // activation, camera attachment, native draw lists and shader-material binds.
 engine.getCaps().depthTextureExtension=true;engine.getCaps().maxFragmentUniformVectors=128;engine.getCaps().maxMSAASamples=4;
 // Preserve the requested sample metadata at NullEngine's allocation boundary;
 // there is no real multisampled framebuffer or resolve in this CPU fixture.
 const allocateTarget=engine.createRenderTargetTexture.bind(engine);engine.createRenderTargetTexture=(size,options)=>{const result=allocateTarget(size,options);result._samples=options.samples??1;return result;};engine.updateRenderTargetTextureSampleCount=(target,samples)=>(target._samples=samples);
 let depthAllocations=0;const depths=[];engine.createDepthStencilTexture=(size,options)=>{depthAllocations++;const texture=new InternalTexture(engine,InternalTextureSource.DepthStencil,true);texture.width=typeof size==='number'?size:size.width;texture.height=typeof size==='number'?size:size.height;texture.samples=options.samples;texture.isReady=true;depths.push(texture);return texture;};
 const root=new TransformNode('npc-root',scene),body=MeshBuilder.CreateBox('npc-body',{},scene);body.parent=root;body.material=new PBRMaterial('paint',scene);root.setEnabled(false);
 t.after(()=>{scene.dispose();engine.dispose();});return {engine,scene,camera,root,body,depths,depthAllocations:()=>depthAllocations,collect:()=>scene.onBeforeRenderObservable.notifyObservers(scene)};
}
const look={interior:true,interiorStrength:.25,brightness:1.2,outlinePixels:.6};

test('one shared NPC-only pass owns its depth and bypasses composition while retaining one idle target set',t=>{
 const f=fixture(t),wall=MeshBuilder.CreateBox('world-occluder',{},f.scene),existing=new PostProcess('original-color','pass',[],[],1,f.camera),other=MeshBuilder.CreateBox('second-npc',{},f.scene);other.parent=f.root;const before=f.scene.onBeforeRenderObservable.observers.filter(row=>!row._willBeUnregistered).length;
 registerNpcInteriorInk(f.body,{root:f.root,look,height:1.85});registerNpcInteriorInk(other,{root:f.root,look,height:1.85});registerNpcInteriorInk(f.body,{root:f.root,look,height:1.85});assert.equal(inspectNpcInteriorInk(f.scene).registered,2);assert.equal(f.scene.onBeforeRenderObservable.observers.filter(row=>!row._willBeUnregistered).length,before+1);
 f.collect();assert.equal(inspectNpcInteriorInk(f.scene).renderTargets,0);assert.equal(f.depthAllocations(),0,'hidden warm source allocates no passes');f.root.setEnabled(true);f.collect();const post=f.camera._postProcesses.find(Boolean),target=f.scene.textures.find(value=>value.name==='npc-interior-normal-depth');assert.equal(post.name,'npc-interior-ink');assert.equal(f.camera._postProcesses.filter(Boolean).length,2);assert.deepEqual(target.renderList.map(mesh=>mesh.uniqueId),[f.body.uniqueId,other.uniqueId]);assert.equal(target.renderList.includes(wall),false);assert.equal(f.scene.customRenderTargets.includes(target),false,'no extra automatic world pass');assert.equal(inspectNpcInteriorInk(f.scene).worldDepthRenders,0);
 post.activate(f.camera);assert.ok(post.inputTexture.depthStencilTexture);assert.ok(target.depthStencilTexture);assert.notEqual(post.inputTexture.depthStencilTexture,target.depthStencilTexture);assert.equal(post.inputTexture.resolveMSAADepth,true);assert.equal(f.depthAllocations(),2);
 let renders=0;const originalRender=target.render.bind(target);target.render=(...args)=>{renders++;return originalRender(...args);};f.scene.postProcessManager.onBeforeRenderObservable.notifyObservers(f.scene.postProcessManager);assert.equal(renders,1);assert.equal(inspectNpcInteriorInk(f.scene).normalFrames,1);
 f.root.setEnabled(false);f.collect();assert.equal(inspectNpcInteriorInk(f.scene).renderTargets,1);assert.equal(inspectNpcInteriorInk(f.scene).postProcesses,1);assert.equal(inspectNpcInteriorInk(f.scene).attachedPostProcesses,0);assert.equal(inspectNpcInteriorInk(f.scene).idleRetained,true);assert.deepEqual(f.camera._postProcesses.filter(Boolean),[existing]);const hiddenRenders=renders;f.scene.postProcessManager.onBeforeRenderObservable.notifyObservers(f.scene.postProcessManager);assert.equal(renders,hiddenRenders);f.root.setEnabled(true);f.collect();assert.equal(f.camera._postProcesses.find(Boolean),post);assert.equal(inspectNpcInteriorInk(f.scene).renderTargets,1);f.root.dispose();assert.equal(inspectNpcInteriorInk(f.scene).registered,0);assert.deepEqual(f.camera._postProcesses.filter(Boolean),[existing]);assert.equal(f.scene.onBeforeRenderObservable.observers.filter(row=>!row._willBeUnregistered).length,before);
});

test('NPC pass retains independent existing post processes through camera replacement, resize and repeated warm hide/show',t=>{
 const f=fixture(t),original=new PostProcess('original-color','pass',[],[],1,f.camera);registerNpcInteriorInk(f.body,{root:f.root,look,height:1.85});f.root.setEnabled(true);for(let i=0;i<8;i++){f.collect();assert.equal(inspectNpcInteriorInk(f.scene).renderTargets,1);assert.equal(inspectNpcInteriorInk(f.scene).postProcesses,1);f.root.setEnabled(false);f.collect();assert.deepEqual(f.camera._postProcesses.filter(Boolean),[original]);f.root.setEnabled(true);}const second=new ArcRotateCamera('replacement',1,.8,12,Vector3.Zero(),f.scene);f.scene.activeCamera=second;f.collect();assert.deepEqual(f.camera._postProcesses.filter(Boolean),[original]);assert.equal(second._postProcesses.filter(Boolean).length,1);f.engine.getRenderWidth=()=>1024;f.engine.getRenderHeight=()=>768;f.collect();assert.equal(f.scene.textures.find(value=>value.name==='npc-interior-normal-depth').getSize().width,1024);f.body.dispose();assert.equal(second._postProcesses.filter(Boolean).length,0);assert.deepEqual(f.camera._postProcesses.filter(Boolean),[original]);assert.equal(inspectNpcInteriorInk(f.scene).registered,0);
});

test('reentry reuses its own input/depth without growing camera slots or allocating per hidden frame',t=>{
 const f=fixture(t),existing=new PostProcess('original-color','pass',[],[],1,f.camera);existing.samples=4;
 registerNpcInteriorInk(f.body,{root:f.root,look});f.root.setEnabled(true);f.collect();const post=f.camera._postProcesses.find(Boolean),target=f.scene.textures.find(value=>value.name==='npc-interior-normal-depth');post.activate(f.camera);
 const input=post.inputTexture,depth=input.depthStencilTexture,allocations=f.depthAllocations(),slots=f.camera._postProcesses.length;
 let normalRenders=0;const render=target.render.bind(target);target.render=(...args)=>{normalRenders++;return render(...args);};
 for(let i=0;i<12;i++){
  f.root.setEnabled(false);f.collect();assert.deepEqual(f.camera._postProcesses.filter(Boolean),[existing]);existing.activate(f.camera);
  f.root.setEnabled(true);f.collect();post.activate(f.camera);assert.ok(post.inputTexture===input,'same owned input is reused');assert.ok(input.depthStencilTexture===depth,'same depth attachment is reused');assert.equal(post.samples,4);assert.equal(f.camera._postProcesses.length,slots);
  assert.equal(f.scene.textures.find(value=>value.name==='npc-interior-normal-depth'),target);
  f.scene.postProcessManager.onBeforeRenderObservable.notifyObservers(f.scene.postProcessManager);assert.equal(normalRenders,i+1,'normal/depth pass is refreshed on every reentry');
 }
 assert.equal(f.depthAllocations(),allocations);assert.equal(inspectNpcInteriorInk(f.scene).resourceCycles,1);
 f.root.setEnabled(false);f.collect();releaseNpcInteriorInkResources(f.scene);assert.equal(inspectNpcInteriorInk(f.scene).renderTargets,0);assert.equal(inspectNpcInteriorInk(f.scene).postProcesses,0);assert.equal(inspectNpcInteriorInk(f.scene).registered,1);assert.equal(input.texture,null,'owned post input is released at the map boundary');
 f.root.setEnabled(true);f.collect();assert.equal(inspectNpcInteriorInk(f.scene).resourceCycles,2);assert.deepEqual(f.camera._postProcesses.filter(Boolean).map(value=>value.name),['npc-interior-ink','original-color']);
});

test('the SDK sample cap does not cause a new target set every frame',t=>{
 const f=fixture(t);f.engine.getCaps().maxMSAASamples=1;f.engine.getCreationOptions=()=>({antialias:true});registerNpcInteriorInk(f.body,{root:f.root,look});f.root.setEnabled(true);
 for(let i=0;i<8;i++)f.collect();assert.equal(inspectNpcInteriorInk(f.scene).resourceCycles,1);assert.equal(f.camera._postProcesses.find(Boolean).samples,1);
});

test('idle resize/camera disposal release the retained set, and reentry binds fresh full-size depth',t=>{
 const f=fixture(t);registerNpcInteriorInk(f.body,{root:f.root,look});f.root.setEnabled(true);f.collect();const first=f.camera._postProcesses.find(Boolean);first.activate(f.camera);const oldInput=first.inputTexture;
 f.root.setEnabled(false);f.collect();f.engine.getRenderWidth=()=>1024;f.engine.getRenderHeight=()=>768;f.collect();assert.equal(inspectNpcInteriorInk(f.scene).renderTargets,0);assert.equal(oldInput.texture,null);const afterResize=f.depthAllocations();f.collect();assert.equal(f.depthAllocations(),afterResize);
 f.root.setEnabled(true);f.collect();const second=f.camera._postProcesses.find(Boolean),target=f.scene.textures.find(value=>value.name==='npc-interior-normal-depth');second.activate(f.camera);assert.notEqual(second,first);assert.notEqual(second.inputTexture,oldInput);assert.equal(target.getSize().width,1024);assert.equal(target.getSize().height,768);assert.equal(second.inputTexture.depthStencilTexture.width,1024);assert.equal(second.inputTexture.depthStencilTexture.height,768);
 f.root.setEnabled(false);f.collect();f.camera.dispose();assert.equal(inspectNpcInteriorInk(f.scene).renderTargets,0);assert.equal(inspectNpcInteriorInk(f.scene).postProcesses,0);
});

test('camera-proven off-screen actors are absent from ink lists while unsupported meshes fail open',t=>{
 const f=fixture(t),unsupported=MeshBuilder.CreateBox('unregistered-bounds',{},f.scene);unsupported.position.set(10000,0,0);registerNpcInteriorInk(f.body,{root:f.root,look});registerNpcInteriorInk(unsupported,{root:unsupported,look});
 prepareActorCameraCulling({meshes:[f.body]});f.root.setEnabled(true);f.scene.incrementRenderId();f.scene.updateTransformMatrix(true);f.collect();const target=f.scene.textures.find(value=>value.name==='npc-interior-normal-depth');assert.ok(target.renderList.includes(f.body));assert.ok(target.renderList.includes(unsupported));
 f.root.position.set(10000,0,0);f.scene.incrementRenderId();f.scene.updateTransformMatrix(true);f.collect();assert.deepEqual(target.renderList.map(mesh=>mesh.name),[unsupported.name]);assert.equal(f.body.isEnabled(),true);assert.equal(f.body.isVisible,true);
 f.root.position.set(0,0,0);f.scene.incrementRenderId();f.scene.updateTransformMatrix(true);f.collect();assert.ok(target.renderList.includes(f.body));assert.equal(inspectNpcInteriorInk(f.scene).resourceCycles,1);
});

test('a multi-mesh actor uses one dirty-aware root update per collection and never forces a pose refresh',t=>{
 const f=fixture(t),other=MeshBuilder.CreateBox('shared-root-part',{},f.scene);other.parent=f.root;
 registerNpcInteriorInk(f.body,{root:f.root,look});registerNpcInteriorInk(other,{root:f.root,look});f.root.setEnabled(true);
 const compute=f.root.computeWorldMatrix.bind(f.root);let calls=0,forced=0;f.root.computeWorldMatrix=function(force,...args){calls++;forced+=Number(force===true);return compute(force,...args);};
 f.collect();assert.equal(calls,1);assert.equal(forced,0);f.root.scaling.setAll(2);f.collect();assert.equal(calls,2);assert.equal(forced,0);
});

test('NPC toon port keeps supplied world light/bands/brightness and disables the older albedo-derivative crease shader only for NPC bodies',t=>{
 const f=fixture(t),other=MeshBuilder.CreateBox('original-other-character',{},f.scene);other.material=new PBRMaterial('unchanged-other-paint',f.scene);const plugin=new NpcToonBands(f.body.material),shader=plugin.getCustomCode('fragment').CUSTOM_FRAGMENT_BEFORE_FINALCOLORCOMPOSITION;assert.match(shader,/vec3\(-\.35,\.65,\.75\)/);assert.match(shader,/\.78\+\.14\*smoothstep\(-\.10,-\.02,facing\)\+\.12\*smoothstep\(\.48,\.56,facing\)/);assert.doesNotMatch(shader,/fwidth|texture2D|roughness/);const values=[];plugin.hardBindForSubMesh({updateFloat2:(...args)=>values.push(args)},f.scene,f.engine,{getRenderingMesh:()=>other});assert.deepEqual(values.pop(),['npcPaint',0,1]);applyNpcLook({meshes:[f.body]},look,{root:f.root});assert.equal(f.body.metadata.npcCharacterStyle.internal,false);assert.equal(f.body.metadata.npcCharacterStyle.brightness,1);assert.equal(other.metadata?.npcLook,undefined);plugin.hardBindForSubMesh({updateFloat2:(...args)=>values.push(args)},f.scene,f.engine,{getRenderingMesh:()=>f.body});assert.deepEqual(values.pop(),['npcPaint',1,1.2]);
});

test('native NPC postprocess binding matches supplied exact sRGB output encoding and preserves a deferred linear pipeline',t=>{
 const f=fixture(t),configuration=f.scene.imageProcessingConfiguration;assert.equal(configuration.applyByPostProcess,false,'native game-default PBR encodes its color before the first postprocess');assert.equal(f.body.material.imageProcessingConfiguration,configuration);registerNpcInteriorInk(f.body,{root:f.root,look,height:1.85});f.root.setEnabled(true);f.collect();const post=f.camera._postProcesses.find(Boolean);post.activate(f.camera);
 const uniforms=new Map(),effect={setTexture:(name,value)=>uniforms.set(name,value),setFloat2:(name,...value)=>uniforms.set(name,value),setFloat:(name,value)=>uniforms.set(name,value),setColor3:(name,value)=>uniforms.set(name,value.asArray()),setArray2:(name,value)=>uniforms.set(name,Array.from(value))},source=[.052,.040,.054],oetf=value=>value<=.0031308?value*12.92:1.055*Math.pow(value,1/2.4)-.055;
 post.onApplyObservable.notifyObservers(effect);const encoded=uniforms.get('ink'),normalTarget=uniforms.get('tNormal'),normalDepth=uniforms.get('tDepth'),sceneDepth=uniforms.get('tSceneDepth'),profiles=uniforms.get('npcProfiles');for(let i=0;i<3;i++)assert.ok(Math.abs(encoded[i]-oetf(source[i]))<1e-12);assert.deepEqual(encoded,[.2527895373391935,.22091636254849623,.25766782522323645]);
 // Supplied colorspace_fragment encodes the linear ink before alpha blending
 // with display scene color. It must not darken an already encoded input with
 // the unencoded linear constant, or encode the entire base a second time.
 const blend=(base,ink,alpha)=>base*(1-alpha)+ink*alpha;for(let i=0;i<3;i++)assert.ok(Math.abs(blend(.5,encoded[i],.25)-blend(.5,oetf(source[i]),.25))<1e-12);
 configuration.applyByPostProcess=true;post.onApplyObservable.notifyObservers(effect);assert.deepEqual(uniforms.get('ink'),source);assert.equal(uniforms.get('tNormal'),normalTarget);assert.equal(uniforms.get('tDepth'),normalDepth);assert.equal(uniforms.get('tSceneDepth'),sceneDepth);assert.deepEqual(uniforms.get('npcProfiles'),profiles);assert.equal(configuration.applyByPostProcess,true,'binding never rewrites global image processing');
 configuration.applyByPostProcess=false;post.onApplyObservable.notifyObservers(effect);assert.deepEqual(uniforms.get('ink'),encoded);assert.equal(configuration.applyByPostProcess,false);
});
