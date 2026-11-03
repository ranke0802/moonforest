import bpy,json,math
from pathlib import Path
from mathutils import Vector
root=Path(r'C:/dev/moonforest-archer/ArcherPreview/reports/chest-opening-2026-11-03');r=json.loads((root/'opening-geometry.json').read_text());out=Path(r'C:/Users/ryank/Documents/ChatGPT/MM Project/output/chest-opening/2026-11-03');out.mkdir(parents=True,exist_ok=True);print('BLENDER',bpy.app.version_string,flush=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);s=bpy.context.scene;s.render.engine='BLENDER_EEVEE_NEXT';s.render.resolution_x=1000;s.render.resolution_y=800;s.render.resolution_percentage=100;s.view_settings.view_transform='Standard';s.view_settings.look='None';s.world.color=(.12,.12,.12)
mat=bpy.data.materials.new('existing-paint');mat.use_nodes=True;nodes=mat.node_tree.nodes;tex=nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(root/'chest-texture.png'));attribute=nodes.new('ShaderNodeAttribute');attribute.attribute_name='ChestTint';mix=nodes.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1;mat.node_tree.links.new(tex.outputs['Color'],mix.inputs[1]);mat.node_tree.links.new(attribute.outputs['Color'],mix.inputs[2]);mat.node_tree.links.new(mix.outputs[0],nodes['Principled BSDF'].inputs['Base Color']);nodes['Principled BSDF'].inputs['Roughness'].default_value=.75
models={}
for source in r['poses'][0]['meshes']:
 p=[source['positions'][i:i+3]for i in range(0,len(source['positions']),3)];faces=[source['indices'][i:i+3]for i in range(0,len(source['indices']),3)];mesh=bpy.data.meshes.new(source['name']);mesh.from_pydata(p,[],faces);mesh.update();obj=bpy.data.objects.new(source['name'],mesh);s.collection.objects.link(obj);mesh.materials.append(mat);models[source['name']]=obj;uv=mesh.uv_layers.new()
 for loop in mesh.loops:uv.data[loop.index].uv=(source['uv'][loop.vertex_index*2],1-source['uv'][loop.vertex_index*2+1])
 colors=mesh.color_attributes.new(name='ChestTint',type='FLOAT_COLOR',domain='POINT');colors.data.foreach_set('color',source['colors'] or [v for _ in p for v in (1,1,1,1)])
 for f in mesh.polygons:f.use_smooth=True
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.005));floor=bpy.context.object;floorMat=bpy.data.materials.new('floor');floorMat.diffuse_color=(.12,.14,.16,1);floor.data.materials.append(floorMat)
for pos,energy,size in[((-2,-3,4),350,4),((2,1,3),150,3)]:
 d=bpy.data.lights.new('review-light','AREA');d.energy=energy;d.size=size;o=bpy.data.objects.new('review-light',d);s.collection.objects.link(o);o.location=pos;o.rotation_euler=(Vector((0,0,.25))-o.location).to_track_quat('-Z','Y').to_euler()
camData=bpy.data.cameras.new('camera');cam=bpy.data.objects.new('camera',camData);s.collection.objects.link(cam);s.camera=cam;camData.type='ORTHO';camData.ortho_scale=1.95;shots=[]
for pose in r['poses']:
 for source in pose['meshes']:
  obj=models[source['name']];obj.data.vertices.foreach_set('co',source['positions']);obj.data.update();obj.data.normals_split_custom_set_from_vertices([source['normals'][i:i+3]for i in range(0,len(source['normals']),3)])
 for name,pos in[('front',(0,-3,1.5)),('side',(3,0,1.2)),('quarter',(2,-3,1.8))]:
  cam.location=pos;cam.rotation_euler=(Vector((0,0,.55))-cam.location).to_track_quat('-Z','Y').to_euler();s.render.filepath=str(out/(pose['label']+'-'+name+'.png'));bpy.ops.render.render(write_still=True);shots.append(s.render.filepath)
bpy.ops.wm.save_as_mainfile(filepath=str(out/'opening-review.blend'));(root/'render-validation.json').write_text(json.dumps({'blender':bpy.app.version_string,'renders':shots,'scope':'Actual runtime chest geometry and hinge matrices, existing texture. Offline approximate PBR lights, not live village toon shader.'},indent=2));print('RESULT',json.dumps({'views':len(shots),'out':str(out)}))
