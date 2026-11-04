"""Stage only this isolated task and the reviewed deployment inventory."""
from pathlib import Path
import json,re,subprocess
out=Path(__file__).resolve().parent; app=out.parents[1]; repo=app.parent
text=(out/'all-tests-final.log').read_text(encoding='utf-8',errors='replace')
def value(key):
 match=re.search(r'^ℹ '+key+r' (\d+)',text,re.M)
 if not match: raise RuntimeError('Full test summary missing: '+key)
 return int(match.group(1))
assert value('fail')==0 and value('tests')==value('pass'),'Do not stage a failing or incomplete run'
paths=['ArcherPreview/'+item['path'] for item in json.loads((out/'isolation.json').read_text(encoding='utf-8'))['copied']]
paths += ['ArcherPreview/scripts/build-asset-catalog.mjs','ArcherPreview/tests/asset-catalog.test.js','ArcherPreview/tests/cave-laboratory-geometry.test.js','ArcherPreview/public/assets/resource-sizes.json']
paths += ['ArcherPreview/tests/quest-prop-lifecycle.test.js']
paths += (app/'reports/publish-village-paths.txt').read_text(encoding='utf-8').strip().splitlines()
paths += ['ArcherPreview/'+str(p.relative_to(app)).replace('\\','/') for p in out.iterdir() if p.is_file() and p.suffix in ('.json','.mjs','.py','.html')]
paths=sorted(set(paths)); assert all((repo/p).is_file() for p in paths)
for start in range(0,len(paths),60): subprocess.run(['git','add','--',*paths[start:start+60]],cwd=repo,check=True)
staged=subprocess.check_output(['git','diff','--cached','--name-only'],cwd=repo,text=True).splitlines()
assert all(path in paths for path in staged),'Unowned staged paths'
result={'ownedCandidates':len(paths),'stagedPaths':staged,'tests':value('tests'),'unrelatedChangesStaged':False}
(out/'staged-paths.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
subprocess.run(['git','add','--','ArcherPreview/reports/mobile-quality-2026-11-04/staged-paths.json'],cwd=repo,check=True)
print(json.dumps({'tests':value('tests'),'stagedFiles':len(staged)+1}))
