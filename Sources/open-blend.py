"""Open an immutable original with project-local image paths, without saving it.

blender --factory-startup --python Sources/open-blend.py -- <repo-relative.blend>
For read-only automated verification add -b --python-exit-code 1 and --verify-all.
"""
import bpy, json, os, sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
registry = json.loads((root/'Sources/source-inputs.json').read_text(encoding='utf-8'))
def key(path):
    return os.path.normcase(os.path.normpath(str(path).replace('\\', '/')))
origins = {key(origin): root/entry['path'] for entry in registry['inputs'] for origin in entry.get('origins', [])}
entries = {entry['path']: entry for entry in registry['inputs']}

def open_local(relative):
    path = (root/relative).resolve()
    if not path.is_relative_to(root) or relative not in entries or path.suffix.lower() != '.blend':
        raise ValueError('Choose a registered project-local Blender original')
    entry = entries[relative]
    bpy.ops.wm.open_mainfile(filepath=str(path), load_ui=False)
    remapped = 0
    if len(bpy.data.libraries):
        raise ValueError('Unregistered linked libraries require an explicit source import')
    for image in bpy.data.images:
        if image.source not in {'FILE', 'MOVIE', 'SEQUENCE', 'TILED'} or image.packed_file or image.packed_files:
            continue
        local = Path(bpy.path.abspath(image.filepath)).resolve()
        if local.is_relative_to(root) and local.is_file():
            continue
        raw = image.filepath.replace('\\', '/')
        original = str(Path(entry['origins'][0]).parent/raw[2:]) if raw.startswith('//') else raw
        target = origins.get(key(original))
        if target is None or not target.resolve().is_relative_to(root) or not target.is_file():
            raise FileNotFoundError('Image is not bundled: ' + image.name)
        image.filepath = str(target)
        image.reload()
        remapped += 1
    return {'path': relative, 'remappedImages': remapped, 'linkedLibraries': 0}

args = sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
if args == ['--verify-all']:
    files = [open_local(entry['path']) for entry in registry['inputs'] if entry['path'].lower().endswith('.blend')]
    report = {'version': 1, 'files': files, 'complete': True, 'savedSourceFiles': 0,
              'remappedImages': sum(entry['remappedImages'] for entry in files)}
    (root/'Sources/blend-portability-validation.json').write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8')
    print(json.dumps({'complete': True, 'files': len(files), 'remappedImages': report['remappedImages'], 'savedSourceFiles': 0}), flush=True)
elif len(args) == 1:
    print(json.dumps(open_local(args[0])), flush=True)
else:
    raise ValueError('Supply one registered repo-relative .blend path or --verify-all')
