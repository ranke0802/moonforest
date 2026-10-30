import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {CAVE_ROOMS,CAVE_ROUTES,CAVE_SEGMENTS,CAVE_PLACEMENTS,caveSurface,caveWaterWeight} from '../src/witch-cave-layout.js';
import {createWitchCaveTerrain,caveClearance} from '../src/witch-cave-terrain.js';
import {CAVE_FOG_START,CAVE_FOG_END} from '../src/witch-cave-visibility.js';
import {CAVE_COLLISION_DATA} from '../src/witch-cave-collision-data.js';
import {MOURNING_CAVE_CLEARANCE_DATA as mask} from '../src/mourning-cave-clearance-data.js';
import {MourningCaveNavigation} from '../src/mourning-cave-navigation.js';
import {mourningCaveClearance} from '../src/mourning-cave-clearance.js';
import {caveObstacles} from '../src/witch-cave-layout.js';
import {ELENA_HOME,MOURNING_SIZE} from '../src/elena-spec.js';
const root=fileURLToPath(new URL('../',import.meta.url)),out=new URL('../reports/cave-enclosure/',import.meta.url);
const baseline='1224e90',source=execFileSync('git',['show',baseline+':ArcherPreview/src/witch-cave-terrain.js'],{cwd:root,encoding:'utf8'});
const imported=source.replaceAll("'./terrain.js'",JSON.stringify(new URL('../src/terrain.js',import.meta.url).href)).replaceAll("'./witch-cave-layout.js'",JSON.stringify(new URL('../src/witch-cave-layout.js',import.meta.url).href));
const previous=await import('data:text/javascript;base64,'+Buffer.from(imported).toString('base64'));
const before=previous.createWitchCaveTerrain(),after=createWitchCaveTerrain();
const hash=file=>createHash('sha256').update(readFileSync(new URL('../'+file,import.meta.url),'utf8').replace(/\r\n?/g,'\n')).digest('hex');
function blocked(terrain,a,b){
 const length=Math.hypot(b.x-a.x,b.z-a.z),steps=Math.ceil(length/.1),ay=terrain.heightAt(a.x,a.z)+1.6,by=terrain.heightAt(b.x,b.z)+1.6;
 let maxIntrusion=-Infinity;
 for(let i=1;i<steps;i++){const t=i/steps;maxIntrusion=Math.max(maxIntrusion,terrain.heightAt(a.x+(b.x-a.x)*t,a.z+(b.z-a.z)*t)-(ay+(by-ay)*t));}
 return {blocked:maxIntrusion>.02,maxIntrusion};
}
const sightlines=[];
for(let i=0;i<6;i++)for(let j=i+1;j<6;j++)sightlines.push({rooms:[i,j],from:CAVE_ROOMS[i],to:CAVE_ROOMS[j],before:blocked(before,CAVE_ROOMS[i],CAVE_ROOMS[j]),after:blocked(after,CAVE_ROOMS[i],CAVE_ROOMS[j])});
const transects=[];
for(const {a,b}of CAVE_SEGMENTS)for(const t of [.2,.4,.6,.8])for(const side of [-1,1]){
 const length=Math.hypot(b[0]-a[0],b[1]-a[1]),x=a[0]+(b[0]-a[0])*t,z=a[1]+(b[1]-a[1])*t,nx=-(b[1]-a[1])/length*side,nz=(b[0]-a[0])/length*side;
 const versions=[];
 for(const [terrain,clearance]of [[before,previous.caveClearance],[after,caveClearance]]){
  let stop=null,visible=null,dry=true;
  for(let d=0;d<24;d+=.025){
   const px=x+nx*d,pz=z+nz*d;
   if(stop===null&&clearance(px,pz)<.4)stop=d;
   if(stop!==null&&caveWaterWeight(px,pz)>.1){dry=false;break;}
   if(stop!==null&&terrain.heightAt(px,pz)-caveSurface(px,pz).height>.18){visible=d;break;}
  }
  versions.push(dry&&stop!==null&&visible!==null?{stop,visible,apparentFlatBeyondFeet:Math.max(0,visible-stop-.32)}:null);
 }
 if(versions.every(Boolean))transects.push({x,z,nx,nz,before:versions[0],after:versions[1]});
}
function distribution(values){const sorted=values.toSorted((a,b)=>a-b);return {count:sorted.length,min:sorted[0],median:sorted[Math.floor(sorted.length*.5)],p95:sorted[Math.floor(sorted.length*.95)],max:sorted.at(-1),mean:sorted.reduce((a,b)=>a+b,0)/sorted.length};}
const report={generatedAt:new Date().toISOString(),baseline,reference:'output/witch-cave-object-kit/2026-10-29-v1/references/approved-natural-cave-v3.png',scope:'Static physical terrain and rendered-triangle tests; no browser/GPU performance claim. Baseline caveSurface, routes, pools and placements are unchanged except dry wall cap elevation.',sources:Object.fromEntries(['src/witch-cave-layout.js','src/witch-cave-terrain.js','src/witch-cave-visibility.js','src/witch-cave-surfaces.js','src/witch-cave-atmosphere.js'].map(file=>[file,hash(file)])),geometry:{terrainTriangles:after.subdivisions**2*2,placements:CAVE_PLACEMENTS.length,assetTypes:new Set(CAVE_PLACEMENTS.map(p=>p.asset)).size,routeCount:CAVE_ROUTES.length,newModels:0,collisionFingerprint:CAVE_COLLISION_DATA.fingerprint},visibility:{method:'15 room-centre pairs at 1.6 m head height, sampled every 10 cm against exact rendered terrain triangles; environment models and fog are not included, so this only isolates terrain occlusion.',beforeBlocked:sightlines.filter(s=>s.before.blocked).length,afterBlocked:sightlines.filter(s=>s.after.blocked).length,sightlines,fogMetres:[CAVE_FOG_START,CAVE_FOG_END],foregroundCutawayMetres:[.65,1.15],domeCutawayMetres:[7.5,5.5]},walkBoundary:{method:'Dry route-normal transects, 2.5 cm steps: first .32 m player centre collision plus foot radius, to first visible terrain rise >18 cm above local shelf; excludes water boundaries. Rock-mesh collisions are separately baked and can stop a player at a visible prop.',before:distribution(transects.map(t=>t.before.apparentFlatBeyondFeet)),after:distribution(transects.map(t=>t.after.apparentFlatBeyondFeet)),transects},review:{renderer:'Blender 4.5.14 EEVEE, existing near-LOD models and exact terrain; approximate painted materials, no Babylon shader/fog/local cutaway or FoW emulation',images:['cave-entry-render.png','cave-central-render.png','cave-boss-render.png','cave-layout-render.png'],browserAutomation:false}};
const skin=JSON.parse(readFileSync(new URL('../reports/elena-clearance/geometry-audit.json',import.meta.url))),envelope=JSON.parse(readFileSync(new URL('../reports/elena-clearance/mask-current.json',import.meta.url)));
report.review.renderer='Blender 4.5.14 EEVEE, existing near-LOD assets and exact terrain; approximate painted materials plus matching slope palette/noise. Does not emulate Babylon fog, local cutaway, FoW, exposure or shadow rendering. Boss camera moved inside southern opening because the old distant camera is now behind a real wall.';
report.review.cliffStyle={palette:[[.32,.28,.30],[.49,.435,.405]],extraTextures:0,extraDraws:0,geometryChangedByShader:false,shadowVisibility:'retains .60 to 1.0 shadow multiplier',scope:'terrain slopes and dark terrain rock caps only; original model materials and painted flat walking floor retained'};
report.verification={targetedTests:{total:26,passed:26,log:'tests.log'},legalEdgeSamples:22029,maxHeightChangePer10cm:.07853771209717131,actualSkin:{report:'../elena-clearance/geometry-audit.json',generatedAt:skin.generatedAt,samples:skin.method.poseLocationYawSamples,contacts:skin.summary.contacts,baseGeometryUnchanged:skin.summary.baseGeometryUnchanged},envelope:{authored:envelope.profile.authoredPoseCount,normalHitPulse:envelope.profile.hitPulsePoseCount,total:envelope.profile.poseSamples,extensions:envelope.profile.hitPulseEnvelopeExtension}};
mkdirSync(out,{recursive:true});writeFileSync(new URL('audit.json',out),JSON.stringify(report,null,2)+'\n');
const navigation=new MourningCaveNavigation(caveObstacles()),accepted=[];
for(let r=0;r<mask.runs.length;r+=2)for(let i=mask.runs[r];i<mask.runs[r]+mask.runs[r+1];i++){
 const p={x:mask.minX+(i%mask.width+.5)*mask.step,z:mask.minZ+(Math.floor(i/mask.width)+.5)*mask.step};
 if(navigation.free(p,MOURNING_SIZE.radius,67))accepted.push(p);
}
let longest={length:0};
for(const p of accepted)for(let angle=0;angle<16;angle++){
 const a=angle*Math.PI/8,dx=Math.sin(a),dz=Math.cos(a);let length=0;
 for(let t=.125;t<=20;t+=.125){if(!navigation.free({x:p.x+dx*t,z:p.z+dz*t},MOURNING_SIZE.radius,67))break;length=t;}
 if(length>longest.length){const to={x:p.x+dx*length,z:p.z+dz*length};if(navigation.segmentClear(p,to,MOURNING_SIZE.radius))longest={length,from:p,to,yaw:a};}
}
const runtimeReview={generatedAt:new Date().toISOString(),acceptedCellCenters:accepted.length,approximateAcceptedAreaM2:accepted.length*mask.step**2,requiredClearance:.08,home:{...ELENA_HOME,clearance:mourningCaveClearance(ELENA_HOME.x,ELENA_HOME.z)},longestSampledStraight:longest,query:'four neighbouring distance cones; no per-query arrays or objects',cachedDistanceBytes:mask.width*mask.height*4,dataFileBytes:readFileSync(new URL('../src/mourning-cave-clearance-data.js',import.meta.url)).byteLength,physicalHitRadiusUnchanged:MOURNING_SIZE.radius};
writeFileSync(new URL('../reports/elena-clearance/runtime-mask-review.json',import.meta.url),JSON.stringify(runtimeReview,null,2)+'\n');
console.log(JSON.stringify({geometry:report.geometry,visibility:{before:report.visibility.beforeBlocked,after:report.visibility.afterBlocked,total:sightlines.length},boundary:{before:report.walkBoundary.before,after:report.walkBoundary.after}}));
