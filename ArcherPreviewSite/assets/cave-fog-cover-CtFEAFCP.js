import{Yd as e,bd as t,d as n}from"./babylon-game-BmUxks-L.js";import{n as r}from"./babylon-tools~moonforestV2~npc-world~developer-editor~developer-actors~cinematic-game~autho~lpztzq2w-Bpka-MLQ.js";import{g as i}from"./witch-cave-layout-BMuYBXe6.js";import{i as a,n as o}from"./map-load-lifetime-Dt8Df8XW.js";var s=.9793707037107424,c=1.8146016164162133,l=1.6,u=l/s,d=u/c;function f(e,t){return Object.freeze({height:t,ratio:e,moveRadius:.32*e,spellRadius:.3*e,rollRadius:.25*e,standingClearance:.65*e,guardHeight:.95*e,bodyAimHeight:1.1*e,feedbackHeight:1.8*e,goldHeight:1.6*e,stableFocusHeight:1.5*e,sightFocusHeight:1.05*e,headHeight:1.5*e,chestHeight:.85*e,chinHeight:1.46*e,eyeBelowChin:.35*e,markerLength:.7*e,bladeRadius:.055*e,shieldStrikeRadius:.06*e})}var p=f(1,s*c),m=f(d,l);function h(e){return e?.metadata?.playerDimensions??p}function g(e,t,{warrior:n=!1}={}){let r=n?m:p;return e.metadata={...e.metadata,playerDimensions:r},e.scaling.setAll(n?u:t.scale||1),r}var _=new Map;function v(e,{timeoutMs:t,timers:n}={}){let r=new URL(e).href;if(!_.has(r)){_.size>=24&&_.delete(_.keys().next().value);let e=new o({timeoutMs:t,timers:n,stage:`manifest`}),i=e.run(async()=>{let t=await e.run(()=>fetch(r,{cache:`no-cache`,signal:e.signal}));if(!t.ok)throw Error(`리소스 목록을 불러오지 못했습니다 (${t.status}).`);return e.run(()=>t.json())}).finally(()=>e.close());_.set(r,i),i.catch(()=>{_.get(r)===i&&_.delete(r)})}return _.get(r)}var y=class{constructor(e,t=256){this.limit=e,this.maxEntries=t,this.entries=new Map,this.bytes=0,this.hits=0,this.misses=0,this.evictions=0}get(e){let t=this.entries.get(e);return t?(this.hits++,this.entries.delete(e),this.entries.set(e,t),t.value):(this.misses++,null)}put(e,t,n){if(!Number.isFinite(n)||n<=0||n>this.limit)return;let r=this.entries.get(e);for(r&&(this.bytes-=r.bytes,this.entries.delete(e));this.entries.size&&(this.bytes+n>this.limit||this.entries.size>=this.maxEntries);){let e=this.entries.keys().next().value;this.bytes-=this.entries.get(e).bytes,this.entries.delete(e),this.evictions++}this.entries.set(e,{value:t,bytes:n}),this.bytes+=n}clear(){this.entries.clear(),this.bytes=0}inspect(){return{bytes:this.bytes,limit:this.limit,entries:this.entries.size,hits:this.hits,misses:this.misses,evictions:this.evictions}}},b=new WeakMap;function x(e){let t=b.get(e);return t||(t={geometry:new y(8388608),textures:new y(25165824,96),disposed:!1},b.set(e,t),e.onDisposeObservable.addOnce(()=>{t.disposed=!0,t.geometry.clear(),t.textures.clear(),b.delete(e)}),t)}function S(e){let t=e&&b.get(e);return t?{geometry:t.geometry.inspect(),textures:t.textures.inspect()}:null}function C(e,t,n,r){let i=t.extensions?.EXT_meshopt_compression,a=e._loader?.gltf?.buffers?.[i?.buffer],o=a?.uri,s=i?.byteOffset??0,c=i?.filter??`NONE`;return typeof o==`string`&&/^(?:\.\/)?[a-f0-9]{64}\.bin$/.test(o)&&Number.isSafeInteger(s)&&s>=0&&Number.isSafeInteger(i.byteLength)&&i.byteLength>0&&Number.isSafeInteger(a.byteLength)&&s+i.byteLength<=a.byteLength&&Number.isSafeInteger(i.count)&&i.count>0&&Number.isSafeInteger(i.byteStride)&&i.byteStride>0&&Number.isSafeInteger(i.count*i.byteStride)&&typeof i.mode==`string`&&typeof c==`string`?JSON.stringify([`meshopt`,o.replace(/^\.\//,``),s,i.byteLength,i.count,i.byteStride,i.mode,c]):n+r}function w(e,t,n){/^[a-f0-9]{64}\.gltf$/.test(n)&&e.onExtensionLoadedObservable.add(e=>{if(e.name!==`EXT_meshopt_compression`)return;let r=e.loadBufferViewAsync.bind(e),i=x(t.getEngine()),a=new WeakMap;e.loadBufferViewAsync=(t,o)=>{if(!o.extensions?.EXT_meshopt_compression)return r(t,o);if(a.has(o))return a.get(o);let s=C(e,o,n,t),c=i.geometry.get(s);if(c){let e=Promise.resolve(c.slice());return a.set(o,e),e}let l=r(t,o)?.then(e=>(!i.disposed&&e.byteLength<=i.geometry.limit&&i.geometry.put(s,e.slice(),e.byteLength),e));return l&&(a.set(o,l),l.catch(()=>{a.get(o)===l&&a.delete(o)})),l}})}function T(e){if(!ArrayBuffer.isView(e)||e.byteLength<48)return!1;let t=new DataView(e.buffer,e.byteOffset,e.byteLength),n=t.getUint32(20,!0),r=t.getUint32(24,!0);return n>0&&r>0&&n<=2048&&r<=2048&&t.getUint32(28,!0)===0&&t.getUint32(32,!0)<=1&&t.getUint32(36,!0)===1}var E=e=>({...e,mipmaps:e.mipmaps.map(e=>({...e,data:e.data.slice()}))}),D=new Set([`transcodedFormat`,`isInGammaSpace`,`hasAlpha`,`transcoderName`]);async function O(e,t,n,r,i){if(!T(t)||!globalThis.crypto?.subtle)return r(t,n);let a=e._engine.getCaps(),o=[`astc`,`bptc`,`s3tc`,`pvrtc`,`etc2`,`etc1`].map(e=>!!a[e]),s=n?Object.fromEntries(Object.entries(n).filter(([e])=>!D.has(e))):null,c=await crypto.subtle.digest(`SHA-256`,t),l=Array.from(new Uint8Array(c),e=>e.toString(16).padStart(2,`0`)).join(``)+JSON.stringify([o,s,i]),u=x(e._engine),d=u.textures.get(l);if(d)return E(d);let f=await r(t,n);if(!u.disposed&&!f.errors&&!new Set([32856,33321,33323]).has(f.transcodedFormat)&&f.mipmaps?.every(e=>e.data)){let e=f.mipmaps.reduce((e,t)=>e+t.data.byteLength,0);e<=u.textures.limit&&u.textures.put(l,E(f),e)}return f}var k=new WeakSet;function A(e){if(k.has(e)||typeof e.prototype._decodeAsync!=`function`)return;k.add(e);let t=e.prototype._decodeAsync;e.prototype._decodeAsync=function(n,r){let i=Object.fromEntries([`useRGBAIfASTCBC7NotAvailableWhenUASTC`,`useRGBAIfOnlyBC1BC3AvailableWhenUASTC`,`forceRGBA`,`forceR8`,`forceRG8`,`bypassTranscoders`].map(t=>[t,e.DefaultDecoderOptions[t]]));return O(this,n,r,(e,n)=>t.call(this,e,n),i)}}var j=new WeakSet,M=new WeakSet,N=new WeakMap,P=new WeakMap;function F(e,t){let n=P.get(e);return n||(n=new Set,P.set(e,n)),n.add(t),()=>{n.delete(t),n.size||P.delete(e)}}function I(e,t){if(!e)return()=>{};if(j.has(e))return t(),()=>{};let n=N.get(e);return n||(n=new Set,N.set(e,n)),n.add(t),()=>{n.delete(t),n.size||N.delete(e)}}function L(e,t){if(!e)return;t??=e.getScene?.();let n=e.getInternalTexture?.();if(n?._references===1){j.add(n);let e=N.get(n);N.delete(n);for(let t of e??[])t();let r=n.getEngine?.().getLoadedTexturesCache?.()??t?.getEngine?.().getLoadedTexturesCache?.(),i=r?.indexOf(n)??-1;i>=0&&r.splice(i,1),t?.removePendingData(n)}e.dispose()}function R(e){if(M.has(e))return;M.add(e);let t=e.prototype._createTexture;e.prototype._createTexture=function(e,n,...r){if(j.has(n))throw a();let i=P.get(this._engine);if(!i?.size)return t.call(this,e,n,...r);let o=performance.now(),s=!1;try{let i=t.call(this,e,n,...r);return s=!0,i}finally{let t=performance.now(),n=e?.mipmaps?.[0],r={startedAtMs:o,completedAtMs:t,cpuMs:Math.max(0,t-o),width:n?.width??null,height:n?.height??null,mipCount:e?.mipmaps?.length??0,format:e?.transcodedFormat??null,success:s};for(let e of i)try{e(r)}catch{}}}}async function z(e,t,r,{skipMaterials:i=!1,fileName:s=``,signal:c,lifetime:l,timeoutMs:u,timers:d,onMeshLoaded:f}={}){let p=t?.asset?.minVersion;if(t?.asset?.version!==`2.0`||p!==void 0&&(!/^\d+\.\d+$/.test(p)||Number(p)>2))throw Error(`지원하지 않는 맵 모델 버전입니다.`);let m=!l;l??=new o({signal:c,timeoutMs:u,timers:d}),e.isDisposed&&l.abort(a());try{l.check()}catch(e){throw m&&l.close(),e}let h=new n;h.skipMaterials=i,w(h,e,s);let g,_,v,y=!1,b=!1,x=e=>{try{return e()}catch(e){l.noteCleanupError(e)}},S={meshes:new Set,materials:new Set,textures:new Set,cameras:new Set};for(let[e,t]of[[`meshes`,`onMeshLoadedObservable`],[`materials`,`onMaterialLoadedObservable`],[`textures`,`onTextureLoadedObservable`],[`cameras`,`onCameraLoadedObservable`]])h[t].add(t=>S[e].add(t));typeof f==`function`&&h.onMeshLoadedObservable.add(f);let C=()=>{g&&=(e.onDisposeObservable.remove(g),null)},T=t=>{_=t;let n=t.dispose.bind(t);t.dispose=()=>{if(!y){y=!0,C();for(let n of t.textures.splice(0))x(()=>L(n,e));n()}}},E=h._getLoader.bind(h);h._getLoader=t=>{l.check();let n=new Set(e.onDisposeObservable.observers);v=E(t);let r=v.importMeshAsync.bind(v),i=v.loadBufferViewAsync.bind(v),a=v.loadImageAsync.bind(v);return v.importMeshAsync=(e,t,i,...a)=>(g=t.onDisposeObservable.observers.find(e=>!n.has(e)),T(i),l.check(),r(e,t,i,...a)),v.loadBufferViewAsync=(...e)=>Promise.resolve(i(...e)).then(e=>(l.check(),e)),v.loadImageAsync=(...e)=>Promise.resolve(a(...e)).then(e=>(l.check(),e)),v};let D=()=>{if(b)return;b=!0;try{if(_&&!y){let t=(e,t)=>{for(let n of t??[])n&&!_[e].includes(n)&&_[e].push(n)};for(let[e,n]of Object.entries(S))t(e,n);if(v?._gltf){for(let[e,n]of[[`meshes`,`_getMeshes`],[`geometries`,`_getGeometries`],[`transformNodes`,`_getTransformNodes`],[`skeletons`,`_getSkeletons`],[`animationGroups`,`_getAnimationGroups`]])t(e,v[n]());t(`lights`,v._babylonLights)}for(let e of _.meshes)e.morphTargetManager&&t(`morphTargetManagers`,[e.morphTargetManager]);for(let t of _.textures.splice(0))x(()=>L(t,e));x(()=>_.dispose())}}catch(e){l.noteCleanupError(e)}let n=e=>e?.then(e=>{e&&!e.isDisposed&&x(()=>e.dispose())},()=>{});for(let e of t.accessors??[])for(let t of Object.values(e._babylonVertexBuffer??{}))n(t);for(let e of t.bufferViews??[])n(e._babylonBuffer);x(()=>h.dispose()),x(C);for(let e of Object.values(S))e.clear()},O=()=>D();l.signal.addEventListener(`abort`,O,{once:!0});let k=e.onDisposeObservable.addOnce(()=>l.abort(a()));try{return await l.run(()=>h.loadAssetContainerAsync(e,{json:t},r,void 0,s),{onLate:e=>e.dispose()})}catch(e){throw l.abort(e),D(),e}finally{l.signal.removeEventListener(`abort`,O),e.onDisposeObservable.remove(k);for(let e of Object.values(S))e.clear();m&&l.close()}}async function B(e,t,{signal:n,lifetime:r,timeoutMs:i,timers:s}={}){let c=!r;r??=new o({signal:n,timeoutMs:i,timers:s}),t.isDisposed&&r.abort(a());let l=t.onDisposeObservable.addOnce(()=>r.abort(a()));try{let n=await r.run(()=>fetch(e,{cache:`force-cache`,signal:r.signal}));if(!n.ok)throw Error(`맵 모델을 불러오지 못했습니다 (${n.status}).`);return await z(t,await r.run(()=>n.json()),new URL(`.`,e).href,{fileName:e.pathname.split(`/`).pop(),lifetime:r})}finally{t.onDisposeObservable.remove(l),c&&r.close()}}var V=`uniform vec4 cavePlayerView;uniform vec4 caveBossView;`,H=`
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
}`,U=new WeakMap;function W(n){let i=U.get(n);return i||(i=new e(new Uint8Array([255,255,255,255]),1,1,t.TEXTUREFORMAT_RGBA,n,!1,!1,r.NEAREST_SAMPLINGMODE,t.TEXTURETYPE_UNSIGNED_BYTE),i.name=`cave-fog-inactive-sampler`,i.gammaSpace=!1,i.wrapU=i.wrapV=r.CLAMP_ADDRESSMODE,U.set(n,i),n.onDisposeObservable.addOnce(()=>{U.delete(n),i.dispose()}),i)}function G(e){return e&&!e._isDisposed&&e.isReady?.()===!0?e:null}function K(e,t,n=null){let r=e.metadata?.caveFogRuntime;if(r&&!r.disposed){r.bind(t,n);return}let i=W(e);t.setTexture(`caveFogMap`,i),t.setFloat(`caveFogActive`,0),n=G(n),n&&(n.setTexture(`caveFogMap`,i),n.setFloat(`caveFogActive`,0))}var q=.25,J=`
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
`;function Y(e){let t=e.villagePrepared?.assets?.get(`cave-01-eroded-wall`),n=(t?.tiers?.get(2)?.meshes?.[0]?.material??t?.baseMeshes?.[0]?.material)?.albedoTexture;return n?.getInternalTexture?.()?n:W(e.scene)}var X=J;function Z(e,t,n=null){let r=Y(t),i=+(r.gammaSpace===!1);e.setTexture(`caveRockMap`,r),e.setFloat(`caveRockToGamma`,i),n=G(n),n&&(n.setTexture(`caveRockMap`,r),n.setFloat(`caveRockToGamma`,i))}function Q(e,t,{stride:n=4}={}){let r=e.getVerticesData(`position`),a=e.getVerticesData(`normal`),o=e.getIndices(),s=t.subdivisions,c=s+1;if(!Number.isInteger(n)||n<1||!Number.isInteger(s))throw TypeError(`Invalid rock shell grid`);let l=[],u=[],d=[],f=[],p=new Map,m=(e,t)=>{let n=t*c+e;return p.has(n)||(p.set(n,l.length/3),l.push(r[n*3],r[n*3+1],r[n*3+2]),u.push(a[n*3],a[n*3+1],a[n*3+2])),p.get(n)},h,g;if(e.metadata?.caveLaboratoryRetiredTriangles){h=new Uint8Array(s*s),g=new Uint32Array(s*s*6);for(let e=0;e<o.length;e+=3){let t=i(o[e],o[e+1],o[e+2],s);if(t<0)throw Error(`Laboratory cover requires the original terrain grid`);h[t>>1]|=1<<(t&1),g.set(o.slice(e,e+3),t*3)}}for(let t of e.subMeshes){let e=1/0,r=-1/0,i=1/0,a=-1/0;for(let n=t.indexStart;n<t.indexStart+t.indexCount;n++){let t=o[n],s=t%c,l=Math.floor(t/c);e=Math.min(e,s),r=Math.max(r,s),i=Math.min(i,l),a=Math.max(a,l)}let l=d.length;for(let t=i;t<a;t+=n)for(let o=e;o<r;o+=n){let l=Math.min(o+n,r),u=Math.min(t+n,a),f=t===i,p=l===r,_=u===a,v=o===e,y=!1;if(h){for(let e=t;e<u&&!y;e++)for(let t=o;t<l;t++)if(h[e*s+t]!==3){y=!0;break}}if(y){for(let e=t;e<u;e++)for(let t=o;t<l;t++)for(let n=0;n<2;n++)if(h[e*s+t]&1<<n){let r=((e*s+t)*2+n)*3;for(let e=0;e<3;e++){let t=g[r+e];d.push(m(t%c,Math.floor(t/c)))}}continue}if(!f&&!p&&!_&&!v){let e=m(o,t),n=m(l,t),r=m(l,u),i=m(o,u);d.push(e,n,r,e,r,i);continue}let b=[];for(let e=o;e<l;e+=f?1:l-o)b.push(m(e,t));for(let e=t;e<u;e+=p?1:u-t)b.push(m(l,e));for(let e=l;e>o;e-=_?1:l-o)b.push(m(e,u));for(let e=u;e>t;e-=v?1:u-t)b.push(m(o,e));let x=m(Math.floor((o+l)/2),Math.floor((t+u)/2));for(let e=0;e<b.length;e++)d.push(x,b[e],b[(e+1)%b.length])}f.push({indexStart:l,indexCount:d.length-l})}return{positions:Float32Array.from(l),normals:Float32Array.from(u),indices:Uint32Array.from(d),patches:f,originalTriangles:o.length/3,triangles:d.length/3}}var $=`
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
`,ee=`precision highp float;
varying vec3 fogWorldPosition;
varying vec3 fogWorldNormal;
uniform vec3 caveEye;uniform vec3 caveFocus;
${$}
${X}
${V}
${H}
void main(){
  if(caveFogActive<.5)discard;
  // The unknown-space enclosure stays closed, even when a local visible rock
  // is cut around the player. Never expose the backs of unsubmitted rooms.
  vec2 state=caveFogState(fogWorldPosition);
  vec3 rock=caveRockShade(fogWorldPosition,fogWorldNormal,state.y);
  rock=mix(caveFogSurfaceMemory(rock),rock,smoothstep(.08,.92,state.x));
  float haze=caveDistanceHaze(fogWorldPosition,caveEye);
  gl_FragColor=vec4(mix(rock,vec3(.024,.028,.038),haze),1.);
}`;export{p as C,h as E,v as S,g as T,L as _,Q as a,S as b,K as c,H as d,V as f,F as g,R as h,Z as i,W as l,z as m,$ as n,Y as o,B as p,X as r,q as s,ee as t,G as u,I as v,m as w,A as x,y};