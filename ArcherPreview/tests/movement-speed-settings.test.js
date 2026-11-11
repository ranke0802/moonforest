import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {WarriorV2Controller} from '../src/warrior-v2.js';
import {setupMovementSpeedSettings,normalizeMovementSpeed,MOVEMENT_SPEED_KEY} from '../src/movement-speed-settings.js';

test('movement options preserve default movement and adjust sprint independently of combat',()=>{
 const c=new WarriorV2Controller({durations:{idle:2,run:1,slash:1,attack:1,judgment:2,shieldPush:1,dodge:2},speeds:{run:4},staminaEnabled:false});
 assert.equal(c.update(.1,{x:1}).speed,4);c.setSprintHeld(true);assert.ok(Math.abs(c.update(.1,{x:1}).speed-7.2)<1e-9);
 c.setMovementSpeed({walk:1.25,sprint:2});c.setSprintHeld(false);assert.equal(c.update(.1,{x:1}).speed,5);c.setSprintHeld(true);assert.equal(c.update(.1,{x:1}).speed,8);
 assert.equal(c.playbackRate('slash'),1.8);assert.deepEqual(normalizeMovementSpeed({walk:99,sprint:NaN}),{walk:2,sprint:1.8});
});
test('movement preferences save, restore and reset',()=>{
 const {document,window}=parseHTML('<main></main>'),values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)},host=document.querySelector('main'),settings=setupMovementSpeedSettings({host,storage});
 const walk=host.querySelector('[data-move=walk]');walk.value='1.3';walk.dispatchEvent(new window.Event('input',{bubbles:true}));assert.equal(JSON.parse(values.get(MOVEMENT_SPEED_KEY)).walk,1.3);
 settings.dispose();const restored=setupMovementSpeedSettings({host,storage});assert.equal(restored.value.walk,1.3);host.querySelector('[data-move-reset]').dispatchEvent(new window.Event('click'));assert.deepEqual(restored.value,{walk:1,sprint:1.8});restored.dispose();
});
