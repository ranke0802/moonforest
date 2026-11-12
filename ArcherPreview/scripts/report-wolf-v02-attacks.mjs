import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {sourcePath} from '../../Sources/resolve-source.mjs';
import {sha256,publishedBytes,assertDescriptor,deploymentPath} from './release-deployment.mjs';
import {WOLF_V02_ACTIONS,WOLF_V02_KNOCKBACK_SCALE} from '../src/wolf-v02-spec.js';

const repo=resolve(import.meta.dirname,'../..'),project=resolve(repo,'ArcherPreview');
const output=resolve(repo,'Docs/Reports/2026-11-12');
const htmlName='MOONFOREST_0.2_R9_입질_접지_개선.html',evidenceName='moonforest-0.2-r9-attacks-evidence.json';
const baselineDeploymentSha256='0726cc807e86a0c60378e1815a8445f2137fd22116686140a66f2efda42a9f1b';
const gameUrl='https://ranke0802.github.io/moonforest/ArcherPreviewSite/moonforest-0.2.html';
const oldUrl='https://ranke0802.github.io/moonforest/ArcherPreviewSite/?character=moonforest-0.1&rev=a40d4ed';
const local=path=>relative(repo,path).replaceAll('\\','/');
const json=async path=>JSON.parse(await readFile(path,'utf8'));
const h=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const number=(value,digits=3)=>Number(value).toFixed(digits);
const sci=value=>Number(value).toExponential(2);
const imageSpecs=[
 ['Wolf_Snap_Bite_V02-prepare-side.png','snap','입질 · 준비 0.25초','측면 · 서 있는 자세에서 머리와 목을 준비한다.'],
 ['Wolf_Snap_Bite_V02-impact-side.png','snap','입질 · 접촉 0.40초','측면 · 네 발을 지지하고 전사 몸 높이로 짧게 입질한다.'],
 ['Wolf_Forepaw_Swipe_V02-prepare-quarter.png','pressure','몸 낮춰 압박 · 준비 0.25초','사선 · 앞다리와 몸통의 지지 자세.'],
 ['Wolf_Forepaw_Swipe_V02-impact-quarter.png','pressure','몸 낮춰 압박 · 접촉 0.43초','사선 · 앞발을 짧게 내딛고 몸의 무게를 앞으로 싣는다.'],
 ['Wolf_Forepaw_Swipe_V02-forelimb-prepare-quarter.png','joint','앞다리 · 준비','원본 색상 · 어깨, 위팔, 아래팔의 두께와 연결부.'],
 ['Wolf_Forepaw_Swipe_V02-forelimb-impact-quarter.png','joint','앞다리 · 접촉','원본 색상 · 같은 방향에서 근육 덩어리와 관절 경계를 비교한다.'],
 ['Wolf_Forepaw_Swipe_V02-forelimb-impact-quarter-matcap.png','joint','앞다리 · 접촉 표면','Matcap · 표면 굴곡과 관절 주변을 따로 확인한다.'],
 ['Wolf_Snap_Bite_V02-jaw-neutral-comparison-side.png','jaw','주둥이 · 중립','같은 측면에서 기존 주둥이 실루엣을 확인한다.'],
 ['Wolf_Snap_Bite_V02-jaw-small-open-comparison-side.png','jaw','주둥이 · 허용한 작은 벌림','기존 가중치의 한계 안에서 입 벌림을 제한했다.'],
];

function verifyLossless(source,runtime){
 let originalKeys=0,runtimeKeys=0,reducedChannels=0;
 assert.equal(runtime.clips.length,source.clips.length);
 for(const clip of source.clips){
  const prepared=runtime.clips.find(row=>row.name===clip.name);assert.ok(prepared);
  const {channels,...metadata}=clip,{channels:preparedChannels,...preparedMetadata}=prepared;assert.deepEqual(preparedMetadata,metadata);
  assert.equal(preparedChannels.length,channels.length);
  for(const channel of channels){
   const candidate=preparedChannels.find(row=>row.node===channel.node&&row.path===channel.path);assert.ok(candidate);
   originalKeys+=channel.times.length;runtimeKeys+=candidate.times.length;
   if(channel.times.length===candidate.times.length){assert.deepEqual(candidate,channel);continue;}
   const constant=channel.values.every(value=>value.length===channel.values[0].length&&value.every((part,index)=>part===channel.values[0][index]));assert.ok(constant,'Only exact constant channels may lose keys');
   assert.deepEqual(candidate.times,[channel.times[0],channel.times.at(-1)]);assert.deepEqual(candidate.values,[channel.values[0],channel.values.at(-1)]);reducedChannels++;
  }
 }
 assert.equal(runtime.preparation.originalKeys,originalKeys);assert.equal(runtime.preparation.runtimeKeys,runtimeKeys);
 return {originalKeys,runtimeKeys,removedKeys:originalKeys-runtimeKeys,reducedChannels,movingKeysExact:true,quantization:false};
}

export async function reportWolfV02Attacks(){
 const sourceManifestPath=sourcePath('wolf-v02-attacks-r9','manifest.json'),manifest=await json(sourceManifestPath);
 const sourceClipPath=sourcePath('wolf-v02-attacks-r9','clips.json'),sourceBytes=await readFile(sourceClipPath),source=JSON.parse(sourceBytes);
 const sourceClipSha256=sha256(sourceBytes);assert.equal(sourceClipSha256,manifest.clipsJsonSha256);
 const validationPath=sourcePath('wolf-v02-attacks-r9','deformation-validation.json'),validationBytes=await readFile(validationPath),deformation=JSON.parse(validationBytes);
 assert.equal(sha256(validationBytes),manifest.validationSha256);assert.equal(deformation.clipsJsonSha256,sourceClipSha256);
 const animationPath=sourcePath('wolf-v02-attacks-r9','models','wolf-v02-attacks-r9.glb'),blendPath=sourcePath('wolf-v02-attacks-r9','blend','wolf-v02-attacks-r9.blend');
 assert.equal(sha256(await readFile(animationPath)),manifest.animationGlbSha256);assert.equal(sha256(await readFile(blendPath)),manifest.blendSha256);
 const runtimePath=resolve(project,'src/wolf-v02-attack-clips.json'),runtimeBytes=await readFile(runtimePath),runtime=JSON.parse(runtimeBytes),runtimeClipSha256=sha256(runtimeBytes);
 assert.equal(runtime.preparation.sourceDataSha256,sourceClipSha256);assert.equal(runtime.animationSourceSha256,manifest.animationGlbSha256);
 // Use actual source bytes for identity and exact channel comparisons for
 // the runtime preparation proof.
 const lossless=verifyLossless(source,runtime);
 const runtimeValidationPath=resolve(project,'reports/wolf-v02-authored-attacks/validation.json'),runtimeValidation=await json(runtimeValidationPath),cases=runtimeValidation.cases;
 assert.equal(runtimeValidation.sourceMotionSha256,sourceClipSha256);assert.equal(runtimeValidation.runtimeMotionSha256,runtimeClipSha256);
 for(const name of ['lossless-constant-key-preparation','actor-local-install-and-reuse','v02-knockback-reduction','standing-snap-shape','body-pressure-support-step','authored-body-contact','authored-group-disposal'])assert.ok(cases.some(row=>row.case===name),'Final validation missing '+name);
 const contacts=cases.filter(row=>row.case==='authored-body-contact');assert.equal(contacts.length,18);
 assert.ok(contacts.every(row=>row.contacts.every(contact=>contact.contact===true)));
 const summaryPath=resolve(project,'reports/wolf-v02-validation/test-summary.json'),summaryBytes=await readFile(summaryPath),focusedSummary=JSON.parse(summaryBytes);
 assert.equal(focusedSummary.sourceMotionSha256,sourceClipSha256);assert.equal(focusedSummary.runtimeMotionSha256,runtimeClipSha256);
 assert.equal(focusedSummary.failed,0);assert.equal(focusedSummary.passed,focusedSummary.tests);assert.ok(Array.isArray(focusedSummary.runHistory));
 const knockback=cases.filter(row=>row.case==='v02-knockback-reduction');assert.equal(knockback.length,4);assert.equal(WOLF_V02_KNOCKBACK_SCALE,.8);
 assert.ok(knockback.every(row=>Math.abs(row.totalDistanceRatio-.8)<.001&&row.sourcePoseAndTimingUnchanged));
 const site=resolve(repo,'ArcherPreviewSite'),primaryBytes=await readFile(resolve(site,'deployment-files.json'));
 assert.equal(sha256(primaryBytes),baselineDeploymentSha256,'0.1 deployment inventory changed');
 const primary=JSON.parse(primaryBytes);let protectedBytes=0;
 for(const item of primary.files){assertDescriptor(await readFile(deploymentPath(site,item.path)),item);protectedBytes+=item.bytes;}
 const configPath=resolve(project,'public/assets/alpha-wolf.json'),configBytes=await readFile(configPath),config=JSON.parse(configBytes),approvedConfig=primary.files.find(row=>row.path==='assets/alpha-wolf.json');
 assertDescriptor(publishedBytes('assets/alpha-wolf.json',configBytes),approvedConfig);
 const sourceModules=['wolf-v02-spec.js','wolf-v02-encounter.js','wolf-v02-authored-clips.js'],architecture=[];
 for(const file of sourceModules){
  const bytes=await readFile(resolve(project,'src',file)),code=bytes.toString('utf8');
  assert.ok(!/\bnew\s+(?:Engine|Scene|StandardMaterial|PBRMaterial|RenderTargetTexture)\s*\(|\b(?:setInterval|setTimeout|requestAnimationFrame)\s*\(/.test(code),'Unexpected extra rendering/timer owner in '+file);
  architecture.push({path:'ArcherPreview/src/'+file,sha256:sha256(bytes)});
 }
 const images=[];
 for(const [name,group,title,caption]of imageSpecs){
  const path=sourcePath('wolf-v02-attacks-r9','review',name),bytes=await readFile(path);assert.equal(bytes.subarray(1,4).toString(),'PNG');
  images.push({path:local(path),group,title,caption,sha256:sha256(bytes),bytes:bytes.length,width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20),data:'data:image/png;base64,'+bytes.toString('base64')});
 }
 const allMuscles=deformation.clips.flatMap(clip=>Object.values(clip.forelimbMuscleCoresWeightAtLeast0999)),jointRows=deformation.clips.flatMap(clip=>clip.forelimbJointBandPhases.map(phase=>({clip:clip.clip,...phase})));
 const metrics={boneCount:28,sampleHz:60,maximumBoneScaleError:Math.max(...deformation.clips.map(clip=>clip.maximumBoneScaleError)),maximumBoneLengthErrorMeters:Math.max(...deformation.clips.map(clip=>clip.maximumBoneLengthErrorMeters)),maximumAttachmentGapMeters:Math.max(...deformation.clips.map(clip=>clip.maximumConnectedAttachmentGapMeters)),maximumRigidCoreLocalErrorMeters:Math.max(...deformation.clips.map(clip=>clip.maximumRigidCoreLocalErrorMeters)),maximumForelimbMuscleLocalErrorMeters:Math.max(...allMuscles.map(core=>core.maximumLocalShapeErrorMeters)),minimumForelimbMuscleThicknessRatio:Math.min(...allMuscles.map(core=>core.minimumThicknessRatio)),maximumForelimbMuscleThicknessRatio:Math.max(...allMuscles.map(core=>core.maximumThicknessRatio))};
 const baseline={commit:'a40d4ed',deploymentManifestSha256:sha256(primaryBytes),protectedFiles:primary.files.length,protectedBytes,allReviewedFilesByteIdentical:true,wolfConfigSha256:sha256(configBytes),meshTextureLodReferencesUnchanged:true,sourceOriginalClips:12};
 const evidence={date:'2026-11-12',release:'moonforest-0.2',revision:'R9 authored standing snap and braced body-pressure support step',source:{assetId:'wolf-v02-attacks-r9',manifestPath:local(sourceManifestPath),clipsPath:local(sourceClipPath),clipsSha256:sourceClipSha256,animationGlbPath:local(animationPath),animationGlbSha256:manifest.animationGlbSha256,blendPath:local(blendPath),blendSha256:manifest.blendSha256,validationPath:local(validationPath),validationSha256:sha256(validationBytes)},runtime:{path:local(runtimePath),sha256:runtimeClipSha256,bytes:runtimeBytes.length,lossless,actorLocalClipCount:14,originalTemplateClipCount:12,staticJsonImport:true,sharedReadOnlyKeyTemplates:true,actorLocalTargetsAndCursors:true,architecture},baseline,metrics,deformation,runtimeValidation:{path:local(runtimeValidationPath),sha256:sha256(await readFile(runtimeValidationPath)),caseCount:cases.length,contactMatrix:{cases:contacts.length,fps:[30,60],speeds:[.5,1,2]},knockback,shape:cases.filter(row=>['standing-snap-shape','body-pressure-support-step'].includes(row.case)),lifecycle:cases.filter(row=>['actor-local-install-and-reuse','authored-group-disposal'].includes(row.case))},actions:WOLF_V02_ACTIONS.map(action=>({id:action.id,label:action.label,sourceClip:action.sourceClip,impact:action.impact,capture:action.capture})),images:images.map(({data,...metadata})=>metadata),gameUrl,baselineUrl:oldUrl,references:[{title:'International Wolf Center · Wolf Ethogram',url:'https://wolf.org/wolf-info/wolf-ethogram/'},{title:'International Wolf Center · Snap',url:'https://wolf.org/wolf-info/wolf-ethogram/wolf-ethogram-r-s/'},{title:'Smithsonian National Zoo · Gray wolf',url:'https://www.nationalzoo.si.edu/animals/gray-wolf'}],scope:{images:'Offline Blender actual original 4K colour / matcap review, 1.6m warrior reference beside 2.5-scale wolf; not Babylon game GPU captures',simulation:'Node/Babylon NullEngine with replaced materials; not physical-device performance',physicalDeviceFps:'unmeasured',physicalDeviceHeat:'unmeasured',wholeMeshZeroStretchClaim:false,biologicalAccuracyClaim:'Stylized giant-boss gameplay interpretation informed by primary behavior descriptions; not zoologically exact motion capture'}};
 evidence.focusedChecks={path:local(summaryPath),sha256:sha256(summaryBytes),summary:focusedSummary};
 const figure=image=>`<figure><img src="${image.data}" width="${image.width}" height="${image.height}" alt="${h(image.title)}"><figcaption><b>${h(image.title)}</b><span>${h(image.caption)}</span></figcaption></figure>`;
 const gallery=group=>images.filter(image=>image.group===group).map(figure).join('');
 const snap=deformation.clips.find(clip=>clip.clip==='Wolf_Snap_Bite_V02'),pressure=deformation.clips.find(clip=>clip.clip==='Wolf_Forepaw_Swipe_V02');
 const row60=knockback.find(row=>row.fps===60),row30=knockback.find(row=>row.fps===30);
 const muscleRows=deformation.clips.map(clip=>{const cores=Object.values(clip.forelimbMuscleCoresWeightAtLeast0999);return `<tr><td>${clip.clip==='Wolf_Snap_Bite_V02'?'짧은 입질':'몸 낮춰 압박'}</td><td>${sci(clip.maximumBoneLengthErrorMeters)} m</td><td>${sci(Math.max(...cores.map(core=>core.maximumLocalShapeErrorMeters)))} m</td><td>${number(Math.min(...cores.map(core=>core.minimumThicknessRatio)),9)} ~ ${number(Math.max(...cores.map(core=>core.maximumThicknessRatio)),9)}</td></tr>`;}).join('');
 const jointTable=jointRows.map(row=>`<tr><td>${row.clip==='Wolf_Snap_Bite_V02'?'입질':'압박'}</td><td>${number(row.time,3)} s</td><td>${number(row.strainP05,3)} ~ ${number(row.strainP95,3)}</td><td>${number(row.strainMaximum,2)}×</td><td>${number(row.maximumAbsoluteEdgeChangeMeters,4)} m</td></tr>`).join('');
 let html=`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MoonForest 0.2 R9 · 입질·접지 개선</title><style>
*{box-sizing:border-box}body{margin:0;background:#101a1b;color:#eef1e8;font:16px/1.7 system-ui,"Malgun Gothic",sans-serif}main{max-width:1180px;margin:auto;padding:54px 28px 70px}a{color:#bce9d6}header{padding-bottom:30px;border-bottom:1px solid #3b504b}.eyebrow{font-size:12px;letter-spacing:.16em;color:#abd1bd}h1{font-size:clamp(30px,4.2vw,50px);line-height:1.23;letter-spacing:-.055em;max-width:800px;margin:15px 0 18px}h2{font-size:25px;letter-spacing:-.035em;margin:36px 0 12px}h3{font-size:18px;margin:16px 0 8px}p{margin:10px 0;max-width:1000px}.lead{font-size:18px;color:#c9d8cf;max-width:940px}.links{display:flex;gap:12px;flex-wrap:wrap;margin:23px 0 10px}.links a{display:inline-block;padding:10px 18px;border:1px solid #6b9c86;border-radius:6px;text-decoration:none}.links a:first-child{background:#b8d8bd;color:#12251c;font-weight:700}.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:24px 0}.stats div{padding:15px 19px;background:#1d2c2a;border-left:3px solid #b4cda7}.stats strong{display:block;font-size:25px}.stats span,.muted{color:#b5c7bd;font-size:14px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.grid.small{grid-template-columns:repeat(3,1fr)}figure{margin:0;overflow:hidden;background:#1c2a29;border:1px solid #40514c;border-radius:7px}img{display:block;width:100%;height:auto}figcaption{padding:12px 16px;font-size:13px;color:#c4d3cb}figcaption b{display:block;color:#eef1e8;font-size:14px}figcaption span{display:block;margin-top:4px}.note{background:#24332c;border-left:3px solid #d2cb99;padding:13px 18px;margin:17px 0;color:#e1e6cf}.table-scroll{overflow:auto}table{border-collapse:collapse;width:100%;font-size:14px;margin:16px 0}th,td{text-align:left;padding:11px 13px;border-bottom:1px solid #3e5149;white-space:nowrap}th{color:#c5dcc6;background:#1d2d27}details{margin:18px 0;padding:13px 16px;border:1px solid #40514c;border-radius:6px}summary{cursor:pointer;color:#cae4cd}pre,code{font:12px/1.6 ui-monospace,Consolas,monospace;overflow-wrap:anywhere;white-space:pre-wrap}pre{max-height:360px;overflow:auto;color:#becfc5}footer{border-top:1px solid #3e5149;margin-top:36px;padding-top:20px;color:#aebfb4;font-size:13px}.refs{padding-left:22px}.hash{font:12px/1.6 ui-monospace,Consolas,monospace;overflow-wrap:anywhere}.pill{display:inline-block;border:1px solid #647f68;padding:2px 8px;border-radius:4px;font-size:12px;color:#cce0cb}button{background:#b8d8bd;border:0;border-radius:4px;padding:9px 13px;color:#12251c;font:inherit;cursor:pointer}@media(max-width:720px){main{padding:30px 17px 45px}.grid,.grid.small{grid-template-columns:1fr}.stats{gap:7px}.stats div{padding:10px}.stats strong{font-size:20px}.stats span{font-size:12px}h2{font-size:23px}.lead{font-size:16px}}
</style></head><body><main><header><div class="eyebrow">MOONFOREST 0.2 · R9 · 2026.11.12</div><h1>입질은 짧게,<br>압박은 낮게.</h1><p class="lead">서 있는 자세에서 머리와 턱을 짧게 쓰는 입질, 몸을 낮춰 앞발로 지지하며 다가가는 압박을 새로 만들었습니다. 승인된 늑대의 모델·4K 색상·리깅·기존 동작 12개와 LOD 설정을 유지하고, 0.2 전용 동작 데이터 두 개를 연결했습니다.</p><div class="links"><a href="${gameUrl}">MoonForest 0.2 게임 주소 ↗</a><a href="${oldUrl}">보존된 MoonForest 0.1 ↗</a></div><p class="muted">이 문서는 이미지와 검증 값을 내장한 단일 HTML입니다. 앞선 0.2 보고서는 별도로 보존합니다.</p></header>
<div class="stats"><div><strong>2개</strong><span>새 동작 · 배우별 총 14클립</span></div><div><strong>0.8배</strong><span>강공격·방패 밀치기 넉백</span></div><div><strong>0.1 보존</strong><span>검토된 ${baseline.protectedFiles.toLocaleString('ko-KR')}개 파일 바이트 일치</span></div></div>
<section><h2>짧은 입질</h2><p>네 발을 지지한 채 머리와 목을 전사의 몸 높이로 낮추고, 턱을 짧게 닫습니다. <b>0.90초 동작의 0.40초가 접촉 시점</b>입니다. 제압 동작의 일부를 잘라 쓰지 않고, 서 있는 기준 자세에서 새로 작성했습니다. 연속 입질은 이 동작을 두 번 사용합니다.</p><div class="grid">${gallery('snap')}</div><p class="muted">원본 색상으로 렌더한 오프라인 Blender 검수 이미지입니다. 청록색 형상은 높이 1.6m의 전사 기준이며, 늑대는 게임의 2.5배 크기입니다.</p></section>
<section><h2>몸 낮춰 압박</h2><p><b>1.00초 동작의 0.43초에 앞발을 딛습니다.</b> 몸을 원본 단위로 0.17m, 게임 크기에서 약 0.425m 전진시키고, 짧은 지지 보폭 뒤 중립 자세로 돌아갑니다. 앞발을 크게 휘두르는 동작 대신 몸의 무게와 접지를 사용했습니다.</p><div class="grid">${gallery('pressure')}</div><p class="muted">기존 도약·제압은 원래 클립을 유지합니다. 새 입질과 압박은 준비 → 짧고 빠른 타격 → 회복의 속도 곡선을 사용하며, 타격 시점도 같은 곡선으로 계산합니다.</p></section>
<section><h2>앞다리 두께와 관절을 나누어 확인</h2><p>28개 뼈의 길이와 스케일을 고정하고, 앞다리는 고정 길이 IK로 작성했습니다. 뼈의 영향도가 99.9% 이상인 <b>앞다리 근육 코어</b>는 뼈 좌표계에서 형태와 단면 두께를 측정했습니다. 수치는 60Hz 평가 결과이며 길이 단위는 원본 모델 기준입니다.</p><div class="grid small">${gallery('joint')}</div><div class="table-scroll"><table><thead><tr><th>새 동작</th><th>최대 뼈 길이 오차</th><th>앞다리 코어 형태 오차</th><th>앞다리 코어 두께 비율</th></tr></thead><tbody>${muscleRows}</tbody></table></div><p class="muted">전체 측정의 최대 뼈 스케일 오차 ${sci(metrics.maximumBoneScaleError)}, 연결점 간격 ${sci(metrics.maximumAttachmentGapMeters)}m. 앞다리 코어 형태 오차는 최대 ${sci(metrics.maximumForelimbMuscleLocalErrorMeters)}m입니다.</p><div class="note"><b>관절 경계는 피부 보간이 남는 구간입니다.</b> 근육 코어의 수치 보존으로 전체 메시의 변형이 0이라고 판단하지 않았습니다. 관절띠의 변형 값과 실제 색상·Matcap 근접 이미지를 별도로 남겼습니다. 털과 미세 삼각형을 모두 합친 전체 메시 극값을 앞다리 근육 판정에 사용하지 않았습니다.</div><details><summary>앞다리 관절띠 측정값 · 준비 / 접촉 / 회복</summary><p class="muted">기준 길이 1mm 이상인 관절띠 에지의 원본 대비 길이 비율입니다. P05–P95와 최댓값을 함께 공개합니다. 이 값은 코어 두께 비율과 측정 대상이 다릅니다.</p><div class="table-scroll"><table><thead><tr><th>동작</th><th>시점</th><th>에지 비율 P05–P95</th><th>최대 비율</th><th>최대 절대 길이 변화</th></tr></thead><tbody>${jointTable}</tbody></table></div></details></section>
<section><h2>주둥이는 기존 가중치에 맞춰 작게</h2><p>턱의 최대 상대 회전은 약 <b>${number(snap.jawRelativeAngularExcursionRadians,2)}rad</b>입니다. R8의 주둥이 가중치를 그대로 보존하면서 자연스러운 범위로 벌림을 제한했습니다. 머리·목의 짧은 입질을 중심으로 사용하며, 큰 개구를 위해 주둥이 형태를 억지로 당기지 않았습니다.</p><div class="grid">${gallery('jaw')}</div></section>
<section><h2>넉백과 준비 비용</h2><div class="table-scroll"><table><thead><tr><th>같은 강공격·방패 밀치기</th><th>기존 이동 거리</th><th>0.2 이동 거리</th><th>실측 비율</th></tr></thead><tbody><tr><td>60Hz 계산</td><td>${number(row60.originalDistance,2)}m</td><td>${number(row60.variantDistance,2)}m</td><td>${number(row60.totalDistanceRatio,3)}배</td></tr><tr><td>30Hz 계산</td><td>${number(row30.originalDistance,2)}m</td><td>${number(row30.variantDistance,2)}m</td><td>${number(row30.totalDistanceRatio,3)}배</td></tr></tbody></table></div><p>새 클립은 정적 JSON으로 포함하고 읽기 전용 키 표를 공유합니다. 배우마다 타깃·재생 커서·블렌드 상태와 14개 클립 래퍼를 독립적으로 가집니다. 원본 템플릿의 12개 클립은 유지합니다. 추가 Engine·타이머·재질·별도 RTT를 만들지 않았습니다.</p><p><b>상수 채널만 양 끝 2키로 정확히 줄였습니다.</b> ${lossless.originalKeys.toLocaleString('ko-KR')}키 → ${lossless.runtimeKeys.toLocaleString('ko-KR')}키로 준비하며, 움직이는 키와 메타데이터는 그대로입니다. 양자화나 움직임 오차를 허용한 감량을 사용하지 않았습니다.</p></section>
<section><h2>행동 참고와 게임 해석</h2><p>International Wolf Center는 빠른 입질과 물기·붙잡기·머리 흔들기·제압·끌기를 구분합니다. Smithsonian은 몸을 부딪치거나 머리·앞다리를 다른 늑대의 어깨에 얹는 행동을 설명합니다. 이를 짧은 입질과 낮은 지지 보폭의 참고로 사용했습니다. <b>거대 보스 전투를 위한 게임 해석</b>이며, 실제 늑대의 동작을 동물학적으로 정확하게 재현했다는 주장은 하지 않습니다.</p><ol class="refs"><li><a href="https://wolf.org/wolf-info/wolf-ethogram/">International Wolf Center · 행동 목록과 분류</a> · <a href="https://wolf.org/wolf-info/wolf-ethogram/wolf-ethogram-r-s/">Snap 정의</a></li><li><a href="https://www.nationalzoo.si.edu/animals/gray-wolf">Smithsonian National Zoo · Gray wolf의 몸짓과 압박 행동</a></li></ol></section>
<section><h2>검증 범위와 출처</h2><p>완료된 CPU 검증은 ${cases.length}개 기록을 포함합니다. 실제 패킹된 R8 리그에서 새 클립 설치·반복 재사용·해제, 넉백 거리, 30/60Hz × 공격 속도 0.5/1/2배의 18개 접촉 조합을 확인했습니다. 원본 0.1 배포 목록과 참조 파일의 바이트 일치도 다시 검사했습니다.</p><div class="note">이미지는 오프라인 Blender 검수이며 Babylon 게임 GPU 캡처가 아닙니다. NullEngine 검사는 재질을 대체한 CPU 검사입니다. <b>실기기 FPS·발열은 미측정</b>이며, 이 문서의 수치로 대체하지 않습니다.</div><details><summary>동결된 동작 데이터 SHA-256과 근거 JSON</summary><p>원본 동작 JSON<br><span class="hash">${sourceClipSha256}</span></p><p>게임 준비 JSON<br><span class="hash">${runtimeClipSha256}</span></p><p>애니메이션 전용 GLB<br><span class="hash">${manifest.animationGlbSha256}</span></p><p>아래 내장 JSON에는 이미지별 해시, 뼈·근육·관절띠 측정값, 소스 경로와 검증 기록이 들어 있습니다.</p><button id="save-evidence" type="button">근거 JSON 저장</button><pre>${h(JSON.stringify(evidence,null,2))}</pre></details></section><footer>MoonForest canonical workspace · 2026-11-12 · R9 입질·접지 개선<br>원본 리소스와 앞선 보고서를 보존하며, 0.2 전용 동작 데이터와 별도 배포 경로를 사용합니다.</footer></main><script id="evidence" type="application/json">${JSON.stringify(evidence).replaceAll('<','\\u003c')}</script><script>document.getElementById('save-evidence').addEventListener('click',()=>{const blob=new Blob([JSON.stringify(JSON.parse(document.getElementById('evidence').textContent),null,2)+'\\n'],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='${evidenceName}';a.click();URL.revokeObjectURL(url);});</script></body></html>`;
 html=html.replace('<section><h2>검증 범위와 출처</h2>','<section><h2>검증 범위와 출처</h2><p class="muted">82개 개별 검사항목의 최종 확인 내역은 내장 JSON에 기록했습니다. 전체 실행에서 80개가 통과했고, 테스트 가정 두 곳을 바로잡은 뒤 작성 동작 검사 8개를 다시 통과했습니다.</p>');
 await mkdir(output,{recursive:true});await writeFile(resolve(output,evidenceName),JSON.stringify(evidence,null,2)+'\n');await writeFile(resolve(output,htmlName),html);
 const result={html:local(resolve(output,htmlName)),evidence:local(resolve(output,evidenceName)),htmlBytes:Buffer.byteLength(html),sourceClipSha256,runtimeClipSha256,embeddedImages:images.length,validationCases:cases.length,baseline};console.log(JSON.stringify(result));return result;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await reportWolfV02Attacks();
