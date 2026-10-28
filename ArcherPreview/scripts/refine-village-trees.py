"""Offline edits of the two existing trees; no generation service or new textures.

Stage one records the source mesh and a foliage mask before any retopology.
"""
import argparse,json,math,sys,time
from pathlib import Path
import bpy,bmesh,numpy as np
from mathutils import Vector

IDS=['tree-01-round-oak','tree-02-slender-pine']

def import_tree(assets,config):
    old=set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(assets/config['lods'][0]['model']))
    added=[o for o in bpy.data.objects if o not in old]
    meshes=[o for o in added if o.type=='MESH']
    assert len(meshes)==1
    ob=meshes[0];bpy.context.view_layer.update()
    ob.data.transform(ob.matrix_world);ob.matrix_world.identity();ob.parent=None
    for item in added:
        if item is not ob:bpy.data.objects.remove(item,do_unlink=True)
    bpy.context.view_layer.update()
    return ob

def sample_source(ob):
    mesh=ob.data;mesh.calc_loop_triangles()
    image=next(n.image for n in ob.active_material.node_tree.nodes if n.type=='TEX_IMAGE')
    w,h=image.size;pixels=np.empty(w*h*4,dtype=np.float32);image.pixels.foreach_get(pixels);pixels=pixels.reshape(h,w,4)
    verts=np.array([tuple(v.co) for v in mesh.vertices],dtype=np.float64)
    faces=np.array([list(t.vertices) for t in mesh.loop_triangles],dtype=np.int32)
    uv=np.array([[tuple(mesh.uv_layers.active.data[i].uv) for i in t.loops] for t in mesh.loop_triangles])
    centers=verts[faces].mean(axis=1);face_uv=uv.mean(axis=1)
    rgb=pixels[np.minimum(h-1,(face_uv[:,1]%1*h).astype(int)),np.minimum(w-1,(face_uv[:,0]%1*w).astype(int)),:3]
    low=verts.min(axis=0);high=verts.max(axis=0);height=high[2]-low[2]
    green=(rgb[:,1]>rgb[:,0]*.86)&(rgb[:,1]>rgb[:,2]*1.4)&(centers[:,2]>low[2]+height*(.14 if 'pine' in ob.name else .27))
    # UV seam vertices are topologically split; weld positions only for analysis.
    keys={};parent=list(range(len(verts)))
    for i,v in enumerate(verts):
        k=tuple(np.round(v,5));parent[i]=keys.setdefault(k,i)
    adjacent={}
    for fi,face in enumerate(faces):
        if green[fi]:
            for v in face:adjacent.setdefault(parent[v],[]).append(fi)
    seen=set();components=[]
    for start in np.flatnonzero(green):
        start=int(start)
        if start in seen:continue
        stack=[start];seen.add(start);part=[]
        while stack:
            f=stack.pop();part.append(f)
            for v in faces[f]:
                for n in adjacent[parent[v]]:
                    if n not in seen:seen.add(n);stack.append(n)
        components.append(part)
    components.sort(key=len,reverse=True)
    return dict(vertices=verts,faces=faces,uv=uv,centers=centers,face_uv=face_uv,rgb=rgb,green=green,components=components,height=height,low=low,high=high)

def review_pair(original,modified,path,yaw=-.5):
    scene=bpy.context.scene
    scene.render.engine='BLENDER_EEVEE_NEXT' if bpy.app.version<(5,0,0) else 'BLENDER_EEVEE'
    scene.render.resolution_x=1400;scene.render.resolution_y=800;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False
    scene.eevee.taa_render_samples=32;scene.view_settings.view_transform='Standard';scene.view_settings.look='Medium High Contrast'
    scene.world.use_nodes=True
    bg=scene.world.node_tree.nodes.get('Background');bg.inputs['Color'].default_value=(.21,.24,.22,1);bg.inputs['Strength'].default_value=.8
    for ob in list(bpy.data.objects):ob.hide_render=ob not in [original,modified]
    span=max(original.dimensions);original.location.x=-span*.66;modified.location.x=span*.66
    original.rotation_euler.z=modified.rotation_euler.z=yaw
    cam=bpy.data.objects.new('review-camera',bpy.data.cameras.new('review-camera'));scene.collection.objects.link(cam);scene.camera=cam;cam.data.type='ORTHO';cam.data.ortho_scale=span*2.8
    target=Vector((0,0,span*.46));cam.location=(0,-span*4,span*2.1);cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
    lights=[]
    for name,energy,rot in [('key',2.,(.6,-.35,-.6)),('fill',.85,(.8,.4,2.5))]:
        light=bpy.data.objects.new(name,bpy.data.lights.new(name,'SUN'));scene.collection.objects.link(light);light.data.energy=energy;light.rotation_euler=rot;lights.append(light)
    scene.render.filepath=str(path);bpy.ops.render.render(write_still=True)
    for ob in [cam,*lights]:bpy.data.objects.remove(ob,do_unlink=True)
    original.location.x=modified.location.x=0;original.rotation_euler.z=modified.rotation_euler.z=0

def audit_stage(args):
    assets=Path(args.assets);out=Path(args.out);out.mkdir(parents=True,exist_ok=True)
    manifest=json.loads((assets/'village.json').read_text(encoding='utf-8'))
    (out/'baseline-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
    for ob in list(bpy.data.objects):bpy.data.objects.remove(ob,do_unlink=True)
    records=[]
    for asset_id in IDS:
        ob=import_tree(assets,manifest['assets'][asset_id]);ob.name=asset_id+'-original';data=sample_source(ob)
        np.savez_compressed(out/(asset_id+'-source.npz'),**{k:v for k,v in data.items() if k!='components'})
        record={'id':asset_id,'triangles':len(data['faces']),'foliageTriangles':int(data['green'].sum()),'trunkTriangles':int((~data['green']).sum()),'bounds':[data['low'].tolist(),data['high'].tolist()],'components':[{'faces':len(c),'center':data['centers'][c].mean(axis=0).tolist(),'min':data['vertices'][data['faces'][c]].reshape(-1,3).min(axis=0).tolist(),'max':data['vertices'][data['faces'][c]].reshape(-1,3).max(axis=0).tolist()} for c in data['components'][:25]],'scale':list(ob.scale),'rotation':list(ob.rotation_euler)}
        records.append(record)
        mask=ob.copy();mask.data=ob.data.copy();bpy.context.scene.collection.objects.link(mask);mask.name=asset_id+'-mask';mask.data.materials.clear()
        for name,color in [('trunk',(.3,.15,.06,1)),('foliage',(.2,.8,.1,1))]:
            mat=bpy.data.materials.new(name);mat.diffuse_color=color;mask.data.materials.append(mat)
        for p in mask.data.polygons:p.material_index=int(data['green'][p.index])
        review_pair(ob,mask,out/(asset_id+'-mask.png'))
        bpy.data.objects.remove(mask,do_unlink=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(out/'source-audit.blend'))
    (out/'source-audit.json').write_text(json.dumps({'blender':bpy.app.version_string,'assets':records},indent=2)+'\n',encoding='utf-8')
    print('RESULT '+json.dumps([{k:v for k,v in r.items() if k!='components'} for r in records]))

def mesh_from_triangles(name,vertices,faces,uv,material):
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(vertices.tolist(),[],faces.tolist());mesh.update()
    layer=mesh.uv_layers.new(name='UVMap')
    for i,p in enumerate(mesh.polygons):
        p.use_smooth=True
        for j,l in enumerate(p.loop_indices):layer.data[l].uv=uv[i,j]
    ob=bpy.data.objects.new(name,mesh);bpy.context.scene.collection.objects.link(ob);mesh.materials.append(material)
    return ob

def part_mesh(ob,data,target,foliage=False):
    mask=data['green'] if foliage else ~data['green']
    trunk=mesh_from_triangles(ob.name+('-core' if foliage else '-trunk'),data['vertices'],data['faces'][mask],data['uv'][mask],ob.active_material)
    bm=bmesh.new();bm.from_mesh(trunk.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001)
    bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS');bm.to_mesh(trunk.data);bm.free()
    trunk.data.validate(verbose=True);trunk.data.update()
    if target<len(trunk.data.polygons):
        modifier=trunk.modifiers.new('Budget surface','DECIMATE');modifier.ratio=min(1,target/len(trunk.data.polygons));modifier.use_collapse_triangulate=True
        bpy.context.view_layer.objects.active=trunk;trunk.select_set(True);bpy.ops.object.modifier_apply(modifier=modifier.name);trunk.select_set(False)
    if foliage:
        points=data['centers'][data['green']];rng=np.random.default_rng(34)
        centers=points[rng.choice(len(points),18 if 'pine' in ob.name else 12,replace=False)].copy()
        for _ in range(16):
            labels=np.argmin(((points[:,None]-centers[None])**2).sum(axis=2),axis=1)
            for i in range(len(centers)):
                if np.any(labels==i):centers[i]=points[labels==i].mean(axis=0)
        for v in trunk.data.vertices:
            p=np.array(v.co);center=centers[np.argmin(((centers-p)**2).sum(axis=1))]
            v.co=center+(p-center)*.90
    # Decimate can collapse the AI canopy's overlapping sheets onto duplicate
    # triangles. Remove those within the isolated part before merging buffers.
    trunk.data.validate(verbose=False);trunk.data.update()
    return trunk

def leaf_layout(data,count,pine):
    rng=np.random.default_rng(781 if pine else 291)
    candidates=np.flatnonzero(data['green']);tri=data['vertices'][data['faces'][candidates]]
    normals=np.cross(tri[:,1]-tri[:,0],tri[:,2]-tri[:,0]);area=np.linalg.norm(normals,axis=1)
    normals/=np.maximum(area[:,None],1e-8)
    # Stratify by surface area, with a shuffled phase, rather than placing every
    # spray at a polygon center. This preserves all original crown lobes.
    cumulative=np.cumsum(area);phase=rng.random(count)
    samples=np.searchsorted(cumulative,(np.arange(count)+phase)/count*cumulative[-1]);rng.shuffle(samples)
    layout=[]
    for k,j in enumerate(samples):
        fi=int(candidates[j]);weights=rng.dirichlet([1.5,1.5,1.5]);center=weights@tri[j]
        normal=normals[j]*.65+np.array([0.,0.,.40])+rng.normal(0,.3,3)
        if normal[2]<0:normal[2]*=-.45
        normal/=np.linalg.norm(normal)
        angle=rng.uniform(0,math.tau);u=np.cross(normal,[math.cos(angle),math.sin(angle),.05]);u/=np.linalg.norm(u);v=np.cross(normal,u)
        length=rng.uniform(.72,1.2) if pine else rng.uniform(.75,1.15)
        width=length*(rng.uniform(.48,.64) if pine else rng.uniform(.62,.85))
        # Needle sprays follow the outward/downward direction of existing boughs.
        if pine:
            radial=np.array([center[0],center[1],-.5]);radial-=normal*np.dot(radial,normal)
            if np.linalg.norm(radial)>.01:v=radial/np.linalg.norm(radial);u=np.cross(v,normal)
        center-=normals[j]*.025
        uv=data['uv'][fi];uv_center=weights@uv
        layout.append({'center':center,'u':u,'v':v,'normal':normal,'length':length,'width':width,'uv':uv,'uv_center':uv_center})
    return layout

def build_tree(ob,data,layout,level,pine):
    targets=([10000,700,400] if pine else [2450,1100,700]);trunk=part_mesh(ob,data,targets[level]);trunk.data.calc_loop_triangles()
    vertices=[tuple(v.co) for v in trunk.data.vertices];faces=[tuple(t.vertices) for t in trunk.data.loop_triangles]
    uvs=[[tuple(trunk.data.uv_layers.active.data[i].uv) for i in t.loops] for t in trunk.data.loop_triangles]
    trunk_count=len(faces)
    core=part_mesh(ob,data,([1500,950,600] if pine else [900,850,600])[level],True);core.data.calc_loop_triangles();offset=len(vertices)
    vertices.extend(tuple(v.co) for v in core.data.vertices);faces.extend(tuple(i+offset for i in t.vertices) for t in core.data.loop_triangles)
    uvs.extend([[tuple(core.data.uv_layers.active.data[i].uv) for i in t.loops] for t in core.data.loop_triangles])
    core_count=len(core.data.loop_triangles);bpy.data.objects.remove(core,do_unlink=True)
    boundary4=np.array([[0,-.60],[.50,-.02],[0,.54],[-.44,.06]])
    for leaf in layout:
        center,u,v,n=leaf['center'],leaf['u'],leaf['v'],leaf['normal']
        boundary=boundary4
        points=center+boundary[:,0,None]*leaf['width']*u+boundary[:,1,None]*leaf['length']*v
        # Stay within the original crown envelope: no larger collision footprint
        # or viewport culling bounds are required for an existing placement.
        scale=1.
        for p in points:
            d=p-center
            for axis in range(3):
                if d[axis]>0:scale=min(scale,(data['high'][axis]-center[axis])/d[axis])
                elif d[axis]<0:scale=min(scale,(data['low'][axis]-center[axis])/d[axis])
        points=center+(points-center)*max(.01,scale)
        # Reuse a safe interior of the original green UV triangle; no atlas or
        # generated raster is introduced. All tiers share the same leaf centers.
        uv=leaf['uv'];uvcenter=leaf['uv_center'];localuv=uvcenter+(boundary[:,0,None]*(uv[1]-uv[0])+boundary[:,1,None]*(uv[2]-uv[0]))*.65
        offset=len(vertices);vertices.extend(points.tolist())
        for i in range(1,len(points)-1):faces.append((offset,offset+i,offset+i+1));uvs.append(localuv[[0,i,i+1]].tolist())
    bpy.data.objects.remove(trunk,do_unlink=True)
    result=mesh_from_triangles(ob.name.replace('-original','')+'-refined-lod'+str(level),np.array(vertices),np.array(faces),np.array(uvs),ob.active_material)
    bm=bmesh.new();bm.from_mesh(result.data)
    bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS');bm.to_mesh(result.data);bm.free()
    assert not result.data.validate(verbose=True),'Mesh required validation repairs'
    return result,trunk_count,core_count

def export_geometry(ob,path):
    mesh=ob.data;mesh.calc_loop_triangles();positions=[];normals=[];uvs=[];indices=[];lookup={}
    for tri in mesh.loop_triangles:
        for loop_id in tri.loops:
            loop=mesh.loops[loop_id];v=mesh.vertices[loop.vertex_index];n=mesh.corner_normals[loop_id].vector;uv=mesh.uv_layers.active.data[loop_id].uv
            p=(v.co.x,v.co.z,-v.co.y);normal=(n.x,n.z,-n.y);tex=(uv.x,1-uv.y)
            key=tuple(round(x,7) for x in (*p,*normal,*tex))
            if key not in lookup:
                lookup[key]=len(positions);positions.append(p);normals.append(normal);uvs.append(tex)
            indices.append(lookup[key])
    path.write_text(json.dumps({'positions':positions,'normals':normals,'uvs':uvs,'indices':indices},separators=(',',':')),encoding='utf-8')

def refine_stage(args):
    out=Path(args.out);bpy.ops.wm.open_mainfile(filepath=str(out/'source-audit.blend'))
    records=[]
    for asset_id in IDS:
        original=bpy.data.objects[asset_id+'-original'];data=dict(np.load(out/(asset_id+'-source.npz')));pine='pine' in asset_id
        layout=leaf_layout(data,1000 if pine else 600,pine);tiers=[];counts=[]
        for level in range(3):
            ob,trunk_count,core_count=build_tree(original,data,layout,level,pine);tiers.append(ob)
            export_geometry(ob,out/(asset_id+'-lod'+str(level)+'.json'))
            counts.append({'level':level,'triangles':len(ob.data.polygons),'trunkTriangles':trunk_count,'coreTriangles':core_count,'leaves':len(layout),'bounds':[list(min(v.co[i] for v in ob.data.vertices) for i in range(3)),list(max(v.co[i] for v in ob.data.vertices) for i in range(3))]})
        for view,yaw in [('front',-.5),('back',math.pi-.5)]:review_pair(original,tiers[0],out/(asset_id+'-before-after-'+view+'.png'),yaw)
        review_pair(tiers[0],tiers[2],out/(asset_id+'-near-far.png'))
        records.append({'id':asset_id,'tiers':counts})
    bpy.ops.wm.save_as_mainfile(filepath=str(out/'refined-trees.blend'))
    (out/'refinement-audit.json').write_text(json.dumps({'assets':records,'textureFilesAdded':0,'method':'existing trunk retopology and original-canopy-surface leaf sprays','baseline':'284d18b'},indent=2)+'\n',encoding='utf-8')
    print('RESULT '+json.dumps(records))

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--assets',required=True);ap.add_argument('--out',required=True);ap.add_argument('--stage',default='audit')
    args=ap.parse_args(sys.argv[sys.argv.index('--')+1:]);(audit_stage if args.stage=='audit' else refine_stage)(args)

if __name__=='__main__':main()
