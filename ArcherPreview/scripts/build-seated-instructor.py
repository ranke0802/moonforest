"""Blender 4.5+: build the veteran instructor from the registered Tripo merchant.
blender -b -P scripts/build-seated-instructor.py -- <canonical project> <output.glb>
"""
import bpy
import bmesh
import math
import sys
import zipfile
import tempfile
from pathlib import Path
from mathutils import Vector, Matrix, Quaternion

canonical, output = map(Path, sys.argv[sys.argv.index('--') + 1:])
source = canonical / 'Sources/actors/tripo-cast/2026-11-18-v1/npc-pack/merchant.zip'
bpy.ops.wm.read_factory_settings(use_empty=True)
with tempfile.TemporaryDirectory() as tmp, zipfile.ZipFile(source) as pack:
    asset = Path(tmp) / 'merchant.glb'
    asset.write_bytes(pack.read('merchant/merchant.glb'))
    bpy.ops.import_scene.gltf(filepath=str(asset))
arm = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
body = next(o for o in bpy.context.scene.objects if o.type == 'MESH')
arm.animation_data_clear()
for bone in arm.pose.bones:
    bone.matrix_basis = Matrix.Identity(4)
bones = arm.pose.bones
update = bpy.context.view_layer.update

def bone(name):
    return bones['mixamorig:' + name]

def aim(name, direction):
    p = bone(name)
    orig = p.matrix.copy()
    swivel = (p.tail - p.head).rotation_difference(Vector(direction))
    pivot = Matrix.Translation(orig.translation)
    p.matrix = pivot @ swivel.to_matrix().to_4x4() @ pivot.inverted() @ orig
    update()

update()
for side, sign in [('Left', 1), ('Right', -1)]:
    aim(side + 'UpLeg', (.18 * sign, -1, -.075))
    aim(side + 'Leg', (.05 * sign, -.10, -1))
aim('RightArm', (-.29, -.30, -1))
aim('RightForeArm', (.46, -1, .32))
aim('RightHand', (.5, -1, -.02))
aim('LeftArm', (.12, -.05, -1))
mesh = body.data
bm = bmesh.new()
bm.from_mesh(mesh)
bm.verts.ensure_lookup_table()
trim = []
for v in mesh.vertices:
    x, y, z = v.co
    left_sleeve = x > .16 and z < 1.31 and any(
        'Left' in body.vertex_groups[g.group].name and
        any(key in body.vertex_groups[g.group].name for key in ['Arm', 'Hand']) and g.weight > .15
        for g in v.groups)
    if z < .495 or left_sleeve:
        trim.append(bm.verts[v.index])
bmesh.ops.delete(bm, geom=trim, context='VERTS')
bm.to_mesh(mesh)
bm.free()
update()
# Bake this pose once. Only breathing, head and the remaining arm need animation.
posed = bpy.data.meshes.new_from_object(body.evaluated_get(bpy.context.evaluated_depsgraph_get()), preserve_all_data_layers=True, depsgraph=bpy.context.evaluated_depsgraph_get())
seated = bpy.data.objects.new('Instructor · seated', posed)
bpy.context.collection.objects.link(seated)
for group in body.vertex_groups:
    seated.vertex_groups.new(name=group.name)
zoff = -.385
for v in posed.vertices:
    v.co.z += zoff
# Reuse the merchant's UVs. A blue wool tabard separates his uniform from the merchant.
colors = posed.color_attributes.new(name='WoolDye', type='BYTE_COLOR', domain='POINT')
for vertex in mesh.vertices:
    x,y,z = vertex.co
    t = max(0, min(1, (z-1.00)/.06, (1.48-z)/.06)) if abs(x)<.22 else 0
    colors.data[vertex.index].color=(1-.55*t, 1-.35*t, 1-.08*t, 1)

positions = {name: bone(name).head.copy() + Vector((0,0,zoff)) for name in
             ['Head','Spine2','RightArm','RightForeArm','RightHand','LeftArm','LeftLeg','RightLeg','LeftUpLeg','RightUpLeg']}
old_groups = {g.index:g.name.split(':')[-1] for g in seated.vertex_groups}
weights = []
for v in seated.data.vertices:
    values = {}
    for g in v.groups:
        n = old_groups[g.group]
        target = ('Head' if n in ['Neck','Head','HeadTop_End','headfront'] else
                  'RightForeArm' if n.startswith('RightHand') or n=='RightForeArm' else
                  'RightArm' if n=='RightArm' else 'Spine2' if n in ['Spine2','RightShoulder','LeftShoulder','LeftArm'] else 'Root')
        values[target] = values.get(target,0) + g.weight
    weights.append(values)
seated.vertex_groups.clear()
for n in ['Root','Spine2','Head','RightArm','RightForeArm']:
    group = seated.vertex_groups.new(name=n)
    for i,values in enumerate(weights):
        if values.get(n,0)>0: group.add([i],values[n],'REPLACE')
bpy.data.objects.remove(body, do_unlink=True)
bpy.data.objects.remove(arm, do_unlink=True)
armdata=bpy.data.armatures.new('InstructorRig')
rig=bpy.data.objects.new('InstructorRig',armdata)
bpy.context.collection.objects.link(rig)
bpy.context.view_layer.objects.active=rig
rig.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
for name,parent in [('Root',None),('Spine2','Root'),('Head','Spine2'),('RightArm','Spine2'),('RightForeArm','RightArm')]:
    b=armdata.edit_bones.new(name)
    b.head=positions.get(name,Vector((0,0,.42)))
    b.tail=b.head+Vector((0,0,.14))
    if parent: b.parent=armdata.edit_bones[parent]
bpy.ops.object.mode_set(mode='OBJECT')
seated.parent=rig
mod=seated.modifiers.new('Breathing and teaching','ARMATURE')
mod.object=rig
# Model the chair and the prostheses as one opaque, vertex-coloured mesh.
parts=[]
paint=bpy.data.materials.new('Oiled wood, iron and leather')
paint.use_nodes=True
attribute=paint.node_tree.nodes.new('ShaderNodeVertexColor')
attribute.layer_name='Finish'
paint.node_tree.links.new(attribute.outputs['Color'],paint.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
wood=(.24,.105,.047,1)
leather=(.115,.059,.038,1)
iron=(.23,.245,.25,1)
def collect(color):
    ob=bpy.context.object
    ob.data.materials.clear();ob.data.materials.append(paint)
    layer=ob.data.color_attributes.new(name='Finish',type='BYTE_COLOR',domain='POINT')
    for v in layer.data: v.color=color
    parts.append(ob)
    return ob
def box(center,size,color):
    bpy.ops.mesh.primitive_cube_add(size=1,location=center)
    ob=collect(color);ob.dimensions=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return ob
def shaft(a,b,r0,r1,color):
    a,b=Vector(a),Vector(b)
    bpy.ops.mesh.primitive_cone_add(vertices=10,radius1=r0,radius2=r1,depth=(b-a).length,location=(a+b)/2)
    o=collect(color);o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler()
for key in ['LeftLeg','RightLeg']:
    x,y,z=positions[key]
    hip=positions[key.replace('Leg','UpLeg')]
    # His standing coat originally hides the tops of the legs. Rebuild the
    # cloth breeches between the seated hip and knee so each socket has a thigh.
    thigh_end=Vector((x,y+.008,z+.015))
    shaft(hip+Vector((0,.016,.018)),thigh_end,.115,.088,(.12,.083,.066,1))
    shaft((x,y,z-.012),(x,y,z+.071),.082,.083,(.12,.083,.066,1))
    shaft((x,y,z-.105),(x,y,z+.060),.072,.090,leather)
    shaft((x,y-.034,.07),(x,y,z-.079),.040,.064,wood)
    for h in [.17,z-.13]:
        shaft((x,y-.02,h-.014),(x,y-.02,h+.014),.060,.061,iron)
    foot=box((x,y-.075,.048),(.104,.208,.084),leather)
    bevel=foot.modifiers.new('Shaped toe','BEVEL');bevel.width=.026;bevel.segments=1
    bpy.context.view_layer.objects.active=foot;bpy.ops.object.modifier_apply(modifier=bevel.name)
s=positions['LeftArm']
shaft((s.x+.012,s.y-.004,s.z-.134),(s.x+.012,s.y-.004,s.z-.080),.061,.077,leather)
box((0,.04,.458),(.505,.45,.066),wood)
for x in [-.204,.204]:
    for y in [-.132,.214]:
        box((x,y,.231),(.049,.049,.455),wood)
    box((x,.227,.78),(.043,.04,.605),wood)
box((0,.227,.983),(.455,.039,.165),wood)
box((0,.227,.812),(.455,.036,.07),wood)
bpy.ops.object.select_all(action='DESELECT')
for o in parts:o.select_set(True)
bpy.context.view_layer.objects.active=parts[0]
bpy.ops.object.join()
props=bpy.context.object;props.name='Chair and two fitted prostheses'

# Two small NLA tracks. Constant chair/legs have no animated channels.
scene=bpy.context.scene
scene.render.fps=24
for name,duration,talk in [('Seated_Idle',96,False),('Seated_Teach',68,True)]:
    action=bpy.data.actions.new(name);rig.animation_data_create().action=action
    for i in range(9):
        f=1+round(duration*i/8)
        phase=2*math.pi*i/8
        for bn,axis,angle in [
          ('Spine2',(1,0,0),.012*math.sin(phase)),
          ('Head',(1,0,.8),(.045 if talk else .017)*math.sin(phase)),
          ('RightArm',(1,.1,0),(.065 if talk else .012)*math.sin(phase)),
          ('RightForeArm',(1,.2,.15),(.14 if talk else .015)*math.sin(phase))]:
            pb=rig.pose.bones[bn];pb.rotation_mode='QUATERNION'
            pb.rotation_quaternion=Quaternion(axis,angle);pb.keyframe_insert('rotation_quaternion',frame=f)
    rig.animation_data.action=None
    track=rig.animation_data.nla_tracks.new()
    track.name=name;track.strips.new(name,1,action);track.mute=True
for pb in rig.pose.bones: pb.matrix_basis=Matrix.Identity(4)
# Embed source JPEG temporarily; packaging replaces it with the existing KTX2 payload.
output.parent.mkdir(exist_ok=True,parents=True)
bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',export_animations=True,
    export_animation_mode='NLA_TRACKS',export_frame_range=False,export_yup=True,
    export_vertex_color='ACTIVE',export_all_vertex_colors=False,export_force_sampling=False)

