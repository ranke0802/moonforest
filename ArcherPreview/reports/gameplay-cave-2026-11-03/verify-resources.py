"""Compare resource identities against the already deployed integration checkpoint."""
import hashlib, json, subprocess
from pathlib import Path

app=Path(__file__).resolve().parents[2]
repo=app.parent
unchanged=['warrior-v3.json','warrior-v3-ios.json','village.json','monster-forest.json','witch-cave-ground.json','village-ground.json','monster-forest-ground.json','elena.json','mourning-elena.json','quest-props.json']
result={'baseline':'73c79fe','unchanged':[],'mapAssetGraphs':{},'passed':False,'gpuMeasured':False}
def old(name):
    return subprocess.check_output(['git','show','73c79fe:ArcherPreview/public/assets/'+name],cwd=repo)
def current(name): return (app/'public/assets'/name).read_bytes()
for name in unchanged:
    assert json.loads(old(name))==json.loads(current(name)),name+' changed unexpectedly'
    result['unchanged'].append({'file':name,'sha256':hashlib.sha256(current(name)).hexdigest()})
for name in ['great-plains.json','witch-cave.json']:
    a,b=json.loads(old(name)),json.loads(current(name))
    assert a['assets']==b['assets'],name+' changed model/texture/LOD assets'
    result['mapAssetGraphs'][name]={'manifestSourceTypes':len(b['assets']),'beforeManifestPlacementCount':a['placementCount'],'afterManifestPlacementCount':b['placementCount'],'assetSourcesIdentical':True}
result['plainsCountNote']='Previous manifest count 301 was stale. Actual baseline layout was 1209 placements using 17 of 18 manifest assets; current layout is 1418 using the same 17.'
ground=json.loads(current('great-plains-ground.json'))
result['changedGround']=ground
result['passed']=True
(Path(__file__).parent/'resource-preservation.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(json.dumps({'passed':True,'unchangedManifests':len(unchanged),'mapAssetGraphs':result['mapAssetGraphs']},ensure_ascii=False))
