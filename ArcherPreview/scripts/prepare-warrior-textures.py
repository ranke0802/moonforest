"""Offline, sequential R6 texture packaging. Requires Pillow; never edits the GLB.

Run once after updating the approved source, then commit the profile and its
content-addressed images. Regular JS packaging verifies those prepared files.
"""
import hashlib
import io
import json
from pathlib import Path
import struct
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE_SHA = '1ac9d3f9fd4bc5775555298c5c6b07e6712e831ab68c91f8c7914bc15f19b63a'
digest = lambda b: hashlib.sha256(b).hexdigest()


def main():
    raw = (ROOT / 'assets/models/violet-warrior-v3.glb').read_bytes()
    assert digest(raw) == SOURCE_SHA, 'Unreviewed warrior source'
    size = struct.unpack_from('<I', raw, 12)[0]
    gltf = json.loads(raw[20:20 + size])
    content = ROOT / 'public/assets/content'
    content.mkdir(parents=True, exist_ok=True)
    records = {}
    for entry in gltf['images']:
        view = gltf['bufferViews'][entry['bufferView']]
        start = 28 + size + view.get('byteOffset', 0)
        source = raw[start:start + view['byteLength']]
        key = digest(source)
        if key in records:
            continue
        with Image.open(io.BytesIO(source)) as opened:
            original = opened.copy()
        original_size = original.size
        bounded = original
        if max(original_size) > 4096:
            ratio = 4096 / max(original_size)
            bounded = original.resize(tuple(round(d * ratio) for d in original_size), Image.Resampling.LANCZOS)
        # Lossless WebP must preserve RGB even underneath fully transparent pixels.
        encoded = io.BytesIO()
        bounded.save(encoded, 'WEBP', lossless=True, quality=100, method=6, exact=True)
        webp = encoded.getvalue()
        with Image.open(io.BytesIO(webp)) as decoded:
            assert decoded.size == bounded.size
            assert decoded.convert(bounded.mode).tobytes() == bounded.tobytes(), 'WebP pixel mismatch'
        if bounded is original:
            fallback, mime = source, entry['mimeType']
        else:
            encoded = io.BytesIO()
            bounded.save(encoded, 'PNG', optimize=True)
            fallback, mime = encoded.getvalue(), 'image/png'
        if len(webp) < len(fallback):
            data, mime = webp, 'image/webp'
        else:
            data = fallback
        ext = {'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp'}[mime]
        uri = digest(data) + '.' + ext
        (content / uri).write_bytes(data)
        record = dict(uri=uri, mimeType=mime, width=bounded.width, height=bounded.height,
                      sourceWidth=original.width, sourceHeight=original.height,
                      sourceBytes=len(source), bytes=len(data), resized=bounded is not original,
                      pixelExactAfterResize=True, webpCandidateBytes=len(webp))
        records[key] = record
        print(json.dumps(record), flush=True)
    profile = dict(version=1, sourceSha256=SOURCE_SHA, maxSize=4096, images=records,
                   beforeBytes=sum(r['sourceBytes'] for r in records.values()),
                   afterBytes=sum(r['bytes'] for r in records.values()))
    (ROOT / 'assets/warrior-v3-textures.json').write_text(json.dumps(profile, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'ok': True, 'beforeBytes': profile['beforeBytes'], 'afterBytes': profile['afterBytes']}), flush=True)


if __name__ == '__main__':
    main()
