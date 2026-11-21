// Encodes the actor and prop colour textures that still ship as JPG/PNG into KTX2 (UASTC + mipmaps).
// Run on Windows through Convert-Actor-KTX2.cmd: it needs the KTX-Software `ktx` tool (PATH or KTX_EXE)
// and PowerShell (to turn a JPG into a PNG without touching its pixels). It only writes into
// .cache/actor-ktx2; the game's assets are not changed here.
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,readdirSync,rmSync,statSync,writeFileSync} from 'node:fs';
import {basename,dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),assets=join(root,'public','assets'),out=resolve(root,'..','.cache','actor-ktx2');
const ktx=process.env.KTX_EXE||'ktx';
const say=text=>console.log(text);
const fail=text=>{console.error('\n[실패] '+text);process.exit(1);};
const sha=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const run=(file,args)=>execFileSync(file,args,{stdio:['ignore','pipe','pipe'],encoding:'utf8',windowsHide:true});

// Every colour image of these manifests' models. All of them are opaque base colours (checked 2026-11-21).
const other=[];
function images(){
  const jobs=new Map();
  const add=(label,gltf)=>{
    const json=JSON.parse(readFileSync(join(assets,gltf),'utf8')),colour=new Set();
    for(const material of json.materials??[])for(const slot of [material.pbrMetallicRoughness?.baseColorTexture,material.emissiveTexture])if(slot)colour.add(json.textures[slot.index].source);
    (json.images??[]).forEach((image,index)=>{
      if(!image.uri||/\.ktx2$/i.test(image.uri))return;
      const file=basename(image.uri);
      // Normal and data maps need linear settings: left as they are, and listed.
      if(!colour.has(index)){other.push({label,source:file,skipped:'색상 텍스처가 아님'});return;}
      if(!jobs.has(file))jobs.set(file,{label,file,source:join(assets,'content',file)});
    });
  };
  const models=resources=>resources.filter(path=>path.endsWith('.gltf')).map(path=>path.replace(/^\.\//,''));
  for(const name of readdirSync(assets).filter(name=>/^npc-moonforest-tripo-.*\.json$/.test(name)).sort()){
    const manifest=JSON.parse(readFileSync(join(assets,name),'utf8')),resources=manifest.resources??Object.values(manifest.assets??{}).flatMap(asset=>asset.resources??[]);
    for(const gltf of models(resources))add(name.replace(/^npc-moonforest-tripo-|\.json$/g,''),gltf);
  }
  const bear=JSON.parse(readFileSync(join(assets,'guardian-bear.json'),'utf8'));for(const gltf of models(bear.resources??[]))add('guardian-bear',gltf);
  const environment=JSON.parse(readFileSync(join(assets,'environment.json'),'utf8'));
  for(const key of ['grass-tuft','scarecrow'])for(const gltf of models(environment.assets[key].resources))add(key,gltf);
  return [...jobs.values()];
}

// PNG header: size and whether it carries alpha. Anything but 8-bit RGB/RGBA is refused.
function png(path){
  const data=readFileSync(path);
  if(data.readUInt32BE(0)!==0x89504e47)fail(path+' 는 PNG가 아닙니다.');
  const depth=data[24],type=data[25];
  if(depth!==8||(type!==2&&type!==6))fail(`${path}: 8비트 RGB/RGBA PNG만 다룹니다 (depth ${depth}, type ${type}).`);
  return {width:data.readUInt32BE(16),height:data.readUInt32BE(20),alpha:type===6};
}

try{say('ktx: '+run(ktx,['--version']).trim());}
catch{fail('ktx 도구를 찾지 못했습니다. KTX-Software(https://github.com/KhronosGroup/KTX-Software/releases)를 설치해 ktx.exe가 PATH에 있게 하거나,\n       환경 변수 KTX_EXE에 ktx.exe의 전체 경로를 넣고 다시 실행해 주세요.');}

mkdirSync(out,{recursive:true});
const jobs=images(),ledger={createdAt:new Date().toISOString(),ktx:run(ktx,['--version']).trim(),entries:[]};
const variants=[{name:'uastc',extra:[]},{name:'uastc-rdo',extra:['--uastc-rdo','--uastc-rdo-l','1','--uastc-rdo-d','4096','--uastc-rdo-m']}];
for(const variant of variants)mkdirSync(join(out,variant.name),{recursive:true});
say(`대상 ${jobs.length}장 → ${out}\n`);
for(const [index,job] of jobs.entries()){
  if(!existsSync(job.source))fail('원본이 없습니다: '+job.source);
  let input=job.source;
  if(!/\.png$/i.test(job.file)){
    // Same pixels, only the container changes (no drawing, no colour management).
    input=join(out,'encoder-input.png');rmSync(input,{force:true});
    const quote=text=>text.replace(/'/g,"''");
    try{run('powershell',['-NoProfile','-ExecutionPolicy','Bypass','-Command',`Add-Type -AssemblyName System.Drawing; $image=[System.Drawing.Image]::FromFile('${quote(job.source)}'); $image.Save('${quote(input)}',[System.Drawing.Imaging.ImageFormat]::Png); $image.Dispose()`]);}
    catch(error){fail(`${job.file}: PNG로 옮기지 못했습니다.\n${error.stderr||error.message}`);}
  }
  const info=png(input);
  const entry={label:job.label,source:job.file,sourceSha256:sha(job.source),sourceBytes:statSync(job.source).size,width:info.width,height:info.height,alpha:info.alpha,outputs:{}};
  if(info.width%4||info.height%4){entry.skipped='크기가 4의 배수가 아님';ledger.entries.push(entry);say(`${index+1}/${jobs.length} ${job.label} ${info.width}x${info.height} 건너뜀 (4의 배수가 아님)`);continue;}
  for(const variant of variants){
    const target=join(out,variant.name,job.file.replace(/\.[^.]+$/,'.ktx2'));rmSync(target,{force:true});
    const started=Date.now();
    try{
      run(ktx,['create','--format',info.alpha?'R8G8B8A8_SRGB':'R8G8B8_SRGB','--assign-tf','srgb','--assign-primaries','bt709','--assign-texcoord-origin','top-left','--generate-mipmap','--encode','uastc','--uastc-quality','2','--zstd','18',...variant.extra,input,target]);
      run(ktx,['validate',target]);
    }catch(error){fail(`${job.file} (${variant.name}): ktx가 실패했습니다.\n${error.stderr||error.stdout||error.message}`);}
    entry.outputs[variant.name]={file:variant.name+'/'+basename(target),bytes:statSync(target).size,sha256:sha(target)};
    say(`${index+1}/${jobs.length} ${job.label} ${info.width}x${info.height} ${variant.name} ${(statSync(target).size/1048576).toFixed(2)}MB (${((Date.now()-started)/1000).toFixed(1)}s)`);
  }
  ledger.entries.push(entry);
}
rmSync(join(out,'encoder-input.png'),{force:true});
ledger.entries.push(...other);
writeFileSync(join(out,'ledger.json'),JSON.stringify(ledger,null,1));
say(`\n끝났습니다. ${ledger.entries.filter(entry=>!entry.skipped).length}장 변환, ${ledger.entries.filter(entry=>entry.skipped).length}장 건너뜀.\n결과: ${out}\nClaude에게 "변환 끝"이라고 알려 주세요.`);
