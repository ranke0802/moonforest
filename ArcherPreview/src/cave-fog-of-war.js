// CPU-only visibility. No camera access, mesh changes, browser API or dependency.
export const CAVE_FOG_UNSEEN=0, CAVE_FOG_EXPLORED=1, CAVE_FOG_VISIBLE=2;

// Keep this registry on the map/session owner, not on a disposable environment.
// A map key describes the map, not the application build/cache revision.
export class CaveFogMemory {
  constructor(limit=4){if(!Number.isInteger(limit)||limit<1)throw new RangeError('Invalid map memory limit');this.limit=limit;this.maps=new Map();}
  acquire(key,signature,length){
    let value=this.maps.get(key);
    if(!value||value.signature!==signature)value={signature,explored:new Uint8Array(length)};
    this.maps.delete(key);this.maps.set(key,value);
    while(this.maps.size>this.limit)this.maps.delete(this.maps.keys().next().value);
    return value.explored;
  }
  clear(key){if(key===undefined)this.maps.clear();else this.maps.delete(key);}
}

// Navigation is the conservative fallback. Inject isOpaque for dedicated vision
// geometry: water, a low sill or a non-walkable floor need not block sight.
export function navigationSightBlocker(navigation,{limit=Infinity}={}){
  if(typeof navigation?.free!=='function')throw new TypeError('navigation.free or isOpaque is required');
  const point={x:0,z:0};
  return (x,z)=>{point.x=x;point.z=z;return !navigation.free(point,0,limit);};
}

export class CaveFogOfWar {
  constructor({minX=-80,minZ=-80,width=160,depth=160,cellSize=1,radius=24,
    interval=.16,minMove=.2,isOpaque,navigation,limit=Infinity,
    memory=null,mapKey='witch-cave',maxCells=65536}={}){
    for(const [key,value]of Object.entries({minX,minZ,width,depth,cellSize,radius,interval,minMove}))
      if(!Number.isFinite(value))throw new RangeError('Invalid '+key);
    if(width<=0||depth<=0||cellSize<=0||radius<=0||interval<0||minMove<0)throw new RangeError('Invalid visibility dimensions');
    this.cols=Math.ceil(width/cellSize);this.rows=Math.ceil(depth/cellSize);
    if(this.cols*this.rows>maxCells)throw new RangeError('Visibility grid exceeds fixed budget');
    Object.assign(this,{minX,minZ,width,depth,cellSize,radius,interval,minMove,mapKey});
    this.signature=JSON.stringify([minX,minZ,width,depth,cellSize,this.cols,this.rows]);
    const length=this.cols*this.rows;
    this.opaque=new Uint8Array(length);this.visible=new Uint8Array(length);
    this.explored=memory?memory.acquire(mapKey,this.signature,length):new Uint8Array(length);
    this.rgba=new Uint8Array(length*4);this.sums=new Uint32Array((this.cols+1)*(this.rows+1));
    this.isOpaque=isOpaque??navigationSightBlocker(navigation,{limit});
    if(typeof this.isOpaque!=='function')throw new TypeError('isOpaque must be a callback');
    this.x=NaN;this.z=NaN;this.lastTime=-Infinity;this.revision=0;this.dirty=true;this.ready=false;this.disposed=false;
    this.stats={updates:0,raySteps:0,visibleCells:0,exploredCells:this.explored.reduce((n,v)=>n+Number(!!v),0),opaqueSamples:0,
      arrayBytes:this.opaque.byteLength+this.visible.byteLength+this.explored.byteLength+this.rgba.byteLength+this.sums.byteLength};
    this.rebuildOccluders();
    for(let i=0;i<length;i++){this.rgba[i*4+1]=this.explored[i]?255:0;this.rgba[i*4+3]=255;}
  }
  rebuildOccluders(isOpaque=this.isOpaque){
    if(this.disposed)return;
    if(typeof isOpaque!=='function')throw new TypeError('isOpaque must be a callback');
    this.isOpaque=isOpaque;
    for(let z=0;z<this.rows;z++)for(let x=0;x<this.cols;x++){
      const wx=this.minX+(x+.5)*this.cellSize,wz=this.minZ+(z+.5)*this.cellSize;
      this.opaque[z*this.cols+x]=isOpaque(wx,wz)?1:0;
    }
    this.stats.opaqueSamples+=this.opaque.length;this.dirty=true;
  }
  // Seconds; call before visibility/shadow selection. Camera motion never enters
  // this API. A cell-scale move or teleport refreshes immediately, even throttled.
  update(position,time,{force=false}={}){
    if(this.disposed)return false;
    const {x,z}=position;
    if(!Number.isFinite(x)||!Number.isFinite(z)||!Number.isFinite(time))throw new TypeError('Finite player XZ and time required');
    const distance=Math.hypot(x-this.x,z-this.z),backwards=time<this.lastTime;
    if(this.ready&&!force&&!this.dirty&&!backwards&&this.stateAt(x,z)===CAVE_FOG_VISIBLE&&distance<this.cellSize*.75&&
      (time-this.lastTime<this.interval||distance<this.minMove))return false;
    this.x=x;this.z=z;this.lastTime=time;this.dirty=false;this.ready=true;this.visible.fill(0);this.stats.raySteps=0;
    const ox=(x-this.minX)/this.cellSize,oz=(z-this.minZ)/this.cellSize,cx=Math.floor(ox),cz=Math.floor(oz);
    if(cx>=0&&cz>=0&&cx<this.cols&&cz<this.rows){
      const r=this.radius/this.cellSize,r2=r*r;
      const x0=Math.max(0,Math.floor(ox-r)),x1=Math.min(this.cols-1,Math.floor(ox+r));
      const z0=Math.max(0,Math.floor(oz-r)),z1=Math.min(this.rows-1,Math.floor(oz+r));
      for(let tz=z0;tz<=z1;tz++)for(let tx=x0;tx<=x1;tx++){
        const dx=tx+.5-ox,dz=tz+.5-oz;
        if(dx*dx+dz*dz<=r2&&this.lineVisible(ox,oz,cx,cz,tx,tz))this.visible[tz*this.cols+tx]=1;
      }
      // Never hide the player cell even if its centre lies inside a nearby wall.
      this.visible[cz*this.cols+cx]=1;
    }
    this.sums.fill(0);let count=0;
    for(let row=0;row<this.rows;row++){
      let rowSum=0;
      for(let col=0;col<this.cols;col++){
        const i=row*this.cols+col,v=this.visible[i];rowSum+=v;count+=v;
        if(v&&!this.explored[i]){this.explored[i]=1;this.stats.exploredCells++;}
        this.rgba[i*4]=v?255:0;this.rgba[i*4+1]=this.explored[i]?255:0;
        this.sums[(row+1)*(this.cols+1)+col+1]=this.sums[row*(this.cols+1)+col+1]+rowSum;
      }
    }
    this.stats.visibleCells=count;this.stats.updates++;this.revision++;return true;
  }
  blocked(x,z){return x<0||z<0||x>=this.cols||z>=this.rows||!!this.opaque[z*this.cols+x];}
  // Supercover DDA: a wall cell itself is lit, cells behind it are not. At an
  // exact diagonal seam either occupied side seals the corner (no light leaks).
  lineVisible(ox,oz,cx,cz,tx,tz){
    if(cx===tx&&cz===tz)return true;
    const dx=tx+.5-ox,dz=tz+.5-oz,sx=Math.sign(dx),sz=Math.sign(dz);
    const stepX=dx?Math.abs(1/dx):Infinity,stepZ=dz?Math.abs(1/dz):Infinity;
    let nextX=dx?(sx>0?cx+1-ox:ox-cx)*stepX:Infinity;
    let nextZ=dz?(sz>0?cz+1-oz:oz-cz)*stepZ:Infinity;
    let x=cx,z=cz;
    const maxSteps=Math.abs(tx-cx)+Math.abs(tz-cz)+2;
    for(let n=0;n<maxSteps;n++){
      this.stats.raySteps++;
      if(Math.abs(nextX-nextZ)<1e-10){
        if(this.blocked(x+sx,z)||this.blocked(x,z+sz))return false;
        x+=sx;z+=sz;nextX+=stepX;nextZ+=stepZ;
      }else if(nextX<nextZ){x+=sx;nextX+=stepX;}else{z+=sz;nextZ+=stepZ;}
      if(x===tx&&z===tz)return true;
      if(this.blocked(x,z))return false;
    }
    return false;
  }
  stateAt(x,z){
    const col=Math.floor((x-this.minX)/this.cellSize),row=Math.floor((z-this.minZ)/this.cellSize);
    if(!Number.isFinite(col)||!Number.isFinite(row)||col<0||row<0||col>=this.cols||row>=this.rows)return CAVE_FOG_UNSEEN;
    const i=row*this.cols+col;return this.visible[i]?CAVE_FOG_VISIBLE:this.explored[i]?CAVE_FOG_EXPLORED:CAVE_FOG_UNSEEN;
  }
  // Use complete immutable placement bounds, never centre distance. A partially
  // visible wall/large tree keeps every existing LOD and its shadow/ink source.
  boundsVisible(min,max,padding=this.cellSize){
    if(!this.ready)return true; // Caller initializes before the loading veil lifts.
    if(![min?.x,min?.z,max?.x,max?.z,padding].every(Number.isFinite)||min.x>max.x||min.z>max.z)return true;
    padding=Math.max(0,padding);
    const x0=Math.max(0,Math.floor((min.x-padding-this.minX)/this.cellSize)),z0=Math.max(0,Math.floor((min.z-padding-this.minZ)/this.cellSize));
    const x1=Math.min(this.cols-1,Math.floor((max.x+padding-this.minX)/this.cellSize)),z1=Math.min(this.rows-1,Math.floor((max.z+padding-this.minZ)/this.cellSize));
    if(x1<x0||z1<z0)return false;
    const stride=this.cols+1,s=this.sums;
    return s[(z1+1)*stride+x1+1]-s[z0*stride+x1+1]-s[(z1+1)*stride+x0]+s[z0*stride+x0]>0;
  }
  snapshot(){
    const runs=[];
    for(let i=0;i<this.explored.length;i++)if(this.explored[i]){const start=i;while(i+1<this.explored.length&&this.explored[i+1])i++;runs.push(start,i-start+1);}
    return {version:1,mapKey:this.mapKey,signature:this.signature,runs};
  }
  restore(saved){
    if(saved?.version!==1||saved.mapKey!==this.mapKey||saved.signature!==this.signature||!Array.isArray(saved.runs)||saved.runs.length%2)return false;
    let end=0;
    for(let i=0;i<saved.runs.length;i+=2){const start=saved.runs[i],length=saved.runs[i+1];
      if(!Number.isInteger(start)||!Number.isInteger(length)||start<end||length<1||start+length>this.explored.length)return false;end=start+length;
    }
    for(let i=0;i<saved.runs.length;i+=2)this.explored.fill(1,saved.runs[i],saved.runs[i]+saved.runs[i+1]);
    this.stats.exploredCells=this.explored.reduce((n,v)=>n+Number(!!v),0);this.dirty=true;return true;
  }
  dispose(){this.disposed=true;this.isOpaque=null;}
}

// This gate must win over frustum, hardware occlusion and shadow fade decisions.
export const caveFogAllowsRecord=(fog,record)=>!fog||fog.boundsVisible(record.min??record.bounds?.min,record.max??record.bounds?.max);
export const caveFogRootEnabled=record=>record.fogVisible!==false&&((record.cellActive!==false&&!record.occluded)||!!record.shadowCaster);
