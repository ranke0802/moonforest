import fs from 'node:fs';
import path from 'node:path';
import { splitGlb } from './resource-pack.js';
const root=path.resolve(import.meta.dirname,'../public/assets');
const files=[];
for(const [name,source] of [['guardian-bear',process.argv[2]],['hooded-goblin',path.resolve(import.meta.dirname,'../assets/models/hooded-goblin.glb')]]){
  const config=JSON.parse(fs.readFileSync(path.join(root,`${name}.json`)));
  const pack=splitGlb(fs.readFileSync(source),{baseColorOnly:true});
  for(const [file,value] of pack.files){const target=path.join(root,'content',file);if(!fs.existsSync(target)){fs.writeFileSync(target,value.data);files.push(target);}}
  config.model=`./content/${pack.model}`;config.resources=[...pack.files.keys()].map(file=>`./content/${file}`);config.resourceCacheVersion=1;
  const manifest=path.join(root,`${name}.json`);fs.writeFileSync(manifest,JSON.stringify(config,null,2)+'\n');files.push(manifest);
  console.log(name,config.model);
}
fs.writeFileSync(process.argv[3],JSON.stringify(files,null,2));
