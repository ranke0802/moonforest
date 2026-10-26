import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {createServer} from 'vite';
const require=createRequire(import.meta.url),root=resolve(import.meta.dirname,'..');
const {chromium}=require(resolve(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const server=await createServer({root,server:{host:'127.0.0.1',port:4198,strictPort:true,open:false},plugins:[{name:'isolated-tree-visibility',configureServer(server){server.middlewares.use('/__tree_visibility__',(req,res)=>{res.setHeader('Content-Type','text/html');res.end('<html><head><link rel="icon" href="data:,"></head><body style="margin:0"><canvas style="width:100vw;height:100vh;display:block"></canvas><script type="module" src="/tests/helpers/distant-forest-review.js"></script></body></html>');});}}]});
await server.listen();const browser=await chromium.launch({headless:true,channel:'msedge'}),report={errors:[]};
try{
 const page=await browser.newPage({viewport:{width:1100,height:700}});
 page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
 await page.goto('http://127.0.0.1:4198/__tree_visibility__');await page.waitForFunction(()=>window.forestReview?.ready,null,{timeout:90000});
 report.result=await page.evaluate(async()=>{
  const {Vector3,Ray,MeshBuilder,StandardMaterial,Color3}=await import('/tests/helpers/distant-forest-review.js');
  const {blocksView}=await import('/src/tree-occlusion.js');
  const {world,render}=forestReview,occlusion=world.treeOcclusion,cases=[];
  const points=[[0,0],[5,5],[-8,-8]];
  let referenceMismatches=0,checks=0,totalMs=0,best;
  for(const [x,z] of points)for(let angle=0;angle<8;angle++){
   const alpha=angle*Math.PI/4,player=new Vector3(x,world.terrain.heightAt(x,z),z);
   world.camera.target.copyFrom(player).addInPlaceFromFloats(0,1.5,0);world.camera.alpha=alpha;world.camera.beta=1.05;world.camera.radius=12;world.camera.getViewMatrix(true);
   const camera=world.camera.globalPosition,targets=[player.add(new Vector3(0,1.5,0)),player.add(new Vector3(0,.85,0))];
   const start=performance.now();for(let n=0;n<20;n++)occlusion.update(camera,player,.11);totalMs+=performance.now()-start;checks+=20;
   const broad=occlusion.trees.filter(tree=>targets.some(target=>blocksView(camera,target,tree.min,tree.max)));
   const faded=occlusion.trees.filter(tree=>tree.target<1);
   for(const tree of broad){
    const exact=targets.some(target=>tree.meshes.some(instance=>{
     const selected=instance.getLOD(world.camera);if(!selected)return false;
     const inverse=instance.getWorldMatrix().clone().invert(),a=Vector3.TransformCoordinates(camera,inverse),b=Vector3.TransformCoordinates(target,inverse),delta=b.subtract(a);
     const hit=selected.intersects(new Ray(a,delta.normalizeToNew(),delta.length()),true);
     return hit.hit&&hit.distance>delta.length()*.002&&hit.distance<delta.length()*.995;
    }));
    if(exact!==(tree.target<1))referenceMismatches++;
   }
   const entry={x,z,alpha,broad:broad.length,actual:faded.length};cases.push(entry);
   if(!best||entry.broad-entry.actual>best.broad-best.actual)best=entry;
  }
  const player=new Vector3(best.x,world.terrain.heightAt(best.x,best.z),best.z);
  const marker=MeshBuilder.CreateCapsule('player-visibility-marker',{height:1.7,radius:.23},world.scene);marker.position.copyFrom(player).addInPlaceFromFloats(0,.85,0);
  marker.material=new StandardMaterial('marker',world.scene);marker.material.diffuseColor=new Color3(.1,.2,.8);
  await render(best.x,best.z,best.alpha,1.05,12);
  window.visibilityReview={world,render,best,player,targets:[player.add(new Vector3(0,1.5,0)),player.add(new Vector3(0,.85,0))],blocksView};
  return {cases,referenceMismatches,checks,averageCheckMs:totalMs/checks,best};
 });
 for(const before of [true,false]){
  await page.evaluate(async before=>{
   const {world,render,best,player,targets,blocksView}=visibilityReview,occlusion=world.treeOcclusion,camera=world.camera.globalPosition;
   if(before){for(const tree of occlusion.trees){tree.coverage=targets.some(target=>blocksView(camera,target,tree.min,tree.max))?.45:1;for(const mesh of tree.meshes)mesh.instancedBuffers.treeCoverage=tree.coverage;}}
   else for(let i=0;i<10;i++)occlusion.update(camera,player,.1);
   await render(best.x,best.z,best.alpha,1.05,12);
  },before);
  await page.screenshot({path:resolve(root,`reports/tree-visibility-${before?'before':'after'}.png`)});
 }
 assert.deepEqual(report.errors,[]);assert.equal(report.result.referenceMismatches,0);
 assert.ok(report.result.cases.some(c=>c.actual>0));assert.ok(report.result.best.broad>report.result.best.actual);
}finally{await browser.close();await server.close();await writeFile(resolve(root,'reports/tree-visibility-review.json'),JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify(report));
