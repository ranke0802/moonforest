import {Color3, Matrix, Mesh, Ray, StandardMaterial, Vector3, VertexData} from '@babylonjs/core';
import {createPlainsLeafDrift} from './plains-leaf-drift.js';

export function strikeMaterial(p, id=p.asset) {
  if (p.background || p.decorative) return null;
  if (p.kind==='tree') return 'tree';
  if (p.kind==='rock' || p.kind==='building' || id==='well' || id==='chapel' || id.startsWith('house-')) return 'stone';
  if (p.kind==='fence' || p.kind==='tower' || /^(wood-|rail-fence|waypost|firewood|forest-03-fallen-log|handcart|covered-wagon|crate-barrel|market-stall)/.test(id)) return 'wood';
  return p.kind==='wall'?'stone':null;
}

function inReach(box,p,r) {
  return box.min.x<=p.x+r && box.max.x>=p.x-r && box.min.z<=p.z+r && box.max.z>=p.z-r;
}

// Use the loaded far proxy of the same primitive for contact (no requests).
// Its vertices stay shared. The transform is always the struck instance's.
function contactMesh(world,record,mesh) {
  const asset=record.entry??world.villagePrepared?.assets.get(record.placement.asset);
  const i=asset?.baseMeshes?.indexOf(mesh.sourceMesh??mesh)??-1;
  return asset?.tiers?.get(2)?.meshes[i]??mesh.sourceMesh??mesh;
}

// Short blade segments in their actual animation window. Sample the swept
// surface too, so a low frame rate need not land a frame exactly on a fence.
function bladeContact(world,records,sample,{ray,local,inverse,end}) {
  const origin=ray.origin;
  let hit=null;
  for (const {blade,previous=blade} of sample.contacts) {
    const travel=Math.max(endpointDistance(previous[0],blade[0]),endpointDistance(previous[1],blade[1]));
    const steps=Math.max(1,Math.min(6,Math.ceil(travel/.16)));
    for (let step=0;step<=steps;step++) {
      const t=step/steps;
      lerpPoint(previous[0],blade[0],t,origin);lerpPoint(previous[1],blade[1],t,end);
      end.subtractToRef(origin,ray.direction);
      ray.length=ray.direction.length();if(ray.length<1e-5)continue;
      ray.direction.scaleInPlace(1/ray.length);
      for (const record of records) {
        if(record.authoredSuppressed||!record.root.isEnabled()||!ray.intersectsBoxMinMax(record.min,record.max))continue;
        for(const mesh of record.meshes) {
          const matrix=mesh.getWorldMatrix(),proxy=contactMesh(world,record,mesh);
          matrix.invertToRef(inverse);Ray.TransformToRef(ray,inverse,local);
          const pick=proxy.intersects(local,false,undefined,false,matrix);
          if(pick.hit && pick.distance<=ray.length+.001 && (!hit||pick.distance<hit.distance))
            hit={record,point:pick.pickedPoint,distance:pick.distance};
        }
      }
      if(hit)return hit;
    }
  }
  return null;
}

function endpointDistance(a,b){return Math.hypot(b[0]-a[0],b[1]-a[1],b[2]-a[2]);}
function lerpPoint(a,b,t,out){out.set(a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t);}

// A single unlit billboard, six tapered flecks, no textures or particles per hit.
function sparkFan(scene) {
  const mesh=new Mesh('scenery-sword-sparks',scene),data=new VertexData(),positions=[],indices=[],colors=[];
  for(let i=0;i<6;i++){
    const a=.23+i*.55,len=.14+.095*((i*7)%3),x=Math.cos(a),y=Math.sin(a),base=i*3;
    positions.push(x*.045-y*.014,y*.045+x*.014,0,x*.045+y*.014,y*.045-x*.014,0,x*len,y*len,0);
    indices.push(base,base+1,base+2);colors.push(1,.95,.65,1,1,.78,.3,1,1,.38,.06,1);
  }
  Object.assign(data,{positions,indices,colors});data.applyToMesh(mesh);
  const mat=new StandardMaterial('scenery-sword-sparks',scene);
  mat.disableLighting=true;mat.emissiveColor=Color3.White();mat.backFaceCulling=false;
  mesh.material=mat;mesh.billboardMode=Mesh.BILLBOARDMODE_ALL;mesh.isPickable=false;mesh.setEnabled(false);
  return mesh;
}

function startSway(record,player){
  const pivot=record.facing,root=record.root;
  const local=Vector3.TransformCoordinates(player,root.getWorldMatrix().clone().invert());
  const length=Math.hypot(local.x,local.z)||1;
  const frozen=[pivot,...record.meshes].filter(node=>node.isWorldMatrixFrozen);
  for(const node of frozen)node.unfreezeWorldMatrix();
  return {record,pivot,frozen,x:pivot.rotation.x,z:pivot.rotation.z,dx:-local.z/length,dz:local.x/length,time:0};
}
function stopSway(s){
  if(!s||s.pivot.isDisposed())return;
  s.pivot.rotation.x=s.x;s.pivot.rotation.z=s.z;s.pivot.computeWorldMatrix(true);
  for(const node of s.frozen)if(!node.isDisposed()){node.computeWorldMatrix(true);node.freezeWorldMatrix();}
}

export function createSceneryStrikes(world,audio) {
  const scratch={ray:Ray.Zero(),local:Ray.Zero(),end:new Vector3(),inverse:Matrix.Identity()};
  let action=null,spent=false,revision=-1,near=[],fromX=Infinity,fromZ=Infinity;
  let sway=null,leaves=null,sparks=null,sparkTime=0;
  function clear(){
    stopSway(sway);sway=null;action=null;spent=false;near.length=0;
    sparkTime=0;if(sparks?.isEnabled())sparks.setEnabled(false);if(leaves?.active)leaves.update(0,null,false);
  }
  function leave(){
    clear();leaves?.dispose();leaves=null;sparks?.dispose(false,true);sparks=null;
  }
  const observer=world.scene.onDisposeObservable.addOnce(leave);
  return {
    hit(sample,state,player,leavesAllowed){
      if(!sample?.contacts?.length||state==='shieldPush')return null;
      if(action!==sample.actionId){
        action=sample.actionId;spent=false;fromX=Infinity;
      }
      if(spent)return null;
      if(revision!==world.placementRevision||Math.hypot(player.x-fromX,player.z-fromZ)>1){
        fromX=player.x;fromZ=player.z;revision=world.placementRevision;near.length=0;
        // Local records only, once per swing (or after a long moving lunge).
        for(const visibility of [world.villageVisibility,world.authoredPlacements?.visibility]){
          if(!visibility)continue;
          for(const cell of visibility.cells.values()){
            if(!inReach(cell,player,4))continue;
            for(const record of cell.records){
              if(record.meshes.length&&!record.authoredSuppressed&&inReach(record,player,4)&&
                strikeMaterial(record.placement,record.instance?.assetId??record.placement.asset))near.push(record);
            }
          }
        }
      }
      if(!near.length)return null;
      const hit=bladeContact(world,near,sample,scratch);
      if(!hit)return null;
      const {record,point}=hit,material=strikeMaterial(record.placement,record.instance?.assetId??record.placement.asset);
      spent=true;
      if(material==='stone'){
        sparks??=sparkFan(world.scene);sparks.position.copyFrom(point);sparks.scaling.setAll(.58);
        sparks.material.emissiveColor.set(1,1,1);sparks.setEnabled(true);sparkTime=.14;
        audio.play('parry',{position:point,volume:.55,rate:1.12,duck:false});
      }else{
        audio.play('land',{position:point,volume:material==='tree'?.67:.48,rate:material==='tree'?.83:1.04,duck:false});
        if(material==='tree'){
          stopSway(sway);sway=startSway(record,player);
          if(leavesAllowed){
            if(world.plainsDecor)world.plainsDecor.strikeLeaves(record,point);
            else{leaves??=createPlainsLeafDrift(world);leaves.strike(record,point);}
          }
        }
      }
      return material;
    },
    update(dt,player,battle){
      if(sway){
        const s=sway;s.time+=dt;
        if(s.time>=.46||s.pivot.isDisposed()){stopSway(s);sway=null;}
        else{
          const t=s.time/.46,angle=.041*Math.sin(t*Math.PI*2.2)*(1-t)**2;
          s.pivot.rotation.x=s.x+angle*s.dx;s.pivot.rotation.z=s.z+angle*s.dz;
        }
      }
      if(sparkTime>0){
        sparkTime=Math.max(0,sparkTime-dt);const t=1-sparkTime/.14;
        sparks.scaling.setAll(.58+1.15*t);const light=1-t*t;sparks.material.emissiveColor.set(light,light,light);
        if(!sparkTime)sparks.setEnabled(false);
      }
      if(leaves?.active)leaves.update(dt,player,!battle?.combatCount,false);
    },
    clear,leave,dispose(){world.scene.onDisposeObservable.remove(observer);leave();}
  };
}
