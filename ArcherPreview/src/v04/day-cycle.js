// 0.4 time of day and weather — the view.
// Costs nothing in the 3D frame: the picture is graded by one multiply layer
// over the canvas (compositor), rain is two transform-animated layers,
// lightning is a short screen flash, and the existing sky shader draws the
// horizon glow, stars and moon from three uniforms. The cave has no sky and
// is left untouched. No sound yet (no approved rain/thunder assets).
import {Vector3,Vector4} from '@babylonjs/core';
import {DAY_SECONDS,START_HOUR,WEATHERS,sampleSky,weatherLook,gradeFor,moonDirection,rollWeather,formatClock,wrapHour} from './sky-clock.js';
import {t} from '../v03/i18n.js';

export const SKY_STATE_KEY='moonforest-v04-sky-v1';
const BLEND_SECONDS=18,REFRESH_SECONDS=.25,SAVE_SECONDS=15;
const ICONS={
 sun:'<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="3.2"/><path d="M8 1v2.4M8 12.6V15M1 8h2.4M12.6 8H15M3 3l1.7 1.7M11.3 11.3 13 13M13 3l-1.7 1.7M4.7 11.3 3 13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
 moon:'<svg viewBox="0 0 16 16"><path d="M11.6 10.9A5.6 5.6 0 0 1 6.2 2.2a6 6 0 1 0 7.6 7.6 5.6 5.6 0 0 1-2.2 1.1Z"/></svg>',
 cloudy:'<svg viewBox="0 0 16 16"><path d="M4.5 12.5a3 3 0 0 1-.4-6 4 4 0 0 1 7.6.9 2.6 2.6 0 0 1-.2 5.1Z"/></svg>',
 rain:'<svg viewBox="0 0 16 16"><path d="M4.5 9.5a3 3 0 0 1-.4-6 4 4 0 0 1 7.6.9 2.6 2.6 0 0 1-.2 5.1Z"/><path d="M5 11.5 4.2 14M8 11.5 7.2 14M11 11.5l-.8 2.5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
 storm:'<svg viewBox="0 0 16 16"><path d="M4.5 9a3 3 0 0 1-.4-6 4 4 0 0 1 7.6.9 2.6 2.6 0 0 1-.2 5.1Z"/><path d="M8.6 9.4 6.4 12.6h2L7.6 15.4l2.6-3.6h-2l.9-2.4Z"/></svg>',
};

function rainTile(doc,size,count,length,alpha){
 const canvas=doc.createElement('canvas');canvas.width=canvas.height=size;const ctx=canvas.getContext?.('2d');if(!ctx)return '';
 let seed=size*31+count;const random=()=>(seed=(seed*16807)%2147483647)/2147483647;
 ctx.lineCap='round';
 for(let i=0;i<count;i++){const x=random()*size,y=random()*size,l=length*(.6+random()*.8);ctx.strokeStyle=`rgba(214,226,240,${(alpha*(.5+random()*.5)).toFixed(3)})`;ctx.lineWidth=.8+random()*.7;
  // Draw each streak twice so the tile wraps without a seam.
  for(const dy of [0,-size]){ctx.beginPath();ctx.moveTo(x,y+dy);ctx.lineTo(x,y+dy+l);ctx.stroke();}}
 try{return canvas.toDataURL('image/png');}catch{return '';}
}

export function createDayCycle({doc,canvas,getWorld,storage=null,random=Math.random,chipHost=()=>null}){
 const root=doc.createElement('div');root.className='v04-sky';root.setAttribute('aria-hidden','true');
 const grade=doc.createElement('i');grade.className='v04-grade';grade.hidden=true;
 const far=doc.createElement('i');far.className='v04-rain v04-rain-far';
 const near=doc.createElement('i');near.className='v04-rain v04-rain-near';
 const flash=doc.createElement('i');flash.className='v04-flash';
 root.append(grade,far,near,flash);canvas.after(root);
 const chip=doc.createElement('span');chip.className='v04-clock';chip.setAttribute('role','img');
 const chipIcon=doc.createElement('i'),chipText=doc.createElement('b');chip.append(chipIcon,chipText);
 const calm=doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches===true;
 const state={hour:START_HOUR,weather:'clear',left:4,cloud:0,rain:0,dim:1,refresh:0,save:SAVE_SECONDS,bolt:8,elapsed:0,tiles:false,disposed:false,lastGrade:'',lastChip:'',lastRain:-1};
 try{const saved=JSON.parse(storage?.getItem(SKY_STATE_KEY)??'null');if(saved&&Number.isFinite(saved.hour)&&WEATHERS.includes(saved.weather)&&Number.isFinite(saved.left)){state.hour=wrapHour(saved.hour);state.weather=saved.weather;state.left=Math.max(.1,saved.left);const look=weatherLook(state.weather);state.cloud=look.cloud;state.rain=look.rain;state.dim=1;}}catch{/* start fresh */}
 const night=new Vector4(0,0,0,0),glow=new Vector3(),moon=new Vector3(0,-1,0);
 const save=()=>{try{storage?.setItem(SKY_STATE_KEY,JSON.stringify({hour:+state.hour.toFixed(3),weather:state.weather,left:+state.left.toFixed(3)}));}catch{/* optional */}};
 function mountChip(){if(chip.isConnected)return;const host=chipHost();if(host)host.append(chip);}
 function strike(){
  if(calm||!flash.animate)return;
  flash.animate([{opacity:0},{opacity:.62,offset:.07},{opacity:.14,offset:.2},{opacity:.46,offset:.3},{opacity:0}],{duration:560,easing:'ease-out'});
 }
 function draw(){
  const world=getWorld(),outdoors=!!world&&!world.cave,sky=sampleSky(state.hour),look=weatherLook(state.weather);
  // Picture grade.
  const mixed=outdoors?gradeFor(sky,state.weather,state.dim):[1,1,1],key=mixed.map(v=>Math.round(v*255)).join(',');
  if(key!==state.lastGrade){state.lastGrade=key;grade.hidden=key==='255,255,255';if(!grade.hidden)grade.style.backgroundColor='rgb('+key+')';}
  // Rain layers.
  const rain=outdoors?Math.round(state.rain*20)/20:0;
  if(rain!==state.lastRain){
   state.lastRain=rain;
   if(rain>0&&!state.tiles){state.tiles=true;far.style.backgroundImage='url('+rainTile(doc,384,70,26,.34)+')';near.style.backgroundImage='url('+rainTile(doc,256,26,46,.5)+')';}
   root.classList.toggle('is-raining',rain>0);far.style.opacity=String(Math.min(1,rain*1.1));near.style.opacity=String(Math.max(0,rain-.25)*1.2);
  }
  // Sky shader.
  const material=world?.sky?.material;
  if(material&&outdoors){
   night.set(sky.night,state.elapsed%628,0,0);glow.set(sky.glow[0]*(1-state.cloud*.7),sky.glow[1]*(1-state.cloud*.7),sky.glow[2]*(1-state.cloud*.7));
   const m=moonDirection(state.hour);moon.set(m.x,m.y,m.z).normalize();
   material.setVector4('skyNight',night);material.setVector3('skyGlow',glow);material.setVector3('moonDirection',moon);material.setFloat('weatherCloud',state.cloud);
  }
  // HUD chip.
  mountChip();
  const icon=state.weather!=='clear'?state.weather:sky.phase==='night'||sky.night>.5?'moon':'sun',label=formatClock(state.hour),chipKey=icon+label;
  if(chipKey!==state.lastChip){state.lastChip=chipKey;chipIcon.innerHTML=ICONS[icon];chipText.textContent=label;chip.setAttribute('aria-label',label+' · '+t('sky.'+state.weather));chip.dataset.phase=sky.phase;}
  chip.hidden=!outdoors;
  void look;
 }
 return {
  element:root,
  update(dt){
   if(state.disposed||!(dt>0))return;
   const hours=dt*24/DAY_SECONDS;state.elapsed+=dt;state.hour=wrapHour(state.hour+hours);state.left-=hours;
   if(state.left<=0){const next=rollWeather(state.weather,random);state.weather=next.weather;state.left=next.hours;state.dim=0;}
   // Ease cloud cover, rain and the weather dimming toward the current weather.
   const look=weatherLook(state.weather),step=dt/BLEND_SECONDS,ease=(from,to)=>from<to?Math.min(to,from+step):Math.max(to,from-step);
   state.cloud=ease(state.cloud,look.cloud);state.rain=ease(state.rain,look.rain);state.dim=Math.min(1,state.dim+step);
   if(look.storm&&state.rain>.8&&!getWorld()?.cave){state.bolt-=dt;if(state.bolt<=0){state.bolt=5+random()*13;strike();}}
   state.refresh-=dt;if(state.refresh<=0){state.refresh=REFRESH_SECONDS;draw();}
   state.save-=dt;if(state.save<=0){state.save=SAVE_SECONDS;save();}
  },
  // Map arrival: the new sky material needs its uniforms at once.
  mapChanged(){state.lastGrade='';state.lastRain=-1;state.lastChip='';draw();},
  setHour(hour){state.hour=wrapHour(hour);draw();save();},
  setWeather(weather,hours=3,{instant=false}={}){if(!WEATHERS.includes(weather))return false;state.weather=weather;state.left=hours;if(instant){const look=weatherLook(weather);state.cloud=look.cloud;state.rain=look.rain;state.dim=1;}else state.dim=0;draw();save();return true;},
  // A night at the inn: wake at seven the next morning.
  restUntilMorning(){state.hour=7;draw();save();},
  strike,
  inspect:()=>({hour:+state.hour.toFixed(2),clock:formatClock(state.hour),weather:state.weather,left:+state.left.toFixed(2),cloud:+state.cloud.toFixed(2),rain:+state.rain.toFixed(2),grade:state.lastGrade,phase:sampleSky(state.hour).phase}),
  dispose(){if(state.disposed)return;state.disposed=true;save();root.remove();chip.remove();},
 };
}
