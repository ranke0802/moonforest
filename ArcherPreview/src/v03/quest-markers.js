// Floating ? / ! above quest NPCs. Two shared materials (one per glyph) and one
// small billboard per NPC: unlit, unpicked, no shadow. ? = a quest waits here,
// ! = come back here, the work is done.
import {DynamicTexture} from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import {Texture} from '@babylonjs/core/Materials/Textures/texture.js';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial.js';
import {MeshBuilder} from '@babylonjs/core/Meshes/meshBuilder.js';
import {Color3} from '@babylonjs/core/Maths/math.color.js';

// Dot-style glyphs in the game's palette: moon gold "?" (a quest waits) and
// pale moon teal "!" (report back). Blocky 5×7 shapes drawn at 8 px per dot
// with a thin ink outline (the cast's outline colour) and a one-step bevel:
// light top edge, dark bottom edge. No per-row stripes.
// "+" in pale lilac: an optional errand (선택 의뢰) is offered here (2026-11-24).
export const MARKER_COLORS=Object.freeze({'?':{fill:'#e6c97e',light:'#fbeab4',dark:'#a8833f'},'!':{fill:'#9fd9c4',light:'#d8f6ea',dark:'#5f9e8a'},'+':{fill:'#cfc6ee',light:'#f0ecff',dark:'#8d82b8'}});
const GLYPH_NAMES=Object.freeze({'?':'q','!':'x','+':'p'});
const OUTLINE='#0b080c',DOT=8,EDGE=2,PAD=3;
const GLYPHS=Object.freeze({
 '?':['.###.','#...#','....#','...#.','..#..','.....','..#..'],
 '!':['..#..','..#..','..#..','..#..','..#..','.....','..#..'],
 '+':['.....','..#..','..#..','#####','..#..','..#..','.....'],
});
export const MARKER_TEXELS=Object.freeze({width:5*DOT+PAD*2,height:7*DOT+PAD*2});
function glyphMaterial(scene,glyph){
 const {width,height}=MARKER_TEXELS,name=`v03-marker-${GLYPH_NAMES[glyph]}`,rows=GLYPHS[glyph],tone=MARKER_COLORS[glyph];
 const texture=new DynamicTexture(name,{width,height},scene,true),ctx=texture.getContext();
 const lit=(c,r)=>rows[r]?.[c]==='#',x=c=>PAD+c*DOT,y=r=>PAD+r*DOT;
 ctx.clearRect(0,0,width,height);
 ctx.fillStyle=OUTLINE;
 for(let r=0;r<7;r++)for(let c=0;c<5;c++)if(lit(c,r))ctx.fillRect(x(c)-EDGE,y(r)-EDGE,DOT+EDGE*2,DOT+EDGE*2);
 for(let r=0;r<7;r++)for(let c=0;c<5;c++)if(lit(c,r)){
  ctx.fillStyle=tone.fill;ctx.fillRect(x(c),y(r),DOT,DOT);
  if(!lit(c,r-1)){ctx.fillStyle=tone.light;ctx.fillRect(x(c),y(r),DOT,EDGE);}
  if(!lit(c,r+1)){ctx.fillStyle=tone.dark;ctx.fillRect(x(c),y(r)+DOT-EDGE,DOT,EDGE);}
 }
 texture.update(true);texture.hasAlpha=true;texture.wrapU=texture.wrapV=Texture.CLAMP_ADDRESSMODE;
 const material=new StandardMaterial(name,scene);
 material.disableLighting=true;material.diffuseTexture=texture;material.useAlphaFromDiffuseTexture=true;material.emissiveColor=Color3.White();
 material.specularColor=Color3.Black();material.backFaceCulling=false;material.fogEnabled=false;material.freeze();
 return material;
}
export function createQuestMarkers(scene){
 const materials={},marks=new Map(),probes=new Map();
 const material=glyph=>materials[glyph]??=glyphMaterial(scene,glyph);
 return {
  // id → glyph ('?' | '!' | null) at a fixed head height.
  set(id,glyph,x,y,z){
   let mark=marks.get(id);
   if(!glyph){mark?.mesh.setEnabled(false);if(mark)mark.glyph=null;return;}
   if(!mark){
    const mesh=MeshBuilder.CreatePlane(`v03-marker-${id}`,{width:.4,height:.4*MARKER_TEXELS.height/MARKER_TEXELS.width},scene);
    mesh.billboardMode=7;mesh.isPickable=false;mesh.doNotSyncBoundingInfo=true;mesh.alwaysSelectAsActiveMesh=true;mesh.renderingGroupId=1;
    mark={mesh,glyph:null,x,y,z};marks.set(id,mark);
   }
   mark.x=x;mark.y=y;mark.z=z;
   if(mark.glyph!==glyph){mark.glyph=glyph;mark.mesh.material=material(glyph);}
   mark.mesh.setEnabled(true);
  },
  // A stepped bob (whole pixels, a few frames per step) suits the pixel glyph.
  update(time){for(const [,mark] of marks)if(mark.glyph){const bob=Math.round(Math.sin(time*2.4+mark.x)*3)*.03;mark.mesh.position.set(mark.x,mark.y+bob,mark.z);}},
  clear(){for(const [,mark] of marks)mark.mesh.dispose();marks.clear();},
  // Builds the glyph shaders ahead of first use (see guide-wisp.js warm).
  // The probe planes stay (disabled) until dispose: Babylon 9.31 counts an
  // effect's users and drops it with its last mesh, so a probe that is
  // disposed after compiling leaves nothing prepared (measured 2026-11-20).
  warm(glyphs=['?','!','+']){
   for(const glyph of glyphs)try{
    if(probes.has(glyph))continue;
    const probe=MeshBuilder.CreatePlane('v03-marker-warm-'+GLYPH_NAMES[glyph],{width:.4,height:.4},scene);probe.isPickable=false;probe.setEnabled(false);probe.renderingGroupId=1;probe.billboardMode=7;
    probes.set(glyph,probe);probe.material=material(glyph);void material(glyph).forceCompilationAsync(probe).catch(()=>{});
   }catch{/* compiled on first use instead */}
  },
  dispose(){this.clear();for(const probe of probes.values())probe.dispose();probes.clear();for(const glyph in materials){materials[glyph].diffuseTexture?.dispose();materials[glyph].dispose();}},
 };
}
