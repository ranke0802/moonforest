import {mapPortals} from './map-route.js';
import {VILLAGE_GROUND_ROUTES,sampleGroundCurve} from './village-ground-layout.js';
import {FOREST_ROUTES,FOREST_CLEARINGS} from './monster-forest-layout.js';
import {PLAINS_ROUTES,PLAINS_CLEARINGS,PLAINS_RADIUS} from './great-plains-layout.js';
import {CAVE_ROUTES,CAVE_ROOMS,caveSurface} from './witch-cave-layout.js';

export const MINIMAP_SIZE=96;
export const MINIMAP_MAPS=Object.freeze({
 village:{label:'마을',rect:[-52,-44,104,128],fill:'#314433',road:'#a49570'},
 'great-plains':{label:'대평원',rect:[-110,-110,220,220],fill:'#62663c',road:'#c3ab7d'},
 'monster-forest':{label:'마물의 숲',rect:[-66,-66,132,132],halfTurn:true,fill:'#263830',road:'#8d8763'},
 'witch-cave':{label:'마녀의 동굴',rect:[-64,-56,128,120],halfTurn:true,fill:'#141722',road:'#857969'},
});
// Forest/cave entrances lie on +Z, opposite the village's outgoing path.
// The game renders a right-handed world: facing +Z, screen-right is -X.
// Use that same handedness for scenery, collision samples, portals and actor.
export function minimapPoint(rect,x,z,size=MINIMAP_SIZE,halfTurn=false){const u=(x-rect[0])/rect[2],v=1-(z-rect[1])/rect[3];return {x:(halfTurn?u:1-u)*size,y:(halfTurn?1-v:v)*size};}
export function minimapWorldPoint(rect,x,y,size=MINIMAP_SIZE,halfTurn=false){return {x:rect[0]+(halfTurn?x/size:1-x/size)*rect[2],z:rect[1]+(halfTurn?y/size:1-y/size)*rect[3]};}
export function minimapHeading(rect,yaw,halfTurn=false){const sign=halfTurn?-1:1;return {x:-sign*Math.sin(yaw)/rect[2],y:-sign*Math.cos(yaw)/rect[3]};}
async function bakeMap(canvas,mapId,navigation,current=()=>true){
 const spec=MINIMAP_MAPS[mapId],ctx=canvas.getContext('2d');if(!ctx)return;
 const {rect,halfTurn}=spec,size=MINIMAP_SIZE,project=(x,z)=>minimapPoint(rect,x,z,size,halfTurn);canvas.width=canvas.height=size;
 ctx.fillStyle='#0c1018';ctx.fillRect(0,0,size,size);
 // Sample the existing analytic collision field once per map. No scene render,
 // texture download, extra GPU camera or per-frame navigation queries.
 for(let y=0;y<size;y++){if(y%8===0){await new Promise(resolve=>setTimeout(resolve,0));if(!current())return false;}for(let x=0;x<size;x++){
  const {x:wx,z:wz}=minimapWorldPoint(rect,x+.5,y+.5,size,halfTurn);
  const inside=mapId==='witch-cave'?caveSurface(wx,wz).distance<-.2:Math.hypot(wx,wz)<(mapId==='great-plains'?PLAINS_RADIUS:mapId==='village'?48:62);
  if(inside&&navigation.free({x:wx,z:wz},.29,mapId==='great-plains'?PLAINS_RADIUS:80)){ctx.fillStyle=spec.fill;ctx.fillRect(x,y,1,1);}
 }}
 const route=(points,width)=>{
  ctx.strokeStyle=spec.road;ctx.lineWidth=Math.max(1,width*size/rect[2]);ctx.lineJoin='round';ctx.lineCap='round';ctx.beginPath();
  points.forEach(([x,z],i)=>{const p=project(x,z);if(i)ctx.lineTo(p.x,p.y);else ctx.moveTo(p.x,p.y);});ctx.stroke();
 };
 if(mapId==='village')for(const r of VILLAGE_GROUND_ROUTES)route(sampleGroundCurve(r.points,{closed:r.closed,step:1}),r.width);
 if(mapId==='great-plains'){for(const c of PLAINS_CLEARINGS){const p=project(c.x,c.z);ctx.fillStyle=spec.road;ctx.beginPath();ctx.arc(p.x,p.y,c.r*size/rect[2],0,Math.PI*2);ctx.fill();}for(const r of PLAINS_ROUTES)route(r.samples,r.width);}
 if(mapId==='monster-forest'){for(const c of FOREST_CLEARINGS){const p=project(c.x,c.z);ctx.fillStyle=spec.road;ctx.beginPath();ctx.arc(p.x,p.y,c.r*size/rect[2],0,Math.PI*2);ctx.fill();}for(const r of FOREST_ROUTES)route(r.samples,r.width);}
 if(mapId==='witch-cave'){for(const c of CAVE_ROOMS){const p=project(c.x,c.z);ctx.fillStyle=spec.road;ctx.beginPath();ctx.arc(p.x,p.y,c.r*size/rect[2],0,Math.PI*2);ctx.fill();}for(const r of CAVE_ROUTES)route(r,Math.min(...r.map(p=>p[3]))*2);}
 // Trim route edges and rooms against actual collision, including laboratory
 // walls. A decorative path never suggests walking through solid scenery.
 const image=ctx.getImageData(0,0,size,size);
 for(let y=0;y<size;y++){if(y%8===0){await new Promise(resolve=>setTimeout(resolve,0));if(!current())return false;}for(let x=0;x<size;x++){
  const {x:wx,z:wz}=minimapWorldPoint(rect,x+.5,y+.5,size,halfTurn);
  if(!navigation.free({x:wx,z:wz},.29,mapId==='great-plains'?PLAINS_RADIUS:80)){const i=(y*size+x)*4;image.data[i]=12;image.data[i+1]=16;image.data[i+2]=24;}
 }}
 ctx.putImageData(image,0,0);
 for(const portal of mapPortals(mapId)){const p=project(portal.x,portal.z),x=Math.round(p.x),y=Math.round(p.y);ctx.fillStyle='#17101e';ctx.fillRect(x-3,y-3,7,7);ctx.fillStyle='#cf9fff';ctx.fillRect(x-1,y-2,3,5);ctx.fillRect(x-2,y-1,5,3);}
 return true;
}
export class DotMinimap{
 constructor(element,{document=globalThis.document}={}){this.element=element;this.document=document;this.canvas=element?.querySelector('canvas');this.ctx=this.canvas?.getContext?.('2d');this.cache=new Map();this.cacheRevisions=new Map();this.next=0;this.last='';this.generation=0;}
 async setWorld(world){
  const id=world.mapId,generation=++this.generation;this.mapId=id;if(!this.element)return;this.element.hidden=true;if(!this.ctx||!MINIMAP_MAPS[id])return;
  const revision=world.placementRevision??0;
  if(this.cacheRevisions.get(id)!==revision){this.cache.delete(id);this.cacheRevisions.set(id,revision);}
  this.element.querySelector('strong').textContent=MINIMAP_MAPS[id].label;
  if(!this.cache.has(id)){
   // Yield to reveal the actual game first; a map switch invalidates stale work.
   await new Promise(resolve=>setTimeout(resolve,0));if(generation!==this.generation)return;
   const canvas=this.document.createElement('canvas');if(!await bakeMap(canvas,id,world.navigation,()=>generation===this.generation))return;this.cache.set(id,canvas);
  }
  if(generation!==this.generation)return;this.static=this.cache.get(id);this.last='';this.next=0;this.element.hidden=false;
 }
 update(actor,time){
  if(!actor||!this.static||this.element.hidden||time<this.next)return;this.next=time+.1;
  const {rect,halfTurn}=MINIMAP_MAPS[this.mapId],p=minimapPoint(rect,actor.position.x,actor.position.z,MINIMAP_SIZE,halfTurn),heading=minimapHeading(rect,actor.rotation.y,halfTurn),angle=Math.atan2(heading.y,heading.x);
  const x=Math.max(2,Math.min(93,Math.round(p.x))),y=Math.max(2,Math.min(93,Math.round(p.y))),direction=Math.round(angle/(Math.PI/8)),key=`${x},${y},${direction}`;
  if(key===this.last)return;this.last=key;const ctx=this.ctx;ctx.imageSmoothingEnabled=false;ctx.drawImage(this.static,0,0);
  ctx.fillStyle='#07191d';ctx.fillRect(x-3,y-3,7,7);ctx.fillStyle='#84f6df';ctx.fillRect(x-1,y-1,3,3);
  const dx=Math.cos(direction*Math.PI/8),dy=Math.sin(direction*Math.PI/8);ctx.fillStyle='#effffa';ctx.fillRect(Math.round(x+dx*4)-1,Math.round(y+dy*4)-1,2,2);
 }
 hide(){this.generation++;if(this.element)this.element.hidden=true;this.static=null;}
 invalidate(world){this.cache.delete(world.mapId);this.cacheRevisions.delete(world.mapId);return this.setWorld(world);}
 dispose(){this.hide();this.cache.clear();this.cacheRevisions.clear();this.ctx=null;}
}
