"""Points the shared models that still use a JPG/PNG colour texture (grass tuft, scarecrow, guardian
bear) at the KTX2 files made by convert-actor-ktx2.mjs, in the development assets and in the
published site (0.1 included: user decision 2026-11-21). For each root it writes the .ktx2 and the
new glTFs into content/, updates every manifest that names them, and for the site also the resource
index (new revision) and the 0.1 inventory. Old files stay on disk and in the index. Run again: no change."""
import hashlib, json, re, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]; REPO=ROOT.parent
SOURCE=REPO/'.cache/actor-ktx2'/(sys.argv[1] if len(sys.argv)>1 else 'uastc')
TARGETS=['a22ee8b1e9ac7a3b09f9a356fdfcb755107aa1e5b4f8be54d752d76915244fdd.jpg','a7a6bc98a461f098e5d680c24a6bfb580f706dc1662e14c27998778376e7282d.jpg','1b34cc211da0bfaebe7ad511e076c4bef79b823446458fbd4de8c9331dfae32e.png']
sha=lambda data: hashlib.sha256(data).hexdigest()
compact=lambda value: json.dumps(value,ensure_ascii=False,separators=(',',':'))
packed={name:(SOURCE/(Path(name).stem+'.ktx2')).read_bytes() for name in TARGETS}
ktx={name:sha(data)+'.ktx2' for name,data in packed.items()}

def apply(assets):
    content=assets/'content'; manifests=[p for p in sorted(assets.glob('*.json')) if p.name not in ('resource-index.json','resource-sizes.json')]
    texts={p:p.read_bytes().decode('utf-8') for p in manifests}; renamed={}; added={}
    models=sorted({m for text in texts.values() for m in re.findall(r'[a-f0-9]{64}\.gltf',text)})
    for model in models:
        path=content/model
        if not path.exists(): continue
        raw=path.read_bytes()
        if not any(name.encode() in raw for name in TARGETS): continue
        gltf=json.loads(raw); swapped=set()
        for index,image in enumerate(gltf.get('images',[])):
            if image.get('uri') in ktx: gltf['images'][index]={'mimeType':'image/ktx2','uri':ktx[image['uri']]}; swapped.add(index)
        for texture in gltf.get('textures',[]):
            if texture.get('source') in swapped:
                source=texture.pop('source'); texture['extensions']={**texture.get('extensions',{}),'KHR_texture_basisu':{'source':source}}
        for field in ('extensionsUsed','extensionsRequired'):
            gltf[field]=[name for name in gltf.get(field,[]) if name!='KHR_texture_basisu']+['KHR_texture_basisu']
        if b'\n' in raw[:4000]: raise SystemExit(f'{model}: not minified JSON, refusing to rewrite it')
        data=compact(gltf).encode('utf-8'); name=sha(data)+'.gltf'; renamed[model]=name; added[name]=data
    for name,data in packed.items(): added[ktx[name]]=data
    for name,data in added.items():
        if not (content/name).exists(): (content/name).write_bytes(data)
    changed=[]
    for path,text in texts.items():
        new=text
        for old,name in {**renamed,**ktx}.items(): new=new.replace(old,name)
        if new!=text: path.write_bytes(new.encode('utf-8')); changed.append(path.name)
    return renamed,added,changed

def site_inventory(site,added,changed):
    index_path=site/'assets/resource-index.json'; raw=index_path.read_bytes(); index=json.loads(raw)
    revision=lambda idx: sha(compact({'files':idx['files'],'bundles':idx['bundles']}).encode('utf-8'))
    if revision(index)!=index['revision']: raise SystemExit('resource-index.json: cannot reproduce its revision, stopping')
    styles=[lambda v: compact(v).encode(), lambda v: (compact(v)+'\n').encode(), lambda v: json.dumps(v,ensure_ascii=False,indent=2).encode(), lambda v: (json.dumps(v,ensure_ascii=False,indent=2)+'\n').encode()]
    style=next((s for s in styles if s(index)==raw.replace(b'\r\n',b'\n')),None)
    if style is None: raise SystemExit('resource-index.json: unknown formatting, stopping')
    for name,data in sorted(added.items()): index['files'].setdefault(name,len(data))
    index['revision']=revision(index); index_path.write_bytes(style(index))
    inv_path=site/'deployment-files.json'; inv_raw=inv_path.read_bytes(); inv=json.loads(inv_raw)
    if (json.dumps(inv,indent=2)+'\n').encode()!=inv_raw.replace(b'\r\n',b'\n'): raise SystemExit('deployment-files.json: unknown formatting, stopping')
    entries={item['path']:item for item in inv['files']}
    def record(path):
        data=(site/path).read_bytes()
        if re.search(r'\.(json|js|css|html|txt|md|svg)$',path) and not path.startswith('assets/content/'): data=data.decode('utf-8').replace('\r\n','\n').encode('utf-8')
        entries[path]={'path':path,'bytes':len(data),'sha256':sha(data)}
    for name in changed: record('assets/'+name)
    record('assets/resource-index.json')
    for name in added: record('assets/content/'+name)
    ordered=[item['path'] for item in inv['files']]
    inv['files']=[entries[p] for p in (sorted(entries) if ordered==sorted(ordered) else ordered+sorted(set(entries)-set(ordered)))]
    inv['bytes']=sum(item['bytes'] for item in inv['files']); inv['resourceRevision']=index['revision']
    inv_path.write_bytes((json.dumps(inv,indent=2)+'\n').encode())
    return index['revision']

for label,assets in (('public',ROOT/'public/assets'),('site',REPO/'ArcherPreviewSite/assets')):
    renamed,added,changed=apply(assets)
    print(label,'models',{a[:8]:b[:8] for a,b in renamed.items()},'new files',len(added),'manifests',changed)
    if label=='site' and changed: print('site revision',site_inventory(REPO/'ArcherPreviewSite',added,changed))
