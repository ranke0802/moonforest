import {Vector3} from '@babylonjs/core/Maths/math.vector.js';
import {Mesh} from '@babylonjs/core/Meshes/mesh.js';
import {minimumCameraRadius} from '../camera-zoom.js';

export const FIRST_PERSON=Object.freeze({push:1.4,radius:.06,lowerBeta:.55,upperBeta:2.45,eyeUp:.07,eyeForward:.09,smoothing:12});
export const FIRST_PERSON_STORAGE_KEY='moonforest-first-person-v1';
const equipmentNames=['Bunnyguard_Shield','Golden_Oathblade'];
const clamp=(v,low,high)=>Math.max(low,Math.min(high,v));

// The original rig still animates, casts shadows and supplies all combat contacts.
// A camera-mounted copy of each equipped surface and its optional ink shares its
// live geometry and paint. It exists only in first person, with no additional pass.
function showEquipment(camera,meshes){
 const hidden=[],parts=[];
 function copy(source,parent){
  const mesh=new Mesh('first-person '+source.name,source.getScene());
  mesh.parent=parent;mesh.metadata=source.metadata;mesh.isPickable=false;
  mesh.sideOrientation=source.sideOrientation;mesh.receiveShadows=source.receiveShadows;
  mesh.renderingGroupId=source.renderingGroupId;
  return mesh;
 }
 function sync(mesh,source){
  if(mesh.geometry!==source.geometry&&source.geometry)source.geometry.applyToMesh(mesh);
  if(mesh.material!==source.material)mesh.material=source.material;
  mesh.isVisible=source.isVisible&&source.isEnabled();mesh.visibility=source.visibility;
  mesh.renderOverlay=source.renderOverlay;mesh.overlayAlpha=source.overlayAlpha;mesh.overlayColor=source.overlayColor;
 }
 for(const [index,name] of equipmentNames.entries()){
  const source=meshes.find(m=>m.name===name&&m.geometry);
  if(!source)continue;
  const surface=copy(source,camera),inkSource=source.getChildMeshes(true).find(m=>m.metadata?.moonforestOutline);
  const ink=inkSource?copy(inkSource,surface):null;
  parts.push({source,surface,inkSource,ink,sword:index===1});
  sync(surface,source);if(ink)sync(ink,inkSource);
 }
 // The explicit shadow render list ignores camera layer masks. Preserve every
 // original visibility/enable switch for combat, equipment and shadow draws.
 for(const mesh of meshes)if(mesh.geometry){hidden.push([mesh,mesh.layerMask]);mesh.layerMask=0;}
 return {
  update(eye){
   if(!parts.length)return;
   const projection=camera.getProjectionMatrix().m,depth=.55;
   const halfWidth=depth/Math.abs(projection[0]),halfHeight=depth/Math.abs(projection[5]);
   const size=Math.min(halfHeight,halfWidth*1.1),cos=Math.cos(camera.alpha),sin=Math.sin(camera.alpha);
   for(const {source,surface,ink,inkSource,sword} of parts){
    sync(surface,source);if(ink)sync(ink,inkSource);
    // The mounted item's actual animated long axis, expressed against the
    // view, carries the swing/guard through to the near-camera presentation.
    const m=source.computeWorldMatrix().m,length=Math.hypot(m[4],m[5],m[6])||1;
    const across=(sin*m[4]-cos*m[6])/length,forward=(-cos*m[4]-sin*m[6])/length;
    const raised=clamp((m[13]-eye.y+.56)*1.2,-.45,.55);
    surface.position.set(halfWidth*(sword ? .66 : -.73)+size*.13*across,halfHeight*-.64+size*.36*raised,-depth);
    surface.scaling.setAll(size*(sword ? .94 : .66));
    surface.rotation.set((sword ? -.35 : .15)+.24*forward,sword ? -.25 : .48,(sword ? Math.PI+.22 : -.18)+across*(sword ? .58 : .25));
   }
  },
  dispose(){
   for(const [mesh,mask] of hidden)if(!mesh.isDisposed())mesh.layerMask=mask;
   for(const {surface} of parts)surface.dispose(false,false);
  },
 };
}

export function createFirstPersonView({camera,zoom=null,storage=null,getHead,getMeshes=()=>[],allowed=()=>true,onChange=()=>{}}){
 let enabled=true,active=false,disposed=false,push=1,head,gear,filtered=false;
 const saved={},orbit={},eye=new Vector3(),raw=new Vector3();
 try{const setting=JSON.parse(storage?.getItem(FIRST_PERSON_STORAGE_KEY)??'null');if(typeof setting?.enabled==='boolean')enabled=setting.enabled;}catch{/* session default */}
 function enter(){
  const node=getHead?.();if(!node||node.isDisposed?.())return false;
  head=node;
  Object.assign(saved,{radius:camera.radius,lower:camera.lowerRadiusLimit,beta:camera.beta,lowBeta:camera.lowerBetaLimit,highBeta:camera.upperBetaLimit});
  gear=showEquipment(camera,getMeshes());
  camera.lowerRadiusLimit=FIRST_PERSON.radius*.5;camera.radius=FIRST_PERSON.radius;
  // A horizontal first look puts the held equipment and the horizon in view.
  camera.beta=Math.PI/2;active=true;filtered=false;push=1;
  onChange(true);return true;
 }
 function exit(){
  push=1;if(!active)return false;
  active=false;gear.dispose();gear=null;head=null;
  camera.radius=saved.radius;camera.lowerRadiusLimit=saved.lower;
  camera.lowerBetaLimit=saved.lowBeta;camera.upperBetaLimit=saved.highBeta;camera.beta=saved.beta;
  zoom?.apply();onChange(false);return true;
 }
 return {
  get active(){return active;},get enabled(){return enabled;},
  get cameraForSave(){
   if(!active)return camera;
   orbit.alpha=camera.alpha;orbit.beta=saved.beta;orbit.radius=saved.radius;return orbit;
  },
  setEnabled(value){enabled=!!value;if(!enabled)exit();try{storage?.setItem(FIRST_PERSON_STORAGE_KEY,JSON.stringify({enabled}));}catch{/* session only */}},
  zoom(factor){
   if(disposed||!Number.isFinite(factor)||factor<=0)return false;
   if(active){
    // A tiny change of direction is common while moving two fingertips.
    push=Math.max(1,push*factor);if(push>=1.06)exit();return true;
   }
   if(!enabled||factor>=1||camera.radius>(camera.lowerRadiusLimit??minimumCameraRadius(camera))*1.0005||!allowed()){push=1;return false;}
   push/=factor;return push>=FIRST_PERSON.push&&enter();
  },
  update(dt){
   if(!active)return null;
   if(!allowed()||head.isDisposed?.()||camera.radius>FIRST_PERSON.radius*1.5){exit();return null;}
   head.computeWorldMatrix();const p=head.absolutePosition,a=camera.alpha;
   raw.set(p.x-Math.cos(a)*FIRST_PERSON.eyeForward,p.y+FIRST_PERSON.eyeUp,p.z-Math.sin(a)*FIRST_PERSON.eyeForward);
   if(!filtered||Vector3.DistanceSquared(eye,raw)>1){eye.copyFrom(raw);filtered=true;}
   else Vector3.LerpToRef(eye,raw,1-Math.exp(-FIRST_PERSON.smoothing*Math.max(0,dt)),eye);
   gear.update(eye);return eye;
  },
  limitPitch(){
   camera.lowerBetaLimit=FIRST_PERSON.lowerBeta;camera.upperBetaLimit=FIRST_PERSON.upperBeta;
   camera.beta=clamp(camera.beta,FIRST_PERSON.lowerBeta,FIRST_PERSON.upperBeta);
  },
  heading(){return Math.atan2(-Math.cos(camera.alpha),-Math.sin(camera.alpha));},
  exit,dispose(){disposed=true;exit();},
 };
}
