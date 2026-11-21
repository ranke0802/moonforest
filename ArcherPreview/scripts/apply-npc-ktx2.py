"""Points the story cast models (npc-moonforest-tripo-*) at the KTX2 colour textures made by
convert-actor-ktx2.mjs: copies each .ktx2 into public/assets/content under its sha256, writes a
new glTF that uses KHR_texture_basisu (same rule as pack-village-ktx2.mjs), and updates the
manifest and src/v03/cast-catalog.js. The JPG and the old glTF stay on disk. Run again: no change."""
import hashlib, json, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]; ASSETS=ROOT/'public/assets'; CONTENT=ASSETS/'content'
SOURCE=ROOT.parent/'.cache/actor-ktx2'/(sys.argv[1] if len(sys.argv)>1 else 'uastc')
sha=lambda data: hashlib.sha256(data).hexdigest()
catalog_path=ROOT/'src/v03/cast-catalog.js'; catalog=catalog_path.read_text(encoding='utf-8'); report=[]
for manifest_path in sorted(ASSETS.glob('npc-moonforest-tripo-*.json')):
    text=manifest_path.read_text(encoding='utf-8'); manifest=json.loads(text)
    (key,asset),=manifest['assets'].items()
    old_model=Path(asset['model']).name; model=json.loads((CONTENT/old_model).read_bytes())
    swaps={}
    for index,image in enumerate(model.get('images',[])):
        uri=image.get('uri','')
        if uri.endswith('.ktx2'): continue
        packed=(SOURCE/(Path(uri).stem+'.ktx2')).read_bytes(); name=sha(packed)+'.ktx2'
        if not (CONTENT/name).exists(): (CONTENT/name).write_bytes(packed)
        model['images'][index]={'mimeType':'image/ktx2','uri':name}; swaps[uri]=name
    if not swaps: report.append((key,'already KTX2')); continue
    for texture in model.get('textures',[]):
        source=texture.pop('source'); texture['extensions']={**texture.get('extensions',{}),'KHR_texture_basisu':{'source':source}}
    for field in ('extensionsUsed','extensionsRequired'):
        model[field]=[name for name in model.get(field,[]) if name!='KHR_texture_basisu']+['KHR_texture_basisu']
    packed_model=json.dumps(model,ensure_ascii=False,separators=(',',':')).encode('utf-8'); new_model=sha(packed_model)+'.gltf'
    (CONTENT/new_model).write_bytes(packed_model)
    for old,new in {**swaps,old_model:new_model}.items():
        if text.count(old)<1: raise SystemExit(f'{manifest_path.name}: {old} not found')
        text=text.replace(old,new)
    manifest_path.write_text(text,encoding='utf-8',newline='')
    old_hash,new_hash=old_model[:-5],new_model[:-5]
    if catalog.count(old_hash)<2: raise SystemExit(f'cast-catalog.js: {old_hash} not found')
    catalog=catalog.replace(old_hash,new_hash)
    report.append((key,old_model[:8]+' -> '+new_model[:8],{old[:8]:new[:8] for old,new in swaps.items()}))
catalog_path.write_text(catalog,encoding='utf-8',newline='')
for row in report: print(*row)
