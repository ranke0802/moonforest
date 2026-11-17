// Meadow grass (0.4) — the view.
// Thousands of tufts cannot be placed one node each (every placed prop costs
// selection time per frame), so each 20 m cell is two thin-instance meshes
// of the existing grass tuft: a light copy for nearby cells and a tiny copy
// for distant ones. Only one of the two is enabled; distant cells also draw
// a thinned prefix. The engine culls whole cells against the view. Tufts do
// not cast shadows, are not obstacles and are not placement records.
import {scatterCell,meadowCells,MEADOW_CELL,TUFT_STRIDE} from './meadow-scatter.js';
import {deriveDetailMesh} from './detail-lod.js';

// Measured on the plains (PC, 0.4): a 201-triangle near copy within 34 m put
// 1.34 M triangles on screen by the stream; 84 triangles within 26 m reads the
// same from the play camera.
export const MEADOW=Object.freeze({nearTriangles:84,farTriangles:24,nearRange:26,thinRange:90,farShare:.7,thinShare:.35,switchSeconds:.2,hysteresis:3,slope:.38});

export function createMeadow(world,{tuft,spec,amount=1,now=()=>performance.now()}){
 const scene=world.scene,near=deriveDetailMesh(tuft,MEADOW.nearTriangles,'meadow-near'),far=deriveDetailMesh(tuft,MEADOW.farTriangles,'meadow-far');
 if(!near||!far){near?.dispose();far?.dispose();return null;}
 for(const mesh of [near,far]){mesh.setEnabled(false);mesh.metadata={...mesh.metadata,meadow:true};}
 const queue=meadowCells(spec.radius),cells=[],stats={cells:queue.length,built:0,tufts:0,nearCells:0,farCells:0,drawn:0,buildMs:0};
 let disposed=false,timer=0,sorted=false;
 const terrain=world.terrain,height=(x,z)=>terrain.heightAt(x,z);
 function copy(source,name,matrices,count){
  const mesh=source.clone(name,null,true);mesh.parent=null;mesh.makeGeometryUnique();
  mesh.isPickable=false;mesh.isVisible=true;mesh.alwaysSelectAsActiveMesh=false;mesh.receiveShadows=source.receiveShadows;mesh.metadata={...source.metadata};
  mesh.thinInstanceSetBuffer('matrix',matrices,16,true);
  // The shared scenery shader reads these per instance (regular instances get
  // them from the placement systems): fully visible, full shadow, no ink.
  mesh.thinInstanceSetBuffer('treeCoverage',new Float32Array(count).fill(1),1,true);
  mesh.thinInstanceSetBuffer('villageShadowFade',new Float32Array(count).fill(1),1,true);
  mesh.thinInstanceSetBuffer('villageInk',new Float32Array(count*2),2,true);
  mesh.thinInstanceRefreshBoundingInfo(false);mesh.setEnabled(false);
  return mesh;
 }
 function build(entry){
  const started=now(),reach=MEADOW_CELL*.71,data=scatterCell(entry.cx,entry.cz,{sample:spec.sampler(entry.x,entry.z,reach),amount}),total=data.length/TUFT_STRIDE;
  // Solid scenery near this cell (rocks, trunks, walls): tufts keep out.
  const solids=[];for(const o of world.navigation?.obstacles??[])if(Number.isFinite(o.radius)&&(o.x-entry.x)**2+(o.z-entry.z)**2<(reach+o.radius+.5)**2)solids.push(o.x,o.z,(o.radius+.1)**2);
  const matrices=new Float32Array(total*16);let count=0;
  for(let i=0;i<total;i++){
   const x=data[i*TUFT_STRIDE],z=data[i*TUFT_STRIDE+1],width=data[i*TUFT_STRIDE+2],yaw=data[i*TUFT_STRIDE+3],stretch=data[i*TUFT_STRIDE+4];
   const y=height(x,z);
   // Keep off cliffs.
   if(Math.abs(height(x+.4,z)-y)>MEADOW.slope||Math.abs(height(x,z+.4)-y)>MEADOW.slope)continue;
   let blocked=false;for(let k=0;k<solids.length;k+=3)if((solids[k]-x)**2+(solids[k+1]-z)**2<solids[k+2]){blocked=true;break;}
   if(blocked)continue;
   const c=Math.cos(yaw)*width,s=Math.sin(yaw)*width,o=count*16;
   matrices[o]=c;matrices[o+2]=-s;matrices[o+5]=width*stretch;matrices[o+8]=s;matrices[o+10]=c;matrices[o+12]=x;matrices[o+13]=y-.02;matrices[o+14]=z;matrices[o+15]=1;
   count++;
  }
  stats.built++;stats.buildMs+=now()-started;
  if(!count)return;
  const packed=matrices.subarray(0,count*16),id=entry.cx+':'+entry.cz;
  cells.push({x:entry.x,z:entry.z,count,near:copy(near,'meadow-near-'+id,packed,count),far:copy(far,'meadow-far-'+id,packed,count),state:0});
  stats.tufts+=count;
 }
 function refresh(camera){
  let nearCells=0,farCells=0,drawn=0;
  for(const cell of cells){
   const distance=Math.hypot(cell.x-camera.x,cell.z-camera.z);
   // state: 1 near copy · 2 far copy · 3 far copy, thinned
   let state=cell.state;
   if(state===1){if(distance>MEADOW.nearRange+MEADOW.hysteresis)state=2;}
   else if(distance<MEADOW.nearRange-MEADOW.hysteresis)state=1;
   else if(state===3){if(distance<MEADOW.thinRange-MEADOW.hysteresis)state=2;}
   else if(distance>MEADOW.thinRange+MEADOW.hysteresis)state=3;
   else if(state===0)state=distance>MEADOW.thinRange?3:2;
   if(state!==cell.state){
    cell.state=state;cell.near.setEnabled(state===1);cell.far.setEnabled(state!==1);
    if(state!==1)cell.far.thinInstanceCount=Math.max(1,Math.ceil(cell.count*(state===3?MEADOW.thinShare:MEADOW.farShare)));
   }
   if(state===1){nearCells++;drawn+=cell.count;}else{farCells++;drawn+=cell.far.thinInstanceCount;}
  }
  stats.nearCells=nearCells;stats.farCells=farCells;stats.drawn=drawn;
 }
 return {
  stats,
  // camera: world position. Builds one cell per call (nearest first) until
  // the map is covered, then only switches cell copies a few times a second.
  update(camera,dt){
   if(disposed||scene.isDisposed)return;
   if(queue.length){
    if(!sorted||stats.built%12===0){queue.sort((a,b)=>Math.hypot(b.x-camera.x,b.z-camera.z)-Math.hypot(a.x-camera.x,a.z-camera.z));sorted=true;}
    build(queue.pop());timer=0;
   }
   timer-=dt;if(timer>0)return;timer=MEADOW.switchSeconds;refresh(camera);
  },
  inspect:()=>({...stats,pending:queue.length,nearTriangles:near.getTotalIndices()/3,farTriangles:far.getTotalIndices()/3,cell:MEADOW_CELL}),
  dispose(){if(disposed)return;disposed=true;for(const cell of cells){cell.near.dispose();cell.far.dispose();}cells.length=0;queue.length=0;near.dispose();far.dispose();},
 };
}
