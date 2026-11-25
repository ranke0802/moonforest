import {Color3} from '@babylonjs/core/Maths/math.color.js';
import {MaterialPluginBase} from '@babylonjs/core/Materials/materialPluginBase.js';

export function validHorseCoat(value){
  if(value==='original')return value;
  return typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value)?value.toLowerCase():null;
}

// Only the mount's body uses this plugin. The source atlas provides the paint,
// markings and strand detail; a single uniform selects a new coat on that paint.
export class HorseCoat extends MaterialPluginBase {
  constructor(material){
    super(material,'MoonforestHorseCoat',332,{},true,false);
    this.tint=new Color3();this.strength=0;this.doNotSerialize=true;
    this._enable(true);
  }
  setCoat(value){
    this.strength=value==='original'?0:1;
    if(this.strength)Color3.FromHexString(value).toLinearSpaceToRef(this.tint);
  }
  getClassName(){return 'MoonforestHorseCoat';}
  getUniforms(){return {ubo:[{name:'horseCoat',size:4,type:'vec4'}],fragment:'uniform vec4 horseCoat;'};}
  bindForSubMesh(buffer){buffer.updateFloat4('horseCoat',this.tint.r,this.tint.g,this.tint.b,this.strength);}
  getCustomCode(type){
    if(type==='vertex')return {
      CUSTOM_VERTEX_DEFINITIONS:'varying vec2 vHorseProfile;',
      // Bind-pose coordinates stay attached to the original UVs under skinning.
      CUSTOM_VERTEX_MAIN_BEGIN:'vHorseProfile=position.zy;'
    };
    if(type!=='fragment')return null;
    return {CUSTOM_FRAGMENT_DEFINITIONS:`
      varying vec2 vHorseProfile;
      float horseStrapDistance(vec2 p,vec2 a,vec2 b){
        vec2 ab=b-a;
        return length(p-a-ab*clamp(dot(p-a,ab)/dot(ab,ab),0.0,1.0));
      }
      // The bridle is painted on the body atlas. Its straps cross UV islands
      // but follow the same profile on both sides of this particular GLB.
      float horseFaceProtection(vec2 p,vec3 albedo,float lightness){
        float strap=min(horseStrapDistance(p,vec2(31.7,83.8),vec2(33.35,75.55)),
                        horseStrapDistance(p,vec2(33.35,75.55),vec2(31.8,67.6)));
        strap=min(strap,horseStrapDistance(p,vec2(33.35,75.55),vec2(40.9,67.8)));
        strap=min(strap,horseStrapDistance(p,vec2(38.35,65.0),vec2(45.9,71.65)));
        float leather=1.0-smoothstep(.86,1.32,strap);
        float rings=min(length((p-vec2(33.35,75.55))/vec2(1.55,1.45)),
                        length((p-vec2(40.85,67.85))/vec2(1.5,1.48)));
        float eye=length((p-vec2(39.1,75.95))/vec2(1.42,1.08));
        // The original paint distinguishes warm cheek fur, dark leather and
        // less saturated buckle highlights even when they share one triangle.
        float tack=max(1.0-smoothstep(.065,.102,lightness),
                       smoothstep(.34,.48,albedo.g/max(albedo.r,.001)));
        float fittings=max(1.0-smoothstep(.83,1.02,rings),
                           (1.0-smoothstep(.91,1.16,min(rings,eye)))*tack);
        float muzzle=smoothstep(40.,46.,p.x)*(1.0-smoothstep(64.4,68.,p.y));
        float straps=max(1.0-smoothstep(.68,1.08,strap),leather*tack);
        return max(max(straps,fittings),max(muzzle,1.0-smoothstep(.54,.8,eye)));
      }
    `,CUSTOM_FRAGMENT_UPDATE_ALBEDO:`
      if(horseCoat.w>.5){
        float lightness=dot(surfaceAlbedo,vec3(.2126,.7152,.0722));
        vec2 p=vHorseProfile;
        float preserve=1.0-smoothstep(4.9,6.2,p.y);
        if(p.x>28.0&&p.y>59.0)preserve=max(preserve,horseFaceProtection(p,surfaceAlbedo,lightness));
        float tailEdge=-41.8+.087*p.y+.18*max(p.y-48.0,0.0);
        float tail=1.0-smoothstep(tailEdge-.55,tailEdge+.55,p.x);
        float mane=smoothstep(-2.0,2.0,p.x)*smoothstep(57.0+.48*p.x,61.0+.48*p.x,p.y);
        float strands=max(tail,mane)*(1.0-smoothstep(.051,.093,lightness));
        vec3 dye=mix(vec3(.043),vec3(.86),horseCoat.rgb);
        vec3 painted=dye*clamp(pow(max(lightness,.001)/.115,.76),.16,1.35);
        float dyeLight=dot(horseCoat.rgb,vec3(.2126,.7152,.0722));
        vec3 hair=mix(surfaceAlbedo,vec3(lightness),.7)*mix(.32,.84,sqrt(dyeLight));
        surfaceAlbedo=mix(mix(painted,hair,strands),surfaceAlbedo,preserve);
      }
    `};
  }
}
