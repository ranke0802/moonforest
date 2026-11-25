import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FreeCamera,Matrix,NullEngine,Scene,TransformNode,Vector3} from '@babylonjs/core';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {readMapContainer} from '../src/map-container.js';
import {configurePlayerSize} from '../src/player-dimensions.js';
import {CharacterAnimator} from '../src/animation.js';
import {createLandingCape} from '../src/v03/riding-landing-cape.js';

test('the shipped cloth hem trails the dismount, lifts at knee compression and settles while the shoulders stay anchored and the cloth never stretches',async t=>{
  const url=new URL('../public/assets/warrior-v3-mobile4k.json',import.meta.url),config=JSON.parse(readFileSync(url));
  const {gltf,files}=await readRuntimeGltf(new URL(config.model,url));
  delete gltf.extensionsRequired;delete gltf.extensionsUsed;delete gltf.images;delete gltf.materials;delete gltf.textures;
  for(const mesh of gltf.meshes)for(const prim of mesh.primitives)delete prim.material;
  for(const b of gltf.buffers)b.uri='data:application/octet-stream;base64,'+files.get(b.uri).data.toString('base64');
  const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;
  new FreeCamera('view',new Vector3(0,1.6,-3),scene);
  const asset=await readMapContainer(scene,gltf,'file:///',{skipMaterials:true});asset.addAllToScene();
  const actor=new TransformNode('warrior',scene);for(const n of [...asset.meshes,...asset.transformNodes])if(!n.parent)n.parent=actor;
  configurePlayerSize(actor,config,{warrior:true});
  const animator=new CharacterAnimator(asset.animationGroups,config.animations);
  t.after(()=>{animator.dispose();asset.dispose();scene.dispose();engine.dispose();});
  const nodes=new Map(actor.getDescendants().map(n=>[n.name,n])),cape=createLandingCape(nodes);
  assert.ok(cape);assert.equal(createLandingCape(new Map()),null);
  const grid=[...nodes.values()].filter(n=>/^DEF-Cloth\./.test(n.name)).sort((a,b)=>a.name.localeCompare(b.name));
  assert.equal(grid.length,45);
  const mesh=scene.getMeshByName('Warrior_Cape_primitive0'),skin=mesh.skeleton;
  const jointRows=skin.bones.reduce((rows,b)=>{rows[b.getIndex()]=Number(/^DEF-Cloth\.(\d+)\./.exec(b.name)?.[1]??-1);return rows;},[]);
  const ids=mesh.getVerticesData('matricesIndices'),weights=mesh.getVerticesData('matricesWeights'),hem=[],shoulders=[];
  for(let i=0;i<mesh.getTotalVertices();i++){
    let lower=0,top=0,moving=0;
    for(let j=4*i;j<4*i+4;j++){
      const row=jointRows[ids[j]];if(row===8)lower+=weights[j];if(row===0)top+=weights[j];if(row>0)moving+=weights[j];
    }
    if(lower>.72)hem.push(i);if(top>.02&&moving<.001)shoulders.push(i);
  }
  assert.ok(hem.length>100&&shoulders.length>3,`weighted hem ${hem.length}, shoulders ${shoulders.length}`);
  const indices=[...hem,...shoulders],point=Vector3.Zero(),into=new Matrix();
  function skinPoints(){
    skin.prepare(true);
    const verts=mesh.getPositionData(true),world=mesh.computeWorldMatrix(true);
    return indices.map(i=>{
      Vector3.FromArrayToRef(verts,i*3,point);
      return Vector3.TransformCoordinates(Vector3.TransformCoordinates(point,world),into);
    });
  }
  for(const yaw of [0,1.04]){
    actor.rotation.y=yaw;actor.computeWorldMatrix(true);
    Matrix.RotationYToRef(-yaw,into);
    animator.transition('idle',{clipTime:.42,loop:true});animator.update(1/60);scene.render();
    const base=skinPoints(),original=grid.map(n=>n.position),rest=original.map(p=>p.clone()),phases=[];
    const observers=scene.onBeforeAnimationsObservable.observers.filter(o=>!o._willBeUnregistered).length;
    for(const progress of [.47,.32,.21,.16,.13,.08,.037,.015,0]){
      cape.apply(progress);
      const points=skinPoints(),diff=Vector3.Zero();
      for(let i=0;i<hem.length;i++)diff.addInPlace(points[i].subtract(base[i]));
      diff.scaleInPlace(1/hem.length);phases.push(diff);
      for(let i=hem.length;i<points.length;i++)assert.ok(Vector3.Distance(points[i],base[i])<.0007);
      for(let i=5;i<grid.length;i++){
        const span=Vector3.Distance(grid[i].position,grid[i-5].position)/Vector3.Distance(rest[i],rest[i-5]);
        assert.ok(span>=.9279&&span<=1.00001);
      }
    }
    const [start,early,contact,compression,peak,release,rebound,last,end]=phases;
    t.diagnostic(`yaw ${yaw}: hem at compression ${peak.asArray().map(x=>(x*100).toFixed(1)).join(', ')} cm (left/up/front), rebound ${(rebound.length()*100).toFixed(1)} cm`);
    assert.ok(start.length()<1e-6&&end.length()<1e-6);
    assert.ok(early.length()<contact.length()&&contact.length()<Math.max(compression.length(),peak.length()));
    assert.ok(peak.z<-.065&&peak.z>-.16&&peak.y>.018&&peak.y<.08&&peak.x<-.012);
    assert.ok(release.length()<peak.length()*.25&&rebound.z>0&&rebound.length()<peak.length()*.25&&last.length()<rebound.length());
    assert.ok(grid.every((n,i)=>n.position===original[i]));
    cape.apply(.13);const once=skinPoints();cape.apply(.13);
    assert.ok(skinPoints().every((p,i)=>Vector3.Distance(p,once[i])<1e-6));
    scene.onBeforeAnimationsObservable.notifyObservers(scene);assert.ok(grid.every((n,i)=>n.position===original[i]));
    cape.reset();assert.equal(scene.onBeforeAnimationsObservable.observers.filter(o=>!o._willBeUnregistered).length,observers);
  }
});
