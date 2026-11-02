import test from 'node:test';
import assert from 'node:assert/strict';
import {MAP_RESUME_KEY,MapResumeStore,readMapResume} from '../src/map-resume.js';
import {mapForCharacter} from '../src/map-route.js';
const storage=()=>{const m=new Map();return {getItem:k=>m.get(k),setItem:(k,v)=>m.set(k,v)};};
const fixture=(character='warrior-v5')=>({character,world:{mapId:mapForCharacter(character),terrain:{heightAt:()=>6},navigation:{free:(p,r,limit)=>Math.hypot(p.x,p.z)<limit}},actor:{position:{x:26,z:-23},rotation:{y:1.2}},camera:{alpha:-1.1,beta:1.2,radius:13}});
test('reconnect restores per-map position, heading and camera; portals override resume',()=>{
 const s=storage(),writer=new MapResumeStore(s);
 for(const [i,id]of ['warrior-v3','warrior-v4','warrior-v5'].entries()){const f=fixture(id);f.actor.position.x=10+i;writer.save(f,i*3000);}
 for(const [i,id]of ['warrior-v3','warrior-v4','warrior-v5'].entries()){const f=fixture(id),p=readMapResume(s,id,f.world);assert.equal(p.x,10+i);assert.equal(p.z,-23);assert.equal(p.yaw,1.2);assert.deepEqual(p.camera,f.camera);assert.equal(readMapResume(s,id,f.world,{portalArrival:true}),null);}
 assert.ok(s.getItem(MAP_RESUME_KEY).length<1024);assert.equal(writer.writes,3);
});
test('failed travel, loading, death, unsupported map and blocked pose never overwrite a safe save',()=>{
 const s=storage(),w=new MapResumeStore(s),f=fixture();w.save(f,0);const original=s.getItem(MAP_RESUME_KEY);
 for(const flags of [{ready:false},{alive:false},{character:'archer'}])assert.equal(w.save({...f,...flags},3000,{force:true}),false);
 f.world.navigation.free=()=>false;assert.equal(w.save(f,4000,{force:true}),false);assert.equal(s.getItem(MAP_RESUME_KEY),original);assert.equal(readMapResume(s,f.character,f.world),null);
});
test('changed wall moves resume only to a nearby free point on the same shelf',()=>{
 const s=storage(),w=new MapResumeStore(s),f=fixture();w.save(f,0);f.world.navigation.free=p=>p.x>26.8;
 const p=readMapResume(s,f.character,f.world);assert.ok(p.x>26.8);assert.ok(Math.hypot(p.x-26,p.z+23)<=3);
 f.world.terrain.heightAt=x=>x>26.8?1:6;assert.equal(readMapResume(s,f.character,f.world),null);
});
test('idle frames do not write repeatedly, corrupt/unavailable storage cannot break play',()=>{
 const s=storage(),w=new MapResumeStore(s),f=fixture();for(let i=0;i<1800;i++)w.save(f,i*1000/30);assert.equal(w.writes,1);
 s.setItem(MAP_RESUME_KEY,'{broken');assert.equal(readMapResume(s,f.character,f.world),null);
 const bad={getItem(){throw Error('private');},setItem(){throw Error('quota');}};assert.equal(new MapResumeStore(bad).save(f,0),false);assert.equal(readMapResume(bad,f.character,f.world),null);
});
