// Scattered ground vegetation (0.4) — the view.
// Thousands of plants cannot be placed one node each (every placed prop costs
// selection time per frame), so each layer cuts the map into cells and draws
// a cell as thin instances of an existing model: a light copy for nearby
// cells and a tiny copy for distant ones. Only one of the two is enabled;
// distant cells also draw a thinned prefix. The engine culls whole cells
// against the view. These plants cast no shadows, are not obstacles and are
// not placement records.

import {scatterCell,meadowCells,MEADOW_CELL,TUFT_STRIDE} from './meadow-scatter.js';
import {deriveDetailMesh} from './detail-lod.js';

// Measured on the plains (PC, 0.4): a 201-triangle near copy within 34 m put
// 1.34 M triangles on screen by the stream; 84 triangles within 26–32 m reads
// the same from the play camera. 20 m cells drew 65 cells at once (+0.36 ms a
// frame on PC); 30 m cells halve that.
export const MEADOW=Object.freeze({cell:MEADOW_CELL,spacing:.8,nearTriangles:84,farTriangles:24,nearRange:32,thinRange:95,farShare:.7,thinShare:.35,switchSeconds:.2,hysteresis:3,slope:.38,sink:.02});

// sources: the meshes of one model (e.g. the grass tuft) · spec: {radius,
// sampler(centerX,centerZ,reach), layer?: overrides of MEADOW, shape?}
export function createScatterLayer(world,{name,sources,spec,amount=1,now=()=>performance.now()}){
 const scene=world.scene,options={...MEADOW,...spec.layer},templates=[];
 for(const [index,source] of sources.entries()){
  const near=deriveDetailMesh(source,options.nearTriangles,name+'-near-'+index),far=deriveDetailMesh(source,options.farTriangles,name+'-far-'+index);
  if(!near||!far){near?.dispose();far?.dispose();continue;}
  // Thin-instance matrices are world placements: fold the model's own node
  // transform (and the loader's handedness flip) into the copies once.
  const model=source.computeWorldMatrix(true).clone();
  for(const mesh of [near,far]){
   mesh.parent=null;mesh.position.setAll(0);mesh.rotationQuaternion=null;mesh.rotation.setAll(0);mesh.scaling.setAll(1);
   if(!model.isIdentity())mesh.bakeTransformIntoVertices(model);
   mesh.setEnabled(false);mesh.metadata={...mesh.metadata,meadow:name};
  }
  templates.push({near,far});
 }
 if(!templates.length)return null;
 const queue=meadowCells(spec.radius,options.cell),cells=[],stats={name,cells:queue.length,built:0,plants:0,nearCells:0,farCells:0,drawn:0,buildMs:0};
 let disposed=false,timer=0,sorted=false;
 const terrain=world.terrain,height=(x,z)=>terrain.heightAt(x,z);
 function copy(source,id,matrices,count){
  const mesh=source.clone(id,null,true);mesh.parent=null;mesh.makeGeometryUnique();
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
  const started=now(),reach=options.cell*.71;
  const data=scatterCell(entry.cx,entry.cz,{cell:options.cell,spacing:options.spacing,seed:options.seed,shape:spec.shape,sample:spec.sampler(entry.x,entry.z,reach),amount}),total=data.length/TUFT_STRIDE;
  // Solid scenery near this cell (rocks, trunks, walls): plants keep out.
  const solids=[];for(const o of world.navigation?.obstacles??[])if(Number.isFinite(o.radius)&&(o.x-entry.x)**2+(o.z-entry.z)**2<(reach+o.radius+.5)**2)solids.push(o.x,o.z,(o.radius+(options.clearance??.1))**2);
  const matrices=new Float32Array(total*16);let count=0;
  for(let i=0;i<total;i++){
   const x=data[i*TUFT_STRIDE],z=data[i*TUFT_STRIDE+1],width=data[i*TUFT_STRIDE+2],yaw=data[i*TUFT_STRIDE+3],stretch=data[i*TUFT_STRIDE+4];
   const y=height(x,z);
   // Keep off cliffs.
   if(Math.abs(height(x+.4,z)-y)>options.slope||Math.abs(height(x,z+.4)-y)>options.slope)continue;
   let blocked=false;for(let k=0;k<solids.length;k+=3)if((solids[k]-x)**2+(solids[k+1]-z)**2<solids[k+2]){blocked=true;break;}
   if(blocked)continue;
   const c=Math.cos(yaw)*width,s=Math.sin(yaw)*width,o=count*16;
   matrices[o]=c;matrices[o+2]=-s;matrices[o+5]=width*stretch;matrices[o+8]=s;matrices[o+10]=c;matrices[o+12]=x;matrices[o+13]=y-options.sink;matrices[o+14]=z;matrices[o+15]=1;
   count++;
  }
  stats.built++;stats.buildMs+=now()-started;
  if(!count)return;
  const packed=matrices.subarray(0,count*16),id=name+'-'+entry.cx+':'+entry.cz;
  cells.push({x:entry.x,z:entry.z,count,state:0,
   near:templates.map((template,index)=>copy(template.near,id+'-near-'+index,packed,count)),
   far:templates.map((template,index)=>copy(template.far,id+'-far-'+index,packed,count))});
  stats.plants+=count;
 }
 function refresh(camera){
  let nearCells=0,farCells=0,drawn=0;
  for(const cell of cells){
   const distance=Math.hypot(cell.x-camera.x,cell.z-camera.z);
   // state: 1 near copy · 2 far copy · 3 far copy, thinned
   let state=cell.state;
   if(state===1){if(distance>options.nearRange+options.hysteresis)state=2;}
   else if(distance<options.nearRange-options.hysteresis)state=1;
   else if(state===3){if(distance<options.thinRange-options.hysteresis)state=2;}
   else if(distance>options.thinRange+options.hysteresis)state=3;
   else if(state===0)state=distance>options.thinRange?3:2;
   const shown=state===1?cell.count:Math.max(1,Math.ceil(cell.count*(state===3?options.thinShare:options.farShare)));
   if(state!==cell.state){
    cell.state=state;
    for(const mesh of cell.near)mesh.setEnabled(state===1);
    for(const mesh of cell.far){mesh.setEnabled(state!==1);if(state!==1)mesh.thinInstanceCount=shown;}
   }
   if(state===1)nearCells++;else farCells++;drawn+=shown;
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
   timer-=dt;if(timer>0)return;timer=options.switchSeconds;refresh(camera);
  },
  inspect:()=>({...stats,pending:queue.length,nearTriangles:templates.reduce((n,t)=>n+t.near.getTotalIndices()/3,0),farTriangles:templates.reduce((n,t)=>n+t.far.getTotalIndices()/3,0),cell:options.cell}),
  dispose(){
   if(disposed)return;disposed=true;
   for(const cell of cells)for(const mesh of [...cell.near,...cell.far])mesh.dispose();
   cells.length=0;queue.length=0;for(const template of templates){template.near.dispose();template.far.dispose();}
  },
 };
}
// All scattered layers of one map behind one update call.
export function createMeadow(){
 const layers=[];
 return {
  layers,
  add(layer){if(layer)layers.push(layer);return layer;},
  has:name=>layers.some(layer=>layer.stats.name===name),
  update(camera,dt){for(const layer of layers)layer.update(camera,dt);},
  inspect:()=>layers.map(layer=>layer.inspect()),
  dispose(){for(const layer of layers)layer.dispose();layers.length=0;},
 };
}
