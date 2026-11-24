import {BoundingInfo, Color3, Material, Mesh, RawTexture, StandardMaterial, Texture, Vector3, VertexBuffer, VertexData} from '@babylonjs/core';

const deciduous = ['tree-01-round-oak', 'forest-01-sickly-oak'];
const corners = [[-1,-1],[1,-1],[1,1],[-1,1]];
const tau = Math.PI * 2;

// Use the live placements: a removed, hidden or not-yet-streamed crown emits nothing.
function closestCrown(world, player) {
  let best = null, bestDistance = 14 ** 2;
  for (const id of deciduous) {
    for (const record of world.villagePrepared?.recordsByAsset.get(id) ?? []) {
      if (!visibleCrown(record)) continue;
      const p = record.root.position, distance = (player.x-p.x)**2 + (player.z-p.z)**2;
      if (distance < bestDistance) { best = record; bestDistance = distance; }
    }
  }
  return best;
}
function visibleCrown(record) {
  return !record.placement.background && !record.authoredSuppressed &&
    record.meshes.length > 0 && record.root.isEnabled();
}

// One small cutout with a central vein. No image request, blending sort or shadow pass.
function leafTexture(scene) {
  const w=16,h=32,bytes=new Uint8Array(w*h*4);
  for (let y=0;y<h;y++) for (let x=0;x<w;x++) {
    const v=(y+.5)/h, u=(x+.5)/w*2-1, mid=.13*Math.sin(tau*v);
    const width=.87*Math.sin(Math.PI*v)**.85, i=4*(y*w+x);
    const vein=Math.abs(u-mid)<.085, light=u>mid?1:.83;
    bytes.set([Math.round((vein?168:133)*light),Math.round((vein?148:126)*light),vein?74:57,Math.abs(u-mid)<width?255:0],i);
  }
  const tex=RawTexture.CreateRGBATexture(bytes,w,h,scene,true,false,Texture.TRILINEAR_SAMPLINGMODE);
  tex.name='plains-oak-leaf';tex.hasAlpha=true;tex.wrapU=tex.wrapV=Texture.CLAMP_ADDRESSMODE;
  return tex;
}

function leafBatch(scene,count) {
  const mesh=new Mesh('plains-drifting-leaves',scene),positions=new Float32Array(count*12);
  const data=new VertexData(),indices=[],uvs=[];
  for (let i=0;i<count;i++) {
    const v=i*4;indices.push(v,v+1,v+2,v,v+2,v+3);uvs.push(0,0,1,0,1,1,0,1);
  }
  data.positions=positions;data.indices=indices;data.uvs=uvs;data.applyToMesh(mesh,true);
  const material=new StandardMaterial('plains-oak-leaves',scene);
  material.diffuseTexture=leafTexture(scene);material.disableLighting=true;
  material.emissiveColor=Color3.White();material.specularColor=Color3.Black();
  material.transparencyMode=Material.MATERIAL_ALPHATEST;material.backFaceCulling=false;
  mesh.material=material;mesh.isPickable=false;mesh.receiveShadows=false;
  mesh.setBoundingInfo(new BoundingInfo(new Vector3(-10,-12,-10),new Vector3(10,24,10)));
  return {mesh,positions,dispose(){mesh.dispose(false,true);}};
}

// One small gust at a time. All leaves share a wind direction but fall and tumble
// at different rates. The pool and vertex buffer are reused for the map's life.
export function createPlainsLeafDrift(world,{random=Math.random}={}) {
  const pool=Array.from({length:world.touchDevice?8:10},()=>({life:0,age:0}));
  let batch=null, tree=null, poll=0, untilNext=0, burstLeft=0, wind=0, disposed=false;
  function hide() {
    if (tree) { tree=null;for (const leaf of pool) leaf.life=0; }
    if (batch?.mesh.isEnabled()) batch.mesh.setEnabled(false);
  }
  function spawn(leaf) {
    const p=tree.root.position, height=world.villagePrepared.assets.get(tree.placement.asset).config.height*tree.placement.scale;
    const phase=random()*tau, radius=Math.min(2.3,height*.22), travel=1.4+random()*2.2;
    leaf.x=Math.cos(phase)*radius;leaf.z=Math.sin(phase)*radius;
    leaf.dx=Math.cos(wind)*travel;leaf.dz=Math.sin(wind)*travel;
    leaf.top=height*(.48+random()*.26);
    leaf.bottom=world.terrain.heightAt(p.x+leaf.x+leaf.dx,p.z+leaf.z+leaf.dz)-p.y+.1;
    leaf.life=2.9+random()*1.6;leaf.age=0;leaf.phase=phase;
    leaf.size=.085+random()*.04;
  }
  return {
    update(dt,player,allowed) {
      if (disposed) return;
      if (!allowed||!player) { hide();poll=0;return; }
      if (dt<=0) return;
      poll-=dt;
      if (tree && (!visibleCrown(tree)||(player.x-tree.root.position.x)**2+(player.z-tree.root.position.z)**2>17**2)) { hide();poll=0; }
      if (!tree && poll<=0) {
        poll=.6;tree=closestCrown(world,player);
        if (tree) {
          batch??=leafBatch(world.scene,pool.length);
          batch.mesh.position.copyFrom(tree.root.position);
          burstLeft=0;untilNext=.12;
        }
      }
      if (!tree) return;
      untilNext-=dt;
      if (untilNext<=0) {
        if (!burstLeft) { burstLeft=3+Math.floor(random()*4);wind=.45+(random()-.5)*.65; }
        const free=pool.find(leaf=>!leaf.life);
        if (free) spawn(free);
        untilNext=--burstLeft ? .23+random()*.32 : 1.8+random()*1.8;
      }
      let alive=0;
      for (let i=0;i<pool.length;i++) {
        const leaf=pool[i],offset=i*12;
        leaf.age+=dt;
        if (!leaf.life||leaf.age>=leaf.life) { leaf.life=0;batch.positions.fill(0,offset,offset+12);continue; }
        alive++;
        const t=leaf.age/leaf.life, a=leaf.phase+leaf.age*3.1, flutter=Math.sin(a);
        const x=leaf.x+leaf.dx*t+.26*flutter, z=leaf.z+leaf.dz*t+.19*Math.cos(a);
        const y=leaf.top+(leaf.bottom-leaf.top)*t+.11*Math.sin(a*1.7);
        const size=leaf.size*Math.min(1,t*9,(1-t)*8), yaw=leaf.phase+leaf.age*1.85;
        const cos=Math.cos(yaw)*size,sin=Math.sin(yaw)*size;
        for (let j=0;j<4;j++) {
          const [u,v]=corners[j], k=offset+j*3;
          batch.positions[k]=x+u*cos*.48-v*sin*flutter;
          batch.positions[k+1]=y+v*size*Math.cos(a);
          batch.positions[k+2]=z+u*sin*.48+v*cos*flutter;
        }
      }
      batch.mesh.setEnabled(alive>0);
      if (alive) batch.mesh.updateVerticesData(VertexBuffer.PositionKind,batch.positions,false,false);
    },
    dispose(){disposed=true;batch?.dispose();tree=null;batch=null;}
  };
}
