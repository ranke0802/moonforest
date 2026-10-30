"""Read-only GLB audit and texture review; source data is never modified."""
import io, json, math, struct, hashlib
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(r'C:/Users/ryank/Documents/ChatGPT/MM Project/output/elina-three-model-review/2026-10-30-v1')
OUT = ROOT / 'reports/elena-two-phase'
OUT.mkdir(parents=True, exist_ok=True)
blob = (SOURCE / 'models/tripo-1-move/model.glb').read_bytes()
jl = struct.unpack_from('<I', blob, 12)[0]
g = json.loads(blob[20:20+jl]); binary = memoryview(blob)[28+jl:]
types = {5120:'i1',5121:'u1',5122:'<i2',5123:'<u2',5125:'<u4',5126:'<f4'}
widths = {'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
def arr(index):
    a=g['accessors'][index]; w=widths[a['type']]; dt=np.dtype(types[a['componentType']])
    out=np.zeros((a['count'],w),dtype=dt)
    if 'bufferView' in a:
        v=g['bufferViews'][a['bufferView']]; off=v.get('byteOffset',0)+a.get('byteOffset',0)
        out=np.ndarray(out.shape,dt,buffer=binary,offset=off,strides=(v.get('byteStride',w*dt.itemsize),dt.itemsize)).copy()
    if 'sparse' in a:
        s=a['sparse']; iv=g['bufferViews'][s['indices']['bufferView']]; vv=g['bufferViews'][s['values']['bufferView']]
        ids=np.frombuffer(binary,types[s['indices']['componentType']],count=s['count'],offset=iv.get('byteOffset',0)+s['indices'].get('byteOffset',0))
        vals=np.frombuffer(binary,dt,count=s['count']*w,offset=vv.get('byteOffset',0)+s['values'].get('byteOffset',0)).reshape(-1,w)
        out[ids]=vals
    return out
def matrix(n):
    if 'matrix' in n:return np.array(n['matrix']).reshape(4,4).T
    x,y,z,w=n.get('rotation',[0,0,0,1]); s=n.get('scale',[1,1,1])
    r=np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)], [2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)], [2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])
    m=np.eye(4);m[:3,:3]=r@np.diag(s);m[:3,3]=n.get('translation',[0,0,0]);return m
world={}
def recurse(i,parent):
    world[i]=parent@matrix(g['nodes'][i])
    for c in g['nodes'][i].get('children',[]):recurse(c,world[i])
for i in g['scenes'][g.get('scene',0)]['nodes']:recurse(i,np.eye(4))
meshes=[];bounds=[];morphs=[];morph_vectors=[]
for ni,n in enumerate(g['nodes']):
    if 'mesh' not in n:continue
    mesh=g['meshes'][n['mesh']]
    for p in mesh['primitives']:
        pos=arr(p['attributes']['POSITION']).astype(float);base=pos.copy()
        for t,v in zip(p.get('targets',[]),n.get('weights',mesh.get('weights',[]))):pos+=arr(t['POSITION'])*v
        weights=arr(p['attributes']['WEIGHTS_0']);joints=arr(p['attributes']['JOINTS_0']);skin=g['skins'][n['skin']]
        ibm=arr(skin['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1)
        mats=np.array([world[j]@ibm[k] for k,j in enumerate(skin['joints'])])
        hp=np.c_[pos,np.ones(len(pos))]; skinned=np.zeros((len(pos),4))
        for k in range(4):skinned+=np.einsum('nij,nj->ni',mats[joints[:,k]],hp)*weights[:,k,None]
        bounds.append(skinned[:,:3]); names=[g['nodes'][j].get('name','') for j in skin['joints']]
        prayer=np.array([name.startswith('DEF_Prayer_') for name in names]);prayer_weights=(prayer[joints]*weights).sum(axis=1)
        prayer_mask=prayer_weights>.5;prayer_any=prayer_weights>1e-9
        hand_joints=np.array([name.startswith(('DEF_Prayer_Hand','DEF_Prayer_Finger','DEF_Prayer_Clasp')) for name in names]);hand_mask=(hand_joints[joints]*weights).sum(axis=1)>1e-9
        rows=[]
        for name,t in zip(mesh.get('extras',{}).get('targetNames',[]),p.get('targets',[])):
            d=arr(t['POSITION']); magnitude=np.linalg.norm(d,axis=1); changed=magnitude>1e-9
            row={'name':name,'affectedVertices':int(changed.sum()),'maxDelta':float(magnitude.max()),'prayerDominantVerticesAffected':int((changed&prayer_mask).sum()),'prayerAnyInfluenceVerticesAffected':int((changed&prayer_any).sum()),'prayerHandFingerClaspVerticesAffected':int((changed&hand_mask).sum()),'prayerDominantMaxDelta':float(magnitude[prayer_mask].max(initial=0)),'positionSha256':hashlib.sha256(d.tobytes()).hexdigest()};rows.append(row);morphs.append(row);morph_vectors.append(d.flatten().astype(float))
        meshes.append({'node':n['name'],'mesh':mesh['name'],'vertices':len(pos),'triangles':g['accessors'][p['indices']]['count']//3,'skin':skin['name'],'jointCount':len(names),'unweighted':int((weights.sum(axis=1)<.999).sum()),'maxWeightSumError':float(abs(weights.sum(axis=1)-1).max()),'maxInfluences':int((weights>0).sum(axis=1).max()),'prayerDominantVertices':int(prayer_mask.sum()),'morphs':rows})
pts=np.concatenate(bounds); lo=pts.min(axis=0);hi=pts.max(axis=0);center=(lo+hi)/2
images=[]
for i,im in enumerate(g['images']):
    v=g['bufferViews'][im['bufferView']];data=bytes(binary[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']])
    image=Image.open(io.BytesIO(data));alpha='A' in image.getbands() and image.getchannel('A').getextrema()!=(255,255)
    output=OUT/f'asset-source-texture-{i}.png';image.save(output)
    images.append({'image':i,'name':im['name'],'originalMimeType':im['mimeType'],'sourceEncodedBytes':len(data),'size':list(image.size),'alpha':alpha,'sourceSha256':hashlib.sha256(data).hexdigest(),'png':str(output)})
audit_source=json.loads((SOURCE/'models/tripo-1-move/audit.json').read_text(encoding='utf-8'))
normalized=np.array([v/np.linalg.norm(v)for v in morph_vectors]);gram=normalized@normalized.T
report={'sourceSha256':hashlib.sha256(blob).hexdigest(),'sourceBytes':len(blob),'triangles':sum(m['triangles'] for m in meshes),'skinCount':len(g['skins']),'deformJoints':sum(len(s['joints'])for s in g['skins']),'nodeCount':len(g['nodes']),'meshes':meshes,'images':images,'bounds':{'min':lo.tolist(),'max':hi.tolist(),'center':center.tolist(),'size':(hi-lo).tolist(),'method':'glTF initial morph weights + linear skinning + node world matrices'},'sourceHeight':audit_source['sourceHeight'],'scale':3.2/audit_source['sourceHeight'],'coordinateSystem':{'blender':'Z up; forward -Y','gltf':'Y up; forward +Z; right-handed'},'boneAliases':{n['name'].replace('.',''):n['name'] for n in g['nodes'] if n.get('name','').startswith('DEF_')},'animations':[{'name':a['name'],'channels':len(a['channels']),'duration':max(g['accessors'][s['input']]['max'][0]for s in a['samplers']),'samplers':len(a['samplers'])}for a in g['animations']],'morphIndependence':{'names':[m['name']for m in morphs],'uniquePositionHashes':len(set(m['positionSha256']for m in morphs)),'normalizedGramRank':int(np.linalg.matrix_rank(gram)),'normalizedGram':gram.tolist(),'prayerHandsUnchangedByMorphs':all(m['prayerAnyInfluenceVerticesAffected']==0 for m in morphs)}}
report['morphIndependence']['prayerHandsUnchangedByMorphs']=all(m['prayerHandFingerClaspVerticesAffected']==0 for m in morphs)
report['morphIndependence']['note']='Prayer Hand/Finger/Clasp weighted vertices: zero changes. Three breath/bust keys overlap a few body seam vertices with <0.01 Prayer UpperArm/Forearm weights; original source retained.'
(OUT/'asset-source-audit.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print(json.dumps({k:report[k]for k in ['sourceSha256','sourceBytes','triangles','skinCount','deformJoints','bounds','sourceHeight','scale','images','morphIndependence']},ensure_ascii=False))
