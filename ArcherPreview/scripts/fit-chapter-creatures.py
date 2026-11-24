"""Fit and skin supplied humanoids, transfer selected MoonForest actions, package a one-material GLB.
Usage: python fit-chapter-creatures.py PROJECT REDUCED_DIR OUTPUT_DIR [species ...]
The mesh cache is produced by reduce-chapter-creatures.py. Requires NumPy, SciPy, Pillow & toktx.
"""
import io, json, math, os, shutil, subprocess, sys, tempfile
from functools import lru_cache
from pathlib import Path
import numpy as np
from PIL import Image
from scipy.spatial.transform import Rotation
from scipy.sparse import coo_matrix,diags
from chapter_creature_gltf import GLB, Pack, SourcePose, aligned
from chapter_creature_jaw import bind_chapter_jaw

PROJECT,REDUCED,OUT=map(lambda v:Path(v).resolve(),sys.argv[1:4])
HEIGHT={'goblin-warrior':1.36,'goblin-shaman':1.39,'goblin-archer':1.31,'hobgoblin-boss':1.98,
        'ghoul-warrior':1.79,'zombie':1.71}
GOB='ArcherPreview/assets/models/hooded-goblin.glb'
HERO='ArcherPreview/assets/models/violet-warrior-v3.glb'
NPC='Sources/actors/blacksmith-npc/source/meshy-web/glb/'
@lru_cache(maxsize=8)
def posefile(f):return SourcePose(PROJECT/f)

def bones_for(kind,q):
    # Fractions of crown-to-sole height, measured on the supplied front/profile views.
    stanced=kind in ('ghoul-warrior','zombie')
    shoulder={'goblin-archer':.735,'goblin-warrior':.755,'goblin-shaman':.74,'hobgoblin-boss':.72,
              'ghoul-warrior':.774,'zombie':.78}[kind]
    hip=.50 if kind!='hobgoblin-boss' else .47
    armspan=(q[:,0].max()-q[:,0].min())*.5
    width={'hobgoblin-boss':.224,'goblin-warrior':.174,'goblin-archer':.145,'goblin-shaman':.16,
           'ghoul-warrior':.143,'zombie':.119}[kind]
    # Use measured mesh depth at joint slices so shorter or hunched torsos do not inherit a human pivot.
    def depth(x,y,default=0,band=.045):
        mask=(abs(q[:,0]-x)<band)&(abs(q[:,1]-y)<.027)
        z=q[mask,2]
        return float((np.percentile(z,12)+np.percentile(z,83))*.5) if len(z)>=6 else default
    B={}
    def add(name,parent,x,y,z,source,child=None):
        B[name]={'p':parent,'t':np.array([x,y,z]),'s':source,'axis':child}
    add('Hips',None,0,hip,depth(0,hip),'Hips')
    add('Spine','Hips',0,hip+.076,depth(0,hip+.076),'Spine')
    add('Chest','Spine',0,shoulder-.05,depth(0,shoulder-.05),'Spine2')
    add('Neck','Chest',0,shoulder+.048,depth(0,shoulder+.048),'Neck')
    add('Head','Neck',0,shoulder+.094,depth(0,shoulder+.094),'Head')
    for sign,side,src in [(1,'L','Left'),(-1,'R','Right')]:
        upper=width*sign; fore=(width+(armspan*.8-width)*.52)*sign
        hand=(armspan*(.885 if stanced else .82))*sign
        end=armspan*.99*sign
        # Hanging hands have a much larger drop below the shoulder than T-posed casters.
        elbow_y=shoulder-(.154 if stanced else .008);wrist_y=shoulder-(.285 if stanced else .004)
        hand_y=wrist_y-.049 if stanced else wrist_y-.009
        def sj(n,parent,x,y,ds,source,nextN=None):
            add(n+'.'+side,parent,x,y,depth(x,y,ds),src+source,nextN+'.'+side if nextN else None)
        sj('Clavicle','Chest',sign*.047,shoulder,0,'Shoulder','Arm')
        sj('Arm','Clavicle.'+side,upper,shoulder,0,'Arm','Forearm')
        sj('Forearm','Arm.'+side,fore,elbow_y,0,'ForeArm','Hand')
        sj('Hand','Forearm.'+side,hand,wrist_y,0,'Hand')
        thigh=width*(.64 if stanced else .53)*sign; knee=width*.91*sign; ankle=width*1.15*sign
        sj('Thigh','Hips',thigh,hip-.023,0,'UpLeg','Shin')
        sj('Shin','Thigh.'+side,knee,.28,0,'Leg','Foot')
        sj('Foot','Shin.'+side,ankle,.07,0,'Foot','Toe')
        add('Toe.'+side,'Foot.'+side,ankle,.027,B['Foot.'+side]['t'][2]+.076,src+'ToeBase')
    return B

def skin_positions(q,B,tri,kind):
    names=list(B);segments=[]
    children={key:[] for key in names}
    for name,b in B.items():
        if b['p']:children[b['p']].append(name)
    for name,b in B.items():
        a=b['t']; child=b['axis'] or (children[name][0] if children[name] else None)
        e=B[child]['t'] if child else a+({'Head':np.array([0,.17,0])}.get(name,np.array([0,0,.034])))
        v=e-a;t=np.clip((q-a)@v/max(v@v,1e-8),0,1)
        delta=q-(a+t[:,None]*v)
        score=delta[:,0]**2+delta[:,1]**2+delta[:,2]**2*.46
        if name=='Head':
            central=(abs(q[:,0])<.17)&(q[:,1]>a[1]-.026)
            score[central]*=.32
        elif name.startswith(('Arm.','Forearm.','Hand.','Clavicle.')):
            score[(abs(q[:,0])<.11)&(q[:,1]>B['Head']['t'][1]-.012)]+=.3
        if name.startswith(('Thigh.','Shin.','Foot.','Toe.')):
            wrongSide=q[:,0]<-.012 if name.endswith('.L') else q[:,0]>.012
            score[wrongSide]+=.5
            score+=np.clip((q[:,1]-B['Hips']['t'][1]-.018)/.045,0,1)*.25
        if kind in ('zombie','ghoul-warrior'):
            # In the hanging-arm bind pose, separate the sleeve from the
            # neighboring tabard before smoothing; the two are millimetres apart.
            boundary=np.interp(q[:,1],[.43,.5,.55,.6,.65,.72],[.172,.166,.145,.125,.111,.095])
            low=np.clip((.74-q[:,1])/.08,0,1)
            if name.startswith(('Arm.','Forearm.','Hand.')):
                score+=np.clip((boundary-abs(q[:,0]))/.016,0,1)*low*.32
            else:
                score+=np.clip((abs(q[:,0])-boundary-.012)/.02,0,1)*low*np.clip((q[:,1]-.4)/.05,0,1)*.32
        # Long goblin ears and crowns sit above the shoulder line but may be
        # geometrically closer to a T-posed upper arm than to the cranium.
        # Their entire span follows the skull when that arm drops into idle.
        if name!='Head':
            crown=np.clip((q[:,1]-(B['Neck']['t'][1]+.006))/.047,0,1)
            crown*=np.clip((.27-abs(q[:,0]))/.065,0,1)
            score+=crown*.9
        segments.append(score)
    d=np.stack(segments,1)
    w=np.exp(-(d-d.min(axis=1,keepdims=True))/.0014)
    w/=w.sum(axis=1,keepdims=True)
    # Average along the actual surface, welding UV seams only for weighting.
    # Adjacent sleeve/coat surfaces can be close in A-pose but on different limbs.
    _,vmap=np.unique(np.round(q,5),axis=0,return_inverse=True)
    t=vmap[tri.reshape(-1,3)]
    sides=np.vstack((t[:,[0,1]],t[:,[1,2]],t[:,[2,0]]))
    sides=np.unique(np.sort(sides,axis=1),axis=0)
    a,b=sides.T
    rows,cols=np.r_[a,b],np.r_[b,a]
    adj=coo_matrix((np.ones(len(rows)),(rows,cols)),shape=(vmap.max()+1,)*2).tocsr()
    avg=diags(1/np.maximum(1,np.asarray(adj.sum(axis=1)).ravel()))@adj
    grouped=np.zeros((len(avg.indptr)-1,len(B)))
    np.add.at(grouped,vmap,w)
    grouped/=np.maximum(1,np.bincount(vmap))[:,None]
    for _ in range(5):grouped=.52*grouped+.48*(avg@grouped)
    w=grouped[vmap]
    ids=np.argsort(-w,axis=1)[:,:4]
    w=np.take_along_axis(w,ids,axis=1)
    w[w<.005]=0;w/=w.sum(1)[:,None]
    return ids,w

def ktx_image(model,cache,kind):
    p=cache/(kind+'-color.ktx2')
    if p.exists():return p.read_bytes()
    image=Image.open(io.BytesIO(model.view(model.doc['images'][0]['bufferView']))).convert('RGB')
    image.thumbnail((2048,2048),Image.Resampling.LANCZOS)
    source=cache/(kind+'-color.png');image.save(source)
    exe=os.getenv('TOKTX_EXE') or shutil.which('toktx')
    if not exe:raise RuntimeError('toktx is required for the runtime texture.')
    subprocess.run([exe,'--t2','--encode','etc1s','--qlevel','210','--clevel','2',
                    '--threads','2','--genmipmap','--assign_oetf','srgb','--assign_primaries','bt709',
                    str(p),str(source)],check=True,stdout=subprocess.DEVNULL)
    return p.read_bytes()

def make_action(pack,B,ids,weights,q,kind,label,clip,reference):
    names=list(B);src=posefile(reference)
    duration=src.length(clip);frame_count=max(3,int(np.ceil(duration*18))+1)
    times=np.linspace(0,duration,frame_count)
    original=src.world(clip,times);base=src.rest[0]
    pelvis=src.ids['Hips']
    src_height=max(.2,(src.rest[0,src.ids['Head'],1,3]-src.rest[0,src.ids['LeftFoot'],1,3])/.80)
    rest_positions=np.array([B[n]['t'] for n in names])
    parents=[names.index(B[n]['p']) if B[n]['p'] else -1 for n in names]
    worlds={};locals_={};positions={};targetHeight=HEIGHT[kind]
    T=(original[:,pelvis,:3,3]-original[0,pelvis,:3,3])/src_height
    # Locomotion belongs to the encounter controller; the body carries vertical motion and falls.
    T[:,[0,2]]=np.clip(T[:,[0,2]],-.14,.14) if label=='Death' else 0
    moves=(np.linspace(0,1,frame_count));attack=np.sin(np.pi*moves)**1.3
    for i,name in enumerate(names):
        b=B[name];j=src.ids[b['s']]
        # Polar decomposition (some authoring rigs have a scale on their root).
        def rotation(ms):
            return Rotation.from_matrix(ms/np.maximum(1e-8,np.linalg.norm(ms,axis=-2,keepdims=True)))
        basis=rotation(base[j,:3,:3]);live=rotation(original[:,j,:3,:3]);orientation=live*basis.inv()
        child=b['axis']
        if child:
            k=src.ids[B[child]['s']]
            # Reorient the neutral source limb to this specific A/T stance before applying motion.
            orientation=orientation*aligned(B[child]['t']-b['t'],base[k,:3,3]-base[j,:3,3])
        # Terminal hands/foot ends follow the parent swing, plus the actual authored twist.
        elif name.startswith(('Hand.','Toe.')):
            parent=names[parents[i]];pb=B[parent];sp=src.ids[pb['s']]
            orientation=orientation*aligned(b['t']-pb['t'],base[j,:3,3]-base[sp,:3,3])
        if label=='Walk' and kind=='zombie' and name in ('Thigh.L','Shin.L','Foot.L','Toe.L'):
            # The left side trails with a short step, low recovery and delayed toe release.
            ref=orientation.as_rotvec();ref=ref.mean(axis=0)+(np.roll(ref,max(1,frame_count//10),axis=0)-ref.mean(axis=0))*.24
            orientation=Rotation.from_rotvec(ref)
        if label=='Attack' and kind in ('goblin-archer','goblin-shaman') and name.startswith(('Arm.','Forearm.')):
            # Distinct bow hold/draw or cast; aim the authored arm joints at the forward +Z.
            side=1 if name.endswith('.L') else -1
            if kind=='goblin-archer':
                direction=np.array([.07*side,.035,.8]) if side>0 else (np.array([-.65,.12,-.08]) if name.startswith('Arm') else np.array([.48,.08,.36]))
            else:
                direction=np.array([.15*side,.85,.24]) if side<0 else np.array([.24,.14,.85])
            wanted=aligned(B[child]['t']-b['t'],direction)
            blend=(wanted*orientation.inv()).as_rotvec()*attack[:,None]
            orientation=Rotation.from_rotvec(blend)*orientation
        worlds[name]=orientation
        par=b['p']
        local=worlds[par].inv()*orientation if par else orientation
        quats=local.as_quat()
        for t in range(1,len(quats)):
            if np.dot(quats[t-1],quats[t])<0:quats[t]*=-1
        locals_[name]=quats
        positions[name]=(positions[par]+worlds[par].apply(b['t']-B[par]['t'])) if par else b['t']+T
    # Anchor to the support sole; include head/back/protruding armor for the death pose.
    probe=np.unique(np.r_[np.argsort(q[:,1])[:80],np.linspace(0,len(q)-1,min(480,len(q)),dtype=int)])
    deformed=np.zeros((frame_count,len(probe),3))
    for col in range(4):
        indices=ids[probe,col]
        for i in np.unique(indices):
            name=names[i];mask=indices==i;points=q[probe[mask]]-rest_positions[i]
            rotated=np.einsum('tij,pj->tpi',worlds[name].as_matrix(),points)
            deformed[:,mask]+=(rotated+positions[name][:,None,:])*weights[probe[mask],col][None,:,None]
    floor=deformed[:,:,1].min(axis=1)
    hip=(positions['Hips']-np.stack((floor*0,floor,floor*0),axis=1))*targetHeight
    out={'name':label,'channels':[],'samplers':[]}
    time_id=pack.array(times,'SCALAR',bounds=True)
    def channel(i,role,values,fmt):
        out['channels'].append({'sampler':len(out['samplers']),'target':{'node':i,'path':role}})
        out['samplers'].append({'input':time_id,'output':pack.array(values,fmt),'interpolation':'LINEAR'})
    hips_index=names.index('Hips')
    channel(hips_index,'translation',hip,'VEC3')
    for i,name in enumerate(names):
        channel(i,'rotation',locals_[name],'VEC4')
    pack.doc['animations'].append(out)

def fit(kind,cache):
    m=GLB(REDUCED/(kind+'.glb'));doc=m.doc;prim=doc['meshes'][0]['primitives'][0];a=prim['attributes']
    raw=m.array(a['POSITION'])
    q=raw[:,[2,1,0]].astype(float);q[:,0]*=-1
    q[:,[0,2]]-=(q.max(0)+q.min(0))[[0,2]]*.5;q[:,1]-=q[:,1].min();q/=q[:,1].max()
    h=HEIGHT[kind];normal=m.array(a['NORMAL'])[:,[2,1,0]];normal[:,0]*=-1
    B=bones_for(kind,q);names=list(B);ids,weights=skin_positions(q,B,m.array(prim['indices']),kind)
    out=Pack();d=out.doc;inverse=[]
    for name,b in B.items():
        par=b['p'];pos=(b['t']-(B[par]['t'] if par else 0))*h
        d['nodes'].append({'name':name,'translation':pos.tolist()})
        if par:d['nodes'][names.index(par)].setdefault('children',[]).append(names.index(name))
        inv=np.eye(4);inv[:3,3]=-b['t']*h;inverse.append(inv.T.flatten())
    mesh_id=len(names);d['nodes'].append({'name':kind+'-body','mesh':0,'skin':0})
    d['scenes'][0]['nodes']=[0,mesh_id]
    d['skins']=[{'name':kind+'-rig','skeleton':0,'joints':list(range(len(names))),'inverseBindMatrices':out.array(inverse,'MAT4')}]
    # The adjustment is confined to skin attributes. Motion fitting and authored foot contact
    # continue to use their original sample weights, preserving the existing action tracks.
    skin_ids,skin_weights=bind_chapter_jaw(kind,raw,names,ids,weights)
    attr={'POSITION':out.array(q*h,target=34962,bounds=True),'NORMAL':out.array(normal,target=34962),
          'TEXCOORD_0':out.array(m.array(a['TEXCOORD_0']),'VEC2',target=34962),
          'JOINTS_0':out.array(skin_ids,'VEC4',5121,34962),'WEIGHTS_0':out.array(skin_weights,'VEC4',target=34962)}
    index=out.array(m.array(prim['indices']),'SCALAR',5123,34963)
    d['meshes']=[{'name':kind,'primitives':[{'attributes':attr,'indices':index,'material':0}]}]
    img=out.view(ktx_image(m,cache,kind))
    d['images']=[{'name':kind+'-color','mimeType':'image/ktx2','bufferView':img}]
    d['textures']=[{'sampler':0,'extensions':{'KHR_texture_basisu':{'source':0}}}]
    d['samplers']=[{'magFilter':9729,'minFilter':9987,'wrapS':10497,'wrapT':10497}]
    d['extensionsUsed']=d['extensionsRequired']=['KHR_texture_basisu']
    d['materials']=[{'name':kind+'-paint','pbrMetallicRoughness':{'baseColorTexture':{'index':0},'roughnessFactor':.9,'metallicFactor':0}}]
    mob=kind not in ('ghoul-warrior','zombie')
    action={'Idle':(NPC+'Idle_02.glb','Idle_02'),'Walk':(GOB,'Walking') if mob else (NPC+'Casual_Walk.glb','Casual_Walk'),
            'Attack':(GOB,'Right_Jab_from_Guard'),'Hit':(NPC+'Hit_Reaction.glb','Hit_Reaction'),
            'Death':(GOB,'Fall_Dead_from_Abdominal_Injury')}
    if kind=='ghoul-warrior':action.update({'Idle':(HERO,'Idle_02'),'Attack':(HERO,'Right_Hand_Sword_Slash')})
    elif kind in ('goblin-warrior','hobgoblin-boss'):action['Attack']=(GOB,'Sword_Judgment')
    for label,(reference,clip) in action.items():make_action(out,B,ids,weights,q,kind,label,clip,reference)
    path=OUT/(kind+'.glb');out.write(path)
    print(json.dumps({'kind':kind,'triangles':len(m.array(prim['indices']))//3,'joints':len(B),'clips':list(action),
                      'maxInfluences':int((weights>0).sum(1).max()),'height':h,'bytes':path.stat().st_size}),flush=True)

OUT.mkdir(parents=True,exist_ok=True)
cache=REDUCED/'textures';cache.mkdir(exist_ok=True)
for kind in (sys.argv[4:] or list(HEIGHT)):fit(kind,cache)
