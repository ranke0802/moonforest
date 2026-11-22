import test from 'node:test';
import assert from 'node:assert/strict';
import {setupQualityRestoreSettings,readQualityRestore,QUALITY_RESTORE_KEY,QUALITY_RESTORE_DEFAULTS,QUALITY_RESTORE_V03} from '../src/quality-restore-settings.js';

function fakeHost(){
 const nodes=[],doc={createElement:tag=>{const listeners={};return {tag,children:[],textContent:'',append(...items){this.children.push(...items);},addEventListener(type,fn){listeners[type]=fn;},removeEventListener(type,fn){if(listeners[type]===fn)delete listeners[type];},remove(){this.removed=true;},fire(type){listeners[type]?.();}};}};
 return {ownerDocument:doc,append(...items){nodes.push(...items);},nodes};
}
const storageOf=(initial={})=>{const data=new Map(Object.entries(initial));return {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,String(value)),data};};

test('quality restore: all three are on by default, a saved choice is kept, unreadable data falls back',()=>{
 assert.deepEqual(readQualityRestore(storageOf()),QUALITY_RESTORE_DEFAULTS);
 assert.deepEqual(readQualityRestore(storageOf({[QUALITY_RESTORE_KEY]:'{"farOutlines":false,"steadyShadows":"x"}'})),{...QUALITY_RESTORE_DEFAULTS,farOutlines:false});
 assert.deepEqual(readQualityRestore(storageOf({[QUALITY_RESTORE_KEY]:'{'})),QUALITY_RESTORE_DEFAULTS);
 assert.deepEqual(readQualityRestore(null),QUALITY_RESTORE_DEFAULTS);
});

test('quality restore: each checkbox saves and reports the whole state; dispose removes the rows',()=>{
 const host=fakeHost(),storage=storageOf(),seen=[],control=setupQualityRestoreSettings({host,storage,onChange:value=>seen.push(value)});
 const inputs=host.nodes.filter(node=>node.tag==='label').map(label=>label.children[0]);
 assert.equal(inputs.length,3);assert.ok(inputs.every(input=>input.checked===true));
 inputs[2].checked=false;inputs[2].fire('change');
 assert.deepEqual(seen.at(-1),{steadyShadows:true,farActorShadows:true,farOutlines:false});
 assert.deepEqual(JSON.parse(storage.data.get(QUALITY_RESTORE_KEY)),seen.at(-1));
 assert.deepEqual(control.value,seen.at(-1));
 control.dispose();assert.ok(host.nodes.every(node=>node.removed));
 inputs[0].checked=false;inputs[0].fire('change');assert.equal(seen.length,1,'no report after dispose');
});

test('quality restore: 0.3 leaves moving shadows to the frame guard by default and ignores the choice saved under the old key',()=>{
 const storage=storageOf({[QUALITY_RESTORE_KEY]:'{"steadyShadows":true,"farOutlines":false}'});
 assert.deepEqual(readQualityRestore(storage,QUALITY_RESTORE_V03),{steadyShadows:false,farActorShadows:true,farOutlines:true});
 const host=fakeHost(),control=setupQualityRestoreSettings({host,storage,...QUALITY_RESTORE_V03}),inputs=host.nodes.filter(node=>node.tag==='label').map(label=>label.children[0]);
 assert.deepEqual(inputs.map(input=>input.checked),[false,true,true]);
 inputs[0].checked=true;inputs[0].fire('change');
 assert.deepEqual(JSON.parse(storage.data.get(QUALITY_RESTORE_V03.key)),{steadyShadows:true,farActorShadows:true,farOutlines:true});
 assert.equal(storage.data.get(QUALITY_RESTORE_KEY),'{"steadyShadows":true,"farOutlines":false}','the 0.2 choice is left alone');
 control.dispose();
});
