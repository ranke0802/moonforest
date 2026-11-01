import {CAVE_PLACEMENTS,CAVE_BOSS} from './witch-cave-layout.js';
import {caveRockOccludes} from './witch-cave-sight.js';

export const CAVE_PAINT_LIGHT_CONFIG=Object.freeze({version:2,width:128,height:128,rect:Object.freeze([-72,-72,144,144]),floorMin:-8,floorMax:24,heightStart:1.25,heightEnd:8,heightMinimum:.24,losStep:.25,losRadius:.14,bilinearGuardRadius:1.265,endSurfaceMargin:.8});
export const CAVE_PAINT_LIGHT_POLICY=Object.freeze({base:Object.freeze([.14,.16,.20]),arena:Object.freeze([.28,.30,.34]),arenaRadius:CAVE_BOSS.r,arenaFadeRadius:CAVE_BOSS.r+4,lanternRadius:7.5,lanternColor:Object.freeze([1,.76,.44]),collectorRadius:6.5,collectorColor:Object.freeze([.48,.34,.70])});
const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,value));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
const floorAt=(terrain,x,z)=>{const y=terrain.heightAt(x,z);if(!Number.isFinite(y))throw new RangeError('Invalid cave paint floor');return y;};

export function cavePaintEmitters(terrain,{placements=CAVE_PLACEMENTS,includeSoulCollectors=true}={}){
  const emitters=[];
  for(const placement of placements){
    const lantern=placement.asset?.includes('votive-lantern'),collector=includeSoulCollectors&&placement.asset?.includes('soul-collector-arm');
    if(!lantern&&!collector)continue; // A workbench has no verified flame.
    const scale=placement.scale??1,yaw=placement.yaw??0,offset=collector ? .774 : 0;
    emitters.push(Object.freeze({id:placement.id,asset:placement.asset,kind:lantern?'lantern':'collector',x:placement.x+Math.cos(yaw)*offset*scale,y:(placement.elevation??floorAt(terrain,placement.x,placement.z))+(lantern ? .8 : 2.784)*scale,z:placement.z-Math.sin(yaw)*offset*scale,radius:lantern?CAVE_PAINT_LIGHT_POLICY.lanternRadius:CAVE_PAINT_LIGHT_POLICY.collectorRadius,color:lantern?CAVE_PAINT_LIGHT_POLICY.lanternColor:CAVE_PAINT_LIGHT_POLICY.collectorColor}));
  }
  return Object.freeze(emitters);
}

function clearRay(terrain,emitter,x,targetY,z,occludes,stats){
  const dx=x-emitter.x,dz=z-emitter.z,distance=Math.hypot(dx,dz),length=Math.hypot(dx,targetY-emitter.y,dz),steps=Math.max(1,Math.ceil(distance/CAVE_PAINT_LIGHT_CONFIG.losStep));
  for(let i=1;i<steps;i++){
    const t=i/steps;
    // A coarse texel can end inside the first wall's visible surface. Permit
    // only the final .8m of the 3D ray; an earlier intervening wall still wins.
    if(length*(1-t)<=stats.endSurfaceMargin){stats.endSurfaceSamples+=steps-i;break;}
    const xx=emitter.x+dx*t,zz=emitter.z+dz*t,yy=emitter.y+(targetY-emitter.y)*t;stats.raySamples++;
    // The radius covers the gaps between .25m samples, including thin baked
    // wall cells. This reuses existing sight data; no navigation grid is built.
    if(occludes(xx,zz,CAVE_PAINT_LIGHT_CONFIG.losRadius)||floorAt(terrain,xx,zz)>yy+.12){stats.blockedRays++;return false;}
  }
  return true;
}

/** Static, deterministic CPU data only. RGB is a linear illumination factor,
 * A is a packed floor height. The returned byte array is read-only by contract.
 * No scene, texture, light, observer, upload or per-frame work is created. */
export function buildCavePaintLight(terrain,{placements=CAVE_PLACEMENTS,includeSoulCollectors=true,occludes=caveRockOccludes,bilinearWallGuard=false,endSurfaceMargin=CAVE_PAINT_LIGHT_CONFIG.endSurfaceMargin}={}){
  if(typeof terrain?.heightAt!=='function'||typeof occludes!=='function')throw new TypeError('Cave paint terrain/occlusion required');
  if(!Number.isFinite(endSurfaceMargin)||endSurfaceMargin<0||endSurfaceMargin>CAVE_PAINT_LIGHT_CONFIG.endSurfaceMargin)throw new RangeError('Invalid cave paint end surface margin');
  const config=CAVE_PAINT_LIGHT_CONFIG,policy=CAVE_PAINT_LIGHT_POLICY,{width,height,rect}=config,data=new Uint8Array(width*height*4),emitters=cavePaintEmitters(terrain,{placements,includeSoulCollectors});
  const stats={version:config.version,bytes:data.byteLength,emitters:emitters.length,lanterns:emitters.filter(e=>e.kind==='lantern').length,collectors:emitters.filter(e=>e.kind==='collector').length,raySamples:0,blockedRays:0,endSurfaceMargin,endSurfaceSamples:0,bilinearGuardPixels:0,bilinearWallGuard:Boolean(bilinearWallGuard),interpolationLimitMeters:rect[2]/width,combinedSurfaceFringeLimitMeters:rect[2]/width+endSurfaceMargin,litPixels:0,clampedHeightPixels:0,additionalLights:0,additionalShadowPasses:0,frameUpdates:0};
  for(let row=0;row<height;row++)for(let col=0;col<width;col++){
    const x=rect[0]+(col+.5)*rect[2]/width,z=rect[1]+(row+.5)*rect[3]/height,floor=floorAt(terrain,x,z),i=(row*width+col)*4;
    const arena=1-smooth(policy.arenaRadius,policy.arenaFadeRadius,Math.hypot(x-CAVE_BOSS.x,z-CAVE_BOSS.z));
    let r=policy.base[0]+(policy.arena[0]-policy.base[0])*arena,g=policy.base[1]+(policy.arena[1]-policy.base[1])*arena,b=policy.base[2]+(policy.arena[2]-policy.base[2])*arena,lit=false;
    let guarded;
    for(const emitter of emitters){
      const d=Math.hypot(x-emitter.x,z-emitter.z,floor+.65-emitter.y);if(d>=emitter.radius)continue;
      // Optional conservative experiment only. Default stays off: a one-texel
      // interpolation fringe is preferable to blackening actual lamp walls.
      guarded??=bilinearWallGuard&&occludes(x,z,config.bilinearGuardRadius);if(guarded)continue;
      if(!clearRay(terrain,emitter,x,floor+.65,z,occludes,stats))continue;
      const strength=1-smooth(0,emitter.radius,d);
      r=Math.max(r,r+(emitter.color[0]-r)*strength);g=Math.max(g,g+(emitter.color[1]-g)*strength);b=Math.max(b,b+(emitter.color[2]-b)*strength);lit=true;
    }
    data[i]=Math.round(clamp(r)*255);data[i+1]=Math.round(clamp(g)*255);data[i+2]=Math.round(clamp(b)*255);data[i+3]=Math.round(clamp((floor-config.floorMin)/(config.floorMax-config.floorMin))*255);
    if(guarded)stats.bilinearGuardPixels++;if(lit)stats.litPixels++;if(floor<config.floorMin||floor>config.floorMax)stats.clampedHeightPixels++;
  }
  return Object.freeze({data,width,height,rect,emitters,stats:Object.freeze(stats),floorMin:config.floorMin,floorMax:config.floorMax});
}

/** Matches bilinear texture2D(map,(worldXZ-rect.xy)/rect.zw), no sRGB decode.
 * rgb includes vertical attenuation; rawRGB is the original floor-level factor. */
export function sampleCavePaintLight(map,x,y,z){
  const {width,height,rect,data}=map,gx=clamp((x-rect[0])/rect[2]*width-.5,0,width-1),gz=clamp((z-rect[1])/rect[3]*height-.5,0,height-1),x0=Math.floor(gx),z0=Math.floor(gz),x1=Math.min(width-1,x0+1),z1=Math.min(height-1,z0+1),u=gx-x0,v=gz-z0;
  const read=channel=>{const a=data[(z0*width+x0)*4+channel],b=data[(z0*width+x1)*4+channel],c=data[(z1*width+x0)*4+channel],d=data[(z1*width+x1)*4+channel];return ((a+(b-a)*u)*(1-v)+(c+(d-c)*u)*v)/255;};
  const rawRGB=[read(0),read(1),read(2)],floorHeight=map.floorMin+read(3)*(map.floorMax-map.floorMin),config=CAVE_PAINT_LIGHT_CONFIG,heightFactor=1-(1-config.heightMinimum)*smooth(config.heightStart,config.heightEnd,Math.max(0,y-floorHeight));
  return {rgb:rawRGB.map(value=>value*heightFactor),rawRGB,floorHeight,heightFactor};
}

let cached=null,cacheKey=null,hits=0,serial=0;
const identities=new WeakMap();
const identity=value=>{if(!identities.has(value))identities.set(value,++serial);return identities.get(value);};
function terrainKey(terrain){
  if(!ArrayBuffer.isView(terrain.heights))return 'object:'+identity(terrain);
  let hash=2166136261;const bytes=new Uint8Array(terrain.heights.buffer,terrain.heights.byteOffset,terrain.heights.byteLength);
  for(const byte of bytes){hash^=byte;hash=Math.imul(hash,16777619);}
  return `${terrain.size}:${terrain.subdivisions}:${hash>>>0}:${identity(terrain.heightAt)}:${terrain.surfaceHeight?identity(terrain.surfaceHeight):0}`;
}
// One detached 64KiB CPU map, shared across scene lifetimes. It never owns a
// Babylon object, so a disposed scene cannot leave a cached texture reference.
export function getCavePaintLight(terrain,options={}){
  const emitters=cavePaintEmitters(terrain,options),occludes=options.occludes??caveRockOccludes,key=CAVE_PAINT_LIGHT_CONFIG.version+':'+terrainKey(terrain)+':'+identity(occludes)+':'+Boolean(options.bilinearWallGuard)+':'+(options.endSurfaceMargin??CAVE_PAINT_LIGHT_CONFIG.endSurfaceMargin)+':'+JSON.stringify(emitters);
  if(key===cacheKey&&cached){hits++;return cached;}
  cached=buildCavePaintLight(terrain,options);cacheKey=key;return cached;
}
export function clearCavePaintLightCache(){cached=null;cacheKey=null;hits=0;}
export function inspectCavePaintLightCache(){return {maps:cached?1:0,bytes:cached?.data.byteLength??0,hits,sceneObjects:0};}
