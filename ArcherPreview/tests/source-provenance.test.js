import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {captureSourceProvenance,verifySourceProvenance,SOURCE_ENTRY_FILES} from '../scripts/source-provenance.mjs';

async function fixture(){
 const root=await mkdtemp(join(tmpdir(),'moonforest-source-'));
 for(const path of ['ArcherPreview/src','ArcherPreview/scripts'])await mkdir(join(root,path),{recursive:true});
 for(const path of [...SOURCE_ENTRY_FILES,'ArcherPreview/src/main.js'])await writeFile(join(root,path),'approved\r\n');
 return root;
}
async function cleanup(root){assert.ok(resolve(root).startsWith(resolve(tmpdir(),'moonforest-source-')));await rm(root,{recursive:true,force:true});}
test('review provenance survives Windows/Linux line endings but rejects runtime edits and new files',async()=>{
 const root=await fixture();try{
  const record=await captureSourceProvenance(root);assert.equal(record.files.length,SOURCE_ENTRY_FILES.length+1);
  await writeFile(join(root,'ArcherPreview/src/main.js'),'approved\n');
  assert.equal((await verifySourceProvenance(root,record)).fingerprint,record.fingerprint);
  await writeFile(join(root,'ArcherPreview/src/new.js'),'new module');
  await assert.rejects(verifySourceProvenance(root,record),/new.js/);
  await rm(join(root,'ArcherPreview/src/new.js'));
  await writeFile(join(root,'ArcherPreview/src/main.js'),'unreviewed');
  await assert.rejects(verifySourceProvenance(root,record),/main.js/);
 }finally{await cleanup(root);}
});
test('a modified provenance list is rejected; reports and optional authoring inputs do not invalidate the runtime build',async()=>{
 const root=await fixture();try{
  const record=await captureSourceProvenance(root);
  await mkdir(join(root,'Docs'),{recursive:true});await writeFile(join(root,'Docs/report.html'),'report');
  await writeFile(join(root,'ArcherPreview/scripts/optional-historical-review.mjs'),'optional authoring reference');
  await verifySourceProvenance(root,record);
  const changed=structuredClone(record);changed.files[0].sha256='a'.repeat(64);
  await assert.rejects(verifySourceProvenance(root,changed),/Invalid source provenance/);
 }finally{await cleanup(root);}
});
