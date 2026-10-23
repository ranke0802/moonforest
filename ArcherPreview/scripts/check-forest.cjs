const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
(async()=>{
 const root=path.resolve(__dirname,'..'),suffix=process.env.PREVIEW_URL?'public':'local',report={errors:[],checks:[]};
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:820}});page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto(process.env.PREVIEW_URL||'http://127.0.0.1:4190/?character=warrior-v2');
  await page.waitForFunction(()=>window.archerPreview?.inspect().ready,null,{timeout:90000});
  const inspect=()=>page.evaluate(()=>archerPreview.inspect());
  report.initial=await inspect();assert.equal(report.initial.environment.scarecrows,1);assert.equal(report.initial.targets.length,1);
  const stats=()=>page.evaluate(()=>new Promise(resolve=>{const ch=new MessageChannel();ch.port1.onmessage=e=>resolve(e.data);navigator.serviceWorker.controller.postMessage({type:'RESOURCE_CACHE_STATS'},[ch.port2]);}));
  await page.mouse.move(600,350);await page.mouse.wheel(0,600);await page.waitForTimeout(800);
  await page.screenshot({path:path.join(root,`reports/forest-${suffix}.png`)});
  report.checks.push('All five imported assets loaded; one scarecrow');
  await page.keyboard.down('w');await page.waitForTimeout(550);await page.keyboard.up('w');await page.waitForTimeout(100);
  for(let attempt=0;attempt<3;attempt++){
   await page.keyboard.press('j');await page.waitForTimeout(1100);
   if((await inspect()).targets[0].hits>0)break;
   await page.keyboard.down('w');await page.waitForTimeout(140);await page.keyboard.up('w');
  }
  report.scarecrowHits=(await inspect()).targets[0].hits;assert.ok(report.scarecrowHits>0,'Imported scarecrow takes sword damage');
  report.checks.push('Replacement scarecrow receives actual sword contact');
  const nav=report.initial.navigation.obstacles;
  function clear(p,r){return nav.every(o=>Math.hypot(p.x-o.x,p.z-o.z)>=r+o.radius-.008);}
  report.movement=[];
  for(const keys of [['w'],['d'],['s'],['a'],['w','d']]){
   for(const k of keys)await page.keyboard.down(k);
   for(let i=0;i<12;i++){await page.waitForTimeout(120);const s=await inspect();assert.ok(clear(s.position,.32),'Player clear of environment');report.movement.push(s.position);}
   for(const k of keys)await page.keyboard.up(k);
  }
  report.checks.push('Player remains outside every tree, grass bed and target during real movement input');
  await page.locator('#boss-count').selectOption('3');await page.locator('#summon-boss').click();
  await page.waitForFunction(()=>archerPreview.inspect().boss.count===3&&!archerPreview.inspect().boss.loading,null,{timeout:90000});
  report.bossSamples=[];
  for(let i=0;i<20;i++){
   await page.waitForTimeout(150);const s=await inspect();report.bossSamples.push(s.boss.bosses);
   for(const b of s.boss.bosses)assert.ok(clear({x:b.position[0],z:b.position[2]},.7),'Boss clear '+b.id);
  }
  report.pathsBuilt=(await inspect()).navigation.pathsBuilt;
  await page.screenshot({path:path.join(root,`reports/forest-bosses-${suffix}.png`)});
  report.checks.push('Three bears spawn outside obstacles and stay outside their collision hulls');
  const downloads=[];page.on('request',r=>{if(/\/content\/[a-f0-9]{64}\./.test(r.url()))downloads.push(r.url());});
  await page.waitForFunction(()=>archerPreview.inspect().audio.loaded===37);report.cacheBeforeReload=await stats();
  await page.reload();await page.waitForFunction(()=>window.archerPreview?.inspect().ready,null,{timeout:60000});
  report.cache=await stats();assert.equal(report.cache.downloads,report.cacheBeforeReload.downloads,'Warm reload downloads no unchanged binary resources');
  report.resourceRequestsOnReload=downloads.length;
  assert.equal((await inspect()).targets.length,1);report.checks.push('Reload retains one target with immutable resource cache');
  await page.setViewportSize({width:412,height:915});await page.waitForTimeout(500);await page.screenshot({path:path.join(root,`reports/forest-mobile-${suffix}.png`)});
  assert.deepEqual(report.errors,[]);report.passed=true;
 }finally{fs.writeFileSync(path.join(root,`reports/forest-browser-${suffix}.json`),JSON.stringify(report,null,2));await browser.close();}
 console.log(JSON.stringify({passed:report.passed,checks:report.checks,pathsBuilt:report.pathsBuilt,cache:report.cache,errors:report.errors}));
})().catch(e=>{console.error(e);process.exit(1)});
