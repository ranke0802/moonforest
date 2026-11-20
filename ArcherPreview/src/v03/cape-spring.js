// The warrior's cape, loosened (0.3, 2026-11-20, user: the cape looks stiff;
// bone chain + spring, light enough for a Galaxy S23 / iPhone 14 Pro).
//
// What the model has: the cape mesh is skinned to a 9 x 5 grid of bones
// (DEF-Cloth.RR.CC: RR 00 at the shoulders to 08 at the hem, CC across),
// every one a direct child of Spine2, and every clip carries a baked cloth
// pose for them. The baked pose is right for the clip but knows nothing of
// what the warrior actually does: turning, stopping, being thrown.
//
// What this adds: each grid point (rows 1-8, 40 points) becomes a small mass
// on a spring to its baked place, simulated in world space. It lags behind
// when the body moves or turns, swings past and settles, streams back a
// little when running, and breathes in a light wind when idle. The top row
// stays where the clip puts it.
//   - No stretching: a point is never further from the one above it than the
//     clip has it (so the cloth cannot pull like cheese).
//   - A leash: a point never strays more than a few centimetres (more toward
//     the hem) from its baked place.
//   - A few spheres (hips, spine, thighs, calves) keep it out of the body.
//
// Cost: 40 points, a handful of multiplications each, no allocation, one
// world matrix for Spine2 and one each for six collider bones per frame.
// It runs once per rendered frame after the clip was sampled.
import {Matrix,Quaternion,Vector3} from '@babylonjs/core/Maths/math.vector.js';
export const CAPE_ROWS=9,CAPE_COLS=5;
// Per row (1..8): spring (1/s²), relative damping (1/s). Air drag and the rest
// are shared. Lengths in metres (world).
export const CAPE_TUNING=Object.freeze({
 springTop:620,springHem:150,   // stiffer near the shoulders
 damping:.5,                    // share of critical damping, against the baked motion
 air:3.2,                       // drag against the still air: the cape streams back when running
 gust:2.4,                      // idle wind, m/s² at the hem
 leashTop:.02,leashStep:.03,    // how far a point may stray: 2 cm + 3 cm per row
 stretch:1.02,                  // longest a link may be, against the clip's own length
 jump:1.5,                      // the shoulders moved this far in one frame: start over (a teleport)
 maxStep:1/45,                  // longer frames are simulated in two steps
});

// The simulation alone (no engine): world positions in flat arrays, 3 per point,
// row by row from the shoulders.
export function createCapeSim({rows=CAPE_ROWS,cols=CAPE_COLS,tuning=CAPE_TUNING}={}){
 const count=rows*cols,rest=new Float32Array(count*3),was=new Float32Array(count*3),pos=new Float32Array(count*3),vel=new Float32Array(count*3);
 const spring=new Float32Array(rows),damp=new Float32Array(rows),leash=new Float32Array(rows);
 for(let r=1;r<rows;r++){const k=(r-1)/Math.max(1,rows-2);spring[r]=tuning.springTop+(tuning.springHem-tuning.springTop)*k;damp[r]=2*tuning.damping*Math.sqrt(spring[r]);leash[r]=tuning.leashTop+tuning.leashStep*r;}
 const end=new Float32Array(count*3);let started=false,clock=0;
 function reset(){pos.set(rest);was.set(rest);vel.fill(0);started=true;}
 // One step of h seconds toward `rest` (already this frame's baked places).
 function advance(h,colliders,colliderCount){
  clock+=h;
  for(let r=1;r<rows;r++){
   const k=spring[r],c=damp[r],reach=leash[r],gust=tuning.gust*r/(rows-1);
   for(let col=0;col<cols;col++){
    const i=(r*cols+col)*3,up=i-cols*3;
    // Where the clip moves this point this step: damping works against that, not against the world.
    const rvx=(rest[i]-was[i])/h,rvy=(rest[i+1]-was[i+1])/h,rvz=(rest[i+2]-was[i+2])/h;
    let vx=vel[i],vy=vel[i+1],vz=vel[i+2];
    // The spring is measured against where the clip had the point when it was last placed (was): against
    // this step's place it would count the body's own travel as stretch and run a frame ahead.
    const ax=k*(was[i]-pos[i])-c*(vx-rvx)-tuning.air*vx+gust*Math.sin(clock*.83+col*.9+r*.35);
    const ay=k*(was[i+1]-pos[i+1])-c*(vy-rvy)-tuning.air*vy;
    const az=k*(was[i+2]-pos[i+2])-c*(vz-rvz)-tuning.air*vz+gust*Math.cos(clock*.61+col*.7);
    vx+=ax*h;vy+=ay*h;vz+=az*h;
    let x=pos[i]+vx*h,y=pos[i+1]+vy*h,z=pos[i+2]+vz*h;
    // The leash to the baked place.
    let dx=x-rest[i],dy=y-rest[i+1],dz=z-rest[i+2],d=Math.hypot(dx,dy,dz);
    if(d>reach){const s=reach/d;x=rest[i]+dx*s;y=rest[i+1]+dy*s;z=rest[i+2]+dz*s;}
    // Out of the body.
    for(let n=0;n<colliderCount;n++){const o=n*4,radius=colliders[o+3];dx=x-colliders[o];dy=y-colliders[o+1];dz=z-colliders[o+2];d=dx*dx+dy*dy+dz*dz;
     if(d<radius*radius&&d>1e-10){const s=radius/Math.sqrt(d);x=colliders[o]+dx*s;y=colliders[o+1]+dy*s;z=colliders[o+2]+dz*s;}}
    // No stretching: never further from the point above than the clip has it (the row above is final by now).
    const limit=Math.hypot(rest[i]-rest[up],rest[i+1]-rest[up+1],rest[i+2]-rest[up+2])*tuning.stretch;
    dx=x-pos[up];dy=y-pos[up+1];dz=z-pos[up+2];d=Math.hypot(dx,dy,dz);
    if(d>limit&&d>1e-8){const s=limit/d;x=pos[up]+dx*s;y=pos[up+1]+dy*s;z=pos[up+2]+dz*s;}
    vel[i]=(x-pos[i])/h;vel[i+1]=(y-pos[i+1])/h;vel[i+2]=(z-pos[i+2])/h;pos[i]=x;pos[i+1]=y;pos[i+2]=z;
   }
  }
 }
 return {
  rows,cols,count,rest,pos,
  get started(){return started;},
  reset,
  // Call with `rest` filled for this frame. dt in seconds; colliders: x,y,z,radius per sphere.
  step(dt,colliders=null,colliderCount=0){
   // The pinned row follows the clip exactly.
   for(let i=0;i<cols*3;i++)pos[i]=rest[i];
   if(!started){reset();return;}
   if(Math.hypot(rest[0]-was[0],rest[1]-was[1],rest[2]-was[2])>tuning.jump){reset();return;}
   if(!(dt>0)){was.set(rest);return;}
   const frame=Math.min(dt,1/15),steps=frame>tuning.maxStep?2:1,h=frame/steps;
   if(steps===1)advance(h,colliders,colliderCount);
   else{
    // Two steps: the clip's motion is spread over both (halfway first).
    end.set(rest);
    for(let i=0;i<rest.length;i++)rest[i]=was[i]+(end[i]-was[i])*.5;
    advance(h,colliders,colliderCount);was.set(rest);rest.set(end);advance(h,colliders,colliderCount);
   }
   was.set(rest);
  },
 };
}

// The engine side. root: the warrior's root node. getScale(): slow motion (1 normally).
// Returns null for a model without the cloth grid.
const SPINE='mixamorig:Spine2';
// [bone, toward (the sphere sits halfway to this bone; null: on the bone), radius in world metres (the warrior is 1.56 m tall)]
const COLLIDERS=[['mixamorig:Hips',null,.17],['mixamorig:Spine',null,.155],['mixamorig:LeftUpLeg','mixamorig:LeftLeg',.1],['mixamorig:RightUpLeg','mixamorig:RightLeg',.1],['mixamorig:LeftLeg','mixamorig:LeftFoot',.08],['mixamorig:RightLeg','mixamorig:RightFoot',.08]];
export function createCapeSpring({scene,root,getScale=()=>1,tuning=CAPE_TUNING}){
 const nodes=new Map();for(const node of root.getDescendants(false))if(node.getClassName?.()==='TransformNode'&&!nodes.has(node.name))nodes.set(node.name,node);
 const spine=nodes.get(SPINE),grid=[];
 for(let r=0;r<CAPE_ROWS;r++)for(let c=0;c<CAPE_COLS;c++){const node=nodes.get(`DEF-Cloth.0${r}.0${c}`);if(node&&node.parent===spine)grid.push(node);}
 if(!spine||grid.length!==CAPE_ROWS*CAPE_COLS)return null; // another model: nothing to do
 const sim=createCapeSim({tuning}),count=sim.count;
 const spheres=COLLIDERS.map(([name,toward,radius])=>({node:nodes.get(name),toward:toward?nodes.get(toward):null,radius})).filter(row=>row.node);
 const colliders=new Float32Array(spheres.length*4);
 // What the clip last gave each bone (local), and what was written over it: a
 // frame in which the clip did not write (hit stop, a paused clip) must not
 // read the simulated pose back as the baked one.
 const baked=new Float32Array(count*3),wrote=new Float32Array(count*3).fill(NaN),bakedRot=new Float32Array(count*4),wroteRot=new Float32Array(count*4).fill(NaN);
 const local=new Float32Array(count*3);
 // Each bone gets a vector and a quaternion of its own to carry the result: the
 // clip may hand the bone one of its own key values, which must never be changed in place.
 const ownPos=grid.map(()=>new Vector3()),ownRot=grid.map(()=>new Quaternion());
 const inverse=new Matrix(),a=new Vector3(),b=new Vector3(),q=new Quaternion(),turn=new Quaternion();
 let enabled=true,last=0,micros=0,frames=0;
 function update(){
  if(!enabled||!spine.isEnabled?.()||root.isDisposed?.())return;
  const start=performance.now(),dt=last?Math.min(.1,(start-last)/1000)*getScale():0;last=start;
  const world=spine.computeWorldMatrix(true),m=world.m;
  // 1. The clip's pose: local, then world.
  for(let i=0;i<count;i++){
   const node=grid[i],p=node.position,o=i*3,r=node.rotationQuaternion,o4=i*4;
   if(p!==ownPos[i]||p.x!==wrote[o]||p.y!==wrote[o+1]||p.z!==wrote[o+2]){baked[o]=p.x;baked[o+1]=p.y;baked[o+2]=p.z;}
   if(r&&(r!==ownRot[i]||r.x!==wroteRot[o4]||r.y!==wroteRot[o4+1]||r.z!==wroteRot[o4+2]||r.w!==wroteRot[o4+3])){bakedRot[o4]=r.x;bakedRot[o4+1]=r.y;bakedRot[o4+2]=r.z;bakedRot[o4+3]=r.w;}
   const x=baked[o],y=baked[o+1],z=baked[o+2];
   sim.rest[o]=x*m[0]+y*m[4]+z*m[8]+m[12];sim.rest[o+1]=x*m[1]+y*m[5]+z*m[9]+m[13];sim.rest[o+2]=x*m[2]+y*m[6]+z*m[10]+m[14];
  }
  // 2. The body.
  for(let n=0;n<spheres.length;n++){
   const row=spheres[n],at=row.node.computeWorldMatrix(true).m,o=n*4;let x=at[12],y=at[13],z=at[14];
   if(row.toward){const to=row.toward.computeWorldMatrix(true).m;x=(x+to[12])/2;y=(y+to[13])/2;z=(z+to[14])/2;}
   colliders[o]=x;colliders[o+1]=y;colliders[o+2]=z;colliders[o+3]=row.radius;
  }
  // 3. The cloth.
  sim.step(dt,colliders,spheres.length);
  // 4. Back onto the bones: position, and the turn of each link against the clip's.
  world.invertToRef(inverse);const w=inverse.m;
  for(let i=0;i<count;i++){const o=i*3,x=sim.pos[o],y=sim.pos[o+1],z=sim.pos[o+2];
   local[o]=x*w[0]+y*w[4]+z*w[8]+w[12];local[o+1]=x*w[1]+y*w[5]+z*w[9]+w[13];local[o+2]=x*w[2]+y*w[6]+z*w[10]+w[14];}
  for(let i=CAPE_COLS;i<count;i++){
   const node=grid[i],o=i*3,up=o-CAPE_COLS*3,o4=i*4;
   const p=ownPos[i];p.set(local[o],local[o+1],local[o+2]);node.position=p;wrote[o]=p.x;wrote[o+1]=p.y;wrote[o+2]=p.z;
   if(!node.rotationQuaternion)continue;const r=ownRot[i];
   a.set(baked[o]-baked[up],baked[o+1]-baked[up+1],baked[o+2]-baked[up+2]);b.set(local[o]-local[up],local[o+1]-local[up+1],local[o+2]-local[up+2]);
   const la=a.length(),lb=b.length();
   q.set(bakedRot[o4],bakedRot[o4+1],bakedRot[o4+2],bakedRot[o4+3]);
   if(la>1e-6&&lb>1e-6){a.scaleInPlace(1/la);b.scaleInPlace(1/lb);Quaternion.FromUnitVectorsToRef(a,b,turn);turn.multiplyToRef(q,q);}
   r.copyFrom(q);node.rotationQuaternion=r;wroteRot[o4]=r.x;wroteRot[o4+1]=r.y;wroteRot[o4+2]=r.z;wroteRot[o4+3]=r.w;
  }
  micros+=(performance.now()-start)*1000;frames++;
 }
 const observer=scene.onAfterAnimationsObservable.add(update);
 return {
  root,scene,
  get enabled(){return enabled;},
  // Off: the bones go back to the clip's own pose on its next sample.
  setEnabled(value){enabled=!!value;if(!enabled){wrote.fill(NaN);wroteRot.fill(NaN);last=0;}},
  // Average cost of one update in microseconds since the last call.
  takeCost(){const value=frames?micros/frames:0;micros=0;frames=0;return +value.toFixed(1);},
  inspect:()=>({points:count,colliders:spheres.length,enabled}),
  dispose(){scene.onAfterAnimationsObservable.remove(observer);grid.length=0;spheres.length=0;nodes.clear();},
 };
}
