"""Small glTF reader/writer for offline actor preparation. Uses only the original embedded GLBs."""
import json
import struct
from pathlib import Path

import numpy as np
from scipy.spatial.transform import Rotation

TYPES={5121:'u1',5123:'<u2',5125:'<u4',5126:'<f4'}
WIDTH={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
IDENTITY=np.array([0.,0.,0.,1.])

class GLB:
    def __init__(self,path):
        self.path=Path(path)
        raw=self.path.read_bytes()
        n=struct.unpack_from('<I',raw,12)[0]
        self.doc=json.loads(raw[20:20+n])
        self.data=raw[28+n:]
    def view(self,i):
        v=self.doc['bufferViews'][i]
        pos=v.get('byteOffset',0)
        return self.data[pos:pos+v['byteLength']]
    def array(self,i):
        a=self.doc['accessors'][i]
        width=WIDTH[a['type']]
        dtype=np.dtype(TYPES[a['componentType']])
        v=self.doc['bufferViews'][a['bufferView']]
        return np.ndarray((a['count'],width),dtype,buffer=self.view(a['bufferView']),
                          offset=a.get('byteOffset',0),
                          strides=(v.get('byteStride',width*dtype.itemsize),dtype.itemsize)).copy()

class Pack:
    def __init__(self):
        self.data=bytearray()
        self.doc={'asset':{'version':'2.0','generator':'MoonForest creature fitting'},'scene':0,
                  'scenes':[{'nodes':[]}],'nodes':[],'skins':[],'meshes':[],'animations':[],
                  'bufferViews':[],'accessors':[]}
    def view(self,raw,target=None):
        self.data.extend(b'\0'*(-len(self.data)%4))
        v={'buffer':0,'byteOffset':len(self.data),'byteLength':len(raw)}
        if target:v['target']=target
        self.doc['bufferViews'].append(v);self.data.extend(raw)
        return len(self.doc['bufferViews'])-1
    def array(self,values,kind='VEC3',ct=5126,target=None,bounds=False):
        arr=np.ascontiguousarray(values,dtype=TYPES[ct]).reshape(-1,WIDTH[kind])
        a={'bufferView':self.view(arr.tobytes(),target),'componentType':ct,'count':len(arr),'type':kind}
        if bounds:a.update(min=arr.min(0).tolist(),max=arr.max(0).tolist())
        self.doc['accessors'].append(a)
        return len(self.doc['accessors'])-1
    def write(self,path):
        self.data.extend(b'\0'*(-len(self.data)%4))
        self.doc['buffers']=[{'byteLength':len(self.data)}]
        meta=json.dumps(self.doc,separators=(',',':'),allow_nan=False).encode()
        meta+=b' '*(-len(meta)%4)
        total=28+len(meta)+len(self.data)
        Path(path).write_bytes(struct.pack('<4sIII4s',b'glTF',2,total,len(meta),b'JSON')+meta+
                               struct.pack('<I4s',len(self.data),b'BIN\0')+self.data)

def aligned(a,b):
    a=a/np.linalg.norm(a);b=b/np.linalg.norm(b)
    cross=np.cross(a,b);norm=np.linalg.norm(cross);dot=np.clip(np.dot(a,b),-1,1)
    if norm<1e-6:
        if dot>0:return Rotation.identity()
        axis=np.cross(a,[0,0,1] if abs(a[2])<.9 else [1,0,0])
        return Rotation.from_rotvec(axis/np.linalg.norm(axis)*np.pi)
    return Rotation.from_rotvec(cross*(np.arctan2(norm,dot)/norm))

class SourcePose:
    def __init__(self,path):
        model=GLB(path);self.model=model
        self.nodes=model.doc['nodes']
        self.ids={n.get('name','').split(':')[-1]:i for i,n in enumerate(self.nodes)}
        self.parents={c:i for i,n in enumerate(self.nodes) for c in n.get('children',[])}
        self.walk=[]
        def visit(i):
            self.walk.append(i)
            for c in self.nodes[i].get('children',[]):visit(c)
        for i in range(len(self.nodes)):
            if i not in self.parents:visit(i)
        self.trs=[]
        for n in self.nodes:
            if 'matrix' in n:
                m=np.array(n['matrix']).reshape(4,4).T
                sc=np.linalg.norm(m[:3,:3],axis=0)
                self.trs.append((m[:3,3],Rotation.from_matrix(m[:3,:3]/sc).as_quat(),sc))
            else:
                self.trs.append((n.get('translation',[0,0,0]),n.get('rotation',IDENTITY),n.get('scale',[1,1,1])))
        self.actions={a['name']:a for a in model.doc.get('animations',[])}
        self.rest=self.world(None,np.array([0.]))
    def world(self,name,times):
        count=len(times);size=len(self.nodes)
        local=np.zeros((count,size,4,4));local[:,:,3,3]=1
        channel={}
        if name:
            a=self.actions[name]
            for c in a['channels']:
                samp=a['samplers'][c['sampler']];target=c['target']
                time=self.model.array(samp['input']).reshape(-1)
                data=self.model.array(samp['output'])
                if samp.get('interpolation')=='CUBICSPLINE':data=data[1::3]
                lo=np.maximum(0,np.searchsorted(time,times,'right')-1);hi=np.minimum(lo+1,len(time)-1)
                t=np.clip((times-time[lo])/np.maximum(1e-8,time[hi]-time[lo]),0,1)[:,None]
                if samp.get('interpolation')=='STEP':t*=0
                left=data[lo];right=data[hi]
                if target['path']=='rotation':right=np.where((left*right).sum(1)[:,None]<0,-right,right)
                channel[(target['node'],target['path'])]=left+(right-left)*t
        for i in self.walk:
            pos,quat,scale=self.trs[i]
            pos=channel.get((i,'translation'),pos);quat=channel.get((i,'rotation'),quat);scale=channel.get((i,'scale'),scale)
            local[:,i,:3,3]=pos
            local[:,i,:3,:3]=Rotation.from_quat(quat).as_matrix()*np.asarray(scale)[...,None,:]
            if i in self.parents:local[:,i]=local[:,self.parents[i]]@local[:,i]
        return local
    def length(self,action):
        return max(float(self.model.array(s['input'])[-1,0]) for s in self.actions[action]['samplers'])
