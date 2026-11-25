import test from 'node:test';
import assert from 'node:assert/strict';
import {wolfHuntFixture} from './helpers/wolf-hunt-fixture.js';

const parts=['Mouth_Upper_Interior','Mouth_Lower_Interior','Upper_Canine_-1','Upper_Canine_1','Lower_Canine_-1','Lower_Canine_1'];

for(const edition of [null,'moonforest-0.3']){
  test(`packed alpha wolf mouth fits the muzzle once across two summons (${edition??'0.2'})`,async t=>{
    const {battle,container,player,world}=await wolfHuntFixture(t);
    world.edition=edition;
    const source=name=>container.meshes.find(mesh=>mesh.name===name);
    const original=parts.map(name=>source(name).getVerticesData('position',false,true));
    const bodyBuffer=source('AlphaWolf_Body').getVertexBuffer('position');
    const dx=edition ? -.046 : 0, dz=edition ? -.012 : 0;
    assert.equal(await battle.summon(player,2,'wolf'),true);
    assert.equal(battle.encounters.length,2);
    for(const encounter of battle.encounters){
      const find=name=>encounter.asset.meshes.find(mesh=>mesh.name===name);
      assert.equal(find('AlphaWolf_Body').getVertexBuffer('position'),bodyBuffer);
      for(const [k,name] of parts.entries()){
        const mesh=find(name),positions=mesh.getVerticesData('position');
        assert.equal(mesh.geometry,source(name).geometry);
        assert.equal(find(name+' / silhouette').geometry,mesh.geometry);
        for(let i=0;i<positions.length;i+=3){
          assert.ok(Math.abs(positions[i]-original[k][i]-dx)<1e-6);
          assert.equal(positions[i+1],original[k][i+1]);
          assert.ok(Math.abs(positions[i+2]-original[k][i+2]-dz)<1e-6);
        }
      }
    }
  });
}
