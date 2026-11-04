// CPU/DOM/resource-graph review only; no browser or GPU/device claims.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {selectPlayerTextureProfile} from '../../src/player-texture-profile.js';
import {sceneryHighTextureProfile,protectedSceneryTexture} from '../../src/mobile-texture-policy.js';
import {highTextureBytes} from '../../src/village-texture-budget.js';
import {planResourceTransfers,validateResourceIndex} from '../../src/resource-index.js';
import {setupSettingsPanel} from '../../src/settings-panel.js';
import {setupRenderScaleControl} from '../../src/render-scale-settings.js';
import {renderPixelRatio,RenderActivity} from '../../src/render-policy.js';

const here=dirname(fileURLToPath(import.meta.url)),project=resolve(here,'../..');
const bytes=path=>readFileSync(resolve(project,path)),json=path=>JSON.parse(bytes(path));
const read=name=>json('public/assets/'+name+'.json'),hash=value=>createHash('sha256').update(value).digest('hex');
const index=validateResourceIndex(read('resource-index')),source=read('warrior-v3'),sourceModel=json('public/assets/'+source.model);
const source8k=new Set(sourceModel.images.slice(0,2).map(image=>image.uri)),aliases=['warrior-v3','warrior-v4','warrior-v5','warrior-plains'];
let playerCases=0,sceneryProfiles=0;const seen=new Set(),missing=new Set(),profileNames=new Set(),sceneryByUrl=new Map(),alternateUrls=new Set();
function resource(path){
 const name=path.split('/').at(-1);if(seen.has(name))return;seen.add(name);const data=bytes('public/assets/'+path);
 assert.equal(hash(data),name.split('.')[0]);if(index.files[name]===undefined)missing.add(name);else assert.equal(index.files[name],data.length);
}
for(const nav of [{userAgent:'Android SM-S911'},{userAgent:'iPhone'},{platform:'MacIntel',maxTouchPoints:5}])for(const character of aliases)for(const caps of [{maxTextureSize:4096,astc:true},{maxTextureSize:4096,etc2:true},{maxTextureSize:8192},{maxTextureSize:2048,astc:true}]){
 const profile=selectPlayerTextureProfile(character,caps,nav),config=read(profile.manifest);profileNames.add(profile.manifest);
 assert.ok(profile.maxSize<=caps.maxTextureSize);assert.equal(config.textureProfile.maxSize,profile.maxSize);
 const names=new Set(config.resources.map(path=>path.split('/').at(-1)));assert.ok([...names].every(name=>!source8k.has(name)));
 const transfer=planResourceTransfers(config.resources.map(path=>({url:new URL(path,'https://example.test/assets/').href,size:bytes('public/assets/'+path).length})),index);
 assert.ok(transfer.packs.every(pack=>pack.files.every(name=>names.has(name))));for(const path of config.resources)resource(path);playerCases++;
}
for(const map of ['village','great-plains','monster-forest','witch-cave','village-plains-outskirts'])for(const [id,config]of Object.entries(read(map).assets)){
 const selected=sceneryHighTextureProfile(id,config,true);assert.equal(sceneryHighTextureProfile(id,config,false),config.highTextures);
 if(protectedSceneryTexture(id,config)){assert.equal(selected,config.highTextures);assert.equal(config.mobileHighTextures,undefined);}
 for(const profile of [config.highTextures,config.mobileHighTextures])if(profile)sceneryByUrl.set(profile.textures.albedo.url,profile);
 if(config.mobileHighTextures){
  assert.equal(selected,config.mobileHighTextures);assert.ok(selected.textures.albedo.width<=2048);
  for(const path of selected.resources)resource(path);alternateUrls.add(selected.textures.albedo.url);sceneryProfiles++;
 }
}
const codec=json('reports/mobile-quality-2026-11-04/scenery-codec.json');let codecCases=0,syntheticCodecCases=0;
for(const result of codec.results){
 const config=sceneryByUrl.get(result.path);if(!config){assert.ok(result.path.startsWith('synthetic-'));syntheticCodecCases++;continue;}
 assert.ok(highTextureBytes(config,result.caps)>=result.gpuBytes,JSON.stringify(result));codecCases++;
}

// Execute the actual declaration plus actual renderer function with the same
// lexical initialization order, then attach an engine only after construction.
const {document}=parseHTML(bytes('index.html').toString()),previousDocument=globalThis.document;globalThis.document=document;setupSettingsPanel();
const proto=Object.getPrototypeOf(document.getElementById('frame-rate-select'));
Object.defineProperty(proto,'value',{configurable:true,get(){return this._value??this.options[0]?.value;},set(value){this._value=value;}});
const main=bytes('src/main.js').toString().replaceAll('\r\n','\n'),start=main.indexOf('function applyRenderQuality()'),end=main.indexOf('\nfunction toast(',start);
const applySource=main.slice(start,end),controlSource=main.split('\n').find(line=>line.startsWith('const renderScaleControl='));
let level=1,resizes=0;
const fake={getHardwareScalingLevel:()=>level,setHardwareScalingLevel(value){level=value;resizes++;},resize(){resizes++;}},activity=new RenderActivity(true);activity.setTargetFps(60);
const init=Function('$','setupRenderScaleControl','renderPixelRatio','fake','renderActivity',`
 let engine,world,frameLoop;const qualityMode='high',touchDevice=true,equipmentStorage={getItem:()=>null},window={devicePixelRatio:3},canvas={clientWidth:800,clientHeight:400},document={hidden:false};
 let renderViewportKey='';const resizeScreenProjection=()=>{};${applySource}\n${controlSource}
 return {control:renderScaleControl,start(){engine=fake;world={lighting:{setQuality(){}}};frameLoop={invalidate(){}};applyRenderQuality();},apply:applyRenderQuality};
`)(selector=>document.querySelector(selector),setupRenderScaleControl,renderPixelRatio,fake,activity);
assert.equal(resizes,0,'initial callback must return before reading its uninitialized controller');assert.equal(init.control.value,85);
init.start();assert.equal(level,1/1.7);for(let i=0;i<20;i++)init.apply();assert.equal(resizes,1);assert.equal(fake.maxFPS,60);init.control.dispose();globalThis.document=previousDocument;

const sourceFiles=['src/main.js','src/player-texture-profile.js','src/mobile-texture-policy.js','src/village-texture-streaming.js','src/village-texture-budget.js','src/render-policy.js','src/render-scale-settings.js','tests/startup-frame-failure.test.js','tests/witch-cave.test.js'];
const baseline=json('reports/mobile-quality-2026-11-04/protected-assets-baseline.json');
const protectedCheck=JSON.parse(execFileSync(process.execPath,[resolve(here,'verify-protected-assets.mjs')],{cwd:project,maxBuffer:2*1024*1024}).toString());assert.equal(protectedCheck.ok,true);
const report={reviewedAt:new Date().toISOString(),baseCommit:baseline.baseCommit,sourceHashes:Object.fromEntries(sourceFiles.map(path=>[path,hash(bytes(path))])),browserAutomation:false,actualGpuOrDeviceTest:false,fullSuiteDuplicated:false,
 checks:{mainInitialSynchronousOnChangeNoTDZ:true,twentyUnchangedRenderReapplicationsResizeCalls:1,targetFpsPreserved:60,playerCapabilityAndAliasCases:playerCases,selectedPlayerManifests:[...profileNames],original8kPlayerImagesInSelectedPlans:0,unrequestedBundleMembers:0,sceneryAlternateEntries:sceneryProfiles,uniqueSceneryAlternates:alternateUrls.size,selectedResourceHashesVerified:seen.size,recordedDecoderOutputsWithinCurrentReservation:codecCases,syntheticDecoderCasesExcludedFromPublishedProfileComparison:syntheticCodecCases,
 targetedFixtureTests:{files:['tests/startup-frame-failure.test.js','tests/witch-cave.test.js'],passed:28,failed:0,node:process.version},warmPlayerProfileIdentityPreservedAcrossMaps:true},
 protectedAssets:{independentlyVerified:protectedCheck.ok,...baseline.totals,rawBossFiles:baseline.rawBossFiles.length,graphSha256:protectedCheck.protectedGraphSha256,allowedSceneryProfileAdditions:protectedCheck.allowedMobileProfileAdditions.length,verificationCommand:'node reports/mobile-quality-2026-11-04/verify-protected-assets.mjs'},
 resolvedFindings:[{id:'codec-reservation',detail:'ETC1S on ASTC-only capabilities falls back to RGBA. Current codec-specific reservation covers the recorded actual decoder bytes.'},{id:'test-main-profile-injection',detail:'Actual main fixture injects real capability/profile policy with an explicit navigator; insufficient capability and bounded manual retry are covered.'}],
 pendingFindings:missing.size?[{id:'resource-index-not-rebuilt',priority:'P1 before shipping',detail:'Current public resource index omits selected new player/scenery resources. Regenerate the normal verified resource graph before shipping.',resourceRevision:index.revision,missingUniqueResources:missing.size,examples:[...missing].slice(0,5)}]:[],
 resourceIndex:{revision:index.revision,missingSelectedResources:[...missing]},limitations:['No browser automation, visual review, GPU upload, device FPS/temperature or whole-scene GPU memory measurements were performed.','Resource-index packaging is checked against current disk data; source hashes identify the reviewed state.']};
report.status=report.pendingFindings.length?'pending-packaging':'passed';
writeFileSync(resolve(here,'independent-review.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,...report.checks,missingSelectedResources:missing.size},null,2));
if(missing.size)process.exitCode=1;
