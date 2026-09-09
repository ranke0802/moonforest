Shader "Witch/Sword Blade Trail" {
 Properties { _MainTex("Painted energy atlas",2D)="white"{} }
 SubShader { Tags {"Queue"="Transparent+12" "RenderType"="Transparent"} Cull Off ZWrite Off Blend SrcAlpha One
 Pass { CGPROGRAM
 #pragma vertex vert
 #pragma fragment frag
 #include "UnityCG.cginc"
 struct appdata {float4 vertex:POSITION;float2 uv:TEXCOORD0;fixed4 color:COLOR;};
 struct v2f {float4 pos:SV_POSITION;float2 uv:TEXCOORD0;fixed4 color:COLOR;};
 sampler2D _MainTex;
 v2f vert(appdata v){v2f o;o.pos=UnityObjectToClipPos(v.vertex);o.uv=v.uv;o.color=v.color;return o;}
 fixed4 frag(v2f i):SV_Target{
  // Reuse the painted slash's grain within a ribbon bounded by the actual blade.
  fixed4 paint=tex2D(_MainTex,float2(.27+i.uv.x*.20,.77+i.uv.y*.20));
  float edge=smoothstep(0,.18,i.uv.y)*(1-smoothstep(.94,1,i.uv.y));
  float ridge=pow(saturate(1-abs(i.uv.y-.86)*9),3);
  fixed3 color=lerp(i.color.rgb,fixed3(1,1,.94),ridge*.7);
  return fixed4(color,i.color.a*edge*(.48+.35*paint.r+.35*ridge));
 }
 ENDCG }
 }
}
