import {NullEngine,Scene,FreeCamera,Vector3,MeshBuilder,StandardMaterial} from '@babylonjs/core';
import {writeFileSync} from 'node:fs';
import {CaveFogRuntime} from '../../src/cave-fog-runtime.js';
import {attachCharacterOutlines} from '../../src/character-outlines.js';
import {currentFrameReadiness} from '../../src/scene-ready.js';
const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;
const camera=new FreeCamera('arrival',new Vector3(-5,3,8),scene);camera.setTarget(new Vector3(-5,0,0));
const world={scene,camera,terrain:{heightAt:()=>0},ground:null,cave:true,touchDevice:true};
const source=MeshBuilder.CreateBox('Bunnyguard_Shield',{},scene);source.position.x=-5;source.material=new StandardMaterial('source',scene);source.material.disableLighting=true;
const shells=attachCharacterOutlines({meshes:[source]},'warrior'),shell=shells[0];
const fog=new CaveFogRuntime(world,{isOpaque:()=>false});fog.update({x:-5,y:0,z:0},0,{force:true});
for(const texture of scene.textures)if(texture.getInternalTexture())texture.getInternalTexture().isReady=true;
for(let i=0;i<4;i++){scene.render();await new Promise(r=>setTimeout(r,1));}
const before={boundActualCaveMask:shell.material._textures.caveFogMap===fog.texture,ready:currentFrameReadiness(scene).ready};
const old=fog.texture;fog.dispose();world.cave=false;
// NullEngine does not upload RawTexture; mark only live test allocations ready.
for(const texture of scene.textures)if(texture.getInternalTexture())texture.getInternalTexture().isReady=true;
const probes=[];for(let i=0;i<4;i++){scene.render();const state=currentFrameReadiness(scene);probes.push({ready:state.ready,blockers:state.blockers,retainsDisposedMask:shell.material._textures.caveFogMap===old});await new Promise(r=>setTimeout(r,1));}
const result={before,after:probes,limitation:'Actual Babylon material/readiness/render callbacks, NullEngine instead of browser GPU. No manual sampler rebind after disposal.'};
if(process.argv[2])writeFileSync(new URL(process.argv[2],import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));scene.dispose();engine.dispose();
