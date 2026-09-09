Shader "Witch/Raster Magic" {
 Properties {_MainTex("Painted effect",2D)="black"{} _Tint("Tint",Color)=(1,1,1,1) _UVRect("UV rectangle",Vector)=(0,0,1,1)}
 SubShader {Tags {"Queue"="Transparent+10" "RenderType"="Transparent"} Cull Off ZWrite Off Blend SrcAlpha One
 Pass {CGPROGRAM
 #pragma vertex vert
 #pragma fragment frag
 #include "UnityCG.cginc"
 struct appdata {float4 vertex:POSITION;float2 uv:TEXCOORD0;};struct v2f {float4 vertex:SV_POSITION;float2 uv:TEXCOORD0;};sampler2D _MainTex;float4 _Tint,_UVRect;
 v2f vert(appdata v){v2f o;o.vertex=UnityObjectToClipPos(v.vertex);o.uv=_UVRect.xy+v.uv*_UVRect.zw;return o;}
 fixed4 frag(v2f i):SV_Target{return tex2D(_MainTex,i.uv)*_Tint;}
 ENDCG}
 }
}
