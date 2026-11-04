import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {Observable,Vector3,NullEngine,Scene,ArcRotateCamera} from '@babylonjs/core';
import {acquireGameToolLease} from '../src/game-tool-lease.js';

function fixture(){
 const {document}=parseHTML('<html><body><main id="app"><canvas></canvas></main></body></html>'),root=document.getElementById('app'),engine={onContextLostObservable:new Observable()},keyboard={name:'keyboard'},calls={attach:0,detach:0,add:0,reset:0,reconcile:0};
 const camera={alpha:1,beta:1.2,radius:9,fov:.7,target:new Vector3(1,2,3),getTarget(){return this.target;},setTarget(value){this.target=value.clone();},inputs:{attached:{keyboard},remove(){},add(){calls.add++;}},attachControl(){calls.attach++;},detachControl(){calls.detach++;}};
 const scene={onDisposeObservable:new Observable(),getEngine:()=>engine,isDisposed:false},world={scene,camera,mapId:'village'},state={ready:true,loading:false,dead:false,hidden:false,settings:false,failed:false};
 const input={suspended:false,setSuspended(value){this.suspended=value;}};
 const audio={suspended:false,environment:'village',combatMode:null,bossTheme:null,musicWanted:false,voices:new Set(),beds:{desired:{music:'village',ambience:'ambience_village'},request(channel,key){this.desired[channel]=key;}},stopAll(){this.environment=null;this.beds.desired={music:null,ambience:null};},setSuspended(value){this.suspended=value;},play(){return true;}};
 const capabilities={world,root,canvas:root.querySelector('canvas'),input,audio,getState:()=>state,setReady:value=>{state.ready=value;},resetInput:()=>calls.reset++,reconcile:()=>calls.reconcile++};
 return {world,state,input,audio,capabilities,engine,camera,calls,root};
}
test('tool ownership uses one loop, pauses clocks, blocks input and restores exact camera/HUD/audio intent idempotently',()=>{
 const f=fixture();let elapsed=0,releases=0;const lease=acquireGameToolLease(f.capabilities,{owner:'editor',freeCamera:true,hideHud:true,onFrame:dt=>elapsed+=dt,onRelease:()=>releases++});
 assert.equal(f.state.ready,false);assert.equal(f.input.suspended,true);assert.equal(f.root.dataset.toolHudOwner,'editor');assert.equal(f.calls.attach,1);
 assert.throws(()=>acquireGameToolLease(f.capabilities),/다른/);
 lease.update(.05);lease.setPaused(true);lease.update(.1);lease.setPaused(false);lease.update(.05);assert.equal(elapsed,.1);
 f.camera.alpha=4;f.camera.fov=1;lease.release();lease.release();assert.equal(releases,1);assert.equal(f.camera.alpha,1);assert.equal(f.camera.fov,.7);assert.equal(f.state.ready,true);assert.equal(f.input.suspended,false);assert.equal(f.audio.environment,'village');assert.equal(f.audio.beds.desired.music,'village');assert.equal(f.root.dataset.toolHudOwner,undefined);assert.equal(f.calls.detach,1);assert.equal(f.calls.add,2,'one owned camera movement input and the restored prior keyboard input');
});
test('late prior-map release never restores old camera, audio or playable state into a new map',()=>{
 const f=fixture();let cancelled;const lease=acquireGameToolLease(f.capabilities,{onCancel:reason=>cancelled=reason});
 f.world.mapId='witch-cave';f.camera.alpha=6;lease.update(.01);assert.equal(cancelled,'map-change');assert.equal(f.camera.alpha,6);assert.equal(f.state.ready,false);assert.equal(f.audio.environment,null);assert.equal(lease.active,false);
 f.state.ready=true;const next=acquireGameToolLease(f.capabilities);lease.release();assert.equal(f.world.toolLease,next);next.release();
});
test('context loss cancels once and cleans observers without reviving gameplay; errors during acquisition recover',()=>{
 const f=fixture();let cancelled=0;const lease=acquireGameToolLease(f.capabilities,{onCancel:()=>cancelled++});f.engine.onContextLostObservable.notifyObservers();f.engine.onContextLostObservable.notifyObservers();assert.equal(cancelled,1);assert.equal(lease.active,false);assert.equal(f.state.ready,false);assert.equal(f.world.toolRecovery.recover(),true);assert.equal(f.state.ready,true);
 const g=fixture();g.camera.attachControl=()=>{throw Error('attach failed');};assert.throws(()=>acquireGameToolLease(g.capabilities,{freeCamera:true}),/attach failed/);assert.equal(g.world.toolLease,null);assert.equal(g.state.ready,true);assert.equal(g.input.suspended,false);
});

test('a game camera with cleared inputs borrows real pointer/wheel controls and removes them across map invalidation',t=>{
 const f=fixture(),engine=new NullEngine(),scene=new Scene(engine),camera=new ArcRotateCamera('game-camera',1,1.2,9,Vector3.Zero(),scene);camera.inputs.clear();t.after(()=>engine.dispose());
 f.world.scene=scene;f.world.camera=camera;const lease=acquireGameToolLease(f.capabilities,{freeCamera:true});assert.ok(camera.inputs.attached.pointers);assert.ok(camera.inputs.attached.mousewheel);assert.equal(camera.inputs.attached.keyboard,undefined);
 f.world.toolGeneration=1;lease.cancel('map-change',{restore:false});assert.deepEqual(Object.keys(camera.inputs.attached),[]);assert.equal(f.input.suspended,false);
});
