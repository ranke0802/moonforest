import {NullEngine} from '@babylonjs/core';
import {createWorld,replaceWorldMap} from '../../src/world.js';
import {ArenaNavigation} from '../../src/navigation.js';
import {inspectMapNavigationCache} from '../../src/map-navigation-cache.js';
import {writeFile} from 'node:fs/promises';
let ms=0,calls=0;const grid=ArenaNavigation.prototype.grid;
ArenaNavigation.prototype.grid=function(...args){const start=performance.now();try{return grid.apply(this,args);}finally{ms+=performance.now()-start;calls++;}};
const engine=new NullEngine(),start=performance.now(),world=createWorld(engine,{village:true,touchDevice:true});
const visits=[{map:world.mapId,totalMs:performance.now()-start,gridMs:ms,gridCalls:calls}];
for(const character of ['warrior-v4','warrior-v5','warrior-v4','warrior-v3','warrior-v4','warrior-v5','warrior-v4','warrior-v3']){
 ms=calls=0;const start=performance.now();replaceWorldMap(world,character);const totalMs=performance.now()-start;
 visits.push({map:world.mapId,totalMs,gridMs:ms,gridCalls:calls,nodes:[...world.navigation.grids.values()].map(nodes=>nodes.length),compactBytes:[...world.navigation.grids.values()].reduce((sum,nodes)=>sum+nodes.length*2,0),cache:inspectMapNavigationCache(engine)});
}
engine.dispose();const result={visits,limits:'Node/NullEngine CPU only. No phone, image decode, browser, GPU or end-to-end map loading measurement.'};
await writeFile(new URL(process.argv[2]??'./navigation-before.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
