import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ArcRotateCamera,DirectionalLight,FreeCamera,Matrix,NullEngine,RawTexture,Scene,ShadowGenerator,Vector3} from '@babylonjs/core';
import '@babylonjs/loaders/glTF/glTFFileLoader.js';
import {GLTFLoader} from '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import {VillageNavigation} from '../src/village-navigation.js';
import {installVillageShadowFade,shadowFadeAttribute} from '../src/village-shadow-fade.js';
import {planHorseApproach,planHorseCall,planHorseDeparture,findHorseDismount,startHorseTravel} from '../src/v03/riding-horse-path.js';
import {createWagonHorse} from '../src/v03/wagon-horse.js';
import {mapNavigation} from '../src/world.js';
import {prepareFixedLayouts,fixedPlacements} from '../src/fixed-layouts.js';
import {setWorldCharacter} from '../src/world-limits.js';
import {FOREST_PLACEMENTS} from '../src/monster-forest-layout.js';
import {createVillageTerrain} from '../src/village-terrain.js';
import {createGreatPlainsTerrain} from '../src/great-plains-terrain.js';
import {createMonsterForestTerrain} from '../src/monster-forest-terrain.js';
import {settlementPlacements} from '../src/v03/settlement-scenery.js';

const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} differs from ${b}`);
const worldFor=(obstacles=[])=>({mapId:'village',navigation:new VillageNavigation(obstacles),
  terrain:{heightAt:(x,z)=>.12*x-.07*z},camera:{position:{x:0,z:-5}}});
const rider={position:{x:0,z:0}};
function drive(plan,departing,visit){
  let pose,opacity,clip;
  const saddle={visibility:1},clips=[];
  const horse={place(x,z,yaw){pose={x,z,yaw};},setOpacity(value){opacity=value;},play(name){clip=name;clips.push(name);}};
  const travel=startHorseTravel(horse,plan,{departing,saddle});
  let frames=0,previous=opacity,progress=0;
  near(travel.progress,0);near(travel.speed,plan.stationary?0:5.8);
  near(opacity,departing?1:0);
  while(true){
    visit?.(pose,opacity);
    assert.equal(saddle.visibility,opacity);
    assert.ok(departing?opacity<=previous:opacity>=previous);
    assert.ok(travel.progress>=progress&&travel.progress<=1);
    near(travel.speed,plan.stationary?0:clip==='Horse_Walk'?2.15:5.8);progress=travel.progress;
    previous=opacity;
    if(travel.update(1/60))break;
    assert.ok(++frames<450);
  }
  near(opacity,departing?0:1);near(pose.x,plan.end.x);near(pose.z,plan.end.z);near(pose.yaw,plan.heading);
  assert.equal(travel.update(.5),true);
  near(travel.speed,0);near(travel.progress,1);
  assert.deepEqual(clips,plan.stationary?['Horse_Idle']:departing?['Horse_Gallop']:['Horse_Gallop','Horse_Walk','Horse_Idle']);
  return {frames,clip};
}

test('rear camera spawn approaches the right flank at eight view angles, leaving the left stirrup and standing point clear',()=>{
  const world=worldFor();
  for(const heading of [0,1.14])for(let i=0;i<8;i++){
    const eye=world.camera.position={x:5*Math.sin(i*Math.PI/4),z:5*Math.cos(i*Math.PI/4)};
    const plan=planHorseApproach(world,rider,heading);assert.ok(plan);
    assert.ok((plan.start.x-eye.x)*eye.x+(plan.start.z-eye.z)*eye.z>0);
    near(plan.end.x*Math.cos(heading)-plan.end.z*Math.sin(heading),-.94);
    near(plan.end.x*Math.sin(heading)+plan.end.z*Math.cos(heading),.09);
    const standing=findHorseDismount(world,plan.end,heading);near(standing.x,0);near(standing.y,0);near(standing.z,0);
    drive(plan,false,p=>{
      // Verify the oriented horse envelope against the player's body including at turns.
      for(let d=-1.44;d<=.911;d+=.035){
        assert.ok(Math.hypot(p.x+d*Math.sin(p.yaw),p.z+d*Math.cos(p.yaw))>.47+.32);
      }
    });
    const leave=planHorseDeparture(world,plan.end,heading);assert.ok(leave);
    assert.ok((leave.end.x-leave.start.x)*Math.sin(heading)+(leave.end.z-leave.start.z)*Math.cos(heading)>7);
    drive(leave,true);assert.equal(world.navigation.grids.size,0);
  }
});

test('phone and desktop orbits see the body turn opaque inside the screen as the horse runs in',t=>{
  for(const [width,height,radius] of [[390,844,13],[1280,720,17]]){
    const engine=new NullEngine({renderWidth:width,renderHeight:height}),scene=new Scene(engine);
    try{
      scene.useRightHandedSystem=true;
      const world=worldFor();
      for(const alpha of [-Math.PI/2,Math.PI/2]){
        const camera=world.camera=new ArcRotateCamera('orbit',alpha,1.12,radius,new Vector3(0,1,0),scene);
        const approach=planHorseApproach(world,rider,0);assert.ok(approach);
        const rect=camera.viewport.toGlobal(width,height),view=camera.getTransformationMatrix();
        let entry=null,translucent=0,opaque=0;
        drive(approach,false,(p,opacity)=>{
          const at=new Vector3(p.x,world.terrain.heightAt(p.x,p.z)+1.1,p.z);
          const screen=Vector3.Project(at,Matrix.IdentityReadOnly,view,rect);
          if(screen.z<=0||screen.z>1||screen.x<0||screen.x>width||screen.y<0||screen.y>height)return;
          entry??=opacity;if(opacity>.05&&opacity<.95)translucent++;
          if(opacity===1)opaque++;
        });
        assert.ok(entry!==null&&entry<.28,`screen entry alpha ${entry}`);assert.ok(translucent>=10&&opaque>=10);
        t.diagnostic(`${width}×${height}, orbit ${Math.round(alpha*180/Math.PI)}°: entry alpha ${entry.toFixed(3)}, ${translucent} fading frames`);
        camera.dispose();
      }
    }finally{scene.dispose();engine.dispose();}
  }
});

test('wall, rider clearance and terrain apply to the full approach, left-side transfer and forward departure',()=>{
  const obstacle=(x,z,radius)=>({id:'tree',x,z,radius,height:3});
  const world=worldFor([obstacle(-.35,-4.7,.65)]);
  const plan=planHorseApproach(world,rider,0);assert.ok(plan);
  drive(plan,false,p=>{
    for(let d=-1.44;d<=.911;d+=.04){
      assert.ok(world.navigation.free({x:p.x+d*Math.sin(p.yaw),z:p.z+d*Math.cos(p.yaw)},.47));
    }
  });
  assert.equal(planHorseApproach(worldFor([obstacle(-.94,.09,.35)]),rider,0),null);
  assert.equal(findHorseDismount(worldFor([obstacle(.94,-.09,.43)]),rider.position,0),null);
  const wall=worldFor([obstacle(0,1.3,.7)]),leave=planHorseDeparture(wall,rider.position,0);
  assert.ok(leave);drive(leave,true);
  const narrow=worldFor([obstacle(0,1.1,.69),obstacle(-.95,1.05,.57),obstacle(.95,1.05,.57)]);
  const still=planHorseDeparture(narrow,rider.position,0);assert.ok(still.stationary);
  drive(still,true,p=>{near(p.x,0);near(p.z,0);});
  const cliff=worldFor();
  cliff.terrain.heightAt=(x,z)=>z< -3?-5:0;
  // 2026-11-26: a drop behind the camera no longer refuses the call. The horse comes
  // from the level ground and never crosses the edge.
  const ledge=planHorseApproach(cliff,rider,0);assert.ok(ledge);
  drive(ledge,false,p=>assert.ok(p.z>=-3,'the horse stays on the level ground'));
  // No level ground for the stage behind its place: still refused.
  cliff.terrain.heightAt=(x,z)=>Math.hypot(x,z)>1.2?-5:0;
  assert.equal(planHorseApproach(cliff,rider,0),null);
  cliff.terrain.heightAt=(x,z)=>x>.55?1.8:0;
  assert.equal(findHorseDismount(cliff,rider.position,0),null);
});

test('a call near a map edge succeeds wherever the horse can stand: other run-ins, a step out from behind, another facing',async()=>{
  // 2026-11-26, user: just after a map change the call was refused on open ground. The
  // run-in from behind the camera left the map or crossed roadside trees.
  await prepareFixedLayouts(['village','great-plains']);
  try{
    setWorldCharacter('warrior-v3');
    const placements=settlementPlacements('village',fixedPlacements('village'));
    const world={mapId:'village',terrain:createVillageTerrain(),navigation:mapNavigation({village:true,plains:false,forest:false,placements,gameplayV03:true}),camera:{}};
    // The arrival from the plains, on the exit road. Every facing and camera side passes.
    const arrival={position:{x:.35,z:70}};
    for(const distance of [8,12])for(let h=0;h<8;h++)for(let c=0;c<8;c++){
      world.camera.position={x:arrival.position.x+distance*Math.sin(c*Math.PI/4),z:arrival.position.z+distance*Math.cos(c*Math.PI/4)};
      const plan=planHorseApproach(world,arrival,h*Math.PI/4);
      assert.ok(plan,`facing ${h}, camera ${c} at ${distance} m`);
      drive(plan,false,(p,opacity)=>{if(opacity>0)assert.ok(world.navigation.free(p,.64,80),'the horse stays clear of solids and inside the road limit');});
    }
    // With the camera's back to the edge (z 80 is the limit) the run-in comes from elsewhere.
    world.camera.position={x:.35,z:80};
    const turned=planHorseApproach(world,arrival,Math.PI);assert.ok(turned);
    assert.ok(turned.start.z<80&&Math.hypot(turned.start.x,turned.start.z)<=80);
    // On the shoulder a tree can take the horse's place at this facing; the call turns the caller.
    let turnedCalls=0,refused=0,spots=0;
    for(let x=-15;x<=15;x+=2.5)for(let z=58;z<=77;z+=2.5){
      const actor={position:{x,z}};
      if(!world.navigation.free(actor.position,.32,80))continue;
      spots++;world.camera.position={x:x+8,z:z+6};
      const call=planHorseCall(world,actor,0);
      if(!call){refused++;continue;}
      assert.ok(call.route);if(call.turn){turnedCalls++;assert.equal(planHorseApproach(world,actor,0),null);}
      near(call.route.heading,call.turn);
    }
    assert.ok(spots>=80&&turnedCalls>0);
    assert.ok(refused<=spots*.05,`${refused} of ${spots} standable spots still refuse`);
  }finally{setWorldCharacter(null);}
});

test('chapter streets, plains wagon road and monster-forest road admit a complete ride on their shipped terrain and collision layouts',async()=>{
  await prepareFixedLayouts(['village','great-plains']);
  try{
    for(const [mapId,character,terrainAt,x,z] of [
      ['village','warrior-v3',createVillageTerrain,6,-6],
      ['great-plains','warrior-plains',createGreatPlainsTerrain,-72.87,-29],
      ['monster-forest','warrior-v4',createMonsterForestTerrain,0,35],
    ]){
      setWorldCharacter(character);
      const forest=mapId==='monster-forest',plains=mapId==='great-plains';
      const placements=settlementPlacements(mapId,forest?FOREST_PLACEMENTS:fixedPlacements(mapId));
      const terrain=terrainAt(),navigation=mapNavigation({village:true,plains,forest,placements,gameplayV03:true});
      const world={mapId,terrain,navigation,camera:{}},actor={position:{x,z}};
      let passes=0;
      for(let i=0;i<8;i++){
        const yaw=i*Math.PI/4,heading=Math.PI-yaw;
        world.camera.position={x:x+10*Math.sin(yaw),z:z+10*Math.cos(yaw)};
        const approach=planHorseApproach(world,actor,heading);
        if(!approach)continue;
        const clear=(p,opacity)=>{
          if(opacity>0)assert.ok(navigation.free(p,.64),mapId+' horse centre entered a solid');
          assert.ok(Number.isFinite(terrain.heightAt(p.x,p.z)));
        };
        drive(approach,false,clear);
        const leave=planHorseDeparture(world,approach.end,heading);assert.ok(leave);
        drive(leave,true,clear);passes++;
      }
      assert.ok(passes>=2,`${mapId} has only ${passes} clear approaches`);
      assert.equal(navigation.grids.size,0);
    }
  }finally{setWorldCharacter(null);}
});

test('packed animated horse and hull fade together, share the skinned shadow and leave no mesh, skeleton or caster on release',async t=>{
  const bytes=readFileSync(new URL('../src/v03/models/wagon-horse-rig.glb',import.meta.url));
  t.mock.method(globalThis,'fetch',async()=>new Response(bytes));
  t.mock.method(GLTFLoader.prototype,'_loadTextureAsync',function(_context,texture,assign){
    const image=RawTexture.CreateRGBATexture(new Uint8Array([70,45,35,255]),1,1,this.babylonScene,false,false);
    image.getInternalTexture().isReady=true;image.name=texture.name;assign(image);return Promise.resolve(image);
  });
  const engine=new NullEngine(),scene=new Scene(engine);
  try{
    scene.useRightHandedSystem=true;
    new FreeCamera('camera',new Vector3(0,3,-5),scene).setTarget(Vector3.Zero());
    const shadows=new ShadowGenerator(32,new DirectionalLight('sun',new Vector3(.5,-1,.3),scene));
    installVillageShadowFade(shadows);const map=shadows.getShadowMap();
    for(let cycle=0;cycle<2;cycle++){
      const world=worldFor(),heightAt=world.terrain.heightAt;
      const horse=createWagonHorse({scene,heightAt,wagon:rider.position,shadows,mounted:true,initialOpacity:0});
      assert.ok(await horse.ready);
      const skin=scene.getMeshByName('wagon_horse'),shell=skin.getChildMeshes(true)[0];
      assert.ok(shell.metadata.moonforestOutline&&shell.skeleton===skin.skeleton);
      assert.equal(scene.getMeshByName('harness').isEnabled(),false);
      assert.deepEqual(map.renderList.map(mesh=>mesh.name),[skin.name]);near(skin.visibility,0);near(shell.visibility,0);
      const material=skin.material,source=skin.subMeshes[0].getMaterial(true,map.renderPassId);
      const plan=planHorseApproach(world,rider,0),arrival=startHorseTravel(horse,plan);
      assert.equal(arrival.update(.12),false);
      assert.ok(skin.visibility>0&&skin.visibility<1);near(shell.visibility,skin.visibility);
      assert.equal(material.needAlphaBlendingForMesh(skin),true);
      assert.equal(source.needAlphaBlendingForMesh(skin),false);
      near(skin.instancedBuffers[shadowFadeAttribute],skin.visibility);
      near(horse.root.position.y,heightAt(horse.root.position.x,horse.root.position.z));
      assert.equal(horse.clip,'Horse_Gallop');scene.render();
      assert.equal(arrival.update(20),true);
      near(skin.visibility,1);assert.equal(material.needAlphaBlendingForMesh(skin),false);
      assert.equal(horse.clip,'Horse_Idle');assert.equal(shell.isEnabled(),true);scene.render();
      if(cycle===0){
        horse.place(0,0,0);
        const point=Vector3.Zero(),worldPoint=Vector3.Zero();
        for(const clip of ['Horse_Idle','Horse_Walk','Horse_Gallop']){
          for(const group of scene.animationGroups)group.stop();
          const group=scene.animationGroups.find(g=>g.name===clip);
          group.start(true,1,group.from,group.to);group.setWeightForAllAnimatables(1);
          let widest=0;
          for(let i=0;i<24;i++){
            group.goToFrame(group.from+(group.to-group.from)*i/24);scene.render();
            const vertices=skin.getPositionData(true),matrix=skin.computeWorldMatrix(true);
            for(let j=0;j<vertices.length;j+=3){
              Vector3.FromArrayToRef(vertices,j,point);Vector3.TransformCoordinatesToRef(point,matrix,worldPoint);
              const z=Math.max(-1.44,Math.min(.91,worldPoint.z));
              widest=Math.max(widest,Math.hypot(worldPoint.x,worldPoint.z-z));
            }
          }
          assert.ok(widest<=.47,`${clip} left the checked capsule by ${widest-.47} m`);
        }
      }
      const departure=startHorseTravel(horse,planHorseDeparture(world,plan.end,0),{departing:true});
      assert.equal(departure.update(20),true);near(skin.visibility,0);near(shell.visibility,0);
      near(skin.instancedBuffers[shadowFadeAttribute],0);
      horse.dispose();horse.dispose();
      assert.equal(skin.isDisposed(),true);assert.equal(shell.isDisposed(),true);
      assert.equal(map.renderList.length,0);assert.equal(scene.meshes.length,0);
      assert.equal(scene.skeletons.length,0);assert.equal(scene.animationGroups.length,0);
    }
  }finally{scene.dispose();engine.dispose();}
});
