import { DynamicTexture, Texture, Color3 } from '@babylonjs/core';
import { VILLAGE_HOMES, VILLAGE_PLACEMENTS, VILLAGE_RING_ROAD, homeRoadEnd, villageRoadDistance } from './village-layout.js';

// One baked color map, without transparent path decals or extra terrain passes.
export function applyVillageGround(world){
  const size=2048,span=world.terrain.size;
  const texture=new DynamicTexture('village-grass-and-earth',{width:size,height:size},world.scene,true,Texture.TRILINEAR_SAMPLINGMODE);
  const ctx=texture.getContext(),unit=size/span;
  let seed=27028;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  ctx.fillStyle='#69764b';ctx.fillRect(0,0,size,size);
  // Low-frequency mottling prevents lawns from reading as flat polygon fills.
  for(let i=0;i<320;i++){
    const x=random()*size,y=random()*size,r=(1.2+random()*8)*unit;
    const patch=ctx.createRadialGradient(x,y,0,x,y,r);
    patch.addColorStop(0,i%2?'rgba(145,143,91,.24)':'rgba(46,69,39,.22)');patch.addColorStop(1,'rgba(105,118,75,0)');
    ctx.fillStyle=patch;ctx.fillRect(x-r,y-r,r*2,r*2);
  }
  const paths=[{points:[[-38,0],[38,0]],scale:1},{points:[[0,-41],[0,78]],scale:1},{points:VILLAGE_RING_ROAD,scale:1,ring:true},...VILLAGE_HOMES.map((p,i)=>({points:[[p.x,p.z],homeRoadEnd(p)],scale:.53,bend:i%2?.7:-.7}))];
  ctx.save();ctx.translate(size/2,size/2);ctx.scale(unit,-unit);
  // Worn, irregular yards belong to buildings and daily activities. These are
  // baked into the existing map, not new decals or generated art assets.
  for(const p of VILLAGE_PLACEMENTS.filter(p=>['building','garden','prop','tower'].includes(p.kind))){
    const building=p.kind==='building',rx=(building?4.2:1.55)*p.scale,rz=(building?4.7:1.3)*p.scale;
    ctx.save();ctx.translate(p.x,p.z);ctx.rotate(-p.yaw);ctx.scale(rx,rz);
    const soil=ctx.createRadialGradient(0,0,.3,0,0,1.3);
    soil.addColorStop(0,'rgba(142,128,86,.78)');soil.addColorStop(.75,'rgba(145,133,89,.45)');soil.addColorStop(1,'rgba(145,133,89,0)');
    ctx.fillStyle=soil;ctx.beginPath();
    for(let n=0;n<=24;n++){const a=n/24*Math.PI*2,r=1.18+Math.sin(a*5+p.x)*.11+Math.cos(a*3+p.z)*.07;n?ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r):ctx.moveTo(r,0);}
    ctx.closePath();ctx.fill();ctx.restore();
  }
  for(const [width,color,blur] of [[5.2,'#82815b',.68],[4.3,'#928561',.45],[3.15,'#a0916c',.28]]){
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
  ctx.fillStyle='#a0916c';ctx.shadowColor='#998c66';ctx.shadowBlur=unit*.7;ctx.beginPath();
  for(let n=0;n<=40;n++){const a=n/40*Math.PI*2,r=7.3+Math.sin(a*3)*.8+Math.cos(a*5)*.35;n?ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r):ctx.moveTo(r,0);}
  ctx.closePath();ctx.fill();
  // Baked grass scallops soften the road edge; the walkable center stays clear.
  ctx.shadowColor='#7e8457';ctx.shadowBlur=unit*.32;
  for(const path of paths)for(let n=1;n<path.points.length;n++){
    const [ax,az]=path.points[n-1],[bx,bz]=path.points[n],length=Math.hypot(bx-ax,bz-az),dx=(bx-ax)/length,dz=(bz-az)/length;
    for(let t=.8;t<length;t+=.9+random()*1.4){
      const side=random()<.5?-1:1,edge=(1.95+random()*.65)*side*path.scale,x=ax+dx*t-dz*edge,z=az+dz*t+dx*edge;
      if(Math.hypot(x,z)<7.5)continue;
      ctx.fillStyle=random()<.5?'rgba(116,129,79,.38)':'rgba(137,141,88,.34)';
      ctx.beginPath();ctx.ellipse(x,z,.45+random()*.85,.22+random()*.32,Math.atan2(dz,dx),0,Math.PI*2);ctx.fill();
    }
  }
  ctx.shadowBlur=0;
  // Small groups of grass blades and earth flecks bridge paths and planting.
  // Keep them irregular and low contrast; the result stays a single 2K map.
  for(let i=0;i<12000;i++){
    const x=(random()-.5)*94,z=(random()-.5)*100,d=villageRoadDistance(x,z);
    if(Math.hypot(x,z)<7||d<1.35)continue;
    const edge=d<3.5;
    if(!edge&&random()<.6)continue;
    const r=.07+random()*.22;
    ctx.strokeStyle=i%3?'rgba(66,87,43,.28)':'rgba(159,161,104,.30)';ctx.lineWidth=.055;
    ctx.beginPath();ctx.moveTo(x-r,z);ctx.lineTo(x-r*.3,z+r*.9);ctx.moveTo(x,z-.02);ctx.lineTo(x+.02,z+r*1.25);ctx.moveTo(x+r*.7,z);ctx.lineTo(x+r*.4,z+r*.7);ctx.stroke();
  }
  for(let i=0;i<4500;i++){
    const x=(random()-.5)*84,z=(random()-.5)*92;
    if(villageRoadDistance(x,z)>2.8&&Math.hypot(x,z)>7.5)continue;
    ctx.fillStyle=i%3?'rgba(81,75,52,.12)':'rgba(213,199,155,.25)';
    ctx.beginPath();ctx.ellipse(x,z,.045+random()*.11,.03+random()*.06,random()*6.28,0,Math.PI*2);ctx.fill();
  }
  // Contact darkening is part of this same ground map, independent of the sun.
  // It anchors distant foundations/roots without extra meshes or shadow passes.
  ctx.shadowBlur=0;
  for(const p of VILLAGE_PLACEMENTS){
    if(!['building','tower','landmark','tree','rock','prop','garden','fence','shrub'].includes(p.kind))continue;
    const tree=p.kind==='tree',foot=p.colliderFootprint??p.footprint??[1.6,1.6];
    const rx=(tree?(p.colliderRadius??.6)*1.7:foot[0]*.57)*p.scale,rz=(tree?(p.colliderRadius??.6)*1.4:foot[1]*.57)*p.scale;
    const [ox,oz]=(p.colliderOffset??[0,0]).map(n=>n*p.scale);
    ctx.save();ctx.translate(p.x+ox*Math.cos(p.yaw)+oz*Math.sin(p.yaw),p.z-ox*Math.sin(p.yaw)+oz*Math.cos(p.yaw));ctx.rotate(-p.yaw);ctx.scale(rx,rz);
    const shade=ctx.createRadialGradient(-.06,.03,0,0,0,1.12);
    shade.addColorStop(0,tree?'rgba(34,41,27,.27)':'rgba(34,41,27,.22)');
    shade.addColorStop(.45,'rgba(34,41,27,.15)');shade.addColorStop(.82,'rgba(34,41,27,.06)');shade.addColorStop(1,'rgba(34,41,27,0)');
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
