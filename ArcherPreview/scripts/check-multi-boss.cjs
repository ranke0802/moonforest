const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'}),root=path.resolve(__dirname,'..');
 const report={url:process.env.PREVIEW_URL||'http://127.0.0.1:4190/?character=warrior-v2',errors:[],checks:[],snapshots:[]};
 const suffix=process.env.PREVIEW_URL?'public':'local';
 try{
  const page=await browser.newPage({viewport:{width:1280,height:820}});page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto(report.url);await page.waitForFunction(()=>window.archerPreview?.inspect().ready,null,{timeout:60000});
  assert.equal(await page.locator('#boss-count').inputValue(),'1');
  const inspect=()=>page.evaluate(()=>archerPreview.inspect());
  const stats=()=>page.evaluate(()=>new Promise(resolve=>{const c=new MessageChannel();c.port1.onmessage=e=>resolve(e.data);navigator.serviceWorker.controller.postMessage({type:'RESOURCE_CACHE_STATS'},[c.port2]);}));
  for(const count of [3,1,5,2]){
   await page.locator('#boss-count').selectOption(String(count));await page.locator('#summon-boss').click();
   await page.waitForFunction(n=>archerPreview.inspect().boss.count===n&&!archerPreview.inspect().boss.loading,count,{timeout:60000});
   const snapshot=(await inspect()).boss;report.snapshots.push(snapshot);
   assert.equal(snapshot.bosses.length,count);assert.ok(snapshot.bosses.every(b=>b.clips===20&&b.hp===900));assert.equal(snapshot.modelLoads,1);
   if(count===3){await page.waitForFunction(()=>archerPreview.inspect().audio.loaded===37);report.cacheAfterFirstSpawn=await stats();}
   if(count===5){await page.screenshot({path:path.join(root,`reports/multi-boss-${suffix}.png`)});assert.equal(snapshot.pooledModels,5);}
  }
  report.cacheAfterRespawns=await stats();assert.equal(report.cacheAfterRespawns.downloads,report.cacheAfterFirstSpawn.downloads);
  report.checks.push('1–5 selection, 3/1/5/2 resummons, twenty clips per boss, one shared model load, zero extra binary downloads');
  const before=(await inspect()).boss;await page.waitForTimeout(2500);const after=(await inspect()).boss;
  assert.ok(after.bosses.some((b,i)=>b.state!==before.bosses[i].state||Math.hypot(...b.position.map((v,j)=>v-before.bosses[i].position[j]))>.1));
  assert.equal(await page.locator('[data-boss-id]').count(),5);
  assert.equal(await page.locator('[data-boss-id="3"]').isHidden(),true);
  assert.equal(await page.locator('[data-boss-id="4"]').isHidden(),true);
  assert.equal(await page.locator('[data-boss-id="5"]').isHidden(),true);
  const ids=await page.locator('[id]').evaluateAll(nodes=>nodes.map(n=>n.id));assert.equal(new Set(ids).size,ids.length);
  report.checks.push('Independent movement and per-boss health bars; unused bars hidden without duplicate IDs');
  for(let i=0;i<10;i++){
   if(await page.locator('#death-dialog').getAttribute('open')!==null)break;
   await page.keyboard.down('j');await page.waitForTimeout(1100);await page.keyboard.up('j');await page.waitForTimeout(250);
  }
  report.combat=(await inspect()).boss;assert.ok(report.combat.bosses.some(b=>b.hits>0));assert.ok(report.combat.playerHp<500);
  report.checks.push('Real input damages individual bosses; boss attacks damage shared player HP');
  await page.waitForFunction(()=>document.querySelector('#death-dialog').open,null,{timeout:45000});
  await page.locator('#death-restart').click();await page.waitForFunction(()=>!archerPreview.inspect().boss.active);
  assert.equal((await inspect()).boss.count,0);report.checks.push('Death restart hides all bosses and resets battle');
  await page.locator('#motion-speed-toggle').click();
  const mobile=await browser.newPage({viewport:{width:412,height:915},isMobile:true,hasTouch:true});mobile.on('pageerror',e=>report.errors.push(e.message));
  await mobile.goto(report.url);await mobile.waitForFunction(()=>window.archerPreview?.inspect().ready,null,{timeout:60000});
  await mobile.locator('#boss-count').selectOption('3');await mobile.locator('#summon-boss').tap();
  await mobile.waitForFunction(()=>archerPreview.inspect().boss.count===3,null,{timeout:60000});
  const button=await mobile.locator('#summon-boss').boundingBox(),select=await mobile.locator('#boss-count').boundingBox();
  assert.ok(button.x+button.width<=select.x+.5);assert.ok(select.x+select.width<=412);
  await mobile.screenshot({path:path.join(root,`reports/multi-boss-mobile-${suffix}.png`)});report.checks.push('Mobile selector fits beside summon button and spawns three bosses');
  assert.deepEqual(report.errors,[]);report.passed=true;
 }finally{fs.writeFileSync(path.join(root,`reports/multi-boss-browser-${suffix}.json`),JSON.stringify(report,null,2));await browser.close();}
 console.log(JSON.stringify(report));
})().catch(e=>{console.error(e);process.exit(1)});
