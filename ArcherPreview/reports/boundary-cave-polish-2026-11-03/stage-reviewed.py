"""Stage reviewed boundary/waypoint changes and the exact verified publish graph."""
import hashlib,json,subprocess
from pathlib import Path
app=Path(__file__).resolve().parents[2]; repo=app.parent; report=Path(__file__).parent
paths=subprocess.check_output(['git','diff','--name-only','--','ArcherPreview/src','ArcherPreview/tests','ArcherPreview/scripts','ArcherPreview/public/assets/*.json'],cwd=repo,text=True).splitlines()
new='''src/map-waypoints.js
src/outdoor-vista.js
src/village-plains-boundary.js
src/village-plains-handoff.js
scripts/audit-cave-attachments.mjs
scripts/audit-cave-attachments.py
scripts/export-boundary-review.mjs
scripts/render-boundary-review.py
scripts/render-boundary-vista.py
tests/boundary-cave-continuity.test.js
tests/boundary-cave-facade-geometry.test.js
tests/boundary-cave-material-isolation.test.js
tests/outdoor-vista.test.js
tests/village-plains-handoff.test.js'''.splitlines()
paths += ['ArcherPreview/'+p for p in new]
evidence=['boundary-continuity-validation.json','cave-material-isolation.json','facade-production-geometry.json','facade-baseline.json','facade-integrated.json','outdoor-vista-validation.json','independent-audit.json','attachments/audit.json','stage-reviewed.py','verify-staged.py','verify-live.py','write-review.mjs','review-validation.json','full-tests.log']
paths += [(report/p).relative_to(repo).as_posix() for p in evidence]
paths += (app/'reports/publish-village-paths.txt').read_text().splitlines()
manifest=json.loads((repo/'ArcherPreviewSite/deployment-files.json').read_text())
for item in manifest['files']:
    if item['path'].startswith('assets/content/'):
        source=app/'public'/item['path']; data=source.read_bytes()
        assert hashlib.sha256(data).hexdigest()==item['sha256'], item['path']
        paths.append(source.relative_to(repo).as_posix())
paths=sorted(set(paths)); assert all((repo/p).is_file() for p in paths)
assert not any('/pages/' in p or 'restore-original' in p or 'laboratory-shell' in p for p in paths)
for i in range(0,len(paths),40):subprocess.run(['git','add','-f','--',*paths[i:i+40]],cwd=repo,check=True)
actual=subprocess.check_output(['git','diff','--cached','--name-only'],cwd=repo,text=True).splitlines()
assert set(actual)<=set(paths), 'Unreviewed staged paths'
(report/'staged-paths.json').write_text(json.dumps(actual,indent=2)+'\n')
print(json.dumps({'reviewedPaths':len(actual)}))
