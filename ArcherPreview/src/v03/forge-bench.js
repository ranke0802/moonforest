// The smith's bench in first person (2026-11-27, user review: "put the real model of
// the piece on the anvil, hold it with the left hand and strike with the hammer in
// the right"). A few meshes drawn into the paused game's framebuffer with the game's
// own scene and camera (the same way as the character portrait), by the temper
// view's one animation frame; the world is not drawn and the camera is not moved.
//
// Lifetime: created when the smith's bench view opens, disposed when it closes
// (town-shop.js); it holds only its own meshes and shares the worn piece's geometry
// and material. Cost: anvil, left hand, hammer arm, piece (+ its ink shell), heat
// glow, and, for a moment after a strike, the anvil flash and one spark batch.
import {Color3,Color4} from '@babylonjs/core/Maths/math.color.js';
import {Matrix,Quaternion,Vector3} from '@babylonjs/core/Maths/math.vector.js';
import {Mesh} from '@babylonjs/core/Meshes/mesh.js';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode.js';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial.js';
import {ObjectRenderer} from '@babylonjs/core/Rendering/objectRenderer.js';
import {SolidParticleSystem} from '@babylonjs/core/Particles/solidParticleSystem.js';
import {CreateBox} from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import {CreateDisc} from '@babylonjs/core/Meshes/Builders/discBuilder.js';
import {createPropVisual} from './placeholder-actor.js';

// Not in any camera's default mask: the main render never draws these.
export const FORGE_LAYER=0x10000000;
// look: degrees below the horizon; half: the half extent (m) that must fit the view.
export const FORGE_VIEW=Object.freeze({look:50,halfX:.6,halfY:.38,distance:6,
 length:Object.freeze({sword:.64,shield:.42,armor:.46}),
 // Hammer: elbow direction from the strike point, raised and struck angles (radians).
 elbow:Object.freeze([.74,.2,-.5]),rest:.4,strikeMs:85,holdMs:70,liftMs:380});
// Per grade: sparks, flash strength, shake (px), colour of the flash and the heat.
export const FORGE_FX=Object.freeze({
 Perfect:Object.freeze({sparks:64,flash:1,shake:7,color:'#ffd54a',spark:'#ffe066'}),
 Success:Object.freeze({sparks:34,flash:.75,shake:5,color:'#62d85c',spark:'#ffd27a'}),
 'Near miss':Object.freeze({sparks:12,flash:.45,shake:3,color:'#b9b9b9',spark:'#e7a15c'}),
 Failed:Object.freeze({sparks:5,flash:.35,shake:9,color:'#5a2a22',spark:'#a0503a'}),
});
const HEAT='#ff7a2a',SPARKS=72,GRAVITY=-4.2,BACKGROUND=new Color4(.07,.045,.03,1);
const ARM_REACH=Math.hypot(.765,.11);// elbow to the hammer face (placeholder-actor 'forge-hammer')
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
// Parsed once: a strike reads these without allocating.
const COLORS=new Map();
function fxColor(hex,into){let c=COLORS.get(hex);if(!c){c=Color3.FromHexString(hex);COLORS.set(hex,c);}return into.copyFrom(c);}

// Which axes of a piece's own bounding box are its length, width and thickness, and
// which end of the length is the grip. positions (optional): the piece's vertex
// positions. Along the length, the widest slice is the guard of a blade (inside the
// piece, nearer the grip) or the head of a club or cleaver (at the far end); without
// positions, the end nearer the model's origin (where a worn piece meets the hand).
export function pieceAxes(min,max,positions=null){
 const extent=[max.x-min.x,max.y-min.y,max.z-min.z],order=[0,1,2].sort((a,b)=>extent[b]-extent[a]);
 const lo=[min.x,min.y,min.z],hi=[max.x,max.y,max.z],L=order[0],W=order[1];
 let gripLow=Math.abs(lo[L])<=Math.abs(hi[L]);
 if(positions?.length>=9&&extent[L]>0){
  const slices=16,widest=new Float32Array(slices),mid=(lo[W]+hi[W])/2;
  for(let i=0;i<positions.length;i+=3){
   const k=Math.min(slices-1,Math.floor((positions[i+L]-lo[L])/extent[L]*slices)),w=Math.abs(positions[i+W]-mid);
   if(w>widest[k])widest[k]=w;
  }
  let g=0;for(let k=1;k<slices;k++)if(widest[k]>widest[g])g=k;
  const nearLow=g<slices-1-g,atEnd=Math.min(g,slices-1-g)<=1;
  gripLow=atEnd?!nearLow:nearLow;
 }
 return {length:L,width:W,thin:order[2],extent,gripLow};
}

function additive(scene,name){
 const m=new StandardMaterial(name,scene);m.disableLighting=true;m.diffuseColor=Color3.Black();m.specularColor=Color3.Black();
 m.emissiveColor=Color3.FromHexString(HEAT);m.alphaMode=1;m.alpha=.999;m.disableDepthWrite=true;m.backFaceCulling=false;m.zOffset=-2;
 return m;
}

// scene, camera: the game's. canvas: its canvas. piece: {mesh} the worn mesh to copy, or null.
// slot: 'sword' | 'shield' | 'armor'. reduced: () => reduced motion.
export function createForgeBench({scene,camera,canvas,piece=null,slot='sword',reduced=()=>false,random=Math.random}){
 if(!scene||!camera||!canvas||scene.isDisposed)throw new Error('forge bench: no scene');
 const engine=scene.getEngine(),meshes=[],nodes=[],owned=[];
 const root=new TransformNode('v03-forge-bench',scene);root.rotationQuaternion=new Quaternion();nodes.push(root);
 const keep=mesh=>{mesh.layerMask=FORGE_LAYER;mesh.isPickable=false;mesh.alwaysSelectAsActiveMesh=true;mesh.receiveShadows=false;meshes.push(mesh);return mesh;};
 const own=visual=>{owned.push(visual);return keep(visual.mesh);};
 // Anvil.
 const anvil=own(createPropVisual(scene,'forge-anvil'));anvil.parent=root;
 // The piece: a copy of the worn surface and its ink shell, or a stand-in block.
 const holder=new TransformNode('v03-forge-piece',scene);holder.parent=root;nodes.push(holder);
 let surface,ink=null;
 if(piece?.mesh?.geometry){
  const source=piece.mesh;surface=keep(new Mesh('v03-forge-piece-surface',scene));
  // Character materials read the drawn mesh's style metadata in their bind hooks (outline width, paint):
  // a copy without it threw there and dropped the bench to 2D (2026-11-27 browser playtest).
  source.geometry.applyToMesh(surface);surface.material=source.material;surface.sideOrientation=source.sideOrientation;surface.metadata={...source.metadata};
  const inkSource=source.getChildMeshes?.(true).find(m=>m.metadata?.moonforestOutline&&m.geometry);
  if(inkSource){ink=keep(new Mesh('v03-forge-piece-ink',scene));inkSource.geometry.applyToMesh(ink);ink.material=inkSource.material;ink.sideOrientation=inkSource.sideOrientation;ink.metadata={...inkSource.metadata};ink.parent=surface;}
 }else surface=own(createPropVisual(scene,slot==='shield'?'forge-shield':slot==='armor'?'forge-armor':'forge-blade'));
 surface.parent=holder;
 // Lay it flat: length along +x (grip to the left hand), thickness up, centred on the face.
 surface.refreshBoundingInfo?.();
 const box=surface.getBoundingInfo().boundingBox,axes=pieceAxes(box.minimum,box.maximum,surface.getVerticesData('position'));
 const size=FORGE_VIEW.length[slot]??FORGE_VIEW.length.sword,scale=size/(axes.extent[axes.length]||1);
 const world=[new Vector3(),new Vector3(),new Vector3()];
 world[axes.length].set(axes.gripLow?1:-1,0,0);world[axes.width].set(0,0,1);world[axes.thin].set(0,1,0);
 if(Vector3.Dot(world[0],Vector3.Cross(world[1],world[2]))<0)world[axes.width].scaleInPlace(-1);
 surface.rotationQuaternion=Quaternion.RotationQuaternionFromAxis(world[0],world[1],world[2]);
 surface.scaling.setAll(scale);
 const centre=box.center.scale(scale),turned=new Vector3();
 Vector3.TransformCoordinatesToRef(centre,Matrix.FromQuaternionToRef(surface.rotationQuaternion,new Matrix()),turned);
 const top=axes.extent[axes.thin]*scale;
 surface.position.set(-turned.x,top/2-turned.y,-turned.z);
 // Heat glow: the same surface again, additive, tinted (warm, then the grade's colour).
 const heatMaterial=additive(scene,'v03-forge-heat'),heat=keep(new Mesh('v03-forge-heat',scene));
 surface.geometry.applyToMesh(heat);heat.useVertexColors=false;heat.material=heatMaterial;heat.parent=surface;heat.visibility=.18;
 // Left hand on the grip end; the forearm comes from the lower left.
 const left=own(createPropVisual(scene,'forge-hand-left'));left.parent=root;
 left.position.set(-size/2+.075,top-.012,.005);left.rotation.set(-.3,.55,0);left.scaling.setAll(.82);
 // Hammer arm: elbow off the lower right, swung about the elbow in a vertical plane.
 const strike=new Vector3(.03,top,0),elbow=new Vector3(...FORGE_VIEW.elbow).normalize().scaleInPlace(ARM_REACH).addInPlace(strike);
 const aim=new TransformNode('v03-forge-arm',scene),swing=new TransformNode('v03-forge-swing',scene);
 aim.parent=root;swing.parent=aim;nodes.push(aim,swing);aim.position.copyFrom(elbow);
 {
  const u=new Vector3(-.765,-.11,0).normalize(),z=new Vector3(0,0,1),v=Vector3.Cross(z,u);
  const w=strike.subtract(elbow).normalize(),zw=Vector3.Cross(w,Vector3.Up()).normalize(),vw=Vector3.Cross(zw,w);
  aim.rotationQuaternion=Quaternion.RotationQuaternionFromAxis(w,vw,zw).multiply(Quaternion.RotationQuaternionFromAxis(u,v,z).conjugate());
 }
 const arm=own(createPropVisual(scene,'forge-hammer'));arm.parent=swing;
 // Which way of the swing raises the head (checked, not assumed).
 swing.rotation.z=.2;root.computeWorldMatrix(true);aim.computeWorldMatrix(true);swing.computeWorldMatrix(true);
 const probe=Vector3.TransformCoordinates(new Vector3(-.765,0,0),swing.getWorldMatrix()).y;
 swing.rotation.z=0;swing.computeWorldMatrix(true);
 const raise=probe>Vector3.TransformCoordinates(new Vector3(-.765,0,0),swing.getWorldMatrix()).y?1:-1;
 // Anvil flash: a disc, white in the middle and black (nothing, additive) at the rim.
 const flashMaterial=additive(scene,'v03-forge-flash'),flash=keep(CreateDisc('v03-forge-flash',{radius:.24,tessellation:28},scene));
 {const n=flash.getTotalVertices(),colors=new Float32Array(n*4);for(let i=0;i<n;i++){const c=i===0?1:0;colors.set([c,c,c,1],i*4);}flash.setVerticesData('color',colors);}
 flash.material=flashMaterial;flash.parent=root;flash.position.set(strike.x,.004,0);flash.rotation.x=Math.PI/2;flash.isVisible=false;
 // Sparks: one batch of small bars, positions from the strike time (no per-spark objects).
 const sps=new SolidParticleSystem('v03-forge-sparks',scene,{updatable:true,isPickable:false});
 const bar=CreateBox('v03-forge-spark',{width:.024,height:.006,depth:.006},scene);sps.addShape(bar,SPARKS);bar.dispose();
 const sparks=keep(sps.buildMesh());sparks.parent=root;sparks.material=anvil.material;sparks.isVisible=false;
 sps.computeParticleTexture=false;sps.computeBoundingBox=false;
 const vx=new Float32Array(SPARKS),vy=new Float32Array(SPARKS),vz=new Float32Array(SPARKS),life=new Float32Array(SPARKS);
 const sparkColor=new Color3(),sparkTail=Color3.FromHexString('#ff5a1a');let sparkAge=0,sparkCount=0;
 sps.updateParticle=p=>{
  const i=p.idx,t=sparkAge;
  if(i>=sparkCount||t>=life[i]){p.scaling.setAll(0);return p;}
  const k=t/life[i];
  p.position.set(strike.x+vx[i]*t,strike.y+.01+vy[i]*t+.5*GRAVITY*t*t,vz[i]*t);
  p.scaling.set(.5+1.3*(1-k),1-.6*k,1-.6*k);
  Color3.LerpToRef(sparkColor,sparkTail,k,p.color);p.color.a=1;
  return p;
 };
 for(const node of nodes.slice(1))node.computeWorldMatrix(true);
 const renderer=new ObjectRenderer('v03-forge-bench',scene);
 renderer.renderParticles=false;renderer.renderSprites=false;renderer.renderList=meshes;renderer.activeCamera=camera;
 // View placement (set by layout): the rig's frame in the camera's view space.
 const inverse=new Matrix(),local=new Matrix(),placed=new Matrix(),tilt=new Quaternion(),offset=new Vector3(),spread=new Vector3();
 // The game scene is right-handed, so camera-forward is negative view Z.
 const forward=scene.useRightHandedSystem?-1:1;
 {const look=FORGE_VIEW.look*Math.PI/180,c=Math.cos(look),s=forward*Math.sin(look);
  Quaternion.RotationQuaternionFromAxisToRef(new Vector3(1,0,0),new Vector3(0,c,-s),new Vector3(0,s,c),tilt);}
 let fit=1,focusX=0,focusY=0,pixelHeight=1,laid=false,disposed=false;
 const heatColor=Color3.FromHexString(HEAT),gradeColor=new Color3(),glow=new Color3();
 let strikeAt=-1e9,grade=null,fx=null,impacted=false;
 const observer=scene.onDisposeObservable.addOnce(()=>api.dispose());
 // focus: where the strike point sits, in CSS pixels of the page; rect: the canvas's.
 function layout(focus,rect){
  if(disposed||!rect?.width||!rect?.height)return 0;
  const tan=Math.tan((camera.fov??.8)/2),aspect=rect.width/rect.height;
  const natural=Math.max(FORGE_VIEW.halfX/(tan*aspect),FORGE_VIEW.halfY/tan);
  fit=FORGE_VIEW.distance/natural;
  focusX=focus.x-rect.left-rect.width/2;focusY=rect.top+rect.height/2-focus.y;pixelHeight=rect.height;laid=true;
  // Pixels per metre at the strike point: the ring's size follows the piece.
  return rect.height/(2*natural*tan);
 }
 function place(shakeX,shakeY){
  const metres=2*FORGE_VIEW.distance*Math.tan((camera.fov??.8)/2)/pixelHeight;
  offset.set((focusX+shakeX)*metres,(focusY+shakeY)*metres,forward*FORGE_VIEW.distance);spread.setAll(fit);
  Matrix.ComposeToRef(spread,tilt,offset,local);
  camera.getViewMatrix().invertToRef(inverse);local.multiplyToRef(inverse,placed);
  placed.decompose(root.scaling,root.rotationQuaternion,root.position);
  for(const node of nodes)node.computeWorldMatrix(true);
  for(const mesh of meshes)mesh.computeWorldMatrix(true);
 }
 // The hammer's angle above the struck pose at this time.
 function hammerAngle(t){
  const since=t-strikeAt,rest=FORGE_VIEW.rest*(reduced()?1:1+.04*Math.sin(t/260));
  if(since<0||since>FORGE_VIEW.strikeMs+FORGE_VIEW.holdMs+FORGE_VIEW.liftMs)return grade&&since>=0?FORGE_VIEW.rest*.35:rest;
  if(since<FORGE_VIEW.strikeMs){const k=since/FORGE_VIEW.strikeMs;return FORGE_VIEW.rest*(1-k*k);}
  if(since<FORGE_VIEW.strikeMs+FORGE_VIEW.holdMs)return 0;
  const k=(since-FORGE_VIEW.strikeMs-FORGE_VIEW.holdMs)/FORGE_VIEW.liftMs;return FORGE_VIEW.rest*.35*(1-(1-k)*(1-k));
 }
 function impact(){
  const n=fx.sparks*(reduced()?.5:1)|0;sparkCount=n;fxColor(fx.spark,sparkColor);
  for(let i=0;i<n;i++){
   const turn=random()*Math.PI*2,up=.35+.6*random(),side=Math.sqrt(1-up*up),speed=(.7+1.3*random())*(.6+.4*fx.flash);
   vx[i]=Math.cos(turn)*side*speed*1.5;vy[i]=up*speed*1.3;vz[i]=Math.sin(turn)*side*speed;life[i]=.22+.4*random();
   const p=sps.particles[i];p.rotation.set(0,-Math.atan2(vz[i],vx[i]),Math.atan2(vy[i],Math.hypot(vx[i],vz[i])));
  }
  sparks.isVisible=n>0;
 }
 function animate(t){
  const since=t-strikeAt,hit=since>=FORGE_VIEW.strikeMs;
  swing.rotation.z=raise*hammerAngle(t);
  if(fx&&hit&&sparks.isVisible){sparkAge=(since-FORGE_VIEW.strikeMs)/1000;if(sparkAge>.75){sparks.isVisible=false;}else sps.setParticles();}
  const flashK=fx&&hit?Math.exp(-(since-FORGE_VIEW.strikeMs)/(reduced()?90:140)):0;
  flash.isVisible=flashK>.02;flash.visibility=flashK*(fx?.flash??0)*(reduced()?.5:1);
  // Heat: a warm idle glow; the grade's colour flashes on the blade and settles.
  const settle=fx&&hit?Math.exp(-(since-FORGE_VIEW.strikeMs)/600):0;
  Color3.LerpToRef(heatColor,gradeColor,fx?Math.min(1,settle*1.6+(grade?.5:0)):0,glow);heatMaterial.emissiveColor.copyFrom(glow);
  heat.visibility=clamp((reduced()?.16:.16+.05*Math.sin(t/330))+.75*settle*(fx?.flash??0),0,1);
  flashMaterial.emissiveColor.copyFrom(gradeColor);
  let sx=0,sy=0;
  if(fx&&hit&&!reduced()){const s=(since-FORGE_VIEW.strikeMs)/180;if(s<1){const a=fx.shake*(1-s);sx=Math.sin(since*.09)*a;sy=Math.cos(since*.13)*a*.6;}}
  place(sx,sy);
 }
 const api={
  get meshes(){return meshes;},get placeholders(){return owned.filter(v=>v.placeholder).map(v=>v.key);},layout,
  // Hidden preparation: compile every material for these meshes.
  warm(){return Promise.all(meshes.map(m=>m.material?.forceCompilationAsync?.(m).catch?.(()=>{}))).then(()=>!disposed);},
  // The hammer falls now; sparks and flash come when it lands.
  strike(g,t){grade=g;fx=FORGE_FX[g]??FORGE_FX.Failed;fxColor(fx.color,gradeColor);strikeAt=t;impacted=false;},
  reset(){grade=null;fx=null;strikeAt=-1e9;impacted=false;sparks.isVisible=false;flash.isVisible=false;},
  // Draw at time t (ms). False until every mesh is ready.
  draw(t){
   if(disposed||!laid||scene.isDisposed)return false;
   if(fx&&!impacted&&t-strikeAt>=FORGE_VIEW.strikeMs){impacted=true;impact();}
   animate(t);
   const width=engine.getRenderWidth(),height=engine.getRenderHeight(),pass=engine.currentRenderPassId;
   let init=false;
   engine.beginFrame();
   try{
    engine.restoreDefaultFramebuffer();
    if(!renderer.isReadyForRendering(width,height))return false;
    engine.clear(BACKGROUND,true,true,true);
    renderer.initRender(width,height);init=true;renderer.render();
    return true;
   }finally{
    if(init)renderer.finishRender();
    engine.currentRenderPassId=pass;scene.resetCachedMaterial();engine.endFrame();
   }
  },
  dispose(){
   if(disposed)return;disposed=true;scene.onDisposeObservable.remove(observer);
   renderer.dispose();sps.dispose();
   for(const mesh of meshes)if(!mesh.isDisposed()&&!owned.some(v=>v.mesh===mesh))mesh.dispose(false,false);
   for(const visual of owned)visual.dispose();
   heatMaterial.dispose();flashMaterial.dispose();
   for(const node of nodes)node.dispose();
   meshes.length=0;
  },
 };
 return api;
}
