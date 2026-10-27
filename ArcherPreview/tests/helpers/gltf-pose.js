import { readFileSync } from 'node:fs';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core';

export function loadPlayerPoseAsset(url){
  const config=JSON.parse(readFileSync(new URL('../../public/assets/warrior-v2.json',import.meta.url)));
  return loadPoseAsset(url,config.scale||1);
}

export function loadPoseAsset(url,scale=1){
  const data=readFileSync(url),length=data.readUInt32LE(12),gltf=JSON.parse(data.toString('utf8',20,20+length));
  function accessor(index){
    const a=gltf.accessors[index],v=gltf.bufferViews[a.bufferView],width={SCALAR:1,VEC3:3,VEC4:4}[a.type];
    const offset=28+length+(v.byteOffset||0)+(a.byteOffset||0),stride=v.byteStride||width*4;
    return Array.from({length:a.count},(_,i)=>Array.from({length:width},(_,k)=>data.readFloatLE(offset+i*stride+k*4)));
  }
  const parents=new Map();gltf.nodes.forEach((n,i)=>(n.children||[]).forEach(c=>parents.set(c,i)));
  const clips=new Map(gltf.animations.map(a=>[a.name,a.channels.map(c=>{
    const s=a.samplers[c.sampler];return {...c.target,times:accessor(s.input).flat(),values:accessor(s.output),step:s.interpolation==='STEP'};
  })]));
  function pose(name,time){
    const trs=gltf.nodes.map(n=>({translation:n.translation||[0,0,0],rotation:n.rotation||[0,0,0,1],scale:n.scale||[1,1,1]}));
    for(const c of clips.get(name)){
      let i=0;while(i+1<c.times.length&&c.times[i+1]<=time)i++;
      const j=Math.min(i+1,c.times.length-1),t=i===j||c.step?0:Math.max(0,(time-c.times[i])/(c.times[j]-c.times[i]));
      trs[c.node][c.path]=c.path==='rotation'?Quaternion.Slerp(Quaternion.FromArray(c.values[i]),Quaternion.FromArray(c.values[j]),t).asArray():c.values[i].map((v,k)=>v+(c.values[j][k]-v)*t);
    }
    const matrices=new Map();
    function world(i){
      if(matrices.has(i))return matrices.get(i);
      const t=trs[i],local=Matrix.Compose(Vector3.FromArray(t.scale),Quaternion.FromArray(t.rotation),Vector3.FromArray(t.translation));
      const m=parents.has(i)?local.multiply(world(parents.get(i))):local.multiply(Matrix.Scaling(scale,scale,scale));matrices.set(i,m);return m;
    }
    return Object.fromEntries(gltf.nodes.map((n,i)=>[n.name,world(i)]));
  }
  return {gltf,pose,accessor,durations:Object.fromEntries([...clips].map(([name,c])=>[name,Math.max(...c.map(t=>t.times.at(-1)))]))};
}
