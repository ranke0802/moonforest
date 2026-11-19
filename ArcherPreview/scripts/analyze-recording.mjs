// node scripts/analyze-recording.mjs <moonforest-performance-*.json>
// One table per map visit from the per-second data (every frame, not only
// slow ones) and a verdict per visit. Works with older recordings too (fewer
// columns). Used to read every phone recording the same way.
import {readFileSync} from 'node:fs';
const file=process.argv[2];if(!file){console.error('usage: node scripts/analyze-recording.mjs <recording.json>');process.exit(1);}
const data=JSON.parse(readFileSync(file,'utf8'));
const seconds=data.seconds??[];
const median=list=>{const v=list.filter(Number.isFinite).sort((a,b)=>a-b);return v.length?v[v.length>>1]:null;};
const fmt=(v,d=1)=>v==null?'—':Number(v).toFixed(d);
// Map per second: the probe (new recordings), else the nearest slow-frame context.
const contexts=(data.events??[]).concat(data.critical??[]).map(e=>[Math.floor((e.startMs-data.startMs)/1000),e.context?.map]).filter(([,m])=>m).sort((a,b)=>a[0]-b[0]);
const mapAt=s=>{if(s.probe?.map)return s.probe.map;let m=null;for(const [t,v] of contexts){if(t>s.second)break;m=v;}return m;};
const visits=[];
for(const s of seconds){const map=mapAt(s);let v=visits[visits.length-1];if(!v||v.map!==map){v={map,seconds:[]};visits.push(v);}v.seconds.push(s);}
const rows=visits.filter(v=>v.seconds.length>=5).map((v,i)=>{
 const play=v.seconds.slice(Math.min(12,Math.floor(v.seconds.length/3)));// skip loading
 const frames=play.reduce((a,s)=>a+s.frames,0),time=play.reduce((a,s)=>a+s.frameTotalMs,0),work=play.reduce((a,s)=>a+s.workTotalMs,0);
 const per=key=>frames&&play.some(s=>s.sum)?play.reduce((a,s)=>a+(s.sum?.[key]??0),0)/frames:null;
 const render=key=>frames&&play[0]?.render?play.reduce((a,s)=>a+(s.render?.[key]??0),0)/frames:null;
 const probe=key=>median(play.map(s=>s.probe?.[key]));
 return {visit:i+1,map:v.map,from:v.seconds[0].second,to:v.seconds.at(-1).second,fps:frames?frames*1000/time:null,workMs:frames?work/frames:null,
  sceneMs:render('sceneMs'),drawMs:render('drawSubmissionMs'),selectMs:render('activeMeshesMs'),draws:render('drawCalls'),tris:render('submittedTriangles'),
  bossMs:per('bossUpdateMs'),bossNearMs:per('bossNearMs'),bossFarMs:per('bossFarMs'),bossSepMs:per('bossSeparationMs'),bossPostMs:per('bossPostMs'),
  playerAnimMs:per('playerAnimationMs'),sceneryMs:play.some(s=>s.sum)?(per('sceneryGeometryMs')??0)+(per('sceneryDemandMs')??0):null,
  maxWork:Math.max(...play.map(s=>s.maxWorkMs)),calib:probe('calibrationMs'),hz:probe('hz'),target:probe('targetFps'),meshes:probe('meshes'),skeletons:probe('skeletons'),animatables:probe('animatables'),heap:probe('jsHeapMB'),engaged:probe('engaged')};
});
const cols=[['#','visit',0],['map','map'],['s','from',0],['fps','fps'],['work','workMs'],['scene','sceneMs'],['draw','drawMs'],['select','selectMs'],['draws','draws',0],['tris(K)','tris'],['boss','bossMs',2],['near','bossNearMs',2],['far','bossFarMs',2],['sep','bossSepMs',2],['post','bossPostMs',2],['anim','playerAnimMs',2],['scenery','sceneryMs',2],['maxWork','maxWork',0],['calib','calib',3],['Hz','hz',0],['meshes','meshes',0],['skel','skeletons',0],['heapMB','heap',0],['engaged','engaged',0]];
console.log(cols.map(c=>c[0]).join('\t'));
for(const r of rows)console.log(cols.map(([,k,d=1])=>k==='map'?String(r.map??'?').replace('warrior-',''):k==='tris'?fmt(r.tris==null?null:r.tris/1000,0):fmt(r[k],d)).join('\t'));
// Verdicts. Calibration is the same fixed arithmetic every second: if it rises
// the device slowed down (heat/power); scene counts rising means accumulation.
const base=rows.find(r=>r.calib!=null);
console.log('\nverdicts:');
for(const r of rows){
 const notes=[];
 if(r.hz&&r.target&&r.hz<r.target*.9&&r.fps>=r.hz*.9)notes.push(`browser refresh ${r.hz} Hz caps the frame rate (target ${r.target})`);
 if(base&&r.calib!=null&&r.calib>base.calib*1.3)notes.push(`device slower: calibration ${fmt(base.calib,3)} → ${fmt(r.calib,3)} ms (+${Math.round((r.calib/base.calib-1)*100)}%)`);
 const same=rows.find(o=>o!==r&&o.map===r.map&&o.visit<r.visit);
 if(same&&same.meshes!=null&&r.meshes!=null&&r.meshes>same.meshes*1.05)notes.push(`scene grew since visit ${same.visit}: meshes ${same.meshes} → ${r.meshes}`);
 if(same&&same.animatables!=null&&r.animatables>same.animatables*1.05)notes.push(`animatables ${same.animatables} → ${r.animatables}`);
 const parts=[['scene',r.sceneMs],['monsters',r.bossMs],['player animation',r.playerAnimMs],['scenery streaming',r.sceneryMs]].filter(([,v])=>v!=null).sort((a,b)=>b[1]-a[1]);
 if(parts.length)notes.push('largest per-frame cost: '+parts.slice(0,2).map(([k,v])=>`${k} ${fmt(v,2)} ms`).join(', '));
 if(r.bossNearMs!=null&&r.bossMs>1)notes.push(`monsters: near ${fmt(r.bossNearMs,2)} / far ${fmt(r.bossFarMs,2)} / separation ${fmt(r.bossSepMs,2)} / post ${fmt(r.bossPostMs,2)} ms`);
 console.log(`#${r.visit} ${r.map}: `+(notes.join('; ')||'ok'));
}
