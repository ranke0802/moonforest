import json,hashlib,subprocess
from pathlib import Path
app=Path(__file__).resolve().parents[2];repo=app.parent;out=Path(__file__).parent
before=json.loads(subprocess.check_output(['git','show','HEAD:ArcherPreviewSite/deployment-files.json'],cwd=repo));after=json.loads((repo/'ArcherPreviewSite/deployment-files.json').read_text(encoding='utf-8'))
old={f['path']:f for f in before['files']};new={f['path']:f for f in after['files']}
changed=[p for p in new if old.get(p)!=new[p]]
for p in changed:
    assert p in ['assets/mourning-elena.json','assets/resource-index.json','assets/resource-sizes.json','index.html'] or p.startswith('assets/index-') or p.startswith('assets/bundles/') or p in ['assets/content/5630d193b2dffc993cb3216c8f0c2483b996a72774b74d634f637376db2407ff.gltf','assets/content/e1f363e87344cf26f53f6a8b6ae448b9a70b810798c259b632c9a46ad2146793.bin'],p
for p,row in new.items():
    b=(repo/'ArcherPreviewSite'/p).read_bytes();assert len(b)==row['bytes'] and hashlib.sha256(b).hexdigest()==row['sha256'],p
for p in ['assets/elena.json','assets/village.json','assets/monster-forest.json','assets/witch-cave.json']:
    assert new[p]==old[p],p
assert all(new.get(p)==v for p,v in old.items() if p.endswith('.ktx2'))
assert not any(p.endswith('10eb3c62c2f2cc308a19bd211e774dc083e20de6f2e0e1782eeb948dc87d6a44.gltf') for p in new)
assert 'pass 1114' in (out/'all-tests.log').read_text(encoding='utf-8-sig')
assert 'fail 0' in (out/'culling-tests.log').read_text(encoding='utf-8-sig')
result={'baseline':subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip(),'tests':{'total':1115,'passedAfterCorrectedVertexCountAssertion':1115,'initialFailures':1,'initialFailure':'Old culling audit assumed 68 million vertices; coverage remains every vertex over the same 724 poses.','cullingRerunPassed':5},'changedFiles':changed,'verifiedDeploymentFiles':len(new),'resourceRevision':after['resourceRevision'],'oldModelExcluded':True,'allKtx2Unchanged':True,'saintVillageForestCaveManifestsUnchanged':True,'player8KBackground4KExistingLodPreserved':True,'browserAutomation':False,'physicalDeviceTested':False,'triangleReduction':{'before':143228,'after':49982},'morphMemoryEstimateBytes':{'before':31728384,'after':12985088}}
(out/'validation-summary.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
applied=json.loads((out/'applied-files.json').read_text(encoding='utf-8'))['paths']
sources=['README.md','src/mourning-cave-clearance-data.js','tests/character-render-cost.test.js','tests/elena-model-performance.test.js','tests/mourning-camera-culling.test.js','tests/mourning-r9-assets.test.js','tests/mourning-variants.test.js','tests/mourning-50k-assets.test.js','tests/helpers/mourning-50k.js','tests/fixtures/mourning-50k-retained.u32','scripts/apply-mourning-50k.mjs','scripts/review-mourning-50k.mjs','scripts/validate-mourning-50k.mjs','scripts/render-mourning-50k.py','scripts/compose-mourning-50k-review.py']
reports=['candidate-report.json','manifest-before.json','applied-files.json','validation-summary.json','verify-release.py']
paths=applied+['ArcherPreview/'+p for p in sources]+['ArcherPreview/reports/mourning-50k-2026-11-02/'+p for p in reports]+(app/'reports/publish-village-paths.txt').read_text(encoding='utf-8-sig').strip().splitlines()
paths=list(dict.fromkeys(paths));(out/'staged-paths.json').write_text(json.dumps(paths,indent=2),encoding='utf-8')
subprocess.run(['git','add','--',*paths],cwd=repo,check=True)
print(json.dumps({'verifiedFiles':len(new),'stagedPaths':len(paths),'changedFiles':len(changed),'resourceRevision':after['resourceRevision']}))
