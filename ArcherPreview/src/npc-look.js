import {applyCharacterSurfaceStyle,registerCharacterInk} from './character-style.js';
import {isRuntimeOutline} from './character-outlines.js';
import {MaterialPluginBase} from '@babylonjs/core/Materials/materialPluginBase.js';
import {Color3} from '@babylonjs/core/Maths/math.color.js';
import {registerNpcInteriorInk} from './npc-interior-ink.js';
import {readyShaderEffect} from './cave-fog-binding.js';

const bounded=(value,min,max,fallback)=>Number.isFinite(value)?Math.max(min,Math.min(max,value)):fallback;
const plugins=new WeakMap();
const outlines=new WeakSet(),npcOutline=new Color3(.028,.022,.030),originalOutline=new Color3(.035,.025,.035);
function npcOutlineColor(material){if(outlines.has(material))return;outlines.add(material);material.onBindObservable.add(mesh=>{const effect=readyShaderEffect(material._activeEffect??material.getEffect());effect?.setColor3('outlineColor',mesh.metadata?.npcLook?npcOutline:originalOutline);});}
export function npcLookProfile(value={}){return {toon:true,pbr:false,outline:value.outline!==false,outlinePixels:bounded(value.outlinePixels,0,4,.6),interior:value.interior!==false,interiorStrength:bounded(value.interiorStrength,0,1,.25),brightness:bounded(value.brightness,.1,3,1.2)};}
export class NpcToonBands extends MaterialPluginBase{
 constructor(material){super(material,'MoonforestNpcToonBands',336,{MOONFOREST_NPC_TOON:true},true,false);this.doNotSerialize=true;this.registerForExtraEvents=true;this._enable(true);}
 getClassName(){return 'MoonforestNpcToonBands';}
 getUniforms(){return {ubo:[{name:'npcPaint',size:2,type:'vec2'}],fragment:'uniform vec2 npcPaint;'};}
 hardBindForSubMesh(buffer,_scene,_engine,subMesh){const look=subMesh.getRenderingMesh().metadata?.npcLook;buffer.updateFloat2('npcPaint',look?1:0,look?.brightness??1);}
 getCustomCode(type){return type==='fragment'?{CUSTOM_FRAGMENT_BEFORE_FINALCOLORCOMPOSITION:`
  if(npcPaint.x>.5){
   float facing=dot(normalize(normalW),normalize(vec3(-.35,.65,.75)));
   float npcBand=.78+.14*smoothstep(-.10,-.02,facing)+.12*smoothstep(.48,.56,facing);
   finalDiffuse=surfaceAlbedo*npcBand*npcPaint.y;
   finalAmbient=vec3(0.0);finalEmissive=vec3(0.0);
  }
 `}:null;}
}
// Per-mesh uniforms, not scene defaults or replacement textures. Geometry,
// skeleton targets and source animation keys remain exactly as loaded.
export function applyNpcLook(asset,value={}, {root,referenceHeight=1.85,baseScale=1}={}){
 // Supplied InteriorInk is a normal/depth screen contour, never albedo or
 // triangle-edge derivatives. Keep the older surface-style crease branch off.
 const look=npcLookProfile(value),style={outline:look.outline&&look.outlinePixels>0,outlineWidth:look.outlinePixels,internal:false,internalStrength:0,brightness:1};
 applyCharacterSurfaceStyle(asset,'npc');
 for(const mesh of asset.meshes){mesh.metadata={...mesh.metadata,characterStyleGroup:'npc',npcCharacterStyle:{...style},npcLook:{...look}};if(isRuntimeOutline(mesh)){mesh.metadata.outlinePixels=look.outlinePixels;npcOutlineColor(mesh.material);registerCharacterInk(mesh,'npc');mesh.setEnabled(style.outline);}else if(mesh.getTotalVertices?.()>0){if(mesh.material?.getClassName()==='PBRMaterial'&&!plugins.has(mesh.material))plugins.set(mesh.material,new NpcToonBands(mesh.material));if(root)registerNpcInteriorInk(mesh,{root,look,height:referenceHeight,baseScale});}}
 return look;
}
