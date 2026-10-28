import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'vite';
import {createHash} from 'node:crypto';
test('a UI-only update retains byte-identical engine chunks and their cache URLs without circular app imports',async()=>{
 const compile=async changed=>{
  const result=await build({root:new URL('../',import.meta.url).pathname.replace(/^\/(\w:)/,'$1'),publicDir:false,logLevel:'silent',plugins:changed?[{name:'ui-only-test',transform(code,id){if(id.replaceAll('\\','/').endsWith('/src/main.js'))return code+'\nconsole.info("cache-stability-test-only");';}}]:[],build:{write:false}});
  return result.output.filter(c=>c.type==='chunk');
 };
 const before=await compile(false),after=await compile(true),vendors=before.filter(c=>c.name.startsWith('babylon'));
 assert.ok(vendors.length>0);assert.ok(before.find(c=>c.name==='index').fileName!==after.find(c=>c.name==='index').fileName);
 for(const c of vendors){const same=after.find(a=>a.fileName===c.fileName);assert.ok(same,'unchanged URL '+c.fileName);assert.equal(createHash('sha256').update(c.code).digest('hex'),createHash('sha256').update(same.code).digest('hex'));assert.ok(!c.imports.includes(before.find(c=>c.name==='index').fileName));}
});
