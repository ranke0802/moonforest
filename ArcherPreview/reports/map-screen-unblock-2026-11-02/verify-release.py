import json, re, subprocess, hashlib
from pathlib import Path
folder=Path(__file__).resolve().parent
app=folder.parents[1]
repo=app.parent
base='f32eb853fd8d37b8c72ada8a306daf0683ee891c'
read=lambda p:json.loads(p.read_text(encoding='utf-8-sig'))
old=json.loads(subprocess.check_output(['git','show',base+':ArcherPreviewSite/assets/resource-index.json'],cwd=repo))
current=read(app/'dist-village/assets/resource-index.json')
assert old==current
log=(folder/'full-tests.log').read_text(encoding='utf-8-sig')
counts={key:int(re.search(r'(?:#|\u2139) '+key+r' (\d+)',log).group(1)) for key in ['tests','pass','fail','skipped','cancelled']}
assert counts['tests']==counts['pass'] and all(counts[key]==0 for key in ['fail','skipped','cancelled'])
before,after,screen=[read(folder/name) for name in ['before.json','after.json','screen-validation.json']]
assert before['before']['boundActualCaveMask'] and before['before']['ready']
assert all(not p['ready'] and p['retainsDisposedMask'] for p in before['after'])
assert all(p['ready'] and not p['retainsDisposedMask'] for p in after['after'])
assert screen['passed'] and len(screen['cases'])==5
copies={}
for name in ['main-validation','three-way-validation','decoder-repeat-validation']:
    data=read(app/('reports/map-warm-repeat-2026-11-02/'+name+'.json'))
    assert data['success' if name=='main-validation' else 'passed'] is True, name
    if 'expectedCases' in data:
        assert data['completedCases']==data['expectedCases'], name
    (folder/(name+'.json')).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    copies[name]={'passed':True,'path':name+'.json'}
paths=['src/cave-fog-runtime.js','src/map-transition.js','src/scene-ready.js','src/character-outlines.js']
result={'status':'VERIFIED_BEFORE_DEPLOYMENT','base':base,'tests':counts,'deviceEvidence':read(folder/'user-log-evidence.json'),'regression':{'originalReproduced':True,'fixedReady':True,'screenCases':5,'otherEvidence':copies},'resourceIndexIdentical':True,'resourceRevision':current['revision'],'resourceFiles':len(current['files']),'bundles':len(current['bundles']),'preservation':{'playerMax':8192,'backgroundMax':4096,'lod':True,'newAssets':False,'browserAutomation':False},'sourceHashes':{p:hashlib.sha256((app/p).read_bytes()).hexdigest() for p in paths},'limitations':['User-supplied failed transfer was desktop Chrome, not a new S23 measurement.','Actual SDK models, rig, outlines and lifecycle are exercised with NullEngine and controlled texture/GPU boundaries.','No physical browser/GPU/phone time or temperature measurement. The supplied successful pre-screen stages total1877.5ms; final patched device latency remains unmeasured.']}
(folder/'verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'passed':True,'tests':counts['pass'],'resourcesUnchanged':len(current['files']),'bundlesUnchanged':len(current['bundles'])}))
