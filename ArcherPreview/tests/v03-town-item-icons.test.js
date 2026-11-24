import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'vite';
import {TOWN_ITEMS} from '../src/v03/town-items.js';

const project=fileURLToPath(new URL('../',import.meta.url));
const ids=Object.keys(TOWN_ITEMS);
const cols=8,rows=Math.ceil(ids.length/cols),cell=128;

test('each town item has its own equally sized cell in one WebP with an alpha channel',async()=>{
 const [css,webp]=await Promise.all([
  readFile(resolve(project,'src/v03/town-item-icons.css'),'utf8'),
  readFile(resolve(project,'src/v03/art/town-item-icons.webp')),
 ]);
 assert.equal(webp.toString('ascii',0,4),'RIFF');assert.equal(webp.toString('ascii',8,12),'WEBP');
 assert.equal(webp.toString('ascii',12,16),'VP8X');assert.ok(webp[20]&0x10,'WebP alpha flag');
 assert.equal(webp.readUIntLE(24,3)+1,cols*cell);assert.equal(webp.readUIntLE(27,3)+1,rows*cell);
 assert.ok(css.includes('background-size: '+100*cols+'% '+100*rows+'%'));
 const entries=[...css.matchAll(/\[data-item-icon="([^"]+)"\] \{ --mf-item-x: ([\d.]+)%; --mf-item-y: ([\d.]+)%; \}/g)];
 assert.deepEqual(entries.map(entry=>entry[1]),ids,'one sprite for every catalog id in order');
 for(const [i,entry] of entries.entries()){
  assert.ok(Math.abs(Number(entry[2])-100*(i%cols)/(cols-1))<.000001,entry[1]+' column');
  assert.ok(Math.abs(Number(entry[3])-100*Math.floor(i/cols)/(rows-1))<.000001,entry[1]+' row');
 }
});

test('the shipped 0.3 entry emits the atlas once and has no initial image or stylesheet request for it',async()=>{
 const main='moonforest-0.3.html';
 const result=await build({root:project,publicDir:false,logLevel:'error',build:{
  write:false,copyPublicDir:false,manifest:true,rolldownOptions:{input:resolve(project,main)},
 }});
 const output=result.output,manifest=JSON.parse(output.find(file=>file.fileName.endsWith('/manifest.json')).source);
 const art=output.filter(file=>file.fileName.endsWith('.webp')&&file.fileName.split('/').pop().startsWith('town-item-icons-'));
 assert.equal(art.length,1,'one emitted WebP shared by both UI entry points');
 const basename=file=>file.split('/').pop();
 const styles=output.filter(file=>file.fileName.endsWith('.css')&&String(file.source).includes(basename(art[0].fileName)));
 assert.equal(styles.length,1,'one separately loaded stylesheet points at the emitted WebP');
 const targets=new Set([styles[0].fileName,art[0].fileName]);
 const html=String(output.find(file=>file.fileName===main).source);
 for(const file of targets)assert.ok(!html.includes(basename(file)),'HTML must not preload '+file);
 const visited=new Set();
 function initial(key){
  if(visited.has(key))return;visited.add(key);
  const entry=manifest[key];assert.ok(entry,key);
  for(const file of [entry.file,...entry.css??[],...entry.assets??[]])assert.ok(!targets.has(file),'eager request: '+file);
  for(const imported of entry.imports??[])initial(imported);
 }
 initial(main);
 // main.js also enters the release shell asynchronously on every 0.3 launch.
 // Counting only HTML's static graph would miss eager CSS from that second entry.
 const startup=['/src/main.js','/src/v03/boot.js','/src/v03/story.js','/src/v03/town-services.js'];
 for(const moduleSuffix of startup){
  const chunk=output.find(file=>file.type==='chunk'&&Object.keys(file.modules).some(id=>id.replaceAll('\\','/').endsWith(moduleSuffix)));
  assert.ok(chunk,moduleSuffix);
  const entry=Object.keys(manifest).find(key=>manifest[key].file===chunk.fileName);assert.ok(entry,chunk.fileName);
  initial(entry);
 }
});
