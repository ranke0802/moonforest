import test from 'node:test';
import assert from 'node:assert/strict';
import {mapNavigation} from '../src/world.js';
import {VillageNavigation} from '../src/village-navigation.js';
import {obstacleClearance} from '../src/village-collision.js';
import {setWorldCharacter,ENEMY_ARENA_RADIUS} from '../src/world-limits.js';

test('indexed large actor clearance matches every-obstacle decisions on all four production maps',()=>{
 let queries=0;for(const [character,options]of [['warrior-v3',{village:true}],['warrior-plains',{village:true,plains:true}],['warrior-v4',{village:true,forest:true}],['warrior-v5',{village:true,cave:true}]]){
  setWorldCharacter(character);const nav=mapNavigation(options),base=VillageNavigation.prototype.free,limit=ENEMY_ARENA_RADIUS;
  for(const radius of [.34,.7,1.625,3.61])for(let i=0;i<300;i++){
   const angle=i*2.399963229728653,length=Math.sqrt((i+.5)/300)*limit,p={x:Math.sin(angle)*length,z:Math.cos(angle)*length};
   const expected=Math.hypot(p.x,p.z)<=limit+1e-6&&nav.obstacles.every(o=>obstacleClearance(p,o)>=radius+.002);assert.equal(base.call(nav,p,radius,limit),expected,character+' radius'+radius+' sample'+i);queries++;
  }
  for(const obstacle of nav.obstacles.filter((_,i)=>i%37===0).slice(0,40))for(const radius of [1.625,3.61])for(const offset of [-1e-6,0,1e-6]){
   const p={x:obstacle.x+obstacle.radius+radius+.002+offset,z:obstacle.z},expected=Math.hypot(p.x,p.z)<=limit+1e-6&&nav.obstacles.every(o=>obstacleClearance(p,o)>=radius+.002);assert.equal(base.call(nav,p,radius,limit),expected);queries++;
  }
 }
 assert.ok(queries>=4800);setWorldCharacter('warrior');
});

test('legacy understated boxes and nonfinite radii retain their complete-scan results',()=>{
 const nav=new VillageNavigation([{id:'legacy-box',shape:'box',x:0,z:0,halfWidth:12,halfDepth:1,yaw:0,radius:.1,height:3}]);assert.equal(nav.segmentCellPruningSafe,false);
 for(const radius of [1.625,3.61,Infinity,NaN])for(const p of [{x:10,z:0},{x:20,z:0}])assert.equal(nav.free(p,radius,100),nav.obstacles.every(o=>obstacleClearance(p,o)>=radius+.002));
});
