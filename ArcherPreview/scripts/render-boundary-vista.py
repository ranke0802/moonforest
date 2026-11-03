"""Offline colour/shape review of shipped mountain geometry, not gameplay capture."""
import bpy,json,math,sys
from pathlib import Path
from mathutils import Vector
root=Path(sys.argv[sys.argv.index('--')+1]);data=json.loads((root/'outdoor-vista-geometry.json').read_text())
out=Path('C:/Users/ryank/Documents/ChatGPT/MM Project/output/boundary-continuity/2026-11-03');out.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE_NEXT';scene.render.resolution_x=1280;scene.render.resolution_y=720;scene.render.resolution_percentage=100
scene.world.color=(.43,.57,.66);scene.view_settings.view_transform='Standard';scene.view_settings.look='Medium High Contrast';scene.view_settings.exposure=0;scene.view_settings.gamma=1
material=bpy.data.materials.new('Existing baked vertex colours');material.use_nodes=True;nodes=material.node_tree.nodes;nodes.clear();output=nodes.new('ShaderNodeOutputMaterial');emission=nodes.new('ShaderNodeEmission');colour=nodes.new('ShaderNodeVertexColor');colour.layer_name='AuthoredColour';material.node_tree.links.new(colour.outputs['Color'],emission.inputs['Color']);material.node_tree.links.new(emission.outputs[0],output.inputs[0])
def convert(p):return (p[0],-p[2],p[1])
def mesh(name,positions):
    verts=[convert(positions[i:i+3]) for i in range(0,len(positions),3)];faces=[data['indices'][i:i+3] for i in range(0,len(data['indices']),3)]
    m=bpy.data.meshes.new(name);m.from_pydata(verts,[],faces);m.update();colors=m.color_attributes.new(name='AuthoredColour',type='FLOAT_COLOR',domain='POINT')
    for i in range(len(verts)):colors.data[i].color=data['colors'][i*4:i*4+4]
    obj=bpy.data.objects.new(name,m);scene.collection.objects.link(obj);m.materials.append(material);return obj
base=data['base'];town=[v*(1.3 if i%3==1 else 1.9) for i,v in enumerate(base)];old=[v*(.72 if i%3==1 else 4.5) for i,v in enumerate(base)]
objects=[mesh('Village unchanged',town),mesh('Plains before',old),mesh('Plains corrected',data['plains'])]
bpy.ops.mesh.primitive_plane_add(size=2000,location=(0,0,.12));ground=bpy.context.object;ground_material=bpy.data.materials.new('Neutral ground');ground_material.use_nodes=True;bsdf=ground_material.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Base Color'].default_value=(.19,.23,.12,1);bsdf.inputs['Emission Color'].default_value=(.19,.23,.12,1);bsdf.inputs['Emission Strength'].default_value=1;ground.data.materials.append(ground_material)
bpy.ops.object.camera_add();camera=bpy.context.object;scene.camera=camera;camera.data.sensor_fit='VERTICAL';camera.data.sensor_height=32;camera.data.lens=32/(2*math.tan(.65/2));camera.data.clip_end=1500
b=data['boundary'];a=b['yaw'];c=math.cos(a);s=math.sin(a)
def transform(p):
    x=p[0]-b['villagePortal']['x'];z=p[2]-b['villagePortal']['z'];return (b['plainsPortal']['x']+c*x+s*z,p[1],b['plainsPortal']['z']-s*x+c*z)
for direction,dz in [('outward',-13),('townward',13)]:
    focus=(b['villagePortal']['x'],1.5,b['villagePortal']['z']);eye=(focus[0],4.3,focus[2]+dz)
    for i,obj in enumerate(objects):
        for other in objects:other.hide_render=other!=obj
        p=eye if i==0 else transform(eye);target=focus if i==0 else transform(focus)
        camera.location=convert(p);camera.rotation_euler=(Vector(convert(target))-camera.location).to_track_quat('-Z','Y').to_euler()
        scene.render.filepath=str(out/f'vista-{direction}-{i}.png');bpy.ops.render.render(write_still=True)
print('VISTA_REVIEW '+str(out))
