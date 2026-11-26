// Starfall impact web: radial faults, forks and broken polygon rings, generated
// once per landing into module-level scratch arrays (no allocation after load).
// Units are metres in the landing frame (before the slot's ground rotation).
// Ground breaks in straight pieces: every fault is a polyline of straight
// segments with sharp turns and stepped widths at the joints.

// Each station becomes four vertices (lip, trench edge, trench edge, lip).
export const CRACK_STATIONS=900;
export const CRACK_LIP=1.35; // lip edge, in trench half-widths

// Crack-field reach: 1.45x the damage radius at rank 1, 2.1x at rank 5; a short
// release keeps 72% of it. With a body at the centre the faults still clear it
// by 0.9 m (free swings are unchanged).
export function crackReach(radius,level,charge,clear=0){
  const rank=Math.max(1,Math.min(5,Math.trunc(level)||1)),power=Math.max(0,Math.min(1,charge));
  const free=radius*(1.45+.1625*(rank-1))*(.72+.28*power);
  return clear>0?Math.max(free,clear+1.0):free;
}

const MAX_CP=720,MAX_STRIPS=96;
// cpWin: width at the end of the incoming segment; cpWout: start of the outgoing one.
const cpX=new Float32Array(MAX_CP),cpZ=new Float32Array(MAX_CP),cpWin=new Float32Array(MAX_CP),cpWout=new Float32Array(MAX_CP),cpD=new Float32Array(MAX_CP);
const stripStart=new Int16Array(MAX_STRIPS),stripCount=new Int16Array(MAX_STRIPS),stripMode=new Uint8Array(MAX_STRIPS);
const stripRing=new Uint8Array(MAX_STRIPS),stripHeat=new Float32Array(MAX_STRIPS),stripLayer=new Uint8Array(MAX_STRIPS);
const primStart=new Int16Array(12),primCount=new Int16Array(12);

// Output: one entry per station.
export const station={
  x:new Float32Array(CRACK_STATIONS),z:new Float32Array(CRACK_STATIONS),
  nx:new Float32Array(CRACK_STATIONS),nz:new Float32Array(CRACK_STATIONS), // unit normal * half width
  dist:new Float32Array(CRACK_STATIONS),  // network distance from the centre / reach (0..1): rip front
  meta:new Float32Array(CRACK_STATIONS),  // along (0 root..1 tip) + 2*lip mode
  arc:new Float32Array(CRACK_STATIONS),   // metres along the strip, for rim chips
  heat:new Float32Array(CRACK_STATIONS),  // starlight heat weight
  layer:new Uint8Array(CRACK_STATIONS),   // depth layer: 2 primary, 1 fork, 0 ring (primary drawn on top)
};

let state=1;
function random(){
  // mulberry32
  state=(state+0x6D2B79F5)|0;
  let t=Math.imul(state^(state>>>15),1|state);
  t=(t+Math.imul(t^(t>>>7),61|t))^t;
  return ((t^(t>>>14))>>>0)/4294967296;
}
// A turn of 12..40 degrees.
function kink(){return .21+.49*random();}

let cps=0,strips=0,out=0,fieldReach=1;
const {x:sx,z:sz,nx:snx,nz:snz,dist:sd,meta:sm,arc:sa,heat:sh,layer:sl}=station;
function put(x,z,nx,nz,hw,d,along,arc,s){
  if(out>=CRACK_STATIONS)return;
  sx[out]=x;sz[out]=z;snx[out]=nx*hw;snz[out]=nz*hw;sd[out]=Math.min(1,d/fieldReach);
  sm[out]=Math.min(.999,along)+2*stripMode[s];sa[out]=arc;sh[out]=stripHeat[s];sl[out]=stripLayer[s];out++;
}
function beginStrip(mode,heat,layer,ring=0){
  stripStart[strips]=cps;stripCount[strips]=0;stripMode[strips]=mode;stripHeat[strips]=heat;stripLayer[strips]=layer;stripRing[strips]=ring;
}
function addCp(x,z,win,wout,d){
  if(cps>=MAX_CP)return false;
  cpX[cps]=x;cpZ[cps]=z;cpWin[cps]=win;cpWout[cps]=wout;cpD[cps]=d;cps++;stripCount[strips]++;return true;
}
function endStrip(){if(stripCount[strips]>=2&&strips<MAX_STRIPS-1)strips++;else cps=stripStart[strips];}
// Overall taper: slowly narrowing, then to a point over the last 23% only.
function taper(t){return t<.77?1-.35*t:(1-.35*.77)*Math.max(0,1-t)/.23;}

// A fork that starts at joint k of the strip at `first`, turning 25..50 degrees.
function fork(first,k,side,length,width,mode,heat,layer){
  const i=first+k;
  const hx=cpX[i+1]-cpX[i],hz=cpZ[i+1]-cpZ[i];
  let heading=Math.atan2(hz,hx)+side*(.44+.43*random());
  if(length<.2||width<.008)return -1;
  beginStrip(mode,heat,layer);
  let x=cpX[i],z=cpZ[i],d=cpD[i],walked=0,factor=.85+.3*random(),turn=-side;
  addCp(x,z,width*factor,width*factor,d);
  while(walked<length-1e-3&&cps<MAX_CP-1){
    const dx=Math.cos(heading),dz=Math.sin(heading);
    let seg=Math.min(length-walked,.25+.25*random());
    // A fork never leaves the field: it ends where it meets the reach.
    const room=toCircle(x,z,dx,dz,fieldReach);
    if(seg>=room){seg=room;length=walked+seg;}
    x+=dx*seg;z+=dz*seg;walked+=seg;d+=seg;
    const t=length>0?walked/length:1,done=t>=.999,win=width*factor*taper(t);
    factor=1+(random()-.5)*.6;
    addCp(x,z,done?0:win,done?0:width*factor*taper(t),d);
    if(random()<.7)turn=-turn;
    heading+=turn*kink()*.8;
  }
  const index=strips;endStrip();
  return index===strips?-1:index;
}

// Distance t along the unit direction (dx,dz) from (x,z) to the circle of radius r.
function toCircle(x,z,dx,dz,r){
  const b=x*dx+z*dz,c=x*x+z*z-r*r,disc=b*b-c;
  return disc>0?-b+Math.sqrt(disc):0;
}

// The point where primary p crosses radius rho (linear on its polyline).
const hit={x:0,z:0,d:0};
function crossing(p,rho){
  const first=primStart[p],count=primCount[p];
  for(let k=first;k<first+count-1;k++){
    const r0=Math.hypot(cpX[k],cpZ[k]),r1=Math.hypot(cpX[k+1],cpZ[k+1]);
    if((r0-rho)*(r1-rho)<=0&&r0!==r1){
      const t=(rho-r0)/(r1-r0);
      hit.x=cpX[k]+(cpX[k+1]-cpX[k])*t;hit.z=cpZ[k]+(cpZ[k+1]-cpZ[k])*t;hit.d=cpD[k]+(cpD[k+1]-cpD[k])*t;
      return true;
    }
  }
  return false;
}

// Returns the number of stations written (<= CRACK_STATIONS).
export function buildCrackField(seed,radius,level,charge,clear=0){
  state=seed|0;cps=0;strips=0;
  const rank=Math.max(1,Math.min(5,Math.trunc(level)||1)),power=Math.max(0,Math.min(1,charge));
  const reach=crackReach(radius,rank,power,clear),scale=.72+.28*power;
  const w0=(.20+.035*(rank-1))*(.85+.15*power);
  const heat=(.45+.55*power)*(.70+.075*(rank-1));
  const n=4+rank,base=random()*Math.PI*2;
  const minLength=clear>0?clear+.9:0;
  fieldReach=reach;
  // Primary faults: even spread with jitter, straight 0.25..0.7 m segments with
  // 12..40 degree turns that keep drifting back toward the radial direction.
  for(let p=0;p<n;p++){
    const angle=base+(p+(random()-.5)*.5)*Math.PI*2/n;
    const length=Math.max(minLength+.1*random(),reach*(p%3===1?.74+.14*random():.86+.14*random()));
    const start=Math.min(.08,reach*.03);
    const mode=p%2===0?1:2; // plates alternate: lifted/dropped rim per side
    beginStrip(mode,heat,2);
    let x=Math.cos(angle)*start,z=Math.sin(angle)*start,rho=start,heading=angle+(random()-.5)*.4;
    let factor=.9+.2*random();
    addCp(x,z,w0*factor,w0*factor,rho);
    for(let s=0;s<24;s++){
      const dx=Math.cos(heading),dz=Math.sin(heading);
      // Shorten the last piece so the tip lands exactly on the intended length.
      const seg=Math.min(.25+.45*random(),toCircle(x,z,dx,dz,length));
      x+=dx*seg;z+=dz*seg;rho=Math.hypot(x,z);
      const t=Math.min(1,rho/length),done=rho>=length-.005||s===23;
      const win=done?0:w0*factor*taper(t);
      factor=1+(random()-.5)*.6;
      addCp(x,z,win,done?0:w0*factor*taper(t),rho);
      if(done)break;
      const off=Math.atan2(Math.sin(heading-angle),Math.cos(heading-angle));
      const dir=off>.22?-1:off<-.22?1:(random()<.5?-1:1);
      heading+=dir*kink();
    }
    primStart[p]=stripStart[strips];primCount[p]=stripCount[strips];
    endStrip();
  }
  // Broken polygon rings: straight chords between neighbouring faults at a
  // jittered radius; about a third left out, long chords kinked once.
  const rings=rank>=3?2:1,ringFloor=clear>0?clear+.25:0;
  for(let ring=0;ring<rings;ring++){
    const rho0=radius*(ring===0?.9:.45)*scale;
    for(let p=0;p<n;p++){
      if(random()<.35)continue;
      const ra=Math.max(ringFloor,rho0*(.8+.45*random())),rb=Math.max(ringFloor,rho0*(.8+.45*random()));
      if(!crossing(p,ra))continue;
      const ax=hit.x,az=hit.z,ad=hit.d;
      if(!crossing((p+1)%n,rb))continue;
      const bx=hit.x,bz=hit.z,bd=hit.d;
      const dx=bx-ax,dz=bz-az,len=Math.hypot(dx,dz);
      if(len<.15||len>Math.max(ra,rb)*1.9)continue;
      const width=.45*w0*(.85+.3*random()),from=Math.min(ad,bd);
      beginStrip(random()<.5?1:2,heat*.55,0,1);
      addCp(ax,az,width,width,from);
      if(len>1.0){
        // Bend outward so the kink never cuts back inside the ring floor.
        const bend=(.08+.07*random())*len*(dx*az-dz*ax>0?-1:1),f2=1+(random()-.5)*.6;
        addCp(ax+dx*.5-dz/len*bend,az+dz*.5+dx/len*bend,width,width*f2,from+len*.3);
        addCp(bx,bz,width*f2,width*f2,from);
      }else addCp(bx,bz,width,width,from);
      endStrip();
    }
  }
  // Forks start at joints: occasional at rank 1, one per fault at rank 3, up to
  // two at rank 5, with hairline second-order forks from rank 4.
  for(let p=0;p<n;p++){
    const first=primStart[p],count=primCount[p];
    if(count<3)continue;
    const forks=rank===1?(random()<.5?1:0):rank<4?1:1+(random()<(rank===5?.45:.25)?1:0);
    for(let f=0;f<forks;f++){
      const k=Math.max(1,Math.min(count-2,Math.round((count-1)*(.25+.45*((f+random())/forks)))));
      const side=(f+p)%2?1:-1;
      const remaining=Math.hypot(cpX[first+count-1]-cpX[first+k],cpZ[first+count-1]-cpZ[first+k]);
      const b=fork(first,k,side,Math.min(1.8,remaining*(.40+.25*random())),.45*w0,side>0?1:2,heat*.7,1);
      if(b>=0&&rank>=4&&random()<.45&&stripCount[b]>=3){
        fork(stripStart[b],1,-side,.35+.35*random(),.15*w0*(1+.5*random()),0,heat*.4,1);
      }
    }
  }
  // Resample to stations. Every joint is kept as two stations (incoming and
  // outgoing width) on a shared mitred normal; segments are subdivided only so
  // that the trench follows the terrain. The step grows to fit the budget.
  let total=0;
  for(let s=0;s<strips;s++)for(let k=stripStart[s];k<stripStart[s]+stripCount[s]-1;k++)total+=Math.hypot(cpX[k+1]-cpX[k],cpZ[k+1]-cpZ[k]);
  const spare=CRACK_STATIONS-2*cps-2*strips-4;
  const step=Math.max(.12,total/Math.max(1,spare));
  out=0;fieldReach=reach;
  for(let s=0;s<strips&&out<CRACK_STATIONS-3;s++){
    const first=stripStart[s],count=stripCount[s],last=first+count-1;
    let length=0;
    for(let k=first;k<last;k++)length+=Math.hypot(cpX[k+1]-cpX[k],cpZ[k+1]-cpZ[k]);
    const ring=stripRing[s],chips=random()*10;
    let walked=0;
    // A zero-width joint closes the bridge from the previous strip.
    put(cpX[first],cpZ[first],0,0,0,cpD[first],0,chips,s);
    for(let k=first;k<last&&out<CRACK_STATIONS-4;k++){
      const dx=cpX[k+1]-cpX[k],dz=cpZ[k+1]-cpZ[k],len=Math.hypot(dx,dz)||1e-6;
      const nx=-dz/len,nz=dx/len,along=ring?.55:walked/length;
      if(k>first){
        const px=cpX[k]-cpX[k-1],pz=cpZ[k]-cpZ[k-1],pl=Math.hypot(px,pz)||1e-6;
        let mx=nx-pz/pl,mz=nz+px/pl;const ml=Math.hypot(mx,mz);
        if(ml>1e-4){mx/=ml;mz/=ml;}else{mx=nx;mz=nz;}
        const miter=Math.min(1.4,1/Math.max(.5,mx*nx+mz*nz));
        put(cpX[k],cpZ[k],mx,mz,cpWin[k]*.5*miter,cpD[k],along,chips+walked,s);
        put(cpX[k],cpZ[k],mx,mz,cpWout[k]*.5*miter,cpD[k],along,chips+walked,s);
      }else put(cpX[k],cpZ[k],nx,nz,cpWout[k]*.5,cpD[k],0,chips,s);
      const sub=Math.max(1,Math.round(len/step));
      for(let q=1;q<sub&&out<CRACK_STATIONS-4;q++){
        const t=q/sub;
        put(cpX[k]+dx*t,cpZ[k]+dz*t,nx,nz,(cpWout[k]+(cpWin[k+1]-cpWout[k])*t)*.5,cpD[k]+(cpD[k+1]-cpD[k])*t,ring?.55:(walked+len*t)/length,chips+walked+len*t,s);
      }
      walked+=len;
      if(k===last-1)put(cpX[k+1],cpZ[k+1],nx,nz,cpWin[k+1]*.5,cpD[k+1],ring?.55:1,chips+walked,s);
    }
    put(cpX[last],cpZ[last],0,0,0,cpD[last],ring?.55:1,chips+walked,s);
  }
  // The last station is always a point, so the bridge to the unused ones has no area.
  if(out){snx[out-1]=0;snz[out-1]=0;}
  // Unused stations collapse onto the centre (zero-area triangles).
  for(let i=out;i<CRACK_STATIONS;i++){sx[i]=0;sz[i]=0;snx[i]=0;snz[i]=0;sd[i]=0;sm[i]=0;sa[i]=0;sh[i]=0;sl[i]=0;}
  return out;
}
