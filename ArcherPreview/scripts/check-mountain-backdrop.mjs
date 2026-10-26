// A hidden, isolated environment render: never opens the game, plays audio or
// requests fullscreen. Checks geometry cost and views from both arena edges.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { createServer } from 'vite';
const require=createRequire(import.meta.url);
const {chromium}=require(resolve(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const root=resolve(import.meta.dirname,'..');
const server=await createServer({root,server:{host:'127.0.0.1',port:4198,strictPort:true,open:false},plugins:[{
  name:'isolated-mountain-review',configureServer(server){
    server.middlewares.use('/__mountain_review__',(req,res)=>{
      res.setHeader('Content-Type','text/html');
      res.end('<html><head><link rel="icon" href="data:,"></head><body style="margin:0"><canvas style="width:100vw;height:100vh;display:block"></canvas><script type="module" src="/tests/helpers/distant-forest-review.js"></script></body></html>');
    });
  },
}]});
await server.listen();
const browser=await chromium.launch({headless:true,channel:'msedge'});
const report={errors:[],cases:[]};
try {
  const page=await browser.newPage({viewport:{width:1174,height:780}});
  page.on('pageerror',error=>report.errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')report.errors.push(message.text());});
  await page.goto('http://127.0.0.1:4198/__mountain_review__');
  await page.waitForFunction(()=>window.forestReview?.ready,null,{timeout:90000});
  report.background=await page.evaluate(()=>{
    const {world}=forestReview,mesh=world.mountains,positions=mesh.getVerticesData('position');
    let nearest=Infinity,farthest=0;
    for(let i=0;i<positions.length;i+=3){const r=Math.hypot(positions[i],positions[i+2]);nearest=Math.min(nearest,r);farthest=Math.max(farthest,r);}
    return {triangles:mesh.getTotalIndices()/3,meshes:1,textures:mesh.material.getActiveTextures().length,
      nearest,farthest,unlit:mesh.material.unlit,shadowCaster:world.shadows.getShadowMap().renderList.includes(mesh),
      receiveShadows:mesh.receiveShadows,pickable:mesh.isPickable,collisions:mesh.checkCollisions};
  });
  assert.ok(report.background.triangles<3200);
  assert.equal(report.background.textures,0);
  assert.ok(report.background.nearest>38,'backdrop stays outside the playable radius');
  assert.equal(report.background.shadowCaster,false);
  assert.equal(report.background.receiveShadows,false);
  assert.equal(report.background.collisions,false);
  for(const [name,x,z,alpha,beta,radius] of [
    ['center',0,0,1.2,1.38,7],['west',0,0,3.1,1.38,7],
    ['south',0,0,4.7,1.38,7],['east-edge',21,0,3.1,1.35,14],
    ['west-edge',-21,0,0,1.35,14],['overhead',0,0,1.2,.75,14],
  ]){
    if(name==='center'){
      await page.evaluate(()=>{forestReview.world.mountains.setEnabled(false);forestReview.world.camera.maxZ=60;});
      report.before=await page.evaluate(args=>forestReview.render(...args),[x,z,alpha,beta,radius]);
      await page.screenshot({path:resolve(root,'reports/mountains-before.png')});
      await page.evaluate(()=>{forestReview.world.mountains.setEnabled(true);forestReview.world.camera.maxZ=220;});
    }
    const stats=await page.evaluate(args=>forestReview.render(...args),[x,z,alpha,beta,radius]);
    report.cases.push({name,...stats});
    await page.screenshot({path:resolve(root,`reports/mountains-${name}.png`)});
  }
  assert.equal(report.cases[0].triangles-report.before.triangles,report.background.triangles);
  assert.equal(report.cases[0].meshes-report.before.meshes,1);
  assert.deepEqual(report.errors,[]);
} finally {
  await writeFile(resolve(root,'reports/mountain-backdrop-review.json'),JSON.stringify(report,null,2)+'\n');
  await browser.close();await server.close();
}
console.log(JSON.stringify(report));
