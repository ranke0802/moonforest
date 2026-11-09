import test from 'node:test';
import assert from 'node:assert/strict';
import {NullEngine,Scene,VertexBuffer} from '@babylonjs/core';
import {TerrainHeightField} from '../src/terrain.js';
import {createTerrainGround} from '../src/terrain-mesh.js';
import {buildEditedTerrain,publishEditedTerrain} from '../src/terrain-edit.js';
import {createBasePlacementManifest,createEmptyPlacementDocument,validatePlacementDocument,PlacementHistory} from '../src/placement-document.js';

const patch={id:'building-1',x:0,z:0,halfWidth:3,halfDepth:3,height:2,blend:2};
test('flat footprint updates visible mesh and exact gameplay heights while its edge blends and base remains untouched',()=>{
 const engine=new NullEngine(),scene=new Scene(engine),terrain=new TerrainHeightField({size:20,subdivisions:20,height:(x,z)=>x*.1+z*.05}),base=terrain.heights.slice(),ground=createTerrainGround(scene,terrain),world={ground,terrain};
 const edited=buildEditedTerrain(terrain,base,[patch]);assert.equal(edited.heightAt(0,0),2);assert.equal(edited.heightAt(1.2,-1.4),2);assert.equal(terrain.heightAt(0,0),0);assert.equal(edited.heightAt(8,8),terrain.heightAt(8,8));assert.ok(edited.heightAt(4,0)>terrain.heightAt(4,0));
 publishEditedTerrain(world,edited);const positions=ground.getVerticesData(VertexBuffer.PositionKind);for(let i=0;i<terrain.heights.length;i++)assert.equal(positions[i*3+1],terrain.heights[i]);assert.equal(terrain.heightAt(0,0),2);
 publishEditedTerrain(world,buildEditedTerrain(terrain,base,[]));assert.deepEqual(terrain.heights,base);scene.dispose();engine.dispose();
});
test('terrain patches round-trip with history and reject invalid sizes, duplicates and cave edits',()=>{
 const catalog={entries:[]},base=createBasePlacementManifest('village',{catalog,placements:[]}),doc={...createEmptyPlacementDocument(base),terrainPatches:[patch]},options={catalog,baseManifest:base};
 assert.deepEqual(validatePlacementDocument(JSON.parse(JSON.stringify(doc)),options).terrainPatches,[patch]);const history=new PlacementHistory(doc,options);history.commit({...doc,terrainPatches:[]});assert.equal(history.undo().terrainPatches.length,1);assert.equal(history.redo().terrainPatches.length,0);
 assert.throws(()=>validatePlacementDocument({...doc,terrainPatches:[patch,patch]},options),/duplicate/);assert.throws(()=>validatePlacementDocument({...doc,terrainPatches:[{...patch,halfWidth:31}]},options));
 const cave=createBasePlacementManifest('witch-cave',{catalog,placements:[]});assert.throws(()=>validatePlacementDocument({...createEmptyPlacementDocument(cave),terrainPatches:[patch]},{catalog,baseManifest:cave}),/동굴/);
});
