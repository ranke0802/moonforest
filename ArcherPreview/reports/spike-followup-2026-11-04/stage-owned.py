from pathlib import Path
import json,re,subprocess
out=Path(__file__).resolve().parent;app=out.parents[1];repo=app.parent
log=(out/'all-tests.log').read_text(encoding='utf-8',errors='replace')
def count(key):
 m=re.search(r'^ℹ '+key+r' (\d+)',log,re.M)
 if not m:raise RuntimeError('Missing full test summary')
 return int(m.group(1))
assert count('fail')==0 and count('tests')==count('pass')
owned=['src/frame-diagnostics.js','src/ktx-worker-supervisor.js','src/main.js','src/scene-diagnostics.js','src/screen-projection.js','src/settings-panel.js','src/village-instancing.js','src/village-instance-attributes.js','tests/ktx-worker-supervisor.test.js','tests/runtime-timers.test.js','tests/village-instance-attributes.test.js','tests/diagnostic-overhead.test.js','tests/map-decoder-repeat.test.js','tests/boss-menu-baseline.test.js']
paths=['ArcherPreview/'+p for p in owned]+(app/'reports/publish-village-paths.txt').read_text(encoding='utf-8').splitlines()
for folder in ['spike-followup-2026-11-04','instance-attributes-2026-11-04','frame-diagnostic-overhead-2026-11-04']:
 paths+=['ArcherPreview/'+str(p.relative_to(app)).replace('\\','/') for p in (app/'reports'/folder).iterdir() if p.is_file() and p.suffix in ('.json','.mjs','.py','.html')]
paths=sorted(set(paths));assert all((repo/p).is_file() for p in paths)
for i in range(0,len(paths),50):subprocess.run(['git','add','--',*paths[i:i+50]],cwd=repo,check=True)
staged=subprocess.check_output(['git','diff','--cached','--name-only'],cwd=repo,text=True).splitlines();assert set(staged).issubset(paths);assert not any('/public/assets/' in p for p in staged)
result={'stagedPaths':staged,'tests':count('tests'),'unrelatedChangesStaged':False,'texturesGeometryLodFilesChanged':False};(out/'staged-paths.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
subprocess.run(['git','add','--','ArcherPreview/reports/spike-followup-2026-11-04/staged-paths.json'],cwd=repo,check=True)
print(json.dumps({'stagedFiles':len(staged)+1,'tests':count('tests')}))
