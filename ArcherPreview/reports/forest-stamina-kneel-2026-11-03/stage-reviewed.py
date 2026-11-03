"""Stage the reviewed follow-up and the exact reachable published assets only."""
import hashlib,json,subprocess
from pathlib import Path
app=Path(__file__).resolve().parents[2];repo=app.parent;report=Path(__file__).parent
source='''src/main.js
src/warrior-v2.js
src/stamina-feedback.js
src/scene-ready.js
src/boss-shader-warmup.js
src/overlay-readiness.js
src/great-plains-layout.js
src/plains-tree-transition.js
src/mourning-elena-animation.js
src/mourning-elena-encounter.js
src/mourning-death-depth.js
src/mourning-death-depth-data.js
src/mourning-death-knee.js
src/mourning-death-knee-data.js
src/mourning-cave-clearance-data.js
scripts/audit-elena-clearance.mjs
scripts/bake-mourning-cave-clearance.mjs
tests/camera-follow-lifecycle.test.js
tests/cave-portal-facing.test.js
tests/dodge-sprint-hud-integration.test.js
tests/hud-hold-contextmenu.test.js
tests/ios-playback-recovery.test.js
tests/map-loading-art-flow.test.js
tests/player-resource-lifecycle.test.js
tests/startup-frame-failure.test.js
tests/warrior-stamina.test.js
tests/scene-ready-scope.test.js
tests/plains-tree-transition.test.js
tests/mourning-r9-animation.test.js
tests/mourning-variants.test.js
tests/mourning-death-depth.test.js
tests/mourning-cave-clearance.test.js
tests/elena-model-performance.test.js
tests/boss-gpu-preparation.test.js
tests/boss-shader-cache.test.js
tests/mourning-death-knee.test.js'''.splitlines()
evidence='''final-tests.log
build.log
staged-verification.json
quality-preservation.json
resource-index.json
audit-quality.mjs
shader-morph-review.json
runtime-r3-mask-audit.json
runtime-r3-normal-audit.json
release-review.json
write-review.py
stage-reviewed.py
verify-staged.py
verify-live.py'''.splitlines()
tree='''validation.json
native-draws.json
review-validation.json
baseline.json
capture-baseline.mjs
export-review.mjs
write-review.mjs
.gitignore'''.splitlines()
paths=['ArcherPreview/'+p for p in source]
paths += [(report/p).relative_to(repo).as_posix() for p in evidence]
paths += ['ArcherPreview/reports/plains-tree-mix-2026-11-03/'+p for p in tree]
extra=report/'reviewed-extra-paths.json'
if extra.exists():paths+=json.loads(extra.read_text())
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
