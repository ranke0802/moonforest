Shader "Witch/Painted Combat" {
 Properties { _MainTex("RGBA atlas",2D)="black"{} _Tint("Tint",Color)=(1,1,1,1) _Frames("Frames and row",Vector)=(0,1,0,0) _Mirror("Mirror",Float)=0 }
 SubShader { Tags {"Queue"="Transparent+12" "RenderType"="Transparent"} Cull Off ZWrite Off Blend SrcAlpha One
 Pass {CGPROGRAM
 #pragma vertex vert
 #pragma fragment frag
 #include "UnityCG.cginc"
 struct appdata{float4 vertex:POSITION;float2 uv:TEXCOORD0;};struct v2f{float4 vertex:SV_POSITION;float2 uv:TEXCOORD0;};sampler2D _MainTex;float4 _MainTex_TexelSize,_Tint,_Frames;float _Mirror;
 v2f vert(appdata v){v2f o;o.vertex=UnityObjectToClipPos(v.vertex);o.uv=v.uv;return o;}
 fixed4 frag(v2f i):SV_Target{float2 uv=i.uv;uv.x=lerp(uv.x,1-uv.x,_Mirror);float2 inset=_MainTex_TexelSize.xy*1.5;float2 cell=inset+uv*(.25-inset*2);float2 base=float2(0,(3-_Frames.z)*.25);fixed4 a=tex2D(_MainTex,base+float2(_Frames.x*.25,0)+cell);fixed4 b=tex2D(_MainTex,base+float2(_Frames.y*.25,0)+cell);return lerp(a,b,_Frames.w)*_Tint;}
 ENDCG }
 }
}
