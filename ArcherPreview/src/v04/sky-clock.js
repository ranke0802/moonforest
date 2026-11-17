// 0.4 time of day and weather — pure logic (no DOM, no engine).
// One game day lasts DAY_SECONDS of play. sampleSky(hour) blends hand-set
// keys into the values the view needs; rollWeather picks the next spell.

export const DAY_SECONDS=24*60;            // 1 game hour per real minute
export const START_HOUR=9;
export const WEATHERS=Object.freeze(['clear','cloudy','rain','storm']);

// grade: colour the whole picture is multiplied by · glow: warm band added at
// the horizon · night: 0 day … 1 night (stars, moon, darker clouds).
const KEYS=Object.freeze([
 {hour:0,   grade:[.44,.52,.80],glow:[0,0,0],       night:1},
 {hour:4.6, grade:[.44,.52,.80],glow:[0,0,0],       night:1},
 {hour:5.8, grade:[.80,.72,.80],glow:[.42,.20,.16], night:.35},
 {hour:6.6, grade:[.97,.90,.86],glow:[.30,.16,.08], night:0},
 {hour:8,   grade:[1,1,1],      glow:[0,0,0],       night:0},
 {hour:16.4,grade:[1,1,1],      glow:[0,0,0],       night:0},
 {hour:17.6,grade:[1,.88,.74],  glow:[.34,.17,.05], night:0},
 {hour:18.5,grade:[.96,.74,.60],glow:[.50,.22,.08], night:.1},
 {hour:19.4,grade:[.68,.58,.76],glow:[.22,.10,.14], night:.6},
 {hour:20.6,grade:[.44,.52,.80],glow:[0,0,0],       night:1},
 {hour:24,  grade:[.44,.52,.80],glow:[0,0,0],       night:1},
]);
const WEATHER_LOOK=Object.freeze({
 clear:{cloud:0,   dim:[1,1,1],      rain:0, storm:false},
 cloudy:{cloud:.5, dim:[.90,.92,.95],rain:0, storm:false},
 rain:{cloud:.7,   dim:[.76,.80,.88],rain:.6,storm:false},
 storm:{cloud:.85, dim:[.62,.66,.78],rain:1, storm:true},
});
export const wrapHour=hour=>((Number(hour)%24)+24)%24;
const smooth=t=>t*t*(3-2*t),mix=(a,b,t)=>a+(b-a)*t;

export function sampleSky(hour){
 const h=wrapHour(hour);let i=0;while(i<KEYS.length-2&&h>=KEYS[i+1].hour)i++;
 const a=KEYS[i],b=KEYS[i+1],t=smooth(Math.min(1,Math.max(0,(h-a.hour)/(b.hour-a.hour))));
 return {hour:h,grade:a.grade.map((v,k)=>mix(v,b.grade[k],t)),glow:a.glow.map((v,k)=>mix(v,b.glow[k],t)),night:mix(a.night,b.night,t),
  phase:h<4.6||h>=20.6?'night':h<8?'dawn':h<16.4?'day':'dusk'};
}
export const weatherLook=id=>WEATHER_LOOK[id]??WEATHER_LOOK.clear;
// Final picture multiplier: time of day × weather.
export function gradeFor(sky,weather,blend=1){
 const dim=weatherLook(weather).dim;return sky.grade.map((v,k)=>v*mix(1,dim[k],blend));
}
// Moon: rises in the east at dusk, highest at midnight, sets at dawn.
export function moonDirection(hour){
 const h=wrapHour(hour),t=((h+24-18)%24)/12;      // 18:00 → 0, 06:00 → 1
 if(t>1)return {x:0,y:-1,z:0};
 const angle=Math.PI*t;return {x:Math.cos(angle)*.8,y:Math.sin(angle)*.75+.08,z:-.45};
}
// Next weather and how long it lasts (game hours). Storms never follow storms;
// rain tends to clear through cloud.
export function rollWeather(previous,random=Math.random){
 const table={clear:[['clear',.5],['cloudy',.32],['rain',.14],['storm',.04]],cloudy:[['clear',.4],['cloudy',.2],['rain',.3],['storm',.1]],
  rain:[['cloudy',.5],['rain',.15],['storm',.2],['clear',.15]],storm:[['rain',.55],['cloudy',.45]]}[previous]??[['clear',1]];
 let r=random(),id=table[table.length-1][0];for(const [name,weight] of table){if(r<weight){id=name;break;}r-=weight;}
 const hours={clear:[3,7],cloudy:[2,5],rain:[1.5,4],storm:[.8,1.8]}[id];
 return {weather:id,hours:mix(hours[0],hours[1],random())};
}
export function formatClock(hour){const h=wrapHour(hour),whole=Math.floor(h),minutes=Math.floor((h-whole)*6)*10;return String(whole).padStart(2,'0')+':'+String(minutes).padStart(2,'0');}
