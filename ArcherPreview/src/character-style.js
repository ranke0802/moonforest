import {MaterialPluginBase,VertexBuffer} from '@babylonjs/core';
import {CHARACTER_STYLE_DEFAULTS} from './character-style-settings.js';

const scenes=new WeakMap(),surfacePlugins=new WeakMap(),inkPlugins=new WeakMap();
const neutral=Object.freeze({outline:true,outlineWidth:0,internal:false,internalStrength:0,brightness:1});
export function characterStyleFor(mesh){
  const group=mesh?.metadata?.characterStyleGroup;
  return mesh?.getScene().metadata?.characterStyleSettings?.[group]??CHARACTER_STYLE_DEFAULTS[group]??neutral;
}
export function setSceneCharacterStyles(scene,value){
  scene.metadata={...scene.metadata,characterStyleSettings:value};
  for(const mesh of scenes.get(scene)??[])applyInkEnabled(mesh);
}
function applyInkEnabled(mesh){
  const style=characterStyleFor(mesh);
  // Only own this ink mesh's local switch; never enable the actor, source or a
  // FoW-hidden parent. FoW separately owns isVisible, including its restore cache.
  mesh.setEnabled(mesh.metadata.characterInkInitiallyEnabled&&style.outline&&(mesh.metadata.characterStyleGroup!=='boss'||style.outlineWidth>0));
}
export function registerCharacterInk(mesh,group){
  if(mesh.metadata?.characterInkRegistered)return;
  mesh.metadata={...mesh.metadata,characterStyleGroup:group,characterInkRegistered:true,characterInkInitiallyEnabled:mesh.isEnabled(false)};
  const scene=mesh.getScene();let entries=scenes.get(scene);if(!entries){entries=new Set();scenes.set(scene,entries);}
  entries.add(mesh);mesh.onDisposeObservable.addOnce(()=>entries.delete(mesh));applyInkEnabled(mesh);
}

export class CharacterSurfaceStyle extends MaterialPluginBase{
  constructor(material){super(material,'MoonforestCharacterStyle',335,{},true,false);this.registerForExtraEvents=true;this._enable(true);}
  getUniforms(){return {ubo:[{name:'characterPaint',size:2,type:'vec2'}],fragment:'uniform vec2 characterPaint;'};}
  hardBindForSubMesh(buffer,_scene,_engine,subMesh){
    const mesh=subMesh.getRenderingMesh(),style=mesh.metadata?.elenaInlineFlash?neutral:characterStyleFor(mesh);
    const boss=mesh.metadata?.characterStyleGroup==='boss'&&!mesh.metadata?.elenaInlineFlash;
    // Other monsters predate Elena's painted bands. The common default must be
    // neutral on their approved surface; only adjustments add extra crease ink.
    buffer.updateFloat2('characterPaint',style.brightness/(boss?1.35:1),style.internal?Math.max(0,style.internalStrength-(boss ? .2 : 0)):0);
  }
  getCustomCode(type){if(type!=='fragment')return null;return {CUSTOM_FRAGMENT_BEFORE_FINALCOLORCOMPOSITION:`
    float characterPaintFactor = characterPaint.x;
    if (characterPaint.y > 0.0) {
      float characterCrease = clamp(length(fwidth(normalW))*2.0,0.0,1.0);
      float characterPaintEdge = clamp(length(fwidth(surfaceAlbedo + finalEmissive))*1.5,0.0,1.0);
      characterPaintFactor *= 1.0-characterPaint.y*max(characterCrease,characterPaintEdge);
    }
    finalDiffuse *= characterPaintFactor;
    finalEmissive *= characterPaintFactor;
  `};}
}

// The approved warrior already contains inverted-hull geometry. Keep it and
// add a signed pixel correction after skinning; zero exactly preserves its pose.
export class AuthoredCharacterInk extends MaterialPluginBase{
  constructor(material){super(material,'MoonforestAuthoredInk',340,{},true,false);this.registerForExtraEvents=true;this._enable(true);}
  getUniforms(){return {ubo:[{name:'characterInk',size:4,type:'vec4'}],vertex:'uniform vec4 characterInk;',fragment:'uniform vec4 characterInk;'};}
  hardBindForSubMesh(buffer,_scene,engine,subMesh){
    const mesh=subMesh.getRenderingMesh(),style=characterStyleFor(mesh),canvas=engine.getRenderingCanvas();
    buffer.updateFloat4('characterInk',style.outlineWidth*(mesh.metadata.characterInkNormalSign??-1),style.outline?1:0,canvas?.clientWidth||engine.getRenderWidth(),canvas?.clientHeight||engine.getRenderHeight());
  }
  getCustomCode(type){if(type==='vertex')return {CUSTOM_VERTEX_MAIN_END:`
    #ifdef NORMAL
    if (characterInk.x != 0.0) {
      vec3 inkNormal = normalize(mat3(finalWorld)*normalUpdated);
      vec4 inkDisplaced = viewProjection*(worldPos+vec4(inkNormal,0.0));
      vec2 inkDelta = (inkDisplaced.xy/inkDisplaced.w-gl_Position.xy/gl_Position.w)*characterInk.zw;
      if (dot(inkDelta,inkDelta) > .000001) gl_Position.xy += normalize(inkDelta)*characterInk.x*2.0/characterInk.zw*gl_Position.w;
    }
    #endif
  `};if(type==='fragment')return {CUSTOM_FRAGMENT_MAIN_BEGIN:'if (characterInk.y < .5) discard;'};return null;}
}
export function applyCharacterSurfaceStyle(asset,group){
  for(const mesh of asset.meshes){
    if(!mesh.getTotalVertices?.()||mesh.metadata?.moonforestOutline)continue;
    mesh.metadata={...mesh.metadata,characterStyleGroup:group};
    const material=mesh.material;if(material?.getClassName()!=='PBRMaterial')continue;
    if(/outline/i.test(mesh.name)||/outline/i.test(material.name)){
      if(!inkPlugins.has(material)){inkPlugins.set(material,new AuthoredCharacterInk(material));}
      if(mesh.metadata.characterInkNormalSign===undefined){
        const p=mesh.getVerticesData(VertexBuffer.PositionKind),n=mesh.getVerticesData(VertexBuffer.NormalKind),center=mesh.getBoundingInfo().boundingBox.center;
        let direction=0;for(let i=0;p&&n&&i<p.length;i+=3)direction+=(p[i]-center.x)*n[i]+(p[i+1]-center.y)*n[i+1]+(p[i+2]-center.z)*n[i+2];
        mesh.metadata.characterInkNormalSign=direction<0?-1:1;
      }
      registerCharacterInk(mesh,group);
    }else if(!surfacePlugins.has(material)){surfacePlugins.set(material,new CharacterSurfaceStyle(material));}
  }
}
