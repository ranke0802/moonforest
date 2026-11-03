import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {parseHTML} from 'linkedom';
import {NullEngine,Scene,FreeCamera,MeshBuilder,StandardMaterial,DirectionalLight,ShadowGenerator,TransformNode,Vector3} from '@babylonjs/core';
import {loadingArtFor} from '../src/loading-art.js';
import {createLoadingView} from '../src/loading-view.js';
import {createMapTransition} from '../src/map-transition.js';
import {currentFrameReadiness,waitForSceneReady} from '../src/scene-ready.js';

const require=createRequire(import.meta.url),{parse}=require('@acemir/cssom');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const manifest=JSON.parse(readFileSync(new URL('../public/assets/map-loading-art.json',import.meta.url)));
const characters=['warrior-v3','warrior-plains','warrior-v4','warrior-v5'];
const maps=['village','great-plains','monster-forest','witch-cave'],results=[];
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function fixture(clipboard=null){
 const {document,window}=parseHTML(html),get=id=>document.getElementById(id),view=createLoadingView(document,{clipboard});
 get('loading-diagnostics-export').select=()=>{};
 return {document,window,get,view,track:document.querySelector('#loading [role="progressbar"]'),clickCopy:()=>get('copy-loading-diagnostics').dispatchEvent(new window.Event('click'))};
}
const snapshot=f=>({title:f.get('loading-title').textContent,text:f.get('loading-text').textContent,bytes:f.get('loading-bytes').textContent,width:f.get('loading-progress').style.width,aria:f.track.getAttribute('aria-valuenow'),image:f.get('loading-art').getAttribute('src'),hidden:f.get('loading').hidden});
function webpDimensions(bytes){
 assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WEBP');
 for(let at=12;at+8<=bytes.length;){const type=bytes.toString('ascii',at,at+4),length=bytes.readUInt32LE(at+4),p=at+8;
  if(type==='VP8X')return {width:bytes.readUIntLE(p+4,3)+1,height:bytes.readUIntLE(p+7,3)+1};
  if(type==='VP8 '){assert.equal(bytes.toString('hex',p+3,p+6),'9d012a');return {width:bytes.readUInt16LE(p+6)&0x3fff,height:bytes.readUInt16LE(p+8)&0x3fff};}
  if(type==='VP8L'){const bits=bytes.readUInt32LE(p+1);return {width:(bits&0x3fff)+1,height:((bits>>>14)&0x3fff)+1};}
  at=p+length+(length&1);
 }throw Error('WebP dimensions missing');
}

test('all four map characters select distinct actual content-addressed WebP files from a nested app route',t=>{
 const old=globalThis.location;globalThis.location={href:'https://example.test/nested/ArcherPreviewSite/?character=warrior-v5&rev=abc'};t.after(()=>{globalThis.location=old;});
 const urls=new Set(),images=[];
 for(const [i,character]of characters.entries()){
  assert.equal(manifest.characters[character],maps[i]);const entry=manifest.artworks[maps[i]],art=loadingArtFor(character),url=new URL(art.url);
  assert.equal(url.pathname,'/nested/ArcherPreviewSite/assets/'+entry.url.replace(/^\.\//,''));assert.equal(art.label,entry.label);assert.equal(art.position,entry.position);
  const file=new URL(entry.url,new URL('../public/assets/',import.meta.url)),bytes=readFileSync(file),hash=url.pathname.split('/').at(-1).split('.')[0];
  assert.equal(bytes.length,entry.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),hash);
  assert.deepEqual(webpDimensions(bytes),{width:entry.width,height:entry.height});assert.equal(entry.width,1672);assert.equal(entry.height,941);urls.add(art.url);images.push({character,map:maps[i],bytes:entry.bytes,width:entry.width,height:entry.height});
 }
 assert.equal(urls.size,4);for(const legacy of [undefined,null,'archer','warrior-v2','__proto__','constructor'])assert.equal(loadingArtFor(legacy),null);
 results.push({case:'actual-four-map-WebP-and-nested-route',images});
});

test('actual loading DOM replaces map art on every attempt and rejects failed or superseded progress and reveal callbacks',()=>{
 const f=fixture();let previous=0,visits=0;
 for(const character of [...characters,...characters.toReversed()]){
  const id=f.view.begin(character);assert.ok(Number.isInteger(id)&&id>previous);previous=id;
  assert.equal(f.get('loading-art').getAttribute('src'),loadingArtFor(character).url);assert.equal(f.get('loading-art').hidden,false);assert.equal(f.get('loading-art').style.objectPosition,loadingArtFor(character).position);
  f.view.download({loaded:3e6,total:12e6,ratio:.25},id);assert.match(f.get('loading-text').textContent,/불러오는 중 \(3\.0\s*\/\s*12\.0\s*MB\)/);assert.equal(f.get('loading-progress').style.width,'17.5%');
  const error=Object.assign(Error('controlled model failure'),{code:'MODEL_PROBE',stage:'model'});f.view.fail('목적지 준비 실패','실제 오류를 유지합니다.',{error});const failed=snapshot(f);
  f.view.download({loaded:12e6,total:12e6,ratio:1,complete:true},id);f.view.preparing({completed:9,total:9},id);assert.equal(f.view.reveal(id),false);assert.deepEqual(snapshot(f),failed);
  const retry=f.view.begin(character);assert.ok(retry>id);const begun=snapshot(f);f.view.download({loaded:1,total:1,ratio:1},id);f.view.preparing({completed:1,total:1},id);assert.equal(f.view.reveal(id),false);assert.deepEqual(snapshot(f),begun);
  f.view.preparing({completed:2,total:5},retry);const preparing=snapshot(f);f.view.download({loaded:1,total:1,ratio:1},retry);assert.deepEqual(snapshot(f),preparing,'late download phase cannot overwrite preparation counts');assert.equal(f.view.reveal(retry),true);assert.equal(f.get('loading').hidden,true);previous=retry;visits++;
 }
 const legacy=f.view.begin('archer');assert.equal(f.get('loading-art').hidden,true);assert.equal(f.get('loading-art').hasAttribute('src'),false);f.view.preparing(undefined,legacy);assert.equal(f.view.reveal(legacy),true);
 const current=f.view.begin('warrior-v5');f.get('loading-art').dispatchEvent(new f.window.Event('error'));assert.equal(f.get('loading-art').hidden,true);assert.equal(f.view.failed,false);f.view.preparing({completed:1,total:1},current);assert.equal(f.view.reveal(current),true,'decorative image failure never blocks an otherwise ready game');
 results.push({case:'real-loading-view-generations',mapAttempts:visits,legacyFallback:true,decorativeArtFailureNonfatal:true});
});

test('actual main prepare and real map transition publish destination art before release and retry that destination without stale updates',async()=>{
 const f=fixture(),seen=[];let generation,attempt=0,fail=true;
 const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8'),prepareSource=main.match(/mapTransition=createMapTransition\(\{\s*prepare:(href=>\{[\s\S]*?\r?\n\s*\}),\r?\n\s*release:/)?.[1];assert.ok(prepareSource,'actual main map prepare callback must be present');
 const noop=()=>{},env={character:'warrior-v3',controller:null,container:null,staminaFeedback:{reset:noop},applyPlayerFlash:noop,location:{href:'https://example.test/?character=warrior-v3'},loadingView:f.view,mapLoadingGeneration:undefined,ready:true,loadingAsset:false,resumePose:null,mapPortal:null,combatResult:null,
  saveMapPosition:noop,hudLayout:{close:()=>seen.push({phase:'hud-layout-close'})},minimapTravel:null,minimap:{hide:noop},chapterQuests:null,leaveElenaReview:noop,frameDiagnostics:{mapChanged:noop,suspend:noop},loadDiagnostics:{begin:noop},updateButtons:noop,input:{reset:noop},cancelAttackInput:noop,boss:{combat:{passiveRecovery:{reset:noop}},hide:noop,allPooled:[]},frameLoop:{setPaused:noop},audio:{stopAll:noop,play:noop},actionAudio:{reset:noop},goldLoot:{clearDrops:noop},goldLootView:{clear:noop},projectiles:{clear:noop},training:{setSelected:noop},strikeSampler:{reset:noop},world:{cancelResourceDownloads:noop}};
 const actualPrepare=new Function('env',`with(env){return (${prepareSource});}`)(env);
 const transition=createMapTransition({
  prepare(url,context){assert.equal(context.source,'physical-road');actualPrepare(url,context);generation=env.mapLoadingGeneration;assert.ok(Number.isInteger(generation));seen.push({phase:'prepare',image:f.get('loading-art').getAttribute('src'),url});},
  frame:async()=>{},release:async()=>{assert.equal(f.get('loading').hidden,false);seen.push({phase:'release',image:f.get('loading-art').getAttribute('src')});},
  load:async(url)=>{attempt++;const destination=new URL(url).searchParams.get('character');assert.equal(f.get('loading-art').getAttribute('src'),loadingArtFor(destination).url);f.view.download({loaded:0,total:0,ratio:1,complete:true},generation);f.view.preparing({completed:1,total:3},generation);if(fail)throw Error('controlled timeout');},
  finish(){assert.equal(f.view.reveal(generation),true);},onError:error=>f.view.fail('지역 이동 실패',error.message,{error}),
 });
 for(const character of characters){
  const url='https://example.test/?character='+character;fail=true;const work=transition.travel(url,{source:'physical-road'});assert.equal(f.get('loading-art').getAttribute('src'),loadingArtFor(character).url,'destination art must precede the first awaited curtain frame');assert.equal(await work,false);assert.equal(transition.failed,true);const failedGeneration=generation;
  fail=false;const retry=transition.retry();const during=snapshot(f);f.view.preparing({completed:100,total:100},failedGeneration);f.view.download({loaded:99,total:99,ratio:1},failedGeneration);assert.deepEqual(snapshot(f),during);assert.equal(await retry,true);assert.equal(transition.failed,false);assert.equal(f.get('loading').hidden,true);
 }
 assert.equal(attempt,8);assert.equal(seen.filter(x=>x.phase==='prepare').length,8);assert.equal(seen.filter(x=>x.phase==='hud-layout-close').length,8,'every real map preparation closes the layout editor');assert.equal(env.character,'warrior-v3','art must follow the destination URL even before the source character changes');results.push({case:'actual-main-prepare-and-transition-destination-art-retry',destinationMaps:4,attempts:attempt});
});

test('actual Babylon visible mesh, off-camera shadow and camera readiness produce the displayed real counts without including hidden pools',async t=>{
 const f=fixture(),id=f.view.begin('warrior-v5'),engine=new NullEngine({renderWidth:900,renderHeight:450}),scene=new Scene(engine);scene.useRightHandedSystem=true;
 const camera=new FreeCamera('current-camera',new Vector3(0,2,8),scene);camera.setTarget(Vector3.Zero());
 const a=MeshBuilder.CreateBox('ready-visible',{},scene),b=MeshBuilder.CreateBox('pending-visible',{},scene);a.position.x=-1;b.position.x=1;
 const ma=new StandardMaterial('ready-material',scene),mb=new StandardMaterial('pending-material',scene);ma.disableLighting=mb.disableLighting=true;a.material=ma;b.material=mb;
 const hidden=MeshBuilder.CreateBox('retained-hidden-boss',{},scene),hiddenRoot=new TransformNode('hidden-pool',scene);hidden.parent=hiddenRoot;hiddenRoot.setEnabled(false);hidden.material=new StandardMaterial('unused-boss',scene);let hiddenChecks=0;hidden.material.isReadyForSubMesh=()=>{hiddenChecks++;return false;};
 const caster=MeshBuilder.CreateBox('off-camera-caster',{},scene);caster.position.x=1000;caster.computeWorldMatrix(true);caster.material=ma;const light=new DirectionalLight('sun',new Vector3(-1,-2,-1),scene),shadow=new ShadowGenerator(512,light);shadow.addShadowCaster(caster,false);
 t.after(()=>{scene.dispose();engine.dispose();});await ma.forceCompilationAsync(a);await mb.forceCompilationAsync(b);
 let visibleReady=false,shadowReady=false,waits=0,time=0;const materialReady=mb.isReadyForSubMesh;mb.isReadyForSubMesh=function(...args){return visibleReady&&materialReady.apply(this,args);};shadow.isReady=()=>shadowReady;
 scene.setTransformMatrix(camera.getViewMatrix(true),camera.getProjectionMatrix(true));
 const first=currentFrameReadiness(scene);assert.deepEqual(first.progress,{completed:2,total:4},JSON.stringify({meshes:first.meshes,shadows:first.shadows,targets:scene.customRenderTargets?.map(x=>x.name),layers:scene.layers?.map(x=>x.name),effects:scene.effectLayers?.map(x=>x.name)}));assert.equal(hiddenChecks,0);assert.ok(first.blockers.some(x=>x.mesh===b.name));assert.ok(first.blockers.some(x=>x.kind==='shadow'));
 const samples=[];await waitForSceneReady(scene,{now:()=>time,wait:async()=>{time+=16;if(++waits===1)visibleReady=true;else shadowReady=true;if(waits>4)throw Error('readiness did not settle');},onProgress:progress=>{f.view.preparing(progress,id);samples.push({...progress,text:f.get('loading-text').textContent,width:f.get('loading-progress').style.width});}});
 assert.deepEqual(samples.map(({completed,total})=>({completed,total})),[{completed:2,total:4},{completed:3,total:4},{completed:4,total:4}]);
 for(const sample of samples)assert.ok(sample.text.replaceAll(/\s/g,'').includes(`(${sample.completed}/${sample.total})`));assert.equal(samples.at(-1).width,'99%');assert.deepEqual(scene.metadata.screenReady.progress,{completed:4,total:4});assert.equal(hiddenChecks,0);assert.equal(f.get('loading').hidden,false,'count completion waits for the caller reveal boundary');assert.equal(f.view.reveal(id),true);
 results.push({case:'actual-SDK-readiness-counts-to-loading-DOM',samples,hiddenPoolQueries:hiddenChecks});
});

test('cached-zero, unavailable and missing byte totals never create fictitious numbers or NaN progress',()=>{
 const f=fixture(),id=f.view.begin('warrior-plains');
 f.view.download({loaded:0,total:0,ratio:1,complete:true,cached:300e6},id);assert.doesNotMatch(f.get('loading-text').textContent,/300|NaN|Infinity/);assert.equal(f.get('loading-progress').style.width,'70%');assert.equal(f.get('loading').hidden,false);
 f.view.preparing({completed:0,total:0},id);assert.equal(f.get('loading-text').textContent,'화면 준비하는 중');assert.doesNotMatch(f.get('loading-text').textContent,/NaN|Infinity|0 \/ 0/);
 const next=f.view.begin('warrior-plains');f.view.download({unavailable:true,ratio:NaN},next);assert.doesNotMatch(f.get('loading-text').textContent,/NaN|Infinity|MB/);assert.doesNotMatch(f.get('loading-progress').style.width,/NaN|Infinity/);
 f.view.download({loaded:NaN,total:Infinity,ratio:NaN},next);assert.doesNotMatch(f.get('loading-text').textContent,/NaN|Infinity|MB/);assert.doesNotMatch(f.get('loading-progress').style.width,/NaN|Infinity/);
 f.view.preparing({completed:3,total:7},next);assert.ok(f.get('loading-text').textContent.replaceAll(/\s/g,'').includes('(3/7)'));assert.equal(f.get('loading-bytes').textContent,'');assert.equal(f.track.getAttribute('aria-valuenow'),String(Math.round(70+29*3/7)));
 results.push({case:'cache-and-unknown-progress',cachedBytesNotReportedAsFreshDownload:true,noNonfiniteValues:true});
});

test('failure diagnostics remain readable over the artwork and late clipboard failure cannot replace a new loading attempt',async()=>{
 const denied=deferred(),f=fixture({writeText:()=>denied.promise});f.view.setDiagnostics(()=>{throw Error('diagnostic context unavailable');});const id=f.view.begin('warrior-v4');
 f.view.fail('화면 준비 실패','원래 오류를 보존합니다.',{error:Object.assign(Error('shader probe'),{code:'SHADER_PROBE'}),phase:'screen'});const failedImage=f.get('loading-art').getAttribute('src');f.clickCopy();
 const next=f.view.begin('warrior-v5');denied.reject(Error('clipboard denied'));await flush();assert.equal(f.get('loading-copy-status').textContent,'');assert.equal(f.get('loading-diagnostics-export').hidden,true);assert.equal(f.get('loading-art').getAttribute('src'),loadingArtFor('warrior-v5').url);assert.notEqual(failedImage,f.get('loading-art').getAttribute('src'));
 f.view.fail('마지막 실패','마지막 원문',{error:Error('<img src=x onerror=bad()>'),phase:'screen'});f.clickCopy();await flush();assert.equal(f.get('loading-diagnostics-export').hidden,false);const report=JSON.parse(f.get('loading-diagnostics-export').value);assert.equal(report.failure.message,'<img src=x onerror=bad()>');assert.equal(report.diagnosticCaptureError.message,'diagnostic context unavailable');assert.equal(f.get('loading-error-message').querySelector('img'),null);assert.equal(f.get('loading-diagnostics-export').closest('#loading'),f.get('loading'));assert.equal(f.view.reveal(next),false);
 results.push({case:'art-and-failure-diagnostics',contextCaptureFailurePreservesOriginal:true,clipboardFallback:true,lateClipboardIgnored:true});
});

function cascade(element,doc,width,height){
 const result={},weights={};let order=0;
 const media=condition=>!condition.split(/\s+and\s+/).some(part=>{const bound=part.match(/(min|max)-(width|height):\s*(\d+)px/);if(bound){const size=bound[2]==='width'?width:height;return bound[1]==='max'?size>+bound[3]:size<+bound[3];}const orientation=part.match(/orientation:\s*(landscape|portrait)/);return orientation&&(orientation[1]==='landscape'?! (width>height):width>height);});
 const visit=rules=>{for(const rule of rules??[]){if(rule.media){if(media(rule.media.mediaText))visit(rule.cssRules);continue;}if(!rule.selectorText)continue;for(const selector of rule.selectorText.split(',')){let matches=false;try{matches=element.matches(selector);}catch{}if(!matches)continue;const score=(selector.match(/#[\w-]+/g)?.length??0)*100+(selector.match(/\.[\w-]+|\[[^\]]+\]|:[\w-]+/g)?.length??0)*10;for(let i=0;i<rule.style.length;i++){const key=rule.style[i],weight=(rule.style.getPropertyPriority(key)==='important'?1e6:0)+score*10000+order;if(weight>=(weights[key]??-1)){weights[key]=weight;result[key]=rule.style.getPropertyValue(key);}}}order++;}};
 for(const css of [doc.querySelector('head style').textContent,readFileSync(new URL('../src/styles.css',import.meta.url),'utf8'),readFileSync(new URL('../src/ui-test.css',import.meta.url),'utf8')])visit(parse(css).cssRules);return result;
}

test('actual loading CSS retains a full viewport 3px bottom line and safe lower-left status in short landscape and portrait',()=>{
 const f=fixture();const sizes=[[844,294],[800,360],[852,393],[393,852],[360,640]];
 for(const [width,height]of sizes)for(const error of [false,true]){
  f.view.begin('warrior-v5');if(error)f.view.fail('오류','확인',{error:Error('test')});
  const overlay=cascade(f.get('loading'),f.document,width,height),track=cascade(f.track,f.document,width,height),art=cascade(f.get('loading-art'),f.document,width,height),info=cascade(f.get('loading-info'),f.document,width,height);
  assert.equal(overlay.position,'fixed');assert.equal(overlay.transform,'none');assert.equal(track.position,'fixed');assert.equal(track.left,'0');assert.equal(track.right,'0');assert.equal(track.bottom,'0');assert.equal(track.width,'100%');assert.equal(track.height,'3px');assert.equal(track.margin,'0');assert.equal(art['object-fit'],'cover');
  if(!error){assert.equal(info.position,'fixed');assert.ok(info.left.includes('safe-area-inset-left'));assert.ok(info.bottom.includes('safe-area-inset-bottom'));assert.equal(cascade(f.get('loading-title'),f.document,width,height).display,'none');assert.equal(cascade(f.get('loading-bytes'),f.document,width,height).display,'none');}else assert.equal(overlay.overflow,'auto');
 }
 assert.equal(f.get('loading-art').getAttribute('aria-hidden'),'true');assert.equal(f.get('loading-art').getAttribute('alt'),'');results.push({case:'actual-CSS-declarations',viewports:sizes,normalAndFailure:true,fullWidthBottomLinePixels:3,scope:'CSSOM declarations/cascade; no browser layout or physical display measurement'});
});

test.after(()=>{
 const folder=new URL('../reports/map-loading-art-2026-11-03/',import.meta.url);mkdirSync(folder,{recursive:true});
 writeFileSync(new URL('independent-flow-validation.json',folder),JSON.stringify({passed:results.length===7,completedCases:results.length,cases:results,limitations:['Actual source modules, DOM, content-addressed WebP headers/hashes, transition and Babylon NullEngine readiness were checked offline.','No browser automation, GPU/device timing, physical mobile layout or final artwork composition/quality claim.','Artwork begins at loadCharacter/map-transition loading; the pre-main bundle import interval is outside this feature scope.']},null,2)+'\n');
});
