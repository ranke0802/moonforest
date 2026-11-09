import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NullEngine,Scene,Vector3} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/index.js';
import {createCaveNaturalDressing,caveDressingFootprint,CAVE_DRESSING_PROFILES} from '../src/cave-natural-dressing.js';
import {CAVE_PLACEMENTS,CAVE_ROOMS,CAVE_ROUTES,caveSurface,caveWaterWeight,caveObstacles} from '../src/witch-cave-layout.js';
import {CAVE_NATURAL_DRESSING} from '../src/cave-natural-dressing-data.js';
import {caveLaboratoryClearance} from '../src/cave-laboratory-collision.js';
import {CaveNavigation} from '../src/witch-cave-navigation.js';
import {createWitchCaveTerrain} from '../src/witch-cave-terrain.js';
import {createVillageTransform} from '../src/village-environment.js';
import {instantiateStaticMap} from '../src/static-map-instances.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';

const oldPlacements=CAVE_PLACEMENTS.filter(p=>!p.naturalDressing);
const build=()=>createCaveNaturalDressing({surface:caveSurface,waterWeight:caveWaterWeight,existingPlacements:oldPlacements,routes:CAVE_ROUTES});
const manifest=JSON.parse(readFileSync(new URL('../public/assets/witch-cave.json',import.meta.url)));

test('natural dressing is deterministic, bounded and diverse without mutating any old placement or requiring a new source',()=>{
 const original=JSON.stringify(CAVE_PLACEMENTS),a=build(),b=build();assert.deepEqual(a,b);assert.equal(JSON.stringify(CAVE_PLACEMENTS),original);
 assert.equal(a.length,52);assert.equal(new Set(a.map(p=>p.id)).size,a.length);assert.ok(a.every(p=>!oldPlacements.some(old=>old.id===p.id)));
 assert.deepEqual(a,CAVE_NATURAL_DRESSING,'offline data must match the deterministic builder');
 assert.deepEqual(CAVE_PLACEMENTS.filter(p=>p.naturalDressing),a,'layout appends the baked placements exactly once');
 assert.deepEqual(new Set(a.map(p=>p.asset)),new Set(Object.keys(CAVE_DRESSING_PROFILES)));
 for(const p of a){assert.equal(p.kind,'rock');assert.ok(Number.isFinite(p.elevation));assert.ok(p.elevation<6);assert.equal(p.topElevation,undefined);assert.equal(p.dressingRole==='foot'?p.scale>=.4&&p.scale<=.68:p.dressingRole==='laboratory-panel'?p.scale>=1.7&&p.scale<=2.1:p.scale>=1.2&&p.scale<=1.8,true);}
 assert.equal(a.filter(p=>p.dressingRole==='laboratory-wall').length,6);
 assert.equal(a.filter(p=>p.dressingRole==='laboratory-panel').length,6);
 assert.ok(new Set(a.filter(p=>p.dressingRole==='shoulder').map(p=>p.scale.toFixed(2))).size>=10);
 for(const room of CAVE_ROOMS)assert.ok(a.some(p=>Math.hypot(p.x-room.x,p.z-room.z)<room.r+16),'no dressing around room '+room.x+','+room.z);
 assert.ok(a.filter(p=>p.x<-23&&p.z<0).length>=4,'laboratory should receive natural surrounding rock too');
 assert.deepEqual(createCaveNaturalDressing({surface:caveSurface,waterWeight:()=>1}),[]);
 assert.equal(createCaveNaturalDressing({surface:caveSurface,waterWeight:caveWaterWeight,limit:0}).length,0);
 assert.ok(createCaveNaturalDressing({surface:caveSurface,waterWeight:caveWaterWeight,routes:CAVE_ROUTES,limit:999}).length<=54);
 assert.throws(()=>createCaveNaturalDressing({surface:caveSurface}),/water fields/);
});

test('whole real shoulder footprints preserve free cells; native lab cladding preserves routes, furniture and dry access',t=>{
 const placements=build(),nav=new CaveNavigation(caveObstacles()),terrain=createWitchCaveTerrain();let samples=0,minDistance=Infinity;
 for(const p of placements){
  if(p.dressingRole.startsWith('laboratory-'))assert.ok(p.elevation<=3-.25,p.id+' is above the native laboratory floor');
  else assert.ok(terrain.heightAt(p.x,p.z)>p.elevation+.15,p.id+' is perched above the terrain');
  for(const q of caveDressingFootprint(p,.20)){
   const distance=caveSurface(q.x,q.z).distance;
   if(p.dressingRole.startsWith('laboratory-')){
    for(const route of CAVE_ROUTES)for(let i=1;i<route.length;i++)assert.ok(pointSegmentDistance(q,route[i-1],route[i])>1.6,p.id+' blocks a through-route');
    for(const prop of oldPlacements.filter(p=>p.kind!=='rock'&&!p.background))assert.ok(Math.hypot(q.x-prop.x,q.z-prop.z)>1.1+(prop.colliderRadius??0),p.id+' blocks '+prop.id);
   }else{minDistance=Math.min(minDistance,distance);assert.ok(distance>.6,p.id+' crosses the walking union');assert.equal(nav.free(q,.23,64),false,p.id+' intrudes a current legal player cell');}
   if(p.dressingRole!=='laboratory-panel')assert.ok(caveWaterWeight(q.x,q.z)<.20,p.id+' enters water');samples++;
  }
  if(p.dressingRole.startsWith('laboratory-')){const footprint=caveDressingFootprint(p,.1);assert.ok(footprint.filter(q=>caveLaboratoryClearance(q.x,q.z)<.3).length>footprint.length*(p.dressingRole==='laboratory-panel'?.10:.15),p.id+' is detached from the native wall');}
 }
 assert.ok(samples>15000);t.diagnostic(JSON.stringify({placements:placements.length,footprintSamples:samples,minimumShoulderSignedDistance:minDistance}));
});
function pointSegmentDistance(q,a,b){const x=b[0]-a[0],z=b[1]-a[1],t=Math.max(0,Math.min(1,((q.x-a[0])*x+(q.z-a[1])*z)/(x*x+z*z)));return Math.hypot(q.x-a[0]-x*t,q.z-a[1]-z*t);}

test('unchanged conservative dressing rectangles enclose every actual shipped near-LOD vertex after the production transform',async t=>{
 const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;t.after(()=>{scene.dispose();engine.dispose();});
 const world={scene,terrain:{heightAt:()=>0}},base=new URL('../public/assets/',import.meta.url);
 for(const [id,profile]of Object.entries(CAVE_DRESSING_PROFILES)){
  const config=manifest.assets[id];assert.ok(config);assert.equal(config.lods.length,3);assert.ok(config.highTextures.textures.albedo.width<=4096);
  const {gltf,files}=await readRuntimeGltf(new URL(config.lods[0].model,base));for(const buffer of gltf.buffers)if(buffer.uri)buffer.uri='data:application/octet-stream;base64,'+Buffer.from(files.get(buffer.uri).data).toString('base64');
  const loader=new GLTFFileLoader();loader.skipMaterials=true;const container=await loader.loadAssetContainerAsync(scene,{json:gltf},'');
  const placement={id:'test-'+id,x:0,z:0,scale:1,yaw:0,elevation:0,kind:'rock'},{root,facing}=createVillageTransform(world,placement,config),instance=instantiateStaticMap(container,name=>'profile-'+name);for(const node of instance.rootNodes)node.parent=facing;
  // Profiles describe the original native placement rectangle. A retained
  // vertex subset can shrink its tight bounds without shrinking that authority
  // or moving any existing dressing placement. Check actual transformed
  // vertices against those exact original sides, rather than demanding a new
  // simplified mesh still touch every side of its conservative rectangle.
  const min=new Vector3(Infinity,Infinity,Infinity),max=min.negate();let profileVertices=0;
  for(const mesh of root.getChildMeshes()){
   const positions=mesh.getVerticesData('position');if(!positions)continue;const matrix=mesh.computeWorldMatrix(true);
   for(let i=0;i<positions.length;i+=3){const point=Vector3.TransformCoordinates(Vector3.FromArray(positions,i),matrix);min.minimizeInPlace(point);max.maximizeInPlace(point);profileVertices++;assert.ok(Math.abs(point.x)<=profile.width/2+.001,id+' vertex leaves native width');assert.ok(Math.abs(point.z-(profile.centerZ??0))<=profile.depth/2+.001,id+' vertex leaves native depth');}
  }
  assert.ok(profileVertices>0);assert.ok(max.y-min.y<=profile.height+.001,id+' vertex height leaves native profile');
  t.diagnostic(JSON.stringify({id,profileVertices,actualSpan:[max.x-min.x,max.y-min.y,max.z-min.z],conservativeNativeSpan:[profile.width,profile.height,profile.depth]}));
  if(['rock-02-jagged-outcrop','cave-s01-solid-cliff-base'].includes(id)){
   const terrain=createWitchCaveTerrain();
   assert.equal(config.frontYawOffset??0,0,'lab cladding footprints require a centred unrotated source');
   for(const p of build().filter(p=>p.dressingRole.startsWith('laboratory-')&&p.asset===id)){
    const {root:labRoot,facing:labFacing}=createVillageTransform(world,p,config),labInstance=instantiateStaticMap(container,name=>p.id+'-'+name);for(const node of labInstance.rootNodes)node.parent=labFacing;
    let above=0,vertices=0,maxAbove=-Infinity,maxY=-Infinity;
    for(const mesh of labRoot.getChildMeshes()){const positions=mesh.getVerticesData('position');if(!positions)continue;const matrix=mesh.computeWorldMatrix(true);for(let i=0;i<positions.length;i+=3){const point=Vector3.TransformCoordinates(Vector3.FromArray(positions,i),matrix),height=point.y-terrain.heightAt(point.x,point.z);vertices++;if(height>.1)above++;maxAbove=Math.max(maxAbove,height);maxY=Math.max(maxY,point.y);}}
    assert.ok(above/vertices>.10,p.id+' is buried almost entirely');assert.ok(maxAbove>2.5,p.id+' has no substantial exposed rock');assert.ok(maxY>7.8&&maxY<10.7,p.id+' does not cover the lower laboratory wall');
    if(p.dressingRole==='laboratory-panel'){
     assert.ok(p.length>=6&&p.length<=9&&p.depth>=1.3&&p.depth<=2);
     const inverse=labRoot.computeWorldMatrix(true).clone().invert(),localMin=new Vector3(Infinity,Infinity,Infinity),localMax=localMin.negate();
     for(const mesh of labRoot.getChildMeshes()){const positions=mesh.getVerticesData('position');if(!positions)continue;const matrix=mesh.computeWorldMatrix(true).multiply(inverse);for(let i=0;i<positions.length;i+=3){const point=Vector3.TransformCoordinates(Vector3.FromArray(positions,i),matrix);localMin.minimizeInPlace(point);localMax.maximizeInPlace(point);}}
     assert.ok(Math.abs(config.bounds[0]*labRoot.scaling.x-p.length)<.001,p.id+' ignores authored native length');
     assert.ok(Math.abs(config.bounds[2]*labRoot.scaling.z-p.depth)<.001,p.id+' ignores authored native shallow depth');
     assert.ok((localMax.x-localMin.x)*labRoot.scaling.x<=p.length+.001,p.id+' geometry leaves authored length');
     assert.ok((localMax.z-localMin.z)*labRoot.scaling.z<=p.depth+.001,p.id+' geometry leaves authored shallow depth');
    }
    t.diagnostic(JSON.stringify({id:p.id,vertices,aboveTerrain:above,maxAboveTerrain:maxAbove,top:maxY}));labRoot.dispose();
   }
  }
  root.dispose();container.dispose();loader.dispose();
 }
});
