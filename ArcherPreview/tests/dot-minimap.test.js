import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DotMinimap,MINIMAP_MAPS,MINIMAP_SIZE,minimapPoint,minimapHeading} from '../src/dot-minimap.js';
import {mapPortals} from '../src/map-route.js';

function canvas(){const calls={draws:0},ctx={fillRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},arc(){},fill(){},getImageData:()=>({data:new Uint8ClampedArray(MINIMAP_SIZE**2*4)}),putImageData(){},drawImage(){calls.draws++;}};return {width:96,height:96,getContext:()=>ctx,calls};}
function fixture(){const target=canvas(),label={},element={hidden:true,querySelector:s=>s==='canvas'?target:label},document={createElement:()=>canvas()},map=new DotMinimap(element,{document});return {map,target,label,element};}
test('all authored portals remain within the dot map; heading and coordinates share north-up convention',()=>{
 for(const [id,spec]of Object.entries(MINIMAP_MAPS)){for(const portal of mapPortals(id)){const p=minimapPoint(spec.rect,portal.x,portal.z);assert.ok(p.x>=3&&p.x<93&&p.y>=3&&p.y<93,`${id} ${JSON.stringify(p)}`);}const center=minimapPoint(spec.rect,spec.rect[0]+spec.rect[2]/2,spec.rect[1]+spec.rect[3]/2);assert.deepEqual(center,{x:48,y:48});assert.ok(minimapHeading(spec.rect,0).y<0);assert.ok(minimapHeading(spec.rect,Math.PI/2).x>0);}
});
test('maps build once, update at most 10Hz only when marker changes, and allocate no 3D resources',async()=>{
 const f=fixture(),navigation={free:()=>true},actor={position:{x:0,z:0},rotation:{y:0}};
 for(const id of Object.keys(MINIMAP_MAPS)){await f.map.setWorld({mapId:id,navigation});assert.equal(f.element.hidden,false);assert.equal(f.label.textContent,MINIMAP_MAPS[id].label);f.map.update(actor,0);}
 assert.equal(f.map.cache.size,3);const count=f.target.calls.draws;for(let i=0;i<300;i++)f.map.update(actor,i/30);assert.equal(f.target.calls.draws,count,'stationary marker does not redraw');
 for(let i=0;i<300;i++){actor.position.x=Math.sin(i)*10;f.map.update(actor,10+i/30);}assert.ok(f.target.calls.draws-count<=100);
 await f.map.setWorld({mapId:'village',navigation:{free:()=>assert.fail('cached map must not resample navigation')}});assert.equal(f.map.cache.size,3);f.map.dispose();assert.equal(f.map.cache.size,0);assert.equal(f.element.hidden,true);
});
test('late minimap work cannot appear in another map or after disposal',async()=>{
 const f=fixture(),navigation={free:()=>true};const old=f.map.setWorld({mapId:'witch-cave',navigation});const next=f.map.setWorld({mapId:'monster-forest',navigation});await Promise.all([old,next]);assert.equal(f.map.mapId,'monster-forest');assert.equal(f.label.textContent,'마물의 숲');assert.equal(f.map.cache.has('witch-cave'),false);
 const pending=f.map.setWorld({mapId:'village',navigation});f.map.dispose();await pending;assert.equal(f.element.hidden,true);assert.equal(f.map.cache.size,0);
});
test('small portrait HUD reserves the health-bar band and map never intercepts gestures',()=>{
 const css=readFileSync(new URL('../src/dot-minimap.css',import.meta.url),'utf8'),html=readFileSync(new URL('../index.html',import.meta.url),'utf8');assert.match(css,/pointer-events:none/);assert.match(css,/image-rendering:pixelated/);assert.match(css,/orientation:portrait[\s\S]+136px/);assert.match(html,/id="dot-minimap"[\s\S]+width="96" height="96"/);
});
