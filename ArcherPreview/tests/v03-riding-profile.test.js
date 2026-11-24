import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {NullEngine,Scene,Texture,TransformNode,Vector3} from '@babylonjs/core';
import {GLTFLoader} from '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/KHR_materials_unlit.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/KHR_texture_basisu.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/EXT_texture_webp.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/EXT_meshopt_compression.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {readMapContainer} from '../src/map-container.js';
import {mergePlayerMeshes} from '../src/player-mesh-merge.js';
import {createRiderContact,RIDER_SEAT_VERTICES} from '../src/v03/riding-seat-contact.js';

test('the real painted PC, compressed mobile and RGBA fallback keep the same two supported vertices after the normal player merge',async t=>{
  // NullEngine cannot transcode images. Substitute only the pixel upload,
  // preserving every authored material, primitive, texture slot and identity.
  t.mock.method(GLTFLoader.prototype,'_loadTextureAsync',function(context,texture,assign){
    const image=new Texture(null,this.babylonScene);
    image.name=texture.name??context;
    assign(image);
    return Promise.resolve(image);
  });
  for(const profile of ['warrior-v3','warrior-v3-mobile4k','warrior-v3-mobile2k-rgba','warrior-v3-ios']){
    const cfgUrl=new URL('../public/assets/'+profile+'.json',import.meta.url);
    const conf=JSON.parse(readFileSync(cfgUrl)),rt=await readRuntimeGltf(new URL(conf.model,cfgUrl));
    const g=rt.gltf;
    for(const b of g.buffers)b.uri='data:application/octet-stream;base64,'+rt.files.get(b.uri).data.toString('base64');
    const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;
    try{
      const container=await readMapContainer(scene,g,'file:///');container.addAllToScene();
      const before=container.meshes.find(m=>m.name==='Warrior_Body_primitive0');
      assert.ok(before.material&&before.material.getActiveTextures().length>0,profile);
      const merged=mergePlayerMeshes(container,{keep:['Bunnyguard_Shield','Golden_Oathblade']});
      assert.ok(merged.merged>0,profile+' did not take the production merge');
      const root=new TransformNode('player-world-transform',scene);
      for(const node of new Set([...container.meshes,...container.transformNodes]))if(!node.parent)node.parent=root;
      assert.equal(root.getChildMeshes(false).find(m=>m.name===before.name),before);
      assert.equal(before.getTotalVertices(),17089);
      const fit=createRiderContact(root);
      assert.ok(fit,profile+' fell back to the hip joint');
      const got=new Vector3();fit(got);
      before.computeWorldMatrix(true);const deformed=before.getPositionData(true);
      const y=RIDER_SEAT_VERTICES.reduce((sum,id)=>sum+Vector3.TransformCoordinates(Vector3.FromArray(deformed,id*3),before.getWorldMatrix()).y*.5,0);
      assert.ok(Math.abs(got.y-y)<.0005,profile);
      t.diagnostic(profile+' '+merged.before+' -> '+merged.after+' meshes, '+before.material.name+', '+before.getTotalVertices()+' vertices, surface fit active');
      container.dispose();
    }finally{scene.dispose();engine.dispose();}
  }
});
