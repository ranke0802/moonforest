"""Offline FBX audit/export; preserves original topology, rig and 18 actions."""
import bpy, sys, json, math
import numpy as np
from pathlib import Path
from mathutils import Vector

source, destination = map(Path, sys.argv[sys.argv.index('--') + 1:])
destination.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
bpy.context.scene.render.fps = 30
bpy.ops.import_scene.fbx(filepath=str(source), use_image_search=False)
scene = bpy.context.scene
print('SOURCE_FPS', scene.render.fps, flush=True)
rig = next(o for o in scene.objects if o.type == 'ARMATURE')
body = next(o for o in scene.objects if o.type == 'MESH')
actions = list(bpy.data.actions)
for action in actions:
    action.name = action.name.split('|')[-1]; action.use_fake_user = True
def select_action(action):
    rig.animation_data_create(); rig.animation_data.action = action
    if action.slots: rig.animation_data.action_slot = action.slots[0]
select_action(bpy.data.actions['Walking']); scene.frame_set(32)
pose = {p.name: (p.location.copy(), p.rotation_quaternion.copy(), p.scale.copy()) for p in rig.pose.bones}
idle = bpy.data.actions.new('Elena_Idle'); idle.use_fake_user = True
rig.animation_data.action = idle
for frame in [1, 61]:
    for p in rig.pose.bones:
        p.rotation_mode = 'QUATERNION'; p.location, p.rotation_quaternion, p.scale = pose[p.name]
        for prop in ['location', 'rotation_quaternion', 'scale']: p.keyframe_insert(prop, frame=frame, group=p.name)
actions.append(idle)
catalog = []
for action in actions:
    select_action(action); start, end = map(int, action.frame_range)
    root, grounds = [], {}
    for frame in range(start, end + 1):
        scene.frame_set(frame)
        h = rig.matrix_world @ rig.pose.bones['mixamorig:Hips'].matrix.translation
        root.append([round(h.x,6),round(h.z,6),round(-h.y,6)])
        if (frame-start) % 4 == 0 or frame == end:
            obj = body.evaluated_get(bpy.context.evaluated_depsgraph_get()); mesh = obj.to_mesh()
            co = np.empty(len(mesh.vertices)*3, dtype=np.float32); mesh.vertices.foreach_get('co', co)
            co = co.reshape(-1,3); m = np.array(obj.matrix_world)
            low = np.min(co @ m[2,:3] + m[2,3]); grounds[frame-start] = round(float(-low),6)
            obj.to_mesh_clear()
    keys = sorted(grounds)
    ground = np.interp(range(end-start+1), keys, [grounds[k] for k in keys]).round(6).tolist()
    catalog.append(dict(name=action.name,duration=(end-start)/scene.render.fps,frames=end-start+1,fps=scene.render.fps,rootTrack=root,groundTrack=ground,derived=action==idle))
    print('SAMPLED', action.name, flush=True)
for image in bpy.data.images:
    if image.packed_file and image.size[0] > 256:
        image.filepath_raw=str(destination/'elena-color.png'); image.file_format='PNG'; image.save()
rig.animation_data_clear(); rig.data.pose_position='REST'; scene.frame_set(1)
bpy.ops.object.select_all(action='DESELECT'); rig.select_set(True); body.select_set(True); bpy.context.view_layer.objects.active=rig
bpy.context.view_layer.update()
# REST is only for the reference bounds; export animation in POSE mode.
rig.data.pose_position='POSE'
rig.animation_data_create()
for action in actions:
    track=rig.animation_data.nla_tracks.new();track.name=action.name;track.mute=True
    strip=track.strips.new(action.name,1,action)
    if action.slots:strip.action_slot=action.slots[0]
select_action(idle);scene.frame_set(1)
kwargs=dict(filepath=str(destination/'elena.glb'),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='ACTIONS',export_force_sampling=True,export_frame_range=False,export_def_bones=False,export_all_influences=False,export_skins=True,export_morph=False,export_optimize_animation_size=True)
props=bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
bpy.ops.export_scene.gltf(**{k:v for k,v in kwargs.items() if k in props})
(destination/'config.json').write_text(json.dumps(dict(version='Elena · non-enraged · 18 source motions + held idle',scale=1,forwardYaw=0,fps=scene.render.fps,animations={a.name:a.name for a in actions},catalog=catalog),ensure_ascii=False,indent=2),encoding='utf-8')
# A compact, non-interactive artist review: original topology and painted color.
mat=body.data.materials[0]; mat.use_nodes=True
nodes=mat.node_tree.nodes; texture=next(n for n in nodes if n.type=='TEX_IMAGE' and n.image)
output=next(n for n in nodes if n.type=='OUTPUT_MATERIAL')
emission=nodes.new('ShaderNodeEmission'); emission.inputs['Strength'].default_value=.8
mat.node_tree.links.new(texture.outputs['Color'],emission.inputs['Color']); mat.node_tree.links.new(emission.outputs[0],output.inputs['Surface'])
scene.render.engine='BLENDER_EEVEE_NEXT'; scene.render.resolution_x=300; scene.render.resolution_y=340; scene.render.resolution_percentage=100
scene.world.color=(.13,.13,.13); scene.view_settings.view_transform='Standard';scene.view_settings.look='None'
bpy.ops.object.camera_add(location=(2.6,-5,2.6)); camera=bpy.context.object;camera.name='ElenaReviewCamera';scene.camera=camera;camera.data.type='ORTHO';camera.data.ortho_scale=2.3
for action in actions:
    select_action(action)
    for phase in ([.15,.4,.65,.85] if action.name.startswith('mage_') or action.name=='Axe_Spin_Attack' else [.5]):
        frame=round(action.frame_range[0]+(action.frame_range[1]-action.frame_range[0])*phase);scene.frame_set(frame)
        h=rig.matrix_world @ rig.pose.bones['mixamorig:Hips'].matrix.translation; target=Vector((h.x,h.y,.8))
        camera.location=target+Vector((2.6,-5,1.8));camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
        scene.render.filepath=str(destination/f'{action.name}-{round(phase*100):02}.png');bpy.ops.render.render(write_still=True)
print('ELENA_EXPORT_COMPLETE', flush=True)
