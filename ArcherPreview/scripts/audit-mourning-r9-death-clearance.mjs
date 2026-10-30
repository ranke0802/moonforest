// Observe death separately from the living navigation envelope: no map edits.
import {auditElenaClearance} from './audit-elena-clearance.mjs';
const schedules=[];
const cast={state:'cast',time:1.2,gaitBlend:.05};
for(const t of [0,.03,.06,.09,.12,.15,.18,.2,...Array.from({length:25},(_,i)=>(i+2)*.2)])schedules.push(['dead',Math.min(5.2,t),undefined,undefined,cast]);
for(const from of [{state:'idle',time:3},{state:'walk',time:.6,gaitBlend:1},{state:'cast',time:.75,gaitBlend:.2},{state:'cast',time:2.4,gaitBlend:.001},{state:'hit',time:.4}])for(const t of [0,.06,.12,.18])schedules.push(['dead',t,undefined,undefined,from]);
for(const halo of [6,18,30,42])for(const t of [1.6,3.2,5.2])schedules.push(['dead',t,halo,undefined,cast]);
const report=await auditElenaClearance({safeOnly:true,schedules,outputName:'geometry-death-r9.json'});
console.log(JSON.stringify({deathPoses:report.method.poseSamples,locations:report.method.locationSamples,yaws:report.method.yawCount,...report.summary}));
if(!report.summary.baseGeometryUnchanged)process.exitCode=1;
