const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
(async()=>{
 const root=path.resolve(__dirname,'..'),report={errors:[],attacks:[]};
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:820}});
  page.on('pageerror',e=>report.errors.push(e.message));
  // Private, test-only instrumentation; no mutable hooks in the shipped application.
  await page.route('**/src/main.js',async route=>{
   const response=await route.fetch();
   await route.fulfill({response,body:await response.text()+`\nwindow.__qa={get boss(){return boss},get actor(){return actor},get controller(){return controller},get world(){return world},get frameLoop(){return frameLoop},get input(){return input},render,strikeSampler};`});
  });
  await page.goto('http://127.0.0.1:4191/?character=warrior-v2');
  await page.waitForFunction(()=>window.archerPreview?.inspect().ready,null,{timeout:90000});
  await page.evaluate(()=>__qa.frameLoop.setPaused(true));
  await page.locator('#summon-goblin').click();
  await page.waitForFunction(()=>archerPreview.inspect().boss.goblinCount===1&&!archerPreview.inspect().boss.loading,null,{timeout:90000});
  for(const attack of ['slash','attack','judgment']){
   const result=await page.evaluate(state=>{
    const q=__qa,b=q.boss,e=b.encounters[0];q.frameLoop.setPaused(true);q.input.reset();q.actor.position.set(0,0,0);q.actor.rotation.y=0;
    q.controller.cancelAttack();q.controller.staggerRemaining=0;b.combat.reset();q.strikeSampler.reset();
    e.brain.hp=180;e.brain.start('Walking','idle');e.brain.stagger=0;e.gate.reset();e.hitCount=0;e.actor.position.set(0,0,1.2);e.actor.rotation.y=Math.PI;
    if(!e.qaUpdate)e.qaUpdate=e.brain.update.bind(e.brain);
    e.brain.wait=100;e.brain.update=dt=>{e.qaUpdate(dt,1.2,true);return {events:[],speed:0};};
    q.render(1/60);q.controller.startAttack(state);
    for(let i=0;i<180;i++)q.render(1/60);
    return {state,hp:e.brain.hp,hits:e.hitCount,player:archerPreview.inspect().position,enemy:e.actor.position.asArray()};
   },attack);
   report.attacks.push(result);assert.ok(result.hits>0,JSON.stringify(result));
   if(attack==='judgment')assert.equal(result.hits,3);
   if(attack==='attack'){assert.equal(result.hits,2);assert.equal(result.hp,142);}
  }
  await page.locator('#summon-boss').click();
  await page.waitForFunction(()=>archerPreview.inspect().boss.bearCount===1&&!archerPreview.inspect().boss.loading,null,{timeout:90000});
  report.mixed=await page.evaluate(()=>{
   const q=__qa,b=q.boss;q.frameLoop.setPaused(true);q.controller.cancelAttack();q.controller.staggerRemaining=0;b.combat.reset();q.strikeSampler.reset();q.actor.position.set(0,0,0);q.actor.rotation.y=0;
   b.encounters.forEach((e,i)=>{e.brain.hp=e.brain.maxHp;e.brain.start(e.kind==='goblin'?'Walking':'Block6','idle');e.brain.stagger=0;e.gate.reset();e.hitCount=0;e.actor.position.set((i-.5)*1.3,0,1.1);e.actor.rotation.y=Math.PI;e.brain.update=()=>({events:[],speed:0});});
   q.render(1/60);q.controller.startAttack('slash');for(let i=0;i<100;i++)q.render(1/60);
   return b.encounters.map(e=>({kind:e.kind,hits:e.hitCount,hp:e.brain.hp,position:e.actor.position.asArray()}));
  });
  assert.ok(report.mixed.every(e=>e.hits>0),JSON.stringify(report.mixed));
  await page.evaluate(async()=>{await __qa.world.scene.whenReadyAsync();__qa.render(0);});
  await page.screenshot({path:path.join(root,'reports/mixed-sword-repaired.png')});
  report.grass=await page.evaluate(()=>{
   const q=__qa;q.boss.hide();q.controller.cancelAttack();q.controller.staggerRemaining=0;q.input.reset();q.actor.position.set(2.4,0,-3.8);q.world.camera.alpha=Math.PI;
   q.input.keys.add('KeyW');for(let i=0;i<35;i++)q.render(1/60);q.input.keys.clear();q.render(1/60);
   return archerPreview.inspect().position;
  });
  assert.ok(report.grass.x>4.6,'Player crosses grass with movement input: '+JSON.stringify(report.grass));
  await page.evaluate(()=>{
   const q=__qa;q.actor.position.set(7.7,0,4);const target=q.actor.position.clone();target.y=2.5;target.z=6.1;q.world.camera.setTarget(target);q.world.camera.radius=8;q.world.camera.alpha=-Math.PI/2;q.world.camera.beta=1.18;q.render(0);
  });
  await page.screenshot({path:path.join(root,'reports/oak-repaired-game.png')});
  report.environment=await page.evaluate(()=>archerPreview.inspect().environment);
  assert.deepEqual(report.errors,[]);report.passed=true;
 }finally{fs.writeFileSync(path.join(root,'reports/forest-repair-browser.json'),JSON.stringify(report,null,2));await browser.close();}
 console.log(JSON.stringify(report));
})().catch(e=>{console.error(e);process.exit(1)});
