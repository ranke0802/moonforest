import json, hashlib, subprocess, re
from pathlib import Path
app=Path(__file__).resolve().parents[2];repo=app.parent;out=Path(__file__).parent
before=json.loads(subprocess.check_output(['git','show','HEAD:ArcherPreviewSite/deployment-files.json'],cwd=repo))
after=json.loads((repo/'ArcherPreviewSite/deployment-files.json').read_text(encoding='utf-8'))
old={f['path']:f for f in before['files']};new={f['path']:f for f in after['files']}
applied=json.loads((out/'applied-files.json').read_text(encoding='utf-8'))
allowed={p.replace('ArcherPreview/public/','') for p in applied['paths']}
allowed.update(['assets/resource-index.json','assets/resource-sizes.json','index.html'])
changed=[p for p in new if old.get(p)!=new[p]]
for p in changed:
    assert p in allowed or p.startswith('assets/index-') or p.startswith('assets/bundles/'),p
for p,row in new.items():
    b=(repo/'ArcherPreviewSite'/p).read_bytes()
    assert len(b)==row['bytes'] and hashlib.sha256(b).hexdigest()==row['sha256'],p
for p in ['assets/mourning-elena.json','assets/village.json','assets/monster-forest.json','assets/witch-cave.json']:
    assert new[p]==old[p],p
assert all(new.get(p)==v for p,v in old.items() if p.endswith('.ktx2'))
assert not any(p.endswith(applied['sourceBefore'].split('/')[-1]) for p in new)
log=(out/'all-tests.log').read_text(encoding='utf-8-sig')
assert re.search(r'\b(?:fail) 0\b',log)
total=int(re.search(r'\btests (\d+)\b',log).group(1));passed=int(re.search(r'\bpass (\d+)\b',log).group(1));assert total==passed and total>=1117
size=json.loads((out/'size-comparison.json').read_text(encoding='utf8'))
result={'baseline':subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip(),'tests':{'total':total,'passed':passed},'changedFiles':changed,'verifiedDeploymentFiles':len(new),'resourceRevision':after['resourceRevision'],'oldModelExcluded':True,'allKtx2Unchanged':True,'mourningVillageForestCaveManifestsUnchanged':True,'player8KBackground4KExistingLodPreserved':True,'browserAutomation':False,'physicalDeviceTested':False,**size}
(out/'validation-summary.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
sources=['README.md','tests/elena-lossless-weld.test.js','tests/elena-model-performance.test.js','tests/elena.test.js','tests/saint-reviewed-assets.test.js','tests/fixtures/saint-reviewed-retained.u32','scripts/apply-saint-reviewed.mjs','scripts/review-saint-50k.mjs','scripts/validate-saint-50k.mjs','scripts/render-saint-50k.py','scripts/compose-saint-50k-review.py','scripts/prepare-download-bundles.mjs','public/assets/resource-sizes.json']
reports=['candidate-report.json','manifest-before.json','applied-files.json','validation-summary.json','size-comparison.json','verify-release.py','verify-live.py']
paths=applied['paths']+['ArcherPreview/'+p for p in sources]+['ArcherPreview/reports/saint-50k-2026-11-02/'+p for p in reports]+(app/'reports/publish-village-paths.txt').read_text(encoding='utf-8-sig').strip().splitlines()
paths=list(dict.fromkeys(paths));(out/'staged-paths.json').write_text(json.dumps(paths,indent=2),encoding='utf-8')
subprocess.run(['git','add','--',*paths],cwd=repo,check=True)
print(json.dumps({'verifiedFiles':len(new),'stagedPaths':len(paths),'changedFiles':len(changed),'tests':passed,'resourceRevision':after['resourceRevision']}))
