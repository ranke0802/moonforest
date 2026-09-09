Shader "Forest/Readable Foliage" {
 Properties { _MainTex("Texture",2D)="white"{} _Color("Tint",Color)=(1,1,1,1) _Cutoff("Alpha cutoff",Range(0,1))=.4 }
 SubShader { Tags {"RenderType"="TransparentCutout" "Queue"="AlphaTest"} Cull Off
 CGPROGRAM
 #pragma surface surf Standard alphatest:_Cutoff addshadow
 #pragma target 3.0
 sampler2D _MainTex; fixed4 _Color;float4 _WitchPosition;float4 _AimTarget;float4 _ForestCamera;float4 _CampClearing;float4 _EntranceClearing;
 struct Input {float2 uv_MainTex;float3 worldPos;};
 void surf(Input IN,inout SurfaceOutputStandard o){
  clip(distance(IN.worldPos.xz,_CampClearing.xz)-_CampClearing.w);clip(distance(IN.worldPos.xz,_EntranceClearing.xz)-_EntranceClearing.w);
  fixed4 c=tex2D(_MainTex,IN.uv_MainTex)*_Color;
  float3 a=_WitchPosition.xyz+float3(0,1,0),b=_ForestCamera.xyz;
  float3 v=b-a;float t=saturate(dot(IN.worldPos-a,v)/max(dot(v,v),.001));float d=distance(IN.worldPos,a+t*v);
  float fade=smoothstep(1.1,1.9,d);float3 ta=_AimTarget.xyz+float3(0,.7,0);float3 tv=b-ta;float tt=saturate(dot(IN.worldPos-ta,tv)/max(dot(tv,tv),.001));if(_AimTarget.w>0&&tt>.02&&tt<.96)fade=min(fade,smoothstep(.65,1.05,distance(IN.worldPos,ta+tt*tv)));if((t>.02&&t<.96)||(_AimTarget.w>0&&tt>.02&&tt<.96)){float noise=frac(sin(dot(floor(IN.worldPos*90),float3(12.9898,78.233,37.719)))*43758.5453);clip(fade-noise*.96-.015);}
  o.Albedo=c.rgb;o.Alpha=c.a;o.Metallic=0;o.Smoothness=.04;o.Emission=c.rgb*.08;
 }
 ENDCG
 } Fallback "Transparent/Cutout/Diffuse"
}
