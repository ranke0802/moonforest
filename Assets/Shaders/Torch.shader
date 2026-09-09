Shader "Forest/Flameguard Glow"
{
 Properties
 {
  _MainTex("Color",2D)="white"{}
  _Color("Tint",Color)=(1,1,1,1)
 }
 SubShader
 {
  Tags { "RenderType"="Opaque" }
  CGPROGRAM
  #pragma surface surf Standard fullforwardshadows
  sampler2D _MainTex;
  fixed4 _Color;
  struct Input {float2 uv_MainTex;};
  void surf(Input i,inout SurfaceOutputStandard o)
  {
   fixed3 c=tex2D(_MainTex,i.uv_MainTex).rgb*_Color.rgb;
   o.Albedo=c;o.Smoothness=.1;
   float mask=saturate((c.r-.48)*5)*saturate((c.g-.28)*6)*saturate((.6-c.b)*4);
   o.Emission=c*mask*1.8;o.Alpha=1;
  }
  ENDCG
 }
 FallBack "Diffuse"
}
