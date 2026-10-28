import bpy,json,math
from pathlib import Path
from mathutils import Vector
root=Path(__file__).resolve().parent.parent;out=root/'reports/monster-forest-v4'
data=json.loads((out/'review-scene.json').read_text(encoding='utf8'));layout=json.loads((out/'layout.json').read_text(encoding='utf8'))
print('Blender',bpy.app.version_string,flush=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE_NEXT';scene.render.resolution_x=1440;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False
scene.world.color=(.25,.27,.3);scene.view_settings.view_transform='Standard';scene.view_settings.look='Medium High Contrast';scene.view_settings.exposure=0;scene.view_settings.gamma=1
templates={}
for asset,config in data['assets'].items():
 before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(out/asset/'review.gltf'));created=set(bpy.data.objects)-before
 bpy.context.view_layer.update();meshes=[]
 for ob in created:
  if ob.type!='MESH':continue
  me=ob.data.copy();me.transform(ob.matrix_world);meshes.append(me)
  for material in me.materials:
   if not material:continue
   n=material.node_tree.nodes;l=material.node_tree.links;bsdf=next((v for v in n if v.type=='BSDF_PRINCIPLED'),None)
   if not bsdf:continue
   color=bsdf.inputs['Base Color'];color_output=color.links[0].from_socket if color.is_linked else None
   diffuse=n.new('ShaderNodeBsdfDiffuse');diffuse.inputs['Color'].default_value=(.8,.8,.8,1)
   rgb=n.new('ShaderNodeShaderToRGB');l.new(diffuse.outputs[0],rgb.inputs[0])
   ramp=n.new('ShaderNodeValToRGB');ramp.color_ramp.interpolation='CONSTANT'
   ramp.color_ramp.elements[0].position=0;ramp.color_ramp.elements[0].color=(.66,.68,.73,1)
   ramp.color_ramp.elements[1].position=.65;ramp.color_ramp.elements[1].color=(1.02,1.02,.98,1)
   ramp.color_ramp.elements.new(.25).color=(.86,.87,.85,1);l.new(rgb.outputs[0],ramp.inputs[0])
   mult=n.new('ShaderNodeMixRGB');mult.blend_type='MULTIPLY';mult.inputs[0].default_value=1;mult.inputs[1].default_value=color.default_value
   if color_output:l.new(color_output,mult.inputs[1])
   l.new(ramp.outputs[0],mult.inputs[2]);em=n.new('ShaderNodeEmission');l.new(mult.outputs[0],em.inputs[0]);l.new(em.outputs[0],next(v for v in n if v.type=='OUTPUT_MATERIAL').inputs[0])
  templates[asset]=meshes
 for ob in created:bpy.data.objects.remove(ob,do_unlink=True)
terrain=data['terrain'];n=terrain['subdivisions'];size=terrain['size'];heights=terrain['heights'];verts=[];faces=[]
for row in range(n+1):
 for col in range(n+1):verts.append((col*size/n-size/2,row*size/n-size/2,heights[row*(n+1)+col]))
for row in range(n):
 for col in range(n):
  a=row*(n+1)+col;faces.extend([(a,a+1,a+n+2),(a,a+n+2,a+n+1)])
me=bpy.data.meshes.new('terrain');me.from_pydata(verts,[],faces);me.update();uv=me.uv_layers.new()
for poly in me.polygons:
 for loop in poly.loop_indices:
  co=me.vertices[me.loops[loop].vertex_index].co;uv.data[loop].uv=((co.x+80)/160,(co.y+80)/160)
ground=bpy.data.objects.new('terrain',me);scene.collection.objects.link(ground)
mat=bpy.data.materials.new('terrain-paint');mat.use_nodes=True;nodes=mat.node_tree.nodes;links=mat.node_tree.links;tex=nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(out/'forest-ground.png'));p=nodes.get('Principled BSDF');links.new(tex.outputs['Color'],p.inputs['Base Color']);links.new(tex.outputs['Color'],p.inputs['Emission Color']);p.inputs['Emission Strength'].default_value=.7;p.inputs['Roughness'].default_value=1;p.inputs['Specular IOR Level'].default_value=0;me.materials.append(mat)
def height(x,z):
 col=max(0,min(n,round((x+80)/size*n)));row=max(0,min(n,round((80-z)/size*n)));return heights[row*(n+1)+col]
for placement in layout['placements']:
 config=data['assets'][placement['asset']];scale=config['height']/config['bounds'][1]*placement['scale']
 for i,me in enumerate(templates[placement['asset']]):
  ob=bpy.data.objects.new(placement['id']+'-'+str(i),me);scene.collection.objects.link(ob);ob.location=(placement['x'],-placement['z'],height(placement['x'],placement['z'])-.025);ob.scale=(scale,scale,scale);ob.rotation_euler.z=placement['yaw']+config.get('frontYawOffset',0)
light=bpy.data.lights.new('soft-moon-sun','SUN');light.energy=2;light.angle=.15;ob=bpy.data.objects.new('soft-moon-sun',light);scene.collection.objects.link(ob);ob.rotation_euler=(.45,-.4,-.5)
camdata=bpy.data.cameras.new('review');cam=bpy.data.objects.new('review',camdata);scene.collection.objects.link(cam);scene.camera=cam
def render(name,position,target,ortho=None):
 cam.location=position;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();camdata.type='ORTHO' if ortho else 'PERSP';camdata.ortho_scale=ortho or 35;camdata.lens=38;scene.render.filepath=str(out/name);bpy.ops.render.render(write_still=True)
render('forest-layout-render.png',(12,-103,108),(0,2,0),148)
render('forest-entry-render.png',(0,-52,6),(4,-32,2))
render('forest-cave-render.png',(28,23,11),(28,43,2))
bpy.ops.wm.save_as_mainfile(filepath=str(out/'forest-layout-review.blend'))
print(json.dumps({'placements':len(layout['placements']),'renders':3,'browserAutomation':False}),flush=True)
