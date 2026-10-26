// Headless isolated renderer. Does not open the game or activate input/audio.
import {writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {createServer} from 'vite';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),runtime=resolve(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules');
const {chromium}=require(resolve(runtime,'playwright')),sharp=require(resolve(runtime,'sharp'));
const root=resolve(import.meta.dirname,'..'),report={environment:'Headless Edge with touch emulation; not physical Galaxy S23',errors:[],cases:[]};
const server=await createServer({root,server:{host:'127.0.0.1',port:4198,strictPort:true,open:false},plugins:[{name:'shadow-fixture',configureServer(s){s.middlewares.use('/__shadow_review__',(req,res)=>{res.setHeader('Content-Type','text/html');res.end('<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"></head><body style="margin:0"><canvas style="width:100vw;height:100vh;display:block"></canvas><script type="module" src="/tests/helpers/mobile-shadow-review.js"></script></body></html>');});}}]});
await server.listen();const browser=await chromium.launch({headless:true,channel:'msedge'});
try{
 for(const warrior of [false,true]){
  const page=await browser.newPage({viewport:{width:512,height:512},isMobile:true,hasTouch:true});
  page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto(`http://127.0.0.1:4198/__shadow_review__${warrior?'?warrior':''}`);
  await page.waitForFunction(()=>window.shadowReview?.ready,null,{timeout:90000});
  for(const rate of [2,1]){
   await page.evaluate(rate=>shadowReview.mode(rate===2),rate);
   const tiles=[],stats=[],frames=[];
   for(let i=0;i<36;i++){
    const url=await page.evaluate(i=>shadowReview.render(i,true),i),buf=Buffer.from(url.split(',')[1],'base64');
    const resized=await sharp(buf).resize(256,256).png().toBuffer();tiles.push({input:resized,left:i%6*256,top:Math.floor(i/6)*256});
    const pixels=await sharp(buf).removeAlpha().raw().toBuffer();let sum=0;for(const n of pixels)sum+=n;stats.push(sum);
    frames.push(await page.evaluate(()=>shadowReview.inspect()));
   }
   const name=`shadow-moving-${warrior?'warrior':'box'}-${rate}`;
   await sharp({create:{width:1536,height:1536,channels:3,background:'#fff'}}).composite(tiles).png().toFile(resolve(root,`reports/${name}.png`));
   const mismatches=frames.map((f,i)=>f.matrixMatches?-1:i).filter(i=>i>=0),passes=frames.at(-1).shadowPasses;
   report.cases.push({name,stats,mismatches,passes,mapSize:frames.at(-1).mapSize});
   if(rate===1){assert.equal(passes,36,'each mobile pose has a current shadow map');assert.deepEqual(mismatches,[],'shadow texture and light matrix stay synchronized');assert.equal(frames.at(-1).mapSize,1024);}
   else assert.ok(mismatches.length>0,'legacy skipped shadow map reproduces stale projection');
  }
  await page.close();
 }
 assert.deepEqual(report.errors,[]);
}finally{await browser.close();await server.close();await writeFile(resolve(root,'reports/mobile-shadows.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify(report));
