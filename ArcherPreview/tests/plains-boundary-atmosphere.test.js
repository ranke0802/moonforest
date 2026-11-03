import test from 'node:test';
import assert from 'node:assert/strict';
import {NullEngine,Scene,Vector3,HemisphericLight,DirectionalLight} from '@babylonjs/core';
import {SceneLighting} from '../src/scene-lighting.js';
import {SKY_HORIZON} from '../src/sky.js';
import {VILLAGE_PLAINS_BOUNDARY} from '../src/village-plains-boundary.js';
import {FOREST_PLAINS_BOUNDARY} from '../src/plains-forest-boundary.js';
import {PLAINS_FOREST_ATMOSPHERE,plainsForestAtmosphereWeight,updatePlainsBoundaryAtmosphere} from '../src/plains-boundary-atmosphere.js';

const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,`${a} != ${b}`);
function fixture(t){
 const engine=new NullEngine(),scene=new Scene(engine);t.after(()=>engine.dispose());scene.fogColor=SKY_HORIZON.clone();scene.imageProcessingConfiguration.exposure=1.15;
 const ambient=new HemisphericLight('ambient',new Vector3(0,1,.3),scene),key=new DirectionalLight('key',new Vector3(-.4,-1,-.6),scene),rim=new DirectionalLight('rim',new Vector3(.5,-.3,.7),scene),shadowMap={resetRefreshCounter(){},getSize:()=>({width:1024})},shadows={getShadowMap:()=>shadowMap};
 const lighting=new SceneLighting(scene,{ambient,key,rim,shadows,touchDevice:false,village:false}),sky={mesh:{rotation:{y:0}}};
 const world={mapId:'great-plains',scene,lighting,sky};lighting.setWorldYaw(VILLAGE_PLAINS_BOUNDARY.yaw);return world;
}
const at=distance=>({x:FOREST_PLAINS_BOUNDARY.plainsPortal.x+distance,z:FOREST_PLAINS_BOUNDARY.plainsPortal.z});

test('the forest edge matches its rotated light and fog while preserving the plains exposure',t=>{
 const w=fixture(t),base=VILLAGE_PLAINS_BOUNDARY.yaw,target=FOREST_PLAINS_BOUNDARY.yaw;
 let dirty=0;w.scene.imageProcessingConfiguration.onUpdateParameters.add(()=>dirty++);
 assert.equal(updatePlainsBoundaryAtmosphere(w,at(70),true),true);near(w.lighting.worldYaw,base);near(w.sky.mesh.rotation.y,base);near(w.scene.fogColor.r,SKY_HORIZON.r);near(w.scene.imageProcessingConfiguration.exposure,1.15);
 assert.equal(updatePlainsBoundaryAtmosphere(w,at(18)),true);near(w.lighting.worldYaw,target);near(w.sky.mesh.rotation.y,target);near(w.scene.fogColor.r,.19);near(w.scene.fogColor.g,.23);near(w.scene.fogColor.b,.21);near(w.scene.imageProcessingConfiguration.exposure,1.15);
 const original=w.lighting.canonicalDirections.base,c=Math.cos(target),s=Math.sin(target);near(w.lighting.key.direction.x,c*original.x+s*original.z);near(w.lighting.key.direction.z,-s*original.x+c*original.z);assert.equal(dirty,0,'no scene-wide image processing invalidation');
});

test('the 18–60 metre transition is smooth, reversible and changes no state at rest',t=>{
 const w=fixture(t),weights=[60,50,40,30,18].map(d=>plainsForestAtmosphereWeight(at(d)));assert.equal(weights[0],0);assert.equal(weights.at(-1),1);for(let i=1;i<weights.length;i++)assert.ok(weights[i]>weights[i-1]);
 const h=.001;assert.ok(plainsForestAtmosphereWeight(at(60-h))<1e-8);assert.ok(1-plainsForestAtmosphereWeight(at(18+h))<1e-8);
 updatePlainsBoundaryAtmosphere(w,at(39));const yaw=w.lighting.worldYaw,exposure=w.scene.imageProcessingConfiguration.exposure;
 for(let i=0;i<100;i++)assert.equal(updatePlainsBoundaryAtmosphere(w,at(39)),false);
 updatePlainsBoundaryAtmosphere(w,at(18));updatePlainsBoundaryAtmosphere(w,at(39));near(w.lighting.worldYaw,yaw);near(w.scene.imageProcessingConfiguration.exposure,exposure);
});

test('other maps are untouched and a forced re-entry resets stale map state before rendering',t=>{
 const w=fixture(t);updatePlainsBoundaryAtmosphere(w,at(18));w.mapId='monster-forest';w.lighting.setWorldYaw(0);w.sky.mesh.rotation.y=0;w.scene.fogColor.set(.19,.23,.21);w.scene.imageProcessingConfiguration.exposure=1.08;
 assert.equal(updatePlainsBoundaryAtmosphere(w,at(70)),false);near(w.lighting.worldYaw,0);near(w.sky.mesh.rotation.y,0);near(w.scene.imageProcessingConfiguration.exposure,1.08);
 w.mapId='great-plains';w.lighting.setWorldYaw(VILLAGE_PLAINS_BOUNDARY.yaw);w.scene.fogColor=SKY_HORIZON.clone();w.scene.imageProcessingConfiguration.exposure=1.15;
 assert.equal(updatePlainsBoundaryAtmosphere(w,at(18),true),true);near(w.lighting.worldYaw,FOREST_PLAINS_BOUNDARY.yaw);near(w.scene.fogColor.g,.23);near(w.scene.imageProcessingConfiguration.exposure,1.15);
 assert.equal(PLAINS_FOREST_ATMOSPHERE.innerRadius,18);assert.equal(PLAINS_FOREST_ATMOSPHERE.outerRadius,60);
});
