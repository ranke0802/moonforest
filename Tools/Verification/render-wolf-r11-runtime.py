"""Render actual CPU-skinned game poses with unchanged source colour materials.
Use Blender headless --factory-startup --python-exit-code 1 --python this.py.
This is an offline asset review, not a Babylon GPU screenshot.
"""
import bpy,json,math
from pathlib import Path
from mathutils import Vector

PROJECT=Path(__file__).resolve().parents[2]
registry=json.loads((PROJECT/'Sources/source-inputs.json').read_text(encoding='utf8'))
source=PROJECT/registry['directories']['wolf-v02-predator-r11']
inputs=PROJECT/'Docs/Reviews/2026-11-13/wolf-predator-r11/runtime-poses'
bpy.ops.wm.open_mainfile(filepath=str(source/'blend/wolf-v02-predator-r11.blend'))
scene=bpy.context.scene
materials=[m for m in bpy.data.materials if m.use_nodes and any(n.type=='TEX_IMAGE' and n.image and n.image.size[0]>=4096 for n in m.node_tree.nodes)]
if not materials:raise RuntimeError('Missing original packed 4K colour material')
for m in bpy.data.materials:
    if not m.use_nodes:continue
    bs=next((n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
    if bs:bs.inputs['Roughness'].default_value=.68;bs.inputs['Metallic'].default_value=0
for ob in list(scene.objects):
    if ob.type in ['CAMERA','LIGHT']:bpy.data.objects.remove(ob,do_unlink=True)
    else:ob.hide_render=True
scene.render.engine='BLENDER_EEVEE_NEXT';scene.eevee.taa_render_samples=12
scene.render.resolution_x=720;scene.render.resolution_y=540;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='Standard'
scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.18,.22,.28,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.65
def paint(name,color):
    m=bpy.data.materials.new(name);m.use_nodes=True;m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(*color,1);return m
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.005));bpy.context.object.data.materials.append(paint('Runtime review floor',(.25,.29,.31)))
for name,location,energy,size in [('Key',(-3,-4,6),650,5),('Fill',(4,-2,3),350,4),('Rim',(1,4,5),750,4)]:
    light=bpy.data.lights.new(name,'AREA');light.energy=energy;light.shape='DISK';light.size=size
    ob=bpy.data.objects.new(name,light);scene.collection.objects.link(ob);ob.location=location;ob.rotation_euler=(Vector((0,0,.7))-ob.location).to_track_quat('-Z','Y').to_euler()
cam=bpy.data.cameras.new('Runtime review camera');camera=bpy.data.objects.new('Runtime review camera',cam);scene.collection.objects.link(camera);scene.camera=camera;cam.type='ORTHO';cam.ortho_scale=2.8
targetmat=paint('Player 1.6m actual target',(.05,.45,.60));owned=[];rows=[]
for input in json.loads((inputs/'index.json').read_text(encoding='utf8'))['rows']:
    data=json.loads((inputs/(input['name']+'.json')).read_text(encoding='utf8'))
    for ob in owned:bpy.data.objects.remove(ob,do_unlink=True)
    owned=[]
    for row in data['meshes']:
        me=bpy.data.meshes.new('CPU '+row['name']);indices=row['indices'];me.from_pydata(row['positions'],[],[indices[i:i+3] for i in range(0,len(indices),3)]);me.update()
        uv=me.uv_layers.new(name='Original colour UV');values=row['uv']
        if values:
            for loop in me.loops:uv.data[loop.index].uv=(values[loop.vertex_index*2],1-values[loop.vertex_index*2+1])
        source_material=materials[0]
        if 'Canine' in row['name']:source_material=bpy.data.materials.get('Canine_Enamel') or source_material
        elif 'Mouth_' in row['name']:source_material=bpy.data.materials.get('Mouth_Interior') or source_material
        me.materials.append(source_material)
        try:me.normals_split_custom_set_from_vertices(row['normals'])
        except AttributeError:pass
        ob=bpy.data.objects.new('CPU '+row['name'],me);scene.collection.objects.link(ob);owned.append(ob)
    target=Vector(data['player']);height=data['playerHeight']
    for dz,radius,depth in [(height*.37,height*.14,height*.50),(height*.87,height*.10,height*.20)]:
        bpy.ops.mesh.primitive_uv_sphere_add(segments=20,ring_count=12,location=target+Vector((0,0,dz)));ob=bpy.context.object;ob.scale=(radius,radius*.75,depth*.5);ob.data.materials.append(targetmat);owned.append(ob)
    points=[Vector(p) for row in data['meshes'] for p in row['positions']]
    low=Vector(tuple(min(p[k] for p in points) for k in range(3)));high=Vector(tuple(max(p[k] for p in points) for k in range(3)))
    center=(low+high)*.5
    cam.ortho_scale=max(2.8,(high-low).length*1.10)
    for view,offset in [('front',(0,-5,.6)),('side',(-5,0,.6)),('quarter',(-4,-4,.8))]:
        camera.location=center+Vector(offset);camera.rotation_euler=(center-camera.location).to_track_quat('-Z','Y').to_euler()
        output=inputs/(input['name']+'-'+view+'.png');scene.render.filepath=str(output);bpy.ops.render.render(write_still=True)
        rows.append({'case':input['name'],'view':view,'output':str(output.relative_to(PROJECT)),'sourceTime':data['sourceTime'],'clip':data['clip']})
(inputs/'render-cases.json').write_text(json.dumps({'scope':'Actual CPU-skinned pose/root/gaze/plant. Original colour atlas, offline Blender lighting; not game GPU UI.','blenderVersion':bpy.app.version_string,'rows':rows},indent=2),encoding='utf8')
print('RESULT '+json.dumps({'images':len(rows),'materials':[m.name for m in materials]}),flush=True)
