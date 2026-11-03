import bpy,json,math,os,subprocess
from pathlib import Path
import numpy as np
from mathutils import Vector
root=Path(os.environ['PARTIAL_REVIEW_DIR']);r=json.loads((root/'review.json').read_text());data=(root/r['binary']).read_bytes();out=Path(r'C:/Users/ryank/Documents/ChatGPT/MM Project/output/mourning-death-knee/2026-11-03/r3')/root.name;out.mkdir(parents=True,exist_ok=True);print('BLENDER',bpy.app.version_string,flush=True)
def ar(v,n):return np.frombuffer(data,dtype='<u4'if v['type']=='uint32'else'<f4',count=v['count'],offset=v['byteOffset']).reshape(-1,n)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);s=bpy.context.scene;s.render.engine='BLENDER_EEVEE_NEXT'if bpy.app.version<(5,0,0)else'BLENDER_EEVEE';s.render.resolution_x=1100;s.render.resolution_y=800;s.render.resolution_percentage=100;s.render.image_settings.file_format='PNG';s.render.threads_mode='FIXED';s.render.threads=4;s.world.color=(.13,.13,.13);s.view_settings.view_transform='Standard';s.view_settings.look='None'
texture=(root/r['texture']).resolve()
if not texture.exists():
 assets=root.parents[3]/'public'/'assets';config=json.loads((assets/'mourning-elena.json').read_text());model=(assets/config['model']).resolve();gltf=json.loads(model.read_text());packed=(model.parent/gltf['images'][0]['uri']).resolve();texture=root/'render-texture.png';ktx=os.environ.get('KTX_EXE',r'C:/Program Files/KTX-Software/bin/ktx.exe')
 if not texture.exists():subprocess.run([ktx,'extract','--transcode','rgba8','--level','0',str(packed),str(texture)],check=True,creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
mat=bpy.data.materials.new('existing-source-paint');mat.use_nodes=True;nt=mat.node_tree;nt.nodes.clear();tex=nt.nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(texture));em=nt.nodes.new('ShaderNodeEmission');em.inputs['Strength'].default_value=1.1;output=nt.nodes.new('ShaderNodeOutputMaterial');nt.links.new(tex.outputs['Color'],em.inputs['Color']);nt.links.new(em.outputs['Emission'],output.inputs['Surface'])
models={}
for p,t in zip(r['poses'][0]['meshes'],r['meshes']):
 me=bpy.data.meshes.new(t['name']);me.from_pydata(ar(p['positions'],3).tolist(),[],ar(t['indices'],3).tolist());me.update();obj=bpy.data.objects.new(t['name'],me);s.collection.objects.link(obj);me.materials.append(mat);uv=me.uv_layers.new();li=np.empty(len(me.loops),dtype=np.int32);me.loops.foreach_get('vertex_index',li);co=ar(t['uv'],2)[li].copy();co[:,1]=1-co[:,1];uv.data.foreach_set('uv',co.ravel());
 for face in me.polygons:face.use_smooth=True
 models[t['name']]=obj
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.01));floor=bpy.context.object;fm=bpy.data.materials.new('floor');fm.diffuse_color=(.055,.07,.08,1);floor.data.materials.append(fm)
ld=bpy.data.lights.new('soft-floor','AREA');ld.energy=400;ld.size=8;lo=bpy.data.objects.new('soft-floor',ld);s.collection.objects.link(lo);lo.location=(0,-3,8)
cd=bpy.data.cameras.new('pose-camera');cam=bpy.data.objects.new('pose-camera',cd);s.collection.objects.link(cam);s.camera=cam;cd.type='ORTHO';cd.ortho_scale=8.5;cd.clip_start=.05;cd.clip_end=100
shots=[]
for label,views in [('after-5.2',['front','side','quarter'])]:
 pose=next(p for p in r['poses']if p['label']==label)
 for p in pose['meshes']:
  obj=models[p['name']];obj.hide_render=not p['enabled'];obj.data.vertices.foreach_set('co',ar(p['positions'],3).ravel());obj.data.update();obj.data.normals_split_custom_set_from_vertices(ar(p['normals'],3).tolist())
 for view in views:
  angle={'front':-math.pi/2,'side':0,'quarter':-math.pi/2+.5,'knee':-math.pi/2+.8}[view];target=Vector((0,-.2,2.0))if view!='knee'else Vector((1.3,-.7,.65));radius=10;cam.location=target+Vector((radius*math.cos(angle),radius*math.sin(angle),2.5 if view!='knee'else 1));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cd.ortho_scale=8.5 if view!='knee'else 3.1;s.render.filepath=str(out/(label+'-'+view+'.png'));bpy.ops.render.render(write_still=True);shots.append(s.render.filepath)
bpy.ops.wm.save_as_mainfile(filepath=str(out/'review.blend'));(root/'render-review.json').write_text(json.dumps({'blender':bpy.app.version_string,'renders':shots,'scope':'Actual runtime CPU-deformed 49982-triangle skin at 4.5m scale. Offline source-paint pose review, not live game toon/outline/lighting.'},indent=2));print('RESULT',json.dumps({'renders':len(shots),'out':str(out)}),flush=True)
