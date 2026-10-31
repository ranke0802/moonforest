import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {NullEngine,Scene,ArcRotateCamera,TransformNode,Vector3,Matrix} from '@babylonjs/core';
import {portalHeadingTurn,mapPortals,mapForCharacter,worldSpawn,travelUrl,MAP_PORTALS,FOREST_CAVE_PORTAL,CAVE_SPAWN} from '../src/map-route.js';
import {carryPortalPose,createMapTransition} from '../src/map-transition.js';
import {CameraPitch} from '../src/camera-pitch.js';
import {CameraFollow} from '../src/camera-follow.js';

const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8').replaceAll('\r\n','\n'),noop=()=>{};
const near=(a,b,epsilon=1e-10)=>assert.ok(Math.abs(a-b)<epsilon,`${a} != ${b}`);
const angleNear=(a,b)=>near(Math.atan2(Math.sin(a-b),Math.cos(a-b)),0);
function between(start,end){const a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(a>=0&&b>a,`main callback not found: ${start}`);return source.slice(a,b).replaceAll('import.meta.env.BASE_URL',"'/'");}
const mapSource=between('mapTransition=createMapTransition({','\n  bindMapPortal();');
const leaveSource=between('function leaveElenaReview()','\nfunction updateButtons()');
const reviewSource=between('async function prepareElenaReview()','\nfunction updateHealthBars()');
const pair=['warrior-v4','warrior-v5'];

function corridors(from,to){
 const departure=mapPortals(mapForCharacter(from)).find(p=>p.destination===to),returning=mapPortals(mapForCharacter(to)).find(p=>p.destination===from);
 return {departure,returning,outward:new Vector3(departure.x-returning.arrival.x,0,departure.z-returning.arrival.z).normalize(),inward:new Vector3(departure.arrival.x-returning.x,0,departure.arrival.z-returning.z).normalize()};
}

test('actual forest and cave portal corridors require opposite 45 degree turns',()=>{
 assert.deepEqual({x:FOREST_CAVE_PORTAL.x,z:FOREST_CAVE_PORTAL.z},{x:28,z:-41});
 assert.deepEqual(MAP_PORTALS['witch-cave'].arrival,{x:28,z:-38});assert.deepEqual(CAVE_SPAWN,{x:-42,z:43});
 assert.deepEqual({x:MAP_PORTALS['witch-cave'].x,z:MAP_PORTALS['witch-cave'].z},{x:-46,z:47});
 for(const [from,to,expected]of [[...pair,-Math.PI/4],[...pair.toReversed(),Math.PI/4]]){
  const {outward,inward}=corridors(from,to),turn=portalHeadingTurn(from,to);near(turn,expected);
  const rotated=Vector3.TransformNormal(outward,Matrix.RotationY(turn));assert.ok(rotated.equalsWithEpsilon(inward,1e-7));
 }
});

test('routed pose rotates actor, camera and world pan together and repeated cave trips do not drift',()=>{
 const engine=new NullEngine(),scene=new Scene(engine),actor=new TransformNode('player',scene),camera=new ArcRotateCamera('camera',0,.91,17,Vector3.Zero(),scene);
 try{
  for(const [from,to]of [pair,pair.toReversed()])for(const yaw of [-7,-Math.PI,-.7,0,.6,Math.PI,12])for(const orbit of [-9,-2.4,0,.8,4.7,10]){
   const pan={x:1.25,y:.43,z:-2.75},turn=portalHeadingTurn(from,to),expectedPan=Vector3.TransformNormal(new Vector3(pan.x,pan.y,pan.z),Matrix.RotationY(turn));
   actor.rotation.y=yaw;camera.alpha=orbit;camera.beta=.91;camera.radius=17;
   carryPortalPose(actor,camera,pan,{from,to});
   near(actor.rotation.y,yaw+turn);near(camera.alpha,orbit-turn);angleNear(camera.alpha+actor.rotation.y,orbit+yaw);
   near(pan.x,expectedPan.x,1e-6);near(pan.z,expectedPan.z,1e-6);assert.equal(pan.y,.43);assert.equal(camera.beta,.91);assert.equal(camera.radius,17);
   camera.getViewMatrix(true);assert.ok(camera.position.asArray().every(Number.isFinite));
  }
  actor.rotation.y=1.24;camera.alpha=-2.78;const pan={x:.7,y:.2,z:-1.3};
  for(let trip=0;trip<40;trip++){carryPortalPose(actor,camera,pan,{from:pair[0],to:pair[1]});carryPortalPose(actor,camera,pan,{from:pair[1],to:pair[0]});}
  near(actor.rotation.y,1.24);near(camera.alpha,-2.78);near(pan.x,.7);near(pan.z,-1.3);assert.equal(pan.y,.2);
 }finally{engine.dispose();}
});

test('village route and legacy callers keep the established half turn; disconnected selections keep their pose',()=>{
 for(const [from,to]of [['warrior-v3','warrior-v4'],['warrior-v4','warrior-v3']])near(portalHeadingTurn(from,to),Math.PI);
 for(const [from,to]of [['warrior-v3','warrior-v5'],['warrior-v5','warrior-v3'],['warrior-v5','warrior-v5'],['archer','warrior-v5']]){
  assert.equal(portalHeadingTurn(from,to),0);const actor={rotation:{y:1.2}},camera={alpha:-2,beta:1.1,radius:13},pan={x:2,y:.3,z:-4};
  carryPortalPose(actor,camera,pan,{from,to});assert.equal(actor.rotation.y,1.2);assert.deepEqual(camera,{alpha:-2,beta:1.1,radius:13});assert.deepEqual(pan,{x:2,y:.3,z:-4});
 }
 const actor={rotation:{y:1.2}},camera={alpha:-2,beta:1.1,radius:13},pan={x:2,y:.3,z:-4};
 carryPortalPose(actor,camera,pan);assert.equal(actor.rotation.y,1.2+Math.PI);assert.equal(camera.alpha,-2+Math.PI);assert.deepEqual(pan,{x:-2,y:.3,z:4});
});

test('normal travel URLs remove Elena review presets without changing the direct review URL',()=>{
 for(const mode of ['saint','witch','battle']){
  const original=`https://example.test/?character=warrior-v5&rev=kept&elenaReview=${mode}`;
  const onward=new URL(travelUrl(original,'warrior-v4'));
  assert.equal(onward.searchParams.has('elenaReview'),false);assert.equal(onward.searchParams.get('rev'),'kept');assert.equal(onward.searchParams.get('from'),'warrior-v5');
  assert.equal(new URL(original).searchParams.get('elenaReview'),mode);
 }
});

// Production map callbacks + production leave/review functions run together.
// Asset loading, sky and audio are injected boundaries; pose uses real Babylon
// transforms, orbit camera, CameraFollow, CameraPitch and real route data.
function mainFixture(t,{character='warrior-v4',reviewMode='battle'}={}){
 const dom=parseHTML(readFileSync(new URL('../index.html',import.meta.url),'utf8')),doc=dom.document;doc.hidden=false;
 for(const id of ['motion-speed-dialog','help-dialog','summon-dialog','boss-pattern-dialog','character-style-dialog'])if(!doc.getElementById(id)){const dialog=doc.createElement('dialog');dialog.id=id;doc.body.append(dialog);}
 doc.fullscreenElement=doc.documentElement;let fullscreenExits=0;doc.exitFullscreen=()=>{fullscreenExits++;};
 const engine=new NullEngine(),scene=new Scene(engine),actor=new TransformNode('player',scene),residentActor=new TransformNode('elena',scene),camera=new ArcRotateCamera('camera',-.8,1.07,17,Vector3.Zero(),scene);t.after(()=>engine.dispose());
 const initialMap=mapForCharacter(character),world={scene,camera,mapId:initialMap,cave:initialMap==='witch-cave',environment:{},villageStreaming:{active:true},trainingSpawn:Vector3.Zero(),terrain:{place:position=>{position.y=2;}},sky:{load:async()=>{}},lighting:{follow:noop},releaseEnvironment:async()=>{}};
 const cameraPitch=new CameraPitch(camera,{warrior:true}),cameraFollow=new CameraFollow(),pan={x:.9,y:.3,z:-1.7},location={href:`https://example.test/?character=${character}&elenaReview=${reviewMode}`,search:`?character=${character}&elenaReview=${reviewMode}`};
 const history={replaceState(_state,_title,url){location.href=String(url);location.search=new URL(location.href).search;}};
 const resident={kind:'elena',actor:residentActor,reviewMode:true,reviewMovement:{x:1,z:1,run:true}},boss={allPooled:[resident],encounters:[resident],playerHp:317,potions:{remaining:1},hide:noop,activateResident:async()=>{boss.activations++;},activations:0};
 const equipment=Object.freeze({sword:'existing-sword',shield:'existing-shield'}),orientation={type:'landscape-primary'},calls=[];
 const boundary={initialCharacter:character,initialReviewMode:reviewMode,Vector3,actor,world,cameraPitch,cameraFollow,boss,equipment,orientation,worldSpawn,mapForCharacter,carryPortalPose,
  createMapTransition:options=>createMapTransition({...options,frame:async()=>{}}),replaceWorldMap:(w,destination)=>{w.mapId=mapForCharacter(destination);w.cave=w.mapId==='witch-cave';w.environment={};},
  document:doc,location,history,$:selector=>doc.querySelector(selector),text:(selector,value)=>{doc.querySelector(selector).textContent=value;},toast:message=>calls.push(message),input:{panOffset:pan,reset:noop},
  frameDiagnostics:{mapChanged:noop,suspend:noop},loadDiagnostics:{begin:noop,phase:noop,download:noop,finish:noop},loadingView:{begin:noop,download:noop,stream:noop,preparing:noop,reveal:noop,fail:noop},
  frameLoop:{setPaused:noop},audio:{stopAll:noop,play:noop,setEnvironment:noop,setSuspended:noop},actionAudio:{reset:noop},updateButtons:noop,cancelAttackInput:noop,
  goldLoot:{clearDrops:noop},goldLootView:{clear:noop},projectiles:{clear:noop},strikeSampler:{reset:noop},training:{setSelected:noop,relocate:noop},controller:{cancelAttack:noop},animator:{transition:noop,update:noop},
  prepareMapResources:async()=>{},loadVillage:async()=>{},waitForSceneReady:async()=>{},bindMapPortal:noop,syncCaveFog:noop,assertFrameHealthy:noop,applyRenderQuality:noop,
  motionSpeedControls:{isOpen:()=>false},deathScreen:{isOpen:()=>false},requestAnimationFrame:callback=>callback(),canvas:{focus:noop},console,
 };
 const runtime=Function(...Object.keys(boundary),`
  let character=initialCharacter,elenaReviewMode=initialReviewMode,elenaReview=boss.encounters[0],mapTransition,mapPortal=null,ready=true,loadingAsset=false,combatResult=null,frameFailure=null,playerHead=null;
  const mapSpawn=()=>worldSpawn(character,location.search,{x:0,z:0});
  const isCave=()=>character==='warrior-v5',isForest=()=>character==='warrior-v4';
  ${leaveSource}\n${reviewSource}\n${mapSource}
  return {get transition(){return mapTransition;},prepareElenaReview,snapshot(){return {character,elenaReviewMode,reviewActive:!!elenaReview,ready,loadingAsset,equipment,orientation};}};
 `)(...Object.values(boundary));
 return {runtime,dom,doc,actor,camera,pan,world,boss,resident,location,calls,equipment,orientation,get fullscreenExits(){return fullscreenExits;}};
}

test('actual main forest/cave round trips use source direction and keep rear view, health, equipment and fullscreen',async t=>{
 const f=mainFixture(t),{outward,inward}=corridors('warrior-v4','warrior-v5');
 f.actor.rotation.y=Math.atan2(outward.x,outward.z);f.camera.alpha=-Math.PI/2-f.actor.rotation.y+.2;
 const yaw=f.actor.rotation.y,alpha=f.camera.alpha,relation=alpha+yaw,pan={...f.pan},fullscreen=f.doc.fullscreenElement;
 for(let cycle=0;cycle<8;cycle++)for(const destination of ['warrior-v5','warrior-v4']){
  const from=f.runtime.snapshot().character,previousYaw=f.actor.rotation.y,previousAlpha=f.camera.alpha;
  const url=new URL(travelUrl(f.location.href,destination));url.searchParams.set('elenaReview','witch'); // also reject stale manually composed travel URLs
  assert.equal(await f.runtime.transition.travel(url.href),true);
  const expected=destination==='warrior-v5'?-Math.PI/4:Math.PI/4;
  near(f.actor.rotation.y,previousYaw+expected);near(f.camera.alpha,previousAlpha-expected);angleNear(f.actor.rotation.y+f.camera.alpha,relation);
  const destinationSpawn=worldSpawn(destination,new URL(f.location.href).search);near(f.actor.position.x,destinationSpawn.x);near(f.actor.position.z,destinationSpawn.z);
  if(destination==='warrior-v5')angleNear(f.actor.rotation.y,Math.atan2(inward.x,inward.z));
  assert.equal(f.runtime.snapshot().elenaReviewMode,null);assert.equal(f.runtime.snapshot().reviewActive,false);assert.equal(f.resident.reviewMode,false);assert.deepEqual(f.resident.reviewMovement,{x:0,z:0,run:false});
  assert.equal(new URL(f.location.href).searchParams.has('elenaReview'),false);assert.equal(f.calls.length,0,'normal travel must not activate a review staging preset');
  assert.equal(f.camera.beta,1.07);assert.equal(f.camera.radius,17);assert.equal(f.pan.y,.3);assert.equal(f.boss.playerHp,317);assert.equal(f.boss.potions.remaining,1);assert.strictEqual(f.runtime.snapshot().equipment,f.equipment);
  assert.strictEqual(f.doc.fullscreenElement,fullscreen);assert.equal(f.fullscreenExits,0);assert.equal(f.orientation.type,'landscape-primary');
 }
 near(f.actor.rotation.y,yaw);near(f.camera.alpha,alpha);near(f.pan.x,pan.x);near(f.pan.z,pan.z);assert.equal(f.boss.activations,8,'one resident activation per cave arrival');
});

test('direct cave review remains available, but leaving it disables staging before ordinary return',async t=>{
 const f=mainFixture(t,{character:'warrior-v5',reviewMode:'battle'});
 await f.runtime.prepareElenaReview();assert.equal(f.actor.position.x,29);assert.equal(f.actor.position.z,-21.5);assert.equal(f.calls.length,1);assert.equal(new URL(f.location.href).searchParams.get('elenaReview'),'battle');
 f.calls.length=0;const outgoing=travelUrl(f.location.href,'warrior-v4');assert.equal(await f.runtime.transition.travel(outgoing),true);
 assert.equal(f.runtime.snapshot().elenaReviewMode,null);assert.equal(f.calls.length,0);
 const yaw=f.actor.rotation.y,alpha=f.camera.alpha;assert.equal(await f.runtime.transition.travel(travelUrl(f.location.href,'warrior-v5')),true);
 near(f.actor.rotation.y,yaw-Math.PI/4);near(f.camera.alpha,alpha+Math.PI/4);assert.equal(f.actor.position.x,CAVE_SPAWN.x);assert.equal(f.actor.position.z,CAVE_SPAWN.z);assert.equal(f.calls.length,0);
});

test('actual main disconnected map selection does not apply a fabricated portal half turn',async t=>{
 const f=mainFixture(t,{character:'warrior-v3',reviewMode:null});f.actor.rotation.y=.72;f.camera.alpha=-2.13;
 assert.equal(await f.runtime.transition.travel('https://example.test/?character=warrior-v5&arrival=portal&elenaReview=battle'),true);
 near(f.actor.rotation.y,.72);near(f.camera.alpha,-2.13);assert.equal(f.runtime.snapshot().elenaReviewMode,null);assert.equal(f.calls.length,0);
});
