"""Stage reviewed continuity changes and only the exact reachable publish graph."""
import hashlib,json,subprocess
from pathlib import Path
app=Path(__file__).resolve().parents[2];repo=app.parent;report=Path(__file__).parent
source='''src/chapter-quest-points.js
src/great-plains-layout.js
src/great-plains-terrain.js
src/main.js
src/terrain-mesh.js
src/village-plains-handoff.js
src/village-streamed-environment.js
src/world.js
src/plains-boundary-atmosphere.js
src/plains-forest-boundary.js
src/plains-forest-edge.js
src/village-outskirts-skirt.js
src/village-plains-outskirts-ground.js
src/village-plains-outskirts.js
scripts/bake-great-plains-ground.py
scripts/build-plains-forest-edge.mjs
scripts/build-village-plains-outskirts.mjs
tests/camera-follow-lifecycle.test.js
tests/cave-portal-facing.test.js
tests/chest-placement-context.test.js
tests/great-plains.test.js
tests/ios-playback-recovery.test.js
tests/plains-landscape-render.test.js
tests/portal-polish.test.js
tests/startup-frame-failure.test.js
tests/village-plains-handoff.test.js
tests/plains-boundary-atmosphere.test.js
tests/plains-two-boundary-regression.test.js
tests/village-plains-outskirts-ground.test.js
tests/village-plains-outskirts.test.js
public/assets/great-plains-ground.json
public/assets/great-plains.json
public/assets/village-plains-outskirts.json
public/assets/resource-sizes.json'''.splitlines()
evidence='''final-tests.log
portal-recheck.log
outskirts-final-review.json
outskirts-native-shader-validation.json
outskirts-cost.json
forest-baseline.json
stage-reviewed.py
verify-staged.py
verify-live.py'''.splitlines()
followup='''boundary-cases.mjs
baseline-summary.json
review-plan.json
review-validation.json
export-review.mjs
render-review.py
write-validation.mjs'''.splitlines()
paths=['ArcherPreview/'+p for p in source]
paths += [(report/p).relative_to(repo).as_posix() for p in evidence]
paths += ['ArcherPreview/reports/plains-boundary-followup-2026-11-03/'+p for p in followup]
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
