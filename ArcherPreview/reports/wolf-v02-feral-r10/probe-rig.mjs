import {Vector3} from '@babylonjs/core';
import {wolfHuntFixture,stepWolfHunt} from '../../tests/helpers/wolf-hunt-fixture.js';
import {WOLF_CLIPS} from '../../src/wolf-spec.js';
const f=await wolfHuntFixture();
try{
 await f.battle.summon(f.player,1,'wolf');const e=f.battle.encounters[0];e.actor.position.setAll(0);e.actor.rotation.y=0;
 for(const [clip,time] of [[WOLF_CLIPS.walk,0],[WOLF_CLIPS.run,0],[WOLF_CLIPS.watch,0],[WOLF_CLIPS.watch,1],[WOLF_CLIPS.watch,10]]){
  e.brain.start(clip,'idle');e.brain.time=time;e.animator.transition(clip,{clipTime:time,actionId:e.brain.serial,blendDuration:0});e.animator.update(0);e.alignPose();
  console.log(JSON.stringify({clip,time,positions:Object.fromEntries(['root','neck','head','jaw','fore.L.paw','fore.R.paw','hind.L.paw','hind.R.paw'].map(name=>[name,(e.nodes[name]??e.animator.root).getAbsolutePosition().asArray()])),headAxes:[Vector3.Right(),Vector3.Up(),Vector3.Forward()].map(v=>Vector3.TransformNormal(v,e.nodes.head.getWorldMatrix()).normalize().asArray())}));
 }
}finally{await f.dispose();}
