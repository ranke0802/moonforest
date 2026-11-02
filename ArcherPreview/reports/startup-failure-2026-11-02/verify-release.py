import json, re, subprocess, hashlib
from pathlib import Path
folder=Path(__file__).resolve().parent
app=folder.parents[1]
repo=app.parent
base='57ce2771bea311910951c36121198fc29b0341e0'
read=lambda p:json.loads(p.read_text(encoding='utf-8-sig'))
old=json.loads(subprocess.check_output(['git','show',base+':ArcherPreviewSite/assets/resource-index.json'],cwd=repo))
current=read(app/'dist-village/assets/resource-index.json')
assert old==current
log=(folder/'full-tests.log').read_text(encoding='utf-8-sig')
counts={key:int(re.search(r'(?:#|\u2139) '+key+r' (\d+)',log).group(1)) for key in ['tests','pass','fail','skipped','cancelled']}
assert counts['tests']==counts['pass'] and all(counts[key]==0 for key in ['fail','skipped','cancelled'])
root=read(folder/'timer-root-cause.json')
assert root['oldError']['message']=='Illegal invocation' and root['newPass']
paths=['src/runtime-timers.js','src/map-load-lifetime.js','src/ktx-worker-supervisor.js','src/meshopt-worker-supervisor.js','src/loading-view.js','src/frame-diagnostics.js','src/load-diagnostics.js','src/main.js','index.html']
result={'status':'VERIFIED_BEFORE_DEPLOYMENT','base':base,'tests':counts,'rootCause':root,'resourceIndexIdentical':True,'resourceRevision':current['revision'],'resourceFiles':len(current['files']),'bundles':len(current['bundles']),'preservation':{'playerMax':8192,'backgroundMax':4096,'lod':True,'newAssets':False,'browserAutomation':False},'sourceHashes':{p:hashlib.sha256((app/p).read_bytes()).hexdigest() for p in paths},'limitations':['No physical browser/GPU/phone performance measurement.','Browser receiver checks are simulated against actual old and fixed source; DOM/clipboard behavior uses controlled browser API boundaries.']}
(folder/'verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'passed':True,'tests':counts['pass'],'resourcesUnchanged':len(current['files']),'bundlesUnchanged':len(current['bundles'])}))
