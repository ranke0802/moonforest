import { DynamicTexture, Texture, Color3 } from '@babylonjs/core';
import { VILLAGE_HOMES, VILLAGE_PLACEMENTS, VILLAGE_RING_ROAD, homeRoadEnd } from './village-layout.js';

// One baked color map, without transparent path decals or extra terrain passes.
export function applyVillageGround(world){
  const size=2048,span=world.terrain.size;
  const texture=new DynamicTexture('village-grass-and-earth',{width:size,height:size},world.scene,true,Texture.TRILINEAR_SAMPLINGMODE);
  const ctx=texture.getContext(),unit=size/span;
  let seed=27028;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  ctx.fillStyle='#717d4e';ctx.fillRect(0,0,size,size);
  // Low-frequency mottling prevents lawns from reading as flat polygon fills.
  for(let i=0;i<140;i++){
    const x=random()*size,y=random()*size,r=(4+random()*11)*unit;
    const patch=ctx.createRadialGradient(x,y,0,x,y,r);
    patch.addColorStop(0,i%2?'rgba(147,149,94,.14)':'rgba(64,85,48,.14)');patch.addColorStop(1,'rgba(113,125,78,0)');
    ctx.fillStyle=patch;ctx.fillRect(x-r,y-r,r*2,r*2);
  }
  const paths=[{points:[[-38,0],[38,0]],scale:1},{points:[[0,-41],[0,78]],scale:1},{points:VILLAGE_RING_ROAD,scale:1,ring:true},...VILLAGE_HOMES.map((p,i)=>({points:[[p.x,p.z],homeRoadEnd(p)],scale:.53,bend:i%2?.7:-.7}))];
  ctx.save();ctx.translate(size/2,size/2);ctx.scale(unit,-unit);
  for(const [width,color,blur] of [[6.4,'#88865c',1.05],[5.4,'#99916a',.72],[4.1,'#ab9970',.46]]){
    ctx.strokeStyle=color;ctx.lineCap='round';ctx.lineJoin='round';ctx.shadowColor=color;
    for(const path of paths){
      ctx.lineWidth=width*path.scale;ctx.shadowBlur=blur*unit*path.scale;ctx.beginPath();
      if(path.ring)ctx.roundRect(-20,-23,40,46,3.5);
      else if(path.bend){
        const [a,b]=path.points,dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz)||1;
        ctx.moveTo(...a);ctx.quadraticCurveTo((a[0]+b[0])*.5-dz/length*path.bend,(a[1]+b[1])*.5+dx/length*path.bend,...b);
      }else{ctx.moveTo(...path.points[0]);for(const p of path.points.slice(1))ctx.lineTo(...p);}
      ctx.stroke();
    }
  }
  ctx.fillStyle='#ab9970';ctx.shadowColor='#a3986d';ctx.shadowBlur=unit*.85;ctx.beginPath();ctx.arc(0,0,8.8,0,Math.PI*2);ctx.fill();
  // Baked grass scallops soften the road edge; the walkable center stays clear.
  ctx.shadowColor='#7e8457';ctx.shadowBlur=unit*.32;
  for(const path of paths)for(let n=1;n<path.points.length;n++){
    const [ax,az]=path.points[n-1],[bx,bz]=path.points[n],length=Math.hypot(bx-ax,bz-az),dx=(bx-ax)/length,dz=(bz-az)/length;
    for(let t=.8;t<length;t+=.9+random()*1.4){
      const side=random()<.5?-1:1,edge=(2.75+random()*.65)*side*path.scale,x=ax+dx*t-dz*edge,z=az+dz*t+dx*edge;
      if(Math.hypot(x,z)<9)continue;
      ctx.fillStyle=random()<.5?'rgba(116,129,79,.38)':'rgba(137,141,88,.34)';
      ctx.beginPath();ctx.ellipse(x,z,.45+random()*.85,.22+random()*.32,Math.atan2(dz,dx),0,Math.PI*2);ctx.fill();
    }
  }
  // Contact darkening is part of this same ground map, independent of the sun.
  // It anchors distant foundations/roots without extra meshes or shadow passes.
  ctx.shadowBlur=0;
  for(const p of VILLAGE_PLACEMENTS){
    if(!['building','tower','landmark','tree','rock'].includes(p.kind))continue;
    const tree=p.kind==='tree',foot=p.colliderFootprint??p.footprint??[1.6,1.6];
    const rx=(tree?(p.colliderRadius??.6)*1.7:foot[0]*.57)*p.scale,rz=(tree?(p.colliderRadius??.6)*1.4:foot[1]*.57)*p.scale;
    const [ox,oz]=(p.colliderOffset??[0,0]).map(n=>n*p.scale);
    ctx.save();ctx.translate(p.x+ox*Math.cos(p.yaw)+oz*Math.sin(p.yaw),p.z-ox*Math.sin(p.yaw)+oz*Math.cos(p.yaw));ctx.rotate(-p.yaw);ctx.scale(rx,rz);
    const shade=ctx.createRadialGradient(-.06,.03,0,0,0,1.12);
    shade.addColorStop(0,tree?'rgba(34,41,27,.20)':'rgba(34,41,27,.15)');
    shade.addColorStop(.45,'rgba(34,41,27,.10)');shade.addColorStop(.82,'rgba(34,41,27,.035)');shade.addColorStop(1,'rgba(34,41,27,0)');
    ctx.fillStyle=shade;ctx.beginPath();
    for(let i=0;i<=18;i++){const a=i/18*Math.PI*2,r=1.08+Math.sin(a*5+p.x*2+p.z)*.045;const x=Math.cos(a)*r,z=Math.sin(a)*r;i?ctx.lineTo(x,z):ctx.moveTo(x,z);}
    ctx.closePath();ctx.fill();ctx.restore();
  }
  ctx.restore();ctx.shadowBlur=0;
  // Small sparse speckles break up the painted field without high-frequency tiling.
  for(let i=0;i<9000;i++){
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;const x=seed/4294967296*size;
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;const y=seed/4294967296*size;
    ctx.fillStyle=i%3?'rgba(70,83,49,.13)':'rgba(226,212,163,.18)';
    ctx.fillRect(x,y,1+i%3,1+i%2);
  }
  texture.update();texture.wrapU=texture.wrapV=Texture.CLAMP_ADDRESSMODE;texture.anisotropicFilteringLevel=4;
  world.floorMaterial.unfreeze();world.floorMaterial.diffuseTexture?.dispose();
  world.floorMaterial.diffuseTexture=texture;world.floorMaterial.diffuseColor=Color3.White();
  world.floorMaterial.specularColor=new Color3(.02,.02,.02);world.floorMaterial.freeze();
}
