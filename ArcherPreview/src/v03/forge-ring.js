// The temper's timing ring (2026-11-27, user review): a ring centred on the blade
// grows and shrinks; striking when it has closed on the centre is the best grade.
// Its colour runs black (far) -> grey -> green -> yellow (centre), so the colour at
// the moment of the strike is the grade: yellow great success, green success,
// grey near miss, black failed. The grade itself comes from the time (forgePulse),
// never from the page layout. Each frame writes at most one transform and one
// colour, both looked up from tables made when the view opens.
import {forgeZones} from './town-items.js';

const SVG='http://www.w3.org/2000/svg',STEPS=256;
export const RING_COLORS=Object.freeze({centre:'#fff3a0',perfect:'#ffd23a',success:'#4fc256',near:'#9b9b9b',failed:'#000000'});
// The width (in ring size) over which one zone's colour blends into the next.
export const RING_BLEND=.035;
const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
const mix=(a,b,k)=>a.map((v,i)=>Math.round(v+(b[i]-v)*k));
const smooth=k=>k*k*(3-2*k);
// Colour of the ring at size e (0 centre .. 1 widest) for these zone edges.
export function ringColor(e,zone=forgeZones()){
 const c=RING_COLORS,y0=rgb(c.centre),y=rgb(c.perfect),g=rgb(c.success),n=rgb(c.near),f=rgb(c.failed);
 const inside=x=>x<=zone.perfect?mix(y0,y,zone.perfect?x/zone.perfect:1):x<=zone.success?g:x<=zone.near?n:f;
 for(const edge of [zone.perfect,zone.success,zone.near]){
  if(Math.abs(e-edge)<RING_BLEND){const k=smooth((e-edge+RING_BLEND)/(2*RING_BLEND));return mix(inside(edge-RING_BLEND),inside(edge+RING_BLEND),k);}
 }
 return inside(e);
}
const tables=new Map();
// Colour strings and scale strings for every step of one zone set (shared per zones).
export function ringTable(zone=forgeZones()){
 let table=tables.get(zone);
 if(!table){
  const colors=[],scales=[];
  for(let i=0;i<=STEPS;i++){const e=i/STEPS,[r,g,b]=ringColor(e,zone);colors.push('rgb('+r+','+g+','+b+')');scales.push('scale('+Math.max(.035,e).toFixed(4)+')');}
  table=Object.freeze({colors:Object.freeze(colors),scales:Object.freeze(scales)});tables.set(zone,table);
 }
 return table;
}
export const ringStep=e=>Math.round(Math.max(0,Math.min(1,e))*STEPS);
// The ring's markup: zone guides, the moving ring and its light halo.
// Returns {node, set(e), size(px)}.
export function createForgeRing(doc,zone=forgeZones()){
 const node=doc.createElement('div');node.className='mf-forge-aim';node.setAttribute('aria-hidden','true');
 const svg=doc.createElementNS(SVG,'svg');svg.setAttribute('viewBox','-100 -100 200 200');svg.setAttribute('class','mf-forge-rings');
 const circle=(cls,r)=>{const c=doc.createElementNS(SVG,'circle');c.setAttribute('class',cls);c.setAttribute('r',String(r));c.setAttribute('cx','0');c.setAttribute('cy','0');svg.append(c);return c;};
 circle('mf-forge-guide is-near',(96*zone.near).toFixed(2));circle('mf-forge-guide is-success',(96*zone.success).toFixed(2));
 circle('mf-forge-guide is-perfect',(96*zone.perfect).toFixed(2));
 const halo=circle('mf-forge-halo',96),ring=circle('mf-forge-ring',96);
 node.append(svg);
 const table=ringTable(zone);let step=-1;
 return {node,ring,halo,table,
  get step(){return step;},
  set(e){const i=ringStep(e);if(i===step)return;step=i;const scale=table.scales[i];ring.style.transform=scale;halo.style.transform=scale;ring.style.stroke=table.colors[i];},
  place(x,y,radius){node.style.transform='translate('+x.toFixed(1)+'px,'+y.toFixed(1)+'px)';node.style.setProperty('--ring',radius.toFixed(1)+'px');},
 };
}
