"""Existing asset/layout evidence only. No new authored model or texture.
Blender approximates the game paint: it does not reproduce mobile GPU/FoW.
"""
import bpy,json,math
from pathlib import Path
from mathutils import Vector
root=Path(__file__).resolve().parent.parent
out=root/'reports/cave-gpu-followup'
print('Blender',bpy.app.version_string,flush=True)
bpy.ops.wm.open_mainfile(filepath=str(root/'reports/cave-enclosure/cave-layout-review.blend'))
scene=bpy.context.scene
scene.render.engine='BLENDER_EEVEE_NEXT'
scene.render.resolution_x=1100;scene.render.resolution_y=650;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='Standard';scene.view_settings.look='Medium High Contrast'
layout=json.loads((root/'reports/cave-enclosure/layout.json').read_text(encoding='utf8'))
config=json.loads((root/'public/assets/witch-cave.json').read_text(encoding='utf8'))['assets']['cave-01-eroded-wall']
template=next(p for p in layout['placements'] if p['asset']=='cave-01-eroded-wall')
source=bpy.data.objects[template['id']+'-0'];added=[]
for p in json.loads((out/'lower-rock-layout.json').read_text(encoding='utf8')):
 ob=bpy.data.objects.new(p['id']+'-0',source.data);scene.collection.objects.link(ob)
 ob.location=(p['x'],-p['z'],p['elevation']-.025);ob.rotation_euler.z=p['yaw']+config.get('frontYawOffset',0)
 ob.scale=(config['height']/config['bounds'][1]*p['scale'],)*3;added.append(ob)
# Emulate only the terrain's world-space rock colour; original asset materials
# and all source geometry/UVs remain unchanged in this comparison.
ground=bpy.data.objects['terrain'];mat=ground.data.materials[0];nodes=mat.node_tree.nodes;links=mat.node_tree.links
output=next(n for n in nodes if n.type=='OUTPUT_MATERIAL');oldshader=output.inputs[0].links[0].from_node;oldcolor=oldshader.inputs[0].links[0].from_socket
geo=nodes.new('ShaderNodeNewGeometry');normal=nodes.new('ShaderNodeSeparateXYZ');links.new(geo.outputs['Normal'],normal.inputs[0])
absolute=nodes.new('ShaderNodeMath');absolute.operation='ABSOLUTE';links.new(normal.outputs['Z'],absolute.inputs[0])
range_node=nodes.new('ShaderNodeMapRange');range_node.clamp=True;range_node.inputs['From Min'].default_value=.42;range_node.inputs['From Max'].default_value=.86;range_node.inputs['To Min'].default_value=.92;range_node.inputs['To Max'].default_value=0;links.new(absolute.outputs[0],range_node.inputs['Value'])
coord=nodes.new('ShaderNodeVectorMath');coord.operation='SCALE';coord.inputs['Scale'].default_value=.11;links.new(geo.outputs['Position'],coord.inputs[0])
rock=nodes.new('ShaderNodeTexImage');rock.image=bpy.data.images.load(str(root/'reports/witch-cave-v5/cave-01-eroded-wall/color-0.png'));rock.projection='BOX';rock.projection_blend=.05;links.new(coord.outputs[0],rock.inputs['Vector'])
mix=nodes.new('ShaderNodeMixRGB');links.new(range_node.outputs[0],mix.inputs[0]);links.new(oldcolor,mix.inputs[1]);links.new(rock.outputs['Color'],mix.inputs[2])
em=nodes.new('ShaderNodeEmission');links.new(mix.outputs[0],em.inputs[0]);links.new(em.outputs[0],output.inputs[0])
cam=scene.camera;cam.data.type='PERSP';cam.data.lens=36;cam.data.clip_start=.05
audit=json.loads((out/'camera-audit.json').read_text(encoding='utf8'))
def render(name,eye,target):
 cam.location=(eye[0],-eye[2],eye[1]);look=Vector((target[0],-target[2],target[1]));cam.rotation_euler=(look-cam.location).to_track_quat('-Z','Y').to_euler()
 scene.render.filepath=str(out/(name+'.png'));bpy.ops.render.render(write_still=True)
for view in audit['views']:
 for ob in added:ob.hide_render=True
 links.remove(mix.inputs[2].links[0]);mix.inputs[2].default_value=(.16,.13,.14,1)
 render(view['name']+'-before',view['eye'],view['target'])
 for ob in added:ob.hide_render=False
 links.new(rock.outputs['Color'],mix.inputs[2]);render(view['name']+'-after',view['eye'],view['target'])
bpy.ops.wm.save_as_mainfile(filepath=str(out/'cave-source-review.blend'))
print(json.dumps({'renders':len(audit['views'])*2,'addedExistingAssetInstances':len(added),'newModels':0,'newTextures':0,'limitations':'Blender source geometry + paint approximation, not Babylon GPU/FoW. Requested camera was corrected before each comparison.'}),flush=True)
