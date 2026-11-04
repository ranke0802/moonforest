from pathlib import Path
import json,shutil,hashlib,subprocess
source=Path('C:/dev/moonforest-archer/ArcherPreview'); target=Path('C:/dev/moonforest-mobile-quality/ArcherPreview')
report=source/'reports/mobile-quality-2026-11-04'; dest=target/'reports/mobile-quality-2026-11-04';dest.mkdir(parents=True,exist_ok=True)
paths=[
'src/main.js','src/player-texture-profile.js','src/render-policy.js','src/render-scale-settings.js','src/mobile-texture-policy.js',
'src/village-outlines.js','src/village-visibility.js','src/village-texture-budget.js','src/village-texture-streaming.js',
'scripts/pack-player-mobile4k.py','scripts/pack-mobile-scenery.py',
'tests/ios-player-memory.test.js','tests/player-texture-profile.test.js','tests/player-mobile4k-codec.mjs','tests/render-scale-settings.test.js',
'tests/mobile-scenery-textures.test.js','tests/village-shadow-reuse.test.js','tests/village-outline-source-reuse.test.js',
'tests/helpers/mobile-profile-contract.js','tests/mobile-profile-contract.test.js','tests/plains-landscape-render.test.js',
'tests/plains-tree-transition.test.js','tests/plains-two-boundary-regression.test.js','tests/mourning-cave-clearance.test.js',
'tests/startup-frame-failure.test.js','tests/witch-cave.test.js','tests/mobile-map-roundtrip.test.js','tests/witch-cave-roundtrip.test.js','tests/village-texture-pacing.test.js',
'public/assets/village.json','public/assets/great-plains.json','public/assets/monster-forest.json','public/assets/witch-cave.json','public/assets/village-plains-outskirts.json',
'public/assets/warrior-v3-mobile4k.json','public/assets/warrior-v3-mobile2k-rgba.json']
package=json.loads((report/'player-package.json').read_text(encoding='utf-8'));paths += [p['path'] for p in package['newContentFiles']]
scene=json.loads((report/'scenery-profiles.json').read_text(encoding='utf-8'));paths += ['public/assets/'+p['derived'].removeprefix('./') for p in scene['profiles']]
paths=sorted(set(paths)); copied=[]
for name in paths:
 src=source/name; dst=target/name;dst.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(src,dst)
 copied.append({'path':name,'sha256':hashlib.sha256(dst.read_bytes()).hexdigest(),'bytes':dst.stat().st_size})
for path in report.iterdir():
 if path.is_file() and path.suffix in ('.json','.mjs','.py','.html'): shutil.copy2(path,dest/path.name)
result={'baseline':'5c65642fddca6472af614b4a8f12829d744cb37e','source':str(source),'target':str(target),'copied':copied,'otherThreadCinematicChangesCopied':False}
(dest/'isolation.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'copiedFiles':len(paths),'bytes':sum(p['bytes'] for p in copied),'target':str(target)}))
