import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {createServer} from 'vite';
const require=createRequire(import.meta.url),root=resolve(import.meta.dirname,'..');
const {chromium}=require(resolve(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const before=JSON.parse(await readFile(resolve(root,'reports/tree-uv-before.json'),'utf8'));
const after=JSON.parse(await readFile(resolve(root,'public/assets/environment.json'),'utf8'));
const server=await createServer({root,server:{host:'127.0.0.1',port:4198,strictPort:true,open:false},plugins:[{name:'isolated-tree-review',configureServer(server){server.middlewares.use('/__tree_review__',(req,res)=>{res.setHeader('Content-Type','text/html');res.end('<html><head><link rel="icon" href="data:,"></head><body style="margin:0"><canvas style="width:100vw;height:100vh;display:block"></canvas><script type="module" src="/tests/helpers/tree-atlas-review.js"></script></body></html>');});}}]});
await server.listen();const browser=await chromium.launch({headless:true,channel:'msedge'}),report={errors:[],cases:[]};
try{
 const page=await browser.newPage({viewport:{width:900,height:800}});
 page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
 await page.goto('http://127.0.0.1:4198/__tree_review__');await page.waitForFunction(()=>window.treeReview);
 for(const key of ['oak-tree','verdant-tree'])for(const [level,index] of [['full',-1],['near',0],['mid',1],['distant',2],['background',3]]){
  for(const [phase,manifest] of level==='full'?[['original',before]]:[['before',before],['after',after]]){
   const config=manifest.assets[key],model=index<0?config.model:config.lods[index].model;
   const stats=await page.evaluate(model=>treeReview.render(model),model);
   report.cases.push({key,level,phase,...stats});
   await page.screenshot({path:resolve(root,`reports/atlas-${key}-${level}-${phase}.png`)});
  }
 }
}finally{await browser.close();await server.close();await writeFile(resolve(root,'reports/tree-atlas-review.json'),JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify(report));if(report.errors.length)process.exitCode=1;
