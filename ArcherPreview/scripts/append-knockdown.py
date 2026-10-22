"""Append one authored clip without rewriting approved meshes, textures or old clips."""
import copy,json,struct,hashlib
from pathlib import Path
ASSETS=Path(__file__).resolve().parent.parent/'public/assets'
Q=Path('C:/dev/blender-workbench/projects/violet-vanguard-biped-equipped/v2/knockdown')
target=ASSETS/'violet-warrior-v2.glb';backup=Q/'before_knockdown.glb'
if not backup.exists():backup.write_bytes(target.read_bytes())
def read(path):
    data=path.read_bytes();size=struct.unpack_from('<I',data,12)[0]
    return json.loads(data[20:20+size]),bytearray(data[28+size:])
g,binary=read(backup);new,newbin=read(Q/'knockdown_only.glb')
names={n['name']:i for i,n in enumerate(g['nodes']) if 'name' in n}
assert len(new['animations'])==1
animation=copy.deepcopy(new['animations'][0]);animation['name']='Knockdown'
mapped={};views={}
def accessor(index):
    if index in mapped:return mapped[index]
    a=copy.deepcopy(new['accessors'][index]);v=a['bufferView']
    if v not in views:
        view=copy.deepcopy(new['bufferViews'][v]);offset=view.get('byteOffset',0)
        binary.extend(b'\0'*((-len(binary))%4));view['byteOffset']=len(binary)
        binary.extend(newbin[offset:offset+view['byteLength']]);view['buffer']=0
        views[v]=len(g['bufferViews']);g['bufferViews'].append(view)
    a['bufferView']=views[v];mapped[index]=len(g['accessors']);g['accessors'].append(a);return mapped[index]
def parent_names(nodes):return {c:n.get('name') for n in nodes for c in n.get('children',[])}
oldparents=parent_names(g['nodes']);newparents=parent_names(new['nodes'])
channels=[];samplers=[]
for channel in animation['channels']:
    if channel['target']['path']=='weights':continue
    source_node=channel['target']['node'];name=new['nodes'][source_node]['name']
    assert name in names,name
    dest=names[name];assert oldparents.get(dest)==newparents.get(source_node),(name,oldparents.get(dest),newparents.get(source_node))
    channel['target']['node']=dest
    sampler=copy.deepcopy(animation['samplers'][channel['sampler']]);sampler['input']=accessor(sampler['input']);sampler['output']=accessor(sampler['output'])
    channel['sampler']=len(samplers);samplers.append(sampler);channels.append(channel)
animation['channels']=channels;animation['samplers']=samplers
for index in {s['input'] for s in samplers}:
    a=g['accessors'][index];v=g['bufferViews'][a['bufferView']];off=v.get('byteOffset',0)+a.get('byteOffset',0)
    values=struct.unpack_from('<'+'f'*a['count'],binary,off);start=values[0];values=[round((v-start)*60)/60 for v in values]
    struct.pack_into('<'+'f'*len(values),binary,off,*values);a['min']=[min(values)];a['max']=[max(values)]
assert len(channels)>=108,len(channels)
g['animations'].append(animation);g['buffers'][0]['byteLength']=len(binary)
# Reuse the authored stand-up tail of the approved roll, rather than lifting a
# horizontal body directly into idle. The existing roll and all its data stay intact.
recovery=copy.deepcopy(next(a for a in g['animations'] if a['name']=='Dodge_Roll'))
recovery['name']='Knockdown_GetUp'
def values(index):
    a=g['accessors'][index];v=g['bufferViews'][a['bufferView']];width={'SCALAR':1,'VEC3':3,'VEC4':4}[a['type']]
    offset=v.get('byteOffset',0)+a.get('byteOffset',0);stride=v.get('byteStride',width*4)
    return [struct.unpack_from('<'+'f'*width,binary,offset+i*stride) for i in range(a['count'])]
def append_values(rows,kind):
    binary.extend(b'\0'*((-len(binary))%4));offset=len(binary)
    for row in rows:binary.extend(struct.pack('<'+'f'*len(row),*row))
    view=len(g['bufferViews']);g['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':len(binary)-offset})
    a={'bufferView':view,'componentType':5126,'count':len(rows),'type':kind}
    if kind=='SCALAR':a.update(min=[min(r[0] for r in rows)],max=[max(r[0] for r in rows)])
    g['accessors'].append(a);return len(g['accessors'])-1
for sampler in recovery['samplers']:
    times=values(sampler['input']);rows=values(sampler['output']);selected=[i for i,t in enumerate(times) if t[0]>=1.5-1e-6]
    assert selected
    sampler['input']=append_values([(round((times[i][0]-1.5)*60)/60,) for i in selected],'SCALAR')
    sampler['output']=append_values([rows[i] for i in selected],g['accessors'][sampler['output']]['type'])
g['animations'].append(recovery);g['buffers'][0]['byteLength']=len(binary)
j=json.dumps(g,separators=(',',':')).encode();j+=b' '*((-len(j))%4);binary+=b'\0'*((-len(binary))%4)
target.write_bytes(struct.pack('<III',0x46546c67,2,28+len(j)+len(binary))+struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(binary),0x004e4942)+binary)
manifest=ASSETS/'warrior-v2.json';config=json.loads(manifest.read_text(encoding='utf-8'))
report=json.loads((Q/'export.json').read_text());config['animations']['knockdown']='Knockdown';config['animations']['getUp']='Knockdown_GetUp'
config['version']='전사 v2 · 검술 / 심판 / 방패 밀치기 / 회피 / 넉다운'
manifest.write_text(json.dumps(config,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'channels':len(channels),'duration':max(g['accessors'][s['input']]['max'][0] for s in samplers),'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'old_clips_preserved':len(g['animations'])-2}))

