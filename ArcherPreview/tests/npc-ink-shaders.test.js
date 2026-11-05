import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {NPC_INK_OFFSETS,NPC_INK_DEPTH_EPSILON,buildNpcInkFragment,npcInkViewDistance,npcInkDepthOccluded,npcInkEdgeAt,evaluateNpcInk} from '../src/npc-ink-shaders.js';

const close=(actual,expected,tolerance=1e-12)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} != ${expected}`);
const nearFar=[.1,100],depthAt=z=>(nearFar[1]-nearFar[0]*nearFar[1]/z)/(nearFar[1]-nearFar[0]);
const encoded=n=>n.map(value=>value*.5+.5),unit=n=>{const length=Math.hypot(...n);return n.map(value=>value/length);};
const sample=({z=1,n=[0,0,1],alpha=.5+1/128,sceneZ=z}={})=>({depth:depthAt(z),sceneDepth:depthAt(sceneZ),rgb:encoded(n),alpha});
const originalStep=(a,b,x)=>{const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t);};
// Independent transcription of the inert source's edgeAt arithmetic, retained
// here as the numerical oracle. No supplied JavaScript is imported or executed.
function originalEdge({offset:off,normal:n,neighborNormal:nn,z,neighborZ,pixelWorldFactor,scale}){
  const dz=neighborZ-z;
  const slope=(Math.abs(n[0]*off[0])+Math.abs(n[1]*off[1]))/Math.max(.22,Math.abs(n[2]));
  const threshold=Math.max(.0008*scale,z*pixelWorldFactor*1.4)+z*pixelWorldFactor*slope*1.8;
  const depthLine=originalStep(threshold,threshold*2.4,dz);
  const normalLine=originalStep(.16,.40,1-(n[0]*nn[0]+n[1]*nn[1]+n[2]*nn[2]));
  return Math.max(depthLine,normalLine*.78);
}

test('the inert supplied InteriorInk source fixes the8-neighbor numerical contract',()=>{
  const report=JSON.parse(readFileSync(new URL('../reports/moonforest-0.1-authoring-repair-2026-11-05/verification-blacksmith-package.json',import.meta.url),'utf8')),source=report.styleSources['shared/interior-ink.js'];
  assert.equal(createHash('sha256').update(source.text).digest('hex'),'53146d57b15ff0b61744cd1883f5f942ee8f21196c5b3eedfcddeac0c3951e10');
  for(const expression of ['max(.22,abs(n.z))','max(.0008*scale,z*pixelWorldFactor*1.4)+z*pixelWorldFactor*slope*1.8','smoothstep(threshold,threshold*2.4,dz)','smoothstep(.16,.40,1.-dot(n,nn))','max(depthLine,normalLine*.78)','if(e<.035)discard','clamp(e*strength,0.,.9)'])assert.ok(source.text.includes(expression),expression);
  const sourceOffsets=[...source.text.matchAll(/edgeAt\(vec2\(([-.\d]+),([-.\d]+)\),n,z\)/g)].map(match=>match.slice(1).map(Number));
  assert.deepEqual(sourceOffsets,NPC_INK_OFFSETS);assert.ok(Object.isFrozen(NPC_INK_OFFSETS)&&NPC_INK_OFFSETS.every(Object.isFrozen));
});

test('generated GLSL uses native postprocess inputs, fixed WebGL1 profile loop and no color conversion',()=>{
  const shader=buildNpcInkFragment();assert.match(shader,/varying vec2 vUV/);assert.match(shader,/sampler2D textureSampler,tNormal,tDepth,tSceneDepth/);assert.match(shader,/uniform vec2 npcProfiles\[64\]/);assert.match(shader,/for\(int i=1;i<64;i\+\+\)/);assert.match(shader,/floor\(\(alpha-\.5\)\*128\.\+\.5\)/);assert.match(shader,/vec2\(1\.85,\.25\)/);
  assert.equal((shader.match(/e=max\(e,edgeAt/g)??[]).length,8);assert.equal((shader.match(/depthOccluded\(depth,texture2D\(tSceneDepth/g)??[]).length,2);assert.match(shader,/mix\(base.rgb,ink,alpha\),base.a/);assert.doesNotMatch(shader,/colorspace|gamma|pow\(|discard|#include/);
  assert.match(buildNpcInkFragment({maxProfiles:8}),/for\(int i=1;i<8;i\+\+\)/);for(const maxProfiles of [0,1,65,2.5,NaN])assert.throws(()=>buildNpcInkFragment({maxProfiles}),RangeError);
});

test('hardware perspective depth and reverse depth reconstruct near, far and intermediate distances',()=>{
  for(const z of [.1,.11,.5,1,1.85,15,99,100]){const depth=depthAt(z);close(npcInkViewDistance(depth,nearFar),z,1e-9);close(npcInkViewDistance(1-depth,nearFar,true),z,1e-9);}
  close(npcInkViewDistance(0,nearFar),.1);close(npcInkViewDistance(1,nearFar),100,1e-9);
});

test('edge numerical goldens match the supplied math for all8 offsets, slopes, scales and signed breaks',()=>{
  const normals=[[0,0,1],[.6,0,.8],unit([.2,.8,.01])],neighbors=[[0,0,1],[.6,0,.8],[Math.sqrt(1-.72**2),0,.72]];let probes=0;
  for(const offset of NPC_INK_OFFSETS)for(const normal of normals)for(const neighborNormal of neighbors)for(const z of [.2,1,20])for(const scale of [.185,1.85,18.5])for(const dz of [-.01,0,.0007,.004,.05]){const point={offset,normal,neighborNormal,z,neighborZ:z+dz,pixelWorldFactor:.001,scale};close(npcInkEdgeAt(point),originalEdge(point));probes++;}
  assert.equal(probes,3240);
  const point={offset:[1,0],normal:[0,0,1],neighborNormal:[0,0,1],z:1,pixelWorldFactor:.001,scale:1.85};
  close(npcInkEdgeAt({...point,neighborZ:1+.00148}),0);close(npcInkEdgeAt({...point,neighborZ:1+.00148*1.7}),.5);close(npcInkEdgeAt({...point,neighborZ:1+.00148*2.4}),1);
  close(npcInkEdgeAt({...point,neighborZ:1,neighborNormal:[Math.sqrt(1-.72**2),0,.72]}),.39);
  close(npcInkEdgeAt({...point,neighborZ:.9}),0);
});

test('center and neighbor occlusion controls suppress hidden NPC ink while preserving equal/front depth',()=>{
  assert.equal(NPC_INK_DEPTH_EPSILON,1e-6);
  for(const reverse of [false,true]){const raw=value=>reverse?1-value:value;assert.equal(npcInkDepthOccluded(raw(.5),raw(.5),reverse),false);assert.equal(npcInkDepthOccluded(raw(.4),raw(.5),reverse),false);assert.equal(npcInkDepthOccluded(raw(.5000005),raw(.5),reverse),false);assert.equal(npcInkDepthOccluded(raw(.500002),raw(.5),reverse),true);}
  const base=[.8,.6,.4,.73],center=sample(),neighbors=NPC_INK_OFFSETS.map(()=>sample({n:[1,0,0]})),options={base,center,neighbors,nearFar,pixelWorldFactor:.001};
  const visible=evaluateNpcInk(options);close(visible.edge,.78);close(visible.alpha,.195);close(visible.color[0],.8*(1-.195)+.052*.195);assert.equal(visible.color[3],base[3]);
  assert.deepEqual(evaluateNpcInk({...options,center:sample({sceneZ:.8})}).color,base);
  assert.deepEqual(evaluateNpcInk({...options,neighbors:neighbors.map(other=>({...other,sceneDepth:depthAt(.8)}))}).color,base);
  assert.deepEqual(evaluateNpcInk({...options,center:{...center,alpha:.49}}).color,base);
  assert.deepEqual(evaluateNpcInk({...options,neighbors:neighbors.map(other=>({...other,alpha:0}))}).color,base);
  const reverseSample=value=>({...value,depth:1-value.depth,sceneDepth:1-value.sceneDepth});assert.deepEqual(evaluateNpcInk({...options,center:reverseSample(center),neighbors:neighbors.map(reverseSample),reverseDepth:true}),visible);
});

test('per-NPC height and strength, weak-edge cutoff and alpha cap preserve linear scene compositing',()=>{
  const base=[.8,.6,.4,1],center=sample({alpha:.5+63/128}),neighbors=NPC_INK_OFFSETS.map(()=>sample({z:1.003})),profiles=[];profiles[63]=[18.5,.25];const options={base,center,neighbors,profiles,nearFar,pixelWorldFactor:.001};
  assert.deepEqual(evaluateNpcInk(options).color,base,'large profile height raises the same original depth threshold');profiles[63]=[.185,.25];assert.ok(evaluateNpcInk(options).alpha>0);
  const normalNeighbors=NPC_INK_OFFSETS.map(()=>sample({n:[1,0,0]}));profiles[63]=[1.85,2];const capped=evaluateNpcInk({...options,neighbors:normalNeighbors});assert.equal(capped.profileIndex,63);assert.equal(capped.alpha,.9);close(capped.color[0],.8*.1+.052*.9);
  profiles[63]=[1.85,0];assert.deepEqual(evaluateNpcInk({...options,neighbors:normalNeighbors}).color,base);
  const dot=.81,subtle=NPC_INK_OFFSETS.map(()=>sample({n:[Math.sqrt(1-dot*dot),0,dot]}));profiles[63]=[1.85,.25];const weak=evaluateNpcInk({...options,neighbors:subtle});assert.ok(weak.edge<.035);assert.equal(weak.alpha,0);assert.deepEqual(weak.color,base);
});
