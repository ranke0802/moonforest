// Floating ? / ! above quest NPCs. Two shared materials (one per glyph) and one
// small billboard per NPC: unlit, unpicked, no shadow. ? = a quest waits here,
// ! = come back here, the work is done.
import {DynamicTexture} from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial.js';
import {MeshBuilder} from '@babylonjs/core/Meshes/meshBuilder.js';
import {Color3} from '@babylonjs/core/Maths/math.color.js';

export const MARKER_COLORS=Object.freeze({'?':'#ffd54a','!':'#7dffb2'});
function glyphMaterial(scene,glyph){
 const size=128,texture=new DynamicTexture(`v03-marker-${glyph==='?'?'q':'x'}`,{width:size,height:size},scene,true),ctx=texture.getContext();
 ctx.clearRect(0,0,size,size);ctx.font='900 112px "Noto Sans KR","Malgun Gothic",sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
 ctx.lineJoin='round';ctx.lineWidth=14;ctx.strokeStyle='#1d1406';ctx.strokeText(glyph,size/2,size/2+6);
 ctx.fillStyle=MARKER_COLORS[glyph];ctx.fillText(glyph,size/2,size/2+6);
 texture.update(true);texture.hasAlpha=true;
 const material=new StandardMaterial(`v03-marker-${glyph==='?'?'q':'x'}`,scene);
 material.disableLighting=true;material.diffuseTexture=texture;material.useAlphaFromDiffuseTexture=true;material.emissiveColor=Color3.White();
 material.specularColor=Color3.Black();material.backFaceCulling=false;material.fogEnabled=false;material.freeze();
 return material;
}
export function createQuestMarkers(scene){
 const materials={},marks=new Map();
 const material=glyph=>materials[glyph]??=glyphMaterial(scene,glyph);
 return {
  // id → glyph ('?' | '!' | null) at a fixed head height.
  set(id,glyph,x,y,z){
   let mark=marks.get(id);
   if(!glyph){mark?.mesh.setEnabled(false);if(mark)mark.glyph=null;return;}
   if(!mark){
    const mesh=MeshBuilder.CreatePlane(`v03-marker-${id}`,{size:.8},scene);
    mesh.billboardMode=7;mesh.isPickable=false;mesh.doNotSyncBoundingInfo=true;mesh.alwaysSelectAsActiveMesh=true;mesh.renderingGroupId=1;
    mark={mesh,glyph:null,x,y,z};marks.set(id,mark);
   }
   mark.x=x;mark.y=y;mark.z=z;
   if(mark.glyph!==glyph){mark.glyph=glyph;mark.mesh.material=material(glyph);}
   mark.mesh.setEnabled(true);
  },
  update(time){for(const [,mark] of marks)if(mark.glyph){const bob=Math.sin(time*2.4+mark.x)*.12;mark.mesh.position.set(mark.x,mark.y+bob,mark.z);mark.mesh.scaling.setAll(1+Math.sin(time*4.8)*.05);}},
  clear(){for(const [,mark] of marks)mark.mesh.dispose();marks.clear();},
  dispose(){this.clear();for(const glyph in materials){materials[glyph].diffuseTexture?.dispose();materials[glyph].dispose();}},
 };
}
