import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2]/'Sources'))
from resolve_source import source_path, project_path, tool_path
"""Derive bounded mobile player textures, preserving source player/other assets.

Uses the existing player manifests, Pillow, numpy and local KTX-Software. Only
the two 8K images are re-encoded for the 4K profile; smaller KTX2 files are reused
byte for byte. Image fallbacks use source files unchanged when within the cap.
Run offline; no browser, paid API, source geometry or protected asset edits.
"""
import argparse
import copy
import hashlib
import json
import math
from pathlib import Path
import struct
import subprocess
import tempfile

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'public/assets'
CONTENT = ASSETS / 'content'
KTX_MAGIC = bytes.fromhex('ab4b5458203230bb0d0a1a0a')
INVARIANT_FIELDS = ('buffers', 'bufferViews', 'accessors', 'nodes', 'skins',
                    'meshes', 'materials', 'animations', 'samplers', 'scenes', 'scene')


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def digest(data):
    return hashlib.sha256(data).hexdigest()


def file_record(path):
    data = path.read_bytes()
    return {'path': path.relative_to(ROOT).as_posix(), 'sha256': digest(data), 'bytes': len(data)}


def put(data, suffix, created):
    target = CONTENT / (digest(data) + suffix)
    if target.exists():
        if target.read_bytes() != data:
            raise RuntimeError('Content hash collision: ' + str(target))
    else:
        target.write_bytes(data)
        created.add(target)
    return target


def image_info(path):
    with Image.open(path) as image:
        return {'width': image.width, 'height': image.height, 'mode': image.mode}


def ktx_info(path):
    data = path.read_bytes()
    if data[:12] != KTX_MAGIC:
        raise RuntimeError('Not KTX2: ' + str(path))
    width, height = struct.unpack_from('<II', data, 20)
    levels, scheme, dfd = struct.unpack_from('<III', data, 40)
    if data[dfd + 12] != 166 or scheme != 2:
        raise RuntimeError('Expected UASTC/Zstd: ' + str(path))
    if levels != math.floor(math.log2(max(width, height))) + 1:
        raise RuntimeError('Missing mip levels: ' + str(path))
    return {'width': width, 'height': height, 'levels': levels,
            'uastcBytes': sum(struct.unpack_from('<Q', data, 96 + level * 24)[0]
                              for level in range(levels))}


def mip_bytes(width, height, compressed=False):
    size = 0
    while True:
        size += math.ceil(width / 4) * math.ceil(height / 4) * 16 if compressed else width * height * 4
        if width == height == 1:
            return size
        width, height = max(1, width // 2), max(1, height // 2)


def run(command):
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(result.stdout + '\n' + result.stderr)


def bounded_png(source, cap, work):
    with Image.open(source) as opened:
        image = opened.convert('RGBA' if 'A' in opened.getbands() else 'RGB')
    image.thumbnail((cap, cap), Image.Resampling.LANCZOS, reducing_gap=3)
    path = work / (source.stem + '-' + str(cap) + '.png')
    image.save(path, compress_level=9)
    return path


def psnr(reference, decoded):
    with Image.open(reference) as image:
        mode = image.mode
        with Image.open(decoded) as result:
            result = result.convert(mode)
            if result.size != image.size:
                raise RuntimeError('Codec changed image dimensions')
            squared = np.zeros(len(image.getbands()), dtype=np.float64)
            count = 0
            for y in range(0, image.height, 128):
                box = (0, y, image.width, min(y + 128, image.height))
                a = np.asarray(image.crop(box), dtype=np.float32)
                b = np.asarray(result.crop(box), dtype=np.float32)
                squared += ((a - b) ** 2).sum((0, 1))
                count += a.shape[0] * a.shape[1]
    return [round(10 * math.log10(255 ** 2 / max(float(value / count), 1e-12)), 2)
            for value in squared]


def encode(reference, work, ktx):
    # Resume only a conversion verified against this exact downsample and policy.
    key = digest(reference.read_bytes())
    target, ledger = work / (key + '.ktx2'), work / (key + '-verified.json')
    if target.exists() and ledger.exists():
        row = read(ledger)
        if digest(target.read_bytes()) == row['sha256']:
            return target, row
    with Image.open(reference) as image:
        rgba = image.mode == 'RGBA'
    print('Encoding 4K UASTC: ' + reference.name, flush=True)
    run([ktx, 'create', '--format', 'R8G8B8A8_SRGB' if rgba else 'R8G8B8_SRGB',
         '--assign-tf', 'srgb', '--assign-primaries', 'bt709',
         '--assign-texcoord-origin', 'top-left', '--generate-mipmap',
         '--encode', 'uastc', '--threads', '4', '--uastc-quality', '2',
         '--zstd', '18', '--uastc-rdo', '--uastc-rdo-l', '0.5',
         '--uastc-rdo-d', '4096', '--uastc-rdo-m', str(reference), str(target)])
    run([ktx, 'validate', str(target)])
    decoded = work / (key + '-decoded.png')
    run([ktx, 'extract', '--transcode', 'rgba8', str(target), str(decoded)])
    quality = psnr(reference, decoded)
    if min(quality[:3]) < 38 or (rgba and quality[3] < 40):
        raise RuntimeError('UASTC encoding quality below threshold: ' + str(quality))
    row = {**ktx_info(target), 'sha256': digest(target.read_bytes()),
           'psnrAgainst4kReference': quality,
           'settings': 'UASTC quality 2, RDO 0.5, Zstd 18, full mip chain'}
    write(ledger, row)
    return target, row


def image_source(texture):
    if 'source' in texture:
        return texture['source']
    for extension in ('EXT_texture_webp', 'KHR_texture_basisu'):
        if extension in texture.get('extensions', {}):
            return texture['extensions'][extension]['source']
    raise RuntimeError('Texture source missing')


def normalize_textures(gltf, source):
    needed = []
    for texture, original in zip(gltf['textures'], source['textures']):
        index = image_source(original)
        texture.pop('source', None)
        extensions = texture.setdefault('extensions', {})
        for extension in ('EXT_texture_webp', 'KHR_texture_basisu'):
            extensions.pop(extension, None)
        mime = gltf['images'][index]['mimeType']
        extension = {'image/webp': 'EXT_texture_webp', 'image/ktx2': 'KHR_texture_basisu'}.get(mime)
        if extension:
            extensions[extension] = {'source': index}
            if extension not in needed:
                needed.append(extension)
        else:
            texture['source'] = index
        if not extensions:
            texture.pop('extensions', None)
    for field in ('extensionsUsed', 'extensionsRequired'):
        gltf[field] = [value for value in gltf.get(field, [])
                       if value not in ('EXT_texture_webp', 'KHR_texture_basisu')]
        gltf[field].extend(needed)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--work', type=Path, default=Path(tempfile.gettempdir()) / 'moonforest-player-mobile4k-v1')
    parser.add_argument('--ktx', default=tool_path('ktx'))
    parser.add_argument('--report', type=Path, default=ROOT / 'reports/mobile-quality-2026-11-04/player-package.json')
    args = parser.parse_args()
    args.work.mkdir(parents=True, exist_ok=True)
    CONTENT.mkdir(parents=True, exist_ok=True)
    config = read(ASSETS / 'warrior-v3.json')
    original = read(ASSETS / config['model'])
    ios_config = read(ASSETS / 'warrior-v3-ios.json')
    ios = read(ASSETS / ios_config['model'])
    # Reuse only the existing approved player's smaller compressed textures.
    for field in INVARIANT_FIELDS:
        if original.get(field) != ios.get(field):
            raise RuntimeError('Existing player profiles differ in ' + field)
    sources = [CONTENT / image['uri'] for image in original['images']]
    source_info = [image_info(path) for path in sources]
    originals = {ASSETS / name for name in ('warrior-v3.json', 'warrior-v3-ios.json')}
    originals.update(sources)
    originals.update(CONTENT / image['uri'] for image in ios['images'])
    originals.update(ASSETS / value['model'] for value in (config, ios_config))
    originals.update(CONTENT / item['uri'] for item in original['buffers'] if 'uri' in item)
    before = {path: file_record(path) for path in originals}
    created = set()
    variants = []
    for name, cap, compressed in [('warrior-v3-mobile4k', 4096, True),
                                  ('warrior-v3-mobile2k-rgba', 2048, False)]:
        gltf, rows = copy.deepcopy(original), []
        for index, (image, path, info) in enumerate(zip(gltf['images'], sources, source_info)):
            oversized = max(info['width'], info['height']) > cap
            quality = None
            if compressed and not oversized:
                target = CONTENT / ios['images'][index]['uri']
                dimensions = ktx_info(target)
                if (dimensions['width'], dimensions['height']) != (info['width'], info['height']):
                    raise RuntimeError('Reused KTX2 resolution does not match source')
                image['uri'], image['mimeType'] = target.name, 'image/ktx2'
                reused = True
            elif oversized:
                reference = bounded_png(path, cap, args.work)
                if compressed:
                    packed, quality = encode(reference, args.work, args.ktx)
                    target = put(packed.read_bytes(), '.ktx2', created)
                    image['mimeType'] = 'image/ktx2'
                else:
                    target = put(reference.read_bytes(), '.png', created)
                    image['mimeType'] = 'image/png'
                image['uri'] = target.name
                dimensions = image_info(reference)
                reused = False
            else:
                target, dimensions, reused = path, info, True
            rows.append({'name': image.get('name'), 'source': before[path],
                         'sourceWidth': info['width'], 'sourceHeight': info['height'],
                         **file_record(target), 'width': dimensions['width'], 'height': dimensions['height'],
                         'resized': oversized, 'reusedExistingBytes': reused, 'codecValidation': quality})
        normalize_textures(gltf, original)
        gltf['asset'].setdefault('extras', {})['moonforestSerialTextures'] = True
        for field in INVARIANT_FIELDS:
            if gltf.get(field) != original.get(field):
                raise RuntimeError('Player structural change: ' + field)
        raw = (json.dumps(gltf, ensure_ascii=False, separators=(',', ':')) + '\n').encode('utf-8')
        model = put(raw, '.gltf', created)
        output = copy.deepcopy(config)
        output['model'] = './content/' + model.name
        output['resources'] = list(dict.fromkeys([output['model']] +
            ['./content/' + item['uri'] for item in gltf['buffers'] if 'uri' in item] +
            ['./content/' + image['uri'] for image in gltf['images']]))
        output['textureProfile'] = {**config['textureProfile'], 'version': 1,
            'maxSize': cap, 'preserveSourceResolution': False, 'sourceManifest': 'warrior-v3.json',
            'encoding': 'ktx2-uastc-4k-mobile' if compressed else 'bounded-images-' + str(cap),
            'requiresGpuCompression': compressed, 'serialTextureUploads': True,
            'reuseSmallerTextures': True}
        output['bytes'] = sum((ASSETS / resource).stat().st_size for resource in output['resources'])
        manifest = ASSETS / (name + '.json')
        write(manifest, output)
        rgba = sum(mip_bytes(row['width'], row['height']) for row in rows)
        block = sum(mip_bytes(row['width'], row['height'], True) for row in rows)
        variants.append({'manifest': file_record(manifest), 'model': file_record(model), 'images': rows,
            'resourceCount': len(output['resources']), 'downloadBytes': output['bytes'],
            'uniqueImageRgbaBytesWithMips': rgba,
            'uniqueImageAstc4x4Bc7WorstCaseEtc2BytesWithMips': block if compressed else None,
            'largestRgbaImageDecodeBytes': max(row['width'] * row['height'] * 4 for row in rows),
            'geometryRigMaterialsClipsUnchanged': True})
        print(name + ': ' + str(output['bytes']) + ' download bytes', flush=True)
    for path, expected in before.items():
        if file_record(path) != expected:
            raise RuntimeError('Original player resource changed: ' + str(path))
    report = {'version': 1, 'browserAutomation': False, 'actualGpuUploadTested': False,
        'scope': 'Player only. No boss, house, map, geometry, rig, materials or clip changes.',
        'sourceManifest': before[ASSETS / 'warrior-v3.json'],
        'sourceRgbaBytesWithMips': sum(mip_bytes(info['width'], info['height']) for info in source_info),
        'sourceLargestRgbaImageDecodeBytes': max(info['width'] * info['height'] * 4 for info in source_info),
        'memoryEstimateScope': 'Unique image GPU allocations; excludes render targets, geometry, decoder/driver memory and possible duplicate texture objects. ETC2 alpha worst case is 16 bytes per 4x4 block.',
        'newContentFiles': [file_record(path) for path in sorted({
            ROOT / item['path'] for variant in variants
            for item in [variant['model'], *variant['images']]
            if ROOT / item['path'] not in before})],
        'originalPlayerFilesVerifiedUnchanged': [value for _, value in sorted(before.items())],
        'variants': variants}
    write(args.report, report)
    print('Verified original player files unchanged; report: ' + str(args.report), flush=True)


if __name__ == '__main__':
    main()
