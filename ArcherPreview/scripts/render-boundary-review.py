import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2]/'Sources'))
from resolve_source import source_path, project_path, tool_path
"""Actual shipped LOD2 geometry review; lighting approximates the game."""
import bpy,json,math
from pathlib import Path
from mathutils import Matrix,Vector
out=Path(rstr(project_path("ArcherPreview/reports/archive/boundary-continuity/2026-11-03")));data=json.loads((out/'scene.json').read_text());print('Blender',bpy.app.version_string,flush=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE_NEXT' if bpy.app.version<(5,0,0) else 'BLENDER_EEVEE';scene.render.resolution_x=1280;scene.render.resolution_y=800;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.world.color=(.45,.45,.45);scene.view_settings.view_transform='Standard'
templates={}
for asset,folder in data['folders'].items():
 before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(Path(folder)/'review.gltf'));bpy.context.view_layer.update();created=set(bpy.data.objects)-before;meshes=[]
 for obj in created:
  if obj.type=='MESH':
   mesh=obj.data.copy();mesh.transform(obj.matrix_world);meshes.append(mesh)
   for material in mesh.materials:
    if material and material.use_nodes:
     bsdf=next((n for n in material.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
     if bsdf:bsdf.inputs['Roughness'].default_value=1
 templates[asset]=meshes
 for obj in created:bpy.data.objects.remove(obj,do_unlink=True)
light=bpy.data.lights.new('boundary-sun','SUN');light.energy=2;light.use_shadow=False;sun=bpy.data.objects.new('boundary-sun',light);scene.collection.objects.link(sun);sun.rotation_euler=(.4,-.5,-.6)
camdata=bpy.data.cameras.new('review');cam=bpy.data.objects.new('review',camdata);scene.collection.objects.link(cam);scene.camera=cam;camdata.lens=30
def ground(terrain,config):
 n=terrain['n'];size=terrain['size'];vertices=[];faces=[]
 for row in range(n+1):
  for col in range(n+1):vertices.append((col*size/n-size/2,-(row*size/n-size/2),terrain['heights'][row*(n+1)+col]))
 for row in range(n):
  for col in range(n):a=row*(n+1)+col;faces.extend([(a,a+n+2,a+1),(a,a+n+1,a+n+2)])
 mesh=bpy.data.meshes.new('ground');mesh.from_pydata(vertices,[],faces);mesh.update();uv=mesh.uv_layers.new()
 for poly in mesh.polygons:
  for loop in poly.loop_indices:
   co=mesh.vertices[mesh.loops[loop].vertex_index].co;uv.data[loop].uv=(.5+co.x/config['span'],.5-co.y/config['span'])
 mat=bpy.data.materials.new('ground');mat.use_nodes=True;bsdf=mat.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Roughness'].default_value=1;tex=mat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(config['path'],check_existing=True);mat.node_tree.links.new(tex.outputs['Color'],bsdf.inputs['Base Color']);mesh.materials.append(mat);obj=bpy.data.objects.new('ground',mesh);scene.collection.objects.link(obj);return obj
def render(name,placements,terrain,paint,camera,target,ortho=False):
 objects=[ground(data[terrain],data['grounds'][paint])]
 for p in placements:
  config=data['configs'][p['asset']];scale=config['height']/config['bounds'][1]*p['scale'];sx=p.get('length',config['bounds'][0]*scale)/config['bounds'][0];sz=p.get('depth',config['bounds'][2]*scale)/config['bounds'][2]
  transform=Matrix.Translation((p['x'],-p['z'],p['rootY']))@Matrix.Rotation(p['yaw'],4,'Z')@Matrix.Diagonal((sx,sz,scale,1))@Matrix.Rotation(config.get('frontYawOffset',0),4,'Z')
  for mesh in templates[p['asset']]:
   obj=bpy.data.objects.new(p['id'],mesh);scene.collection.objects.link(obj);obj.matrix_world=transform;objects.append(obj)
 x,z,y=data['camera'][camera];cam.location=(x,-z,y);x,z,y=data['camera'][target];cam.rotation_euler=(Vector((x,-z,y))-cam.location).to_track_quat('-Z','Y').to_euler();camdata.type='ORTHO' if ortho else 'PERSP';camdata.ortho_scale=72
 if ortho and camera.startswith('plains'):cam.rotation_euler.z+=data['boundaryYaw']
 bpy.context.view_layer.update();scene.render.filepath=str(out/name);bpy.ops.render.render(write_still=True)
 for obj in objects:bpy.data.objects.remove(obj,do_unlink=True)
render('01-before-plains.png',data['beforePlains'],'plainsTerrain','beforePlains','plains','plainsTarget')
render('02-before-village.png',data['actualVillage'],'villageTerrain','beforeVillage','village','villageTarget')
render('03-after-plains.png',data['afterPlains'],'plainsTerrain','afterPlains','plains','plainsTarget')
render('04-after-village.png',data['actualVillage'],'villageTerrain','afterVillage','village','villageTarget')
render('05-after-plains-overview.png',data['afterPlains'],'plainsTerrain','afterPlains','plainsOverview','plainsOverviewTarget',True)
render('06-after-village-overview.png',data['actualVillage'],'villageTerrain','afterVillage','villageOverview','villageOverviewTarget',True)
render('08-plains-ground-before.png',data['plainsScenery'],'plainsTerrain','beforePlains','plainsLandscape','plainsLandscapeTarget')
render('09-plains-ground-after.png',data['plainsScenery'],'plainsTerrain','afterPlains','plainsLandscape','plainsLandscapeTarget')
print(json.dumps({'renders':8,'output':str(out),'gpuPerformanceMeasured':False}),flush=True)
