"""Read-only Blender dependency audit. Does not save or modify any source file."""
import bpy, json, sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
registry = json.loads((root/'Sources/source-inputs.json').read_text(encoding='utf-8'))
result = {'blenderVersion': bpy.app.version_string, 'readOnly': True, 'files': []}
for entry in registry['inputs']:
    if not entry['path'].lower().endswith('.blend'):
        continue
    bpy.ops.wm.open_mainfile(filepath=str(root/entry['path']), load_ui=False)
    images = []
    for image in bpy.data.images:
        if image.source not in {'FILE', 'MOVIE', 'SEQUENCE', 'TILED'}:
            continue
        packed = bool(image.packed_file or image.packed_files)
        resolved = bpy.path.abspath(image.filepath)
        images.append({'name': image.name, 'path': image.filepath, 'resolved': resolved,
                       'packed': packed, 'exists': Path(resolved).is_file()})
    libraries = [{'path': lib.filepath, 'resolved': bpy.path.abspath(lib.filepath)} for lib in bpy.data.libraries]
    result['files'].append({'path': entry['path'], 'images': images, 'libraries': libraries})
    print('AUDITED', entry['path'], flush=True)
out = root/'Sources/blend-dependency-audit.json'
out.write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
print(json.dumps({'audit': str(out), 'files': len(result['files']), 'readOnly': True}), flush=True)
