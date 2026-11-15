import{Yd as e,bd as t}from"./babylon-game-DZXlSAq8.js";import{n}from"./babylon-tools~moonforestV2~npc-world~effect-world~developer-editor~developer-actors~cinemat~lfaguene-b-Pefizb.js";import{a as r}from"./cave-laboratory-geometry-BR-SKWD0.js";var i=`uniform vec4 cavePlayerView;uniform vec4 caveBossView;`,a=`
bool caveViewCorridor(vec3 point,vec3 eye,vec3 focus,float endRadius,float floorDepth){
 vec3 sight=focus-eye;float length2=max(dot(sight,sight),.001);
 float along=dot(point-eye,sight)/length2;
 if(along<.0001||along>.98||point.y<focus.y-floorDepth)return false;
 float radius=mix(.25,endRadius,along);
 return distance(point,eye+sight*along)<radius;
}
bool caveForegroundCutaway(vec3 point,vec3 eye,vec3 focus){
 vec3 player=cavePlayerView.w>.5?cavePlayerView.xyz:focus;
 return caveViewCorridor(point,eye,player,.65,.55);
}
bool caveTerrainCutaway(vec3 point,vec3 normal,vec3 eye,vec3 focus){
 return abs(normalize(normal).y)<.45&&caveForegroundCutaway(point,eye,focus);
}`,o=new WeakMap;function s(r){let i=o.get(r);return i||(i=new e(new Uint8Array([255,255,255,255]),1,1,t.TEXTUREFORMAT_RGBA,r,!1,!1,n.NEAREST_SAMPLINGMODE,t.TEXTURETYPE_UNSIGNED_BYTE),i.name=`cave-fog-inactive-sampler`,i.gammaSpace=!1,i.wrapU=i.wrapV=n.CLAMP_ADDRESSMODE,o.set(r,i),r.onDisposeObservable.addOnce(()=>{o.delete(r),i.dispose()}),i)}function c(e){return e&&!e._isDisposed&&e.isReady?.()===!0?e:null}function l(e,t,n=null){let r=e.metadata?.caveFogRuntime;if(r&&!r.disposed){r.bind(t,n);return}let i=s(e);t.setTexture(`caveFogMap`,i),t.setFloat(`caveFogActive`,0),n=c(n),n&&(n.setTexture(`caveFogMap`,i),n.setFloat(`caveFogActive`,0))}var u=.25,d=`
#ifndef CAVE_ROCK_SURFACE
#define CAVE_ROCK_SURFACE
vec3 caveRockAlbedo(vec3 p,vec3 normal){
 float strata=.5+.5*sin(p.y*.28+p.x*.08+p.z*.04);
 float weather=.5+.5*sin(p.x*.11-p.z*.09+p.y*.035);
 vec3 rock=mix(vec3(.24,.23,.235),vec3(.30,.275,.25),strata*.55+weather*.2);
 float facing=dot(normalize(normal),normalize(vec3(-.35,.78,-.52)));
 float band=.62+.27*smoothstep(-.32,.18,facing)+.19*smoothstep(.32,.72,facing);
 return rock*band;
}
// Preserve authored UV colour variation without letting baked black cavities
// read as a field of drilled holes. The bound is relative to the broad plane,
// so a lamp still reveals geometry, not an unlit flat replacement wallpaper.
vec3 caveRockPaintedDetail(vec3 broad,vec3 painted){
 return max(painted,broad*.55);
}
// Used only for unsubmitted-room enclosure/memory after image processing.
// Actual visible rock uses linear albedo and the static lamp illumination.
vec3 caveRockShade(vec3 p,vec3 normal,float explored){
 return caveRockAlbedo(p,normal)*mix(.12,.17,smoothstep(.05,.95,explored));
}
#endif
`;function f(e){let t=e.villagePrepared?.assets?.get(`cave-01-eroded-wall`),n=(t?.tiers?.get(2)?.meshes?.[0]?.material??t?.baseMeshes?.[0]?.material)?.albedoTexture;return n?.getInternalTexture?.()?n:s(e.scene)}var p=d;function m(e,t,n=null){let r=f(t),i=+(r.gammaSpace===!1);e.setTexture(`caveRockMap`,r),e.setFloat(`caveRockToGamma`,i),n=c(n),n&&(n.setTexture(`caveRockMap`,r),n.setFloat(`caveRockToGamma`,i))}function h(e,t,{stride:n=4}={}){let i=e.getVerticesData(`position`),a=e.getVerticesData(`normal`),o=e.getIndices(),s=t.subdivisions,c=s+1;if(!Number.isInteger(n)||n<1||!Number.isInteger(s))throw TypeError(`Invalid rock shell grid`);let l=[],u=[],d=[],f=[],p=new Map,m=(e,t)=>{let n=t*c+e;return p.has(n)||(p.set(n,l.length/3),l.push(i[n*3],i[n*3+1],i[n*3+2]),u.push(a[n*3],a[n*3+1],a[n*3+2])),p.get(n)},h,g;if(e.metadata?.caveLaboratoryRetiredTriangles){h=new Uint8Array(s*s),g=new Uint32Array(s*s*6);for(let e=0;e<o.length;e+=3){let t=r(o[e],o[e+1],o[e+2],s);if(t<0)throw Error(`Laboratory cover requires the original terrain grid`);h[t>>1]|=1<<(t&1),g.set(o.slice(e,e+3),t*3)}}for(let t of e.subMeshes){let e=1/0,r=-1/0,i=1/0,a=-1/0;for(let n=t.indexStart;n<t.indexStart+t.indexCount;n++){let t=o[n],s=t%c,l=Math.floor(t/c);e=Math.min(e,s),r=Math.max(r,s),i=Math.min(i,l),a=Math.max(a,l)}let l=d.length;for(let t=i;t<a;t+=n)for(let o=e;o<r;o+=n){let l=Math.min(o+n,r),u=Math.min(t+n,a),f=t===i,p=l===r,_=u===a,v=o===e,y=!1;if(h){for(let e=t;e<u&&!y;e++)for(let t=o;t<l;t++)if(h[e*s+t]!==3){y=!0;break}}if(y){for(let e=t;e<u;e++)for(let t=o;t<l;t++)for(let n=0;n<2;n++)if(h[e*s+t]&1<<n){let r=((e*s+t)*2+n)*3;for(let e=0;e<3;e++){let t=g[r+e];d.push(m(t%c,Math.floor(t/c)))}}continue}if(!f&&!p&&!_&&!v){let e=m(o,t),n=m(l,t),r=m(l,u),i=m(o,u);d.push(e,n,r,e,r,i);continue}let b=[];for(let e=o;e<l;e+=f?1:l-o)b.push(m(e,t));for(let e=t;e<u;e+=p?1:u-t)b.push(m(l,e));for(let e=l;e>o;e-=_?1:l-o)b.push(m(e,u));for(let e=u;e>t;e-=v?1:u-t)b.push(m(o,e));let x=m(Math.floor((o+l)/2),Math.floor((t+u)/2));for(let e=0;e<b.length;e++)d.push(x,b[e],b[(e+1)%b.length])}f.push({indexStart:l,indexCount:d.length-l})}return{positions:Float32Array.from(l),normals:Float32Array.from(u),indices:Uint32Array.from(d),patches:f,originalTriangles:o.length/3,triangles:d.length/3}}var g=`
#ifndef CAVE_FOG_STATE_DEFINED
#define CAVE_FOG_STATE_DEFINED
uniform sampler2D caveFogMap;
uniform vec4 caveFogRect;
uniform float caveFogActive;
uniform vec4 caveFogOrigin;
float caveDistanceHaze(vec3 p,vec3 eye){float rangeScale=caveFogActive>.5?max(1.,caveFogOrigin.w):1.;return smoothstep(22.*rangeScale,48.*rangeScale,length(p-(caveFogActive>.5?caveFogOrigin.xyz:eye)));}
// The paint/lantern and final fog stages ask about the same fragment. Retain
// this one existing lookup, never a second visibility texture or frame upload.
bool caveFogSampleReady=false;
vec3 caveFogSamplePosition=vec3(0.);
vec3 caveFogSampleValue=vec3(0.);
vec3 caveFogSample(vec3 p){
  if(caveFogSampleReady&&all(equal(p,caveFogSamplePosition)))return caveFogSampleValue;
  vec2 uv=(p.xz-caveFogRect.xy)/caveFogRect.zw;
  vec3 state=vec3(0.);
  if(uv.x>=0.&&uv.y>=0.&&uv.x<=1.&&uv.y<=1.)state=texture2D(caveFogMap,uv).rgb;
  caveFogSampleReady=true;caveFogSamplePosition=p;caveFogSampleValue=state;
  return state;
}
vec2 caveFogState(vec3 p){return caveFogSample(p).xy;}
float caveFogLanternVisibility(vec3 p){return caveFogSample(p).z;}
vec3 caveFogMemoryColor(vec3 p,float explored){
  // Low-detail darkness belongs to the real occluding surface, not a moving
  // black hemisphere. No repeated rock atlas or pattern is drawn in memory.
  return vec3(.024,.028,.038);
}
vec3 caveFogShade(vec3 base,vec3 p){
  if(caveFogActive<.5)return base;
  vec2 f=caveFogState(p);
  return mix(caveFogMemoryColor(p,f.y),base,smoothstep(.08,.92,f.x));
}
// An already submitted opaque surface still has a real face and depth. Retain
// a faint, desaturated version of that face instead of painting sharp black
// polygons across it. Hidden records/enemies keep their separate hard gate.
vec3 caveFogSurfaceMemory(vec3 base){
  vec3 bounded=clamp(base,vec3(0.),vec3(1.));
  float grey=dot(bounded,vec3(.2126,.7152,.0722));
  return mix(vec3(grey),bounded,.20)*.24;
}
vec3 caveFogShadeSurface(vec3 base,vec3 p,float environment){
  if(caveFogActive<.5)return base;
  vec2 state=caveFogState(p);
  vec3 memory=environment>.5?caveFogSurfaceMemory(base):caveFogMemoryColor(p,state.y);
  return mix(memory,base,smoothstep(.08,.92,state.x));
}
bool caveFogHidesInk(vec3 p){return caveFogActive>.5&&caveFogState(p).x<.92;}
#endif
`,_=`precision highp float;
varying vec3 fogWorldPosition;
varying vec3 fogWorldNormal;
uniform vec3 caveEye;uniform vec3 caveFocus;
${g}
${p}
${i}
${a}
void main(){
  if(caveFogActive<.5)discard;
  // The unknown-space enclosure stays closed, even when a local visible rock
  // is cut around the player. Never expose the backs of unsubmitted rooms.
  vec2 state=caveFogState(fogWorldPosition);
  vec3 rock=caveRockShade(fogWorldPosition,fogWorldNormal,state.y);
  rock=mix(caveFogSurfaceMemory(rock),rock,smoothstep(.08,.92,state.x));
  float haze=caveDistanceHaze(fogWorldPosition,caveEye);
  gl_FragColor=vec4(mix(rock,vec3(.024,.028,.038),haze),1.);
}`;export{h as a,l as c,a as d,i as f,m as i,s as l,g as n,f as o,p as r,u as s,_ as t,c as u};