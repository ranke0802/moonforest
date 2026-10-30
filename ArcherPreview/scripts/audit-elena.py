import bpy,json,sys,math,hashlib
from pathlib import Path
from mathutils import Vector
source=Path(sys.argv[sys.argv.index('--')+1]);out=Path(sys.argv[sys.argv.index('--')+2]);out.mkdir(parents=True,exist_ok=True)
print('Blender',bpy.app.version_string,flush=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.fbx(filepath=str(source),use_image_search=False)
scene=bpy.context.scene
rigs=[o for o in scene.objects if o.type=='ARMATURE'];meshes=[o for o in scene.objects if o.type=='MESH']
def bounds():
 bpy.context.view_layer.update();dg=bpy.context.evaluated_depsgraph_get();points=[]
 for ob in meshes:
  ev=ob.evaluated_get(dg);me=ev.to_mesh();points.extend(ev.matrix_world@v.co for v in me.vertices);ev.to_mesh_clear()
 return [[min(v[k] for v in points) for k in range(3)],[max(v[k] for v in points) for k in range(3)]]
actions=[]
for action in bpy.data.actions:
 start,end=action.frame_range
 for rig in rigs:
  rig.animation_data_create();rig.animation_data.action=action
  if action.slots:rig.animation_data.action_slot=action.slots[0]
 samples=[]
 for frame in [start,(start+end)/2,end]:scene.frame_set(int(frame),subframe=frame-int(frame));samples.append({'frame':frame,'bounds':bounds()})
 action.use_fake_user=True
 actions.append({'name':action.name,'frames':[start,end],'duration':(end-start)/scene.render.fps,'slots':[s.identifier for s in action.slots],'samples':samples})
for rig in rigs:
 rig.animation_data_clear();rig.data.pose_position='REST'
rest=bounds();meshInfo=[]
for ob in meshes:
 ob.data.calc_loop_triangles();weights=[len([g for g in v.groups if g.weight>.0001]) for v in ob.data.vertices]
 meshInfo.append({'name':ob.name,'vertices':len(ob.data.vertices),'triangles':len(ob.data.loop_triangles),'materials':[m.name if m else None for m in ob.data.materials],'maxInfluences':max(weights),'unweighted':sum(n==0 for n in weights),'modifiers':[m.type for m in ob.modifiers]})
images=[]
for im in bpy.data.images:
 if im.name=='Render Result':continue
 images.append({'name':im.name,'size':list(im.size),'filepath':im.filepath,'packed':bool(im.packed_file),'hasData':im.has_data})
for rig in rigs:rig.data.pose_position='POSE'
report={'source':str(source),'sourceBytes':source.stat().st_size,'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'blender':bpy.app.version_string,'fps':scene.render.fps,'restBounds':rest,'meshes':meshInfo,'rigs':[{'name':r.name,'bones':[b.name for b in r.data.bones]} for r in rigs],'images':images,'actions':actions}
(out/'source-audit.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
bpy.ops.wm.save_as_mainfile(filepath=str(out/'elena-source-review.blend'))
print('RESULT',json.dumps({'meshes':meshInfo,'bounds':rest,'images':images,'actions':[{'name':a['name'],'duration':a['duration']} for a in actions]}),flush=True)
