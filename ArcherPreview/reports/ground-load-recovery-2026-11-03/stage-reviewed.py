import json,subprocess
from pathlib import Path
report=Path(__file__).parent;app=report.parents[1];repo=app.parent
def git(*args):return subprocess.check_output(['git',*args],cwd=repo,encoding='utf-8')
owned='''README.md
public/resource-cache.js
scripts/build-village-site.mjs
scripts/runtime-module-graph.mjs
src/frame-loop.js
src/loading-view.js
src/main.js
src/plains-view-distance.js
src/resource-repair.js
src/settings-panel.js
src/village-demand.js
src/village-ground.js
src/village-ktx2.js
src/village-visibility.js
tests/ground-retry-sdk.test.js
tests/camera-follow-lifecycle.test.js
tests/cave-portal-facing.test.js
tests/loading-error-diagnostics.test.js
tests/plains-view-distance.test.js
tests/resource-repair.test.js
tests/runtime-module-graph.test.js
tests/startup-frame-failure.test.js
tests/village-ktx-loader-eager.test.js
reports/ground-load-recovery-2026-11-03/cache-audit.json
reports/ground-load-recovery-2026-11-03/cache-audit.mjs
reports/ground-load-recovery-2026-11-03/evidence.json
reports/ground-load-recovery-2026-11-03/verify-evidence.py
reports/ground-load-recovery-2026-11-03/retry-validation.json
reports/ground-load-recovery-2026-11-03/validation-summary.json
reports/ground-load-recovery-2026-11-03/stage-reviewed.py'''.splitlines()
paths=['ArcherPreview/'+p for p in owned]
deployment=json.loads((repo/'ArcherPreviewSite/deployment-files.json').read_text())
paths+=['ArcherPreviewSite/'+p['path'] for p in deployment['files']]+['ArcherPreviewSite/deployment-files.json']
assert set(git('diff','--cached','--name-only').strip().splitlines())<=set(paths),'Other staged work needs separate review'
for path in paths:assert (repo/path).is_file(),path
for start in range(0,len(paths),40):subprocess.run(['git','add','--',*paths[start:start+40]],cwd=repo,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
changed=git('diff','--cached','--name-only').strip().splitlines()
assert set(changed)<=set(paths)
assert not git('diff','--cached','--diff-filter=D','--name-only').strip()
subprocess.run(['git','diff','--cached','--check','--','ArcherPreview'],cwd=repo,check=True)
(report/'staged-paths.json').write_text(json.dumps(changed,indent=2)+'\n')
print(json.dumps({'stagedFiles':len(changed),'ownedFiles':len(owned),'deploymentFiles':len(deployment['files']),'stagedDeletions':0}))
