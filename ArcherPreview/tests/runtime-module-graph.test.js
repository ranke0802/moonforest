import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyRuntimeModuleGraph} from '../scripts/runtime-module-graph.mjs';

const chunk=(fileName,{imports=[],dynamicImports=[],modules={},isEntry=false}={})=>({type:'chunk',fileName,imports,dynamicImports,modules,isEntry});
const entry='assets/index.js',village='/project/src/village-ktx2.js',loader='/project/node_modules/@babylonjs/core/Materials/Textures/Loaders/ktxTextureLoader.js';
const good=()=>[chunk(entry,{isEntry:true,imports:['assets/shared.js'],dynamicImports:['assets/other.js'],modules:{[village]:{}}}),chunk('assets/shared.js',{modules:{[loader]:{}}}),chunk('assets/other.js')];

test('village entry statically reaches the KTX loader and all emitted links resolve',()=>{
  assert.deepEqual(verifyRuntimeModuleGraph(good()),{chunks:3,entriesChecked:1});
});
test('rejects missing static or dynamic internal chunks',()=>{
  for(const field of ['imports','dynamicImports']){
    const graph=good();graph[0][field].push('assets/missing.js');
    assert.throws(()=>verifyRuntimeModuleGraph(graph),/Missing runtime chunk assets\/missing.js/);
  }
});
test('a loader reached only lazily does not satisfy the initial graph',()=>{
  const graph=good();graph[0].imports=[];graph[0].dynamicImports.push('assets/shared.js');
  assert.throws(()=>verifyRuntimeModuleGraph(graph),/KTX loader is not in the initial module graph/);
});

test('development actors and editors remain lazy while the normal game keeps its initial loader',()=>{
 const graph=good();graph[0].modules['/project/src/main.js']={};
 graph[2].modules['/project/src/actor-population.js']={};
 assert.deepEqual(verifyRuntimeModuleGraph(graph),{chunks:3,entriesChecked:1});
 graph[0].imports.push('assets/other.js');
 assert.throws(()=>verifyRuntimeModuleGraph(graph),/Development module entered the initial game graph/);
 for(const file of ['gizmoManager','positionGizmo','rotationGizmo','scaleGizmo','boundingBoxGizmo']){
  const widget=good();widget[0].modules['/project/src/main.js']={};widget[1].modules[`/project/node_modules/@babylonjs/core/Gizmos/${file}.js`]={};
  assert.throws(()=>verifyRuntimeModuleGraph(widget),/Development module entered the initial game graph/);
 }
 for(const file of ['editor-workspace','tool-fine-zoom','cinematic-interaction','cinematic-path-view','cinematic-authoring','cinematic-subtitles','cinematic-audio','cinematic-media','cinematic-editing','cinematic-assets','npc-packages','npc-library','npc-world','npc-look','npc-interior-ink','actor-editor']){
  const leaked=good();leaked[0].modules['/project/src/main.js']={};leaked[1].modules[`/project/src/${file}.js`]={};
  assert.throws(()=>verifyRuntimeModuleGraph(leaked),/Development module entered the initial game graph/);
 }
});
