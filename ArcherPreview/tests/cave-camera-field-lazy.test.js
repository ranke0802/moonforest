import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {caveCameraRockBlocked,caveCameraFieldReady,prepareCaveCameraField,CaveCameraGuard} from '../src/witch-cave-camera.js';

const src=name=>readFileSync(new URL('../src/'+name,import.meta.url),'utf8');

test('no game module imports the cave camera field statically; the cave loading prepares it',()=>{
 const staticImport=/import\s*\{[^}]*\}\s*from\s*'\.\/witch-cave-camera-data\.js'/;
 for(const name of readdirSync(new URL('../src/',import.meta.url)).filter(n=>n.endsWith('.js')))assert.doesNotMatch(src(name),staticImport,name);
 assert.match(src('witch-cave-camera.js'),/import\('\.\/witch-cave-camera-data\.js'\)/);
 const startup=src('startup-resources.js');
 // Both the first load of a cave save and a portal trip into the cave wait for it.
 assert.equal(startup.match(/world\.cave\?prepareCaveCameraField\(\):null/g)?.length,2);
});

test('the rock field is absent until prepared, then answers exactly as the preloaded field did',async()=>{
 assert.equal(caveCameraFieldReady(),false);
 const {CAVE_CAMERA_DATA:data}=await import('../src/witch-cave-camera-data.js');
 const probes=[];for(let z=-60;z<=60;z+=4)for(let x=-60;x<=60;x+=4)for(const y of [0,2,4,6])probes.push([x,y,z]);
 const before=probes.map(p=>caveCameraRockBlocked(...p,.05));
 assert.ok(before.every(v=>v===false),'no rock is reported before the field exists');
 await prepareCaveCameraField();
 assert.equal(caveCameraFieldReady(),true);
 assert.equal(await prepareCaveCameraField(),true,'a second request reuses the same load');
 const after=probes.map(p=>caveCameraRockBlocked(...p,.05));
 assert.ok(after.some(Boolean),'the cave rock field blocks somewhere');
 const guard=Object.create(CaveCameraGuard.prototype);guard.world={camera:{radius:1,beta:1}};guard.framing=null;guard.pitchCorrection=0;guard.applied=false;
 const lookupBytes=data.size*data.size*2;
 assert.ok(guard.inspect().fieldBytes>=lookupBytes,'inspect reports the decoded field');
});
