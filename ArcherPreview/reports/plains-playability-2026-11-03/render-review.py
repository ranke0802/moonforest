"""Existing geometry/texture comparison; offline composition, not game rendering."""
import bpy,json,math,sys
from pathlib import Path
from mathutils import Vector
out=Path(__file__).parent
data=json.loads((out/'review-scene.json').read_text())
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
version=args[0] if args else 'before'
layout=json.loads((out.parent/'plains-composition-review-2026-11-03/baseline-layout.json' if version=='before' else out/'current-layout.json').read_text())
print('BLENDER_VERSION',bpy.app.version_string,flush=True)
for ob in list(bpy.data.objects):bpy.data.objects.remove(ob,do_unlink=True)
scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE' if bpy.app.version[0]>=5 else 'BLENDER_EEVEE_NEXT'
scene.eevee.taa_render_samples=16
scene.render.resolution_x=1100;scene.render.resolution_y=650;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='Standard';scene.view_settings.look='None'
scene.world.color=(.32,.36,.40)
templates={}
for asset in set(p['asset'] for p in layout['placements']):
 before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(out/'models'/asset/'review.gltf'));bpy.context.view_layer.update()
 created=set(bpy.data.objects)-before;meshes=[]
 for ob in created:
  if ob.type!='MESH':continue
  me=ob.data.copy();me.transform(ob.matrix_world);meshes.append(me)
  for mat in me.materials:
   if not mat or not mat.node_tree:continue
   for node in mat.node_tree.nodes:
    if node.type=='BSDF_PRINCIPLED':node.inputs['Roughness'].default_value=1;node.inputs['Metallic'].default_value=0;node.inputs['Specular IOR Level'].default_value=0
 templates[asset]=meshes
 for ob in created:bpy.data.objects.remove(ob,do_unlink=True)
t=data['terrain'];n=t['subdivisions'];size=t['size'];heights=t['heights'];verts=[];faces=[]
for row in range(n+1):
 for col in range(n+1):verts.append((col*size/n-size/2,row*size/n-size/2,heights[row*(n+1)+col]))
for row in range(n):
 for col in range(n):
  a=row*(n+1)+col;faces.extend([(a,a+1,a+n+2),(a,a+n+2,a+n+1)])
me=bpy.data.meshes.new('review-terrain');me.from_pydata(verts,[],faces);me.update();uv=me.uv_layers.new()
for poly in me.polygons:
 for li in poly.loop_indices:
  co=me.vertices[me.loops[li].vertex_index].co;uv.data[li].uv=((co.x+size/2)/size,(co.y+size/2)/size)
ground=bpy.data.objects.new('review-terrain',me);scene.collection.objects.link(ground)
mat=bpy.data.materials.new('existing-ground-paint');mat.use_nodes=True
tex=mat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(out/'ground.png'));p=mat.node_tree.nodes.get('Principled BSDF');mat.node_tree.links.new(tex.outputs['Color'],p.inputs['Base Color']);p.inputs['Roughness'].default_value=1;p.inputs['Specular IOR Level'].default_value=0;me.materials.append(mat)
def height(x,z):
 gx=max(0,min(n,(x+size/2)/size*n));gz=max(0,min(n,(size/2-z)/size*n));c=min(n-1,int(gx));r=min(n-1,int(gz));u=gx-c;v=gz-r;i=r*(n+1)+c
 a,b,cc,d=heights[i],heights[i+1],heights[i+n+1],heights[i+n+2]
 return a+u*(b-a)+v*(d-b) if u>=v else a+v*(cc-a)+u*(d-cc)
for placement in layout['placements']:
 config=data['assets'][placement['asset']];scale=config['height']/config['bounds'][1]*placement['scale']
 for i,me in enumerate(templates[placement['asset']]):
  ob=bpy.data.objects.new(placement['id']+'-'+str(i),me);scene.collection.objects.link(ob)
  ob.location=(placement['x'],-placement['z'],placement.get('elevation',height(placement['x'],placement['z']))-.025+placement.get('yOffset',0))
  ob.scale=(scale,scale,scale);ob.rotation_euler.z=placement['yaw']+config.get('frontYawOffset',0)
light=bpy.data.lights.new('review-sun','SUN');light.energy=2;light.angle=.25;ob=bpy.data.objects.new('review-sun',light);scene.collection.objects.link(ob);ob.rotation_euler=(.45,-.4,-.5)
camdata=bpy.data.cameras.new('review');cam=bpy.data.objects.new('review',camdata);scene.collection.objects.link(cam);scene.camera=cam;camdata.lens=30;camdata.clip_end=800
for name,position,target in [('entry',(-98,29,10),(-62,21,2)),('junction',(-14,-44,15),(-6,-13,3)),('summit',(-34,18,15),(15,36,3))]:
 cam.location=position;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(out/(version+'-'+name+'.png'));bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=str(out/(version+'-review.blend')))
print(json.dumps({'version':version,'placements':len(layout['placements']),'renders':3,'browserAutomation':False}),flush=True)
