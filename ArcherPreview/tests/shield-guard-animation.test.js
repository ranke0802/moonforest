import test from 'node:test';
import assert from 'node:assert/strict';
import {Animation,AnimationGroup,FreeCamera,NullEngine,Scene,TransformNode,Vector3} from '@babylonjs/core';
import {CharacterAnimator} from '../src/animation.js';
import {WarriorV2Controller,V2_SHIELD_GUARD_CLIP_TIME} from '../src/warrior-v2.js';

function fixture(){
  const engine=new NullEngine(),scene=new Scene(engine);new FreeCamera('camera',new Vector3(0,2,-5),scene);
  scene.useConstantAnimationDeltaTime=true;
  const target=new TransformNode('shield-pose-time',scene),durations={idle:2,run:1,slash:1.5,attack:3,judgment:4.33,shieldPush:2.37,dodge:2.46};
  const groups=Object.entries(durations).map(([state,duration])=>{
    const animation=new Animation(state,'position.y',60,Animation.ANIMATIONTYPE_FLOAT,Animation.ANIMATIONLOOPMODE_CYCLE);
    animation.setKeys([{frame:0,value:0},{frame:duration*60,value:duration}]);
    const group=new AnimationGroup(state,scene);group.addTargetedAnimation(animation,target);return group;
  });
  const animator=new CharacterAnimator(groups,Object.fromEntries(Object.keys(durations).map(state=>[state,state]))),controller=new WarriorV2Controller({durations});
  const step=dt=>{const result=controller.update(dt);animator.transition(result.state,result);animator.update(dt);scene.render();return result;};
  return {controller,animator,step,dispose(){animator.dispose();scene.dispose();engine.dispose();}};
}

test('Babylon guard holds the same authored pre-push frame and keeps it fixed through release crossfade',()=>{
  const f=fixture();try{
    f.step(.3);f.controller.setShieldHeld(true);
    for(let i=0;i<120;i++)f.step(1/60);
    const held=f.animator.active.get('shieldPush');assert.ok(Math.abs(held.clipTime-V2_SHIELD_GUARD_CLIP_TIME)<1e-8);
    assert.equal(held.freezeOnExit,true);
    f.controller.setShieldHeld(false);
    for(let i=0;i<8;i++){
      assert.equal(f.step(1/60).state,'idle');
      const outgoing=f.animator.active.get('shieldPush');
      if(outgoing)assert.ok(Math.abs(outgoing.clipTime-V2_SHIELD_GUARD_CLIP_TIME)<1e-8,'release must not advance the fading guard into its push');
    }
    for(let i=0;i<20;i++)f.step(1/60);
    assert.equal(f.animator.active.has('shieldPush'),false);
  }finally{f.dispose();}
});

test('Babylon short tap clears hold-only freeze and renders the normal push window',()=>{
  const f=fixture();try{
    f.step(.3);f.controller.setShieldHeld(true);f.step(.1);f.controller.setShieldHeld(false);
    let reached=false;
    for(let i=0;i<80;i++){
      const result=f.step(1/60),entry=f.animator.active.get('shieldPush');
      if(result.state==='shieldPush'){
        assert.equal(entry.freezeOnExit,false);
        assert.ok(Math.abs(entry.clipTime-result.clipTime)<1e-8);
        if(result.clipTime>=1.10&&result.clipTime<=1.15)reached=true;
      }
    }
    assert.equal(reached,true);
  }finally{f.dispose();}
});
