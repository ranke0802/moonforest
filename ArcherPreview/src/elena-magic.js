import {Color3,MeshBuilder,StandardMaterial,Quaternion,Vector3} from '@babylonjs/core';
import {segmentDistanceSquared} from './melee-collision.js';
export const ELENA_LINE_RADIUS=.12;
export function lineHitsPlayer(start,end,position){
  const a=[position.x,position.y+.28,position.z],b=[position.x,position.y+1.45,position.z];
  return segmentDistanceSquared(start.asArray(),end.asArray(),a,b)<=(.30+ELENA_LINE_RADIUS)**2;
}
// Replace only this renderer with a ribbon/atlas later. The encounter owns the
// locked aim, release event and hit test, not the presentation.
export class ElenaLineEffect {
  constructor(world){
    this.world=world;this.mesh=MeshBuilder.CreateCylinder('elena-red-line-prototype',{height:1,diameter:1,tessellation:6},world.scene);
    const m=this.material=new StandardMaterial('elena-red-line-color',world.scene);m.disableLighting=true;m.emissiveColor=new Color3(1,.025,.035);m.diffuseColor=Color3.Black();m.specularColor=Color3.Black();m.disableDepthWrite=true;
    this.mesh.material=m;this.mesh.isPickable=false;this.mesh.receiveShadows=false;this.mesh.setEnabled(false);this.serial=null;
  }
  aim(serial,start,target,range){
    if(this.serial===serial)return;
    this.serial=serial;this.fired=false;const direction=target.subtract(start),distance=direction.length();
    this.end=start.add(direction.scale(Math.min(range,distance)/Math.max(.001,distance)));
    const nav=this.world.navigation;
    if(nav&&!nav.segmentClear(start,this.end,0,true)){
      let low=0,high=1;for(let i=0;i<9;i++){const mid=(low+high)/2,p=Vector3.Lerp(start,this.end,mid);if(nav.segmentClear(start,p,0,true))low=mid;else high=mid;}
      this.end=Vector3.Lerp(start,this.end,low);
    }
  }
  show(start,time,release,{flash=false}={}){
    if(!this.end||(!flash&&time>release+.18)){this.mesh.setEnabled(false);return;}
    const delta=this.end.subtract(start),length=delta.length();if(length<.02){this.mesh.setEnabled(false);return;}
    const firing=flash||time>=release;this.mesh.setEnabled(true);this.mesh.position.copyFrom(start.add(this.end).scale(.5));
    this.mesh.rotationQuaternion=Quaternion.FromUnitVectorsToRef(Vector3.Up(),delta.scale(1/length),this.mesh.rotationQuaternion??new Quaternion());
    this.mesh.scaling.set(firing?ELENA_LINE_RADIUS*2:.07,length,firing?ELENA_LINE_RADIUS*2:.07);this.material.alpha=firing?1:.48;
  }
  reset(){this.serial=null;this.fired=false;this.end=null;this.mesh.setEnabled(false);}
  dispose(){this.mesh.dispose();this.material.dispose();}
}
