const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
(async()=>{
 const root=path.resolve(__dirname,'..'),suffix=process.env.PREVIEW_URL?'public':'local',report={errors:[],checks:[]},browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:820}});page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto(process.env.PREVIEW_URL||'http://127.0.0.1:4190/?character=warrior-v2');await page.waitForFunction(()=>window.archerPreview?.inspect().ready,null,{timeout:90000});
  const inspect=()=>page.evaluate(()=>archerPreview.inspect()),stats=()=>page.evaluate(()=>new Promise(resolve=>{const c=new MessageChannel();c.port1.onmessage=e=>resolve(e.data);navigator.serviceWorker.controller.postMessage({type:'RESOURCE_CACHE_STATS'},[c.port2]);}));
  await page.mouse.move(600,340);await page.mouse.wheel(0,600);await page.waitForTimeout(500);await page.screenshot({path:path.join(root,`reports/painted-environment-${suffix}.png`)});
  await page.locator('#goblin-count').selectOption('1');await page.locator('#summon-goblin').click();
  await page.waitForFunction(()=>archerPreview.inspect().boss.goblinCount===1&&!archerPreview.inspect().boss.loading,null,{timeout:90000});
  report.spawn=await inspect();assert.ok(report.spawn.boss.bosses.every(g=>g.clips===12));assert.equal(report.spawn.boss.goblinModelLoads,1);
  await page.screenshot({path:path.join(root,`reports/goblins-${suffix}.png`)});
  await page.evaluate(()=>{Math.random=()=>.3;});
  report.combat=[];
  await page.waitForTimeout(2000);
  for(let i=0;i<8;i++){
   if(await page.locator('#death-dialog').getAttribute('open')!==null)break;
   await page.keyboard.press('j');await page.waitForTimeout(1300);report.combat.push((await inspect()).boss);
   if(report.combat.at(-1).bosses.some(g=>g.hits>0)&&report.combat.at(-1).playerHp<500)break;
  }
  assert.ok(report.combat.some(b=>b.playerHp<500),'Goblins damage player');
  await page.screenshot({path:path.join(root,`reports/goblin-combat-${suffix}.png`)});
  assert.ok(report.combat.some(b=>b.bosses.some(g=>g.hits>0)),'Sword damages goblins');
  await page.locator('#goblin-count').selectOption('5');await page.locator('#summon-goblin').click();await page.waitForFunction(()=>archerPreview.inspect().boss.goblinCount===5&&!archerPreview.inspect().boss.loading);
  report.five=(await inspect()).boss;assert.ok(report.five.bosses.every(g=>g.clips===12));assert.equal(report.five.goblinModelLoads,1);
  await page.waitForTimeout(1500);await page.screenshot({path:path.join(root,`reports/goblins-${suffix}.png`)});
  report.checks.push('Five independently animated goblins, twelve clips each, and real mutual damage');
  if(await page.locator('#death-dialog').getAttribute('open')!==null)await page.locator('#death-restart').click();
  await page.locator('#goblin-count').selectOption('1');await page.locator('#summon-goblin').click();await page.waitForFunction(()=>archerPreview.inspect().boss.goblinCount===1&&!archerPreview.inspect().boss.loading);
  await page.locator('#boss-count').selectOption('2');await page.locator('#summon-boss').click();await page.waitForFunction(()=>archerPreview.inspect().boss.bearCount===2&&!archerPreview.inspect().boss.loading,null,{timeout:90000});
  report.mixed=(await inspect()).boss;assert.equal(report.mixed.goblinCount,1);assert.equal(report.mixed.count,3);assert.equal(new Set(report.mixed.bosses.map(b=>b.id)).size,3);
  report.checks.push('Bears and goblins coexist with separate health bars and one player health pool');
  await page.waitForFunction(()=>archerPreview.inspect().audio.loaded===37);report.cacheBefore=await stats();
  await page.reload();await page.waitForFunction(()=>window.archerPreview?.inspect().ready,null,{timeout:90000});
  await page.locator('#goblin-count').selectOption('3');await page.locator('#summon-goblin').click();await page.waitForFunction(()=>archerPreview.inspect().boss.goblinCount===3&&!archerPreview.inspect().boss.loading,null,{timeout:90000});
  report.cacheAfter=await stats();assert.equal(report.cacheBefore.downloads,report.cacheAfter.downloads);assert.equal((await inspect()).targets.length,1);
  report.checks.push('Warm reload and goblin resummon download zero unchanged resources');
  await page.setViewportSize({width:412,height:915});await page.waitForTimeout(300);await page.screenshot({path:path.join(root,`reports/goblin-mobile-${suffix}.png`)});
  const button=await page.locator('#summon-goblin').boundingBox(),count=await page.locator('#goblin-count').boundingBox();assert.ok(button.x+button.width<=count.x+.5);assert.ok(count.x+count.width<=412);
  assert.deepEqual(report.errors,[]);report.passed=true;
 }finally{fs.writeFileSync(path.join(root,`reports/goblin-browser-${suffix}.json`),JSON.stringify(report,null,2));await browser.close();}
 console.log(JSON.stringify({passed:report.passed,checks:report.checks,errors:report.errors}));
})().catch(e=>{console.error(e);process.exit(1)});
