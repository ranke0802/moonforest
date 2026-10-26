import assert from 'node:assert/strict';
import { readFile,writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { createServer } from 'vite';
const require=createRequire(import.meta.url);
const {chromium}=require(resolve(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const root=resolve(import.meta.dirname,'..');
const atlas=process.argv.includes('--atlas');
const oldManifest=atlas?await readFile(resolve(root,'reports/tree-uv-before.json'),'utf8'):execFileSync('git',['show','e151b6b:ArcherPreview/public/assets/environment.json'],{cwd:root,encoding:'utf8'});
const server=await createServer({root,server:{host:'127.0.0.1',port:4197,strictPort:true,open:false},plugins:[{
  name:'isolated-forest-review',configureServer(server){
    server.middlewares.use('/__forest_review__',(req,res)=>{
      res.setHeader('Content-Type','text/html');
      res.end('<html><head><link rel="icon" href="data:,"></head><body style="margin:0"><canvas style="width:100vw;height:100vh;display:block"></canvas><script type="module" src="/tests/helpers/distant-forest-review.js"></script></body></html>');
    });
  },
}]});
await server.listen();
const browser=await chromium.launch({headless:true,channel:'msedge'});
const report={errors:[],cases:[]};
try {
  for(const baseline of [true,false]){
    const page=await browser.newPage({viewport:{width:1100,height:700}});
    page.on('pageerror',error=>report.errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error')report.errors.push(message.text());});
    if(baseline)await page.route('**/assets/environment.json',route=>route.fulfill({contentType:'application/json',body:oldManifest}));
    await page.goto(`http://127.0.0.1:4197/__forest_review__${baseline&&!atlas?'?baseline=1':''}`);
    await page.waitForFunction(()=>window.forestReview?.ready,null,{timeout:90000});
    for(const [name,x,z,alpha,beta,radius] of [['center',0,0,1.2,1.15,14],['edge',-12,-10,3.9,1.25,12]]){
      const stats=await page.evaluate(args=>forestReview.render(...args),[x,z,alpha,beta,radius]);
      report.cases.push({baseline,name,...stats});
      await page.screenshot({path:resolve(root,`reports/${atlas?'atlas-forest':'distant'}-${baseline?'before':'after'}-${name}.png`)});
    }
    if(!baseline){
      const comparison=await page.evaluate(async()=>{
        const {world,render}=forestReview,pairs=[];
        for(const mesh of new Set(world.scene.meshes.map(m=>m.sourceMesh??m)))for(const lod of mesh.getLODLevels?.()??[]){
          if(lod.mesh?.material?.metadata?.distantTree)pairs.push([lod.mesh,lod.mesh.material,mesh.material]);
        }
        for(const [mesh,,original] of pairs)mesh.material=original;
        await render(0,0,1.2,1.15,14);
        return pairs.length;
      });
      assert.ok(comparison>0,'distant material is actually used by the LOD chain');
      await page.screenshot({path:resolve(root,'reports/distant-original-shading.png')});
    }
    await page.close();
  }
  assert.deepEqual(report.errors,[]);
  const before=report.cases.find(c=>c.baseline&&c.name==='center'),after=report.cases.find(c=>!c.baseline&&c.name==='center');
  assert.ok(after.triangles<before.triangles*(atlas?1.05:1),'paint repair must stay within the existing forest geometry budget');
} finally {
  await writeFile(resolve(root,`reports/${atlas?'atlas-forest-review':'distant-forest-review'}.json`),JSON.stringify(report,null,2)+'\n');
  await browser.close();await server.close();
}
console.log(JSON.stringify(report));
