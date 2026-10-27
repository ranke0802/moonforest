import test from 'node:test';
import assert from 'node:assert/strict';
import {warriorWebPolicy} from '../scripts/warrior-web-policy.js';
test('V6 keeps approved skin and matching outlines intact, reducing only the rigid shield',()=>{
  const meshes=[{name:'Warrior_Body_Mesh'},{name:'Warrior_Body_Mesh.001'},{name:'Mesh_0.002'}];
  const g={meshes,nodes:[{name:'Warrior_Body_Outline',mesh:1},{name:'Bunnyguard_Shield',mesh:2}],accessors:[{count:180000}]};
  assert.equal(warriorWebPolicy(meshes[0],{indices:0},g),null);
  assert.equal(warriorWebPolicy(meshes[1],{indices:0},g),null);
  assert.equal(warriorWebPolicy(meshes[2],{indices:0},g).ratio,.15);
});
