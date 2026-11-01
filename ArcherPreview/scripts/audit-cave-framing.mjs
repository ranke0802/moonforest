import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {caveReadableCamera,caveCameraBlocked} from '../src/witch-cave-camera.js';
import {createWitchCaveTerrain} from '../src/witch-cave-terrain.js';
const at=process.argv.indexOf('--protected');
if(at<0||!process.argv[at+1])throw Error('Pass --protected <frozen protected-samples.json>');
const bytes=await readFile(process.argv[at+1]),data=JSON.parse(bytes),terrain=createWitchCaveTerrain();
let cases=0,improved=0,worse=0,blocked=0,beforeClose=0,afterClose=0,retainedBefore=0,retainedAfter=0,retainedOld=0;
const examples=[],lossExamples=[],start=performance.now();
for(const c of data.camera.cases){
 if(c.beta!==1.18||![8,13,17].includes(c.requested))continue;
 const [x,z]=data.camera.anchors[c.anchorId],base={x,z,y:terrain.heightAt(x,z)+c.focusHeight};
 const v=caveReadableCamera(terrain,base,c.alpha,c.beta,c.requested);
 const before=c.baselineRadius,after=v.radius,lift=Math.max(0,-.35-after*Math.cos(v.beta));
 const eye=[x+Math.cos(c.alpha)*Math.sin(v.beta)*after,base.y+lift+Math.cos(v.beta)*after,z+Math.sin(c.alpha)*Math.sin(v.beta)*after];
 cases++;if(after>before+.01){improved++;if(examples.length<5)examples.push({id:c.id,base,before,after,betaBefore:c.beta,betaAfter:v.beta});}
 if(after<before-.01){worse++;if(lossExamples.length<5)lossExamples.push({id:c.id,before,after,retainedFraction:after/before});}
 if(caveCameraBlocked(terrain,...eye))blocked++;
 if(before<3)beforeClose++;if(after<3)afterClose++;
 if(before>=c.requested*.8)retainedBefore++;if(after>=c.requested*.8)retainedAfter++;
 if(after>=before*.8)retainedOld++;
}
const report={scope:'CPU-only fixed-denominator framing geometry audit. Not device FPS, GPU heat, or final rendered UX approval.',protectedSamplesSha256:createHash('sha256').update(bytes).digest('hex'),fixedCases:cases,improved,worse,blockedEyes:blocked,beforeBelow3m:beforeClose,afterBelow3m:afterClose,beforeRetained80PercentOfRequested:retainedBefore,afterRetained80PercentOfRequested:retainedAfter,retainedAtLeast80PercentOfOldRadius:retainedOld,oldRadiusRetentionGate:retainedOld/cases>=.95,elapsedMs:performance.now()-start,examples,lossExamples,remaining:'Default-camera retention uses the old permitted radius, not the unobstructed request. Final device/camera usability still requires user review.'};
await mkdir(new URL('../reports/cave-u1-lab/',import.meta.url),{recursive:true});
await writeFile(new URL('../reports/cave-u1-lab/camera-framing.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
if(cases!==4896||!report.oldRadiusRetentionGate||blocked)process.exitCode=1;
