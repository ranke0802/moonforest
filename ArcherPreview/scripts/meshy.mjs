#!/usr/bin/env node
// Meshy from the PC (2026-11-20). Claude's own shells cannot reach api.meshy.ai,
// so the user runs this in a Windows terminal and Claude takes over from the
// files it leaves under .cache/meshy/<name>/ (never committed).
//
//   node ArcherPreview\scripts\meshy.mjs balance
//   node ArcherPreview\scripts\meshy.mjs text "<what to make>" --name soldier-sword [--poly 3000]
//        [--model meshy-t2.5] [--texture "<how it should be painted>"] [--texmodel latest] [--pbr] [--no-texture]
//   node ArcherPreview\scripts\meshy.mjs image <picture file> --name bear-sword [--poly 3000] [--texmodel meshy-n1]
//        (a reference picture becomes the model; --texture-image <file> paints either kind from a picture)
//   node ArcherPreview\scripts\meshy.mjs run [jobs file]
//        every job in ArcherPreview/scripts/meshy-jobs.json (Claude keeps that list); finished ones are skipped,
//        so the same one line is all the user ever types
//   node ArcherPreview\scripts\meshy.mjs status <task id>
//
// The key is read from the MESHY_API_KEY environment variable or from
// <repo>/.cache/meshy.env (MESHY_API_KEY=...). No packages needed; it uses node:https,
// so an older Node without fetch works too (the PC's node on PATH had none).
import {mkdir,readFile,writeFile} from 'fs/promises';
import {existsSync} from 'fs';
import {fileURLToPath} from 'url';
import path from 'path';
import https from 'https';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','..');
const API='https://api.meshy.ai/openapi';
const SMART=new Set(['meshy-t2','meshy-t2.5']);

async function key(){
 if(process.env.MESHY_API_KEY)return process.env.MESHY_API_KEY.trim();
 try{const text=await readFile(path.join(ROOT,'.cache','meshy.env'),'utf8');const found=/^MESHY_API_KEY=(.+)$/m.exec(text);if(found)return found[1].trim();}catch{/* told below */}
 throw new Error('No key: set MESHY_API_KEY or put MESHY_API_KEY=... in .cache/meshy.env');
}
// One HTTPS request; follows redirects (the download links do). Resolves {status, body: Buffer}.
function request(method,url,headers={},body=null,hops=0){
 return new Promise((resolve,reject)=>{
  const data=body?Buffer.from(body):null;
  const req=https.request(url,{method,headers:{...headers,...(data?{'Content-Length':data.length}:{})}},res=>{
   if([301,302,303,307,308].includes(res.statusCode)&&res.headers.location&&hops<5){res.resume();resolve(request('GET',new URL(res.headers.location,url).href,{},null,hops+1));return;}
   const parts=[];res.on('data',part=>parts.push(part));res.on('end',()=>resolve({status:res.statusCode,body:Buffer.concat(parts)}));res.on('error',reject);
  });
  req.on('error',reject);req.setTimeout(120000,()=>req.destroy(new Error('timeout')));if(data)req.write(data);req.end();
 });
}
async function call(method,route,body){
 const response=await request(method,API+route,{Authorization:'Bearer '+await key(),...(body?{'Content-Type':'application/json'}:{})},body?JSON.stringify(body):null);
 const text=response.body.toString('utf8');let data=null;try{data=JSON.parse(text);}catch{/* not JSON */}
 if(response.status<200||response.status>=300)throw new Error(`${method} ${route} -> ${response.status} ${text.slice(0,400)}`);
 return data??text;
}
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function follow(id,label,route='/v2/text-to-3d/'){
 let last=-1;
 for(;;){
  const task=await call('GET',route+id);
  if(task.progress!==last){last=task.progress;console.log(`  ${label}: ${task.status} ${task.progress??0}%`);}
  if(task.status==='SUCCEEDED')return task;
  if(task.status==='FAILED'||task.status==='CANCELED')throw new Error(`${label} ${task.status}: ${JSON.stringify(task.task_error??{})}`);
  await wait(4000);
 }
}
async function save(url,file){
 const response=await request('GET',url);if(response.status!==200)throw new Error('download '+response.status+' '+file);
 await writeFile(file,response.body);console.log('  saved',path.relative(ROOT,file));
}
function options(list){
 const out={_:[]};
 for(let i=0;i<list.length;i++){const item=list[i];
  if(!item.startsWith('--')){out._.push(item);continue;}
  const name=item.slice(2);if(name==='pbr'||name==='no-texture'||name==='force'){out[name]=true;continue;}
  out[name]=list[++i];}
 return out;
}

const MIME={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'};
// A local picture as a data URI (the API takes a public URL or this).
async function picture(file){
 const full=path.isAbsolute(file)?file:[path.resolve(file),path.join(ROOT,file)].find(candidate=>existsSync(candidate))??path.resolve(file);
 const type=MIME[path.extname(full).toLowerCase()];if(!type)throw new Error('picture must be png, jpg or webp: '+file);
 return `data:${type};base64,${(await readFile(full)).toString('base64')}`;
}
const folderOf=name=>path.join(ROOT,'.cache','meshy',name);
const clean=name=>(name??'model-'+Date.now()).replace(/[^a-z0-9-_]/gi,'-');
async function collect(task,folder,record){
 if(task.model_urls?.glb)await save(task.model_urls.glb,path.join(folder,'model.glb'));
 if(task.thumbnail_url)await save(task.thumbnail_url,path.join(folder,'thumbnail.png')).catch(error=>console.log('  thumbnail skipped',error.message));
 const maps=Array.isArray(task.texture_urls)?task.texture_urls[0]:task.texture_urls;
 for(const [kind,url] of Object.entries(maps??{}))if(url)await save(url,path.join(folder,kind+'.png')).catch(error=>console.log('  '+kind+' skipped',error.message));
 await writeFile(path.join(folder,'task.json'),JSON.stringify(record,null,1));
}
// A model from a reference picture (shape and paint in one task).
async function image(args){
 const file=args.image??args._[0];if(!file)throw new Error('image <picture file> --name <folder>');
 const name=clean(args.name),model=args.model??'meshy-t2.5',folder=folderOf(name);await mkdir(folder,{recursive:true});
 const body={image_url:await picture(file),ai_model:model,should_texture:!args['no-texture'],target_formats:['glb']};
 if(SMART.has(model)){body.model_type='smart-topology';body.target_polycount=Number(args.poly??4000);}
 else if(args.poly){body.should_remesh=true;body.target_polycount=Number(args.poly);}
 if(body.should_texture){
  if(args.texmodel)body.texture_model=args.texmodel;if(args.pbr)body.enable_pbr=true;
  if(args.texture)body.texture_prompt=args.texture;else if(args['texture-image'])body.texture_image_url=await picture(args['texture-image']);
 }
 console.log(`[1/1] from picture ${path.basename(file)} (${model}${body.target_polycount?', '+body.target_polycount+' faces':''}${body.texture_model?', paint '+body.texture_model:''})`);
 const id=(await call('POST','/v1/image-to-3d',body)).result,task=await follow(id,'model','/v1/image-to-3d/');
 const record={name,image:file,model,task:{id,credits:task.consumed_credits??null}};
 await collect(task,folder,record);console.log('done:',path.relative(ROOT,folder),'credits',record.task.credits??'?');return record.task.credits??0;
}
// Every job of a list, one after another; a job whose folder already holds a model is skipped.
async function run(args){
 const file=args._[0]??path.join(ROOT,'ArcherPreview','scripts','meshy-jobs.json'),jobs=JSON.parse(await readFile(file,'utf8'));let spent=0,made=0;
 for(const job of jobs){
  const name=clean(job.name);
  if(!args.force&&existsSync(path.join(folderOf(name),'model.glb'))){console.log('skip (already made):',name);continue;}
  console.log('\n=== '+name+' ===');
  try{spent+=await (job.image?image({...job,_:[]}):text({...job,_:[job.prompt]}));made++;}catch(error){console.log('  failed:',error.message);}
 }
 console.log(`\nfinished: ${made} made, about ${spent} credits`);
}
async function text(args){
 const prompt=args._[0];if(!prompt)throw new Error('text "<what to make>" --name <folder>');
 const name=clean(args.name),model=args.model??'meshy-t2.5',folder=folderOf(name);
 await mkdir(folder,{recursive:true});
 const preview={mode:'preview',prompt,ai_model:model,target_formats:['glb']};
 if(SMART.has(model)){preview.model_type='smart-topology';preview.target_polycount=Number(args.poly??4000);}
 else if(args.poly){preview.should_remesh=true;preview.target_polycount=Number(args.poly);}
 console.log(`[1/2] shape (${model}${preview.target_polycount?', '+preview.target_polycount+' faces':''})`);
 const shapeId=(await call('POST','/v2/text-to-3d',preview)).result;let task=await follow(shapeId,'shape');
 const record={name,prompt,model,shape:{id:shapeId,credits:task.consumed_credits??null}};
 if(!args['no-texture']){
  const refine={mode:'refine',preview_task_id:shapeId,ai_model:args.texmodel??'latest',enable_pbr:!!args.pbr,texture_resolution:'2k',target_formats:['glb']};
  if(args.texture)refine.texture_prompt=args.texture;else if(args['texture-image'])refine.texture_image_url=await picture(args['texture-image']);
  console.log(`[2/2] texture (${refine.ai_model}${refine.enable_pbr?', PBR':''})`);
  try{const paintId=(await call('POST','/v2/text-to-3d',refine)).result;task=await follow(paintId,'texture');record.texture={id:paintId,model:refine.ai_model,credits:task.consumed_credits??null};}
  catch(error){console.log('  texture step failed, keeping the untextured shape:',error.message);record.textureError=error.message;}
 }
 await collect(task,folder,record);
 console.log('done:',path.relative(ROOT,folder),'credits',(record.shape.credits??'?')+' + '+(record.texture?.credits??0));
 return (record.shape.credits??0)+(record.texture?.credits??0);
}

const [command,...rest]=process.argv.slice(2),args=options(rest);
try{
 if(command==='balance')console.log(await call('GET','/v1/balance'));
 else if(command==='status')console.log(JSON.stringify(await call('GET','/v2/text-to-3d/'+args._[0]),null,1));
 else if(command==='text')await text(args);
 else if(command==='image')await image(args);
 else if(command==='run')await run(args);
 else console.log('usage: meshy.mjs balance | run [jobs.json] | text "<prompt>" --name <folder> | image <picture> --name <folder> | status <id>   (options: --poly N --model M --texture "<prompt>" --texture-image <file> --texmodel M --pbr --no-texture)');
}catch(error){console.error('Meshy:',error.message);process.exitCode=1;}
