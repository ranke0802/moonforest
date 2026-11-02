"""Review the built release without starting or controlling a browser."""
import hashlib, json, re, subprocess
from pathlib import Path

folder = Path(__file__).resolve().parent
app, repo = folder.parents[1], folder.parents[2]
base = '82b0d0267c115bc447674c86b4a17d0aac3c6bc7'
read = lambda path: json.loads(path.read_text(encoding='utf-8-sig'))
old = json.loads(subprocess.check_output(['git','show',base+':ArcherPreviewSite/assets/resource-index.json'],cwd=repo))
current = read(app/'dist-village/assets/resource-index.json')
assert current == old, 'Resource graph changed unexpectedly'
log = (folder/'full-tests.log').read_text(encoding='utf-8-sig')
counts = {label:int(re.search(r'(?:#|\u2139) '+label+r' (\d+)',log).group(1)) for label in ['tests','pass','fail','cancelled','skipped']}
assert counts['tests'] == counts['pass'] and not any(counts[key] for key in ['fail','cancelled','skipped'])
for name in ['three-way-validation.json','decoder-repeat-validation.json']:
    assert read(folder/name)['passed'], name
assert read(folder/'main-summary.json')['status'] == 'PASS'
assert read(folder/'navigation-comparison.json')['status'] == 'PASS'
player = read(app/'public/assets/warrior-v3-ios.json')
assert player['textureProfile']['maxSize'] == 8192
files = current['files']
source = ['src/main.js','src/world.js','src/map-navigation-cache.js']
result = {
    'status':'VERIFIED_BEFORE_SYNC','baseRevision':base,
    'tests':{'total':counts['tests'],'passed':counts['pass'],'failed':counts['fail'],'cancelled':counts['cancelled'],'skipped':counts['skipped']},
    'resourceRevision':current['revision'],'resourceIndexIdentical':True,
    'resourceFiles':len(files),'bundles':len(current['bundles']),
    'sourceHashes':{path:hashlib.sha256((app/path).read_bytes()).hexdigest() for path in source},
    'preservation':{'playerMax':8192,'backgroundMax':4096,'lod':True,'newAssetGeneration':False,'browserAutomation':False},
    'navigation':read(folder/'navigation-comparison.json'),
    'mainRepetitions':read(folder/'main-summary.json')['repetitions'],
    'physicalMobileTested':False,
    'limitations':['CPU timings are local Node/NullEngine measurements, not total phone loading times.','Images, WebGL shader compilation and physical GPU memory/thermals are excluded from the loader repeat fixture.','Encoded navigation payload is bounded to512KiB; small JS metadata overhead is additional.','Existing8MiB geometry budget still causes some three-map redecodes; GPU maps are not kept resident.']
}
(folder/'verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'passed':True,'tests':counts['pass'],'resourceFiles':len(files),'bundles':len(current['bundles']),'resourceRevisionUnchanged':True}))
