"""Stage only this integration's reviewed code, evidence and live publish graph."""
import json, subprocess
from pathlib import Path
app=Path(__file__).resolve().parents[2];repo=app.parent
paths=subprocess.check_output(['git','diff','--name-only','--','ArcherPreview/src','ArcherPreview/tests','ArcherPreview/scripts','ArcherPreview/README.md','ArcherPreview/public/assets/*.json'],cwd=repo,text=True).splitlines()
new='''src/cave-laboratory-vault.js
src/cave-natural-dressing.js
src/cave-natural-dressing-data.js
src/dodge-sprint-input.js
src/hud-top-actions.js
src/passive-health-regen.js
scripts/bake-cave-natural-dressing.mjs
scripts/export-cave-natural-review.mjs
scripts/render-cave-natural-review.py
tests/cave-natural-dressing.test.js
tests/cave-natural-vaults.test.js
tests/dodge-sprint-gesture.test.js
tests/dodge-sprint-hud-integration.test.js
tests/passive-health-regen.test.js
tests/plains-landscape-render.test.js
tests/player-resource-hud.test.js
tests/player-resource-lifecycle.test.js
tests/warrior-stamina.test.js
reports/plains-landscape-2026-11-03/baseline.json
reports/plains-landscape-2026-11-03/baseline.mjs
reports/plains-landscape-2026-11-03/prepare-ground.mjs
reports/plains-landscape-2026-11-03/ground-interactions.json
reports/plains-landscape-2026-11-03/render-validation.json
public/assets/content/fa9ffbb5b033f54a60bd2d69208981d319f43641a6d78e64d4f2caab4ed5a0d8.ktx2'''.splitlines()
paths += ['ArcherPreview/'+p for p in new]
paths += [p.relative_to(repo).as_posix() for p in Path(__file__).parent.iterdir() if p.is_file() and p.name!='staged-paths.json']
paths += (app/'reports/publish-village-paths.txt').read_text().splitlines()
paths=sorted(set(paths))
assert all((repo/p).is_file() for p in paths)
assert not any('/pages/' in p or 'restore-original' in p or 'laboratory-shell' in p for p in paths)
subprocess.run(['git','add','-f','--',*paths],cwd=repo,check=True)
(Path(__file__).parent/'staged-paths.json').write_text(json.dumps(paths,indent=2)+'\n')
print(json.dumps({'reviewedPaths':len(paths)}))
