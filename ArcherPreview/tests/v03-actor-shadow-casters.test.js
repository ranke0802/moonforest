import test from 'node:test';
import assert from 'node:assert/strict';
import {castsPlayerShadow} from '../src/v03/actor-shadow-casters.js';

const part=(name,vertices,material='skin',metadata={})=>({name,metadata,material:{name:material},getTotalVertices:()=>vertices});

test('the warrior keeps its body, cape, hair, face and equipment shadows and drops shells and small parts',()=>{
 // Vertex counts and names of the shipped warrior-v3 meshes (deployed build, 2026-11-23).
 const keep=[part('Warrior_Body_primitive0',17089),part('Warrior_Cape_primitive0',7863),part('Warrior_Hair',16555),part('Warrior_Face',1229),part('Bunnyguard_Shield',6914),part('Golden_Oathblade',6855),part('Shield_Rivet_0_-0.007 + 7',1760)];
 const drop=[part('Warrior_Body_Outline',17124,'V6_Outline_Black'),part('Warrior_Ear.L_Outline + 4',41237,'Outline_Clean_Anime'),part('Warrior_Body_primitive1',60),part('Warrior_Body_primitive2',82),
  part('Warrior_Cape_primitive1',23),part('Warrior_Cape_primitive2',29),part('Warrior_Neck',395),part('Warrior_Ear.L + 1',134),part('Shield_Forearm_Strap',480),part('Shield_MountPad_0 + 4',120)];
 assert.deepEqual(keep.filter(castsPlayerShadow).length,7);
 assert.deepEqual(drop.filter(castsPlayerShadow).map(m=>m.name),[]);
 assert.equal(castsPlayerShadow(part('Golden_Oathblade / silhouette',6855,'outline',{moonforestOutline:true})),false);
 assert.equal(castsPlayerShadow(part('empty',0)),false);
});
