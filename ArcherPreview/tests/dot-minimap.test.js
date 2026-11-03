import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NullEngine,Scene,FreeCamera,Vector3,Matrix} from '@babylonjs/core';
import {DotMinimap,MINIMAP_MAPS,MINIMAP_SIZE,minimapPoint,minimapWorldPoint,minimapHeading} from '../src/dot-minimap.js';
import {mapPortals,FOREST_SPAWN,CAVE_SPAWN} from '../src/map-route.js';
import {FOREST_ROUTES,FOREST_CLEARINGS} from '../src/monster-forest-layout.js';
import {CAVE_ROUTES,CAVE_ROOMS} from '../src/witch-cave-layout.js';

function canvas(){const calls={draws:0,fills:[],lines:[],arcs:[]},ctx={fillRect(...args){calls.fills.push({style:this.fillStyle,args});},beginPath(){},moveTo(...args){calls.lines.push(args);},lineTo(...args){calls.lines.push(args);},stroke(){},arc(...args){calls.arcs.push(args);},fill(){},getImageData:()=>({data:new Uint8ClampedArray(MINIMAP_SIZE**2*4)}),putImageData(image){calls.image=image;},drawImage(){calls.draws++;}};return {width:96,height:96,getContext:()=>ctx,calls};}
function fixture(){const target=canvas(),label={},element={hidden:true,querySelector:s=>s==='canvas'?target:label},document={createElement:()=>canvas()},map=new DotMinimap(element,{document});return {map,target,label,element};}
test('portals, cardinal headings and inverse collision raster use the right-handed game projection',()=>{
 for(const [id,{rect,halfTurn}]of Object.entries(MINIMAP_MAPS)){
  const project=(x,z)=>minimapPoint(rect,x,z,MINIMAP_SIZE,halfTurn),origin=project(0,0);
  for(const portal of mapPortals(id)){const p=project(portal.x,portal.z);assert.ok(p.x>=3&&p.x<93&&p.y>=3&&p.y<93,`${id} ${JSON.stringify(p)}`);}
  assert.deepEqual(project(rect[0]+rect[2]/2,rect[1]+rect[3]/2),{x:48,y:48});
  for(const yaw of [0,Math.PI/2,Math.PI,3*Math.PI/2]){
   const tip=project(Math.sin(yaw),Math.cos(yaw)),heading=minimapHeading(rect,yaw,halfTurn);
   assert.ok(Math.abs(tip.x-origin.x-heading.x*MINIMAP_SIZE)<1e-10);
   assert.ok(Math.abs(tip.y-origin.y-heading.y*MINIMAP_SIZE)<1e-10);
  }
  const east=minimapHeading(rect,Math.PI/2,halfTurn),north=minimapHeading(rect,0,halfTurn);
  assert.ok(east.x*north.y-east.y*north.x>0,'projection matches the right-handed world');
  for(const x of [0.5,48.5,95.5])for(const y of [0.5,48.5,95.5]){
   const world=minimapWorldPoint(rect,x,y,MINIMAP_SIZE,halfTurn),p=project(world.x,world.z);
   assert.ok(Math.abs(p.x-x)<1e-10&&Math.abs(p.y-y)<1e-10,'collision raster uses inverse projection');
  }
 }
 assert.ok(minimapHeading(MINIMAP_MAPS.village.rect,0).y<0,'village direction stays unchanged');
});
test('all three minimaps match actual right-handed camera left/right and inward movement',t=>{
 const engine=new NullEngine({renderWidth:800,renderHeight:600}),scene=new Scene(engine);scene.useRightHandedSystem=true;t.after(()=>engine.dispose());
 const camera=new FreeCamera('map-reference',Vector3.Zero(),scene);
 for(const [id,{rect,halfTurn}]of Object.entries(MINIMAP_MAPS)){
  const forward=halfTurn?-1:1;camera.position.set(0,20,-forward*30);camera.setTarget(Vector3.Zero());camera.getViewMatrix(true);scene.updateTransformMatrix(true);
  const screen=p=>Vector3.Project(p,Matrix.Identity(),scene.getTransformMatrix(),camera.viewport.toGlobal(800,600)),center=screen(Vector3.Zero()),origin=minimapPoint(rect,0,0,96,halfTurn);
  for(const point of [new Vector3(-8,0,0),new Vector3(8,0,0),new Vector3(0,0,forward*8)]){
   const actual=screen(point),map=minimapPoint(rect,point.x,point.z,96,halfTurn);
   if(point.x)assert.equal(Math.sign(map.x-origin.x),Math.sign(actual.x-center.x),id+' actual screen horizontal direction');
   else {assert.ok(actual.y<center.y);assert.ok(map.y<origin.y);}
  }
 }
});
test('forest and cave entry points are below the map and travelling inward moves upward',()=>{
 for(const [id,spawn]of [['monster-forest',FOREST_SPAWN],['witch-cave',CAVE_SPAWN]]){
  const {rect,halfTurn}=MINIMAP_MAPS[id],start=minimapPoint(rect,spawn.x,spawn.z,96,halfTurn),inside=minimapPoint(rect,spawn.x,spawn.z-8,96,halfTurn);
  assert.ok(start.y>72,`${id} arrival belongs in bottom quarter`);assert.ok(inside.y<start.y);
  const entry=mapPortals(id)[0],portal=minimapPoint(rect,entry.x,entry.z,96,halfTurn);assert.ok(portal.y>start.y);
 }
});
test('baked paths, rooms, portals, collision mask and live player all share rotated coordinates after repeat travel',async()=>{
 const f=fixture(),navigation={free:p=>p.x<0&&p.z<0};
 for(const id of ['monster-forest','witch-cave','village','witch-cave','monster-forest']){
  await f.map.setWorld({mapId:id,navigation});if(id==='village')continue;
  const {rect,halfTurn}=MINIMAP_MAPS[id],project=(x,z)=>minimapPoint(rect,x,z,96,halfTurn),baked=f.map.cache.get(id).calls;
  const point=id==='monster-forest'?FOREST_ROUTES[0].samples[0]:CAVE_ROUTES[0][0],route=project(point[0],point[1]);
  assert.ok(baked.lines.some(p=>p[0]===route.x&&p[1]===route.y));
  const room=(id==='monster-forest'?FOREST_CLEARINGS:CAVE_ROOMS)[0],center=project(room.x,room.z);
  assert.ok(baked.arcs.some(p=>p[0]===center.x&&p[1]===center.y));
  for(const portal of mapPortals(id)){const p=project(portal.x,portal.z);assert.ok(baked.fills.some(f=>f.style==='#cf9fff'&&f.args[0]===Math.round(p.x)-1&&f.args[1]===Math.round(p.y)-2));}
  for(const [wx,wz,blocked]of [[10,10,true],[-10,-10,false]]){const p=project(wx,wz),offset=(Math.floor(p.y)*96+Math.floor(p.x))*4;assert.equal(baked.image.data[offset],blocked?12:0);}
  const spawn=id==='monster-forest'?FOREST_SPAWN:CAVE_SPAWN,actor={position:{...spawn},rotation:{y:Math.PI}};
  f.map.update(actor,0);const start=project(spawn.x,spawn.z),dot=f.target.calls.fills.findLast(f=>f.style==='#84f6df'),arrow=f.target.calls.fills.findLast(f=>f.style==='#effffa');
  assert.deepEqual(dot.args,[Math.round(start.x)-1,Math.round(start.y)-1,3,3]);assert.ok(arrow.args[1]<dot.args[1]);
  actor.position.z-=8;f.map.update(actor,.2);assert.ok(f.target.calls.fills.findLast(f=>f.style==='#84f6df').args[1]<dot.args[1]);
 }
 f.map.dispose();
});
test('maps build once, update at most 10Hz only when marker changes, and allocate no 3D resources',async()=>{
 const f=fixture(),navigation={free:()=>true},actor={position:{x:0,z:0},rotation:{y:0}};
 for(const id of Object.keys(MINIMAP_MAPS)){await f.map.setWorld({mapId:id,navigation});assert.equal(f.element.hidden,false);assert.equal(f.label.textContent,MINIMAP_MAPS[id].label);f.map.update(actor,0);}
 assert.equal(f.map.cache.size,Object.keys(MINIMAP_MAPS).length);const count=f.target.calls.draws;for(let i=0;i<300;i++)f.map.update(actor,i/30);assert.equal(f.target.calls.draws,count,'stationary marker does not redraw');
 for(let i=0;i<300;i++){actor.position.x=Math.sin(i)*10;f.map.update(actor,10+i/30);}assert.ok(f.target.calls.draws-count<=100);
 await f.map.setWorld({mapId:'village',navigation:{free:()=>assert.fail('cached map must not resample navigation')}});assert.equal(f.map.cache.size,Object.keys(MINIMAP_MAPS).length);f.map.dispose();assert.equal(f.map.cache.size,0);assert.equal(f.element.hidden,true);
});
test('late minimap work cannot appear in another map or after disposal',async()=>{
 const f=fixture(),navigation={free:()=>true};const old=f.map.setWorld({mapId:'witch-cave',navigation});const next=f.map.setWorld({mapId:'monster-forest',navigation});await Promise.all([old,next]);assert.equal(f.map.mapId,'monster-forest');assert.equal(f.label.textContent,'마물의 숲');assert.equal(f.map.cache.has('witch-cave'),false);
 const pending=f.map.setWorld({mapId:'village',navigation});f.map.dispose();await pending;assert.equal(f.element.hidden,true);assert.equal(f.map.cache.size,0);
});
test('small portrait HUD reserves the health-bar band while the passive map leaves its local travel button interactive',()=>{
 const css=readFileSync(new URL('../src/dot-minimap.css',import.meta.url),'utf8'),html=readFileSync(new URL('../index.html',import.meta.url),'utf8');assert.match(css,/pointer-events:none/);assert.match(css,/image-rendering:pixelated/);assert.match(css,/orientation:portrait[\s\S]+136px/);assert.match(html,/id="dot-minimap"[\s\S]+width="96" height="96"/);
});
