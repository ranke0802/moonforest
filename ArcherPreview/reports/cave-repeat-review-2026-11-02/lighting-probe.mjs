import {mkdirSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {NullEngine,Scene,FreeCamera,Vector3} from '@babylonjs/core';
import {CaveFogRuntime} from '../../src/cave-fog-runtime.js';
import {cavePlayerFillFactor} from '../../src/cave-player-fill.js';
import {caveFogFallback} from '../../src/cave-fog-binding.js';

// CPU emulation of the ACTUAL uploaded RawTexture's normalized bilinear lookup.
// No synthetic visibility value is fed into the lighting helper.
export function bilinearFogTexture(fog,point){
 const {cols,rows,minX,minZ,cellSize,rgba}=fog;
 const u=(point.x-minX)/(cols*cellSize),v=(point.z-minZ)/(rows*cellSize);
 if(u<0||v<0||u>1||v>1)return [0,0,0,0];
 const gx=Math.max(0,Math.min(cols-1,u*cols-.5)),gz=Math.max(0,Math.min(rows-1,v*rows-.5));
 const x=Math.floor(gx),z=Math.floor(gz),xx=Math.min(cols-1,x+1),zz=Math.min(rows-1,z+1),fx=gx-x,fz=gz-z;
 return [0,1,2,3].map(c=>{const a=rgba[(z*cols+x)*4+c],b=rgba[(z*cols+xx)*4+c],d=rgba[(zz*cols+x)*4+c],e=rgba[(zz*cols+xx)*4+c];return ((a+(b-a)*fx)*(1-fz)+(d+(e-d)*fx)*fz)/255;});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const engine=new NullEngine(),scene=new Scene(engine),camera=new FreeCamera('probe-camera',new Vector3(-1.5,2,3),scene),world={scene,camera,terrain:{heightAt:()=>0}};
 const fog=new CaveFogRuntime(world,{isOpaque:x=>x>=.4&&x<=.505});world.caveFog=fog;
 caveFogFallback(scene).getInternalTexture().isReady=true;fog.texture.getInternalTexture().isReady=true;
 const uploads=[];const update=fog.texture.update.bind(fog.texture);fog.texture.update=data=>{uploads.push(data);return update(data);};
 fog.update({x:-1.5,y:0,z:.5},0,{force:true});
 const samples=[-.5,.4,.5,.506,.52,.55,.58,.75,1.5].map(x=>{
  const p={x,y:1.05,z:.5},rgba=bilinearFogTexture(fog.fog,p),fill=cavePlayerFillFactor(p,fog.playerView,rgba[2]);
  return {position:p,analyticWallBehind:x>.505,rgba,fill,legacyRFill:cavePlayerFillFactor(p,fog.playerView,rgba[0]),staticFactor:[.14,.16,.20],combinedFactor:fill.map((v,i)=>Math.max(v,[.14,.16,.20][i]))};
 });
 const report={scope:'Actual production CaveFogRuntime/RawTexture data and exact normalized bilinear sampling; CPU lighting math, no GPU pixels.',wall:{nearX:.4,farX:.505,sampledOpaqueCell:{minX:0,maxX:1}},
  texture:{size:fog.texture.getSize(),samplingMode:fog.texture.samplingMode,gammaSpace:fog.texture.gammaSpace,noMipmap:fog.texture.noMipmap,uploadSameByteArray:uploads[0]===fog.fog.rgba},samples,
  finding:'Legacy R retains the reproduced first-wall fringe. Current B is0inside/behind the represented opaque cell and only moving lantern uses B; R/G/staticcolour stay unchanged.',
  tradeoff:'First opaque cells receive reduced/no moving lantern contribution. This preserves their static illumination but is not exact mesh-shadow proof for geometry omitted by the1m opacity field.',
  productionModified:true,physicalGpuOrTemperatureMeasured:false,sourceSHA256:Object.fromEntries(['cave-fog-of-war','cave-fog-cover','cave-player-fill','cave-painted-light-runtime'].map(name=>[name,createHash('sha256').update(readFileSync(new URL('../../src/'+name+'.js',import.meta.url))).digest('hex')]))};
 mkdirSync(new URL('./',import.meta.url),{recursive:true});writeFileSync(new URL('lighting-boundary-after.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify({path:'lighting-boundary-after.json',reproducedOldRFill:samples.find(s=>s.position.x===.506).legacyRFill,currentBFill:samples.find(s=>s.position.x===.506).fill},null,2));engine.dispose();
}
