import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {ArcRotateCamera,Matrix,NullEngine,Scene,TransformNode,Vector3,Viewport} from '@babylonjs/core';
import {parseHTML} from 'linkedom';
import {VILLAGE_PLAINS_BOUNDARY as boundary,villageToPlains,plainsToVillage,isVillageBoundaryTree} from '../src/village-plains-boundary.js';
import {VILLAGE_PLACEMENTS,villageObstacles} from '../src/village-layout.js';
import {PLAINS_PLACEMENTS,PLAINS_ROUTES,plainsObstacles} from '../src/great-plains-layout.js';
import {groundLayout} from '../src/village-ground-layout.js';
import {villageHeight} from '../src/village-terrain.js';
import {greatPlainsHeight} from '../src/great-plains-terrain.js';
import {MAP_PORTALS,portalHeadingTurn} from '../src/map-route.js';
import {carryPortalPose} from '../src/map-transition.js';
import {VillageNavigation} from '../src/village-navigation.js';
import {exitRoadX,villageTravelLimit,clampVillageExit,createMapPortal} from '../src/map-travel.js';
import {DotMinimap,MINIMAP_MAPS,MINIMAP_SIZE,minimapWorldPoint} from '../src/dot-minimap.js';
import {playerDimensions,WARRIOR_DIMENSIONS} from '../src/player-dimensions.js';
import {ARENA_RADIUS} from '../src/world-limits.js';

const results=[];
const near=(a,b,tolerance=1e-8,message='value differs')=>assert.ok(Math.abs(a-b)<=tolerance,`${message}: ${a} != ${b}`);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const pointSegment=(p,a,b)=>{const x=b[0]-a[0],z=b[1]-a[1],t=Math.max(0,Math.min(1,((p.x-a[0])*x+(p.z-a[1])*z)/(x*x+z*z)));return Math.hypot(p.x-a[0]-x*t,p.z-a[1]-z*t);};
const lineDistance=(p,line)=>Math.min(...line.slice(1).map((b,i)=>pointSegment(p,line[i],b)));

test('the town layout, terrain, original road and ground resources remain byte-identical to70c88cf',()=>{
 const expected={
  'src/village-layout.js':'ab5f0a3692299dfeebc9b51cdc5fe73116ea0d8951570f8d9730fabad46d4ed2',
  'src/village-terrain.js':'eeef1bf87c896769c4d1dc8e124114f64634e662b95fae28b331ae6a783392c3',
  'src/village-ground-layout.js':'e28ea551f0915955d0e6836ce8c5a88987292a16471463fb9ae0a320054e99ed',
  'public/assets/village-ground.json':'7e765a99fa11aadcd94714843fc484da21d1c9e70637589eecefa7410c066c7c',
 };
 for(const [file,hash]of Object.entries(expected))assert.equal(createHash('sha256').update(readFileSync(new URL('../'+file,import.meta.url),'utf8').replaceAll('\r\n','\n')).digest('hex'),hash,'town must keep the approved baseline: '+file);
 const ground=JSON.parse(readFileSync(new URL('../public/assets/village-ground.json',import.meta.url)));
 for(const resource of [ground.color,ground.detail]){
  const url=new URL(resource.url,new URL('../public/assets/',import.meta.url)),hash=url.pathname.split('/').at(-1).split('.')[0];
  assert.equal(createHash('sha256').update(readFileSync(url)).digest('hex'),hash,'original town ground texture bytes changed');
 }
 results.push({case:'original-town-preserved',baseline:'70c88cf',normalizedSourceHashes:expected,originalGroundImageHashesVerified:true});
});

test('both actual portals, original curved approach paint and full walking shoulders share a rigid metre-scale seam',()=>{
 const departure=MAP_PORTALS.village,returning=MAP_PORTALS['great-plains'];
 assert.deepEqual({x:departure.x,z:departure.z},boundary.villagePortal);
 assert.deepEqual({x:returning.x,z:returning.z},boundary.plainsPortal);
 assert.deepEqual(departure.arrival,boundary.plainsArrival);assert.deepEqual(returning.arrival,boundary.villageArrival);
 near(portalHeadingTurn('warrior-v3','warrior-plains'),boundary.yaw);
 near(portalHeadingTurn('warrior-plains','warrior-v3'),-boundary.yaw);
 const painted=groundLayout()[1],road=PLAINS_ROUTES.find(r=>r.id==='village-road');
 assert.ok(painted&&road);assert.equal(painted.width,3.9);assert.equal(road.width,painted.width);
 const villageNav=new VillageNavigation(villageObstacles()),plainsNav=new VillageNavigation(plainsObstacles());
 let samples=0,maxPaintOffset=0,maxTerrainHeightGap=0;
 for(let z=65;z<=80;z+=.25)for(const side of [-1,0,1]){
  const v={x:exitRoadX(z)+side*(boundary.roadWidth/2-.35),z},p=villageToPlains(v),roundTrip=plainsToVillage(p);
  near(distance(v,roundTrip),0,1e-10,'seam inverse');
  assert.ok(villageNav.free(v,.35,Infinity),'village shoulder blocked at '+JSON.stringify(v));
  assert.ok(plainsNav.free(p,.35,Infinity),'plains shoulder blocked at '+JSON.stringify(p));
  const heightGap=Math.abs(villageHeight(v.x,v.z)-greatPlainsHeight(p.x,p.z));maxTerrainHeightGap=Math.max(maxTerrainHeightGap,heightGap);assert.ok(heightGap<.001,'seam floor height mismatch');
  if(side===0&&z<=76){const offset=lineDistance(p,road.samples);maxPaintOffset=Math.max(maxPaintOffset,offset);assert.ok(offset<.025,'road centre mismatch at seam');}
  samples++;
 }
 const points=[{x:-30,z:42},{x:0,z:70},{x:33,z:49},{x:.35,z:76}];
 for(const a of points)for(const b of points)near(distance(villageToPlains(a),villageToPlains(b)),distance(a,b),1e-10,'scenery metre scale');
 results.push({case:'actual-road-portal-clearance',shoulderSamples:samples,maxPaintOffset,maxTerrainHeightGap,roadWidth:painted.width});
});

test('actual ArcRotate projection and carried pan remain equivalent under the seam rotation in both viewport orientations',()=>{
 let cases=0,comparisons=0,maxPixelError=0;
 for(const [width,height]of [[1280,720],[720,1280]]){
  const engine=new NullEngine({renderWidth:width,renderHeight:height}),scene=new Scene(engine);scene.useRightHandedSystem=true;
  const camera=new ArcRotateCamera('boundary-camera',0,1,13.8,Vector3.Zero(),scene),actor=new TransformNode('actor',scene);
  const project=p=>Vector3.Project(p,Matrix.Identity(),camera.getTransformationMatrix(),new Viewport(0,0,width,height));
  try{
   assert.equal(engine.getRenderWidth(),width);assert.equal(engine.getRenderHeight(),height);
   for(const reverse of [false,true])for(const alpha of [-2.7,-.3,1.2])for(const beta of [.7,1.1])for(const radius of [1.2,13.8,30]){
   const map=reverse?plainsToVillage:villageToPlains,from=reverse?'warrior-plains':'warrior-v3',to=reverse?'warrior-v3':'warrior-plains';
   const anchor=reverse?boundary.plainsPortal:boundary.villagePortal,pan={x:1.3,y:.21,z:-.8};
   actor.rotation.y=.62;camera.alpha=alpha;camera.beta=beta;camera.radius=radius;camera.target.set(anchor.x+pan.x,1.45+pan.y,anchor.z+pan.z);
   camera.getViewMatrix(true);camera.getProjectionMatrix(true);
   const beforePosition=camera.globalPosition.clone(),beforeTarget=camera.target.clone();
   const points=[[-6,0,4],[-2,2,8],[0,1,5],[3,4,12],[6,0,7]].map(([x,y,z])=>new Vector3(anchor.x+x,y,anchor.z+z));
   const old=points.map(p=>project(p));
   const relation=camera.alpha+actor.rotation.y;
   carryPortalPose(actor,camera,pan,{from,to});
   const nextTarget=map(beforeTarget);camera.target.set(nextTarget.x,beforeTarget.y,nextTarget.z);camera.getViewMatrix(true);camera.getProjectionMatrix(true);
   const expectedPosition=map(beforePosition);near(camera.globalPosition.x,expectedPosition.x,2e-5,'camera X');near(camera.globalPosition.z,expectedPosition.z,2e-5,'camera Z');near(camera.globalPosition.y,beforePosition.y,2e-5,'camera height');near(camera.alpha+actor.rotation.y,relation);
   for(let i=0;i<points.length;i++){
    const p=map(points[i]),after=project(new Vector3(p.x,points[i].y,p.z));
    // Projections behind the eye or at its plane amplify Float32 rounding and
    // cannot describe visible continuity. Compare only finite in-front samples.
    if(old[i].z>=0&&old[i].z<=1&&Math.abs(old[i].x)<width*3&&Math.abs(old[i].y)<height*3){
     const error=Math.hypot(old[i].x-after.x,old[i].y-after.y);maxPixelError=Math.max(maxPixelError,error);assert.ok(error<.04,'viewport drift '+error);comparisons++;
    }
   }
   cases++;
   }
  }finally{scene.dispose();engine.dispose();}
 }
 assert.ok(comparisons>100);results.push({case:'actual-sdk-camera-projection',cases,visibleLandmarkComparisons:comparisons,maxPixelError,note:'Rigid coordinate equivalence; actual travel advances to its existing arrival point under the curtain, so it does not promise pixel-identical before/after gameplay frames.'});
});

test('all matching outer village trees remain native shared assets with exact world scale and bounded additional placements',()=>{
 const originals=VILLAGE_PLACEMENTS.filter(isVillageBoundaryTree),copies=PLAINS_PLACEMENTS.filter(p=>p.villageBoundary);
 assert.ok(originals.length>20);assert.equal(copies.length,originals.length);assert.ok(PLAINS_PLACEMENTS.length<=1450);
 assert.equal(new Set(copies.map(p=>p.sourcePlacement)).size,originals.length,'no duplicate boundary tree');
 const read=name=>JSON.parse(readFileSync(new URL('../public/assets/'+name+'.json',import.meta.url)));
 const village=read('village'),plains=read('great-plains');
 for(const p of originals){
  const copy=copies.find(q=>q.sourcePlacement===p.id),position=villageToPlains(p);assert.ok(copy,p.id);
  assert.equal(copy.asset,p.asset);near(copy.x,position.x);near(copy.z,position.z);near(copy.yaw,p.yaw+boundary.yaw);near(copy.scale,p.scale);
  near(copy.elevation,villageHeight(p.x,p.z));
  assert.deepEqual(plains.assets[copy.asset],village.assets[p.asset],'boundary tree must retain the original LOD/texture graph');
 }
 results.push({case:'shared-native-outer-trees',villageTrees:originals.length,plainsCopies:copies.length,totalPlainsPlacements:PLAINS_PLACEMENTS.length,newAssetKinds:0});
});

test('matching trees inside the playable plains retain the original refined trunk centre and radius',()=>{
 const obstacles=plainsObstacles(),nav=new VillageNavigation(obstacles);let physical=0;
 for(const copy of PLAINS_PLACEMENTS.filter(p=>p.villageBoundary&&Math.hypot(p.x,p.z)<105)){
  const source=VILLAGE_PLACEMENTS.find(p=>p.id===copy.sourcePlacement);
  // The village excludes far background trees by radial distance. Move the
  // isolated source to its origin only to query the real refined trunk policy,
  // then restore its authored position before changing coordinate systems.
  const local=villageObstacles([{...source,x:0,z:0}])[0];assert.ok(local);
  const expected=villageToPlains({x:source.x+local.x,z:source.z+local.z});
  const actual=obstacles.find(o=>o.id===copy.id);assert.ok(actual,'walkable tree lost its solid trunk: '+copy.id);
  near(actual.x,expected.x);near(actual.z,expected.z);near(actual.radius,local.radius);
  assert.equal(nav.free(actual,.35,106),false,'player walks through matching tree trunk');physical++;
 }
 assert.equal(physical,3);results.push({case:'actual-refined-tree-collision',physicalTrees:physical});
});

test('actual main movement constraint preserves the original curved centre and both usable shoulders through the automatic portal',t=>{
 const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 const constraint=main.match(/function constrainPlayerPosition\(previous\)\{[\s\S]*?\r?\n\}/)?.[0],limit=main.match(/^const movementLimit=(.*);\r?$/m)?.[1];
 assert.ok(constraint&&limit,'actual production movement functions must be available');
 const engine=new NullEngine(),scene=new Scene(engine),navigation=new VillageNavigation(villageObstacles()),world={mapId:'village',scene,navigation};
 const {document}=parseHTML('<button id="travel"></button>'),previousDocument=globalThis.document,previousLocation=globalThis.location;
 globalThis.document=document;globalThis.location={href:'https://boundary.test/game/?character=warrior-v3'};
 t.after(()=>{scene.dispose();engine.dispose();globalThis.document=previousDocument;globalThis.location=previousLocation;});
 const half=boundary.roadWidth/2-.35;let traversed=0,automaticTrips=0;
 for(const offset of [-half,0,half]){
  const actor={position:new Vector3(exitRoadX(44)+offset,0,44),metadata:{playerDimensions:WARRIOR_DIMENSIONS}},button=document.querySelector('button');
  const movementLimit=new Function('world','actor','villageTravelLimit','ARENA_RADIUS',`return (${limit});`)(world,actor,villageTravelLimit,ARENA_RADIUS);
  const constrain=new Function('world','actor','playerDimensions','movementLimit','clampVillageExit',`return (${constraint});`)(world,actor,playerDimensions,movementLimit,clampVillageExit);
  let calls=0;
  const portal=createMapPortal(world,{button,persistTravel:false,getState:()=>({position:actor.position,hp:500,potions:3}),onTravel:url=>{assert.equal(new URL(url).searchParams.get('character'),'warrior-plains');calls++;}});
  for(let z=44.25;z<=78;z+=.25){
   const previous=actor.position.clone();actor.position.set(exitRoadX(z)+offset,0,z);constrain(previous);
   near(actor.position.x,exitRoadX(z)+offset);near(actor.position.z,z);assert.equal(movementLimit(previous),80);
   portal.update(1/30);traversed++;
  }
  assert.equal(calls,1,'holding movement in the portal starts exactly one trip');automaticTrips+=calls;
  const previous=actor.position.clone();actor.position.x+=10;constrain(previous);
  near(actor.position.x,exitRoadX(actor.position.z)+half);assert.ok(actor.position.z<=78);
  portal.dispose();
 }
 results.push({case:'actual-main-movement-and-automatic-portal',centreAndShoulderSteps:traversed,usableHalfWidth:half,automaticTrips});
});

test('actual minimap baking preserves the original single curved village exit instead of adding a second straight road',async()=>{
 const canvas=()=>{
  const strokes=[],ctx={fillRect(){},beginPath(){this.points=[];},moveTo(x,y){this.points.push([x,y]);},lineTo(x,y){this.points.push([x,y]);},stroke(){strokes.push({points:this.points,width:this.lineWidth});},getImageData:()=>({data:new Uint8ClampedArray(MINIMAP_SIZE**2*4)}),putImageData(){},drawImage(){}};
  return {width:96,height:96,strokes,getContext:()=>ctx};
 };
 const target=canvas(),label={},element={hidden:true,querySelector:selector=>selector==='canvas'?target:label},doc={createElement:()=>canvas()};
 const map=new DotMinimap(element,{document:doc});
 try{
  await map.setWorld({mapId:'village',navigation:new VillageNavigation(villageObstacles())});
  const baked=map.cache.get('village'),{rect,halfTurn}=MINIMAP_MAPS.village;assert.ok(baked);
  let northernPoints=0,northernStrokes=0,minX=Infinity,maxX=-Infinity;const originalRoad=groundLayout()[1];
  for(const stroke of baked.strokes){
   const north=stroke.points.map(([x,y])=>minimapWorldPoint(rect,x,y,MINIMAP_SIZE,halfTurn)).filter(p=>p.z>43&&p.z<=78);
   if(!north.length)continue;northernStrokes++;
   near(stroke.width,boundary.roadWidth*MINIMAP_SIZE/rect[2]);
   for(const p of north){assert.ok(lineDistance(p,originalRoad.samples)<.005,'minimap exit differs from the original town road');minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);northernPoints++;}
  }
  assert.equal(northernStrokes,1,'only the original curved route reaches the village portal');assert.ok(northernPoints>20);assert.ok(maxX-minX>2,'the original curve must remain visible on the minimap');
  results.push({case:'actual-minimap-original-curved-gateway',northernStrokes,northernPoints,minX,maxX});
 }finally{map.dispose();}
});

test.after(()=>{
 const folder=new URL('../reports/boundary-cave-polish-2026-11-03/',import.meta.url);mkdirSync(folder,{recursive:true});
 writeFileSync(new URL('boundary-continuity-validation.json',folder),JSON.stringify({passed:results.length===7,cases:results,limitations:['Node math, actual Babylon camera matrices and authored navigation/asset contracts; no browser automation or physical device/GPU/FPS measurement.','Projection equivalence tests rigid coordinate conversion, not a screenshot, full post-teleport visual match, colour or fog quality.','Actual exterior mesh draw counts are tracked independently by facade-audit.mjs; these tests do not certify its final visual quality.']},null,2)+'\n');
});
