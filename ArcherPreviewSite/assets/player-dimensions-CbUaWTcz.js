import{g as e}from"./witch-cave-layout-BMuYBXe6.js";import{Yd as t,bd as n,d as r}from"./babylon-game-BmUxks-L.js";import{n as i}from"./babylon-tools~moonforestV2~npc-world~developer-editor~developer-actors~cinematic-game~autho~lpztzq2w-Bpka-MLQ.js";import{i as a,n as o}from"./map-load-lifetime-Dt8Df8XW.js";var s=new Map;function c(e,{timeoutMs:t,timers:n}={}){let r=new URL(e).href;if(!s.has(r)){s.size>=24&&s.delete(s.keys().next().value);let e=new o({timeoutMs:t,timers:n,stage:`manifest`}),i=e.run(async()=>{let t=await e.run(()=>fetch(r,{cache:`no-cache`,signal:e.signal}));if(!t.ok)throw Error(`리소스 목록을 불러오지 못했습니다 (${t.status}).`);return e.run(()=>t.json())}).finally(()=>e.close());s.set(r,i),i.catch(()=>{s.get(r)===i&&s.delete(r)})}return s.get(r)}var l=class{constructor(e,t=256){this.limit=e,this.maxEntries=t,this.entries=new Map,this.bytes=0,this.hits=0,this.misses=0,this.evictions=0}get(e){let t=this.entries.get(e);return t?(this.hits++,this.entries.delete(e),this.entries.set(e,t),t.value):(this.misses++,null)}put(e,t,n){if(!Number.isFinite(n)||n<=0||n>this.limit)return;let r=this.entries.get(e);for(r&&(this.bytes-=r.bytes,this.entries.delete(e));this.entries.size&&(this.bytes+n>this.limit||this.entries.size>=this.maxEntries);){let e=this.entries.keys().next().value;this.bytes-=this.entries.get(e).bytes,this.entries.delete(e),this.evictions++}this.entries.set(e,{value:t,bytes:n}),this.bytes+=n}clear(){this.entries.clear(),this.bytes=0}inspect(){return{bytes:this.bytes,limit:this.limit,entries:this.entries.size,hits:this.hits,misses:this.misses,evictions:this.evictions}}},u=new WeakMap;function d(e){let t=u.get(e);return t||(t={geometry:new l(8388608),textures:new l(25165824,96),disposed:!1},u.set(e,t),e.onDisposeObservable.addOnce(()=>{t.disposed=!0,t.geometry.clear(),t.textures.clear(),u.delete(e)}),t)}function f(e){let t=e&&u.get(e);return t?{geometry:t.geometry.inspect(),textures:t.textures.inspect()}:null}function p(e,t,n,r){let i=t.extensions?.EXT_meshopt_compression,a=e._loader?.gltf?.buffers?.[i?.buffer],o=a?.uri,s=i?.byteOffset??0,c=i?.filter??`NONE`;return typeof o==`string`&&/^(?:\.\/)?[a-f0-9]{64}\.bin$/.test(o)&&Number.isSafeInteger(s)&&s>=0&&Number.isSafeInteger(i.byteLength)&&i.byteLength>0&&Number.isSafeInteger(a.byteLength)&&s+i.byteLength<=a.byteLength&&Number.isSafeInteger(i.count)&&i.count>0&&Number.isSafeInteger(i.byteStride)&&i.byteStride>0&&Number.isSafeInteger(i.count*i.byteStride)&&typeof i.mode==`string`&&typeof c==`string`?JSON.stringify([`meshopt`,o.replace(/^\.\//,``),s,i.byteLength,i.count,i.byteStride,i.mode,c]):n+r}function m(e,t,n){/^[a-f0-9]{64}\.gltf$/.test(n)&&e.onExtensionLoadedObservable.add(e=>{if(e.name!==`EXT_meshopt_compression`)return;let r=e.loadBufferViewAsync.bind(e),i=d(t.getEngine()),a=new WeakMap;e.loadBufferViewAsync=(t,o)=>{if(!o.extensions?.EXT_meshopt_compression)return r(t,o);if(a.has(o))return a.get(o);let s=p(e,o,n,t),c=i.geometry.get(s);if(c){let e=Promise.resolve(c.slice());return a.set(o,e),e}let l=r(t,o)?.then(e=>(!i.disposed&&e.byteLength<=i.geometry.limit&&i.geometry.put(s,e.slice(),e.byteLength),e));return l&&(a.set(o,l),l.catch(()=>{a.get(o)===l&&a.delete(o)})),l}})}function h(e){if(!ArrayBuffer.isView(e)||e.byteLength<48)return!1;let t=new DataView(e.buffer,e.byteOffset,e.byteLength),n=t.getUint32(20,!0),r=t.getUint32(24,!0);return n>0&&r>0&&n<=2048&&r<=2048&&t.getUint32(28,!0)===0&&t.getUint32(32,!0)<=1&&t.getUint32(36,!0)===1}var g=e=>({...e,mipmaps:e.mipmaps.map(e=>({...e,data:e.data.slice()}))}),_=new Set([`transcodedFormat`,`isInGammaSpace`,`hasAlpha`,`transcoderName`]);async function v(e,t,n,r,i){if(!h(t)||!globalThis.crypto?.subtle)return r(t,n);let a=e._engine.getCaps(),o=[`astc`,`bptc`,`s3tc`,`pvrtc`,`etc2`,`etc1`].map(e=>!!a[e]),s=n?Object.fromEntries(Object.entries(n).filter(([e])=>!_.has(e))):null,c=await crypto.subtle.digest(`SHA-256`,t),l=Array.from(new Uint8Array(c),e=>e.toString(16).padStart(2,`0`)).join(``)+JSON.stringify([o,s,i]),u=d(e._engine),f=u.textures.get(l);if(f)return g(f);let p=await r(t,n);if(!u.disposed&&!p.errors&&!new Set([32856,33321,33323]).has(p.transcodedFormat)&&p.mipmaps?.every(e=>e.data)){let e=p.mipmaps.reduce((e,t)=>e+t.data.byteLength,0);e<=u.textures.limit&&u.textures.put(l,g(p),e)}return p}var y=new WeakSet;function b(e){if(y.has(e)||typeof e.prototype._decodeAsync!=`function`)return;y.add(e);let t=e.prototype._decodeAsync;e.prototype._decodeAsync=function(n,r){let i=Object.fromEntries([`useRGBAIfASTCBC7NotAvailableWhenUASTC`,`useRGBAIfOnlyBC1BC3AvailableWhenUASTC`,`forceRGBA`,`forceR8`,`forceRG8`,`bypassTranscoders`].map(t=>[t,e.DefaultDecoderOptions[t]]));return v(this,n,r,(e,n)=>t.call(this,e,n),i)}}var x=new WeakSet,S=new WeakSet,C=new WeakMap,w=new WeakMap;function T(e,t){let n=w.get(e);return n||(n=new Set,w.set(e,n)),n.add(t),()=>{n.delete(t),n.size||w.delete(e)}}function E(e,t){if(!e)return()=>{};if(x.has(e))return t(),()=>{};let n=C.get(e);return n||(n=new Set,C.set(e,n)),n.add(t),()=>{n.delete(t),n.size||C.delete(e)}}function D(e,t){if(!e)return;t??=e.getScene?.();let n=e.getInternalTexture?.();if(n?._references===1){x.add(n);let e=C.get(n);C.delete(n);for(let t of e??[])t();let r=n.getEngine?.().getLoadedTexturesCache?.()??t?.getEngine?.().getLoadedTexturesCache?.(),i=r?.indexOf(n)??-1;i>=0&&r.splice(i,1),t?.removePendingData(n)}e.dispose()}function O(e){if(S.has(e))return;S.add(e);let t=e.prototype._createTexture;e.prototype._createTexture=function(e,n,...r){if(x.has(n))throw a();let i=w.get(this._engine);if(!i?.size)return t.call(this,e,n,...r);let o=performance.now(),s=!1;try{let i=t.call(this,e,n,...r);return s=!0,i}finally{let t=performance.now(),n=e?.mipmaps?.[0],r={startedAtMs:o,completedAtMs:t,cpuMs:Math.max(0,t-o),width:n?.width??null,height:n?.height??null,mipCount:e?.mipmaps?.length??0,format:e?.transcodedFormat??null,success:s};for(let e of i)try{e(r)}catch{}}}}async function k(e,t,n,{skipMaterials:i=!1,fileName:s=``,signal:c,lifetime:l,timeoutMs:u,timers:d,onMeshLoaded:f}={}){let p=t?.asset?.minVersion;if(t?.asset?.version!==`2.0`||p!==void 0&&(!/^\d+\.\d+$/.test(p)||Number(p)>2))throw Error(`지원하지 않는 맵 모델 버전입니다.`);let h=!l;l??=new o({signal:c,timeoutMs:u,timers:d}),e.isDisposed&&l.abort(a());try{l.check()}catch(e){throw h&&l.close(),e}let g=new r;g.skipMaterials=i,m(g,e,s);let _,v,y,b=!1,x=!1,S=e=>{try{return e()}catch(e){l.noteCleanupError(e)}},C={meshes:new Set,materials:new Set,textures:new Set,cameras:new Set};for(let[e,t]of[[`meshes`,`onMeshLoadedObservable`],[`materials`,`onMaterialLoadedObservable`],[`textures`,`onTextureLoadedObservable`],[`cameras`,`onCameraLoadedObservable`]])g[t].add(t=>C[e].add(t));typeof f==`function`&&g.onMeshLoadedObservable.add(f);let w=()=>{_&&=(e.onDisposeObservable.remove(_),null)},T=t=>{v=t;let n=t.dispose.bind(t);t.dispose=()=>{if(!b){b=!0,w();for(let n of t.textures.splice(0))S(()=>D(n,e));n()}}},E=g._getLoader.bind(g);g._getLoader=t=>{l.check();let n=new Set(e.onDisposeObservable.observers);y=E(t);let r=y.importMeshAsync.bind(y),i=y.loadBufferViewAsync.bind(y),a=y.loadImageAsync.bind(y);return y.importMeshAsync=(e,t,i,...a)=>(_=t.onDisposeObservable.observers.find(e=>!n.has(e)),T(i),l.check(),r(e,t,i,...a)),y.loadBufferViewAsync=(...e)=>Promise.resolve(i(...e)).then(e=>(l.check(),e)),y.loadImageAsync=(...e)=>Promise.resolve(a(...e)).then(e=>(l.check(),e)),y};let O=()=>{if(x)return;x=!0;try{if(v&&!b){let t=(e,t)=>{for(let n of t??[])n&&!v[e].includes(n)&&v[e].push(n)};for(let[e,n]of Object.entries(C))t(e,n);if(y?._gltf){for(let[e,n]of[[`meshes`,`_getMeshes`],[`geometries`,`_getGeometries`],[`transformNodes`,`_getTransformNodes`],[`skeletons`,`_getSkeletons`],[`animationGroups`,`_getAnimationGroups`]])t(e,y[n]());t(`lights`,y._babylonLights)}for(let e of v.meshes)e.morphTargetManager&&t(`morphTargetManagers`,[e.morphTargetManager]);for(let t of v.textures.splice(0))S(()=>D(t,e));S(()=>v.dispose())}}catch(e){l.noteCleanupError(e)}let n=e=>e?.then(e=>{e&&!e.isDisposed&&S(()=>e.dispose())},()=>{});for(let e of t.accessors??[])for(let t of Object.values(e._babylonVertexBuffer??{}))n(t);for(let e of t.bufferViews??[])n(e._babylonBuffer);S(()=>g.dispose()),S(w);for(let e of Object.values(C))e.clear()},k=()=>O();l.signal.addEventListener(`abort`,k,{once:!0});let A=e.onDisposeObservable.addOnce(()=>l.abort(a()));try{return await l.run(()=>g.loadAssetContainerAsync(e,{json:t},n,void 0,s),{onLate:e=>e.dispose()})}catch(e){throw l.abort(e),O(),e}finally{l.signal.removeEventListener(`abort`,k),e.onDisposeObservable.remove(A);for(let e of Object.values(C))e.clear();h&&l.close()}}async function A(e,t,{signal:n,lifetime:r,timeoutMs:i,timers:s}={}){let c=!r;r??=new o({signal:n,timeoutMs:i,timers:s}),t.isDisposed&&r.abort(a());let l=t.onDisposeObservable.addOnce(()=>r.abort(a()));try{let n=await r.run(()=>fetch(e,{cache:`force-cache`,signal:r.signal}));if(!n.ok)throw Error(`맵 모델을 불러오지 못했습니다 (${n.status}).`);return await k(t,await r.run(()=>n.json()),new URL(`.`,e).href,{fileName:e.pathname.split(`/`).pop(),lifetime:r})}finally{t.onDisposeObservable.remove(l),c&&r.close()}}var j=`uniform vec4 cavePlayerView;uniform vec4 caveBossView;`,M=`
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
}`,N=new WeakMap;function P(e){let r=N.get(e);return r||(r=new t(new Uint8Array([255,255,255,255]),1,1,n.TEXTUREFORMAT_RGBA,e,!1,!1,i.NEAREST_SAMPLINGMODE,n.TEXTURETYPE_UNSIGNED_BYTE),r.name=`cave-fog-inactive-sampler`,r.gammaSpace=!1,r.wrapU=r.wrapV=i.CLAMP_ADDRESSMODE,N.set(e,r),e.onDisposeObservable.addOnce(()=>{N.delete(e),r.dispose()}),r)}function F(e){return e&&!e._isDisposed&&e.isReady?.()===!0?e:null}function I(e,t,n=null){let r=e.metadata?.caveFogRuntime;if(r&&!r.disposed){r.bind(t,n);return}let i=P(e);t.setTexture(`caveFogMap`,i),t.setFloat(`caveFogActive`,0),n=F(n),n&&(n.setTexture(`caveFogMap`,i),n.setFloat(`caveFogActive`,0))}var L=.25,R=`
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
`;function z(e){let t=e.villagePrepared?.assets?.get(`cave-01-eroded-wall`),n=(t?.tiers?.get(2)?.meshes?.[0]?.material??t?.baseMeshes?.[0]?.material)?.albedoTexture;return n?.getInternalTexture?.()?n:P(e.scene)}var B=R;function V(e,t,n=null){let r=z(t),i=+(r.gammaSpace===!1);e.setTexture(`caveRockMap`,r),e.setFloat(`caveRockToGamma`,i),n=F(n),n&&(n.setTexture(`caveRockMap`,r),n.setFloat(`caveRockToGamma`,i))}function H(t,n,{stride:r=4}={}){let i=t.getVerticesData(`position`),a=t.getVerticesData(`normal`),o=t.getIndices(),s=n.subdivisions,c=s+1;if(!Number.isInteger(r)||r<1||!Number.isInteger(s))throw TypeError(`Invalid rock shell grid`);let l=[],u=[],d=[],f=[],p=new Map,m=(e,t)=>{let n=t*c+e;return p.has(n)||(p.set(n,l.length/3),l.push(i[n*3],i[n*3+1],i[n*3+2]),u.push(a[n*3],a[n*3+1],a[n*3+2])),p.get(n)},h,g;if(t.metadata?.caveLaboratoryRetiredTriangles){h=new Uint8Array(s*s),g=new Uint32Array(s*s*6);for(let t=0;t<o.length;t+=3){let n=e(o[t],o[t+1],o[t+2],s);if(n<0)throw Error(`Laboratory cover requires the original terrain grid`);h[n>>1]|=1<<(n&1),g.set(o.slice(t,t+3),n*3)}}for(let e of t.subMeshes){let t=1/0,n=-1/0,i=1/0,a=-1/0;for(let r=e.indexStart;r<e.indexStart+e.indexCount;r++){let e=o[r],s=e%c,l=Math.floor(e/c);t=Math.min(t,s),n=Math.max(n,s),i=Math.min(i,l),a=Math.max(a,l)}let l=d.length;for(let e=i;e<a;e+=r)for(let o=t;o<n;o+=r){let l=Math.min(o+r,n),u=Math.min(e+r,a),f=e===i,p=l===n,_=u===a,v=o===t,y=!1;if(h){for(let t=e;t<u&&!y;t++)for(let e=o;e<l;e++)if(h[t*s+e]!==3){y=!0;break}}if(y){for(let t=e;t<u;t++)for(let e=o;e<l;e++)for(let n=0;n<2;n++)if(h[t*s+e]&1<<n){let r=((t*s+e)*2+n)*3;for(let e=0;e<3;e++){let t=g[r+e];d.push(m(t%c,Math.floor(t/c)))}}continue}if(!f&&!p&&!_&&!v){let t=m(o,e),n=m(l,e),r=m(l,u),i=m(o,u);d.push(t,n,r,t,r,i);continue}let b=[];for(let t=o;t<l;t+=f?1:l-o)b.push(m(t,e));for(let t=e;t<u;t+=p?1:u-e)b.push(m(l,t));for(let e=l;e>o;e-=_?1:l-o)b.push(m(e,u));for(let t=u;t>e;t-=v?1:u-e)b.push(m(o,t));let x=m(Math.floor((o+l)/2),Math.floor((e+u)/2));for(let e=0;e<b.length;e++)d.push(x,b[e],b[(e+1)%b.length])}f.push({indexStart:l,indexCount:d.length-l})}return{positions:Float32Array.from(l),normals:Float32Array.from(u),indices:Uint32Array.from(d),patches:f,originalTriangles:o.length/3,triangles:d.length/3}}var U=`
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
`,W=`precision highp float;
varying vec3 fogWorldPosition;
varying vec3 fogWorldNormal;
uniform vec3 caveEye;uniform vec3 caveFocus;
${U}
${B}
${j}
${M}
void main(){
  if(caveFogActive<.5)discard;
  // The unknown-space enclosure stays closed, even when a local visible rock
  // is cut around the player. Never expose the backs of unsubmitted rooms.
  vec2 state=caveFogState(fogWorldPosition);
  vec3 rock=caveRockShade(fogWorldPosition,fogWorldNormal,state.y);
  rock=mix(caveFogSurfaceMemory(rock),rock,smoothstep(.08,.92,state.x));
  float haze=caveDistanceHaze(fogWorldPosition,caveEye);
  gl_FragColor=vec4(mix(rock,vec3(.024,.028,.038),haze),1.);
}`,G=.9793707037107424,K=1.8146016164162133,q=1.6,J=q/G,Y=J/K;function X(e,t){return Object.freeze({height:t,ratio:e,moveRadius:.32*e,spellRadius:.3*e,rollRadius:.25*e,standingClearance:.65*e,guardHeight:.95*e,bodyAimHeight:1.1*e,feedbackHeight:1.8*e,goldHeight:1.6*e,stableFocusHeight:1.5*e,sightFocusHeight:1.05*e,headHeight:1.5*e,chestHeight:.85*e,chinHeight:1.46*e,eyeBelowChin:.35*e,markerLength:.7*e,bladeRadius:.055*e,shieldStrikeRadius:.06*e})}var Z=X(1,G*K),Q=X(Y,q);function $(e){return e?.metadata?.playerDimensions??Z}function ee(e,t,{warrior:n=!1}={}){let r=n?Q:Z;return e.metadata={...e.metadata,playerDimensions:r},e.scaling.setAll(n?J:t.scale||1),r}export{l as C,c as E,E as S,b as T,A as _,W as a,T as b,V as c,L as d,I as f,j as g,M as h,$ as i,H as l,F as m,Q as n,U as o,P as p,ee as r,B as s,Z as t,z as u,k as v,f as w,D as x,O as y};