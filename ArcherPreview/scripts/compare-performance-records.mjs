#!/usr/bin/env node
// Compare two long frame recordings (moonforest-performance-*.json) map by map.
//   node scripts/compare-performance-records.mjs <before.json> <after.json> [--map great-plains]
// Built for flag-off / flag-on pairs on the same device and route
// (Docs/0.3 체크리스트 0단계). Every per-frame number is the median of the
// recording's one-second summaries for that map, so a few slow seconds do not
// hide the typical frame and a different route length does not skew averages.
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

const median=values=>{const v=values.filter(Number.isFinite).sort((a,b)=>a-b);if(!v.length)return null;const m=v.length>>1;return v.length%2?v[m]:(v[m-1]+v[m])/2;};
const quantile=(values,q)=>{const v=values.filter(Number.isFinite).sort((a,b)=>a-b);if(!v.length)return null;return v[Math.min(v.length-1,Math.floor(q*v.length))];};
const SECTIONS=['sceneCallMs','bossUpdateMs','playerAnimationMs','framePreludeMs','worldUpdateMs','hudUpdateMs'];
const DRAW_GROUPS=['bufferUpdate','candidateSelection','textureSet','drawCommands'];

// Seconds whose own probe has no map inherit the last map seen.
function secondsByMap(record){
 const out=new Map();let map=null;
 for(const second of record.seconds??[]){
  if(second.probe?.map)map=second.probe.map;
  if(!map||!second.frames)continue;
  if(!out.has(map))out.set(map,[]);
  out.get(map).push(second);
 }
 return out;
}

export function summarizeRecord(record,{minFrames=30}={}){
 const maps={},bySecond=new Map();
 for(const [map,seconds] of secondsByMap(record)){
  for(const s of seconds)bySecond.set(s.second,map);
  const full=seconds.filter(s=>s.frames>=minFrames),per=(s,v)=>v/s.frames;
  const row={seconds:seconds.length,fullSeconds:full.length};
  row.fpsMedian=median(full.map(s=>s.frames));
  row.fpsLow=quantile(full.map(s=>s.frames),.1);
  row.slowSecondsShare=full.length?full.filter(s=>s.frames<55).length/full.length:null;
  const frames=seconds.reduce((n,s)=>n+s.frames,0);
  row.frameMsMean=frames?seconds.reduce((n,s)=>n+s.frameTotalMs,0)/frames:null;
  row.worstFrameMsMedian=median(full.map(s=>s.maxIntervalMs));
  row.worstFrameMs=seconds.reduce((n,s)=>Math.max(n,s.maxIntervalMs??0),0);
  const r=key=>median(full.map(s=>s.render?per(s,s.render[key]??0):NaN));
  row.activeMeshesMs=r('activeMeshesMs');row.drawSubmissionMs=r('drawSubmissionMs');row.renderTargetsMs=r('renderTargetsMs');
  row.sceneRestMs=median(full.map(s=>s.render?per(s,(s.render.sceneMs??0)-(s.render.activeMeshesMs??0)-(s.render.drawSubmissionMs??0)-(s.render.renderTargetsMs??0)):NaN));
  row.drawCalls=r('drawCalls');
  for(const key of SECTIONS)row[key]=median(full.map(s=>per(s,s.sum?.[key]??0)));
  row.ambientWakesPerSecond=full.some(s=>s.sum&&'ambientWakes' in s.sum)?median(full.map(s=>s.sum?.ambientWakes??0)):null;
  maps[map]=row;
 }
 // Sampled draw CPU groups (detail frames and slow-frame events that carry them).
 const start=record.startMs??0,draw=new Map();
 for(const frame of [...(record.detailFrames??[]),...(record.events??[])]){
  const groups=frame.render?.drawCpu?.groups;if(!groups)continue;
  const map=bySecond.get(Math.floor(((frame.startMs??0)-start)/1000));if(!map)continue;
  if(!draw.has(map))draw.set(map,{});
  const bucket=draw.get(map);
  for(const key of DRAW_GROUPS){(bucket[key+'Ms']??=[]).push(groups[key]?.ms);(bucket[key+'Calls']??=[]).push(groups[key]?.calls);}
 }
 for(const [map,bucket] of draw){if(!maps[map])continue;for(const key in bucket)maps[map][key]=median(bucket[key]);maps[map].drawSamples=bucket.bufferUpdateMs.length;}
 // Large camera turns (records from 2026-11-24 on).
 for(const turn of record.cameraTurns??[]){
  const row=maps[turn.map];if(!row||turn.partial)continue;
  (row._turns??=[]).push(turn);
 }
 for(const row of Object.values(maps)){
  const turns=row._turns??[];delete row._turns;
  row.turns=Array.isArray(record.cameraTurns)?turns.length:null;
  row.turnWorstFrameMsMedian=median(turns.map(t=>t.worstFrameMs));
  row.turnWorstFrameMs=turns.length?Math.max(...turns.map(t=>t.worstFrameMs)):null;
  row.turnFramesOver33=Array.isArray(record.cameraTurns)?turns.reduce((n,t)=>n+(t.framesOver33??0),0):null;
 }
 // Stalls: critical frames (>=200 ms) by map.
 for(const frame of record.critical??[]){const map=bySecond.get(Math.floor(((frame.startMs??0)-start)/1000));if(maps[map])maps[map].stalls200=(maps[map].stalls200??0)+1;}
 for(const row of Object.values(maps))row.stalls200??=0;
 return {build:record.metadata?.build??null,userAgent:record.metadata?.userAgent??null,startedAt:record.startedAt??null,maps};
}

const ROWS=[
 ['fullSeconds','기록된 초(30프레임 이상)',0],
 ['fpsMedian','FPS 중앙값',0],['fpsLow','FPS 하위 10%',0],['slowSecondsShare','55FPS 미만인 초 비율','%'],
 ['frameMsMean','평균 프레임 ms',2],['worstFrameMsMedian','초당 최악 프레임 ms (중앙값)',1],['worstFrameMs','최악 프레임 ms',1],['stalls200','200ms 이상 멈춤 (회)',0],
 ['turns','큰 카메라 회전 (회)',0],['turnWorstFrameMsMedian','회전 직후 최악 프레임 ms (중앙값)',1],['turnWorstFrameMs','회전 직후 최악 프레임 ms (최대)',1],['turnFramesOver33','회전 직후 33ms 넘은 프레임 (합)',0],
 ['sceneCallMs','장면 처리 ms',2],['activeMeshesMs','고르기 ms',2],['drawSubmissionMs','그리기 제출 ms',2],['renderTargetsMs','그림자·RTT ms',2],['sceneRestMs','장면 나머지 ms',2],['drawCalls','그리기 호출 수',0],
 ['bossUpdateMs','몬스터 갱신 ms',2],['playerAnimationMs','주인공 애니메이션 ms',2],['framePreludeMs','프레임 앞부분 ms',2],['worldUpdateMs','풍경 갱신 ms',2],['hudUpdateMs','HUD ms',2],
 ['ambientWakesPerSecond','다시 보인 개체 (초당)',1],
 ['bufferUpdateCalls','버퍼 갱신 호출 (표본)',0],['bufferUpdateMs','버퍼 갱신 ms (표본)',2],['candidateSelectionMs','후보 선택 ms (표본)',2],['textureSetMs','텍스처 바인딩 ms (표본)',2],
];
const fmt=(value,digits)=>value===null||value===undefined?'—':digits==='%'?Math.round(value*100)+'%':Number(value).toFixed(digits);
const diff=(a,b,digits)=>a===null||a===undefined||b===null||b===undefined?'—':digits==='%'?((b-a)*100>=0?'+':'')+Math.round((b-a)*100)+'%p':(b-a>=0?'+':'')+(b-a).toFixed(digits);

export function formatComparison(a,b,{map=null}={}){
 const maps=[...new Set([...Object.keys(a.maps),...Object.keys(b.maps)])].filter(m=>!map||m===map);
 const lines=[`A: ${a.startedAt??'?'} · ${(a.build??[]).join(' ')}`,`B: ${b.startedAt??'?'} · ${(b.build??[]).join(' ')}`];
 if(a.userAgent!==b.userAgent)lines.push('주의: 두 기록의 브라우저(기기)가 다릅니다.');
 for(const m of maps){
  lines.push('',`## ${m}`,'','| 지표 | A | B | B−A |','| --- | --- | --- | --- |');
  const ra=a.maps[m]??{},rb=b.maps[m]??{};
  for(const [key,label,digits] of ROWS){if(ra[key]==null&&rb[key]==null)continue;lines.push(`| ${label} | ${fmt(ra[key],digits)} | ${fmt(rb[key],digits)} | ${diff(ra[key],rb[key],digits)} |`);}
 }
 lines.push('','ms는 프레임당 값입니다(초 단위 요약의 중앙값). "표본"은 그리기 CPU 표본이 있는 프레임만입니다. 기기·동선이 같아야 비교할 수 있습니다.');
 return lines.join('\n');
}

if(import.meta.url===pathToFileURL(process.argv[1]??'').href){
 const args=process.argv.slice(2),mapAt=args.indexOf('--map'),files=args.filter((a,i)=>!a.startsWith('--')&&!(mapAt>=0&&i===mapAt+1));
 if(files.length!==2){console.error('usage: node scripts/compare-performance-records.mjs <before.json> <after.json> [--map great-plains]');process.exit(2);}
 const [a,b]=files.map(f=>summarizeRecord(JSON.parse(readFileSync(f,'utf8'))));
 console.log(formatComparison(a,b,{map:mapAt>=0?args[mapAt+1]:null}));
}
