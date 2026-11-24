import assert from 'node:assert/strict';
import {setImmediate as settle} from 'node:timers/promises';
import test from 'node:test';
import {parseHTML} from 'linkedom';
import {CHAPTER_POINTS} from '../src/chapter-quest-points.js';
import {createTownTreasure} from '../src/v03/town-treasure.js';

test('failed field chests retry nearby, serialize loads, and ignore late results from an earlier visit',async()=>{
 const {document}=parseHTML('<main></main>');
 const world={mapId:'village',v03:{playing:true},scene:{isDisposed:false}};
 const point=CHAPTER_POINTS.find(row=>row.treasure&&row.map===world.mapId);
 let position=point,updates=0;
 const loads=[];
 const props={
  stats:{modelFailures:0},release(){},dispose(){},animate(){},
  load(rows){return new Promise((resolve,reject)=>loads.push({rows,resolve,reject}));},
  update(){updates++;},
 };
 const view=createTownTreasure({root:document.querySelector('main'),world,props,
  economy:{state:{opened:[],drops:[]}},player:()=>position,canInteract:()=>false});
 try{
  view.tick(.1);view.tick(10);assert.equal(loads.length,1);
  loads[0].resolve(false);await settle();
  view.tick(7.9);assert.equal(loads.length,1);
  position={x:900,z:900};view.tick(1);assert.equal(loads.length,1);
  position=point;view.tick(1);assert.equal(loads.length,2);
  view.clear();view.tick(.1);assert.equal(loads.length,3);
  loads[1].resolve(true);await settle();view.tick(1);assert.equal(updates,0);
  loads[2].resolve(true);await settle();view.tick(.3);assert.equal(updates,1);
  props.stats.modelFailures++;view.tick(.3);assert.equal(updates,1);
  view.tick(8.1);assert.equal(loads.length,4);
 }finally{view.dispose();}
});
