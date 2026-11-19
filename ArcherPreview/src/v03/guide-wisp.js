// The guide light: one small additive billboard and one bounded particle
// system (light dust). Two draw calls, no shadow, no lighting, no picking.
import {ParticleSystem} from '@babylonjs/core/Particles/particleSystem.js';
import {DynamicTexture} from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial.js';
import {MeshBuilder} from '@babylonjs/core/Meshes/meshBuilder.js';
import {Color3,Color4} from '@babylonjs/core/Maths/math.color.js';
import {Vector3} from '@babylonjs/core/Maths/math.vector.js';
import {Constants} from '@babylonjs/core/Engines/constants.js';

function glowTexture(scene){
 const size=64,texture=new DynamicTexture('v03-guide-glow',{width:size,height:size},scene,false),ctx=texture.getContext();
 const gradient=ctx.createRadialGradient(size/2,size/2,0,size/2,size/2,size/2);
 gradient.addColorStop(0,'rgba(255,255,255,1)');gradient.addColorStop(.22,'rgba(214,240,255,.85)');gradient.addColorStop(.55,'rgba(150,205,255,.28)');gradient.addColorStop(1,'rgba(120,185,255,0)');
 ctx.clearRect(0,0,size,size);ctx.fillStyle=gradient;ctx.fillRect(0,0,size,size);texture.update(false);texture.hasAlpha=true;return texture;
}
export function createGuideWisp(scene){
 const texture=glowTexture(scene);
 const material=new StandardMaterial('v03-guide-core',scene);
 material.disableLighting=true;material.emissiveTexture=texture;material.opacityTexture=texture;material.emissiveColor=new Color3(.82,.93,1);material.diffuseColor=Color3.Black();material.specularColor=Color3.Black();
 material.alphaMode=Constants.ALPHA_ADD;material.backFaceCulling=false;material.fogEnabled=false;material.disableDepthWrite=true;
 const core=MeshBuilder.CreatePlane('v03-guide-core',{size:1},scene);
 core.material=material;core.billboardMode=7;core.isPickable=false;core.doNotSyncBoundingInfo=true;core.alwaysSelectAsActiveMesh=true;core.setEnabled(false);core.metadata={moonforestGuide:true};
 const emitter=new Vector3(0,-1000,0);
 const dust=new ParticleSystem('v03-guide-dust',180,scene);
 dust.particleTexture=texture;dust.emitter=emitter;dust.blendMode=ParticleSystem.BLENDMODE_ADD;
 dust.minEmitBox=new Vector3(-.07,-.07,-.07);dust.maxEmitBox=new Vector3(.07,.07,.07);
 dust.color1=new Color4(.86,.95,1,1);dust.color2=new Color4(.62,.82,1,.9);dust.colorDead=new Color4(.45,.68,1,0);
 dust.minSize=.045;dust.maxSize=.16;dust.minLifeTime=.6;dust.maxLifeTime=1.7;
 dust.direction1=new Vector3(-.4,.45,-.4);dust.direction2=new Vector3(.4,.1,.4);dust.minEmitPower=.12;dust.maxEmitPower=.55;
 dust.gravity=new Vector3(0,-.5,0);dust.minAngularSpeed=-2;dust.maxAngularSpeed=2;dust.emitRate=0;dust.updateSpeed=.016;
 let shown=false,dustRunning=false,stopTimer=null;
 return {
  show(x,y,z,time=0,moving=false){
   emitter.set(x,y,z);core.position.set(x,y,z);
   // Sized to read at the default follow-camera distance (about 17 m).
   const pulse=.46+Math.sin(time*5.1)*.05+Math.sin(time*8.3)*.02;core.scaling.setAll(pulse);
   const rate=moving?90:44;if(dust.emitRate!==rate)dust.emitRate=rate;
   if(stopTimer){clearTimeout(stopTimer);stopTimer=null;}
   if(!dustRunning){dustRunning=true;dust.start();}
   if(!shown){shown=true;core.setEnabled(true);}
  },
  // Stops emitting; dust already in the air fades on its own.
  // Once the airborne dust has faded the system stops updating altogether.
  hide(){if(!shown)return;shown=false;core.setEnabled(false);dust.emitRate=0;stopTimer=setTimeout(()=>{stopTimer=null;if(!shown&&dustRunning){dustRunning=false;dust.stop();}},2000);},
  get visible(){return shown;},
  // Builds the two shaders (core, dust) ahead of first use. They used to be
  // created in the frame the first fight ended: 25-106 ms frames on a phone
  // at the wolf's defeat (performance records, 2026-11-20).
  warm(){try{void material.forceCompilationAsync(core).catch(()=>{});dust.isReady();}catch{/* compiled on first use instead */}},
  dispose(){if(stopTimer)clearTimeout(stopTimer);dust.dispose(false);core.dispose(false,false);material.dispose(false,false);texture.dispose();},
 };
}
