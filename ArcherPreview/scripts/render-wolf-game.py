import bpy, json, math, sys
from pathlib import Path
from mathutils import Vector
import numpy as np

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'Sources/actors/tripo-monsters/wolf-game-r8'
def main():
 print('BLENDER',bpy.app.version,flush=True)
 scene=bpy.context.scene
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
 bpy.ops.import_scene.gltf(filepath=str(OUT/'runtime-review.glb'))
 print('ACTIONS',[(a.name,[(s.identifier,s.target_id_type) for s in a.slots]) for a in bpy.data.actions],flush=True)
 print('OBJECTS',[(o.name,o.type, o.animation_data.action.name if o.animation_data and o.animation_data.action else None,[(tr.name,[(s.name,s.action.name) for s in tr.strips]) for tr in o.animation_data.nla_tracks] if o.animation_data else []) for o in scene.objects],flush=True)
 if '--probe' in sys.argv:return
 models=[o for o in scene.objects if o.type=='MESH' and any(m.type=='ARMATURE' for m in o.modifiers)];rig=next(o for o in scene.objects if o.type=='ARMATURE');gameModels=models[:];gameRig=rig
 existing=set(scene.objects);bpy.ops.import_scene.gltf(filepath=str(ROOT/'Sources/actors/tripo-monsters/wolf-attack-r8/models/alpha-wolf-attack-r8.glb'));sourceObjects=[o for o in scene.objects if o not in existing];sourceModels=[o for o in sourceObjects if o.type=='MESH' and any(m.type=='ARMATURE' for m in o.modifiers)];sourceRig=next(o for o in sourceObjects if o.type=='ARMATURE')
 scene.render.engine='BLENDER_EEVEE_NEXT';scene.eevee.taa_render_samples=16;scene.render.threads_mode='FIXED';scene.render.threads=4;scene.render.resolution_x=720;scene.render.resolution_y=540;scene.render.resolution_percentage=100
 scene.view_settings.view_transform='Standard';scene.view_settings.look='Medium High Contrast' if False else 'None';scene.render.image_settings.file_format='PNG';scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.32,.34,.31,1)
 # Painted-color preview of the shipped 4K runtime texture; no reflective PBR.
 for mat in bpy.data.materials:
  if not mat.use_nodes:continue
  nt=mat.node_tree;bs=next((n for n in nt.nodes if n.type=='BSDF_PRINCIPLED'),None);output=next((n for n in nt.nodes if n.type=='OUTPUT_MATERIAL'),None)
  if not bs or not output:continue
  em=nt.nodes.new('ShaderNodeEmission');col=bs.inputs['Base Color'];em.inputs[0].default_value=col.default_value
  if col.is_linked:nt.links.new(col.links[0].from_socket,em.inputs[0])
  nt.links.new(em.outputs[0],output.inputs[0])
 bpy.ops.mesh.primitive_plane_add(size=60,location=(0,0,-.004));floor=bpy.context.object;mat=bpy.data.materials.new('Review floor');mat.use_nodes=True;nt=mat.node_tree;nt.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.17,.19,.16,1);nt.nodes['Principled BSDF'].inputs['Emission Color'].default_value=(.17,.19,.16,1);nt.nodes['Principled BSDF'].inputs['Emission Strength'].default_value=1;floor.data.materials.append(mat)
 cd=bpy.data.cameras.new('Runtime review camera');cam=bpy.data.objects.new('Runtime review camera',cd);scene.collection.objects.link(cam);scene.camera=cam;cd.type='ORTHO';cd.ortho_scale=3.6
 outputDir=OUT/'review';outputDir.mkdir(exist_ok=True)
 cases=[('Wolf_Run_R5',.22,v) for v in ['front','side','quarter','joint']]+[('Run_Dodge_Lunge_R5',s,'side') for s in [1.50,2.02,2.25,2.55]]+[('Hit_Cower_R5',.4,'quarter'),('Knockdown_Fall_R5',1.5,'side')]
 records=[]
 def choose(clip):
  for ob in models+[rig]:
   owners=[ob]
   if ob.type=='MESH' and ob.data.shape_keys:owners.append(ob.data.shape_keys)
   for owner in owners:
    ad=owner.animation_data
    if not ad:continue
    found=next((s for tr in ad.nla_tracks for s in tr.strips if s.action and s.action.name.startswith(clip)),None)
    for tr in ad.nla_tracks:tr.mute=True
    if found:
     ad.action=found.action
     if found.action_slot:ad.action_slot=found.action_slot
 for index,(clip,seconds,view) in enumerate(cases):
  for version,models,rig in [('game',gameModels,gameRig),('source',sourceModels,sourceRig)]:
   for ob in gameModels+sourceModels:ob.hide_render=ob not in models
   choose(clip);frame=seconds*scene.render.fps;scene.frame_set(int(frame),subframe=frame%1);bpy.context.view_layer.update()
   verts=[]
   for ob in models:
    ev=ob.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=ev.to_mesh();verts.extend([ob.matrix_world@v.co for v in mesh.vertices]);ev.to_mesh_clear()
   bounds=np.array([v[:] for v in verts])
   if version=='game':
    center=rig.matrix_world@rig.pose.bones['chest'].head;center.z=max(.85,center.z);direction=Vector({'front':(0,-1,.25),'side':(1,0,.25),'quarter':(1,-1,.4),'joint':(1,-.5,.2)}[view]).normalized();cd.ortho_scale=3.6
    if view=='joint':center=rig.matrix_world@rig.pose.bones['hind.R.lower'].head;cd.ortho_scale=1.1
    cam.location=center+direction*7;cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler()
   file=f'{version}-{index:02d}-{view}.png';scene.render.filepath=str(outputDir/file);bpy.ops.render.render(write_still=True)
   records.append({'version':version,'clip':clip,'seconds':seconds,'view':view,'file':file,'minimumSurfaceZ':float(bounds[:,2].min())})
 # Texture differences are measured in sRGB bytes; they are not GPU timing.
 src=bpy.data.images.load(str(OUT/'albedo-source.png'),check_existing=False);runtime=bpy.data.images.load(str(OUT/'albedo-runtime.png'),check_existing=False)
 a=np.array(src.pixels[:],dtype=np.float32).reshape(-1,4)[:,:3];b=np.array(runtime.pixels[:],dtype=np.float32).reshape(-1,4)[:,:3];mse=float(np.mean((a-b)**2));quality={'width':src.size[0],'height':src.size[1],'rmseNormalized':math.sqrt(mse),'psnrDb':-10*math.log10(mse) if mse else None}
 (OUT/'render-validation.json').write_text(json.dumps({'blenderVersion':list(bpy.app.version),'scope':'Offline exported-runtime color and pose preview. Shared Babylon toon/ink verified separately in code/standalone HTML. No browser/GPU measurement.','poses':records,'textureQuality':quality},indent=2))
 print('RESULT',json.dumps(quality),flush=True)
main()
