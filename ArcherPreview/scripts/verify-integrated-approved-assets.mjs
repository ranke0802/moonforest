import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {projectRoot,sourcePath} from '../../Sources/resolve-source.mjs';

const root=projectRoot,read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const approval=read(sourcePath('approved-review-r2-2026-11-09','approval.json'));
const planBytes=fs.readFileSync(sourcePath('village-exterior-shell-review','runtime','plan.json'));
assert.equal(sha(planBytes),'1e632a699678042941b62f2aa80d582f2fea94d8d015dfc983ed736044602cfd');
const exterior=JSON.parse(planBytes),checks=[];
for(const base of approval.beforeManifests){
 const bytes=fs.readFileSync(sourcePath(base.sourceId));assert.equal(sha(bytes),base.sha256);
 const expected=JSON.parse(bytes);
 for(const asset of approval.assets){const entry=asset.applications.find(item=>item.manifest===base.manifest);if(!entry)continue;assert.deepEqual(expected.assets[asset.id],entry.beforeConfig);expected.assets[asset.id]=entry.afterConfig;}
 if(base.manifest===exterior.manifest){assert.deepEqual(expected.assets[exterior.assetId],exterior.beforeAsset);expected.assets[exterior.assetId]=exterior.afterAsset;}
 const currentPath=path.join(root,'ArcherPreview/public/assets',base.manifest),actual=read(currentPath);assert.deepEqual(actual,expected,'Unexpected manifest change: '+base.manifest);
 checks.push({manifest:base.manifest,sha256:sha(fs.readFileSync(currentPath)),onlyApprovedChanges:true});
}
assert.equal(checks.length,6);
const result={status:'passed',scope:'20 approved R2 assets and one approved exterior against six original manifest snapshots',manifests:checks,exteriorTriangles:44828,originalResourcesRetained:'not checked by this manifest comparison',browserAutomation:false};
const dir=path.join(root,'ArcherPreview/reports/approved-scenery-review-r2-2026-11-09');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'combined-manifest-validation.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({passed:true,manifests:checks.length}));
