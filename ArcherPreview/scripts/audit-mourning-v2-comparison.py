"""Verify the delivered r8 GLB against the preserved r7 bytes without editing either."""
import json, struct, hashlib
from pathlib import Path
import numpy as np

SOURCE=Path('C:/Users/ryank/Documents/ChatGPT/MM Project/output/elina-three-model-review/2026-10-30-v1')
OUT=Path(__file__).resolve().parents[1]/'reports/elena-motion-v2'
OUT.mkdir(parents=True,exist_ok=True)
TYPES={5120:'i1',5121:'u1',5122:'<i2',5123:'<u2',5125:'<u4',5126:'<f4'}
WIDTH={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
class GLB:
 def __init__(self,path):
  self.bytes=path.read_bytes();length=struct.unpack_from('<I',self.bytes,12)[0];self.g=json.loads(self.bytes[20:20+length]);self.binary=memoryview(self.bytes)[28+length:]
 def arr(self,index):
  a=self.g['accessors'][index];w=WIDTH[a['type']];dt=np.dtype(TYPES[a['componentType']]);out=np.zeros((a['count'],w),dtype=dt)
  if 'bufferView'in a:
   v=self.g['bufferViews'][a['bufferView']];out=np.ndarray(out.shape,dt,buffer=self.binary,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',w*dt.itemsize),dt.itemsize)).copy()
  if 'sparse'in a:
   s=a['sparse'];iv=self.g['bufferViews'][s['indices']['bufferView']];vv=self.g['bufferViews'][s['values']['bufferView']]
   ids=np.frombuffer(self.binary,TYPES[s['indices']['componentType']],s['count'],iv.get('byteOffset',0)+s['indices'].get('byteOffset',0));out[ids]=np.frombuffer(self.binary,dt,s['count']*w,vv.get('byteOffset',0)+s['values'].get('byteOffset',0)).reshape(-1,w)
  return out
 def tracks(self,name):
  a=next(a for a in self.g['animations']if a['name']==name);return {(self.g['nodes'][c['target']['node']]['name'],c['target']['path']):a['samplers'][c['sampler']]for c in a['channels']}
old=GLB(SOURCE/'models/tripo-1-move/model.glb');new=GLB(SOURCE/'models/tripo-1-move-v2/model.glb')
report={'sourceSha256':hashlib.sha256(new.bytes).hexdigest(),'sourceBytes':len(new.bytes),'preservedFiles':[],'geometry':[],'morphs':[],'skins':[],'tracks':[]}
assert report['sourceSha256']=='f79c634f1711bbed96a45cfd466afb60e6d3667fe6f3938162e24f7143abecd5'
for path,expected in json.loads((SOURCE/'rigging/tripo-1-move-v2/previous-version-hashes.json').read_text(encoding='utf-8')).items():
 actual=hashlib.sha256(Path(path).read_bytes()).hexdigest();assert actual==expected,path;report['preservedFiles'].append({'path':path,'sha256':actual})
def compare(a,b,where,tolerance=0):
 assert a.shape==b.shape,where;delta=float(np.max(np.abs(a.astype(float)-b.astype(float)),initial=0));assert delta<=tolerance,(where,delta)
 return {'field':where,'same':np.array_equal(a,b),'maxDelta':delta}
for om in old.g['meshes']:
 nm=next(m for m in new.g['meshes']if m['name']==om['name'])
 assert len(om['primitives'])==len(nm['primitives'])
 for op,np_ in zip(om['primitives'],nm['primitives']):
  for key,accessor in op['attributes'].items():
   tolerance=1.2e-7 if key in ['POSITION','NORMAL']and om['name']!='tripo_mesh_b9a89d0a'else 0
   report['geometry'].append(compare(old.arr(accessor),new.arr(np_['attributes'][key]),om['name']+'/'+key,tolerance))
  report['geometry'].append(compare(old.arr(op['indices']),new.arr(np_['indices']),om['name']+'/indices'))
  assert om.get('extras',{}).get('targetNames')==nm.get('extras',{}).get('targetNames')
  assert len(op.get('targets',[]))==len(np_.get('targets',[]))
  for i,(ot,nt)in enumerate(zip(op.get('targets',[]),np_.get('targets',[]))):
   for key in ot:report['morphs'].append(compare(old.arr(ot[key]),new.arr(nt[key]),f'{om["name"]}/morph{i}/{key}'))
for os in old.g['skins']:
 ns=next(s for s in new.g['skins']if s['name']==os['name']);assert [old.g['nodes'][j]['name']for j in os['joints']]==[new.g['nodes'][j]['name']for j in ns['joints']]
 # Blender's halo matrix re-export differs by three float32 ulps; body skin stays exact.
 report['skins'].append(compare(old.arr(os['inverseBindMatrices']),new.arr(ns['inverseBindMatrices']),os['name']+'/inverseBindMatrices',2e-7 if os['name']=='RIG_Halo_Cloth'else 0))
assert len(old.g['nodes'])==len(new.g['nodes'])
report['nodeStructureIdentical']=True;report['nodeTransformDifferences']=[];report['nodeMetadataDifferences']=[]
for o,n in zip(old.g['nodes'],new.g['nodes']):
 excluded={'translation','rotation','scale','extras'}
 assert {k:v for k,v in o.items()if k not in excluded}=={k:v for k,v in n.items()if k not in excluded},o['name']
 for field,default in [('translation',[0,0,0]),('rotation',[0,0,0,1]),('scale',[1,1,1])]:
  a,b=np.array(o.get(field,default)),np.array(n.get(field,default))
  if not np.array_equal(a,b):
   assert o['name'].startswith(('DEF_HaloCloth_','CTRL_Halo_')),o['name']
   report['nodeTransformDifferences'].append(compare(a,b,o['name']+'/'+field,2e-7))
 if o.get('extras')!=n.get('extras'):report['nodeMetadataDifferences'].append(o['name'])
for name in ['Chimera_Organic_Walk_2p4s','Chimera_Arcane_Cast_3s','Soft_Breath_and_Bust','Halo_Slow_Orbit_48s','Halo_Cloth_Gravity_48s']:
 ot,nt=old.tracks(name),new.tracks(name);assert ot.keys()==nt.keys();changedHair=[];checked=0
 for key,o in ot.items():
  n=nt[key]
  if name=='Chimera_Arcane_Cast_3s'and key[0].startswith('DEF_Hair_'):
   if not np.array_equal(old.arr(o['output']),new.arr(n['output'])):changedHair.append('/'.join(key))
   continue
  assert o.get('interpolation','LINEAR')==n.get('interpolation','LINEAR');compare(old.arr(o['input']),new.arr(n['input']),name+str(key)+'input');compare(old.arr(o['output']),new.arr(n['output']),name+str(key)+'output');checked+=1
 report['tracks'].append({'clip':name,'equalChannels':checked,'changedCastHairChannels':changedHair})
report['nodesSame']=old.g['nodes']==new.g['nodes'];report['triangles']=sum(new.g['accessors'][p['indices']]['count']//3 for m in new.g['meshes']for p in m['primitives']);report['deformJoints']=sum(len(s['joints'])for s in new.g['skins'])
(OUT/'source-comparison.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps({k:v for k,v in report.items()if k not in ['preservedFiles','geometry','morphs','skins']},ensure_ascii=False))
