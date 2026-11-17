import test from 'node:test';
import assert from 'node:assert/strict';
import {sampleSky,gradeFor,moonDirection,rollWeather,formatClock,wrapHour,WEATHERS} from '../src/v04/sky-clock.js';

test('noon is untinted, midnight is a deep blue, sunset glows warm, and the day wraps',()=>{
 const noon=sampleSky(12);assert.deepEqual(noon.grade,[1,1,1]);assert.equal(noon.night,0);assert.equal(noon.phase,'day');
 const night=sampleSky(1);assert.ok(night.grade[2]>night.grade[0]);assert.equal(night.night,1);assert.equal(night.phase,'night');
 const dusk=sampleSky(18.5);assert.ok(dusk.glow[0]>dusk.glow[2]&&dusk.glow[0]>.3);assert.equal(dusk.phase,'dusk');
 assert.deepEqual(sampleSky(24).grade,sampleSky(0).grade);assert.equal(wrapHour(-1),23);
 // Continuous: no jump larger than a small step anywhere in the day.
 let previous=sampleSky(0);for(let h=.05;h<=24;h+=.05){const now=sampleSky(h);for(let k=0;k<3;k++)assert.ok(Math.abs(now.grade[k]-previous.grade[k])<.04,'grade jump at '+h);previous=now;}
});
test('weather dims the picture, storms never repeat, and every roll is a known weather',()=>{
 const sky=sampleSky(12);assert.deepEqual(gradeFor(sky,'clear'),[1,1,1]);assert.ok(gradeFor(sky,'storm')[0]<.7);assert.deepEqual(gradeFor(sky,'storm',0),[1,1,1]);
 let seed=7;const random=()=>(seed=(seed*16807)%2147483647)/2147483647;
 for(let i=0,weather='clear';i<400;i++){const next=rollWeather(weather,random);assert.ok(WEATHERS.includes(next.weather));assert.ok(next.hours>0);if(weather==='storm')assert.notEqual(next.weather,'storm');weather=next.weather;}
});
test('moon is up at night and below the horizon by day; the clock reads in ten-minute steps',()=>{
 assert.ok(moonDirection(0).y>.7);assert.ok(moonDirection(12).y<0);assert.ok(moonDirection(19).y>0);
 assert.equal(formatClock(18.37),'18:20');assert.equal(formatClock(24.01),'00:00');
});
