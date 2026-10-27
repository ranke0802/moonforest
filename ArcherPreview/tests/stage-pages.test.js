import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {stagePages} from '../scripts/stage-pages.mjs';

test('Pages includes only the reviewed build and rejects altered resources',async()=>{
 const root=await mkdtemp(join(tmpdir(),'village-pages-'));
 try{
  const site=join(root,'ArcherPreviewSite');await mkdir(site);await writeFile(join(root,'index.html'),'redirect');
  const data=Buffer.from('approved');await writeFile(join(site,'index.html'),data);await writeFile(join(site,'old-source.glb'),'unreferenced');
  await writeFile(join(site,'deployment-files.json'),JSON.stringify({version:1,bytes:data.length,files:[{path:'index.html',bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')}]}));
  await stagePages(root,join(root,'published'));assert.equal(await readFile(join(root,'published/ArcherPreviewSite/index.html'),'utf8'),'approved');
  await assert.rejects(readFile(join(root,'published/ArcherPreviewSite/old-source.glb')),e=>e.code==='ENOENT');
  await writeFile(join(site,'index.html'),'tampered');await assert.rejects(stagePages(root,join(root,'second')),/differs/);
 }finally{assert.ok(root.startsWith(join(tmpdir(),'village-pages-')));await rm(root,{recursive:true,force:true});}
});
