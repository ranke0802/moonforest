"""Phone player textures at 2K, still GPU-compressed (KTX2 UASTC + full mips).

Derived the same way as pack-player-mobile4k.py (whose helpers it reuses):
Pillow downsample of the approved source images to a 2048 cap, encoded with
local KTX-Software, validated, transcoded back and PSNR-checked. Images that
already fit 2048 reuse the approved KTX2 bytes unchanged. Geometry, rig,
materials and clips are verified unchanged; existing profiles are untouched.

Run on Windows from the repository root, e.g.:
  set KTX_EXE=C:\\Program Files\\KTX-Software\\bin\\ktx.exe
  Tools\\portable\\runtime\\win-x64\\python\\python.exe ArcherPreview\\scripts\\pack-player-mobile2k-ktx2.py
"""
import argparse
import copy
import importlib.util
import json
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('mobile4k', HERE / 'pack-player-mobile4k.py')
base = importlib.util.module_from_spec(spec)
sys.modules['mobile4k'] = base
spec.loader.exec_module(base)

NAME, CAP = 'warrior-v3-mobile2k', 2048


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--work', type=Path, default=Path(tempfile.gettempdir()) / 'moonforest-player-mobile2k-ktx2-v1')
    parser.add_argument('--ktx', default=base.tool_path('ktx'))
    parser.add_argument('--report', type=Path, default=base.ROOT / 'reports/mobile-quality-2026-11-18/player-mobile2k-ktx2.json')
    args = parser.parse_args()
    args.work.mkdir(parents=True, exist_ok=True)
    ASSETS, CONTENT = base.ASSETS, base.CONTENT
    config = base.read(ASSETS / 'warrior-v3.json')
    original = base.read(ASSETS / config['model'])
    ios_config = base.read(ASSETS / 'warrior-v3-ios.json')
    ios = base.read(ASSETS / ios_config['model'])
    for field in base.INVARIANT_FIELDS:
        if original.get(field) != ios.get(field):
            raise RuntimeError('Existing player profiles differ in ' + field)
    sources = [CONTENT / image['uri'] for image in original['images']]
    source_info = [base.image_info(path) for path in sources]
    protected = {ASSETS / name for name in ('warrior-v3.json', 'warrior-v3-ios.json', 'warrior-v3-mobile4k.json', 'warrior-v3-mobile2k-rgba.json') if (ASSETS / name).exists()}
    protected.update(sources)
    protected.update(CONTENT / image['uri'] for image in ios['images'])
    before = {path: base.file_record(path) for path in protected}
    created, rows = set(), []
    gltf = copy.deepcopy(original)
    for index, (image, path, info) in enumerate(zip(gltf['images'], sources, source_info)):
        oversized = max(info['width'], info['height']) > CAP
        quality = None
        if not oversized:
            target = CONTENT / ios['images'][index]['uri']
            dimensions = base.ktx_info(target)
            if (dimensions['width'], dimensions['height']) != (info['width'], info['height']):
                raise RuntimeError('Reused KTX2 resolution does not match source')
            reused = True
        else:
            reference = base.bounded_png(path, CAP, args.work)
            packed, quality = base.encode(reference, args.work, args.ktx)
            target = base.put(packed.read_bytes(), '.ktx2', created)
            dimensions = base.image_info(reference)
            reused = False
        image['uri'], image['mimeType'] = target.name, 'image/ktx2'
        rows.append({'name': image.get('name'), 'source': before[path], 'sourceWidth': info['width'],
                     'sourceHeight': info['height'], **base.file_record(target), 'width': dimensions['width'],
                     'height': dimensions['height'], 'resized': oversized, 'reusedExistingBytes': reused,
                     'codecValidation': quality})
    base.normalize_textures(gltf, original)
    gltf['asset'].setdefault('extras', {})['moonforestSerialTextures'] = True
    for field in base.INVARIANT_FIELDS:
        if gltf.get(field) != original.get(field):
            raise RuntimeError('Player structural change: ' + field)
    raw = (json.dumps(gltf, ensure_ascii=False, separators=(',', ':')) + '\n').encode('utf-8')
    model = base.put(raw, '.gltf', created)
    output = copy.deepcopy(config)
    output['model'] = './content/' + model.name
    output['resources'] = list(dict.fromkeys([output['model']] +
        ['./content/' + item['uri'] for item in gltf['buffers'] if 'uri' in item] +
        ['./content/' + image['uri'] for image in gltf['images']]))
    output['textureProfile'] = {**config['textureProfile'], 'version': 1, 'maxSize': CAP,
        'preserveSourceResolution': False, 'sourceManifest': 'warrior-v3.json',
        'encoding': 'ktx2-uastc-2k-mobile', 'requiresGpuCompression': True,
        'serialTextureUploads': True, 'reuseSmallerTextures': True}
    output['bytes'] = sum((ASSETS / resource).stat().st_size for resource in output['resources'])
    manifest = ASSETS / (NAME + '.json')
    base.write(manifest, output)
    block = sum(base.mip_bytes(row['width'], row['height'], True) for row in rows)
    for path, expected in before.items():
        if base.file_record(path) != expected:
            raise RuntimeError('Protected player file changed: ' + str(path))
    base.write(args.report, {'version': 1, 'browserAutomation': False, 'actualGpuUploadTested': False,
        'scope': 'Player only, phone profile. Geometry, rig, materials and clips unchanged.',
        'manifest': base.file_record(manifest), 'model': base.file_record(model), 'images': rows,
        'downloadBytes': output['bytes'], 'uniqueImageAstc4x4Bc7WorstCaseEtc2BytesWithMips': block,
        'protectedFilesVerifiedUnchanged': [value for _, value in sorted(before.items())]})
    print(NAME + ': ' + str(output['bytes']) + ' download bytes; GPU estimate ' + str(block) + ' bytes', flush=True)
    print('Report: ' + str(args.report), flush=True)


if __name__ == '__main__':
    main()
