import test from 'node:test';
import assert from 'node:assert/strict';
import {NullEngine,Scene,FreeCamera,Vector3} from '@babylonjs/core';
import {CaveFogRuntime} from '../src/cave-fog-runtime.js';
import {CAVE_ENTRY} from '../src/witch-cave-layout.js';
import {createGuideWisp} from '../src/v03/guide-wisp.js';

test('guide core follows its dust through cave visibility checks, including a return visit',t=>{
  const engine=new NullEngine(),scene=new Scene(engine);
  // The engine has no canvas in Node. Only the 64px radial-gradient drawing is stubbed.
  engine.createCanvas=(width,height)=>({width,height,getContext:()=>({
    createRadialGradient:()=>({addColorStop(){}}),clearRect(){},fillRect(){},
  })});
  const camera=new FreeCamera('guide-view',new Vector3(-42,4,50),scene);
  const world={scene,camera,cave:true,terrain:{heightAt:()=>0}};
  const guide=createGuideWisp(scene),core=scene.getMeshByName('v03-guide-core'),dust=scene.getParticleSystemById('v03-guide-dust');
  t.after(()=>{guide.dispose();scene.dispose();engine.dispose();});
  // The previous map's transparent pass reads the billboard's world bounds for sorting.
  guide.show(6,2,-3,0,true);
  core.computeWorldMatrix();
  core.getBoundingInfo();
  const {x,z}=CAVE_ENTRY,wall=x+3;
  for(let visit=0;visit<2;visit++){
    const fog=new CaveFogRuntime(world,{isOpaque:(cellX)=>cellX>=wall&&cellX<wall+1});
    try{
      fog.update({x,z},0,{force:true});
      for(const [offset,visible] of [[1,true],[6,false],[-2,true]]){
        scene.incrementRenderId();
        guide.show(x+offset,1.5,z,1,true);
        fog.beforeRender();
        assert.equal(dust.emitter.x,x+offset);
        assert.equal(fog.allowsPoint(dust.emitter),visible);
        assert.equal(core.isVisible,visible,'the fog gate must use the current position of the core');
        fog.restore();
      }
      guide.hide();
      assert.equal(core.isEnabled(),false);
      assert.equal(dust.emitRate,0);
      assert.equal(dust.isStarted(),true,'existing particles can finish fading');
    }finally{fog.dispose();}
  }
});
