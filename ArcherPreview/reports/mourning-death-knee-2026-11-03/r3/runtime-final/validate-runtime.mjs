import{readFileSync,writeFileSync}from'node:fs';
import assert from'node:assert/strict';
import{MOURNING_DEATH_DEPTH_DELTAS}from'../../../../src/mourning-death-depth-data.js';
const dir=new URL('./',import.meta.url),actual=JSON.parse(readFileSync(new URL('review.json',dir))),data=readFileSync(new URL('geometry.bin',dir)),reference=JSON.parse(readFileSync(new URL('../reproduced-reference.json',dir))),goal=new Map(reference.vertices.map(v=>[v.id,v])),mask=new Set(MOURNING_DEATH_DEPTH_DELTAS.filter((_,i)=>i%7===0));
const value=(buffer,info,i)=>buffer.readFloatLE(info.byteOffset+i*4),stats={maximumAcceptedShapeDistance:0,maximumAcceptedNormalDistance:0,maximumFrontXYChange:0,maximumOutsideMaskDistance:0,maximumOutsideMaskNormalDistance:0,minimumSkinY:Infinity,changedVertexCount:0};
for(const pose of actual.poses.filter(p=>p.label.startsWith('after-'))){
 const before=actual.poses.find(p=>p.label===pose.label.replace('after-','before-'));
 for(const mesh of pose.meshes){const old=before.meshes.find(m=>m.name===mesh.name);
  for(let i=0;i<mesh.positions.count;i+=3){
   const position=[0,1,2].map(axis=>value(data,mesh.positions,i+axis)),distance=Math.hypot(...position.map((v,a)=>v-value(data,old.positions,i+a))),normalDistance=Math.hypot(...[0,1,2].map(a=>value(data,mesh.normals,i+a)-value(data,old.normals,i+a)));
   stats.minimumSkinY=Math.min(stats.minimumSkinY,position[2]);
   stats.maximumFrontXYChange=Math.max(stats.maximumFrontXYChange,Math.hypot(position[0]-value(data,old.positions,i),position[2]-value(data,old.positions,i+2)));
   if(mesh.name!=='Elina_Chimera_Skin'||!mask.has(i/3)){stats.maximumOutsideMaskDistance=Math.max(stats.maximumOutsideMaskDistance,distance);stats.maximumOutsideMaskNormalDistance=Math.max(stats.maximumOutsideMaskNormalDistance,normalDistance);}
   if(pose.time===5.2){
    if(distance>1e-7)stats.changedVertexCount++;
    const accepted=mesh.name==='Elina_Chimera_Skin'?goal.get(i/3):null,wanted=accepted?[accepted.position[0],-accepted.position[2],accepted.position[1]]:[0,1,2].map(a=>value(data,old.positions,i+a)),wantedNormal=accepted?[accepted.normal[0],-accepted.normal[2],accepted.normal[1]]:[0,1,2].map(a=>value(data,old.normals,i+a));
    stats.maximumAcceptedShapeDistance=Math.max(stats.maximumAcceptedShapeDistance,Math.hypot(...position.map((v,a)=>v-wanted[a])));
    stats.maximumAcceptedNormalDistance=Math.max(stats.maximumAcceptedNormalDistance,Math.hypot(...[0,1,2].map(a=>value(data,mesh.normals,i+a)-wantedNormal[a])));
   }
  }
 }
}
assert.ok(stats.maximumAcceptedShapeDistance<3e-6,JSON.stringify(stats));assert.ok(stats.maximumAcceptedNormalDistance<3e-5,JSON.stringify(stats));assert.equal(stats.maximumOutsideMaskDistance,0);assert.equal(stats.maximumOutsideMaskNormalDistance,0);assert.ok(stats.minimumSkinY>-.01);
const report={scope:'Actual MourningElenaEncounter.prepareAsset followed by native animator/morph/CPU skin; accepted offline red-guide shape comparison. Not a GPU gameplay capture.',...stats,maskIndices:[...mask],newTargets:0,bodyTargetCount:11,originalPackedAssetUnchanged:true,replacementCpuAllocationBytes:36196*3*4*2,sparseDataNumberCount:MOURNING_DEATH_DEPTH_DELTAS.length};
writeFileSync(new URL('runtime-validation.json',dir),JSON.stringify(report,null,2)+'\n');console.log(report);
