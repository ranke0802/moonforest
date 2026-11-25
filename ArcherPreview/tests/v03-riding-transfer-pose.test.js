import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {FreeCamera,Matrix,NullEngine,RawTexture,Scene,TransformNode,Vector3} from '@babylonjs/core';
import {GLTFLoader} from '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {readMapContainer} from '../src/map-container.js';
import {configurePlayerSize} from '../src/player-dimensions.js';
import {CharacterAnimator} from '../src/animation.js';
import {createRidingHorse} from '../src/v03/riding-horse.js';

// An independent +X scan through the posed horse triangles in saddle space.
// Bucket by y,z so testing many points in the actual armour is inexpensive.
function horseSurface(mesh,toSaddle){
 const positions=mesh.getPositionData(true),into=mesh.computeWorldMatrix().multiply(toSaddle),vertices=[];
 for(let k=0;k<positions.length;k+=3)vertices.push(Vector3.TransformCoordinates(Vector3.FromArray(positions,k),into));
 const bins=new Map(),idx=mesh.getIndices(),cell=v=>Math.floor(v/.1),key=(y,z)=>y*200+z;
 for(let i=0;i<idx.length;i+=3){
  const a=vertices[idx[i]],b=vertices[idx[i+1]],c=vertices[idx[i+2]];
  const by=b.y-a.y,bz=b.z-a.z,cy=c.y-a.y,cz=c.z-a.z,det=by*cz-bz*cy;
  if(Math.abs(det)<1e-10)continue;
  const tri={a,bx:b.x-a.x,cx:c.x-a.x,by,bz,cy,cz,det};
  for(let y=cell(Math.min(a.y,b.y,c.y));y<=cell(Math.max(a.y,b.y,c.y));y++)
   for(let z=cell(Math.min(a.z,b.z,c.z));z<=cell(Math.max(a.z,b.z,c.z));z++){
    const id=key(y,z);if(!bins.has(id))bins.set(id,[]);bins.get(id).push(tri);
   }
 }
 return p=>{
  const xs=[];
  for(const {a,bx,cx,by,bz,cy,cz,det} of bins.get(key(cell(p.y),cell(p.z)))??[]){
   const y=p.y-a.y,z=p.z-a.z,u=(y*cz-z*cy)/det,v=(by*z-bz*y)/det;
   if(u>=0&&v>=0&&u+v<=1)xs.push(a.x+u*bx+v*cx);
  }
  xs.sort((a,b)=>a-b);
  const distinct=xs.filter((x,i)=>i===0||x-xs[i-1]>.001);
  for(let i=0;i+1<distinct.length;i+=2)if(p.x>distinct[i]&&p.x<distinct[i+1])return Math.min(p.x-distinct[i],distinct[i+1]-p.x);
  return 0;
 };
}

// Check visible finger/gauntlet vertices against the actual pad, cantle and
// pommel. The same saddle-local triangles serve every pose of this clip.
function contactsSaddle(saddle){
 const vertices=saddle.getVerticesData('position'),indices=saddle.getIndices(),triangles=[],scratch=new Vector3();
 const gap=.006;
 for(let i=0;i<indices.length;i+=3){
  const [a,b,c]=[0,1,2].map(k=>Vector3.FromArray(vertices,3*indices[i+k]));
  const lo=Vector3.Minimize(Vector3.Minimize(a,b),c),hi=Vector3.Maximize(Vector3.Maximize(a,b),c);
  lo.addInPlaceFromFloats(-gap,-gap,-gap);hi.addInPlaceFromFloats(gap,gap,gap);
  triangles.push({a,b,c,lo,hi});
 }
 return p=>triangles.some(({a,b,c,lo,hi})=>p.x>lo.x&&p.x<hi.x&&p.y>lo.y&&p.y<hi.y&&p.z>lo.z&&p.z<hi.z
  &&Vector3.ProjectOnTriangleToRef(p,a,b,c,scratch)<gap);
}
const angleDegrees=(a,b)=>Math.acos(Math.max(-1,Math.min(1,Vector3.Dot(a,b)/(a.length()*b.length()))))*180/Math.PI;

test('actual riding controls lift the warrior from the near stirrup over the croup and return both feet to the ground',async t=>{
 const assetUrl=new URL('../public/assets/warrior-v3-mobile4k.json',import.meta.url),cfg=JSON.parse(readFileSync(assetUrl));
 const {gltf,files}=await readRuntimeGltf(new URL(cfg.model,assetUrl));
 delete gltf.extensionsRequired;delete gltf.extensionsUsed;delete gltf.images;delete gltf.materials;delete gltf.textures;
 for(const mesh of gltf.meshes)for(const prim of mesh.primitives)delete prim.material;
 for(const buffer of gltf.buffers)buffer.uri='data:application/octet-stream;base64,'+files.get(buffer.uri).data.toString('base64');
 const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;scene.useConstantAnimationDeltaTime=true;
 t.mock.method(engine,'getDeltaTime',()=>1000/60);
 new FreeCamera('camera',new Vector3(0,2,-4),scene);
 const asset=await readMapContainer(scene,gltf,'file:///',{skipMaterials:true});asset.addAllToScene();
 const actor=new TransformNode('actor',scene),lift=new TransformNode('saddle offset',scene);lift.parent=actor;actor.metadata={saddleOffset:lift};
 for(const n of [...asset.meshes,...asset.transformNodes])if(!n.parent)n.parent=lift;
 configurePlayerSize(actor,cfg,{warrior:true});actor.rotation.y=.51;
 const animator=new CharacterAnimator(asset.animationGroups,cfg.animations);
 const binary=readFileSync(new URL('../src/v03/models/wagon-horse-rig.glb',import.meta.url));
 t.mock.method(globalThis,'fetch',async()=>new Response(binary));
 t.mock.method(GLTFLoader.prototype,'_loadTextureAsync',function(_context,texture,assign){
  const image=RawTexture.CreateRGBATexture(new Uint8Array([75,46,33,255]),1,1,this.babylonScene,false,false);
  image.getInternalTexture().isReady=true;assign(image);return Promise.resolve(image);
 });
 const {document}=parseHTML('<main id="app"><div class="top-actions"></div><button id="attack-button"></button></main>');
 const heightAt=(x,z)=>.12*x-.06*z,world={scene,mapId:'village',terrain:{heightAt}};
 const ride=createRidingHorse({world,root:document.querySelector('main'),storage:{getItem:()=> '1'},player:()=>actor,ridingAllowed:()=>true,tell(){},forwardYaw:()=>cfg.forwardYaw});
 t.after(()=>{ride.dispose();animator.dispose();asset.dispose();scene.dispose();engine.dispose();});
 const joint=name=>scene.getTransformNodeByName('mixamorig:'+name).computeWorldMatrix(true).getTranslation();
 const body=scene.getMeshByName('Warrior_Body_primitive0'),weights=body.getVerticesData('matricesWeights'),ids=body.getVerticesData('matricesIndices');
 const limbs=new Set(body.skeleton.bones.filter(b=>/:(?:Hips|(?:Left|Right)(?:Leg|UpLeg|Foot|ToeBase))$/.test(b.name)).map(b=>b.getIndex()));
 const garment=[];for(let i=0;i<body.getTotalVertices();i++){
  let weight=0;for(let k=0;k<4;k++)if(limbs.has(ids[4*i+k]))weight+=weights[4*i+k];
  if(weight>.8)garment.push(i);
 }
 assert.ok(garment.length>8000,'include the skinned trousers and both boots');
 const sleeves=[],boneNames=new Map(body.skeleton.bones.map(b=>[b.getIndex(),b.name.replace('mixamorig:','')]));
 for(let i=0;i<body.getTotalVertices();i++){
  let weight=0;
  for(let k=0;k<4;k++)if(/^(Left|Right)(Arm|ForeArm|Hand)/.test(boneNames.get(ids[4*i+k])))weight+=weights[4*i+k];
  if(weight>.85)sleeves.push([i,boneNames.get(ids[4*i])]);
 }
 assert.ok(sleeves.length>4000,'evaluate both armour sleeves, gauntlets and fingers');
 const dt=1/60,idle={state:'idle',loop:true};let tick=0;
 const frame=()=>{animator.transition('idle',{...idle,clipTime:tick++*dt});animator.update(dt);ride.afterMove(idle,0,dt);scene.render();engine.endFrame();};
 const toggle=()=>document.querySelector('.v03-ride-toggle').onclick();
 ride.updateAvailability();frame();const initialFoot=joint('RightFoot'),initialHip=joint('Hips');
 await toggle();for(let i=0;i<400&&ride.inspect().state==='approaching';i++)frame();
 assert.equal(ride.inspect().state,'mounting');
 const shieldPad=scene.getMeshByName('Shield_Rear_Leather_Pad');
 assert.equal(shieldPad.isEnabled(),false,'rider must use empty hands at the saddle');
 const saddle=scene.getMeshByName('v03-riding-saddle'),horse=scene.getMeshByName('wagon_horse');
 const touchesPad=contactsSaddle(saddle);
 function measure(){
  const inv=Matrix.Invert(saddle.computeWorldMatrix(true)),local=v=>Vector3.TransformCoordinates(v,inv),inside=horseSurface(horse,inv);
  assert.ok(inside(new Vector3(0,-.26,0))>.2,'test scan must detect the actual horse barrel');
  const row={upperDepth:0,contacts:{Left:0,Right:0}},head=local(joint('Head')),neck=local(joint('Neck'));let jointDepth=0;
  row.hip=local(joint('Hips'));row.spine=local(joint('Spine2'));
  row.torsoInclination=angleDegrees(neck.subtract(row.hip),Vector3.UpReadOnly);
  row.neckInclination=angleDegrees(head.subtract(neck),Vector3.UpReadOnly);
  for(const side of ['Left','Right']){
   const names=['UpLeg','Leg','Foot','ToeBase'],joints=names.map(n=>local(joint(side+n)));
   row[side+'Foot']=joints[2];row[side+'Knee']=joints[1];row[side+'Hand']=local(joint(side+'Hand'));
   const arm=local(joint(side+'Arm')),elbow=local(joint(side+'ForeArm')),wrist=row[side+'Hand'],knuckle=local(joint(side+'HandMiddle1'));
   row[side]={arm,elbow,elbowAngle:angleDegrees(arm.subtract(elbow),wrist.subtract(elbow)),
    wristAngle:angleDegrees(wrist.subtract(elbow),knuckle.subtract(wrist))};
   for(let j=0;j<3;j++)for(let k=0;k<=4;k++)jointDepth=Math.max(jointDepth,inside(Vector3.Lerp(joints[j],joints[j+1],k/4)));
  }
  row.jointDepth=Math.max(jointDepth,inside(row.hip));row.groundFoot=joint('RightFoot');
  const v=body.getPositionData(true),matrix=body.getWorldMatrix().multiply(inv);
  row.skinDepth=0;for(const id of garment)row.skinDepth=Math.max(row.skinDepth,inside(Vector3.TransformCoordinates(Vector3.FromArray(v,3*id),matrix)));
  const weighted=row.hip.y>-.36&&row.hip.y<.22;
  for(const [id,bone] of sleeves){
   const point=Vector3.TransformCoordinates(Vector3.FromArray(v,3*id),matrix);
   row.upperDepth=Math.max(row.upperDepth,inside(point));
   if(weighted&&bone.includes('Hand')&&touchesPad(point))row.contacts[bone.startsWith('Left')?'Left':'Right']++;
  }
  return row;
 }
 // Record the actual leg at 60 Hz, including ticks between the review's
 // 30 fps frames. This also catches a one-tick sole flip when entering the stirrup.
 const seatInterior=horseSurface(saddle,Matrix.Invert(saddle.computeWorldMatrix(true)));
 const offThigh=garment.filter(i=>{
  if(boneNames.get(ids[4*i])!=='RightUpLeg')return false;
  let w=0;for(let k=0;k<4;k++)if(/^Right(?:UpLeg|Leg|Foot|ToeBase)$/.test(boneNames.get(ids[4*i+k])))w+=weights[4*i+k];
  return w>.8;
 });
 assert.ok(seatInterior(new Vector3(0,.075,0))>.05,'scan detects the leather seat');
 function rightLeg(tick){
  const inv=Matrix.Invert(saddle.computeWorldMatrix(true));
  // After the far boot clears the croup, the inner thigh should slide
  // past the seat rim. The boot itself enters the off-side iron below it.
  if(tick>=66&&tick<=84){
   const points=body.getPositionData(true),into=body.getWorldMatrix().multiply(inv);
   for(const i of offThigh){
    const p=Vector3.TransformCoordinates(Vector3.FromArray(points,3*i),into);
    if(p.y>0&&p.x<0&&p.x>-.212)assert.ok(seatInterior(p)<.002,'inner thigh entered the leather seat at tick '+tick+' '+i+' '+p.asArray());
   }
  }
  const [hip,knee,ankle,toe]=['RightUpLeg','RightLeg','RightFoot','RightToeBase'].map(n=>Vector3.TransformCoordinates(joint(n),inv));
  const thigh=hip.subtract(knee),shin=ankle.subtract(knee),flex=angleDegrees(thigh,shin);
  thigh.z=0;shin.z=0;
  return {hip,knee,ankle,toe:toe.subtract(ankle),angle:flex,rearAngle:angleDegrees(thigh,shin)};
 }
 const poses={},legTicks=[];
 for(const phase of ['mounting','dismounting']){
  if(phase==='dismounting'){assert.ok(ride.active);await toggle();}
  const rows=poses[phase]=[];
  for(let i=0;i<140&&ride.inspect().state===phase;i++){
   if(phase==='mounting')legTicks.push(rightLeg(i));
   frame();if(i%2===0&&ride.inspect().state===phase)rows.push(measure());
  }
  assert.ok(rows.length>30);
 }
 for(const [phase,rows] of Object.entries(poses)){
  const jointDepth=Math.max(...rows.map(r=>r.jointDepth)),skinDepth=Math.max(...rows.map(r=>r.skinDepth));
  assert.equal(jointDepth,0,phase+' hip, femur, shin and boot centre lines must clear the posed horse');
  assert.ok(skinDepth<.002,phase+' breeches or boots penetrate the horse by '+skinDepth+'m');
  assert.ok(rows.every(r=>r.upperDepth<.002),phase+' sleeves, gauntlets and fingers clear the horse');
  assert.ok(rows.filter(r=>r.contacts.Left>=3&&r.contacts.Right>=3).length>=4,phase+' both palms reach the saddle while taking weight');
  const braced=rows.filter((_,i)=>i>rows.length*.18&&i<rows.length*.82);
  for(const r of braced){
   assert.ok(r.neckInclination<15&&r.torsoInclination<27,phase+' head stays above a gently inclined torso');
   assert.ok(Math.abs(r.Left.arm.y-r.Right.arm.y)<.06,phase+' shoulders turn together without a lateral kink');
   for(const arm of [r.Left,r.Right]){
    assert.ok(arm.elbow.y<arm.arm.y+.015,phase+' bent elbow stays below its shoulder');
    assert.ok(arm.elbowAngle>39&&arm.elbowAngle<155&&arm.wristAngle<45,phase+' supporting sleeve and wrist keep an open bend');
   }
  }
  const crossing=rows.find(r=>Math.abs(r.RightFoot.x)<.15);
  assert.ok(crossing&&crossing.RightFoot.y>.22&&crossing.RightFoot.z<-.43,phase+' far boot sweeps over the croup');
  assert.ok(crossing.hip.y>.35,phase+' rider lifts the pelvis above the seated pose');
 }
 const atFrame=n=>legTicks[2*(n-1)],push=atFrame(25);
 assert.ok(push.angle>174&&push.ankle.y<-.36&&push.toe.z>.14,'the trailing boot still points forward on the approved push-off');
 for(const r of legTicks.slice(54,71)){
  assert.ok(r.angle>151&&r.angle<175&&Vector3.Distance(r.hip,r.ankle)>.65,'the thigh carries an open leg behind the saddle');
  assert.ok(r.rearAngle>118,'the knee and shin do not fold back on each other in the rear view');
 }
 const arc=atFrame(32),crest=atFrame(34),lowering=atFrame(39);
 assert.ok(arc.ankle.z<arc.hip.z-.57&&arc.toe.z<-.075,'boot and toe travel backward well past the pelvis');
 assert.ok(crest.ankle.z<-.69&&crest.ankle.x<.13,'boot crosses behind the croup');
 assert.ok(lowering.ankle.x<-.48&&lowering.ankle.y<0&&lowering.angle<crest.angle-16,'only lower and bend the leg after crossing the far flank');
 for(let i=49;i<=85;i++){
  assert.ok(Math.abs(legTicks[i].angle-legTicks[i-1].angle)<8,'no knee snap at mounting tick '+i);
  assert.ok(angleDegrees(legTicks[i].toe,legTicks[i-1].toe)<15,'no boot flip at mounting tick '+i);
 }
 assert.ok(atFrame(43).toe.z>.145&&atFrame(43).ankle.y<-.26,'the boot faces forward in the off-side stirrup');
 const {mounting,dismounting}=poses,first=mounting[0],last=dismounting.at(-1);
 const supported=mounting.find(r=>r.hip.y>-.06&&r.hip.y<.14);
 assert.ok(supported.LeftFoot.x>.39&&supported.LeftFoot.x<.475&&Math.abs(supported.LeftFoot.y+.31)<.025,'near ankle is in the left iron');
 assert.ok(supported.RightFoot.x>.60&&supported.RightFoot.y<-.42,'far boot stays on the near side during the lift');
 assert.ok(supported.LeftHand.x<.36&&supported.RightHand.x<.36&&supported.LeftHand.y>0&&supported.RightHand.y>0,'wrists reach the near edge of the saddle');
 assert.ok(supported.LeftHand.z>.12&&supported.RightHand.z<-.08,'one hand at the front, one farther back');
 assert.ok(supported.torsoInclination>9&&supported.torsoInclination<27,'trunk inclines during the stirrup push');
 assert.ok(mounting.slice(0,10).every(r=>Vector3.Distance(first.groundFoot,r.groundFoot)<.055),'ground boot stays planted before lift');
 assert.ok(mounting[0].hip.x>.85&&Math.abs(mounting.at(-1).hip.x)<.03,'hips move from beside the horse to the saddle');
 const clearsIron=dismounting.find(r=>r.LeftFoot.x>.48&&r.LeftFoot.y>-.275);
 assert.ok(clearsIron&&clearsIron.RightFoot.x>.65,'left boot lifts free once the right leg reaches the near side');
 const falling=dismounting.filter(r=>r.LeftFoot.y<-.47&&r.LeftFoot.y>-1.1);
 assert.ok(falling.length>=8&&falling.every(r=>Math.abs(r.LeftFoot.y-r.RightFoot.y)<.06),'both released feet descend together');
 const landed=dismounting.filter(r=>Vector3.Distance(r.LeftFoot,last.LeftFoot)<.06&&Vector3.Distance(r.RightFoot,last.RightFoot)<.06);
 assert.ok(landed.length>=5&&last.hip.y-Math.min(...landed.map(r=>r.hip.y))>.075,'knees absorb the landing after both boots touch down');
 assert.ok(Vector3.Distance(joint('Hips'),initialHip)<.025&&Vector3.Distance(joint('RightFoot'),initialFoot)<.025,'restore the ground idle in place');
 assert.equal(lift.position.lengthSquared(),0);assert.equal(lift.rotation.lengthSquared(),0);
 assert.equal(shieldPad.isEnabled(),true,'on-foot equipment returns after landing');
});
