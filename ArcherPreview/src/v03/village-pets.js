import {TransformNode} from '@babylonjs/core/Meshes/transformNode.js';
import {AmbientView} from '../ambient-view.js';
import {applyMonsterToon} from '../monster-toon.js';
import {attachCharacterOutlines} from '../character-outlines.js';
import {loadOwnedModel} from './owned-model.js';
import {PET_MODELS} from './village-pet-assets.js';

export const VILLAGE_PETS = Object.freeze([
  {id:'adventurer-dog', origin:[-4.1,13.9], speed:.59, roam:4.2, radius:.22},
  {id:'scarf-cat', origin:[4,6.6], speed:.38, roam:3.3, radius:.15},
  {id:'courier-bird', origin:[1.5,-3.8], speed:.34, roam:2.1, radius:.09},
  {id:'map-mouse', origin:[-4.2,-.2], speed:.22, roam:2.3, radius:.08},
]);
const LOAD_RADIUS=14, HIDE_RADIUS=23, NEAR_PREP_RADIUS=4.5;
const distance2=(a,b)=>(a.x-b.x)**2+(a.z-b.z)**2;
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));

function findPetHome(nav,home,radius){
  if(nav.free(home,radius))return home;
  // A new inn or a stall may cover a former anchor. Keep the pet within
  // its own yard and bound the work even if no adjacent ground is open.
  for(const ring of [.4,1,2]){
    for(let i=0;i<8;i++){
      const angle=i*Math.PI/4;
      const next={x:home.x+ring*Math.cos(angle),z:home.z+ring*Math.sin(angle)};
      if(nav.free(next,radius))return next;
    }
  }
  return null;
}

// Endpoints and their swept connection must be walkable. Test a handful of
// local directions only when setting out. No grid searches on the render loop.
export function pickPetStep(nav,origin,at,config,seed) {
  for(let i=0;i<8;i++){
    const angle=(seed+i*.381966)*Math.PI*2;
    const length=config.roam*(.55+.45*Math.abs(Math.sin(i+seed*3)));
    const next={x:origin.x+Math.sin(angle)*length,z:origin.z+Math.cos(angle)*length};
    if(distance2(at,next)<.64||!nav.free(next,config.radius)||!nav.segmentClear(at,next,config.radius))continue;
    return next;
  }
  return null;
}

async function loadVisual(scene,url,id,signal){
  const owner=await loadOwnedModel(scene,url,{signal});
  let root;
  try{
    signal?.throwIfAborted();
    root=new TransformNode('v03-pet-'+id,scene);root.setEnabled(false);
    for(const node of owner.rootNodes)node.parent=root;
    for(const mesh of owner.meshes){mesh.isPickable=false;mesh.receiveShadows=true;}
    applyMonsterToon(owner);
    for(const mesh of owner.meshes){
      mesh.metadata={...mesh.metadata,characterStyleOverrideGroup:'wolf',exteriorInkOnly:true};
      if(mesh.material?.metadata?.moonforestMonsterToon)owner.own(mesh.material);
    }
    attachCharacterOutlines(owner,'wolf',{skipBoneProof:true});
    const clips=new Map(owner.animationGroups.map(g=>[g.name,g]));
    for(const group of clips.values())group.stop();
    let current,sleepClip=null,sleepFrame=0,sleepTime=0;
    return {
      pose(x,y,z,yaw,walking,speed,visible,clock=0){
        root.setEnabled(visible);
        const desired=visible?clips.get(walking?'Walk':'Idle'):null;
        if(current!==desired){
          if(!visible&&current){sleepClip=current;sleepFrame=current.getCurrentFrame();sleepTime=clock;}
          current?.stop();current=desired;
          if(current){
            const rate=walking?speed:1;
            current.start(true,rate);
            const span=current.to-current.from,fps=current.targetedAnimations[0].animation.framePerSecond;
            const phase=current===sleepClip&&span>0?(sleepFrame-current.from+(clock-sleepTime)*fps*rate)%span:0;
            current.goToFrame(current.from+phase);
            sleepClip=null;
          }
        }
        if(visible){root.position.set(x,y,z);root.rotation.y=yaw;}
      },
      dispose(){owner.dispose();root.dispose();}
    };
  }catch(error){owner.dispose();root?.dispose();throw error;}
}

// Created per playable village visit, disposed on title / travel. The pending
// import owns late disposal, even when it finishes in another scene.
export function createVillagePets(world,{models=PET_MODELS,load=loadVisual,view=new AmbientView()}={}){
  let disposed=false,pending=false,clock=0,nearSleepers=false,playerX=0,playerZ=0;
  const visit=new AbortController();
  const residents=VILLAGE_PETS.filter(s=>models[s.id]).map((config,i)=>{
    const home={x:config.origin[0],z:config.origin[1]};
    return {config,home,x:home.x,z:home.z,y:0,yaw:i*1.4,wait:1.2+i*.85,serial:i,
      target:null,visual:null,nextCheck:0,lastUpdate:0,hidden:true,walking:false,retryAt:0,anchored:false};
  });
  function tickPet(p,elapsed){
    if(!p.target){
      p.wait-=elapsed;
      if(p.wait<=0){
        p.target=pickPetStep(world.navigation,p.home,p,p.config,(++p.serial*.618034)%1);
        if(!p.target)p.wait=2;
      }
    }
    let walking=false;
    if(p.target){
      const dx=p.target.x-p.x,dz=p.target.z-p.z,d=Math.hypot(dx,dz);
      const desired=Math.atan2(dx,dz),diff=wrap(desired-p.yaw);
      p.yaw+=Math.sign(diff)*Math.min(Math.abs(diff),4.8*elapsed);
      if(Math.abs(wrap(desired-p.yaw))<.25&&d>.001){
        const step=Math.min(d,p.config.speed*elapsed);
        p.x+=dx/d*step;p.z+=dz/d*step;walking=step>0;
        if(step>=d){p.target=null;p.wait=2+(p.serial%4)*.7;}
      }
    }
    return walking;
  }
  function advance(p,hidden){
    const elapsed=Math.max(0,clock-p.lastUpdate),wasHidden=p.hidden,previousYaw=p.yaw;
    p.lastUpdate=clock;p.nextCheck=clock+1;p.hidden=hidden;
    const walking=elapsed>0?tickPet(p,elapsed):p.walking;
    if(walking&&elapsed>0)p.y=world.terrain?.heightAt?.(p.x,p.z)??0;
    if(hidden){
      if(!wasHidden)p.visual.pose(p.x,p.y,p.z,p.yaw,false,1,false,clock);
    }else if(wasHidden||walking||p.walking||previousYaw!==p.yaw){
      p.visual.pose(p.x,p.y,p.z,p.yaw,walking,1,true,clock);
    }
    p.walking=walking;
  }
  // Camera input/follow can rotate the actual camera after the gameplay tick.
  // Wake a newly revealed pet before mesh selection, even on a fast turn.
  const draw=world.scene?.onBeforeRenderObservable;
  const observer=draw?.add(()=>{
    if(!nearSleepers||disposed)return;
    const camera=view.camera,viewId=view.viewId,projId=view.projId,valid=view.valid;
    view.prepare(world,false);
    if(valid&&view.valid&&camera===view.camera&&viewId===view.viewId&&projId===view.projId)return;
    for(const p of residents){
      if(p.hidden&&p.visual&&(p.x-playerX)**2+(p.z-playerZ)**2<=HIDE_RADIUS**2&&!view.hidden(p.x,p.y+.5,p.z,1.3))advance(p,false);
    }
  });
  return {
    update(dt,player){
      if(disposed||!player||!residents.length||!world.navigation)return;
      clock+=Math.max(0,Math.min(.25,dt));
      nearSleepers=false;playerX=player.x;playerZ=player.z;
      let viewReady=false;
      let candidate=null,best=LOAD_RADIUS**2;
      for(const p of residents){
        const d2=distance2(p,player);
        // Pets only receive shadows. No offscreen pet can cast one into view.
        if(!viewReady && (p.visual ? d2<=HIDE_RADIUS**2 : !pending&&d2<best&&clock>=p.retryAt)){
          view.prepare(world,false);viewReady=true;
        }
        if(!p.visual){
          if(d2<best&&!pending&&clock>=p.retryAt&&(d2<NEAR_PREP_RADIUS**2||!view.hidden(p.x,p.y+.5,p.z,1.3))){
            candidate=p;best=d2;
          }
          continue;
        }
        const hidden=d2>HIDE_RADIUS**2||view.hidden(p.x,p.y+.5,p.z,1.3);
        if(hidden&&d2<=HIDE_RADIUS**2)nearSleepers=true;
        if(hidden&&p.hidden&&clock<p.nextCheck)continue;
        // One-second offscreen steps preserve activity. On a turn, the same
        // clock advances the actor before its first visible pose is presented.
        advance(p,hidden);
      }
      if(candidate){
        const p=candidate;
        if(!p.anchored){
          const free=findPetHome(world.navigation,p.home,p.config.radius);
          if(!free){p.retryAt=clock+5;return;}
          p.home={x:free.x,z:free.z};p.x=free.x;p.z=free.z;p.anchored=true;
        }
        pending=true;
        Promise.resolve().then(()=>disposed?null:load(world.scene,models[p.config.id],p.config.id,visit.signal)).then(visual=>{
          if(!visual)return;
          if(disposed){visual.dispose();return;}
          p.visual=visual;p.lastUpdate=clock;p.nextCheck=0;
          p.y=world.terrain?.heightAt?.(p.x,p.z)??0;
          visual.pose(p.x,p.y,p.z,p.yaw,false,1,false);
        }).catch(error=>{
          p.retryAt=clock+15;
          if(!disposed)console.warn('[MoonForest] village pet loading failed',p.config.id,error);
        }).finally(()=>{pending=false;});
      }
    },
    dispose(){
      if(disposed)return;
      disposed=true;visit.abort();if(observer)draw.remove(observer);
      for(const p of residents){p.visual?.dispose();p.visual=null;}
    }
  };
}
