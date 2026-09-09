Shader "Forest/Readable Foliage" {
 Properties { _MainTex("Texture",2D)="white"{} _Color("Tint",Color)=(1,1,1,1) _Cutoff("Alpha cutoff",Range(0,1))=.4 }
 SubShader { Tags {"RenderType"="TransparentCutout" "Queue"="AlphaTest"} Cull Off
 CGPROGRAM
 #pragma surface surf Standard alphatest:_Cutoff addshadow vertex:vert
 #pragma target 4.0
 sampler2D _MainTex; fixed4 _Color;float4 _WitchPosition;float4 _AimTarget;float4 _ForestCamera;float4 _CampClearing;float4 _EntranceClearing;float4 _AdventureClearing;float4 _AdventureSiteA;float4 _AdventureSiteB;float4 _AdventureView;
 struct Input {float2 uv_MainTex;float3 worldPos;float4 tree;float4 screenPos;};
 void vert(inout appdata_full v,out Input o){UNITY_INITIALIZE_OUTPUT(Input,o);o.tree=v.texcoord3;}
 float TreeCover(float4 tree,float3 target,float3 camera){
  float2 ray=camera.xz-target.xz;float t=dot(tree.xz-target.xz,ray)/max(dot(ray,ray),.001);
  float y=lerp(target.y,camera.y,t);float radius=clamp(tree.w*.19,.8,2.6);
  float side=distance(tree.xz,target.xz+saturate(t)*ray);
  return (t>.015&&t<.98&&y>tree.y-.4&&y<tree.y+tree.w+.4)?1-smoothstep(radius*.7,radius+1,side):0;
 }
 void surf(Input IN,inout SurfaceOutputStandard o){
  clip(distance(IN.worldPos.xz,_CampClearing.xz)-_CampClearing.w);clip(distance(IN.worldPos.xz,_EntranceClearing.xz)-_EntranceClearing.w);
  clip(distance(IN.worldPos.xz,_AdventureClearing.xz)-_AdventureClearing.w);clip(distance(IN.worldPos.xz,_AdventureSiteA.xz)-_AdventureSiteA.w);clip(distance(IN.worldPos.xz,_AdventureSiteB.xz)-_AdventureSiteB.w);
  fixed4 c=tex2D(_MainTex,IN.uv_MainTex)*_Color;
  float3 a=_WitchPosition.xyz+float3(0,1,0),b=_ForestCamera.xyz;
  // Fade the whole authored tree, retaining its silhouette instead of cutting a hole around the hero.
  float cover=TreeCover(IN.tree,a,b);
  if(_AimTarget.w>0)cover=max(cover,TreeCover(IN.tree,_AimTarget.xyz+float3(0,.7,0),b));
  float opacity=lerp(1,.30,cover);
  #ifndef UNITY_PASS_SHADOWCASTER
  float2 pixel=floor(IN.screenPos.xy/max(IN.screenPos.w,.0001)*_ScreenParams.xy);
  float noise=frac(52.9829189*frac(dot(pixel,float2(.06711056,.00583715))));
  clip(opacity-noise*.98);
  #endif
  o.Albedo=c.rgb;o.Alpha=c.a;o.Metallic=0;o.Smoothness=.04;o.Emission=c.rgb*.08;
 }
 ENDCG
 } Fallback "Transparent/Cutout/Diffuse"
}
