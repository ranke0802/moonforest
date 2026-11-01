import test from 'node:test';
import assert from 'node:assert/strict';
import {NullEngine,Scene,PBRMaterial,ArcRotateCamera,Vector3} from '@babylonjs/core';
import {TerrainHeightField} from '../src/terrain.js';
import {createTerrainGround} from '../src/terrain-mesh.js';
import {CAVE_LABORATORY_GEOMETRY,laboratoryEnabled,groundTriangleKey,clipLaboratoryCeiling} from '../src/cave-laboratory-geometry.js';
import {partitionCaveGround,CaveSurfaceShade} from '../src/witch-cave-surfaces.js';
import {buildCaveRockShell} from '../src/cave-rock-shell.js';
import {VillageTextureStreaming} from '../src/village-texture-streaming.js';
import {VILLAGE_TEXTURE_BUDGET} from '../src/village-texture-budget.js';
import {prepareVillageStart} from '../src/village-streamed-environment.js';
import {caveFogAllowsRecord,caveFogRootEnabled} from '../src/cave-fog-of-war.js';

const contract=extra=>({...CAVE_LABORATORY_GEOMETRY,enabled:true,version:1,revision:'unit-fixture-approved',sourceSha256:'1'.repeat(64),terrainSha256:'2'.repeat(64),bounds:{minX:-.5,maxX:.5,minZ:-.5,maxZ:.5},retiredGroundTriangles:[],...extra});
function area(positions,indices){let sum=0;for(let i=0;i<indices.length;i+=3){const ids=indices.slice(i,i+3),a=positions.slice(ids[0]*3,ids[0]*3+3),b=positions.slice(ids[1]*3,ids[1]*3+3),c=positions.slice(ids[2]*3,ids[2]*3+3);sum+=Math.abs((b[0]-a[0])*(c[2]-a[2])-(b[2]-a[2])*(c[0]-a[0]))*.5;}return sum;}
function containsXZ(p,positions,indices){for(let i=0;i<indices.length;i+=3){const ids=indices.slice(i,i+3),a=positions.slice(ids[0]*3,ids[0]*3+3),b=positions.slice(ids[1]*3,ids[1]*3+3),c=positions.slice(ids[2]*3,ids[2]*3+3),d=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);if(Math.abs(d)<1e-10)continue;const u=((b[2]-c[2])*(p[0]-c[0])+(c[0]-b[0])*(p[1]-c[2]))/d,v=((c[2]-a[2])*(p[0]-c[0])+(a[0]-c[0])*(p[1]-c[2]))/d;if(u>1e-7&&v>1e-7&&u+v<1-1e-7)return true;}return false;}

test('an inactive preparation contract does not change or allocate source geometry',()=>{
 const geometry={positions:new Float32Array([0,1,0]),indices:new Uint32Array()},disabled={...CAVE_LABORATORY_GEOMETRY,enabled:false};assert.equal(laboratoryEnabled(disabled),false);assert.equal(clipLaboratoryCeiling(geometry,disabled),geometry);
 assert.throws(()=>laboratoryEnabled({...contract(),sourceSha256:null}),/approved revision/);assert.throws(()=>laboratoryEnabled({...contract(),retiredGroundTriangles:[-1]}),/ownership/);
});

test('roof subtraction clips crossed triangles exactly and preserves outside area, normals and source bytes',()=>{
 const geometry={positions:Float32Array.from([-2,10,-2,2,10,-2,2,10,2,-2,10,2]),normals:Float32Array.from([0,-1,0,0,-1,0,0,-1,0,0,-1,0]),indices:Uint32Array.from([0,1,2,0,2,3])},source=structuredClone(geometry),clipped=clipLaboratoryCeiling(geometry,contract());
 assert.equal(area(clipped.positions,clipped.indices),15);assert.deepEqual(geometry,source);assert.ok(!containsXZ([.1,.2],clipped.positions,clipped.indices));assert.ok(containsXZ([1.3,.2],clipped.positions,clipped.indices));
 for(let i=0;i<clipped.normals.length;i+=3)assert.deepEqual(Array.from(clipped.normals.slice(i,i+3)),[0,-1,0]);
 for(let i=0;i<clipped.indices.length;i+=3){const ids=clipped.indices.slice(i,i+3),a=clipped.positions.slice(ids[0]*3,ids[0]*3+3),b=clipped.positions.slice(ids[1]*3,ids[1]*3+3),c=clipped.positions.slice(ids[2]*3,ids[2]*3+3);assert.ok((b[0]-a[0])*(c[2]-a[2])-(b[2]-a[2])*(c[0]-a[0])>0,'source winding retained');}
});

test('ground detail and sparse cover both leave the same retired triangle empty without touching retained vertex attributes',t=>{
 const engine=new NullEngine(),scene=new Scene(engine),terrain=new TerrainHeightField({size:8,subdivisions:8,height:()=>0});t.after(()=>engine.dispose());
 const ground=createTerrainGround(scene,terrain);partitionCaveGround(ground,terrain);const before={positions:[...ground.getVerticesData('position')],normals:[...ground.getVerticesData('normal')],uvs:[...ground.getVerticesData('uv')]},key=(3*8+3)*2;
 const original=Array.from(ground.getIndices()),cut=original.filter((_,i)=>groundTriangleKey(...original.slice(Math.floor(i/3)*3,Math.floor(i/3)*3+3),8)!==key);
 partitionCaveGround(ground,terrain,{laboratory:contract({retiredGroundTriangles:[key]})});assert.equal(ground.getTotalIndices()/3,127);assert.deepEqual(Array.from(ground.getIndices()),cut);assert.deepEqual([...ground.getVerticesData('position')],before.positions);assert.deepEqual([...ground.getVerticesData('normal')],before.normals);assert.deepEqual([...ground.getVerticesData('uv')],before.uvs);
 const shell=buildCaveRockShell(ground,terrain),source=ground.getVerticesData('position'),a=3*9+3,b=a+1,d=a+10,point=[(source[a*3]+source[b*3]+source[d*3])/3,(source[a*3+2]+source[b*3+2]+source[d*3+2])/3];
 assert.equal(containsXZ(point,shell.positions,shell.indices),false,'coarse cover never fills a retired source triangle');assert.ok(containsXZ([-.8,.2],shell.positions,shell.indices),'positive retained cover control');
 for(let i=0;i<ground.getIndices().length;i+=3){const [a,b,c]=ground.getIndices().slice(i,i+3);assert.notEqual(groundTriangleKey(a,b,c,8),key);}
});

test('palette-only native receives zero unrelated UV mixing while original rocks keep their quarter detail and no new texture',t=>{
 const engine=new NullEngine(),scene=new Scene(engine);t.after(()=>engine.dispose());const material=new PBRMaterial('fixture',scene),plugin=new CaveSurfaceShade(material),values={};const buffer={updateFloat:(k,v)=>values[k]=v,updateFloat4(){}};
 material.metadata={caveRockTone:true};plugin.bindForSubMesh(buffer);assert.equal(values.caveRockPaintedWeight,.25);const textureCount=scene.textures.length;material.metadata.caveRockPaletteOnly=true;plugin.bindForSubMesh(buffer);assert.equal(values.caveRockPaintedWeight,0);assert.equal(scene.textures.length,textureCount);assert.match(plugin.getCustomCode('fragment').CUSTOM_FRAGMENT_BEFORE_FINALCOLORCOMPOSITION,/caveRockPaintedWeight/);
});

test('a textureless native structure cannot increase the compressed mobile high-texture budget',t=>{
 const engine=new NullEngine(),scene=new Scene(engine);t.after(()=>engine.dispose());engine.getCaps().etc2={};const assets=new Map([['old',{config:{highTextures:{textures:{albedo:{codec:'etc1s'}}}}}],['derived',{config:{surfaceStyle:'cave-palette'}}]]),world={scene,touchDevice:true};
 const streaming=new VillageTextureStreaming(world,assets,[],new URL('https://lab.test/assets/witch-cave.json'),{});assert.equal(streaming.budget,VILLAGE_TEXTURE_BUDGET.mobileCompressed);streaming.dispose();
});

test('closed structure far tier is startup-required outside FoW and its root cannot open before structural readiness',async t=>{
 const engine=new NullEngine(),scene=new Scene(engine),camera=new ArcRotateCamera('fixture',0,1,5,Vector3.Zero(),scene),previousLocation=globalThis.location;globalThis.location={href:'https://essential-native.test/game/'};t.after(()=>{globalThis.location=previousLocation;engine.dispose();});
 const tier=level=>({level,model:'./content/'+String(level).repeat(64)+'.gltf',resources:['./content/'+String(level).repeat(64)+'.gltf'],textureSize:0}),config={category:'rock',bounds:[25,20,23],height:20,geometryLod:true,lods:[tier(0),tier(1),tier(2)],mobileNear:tier(0),essentialStructural:true};
 t.mock.method(globalThis,'fetch',async()=>({ok:true,json:async()=>({complete:true,assets:{fixture:config}})}));
 const world={scene,camera,cave:true,touchDevice:true,terrain:{heightAt:()=>0},environmentManifest:'witch-cave',placements:[{id:'native',asset:'fixture',kind:'rock',x:100,z:100,yaw:0,scale:1}],caveFog:{fog:{ready:true,boundsVisible:()=>false},updateRecords(records){for(const r of records){r.fogVisible=caveFogAllowsRecord(this.fog,r);r.root.setEnabled(caveFogRootEnabled(r));}}}};
 const prepared=await prepareVillageStart(world);assert.deepEqual(prepared.plan.map(p=>[p.id,p.level]),[['fixture',2]]);assert.equal(prepared.records[0].root.isEnabled(),false);prepared.records[0].structuralReady=true;prepared.records[0].cellActive=false;prepared.records[0].occluded=true;world.caveFog.updateRecords(prepared.records);assert.equal(prepared.records[0].root.isEnabled(),true,'the ready enclosure remains a closed depth surface, with its pixel FoW still active');
});
