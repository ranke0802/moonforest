"""Fit the supplied loose monster props to MoonForest's existing sword grip and pack their painted UVs.
Usage: python fit-chapter-weapons.py PROJECT OUTPUT_DIR. Requires NumPy/Pillow and toktx.
"""
import io, os, shutil, subprocess, sys, tempfile
from pathlib import Path
import numpy as np
from PIL import Image
from chapter_creature_gltf import GLB,Pack
project,out=map(lambda arg:Path(arg).resolve(),sys.argv[1:3]);out.mkdir(parents=True,exist_ok=True)
source=project/'Sources/actors/tripo-cast/2026-11-18-v1/prop'
# Grip-to-tip axis, grip fraction from pommel, and length in the standard sword's local frame.
spec={'goblin-warrior-dagger':([0,1,0],.174,1.52),'goblin-archer-bow':([0,1,0],.50,1.90),
      'goblin-shaman-staff':([0,1,0],.32,2.31),'hobgoblin-club':([0,0,1],.17,1.90),
      'ghoul-cleaver':([0,-.36,.933],.14,1.98)}
exe=os.getenv('TOKTX_EXE') or shutil.which('toktx')
if not exe:raise RuntimeError('toktx missing')
for name,(direction,fraction,length) in spec.items():
    model=GLB(source/(name+'.glb'));prim=model.doc['meshes'][0]['primitives'][0];a=prim['attributes']
    axis=np.array(direction,dtype=float);axis/=np.linalg.norm(axis)
    width=np.cross([1.,0,0],axis);depth=np.cross(width,-axis)
    orient=np.array([width,-axis,depth])
    p=model.array(a['POSITION'])@orient.T;normals=model.array(a['NORMAL'])@orient.T
    long=-p[:,1];size=np.ptp(long);grip=long.min()+size*fraction
    ring=abs(long-grip)<size*.045
    center=(np.percentile(p[ring],10,axis=0)+np.percentile(p[ring],90,axis=0))*.5
    center[1]=-grip
    p=(p-center)*length/size;p[:,1]+=.72
    pack=Pack();d=pack.doc;idx=pack.array(model.array(prim['indices']),'SCALAR',5123,34963)
    attr={'POSITION':pack.array(p,target=34962,bounds=True),'NORMAL':pack.array(normals,target=34962),
          'TEXCOORD_0':pack.array(model.array(a['TEXCOORD_0']),'VEC2',target=34962)}
    d.pop('animations');d.pop('skins');d['scenes'][0]['nodes']=[0];d['nodes']=[{'mesh':0,'name':name}]
    d['meshes']=[{'name':name,'primitives':[{'attributes':attr,'indices':idx,'material':0}]}]
    with tempfile.TemporaryDirectory() as folder:
        folder=Path(folder);img=Image.open(io.BytesIO(model.view(model.doc['images'][0]['bufferView']))).convert('RGB')
        img.thumbnail((1024,1024),Image.Resampling.LANCZOS);img.save(folder/'color.png')
        subprocess.run([exe,'--t2','--encode','etc1s','--qlevel','205','--genmipmap','--assign_oetf','srgb',
                        '--assign_primaries','bt709','--threads','2',str(folder/'color.ktx2'),str(folder/'color.png')],check=True)
        texture=pack.view((folder/'color.ktx2').read_bytes())
    d['images']=[{'bufferView':texture,'mimeType':'image/ktx2','name':name+' albedo'}]
    d['textures']=[{'sampler':0,'extensions':{'KHR_texture_basisu':{'source':0}}}]
    d['samplers']=[{'magFilter':9729,'minFilter':9987}]
    d['extensionsUsed']=d['extensionsRequired']=['KHR_texture_basisu']
    d['materials']=[{'name':name+' painted','pbrMetallicRoughness':{'baseColorTexture':{'index':0},'metallicFactor':0,'roughnessFactor':.9}}]
    pack.write(out/(name+'.glb'))
    print(name,len(model.array(prim['indices']))//3,(out/(name+'.glb')).stat().st_size,flush=True)
