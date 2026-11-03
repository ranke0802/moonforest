"""Stage the loading-screen implementation and exact verified publish graph."""
import hashlib,json,subprocess
from pathlib import Path
app=Path(__file__).resolve().parents[2];repo=app.parent;report=Path(__file__).parent
source='''index.html
src/loading-art.js
src/loading-view.js
src/main.js
src/map-departure.js
src/map-transition.js
src/scene-ready.js
src/startup-resources.js
scripts/pack-map-loading-art.py
tests/cave-portal-facing.test.js
tests/boss-settings-lifecycle.test.js
tests/player-resource-lifecycle.test.js
tests/resource-downloads.test.js
tests/loading-position.test.js
tests/startup-frame-failure.test.js
tests/map-loading-art-flow.test.js
tests/map-loading-art-cache.test.js
public/assets/map-loading-art.json
public/assets/resource-sizes.json'''.splitlines()
evidence=['art-validation.json','independent-flow-validation.json','cache-validation.json','full-tests.log','fixture-recheck.log','validation-summary.json','stage-reviewed.py','verify-staged.py','verify-live.py']
paths=['ArcherPreview/'+p for p in source]
paths += [(report/p).relative_to(repo).as_posix() for p in evidence]
paths += (app/'reports/publish-village-paths.txt').read_text().splitlines()
manifest=json.loads((repo/'ArcherPreviewSite/deployment-files.json').read_text())
for item in manifest['files']:
    if item['path'].startswith('assets/content/'):
        file=app/'public'/item['path']
        assert hashlib.sha256(file.read_bytes()).hexdigest()==item['sha256'],item['path']
        paths.append(file.relative_to(repo).as_posix())
paths=sorted(set(paths));assert all((repo/p).is_file() for p in paths)
for i in range(0,len(paths),40):subprocess.run(['git','add','-f','--',*paths[i:i+40]],cwd=repo,check=True)
actual=subprocess.check_output(['git','diff','--cached','--name-only'],cwd=repo,text=True).splitlines()
assert set(actual)<=set(paths),'Unreviewed staged paths'
(report/'staged-paths.json').write_text(json.dumps(actual,indent=2)+'\n')
print(json.dumps({'reviewedPaths':len(actual)}))
