"""Offline geometry review; textures and lighting only approximate Babylon.

Run export-cave-natural-review.mjs first. Blender does not reproduce Babylon's
fog, dynamically lit shaders, shadows, FOW, water or mobile GPU behavior.
"""
import bpy, json, math, os
from pathlib import Path
from mathutils import Matrix, Vector

out=Path(os.environ.get('CAVE_NATURAL_REVIEW_OUT',r'C:/Users/ryank/Documents/ChatGPT/MM Project/output/cave-natural-review/2026-11-03'))
data=json.loads((out/'scene-snapshot.json').read_text(encoding='utf8'))
print('Blender',bpy.app.version_string,flush=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE_NEXT' if bpy.app.version<(5,0,0) else 'BLENDER_EEVEE'
scene.render.resolution_x=1280;scene.render.resolution_y=800;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False
scene.view_settings.view_transform='Standard';scene.view_settings.look='Medium High Contrast';scene.world.color=(.19,.18,.21)

templates={}
for asset,config in data['assets'].items():
    before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(Path(data['folders'][asset])/'review.gltf'))
    created=set(bpy.data.objects)-before;bpy.context.view_layer.update();meshes=[]
    for obj in created:
        if obj.type!='MESH':continue
        mesh=obj.data.copy();mesh.transform(obj.matrix_world);meshes.append(mesh)
        for material in mesh.materials:
            if not material or not material.use_nodes:continue
            bsdf=next((n for n in material.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
            if bsdf:
                bsdf.inputs['Roughness'].default_value=1
                if asset=='cave-derived-laboratory-rock':
                    # Approximate the runtime procedural palette with a diffuse
                    # brown-grey material; runtime shading/fog remain different.
                    bsdf.inputs['Base Color'].default_value=(.27,.23,.21,1)
                    bsdf.inputs['Emission Strength'].default_value=0
                if bsdf.inputs['Base Color'].is_linked:
                    material.node_tree.links.new(bsdf.inputs['Base Color'].links[0].from_socket,bsdf.inputs['Emission Color'])
                    bsdf.inputs['Emission Strength'].default_value=.16
            if asset in data['laboratory']['legacyAssets'] and not material.get('review_lab_clip'):
                # Runtime legacy shader discards fragments inside the replacement
                # rectangle; keep this exact in world space for each placement.
                tree=material.node_tree;nodes=tree.nodes;links=tree.links;output=next(n for n in nodes if n.type=='OUTPUT_MATERIAL')
                existing=output.inputs['Surface'].links[0].from_socket
                geometry=nodes.new('ShaderNodeNewGeometry');xyz=nodes.new('ShaderNodeSeparateXYZ');links.new(geometry.outputs['Position'],xyz.inputs[0]);bounds=data['laboratory']['bounds']
                def compare(axis,operation,value):
                    node=nodes.new('ShaderNodeMath');node.operation=operation;links.new(xyz.outputs[axis],node.inputs[0]);node.inputs[1].default_value=value;return node.outputs[0]
                def product(a,b):
                    node=nodes.new('ShaderNodeMath');node.operation='MULTIPLY';links.new(a,node.inputs[0]);links.new(b,node.inputs[1]);return node.outputs[0]
                inside=product(product(compare('X','GREATER_THAN',bounds['minX']),compare('X','LESS_THAN',bounds['maxX'])),product(compare('Y','GREATER_THAN',-bounds['maxZ']),compare('Y','LESS_THAN',-bounds['minZ'])))
                transparent=nodes.new('ShaderNodeBsdfTransparent');mix=nodes.new('ShaderNodeMixShader');links.new(inside,mix.inputs[0]);links.new(existing,mix.inputs[1]);links.new(transparent.outputs[0],mix.inputs[2]);links.new(mix.outputs[0],output.inputs['Surface']);material.surface_render_method='DITHERED';material['review_lab_clip']=True
    templates[asset]=meshes
    for obj in created:bpy.data.objects.remove(obj,do_unlink=True)

terrain=data['terrain'];n=terrain['subdivisions'];size=terrain['size'];heights=terrain['heights'];vertices=[];faces=[]
for row in range(n+1):
    for col in range(n+1):vertices.append((col*size/n-size/2,row*size/n-size/2,heights[row*(n+1)+col]))
for row in range(n):
    for col in range(n):
        a=row*(n+1)+col;faces.extend([(a,a+1,a+n+2),(a,a+n+2,a+n+1)])
mesh=bpy.data.meshes.new('actual-terrain');mesh.from_pydata(vertices,[],faces);mesh.update();uv=mesh.uv_layers.new()
for poly in mesh.polygons:
    for loop in poly.loop_indices:
        co=mesh.vertices[mesh.loops[loop].vertex_index].co;uv.data[loop].uv=((co.x+80)/160,(-co.y+80)/160)
obj=bpy.data.objects.new('actual-terrain',mesh);scene.collection.objects.link(obj)
ground=bpy.data.materials.new('approximate-ground');ground.use_nodes=True;nodes=ground.node_tree.nodes;links=ground.node_tree.links;texture=nodes.new('ShaderNodeTexImage');texture.image=bpy.data.images.load(str(out/'cave-ground.png'))
bsdf=nodes.get('Principled BSDF');links.new(texture.outputs['Color'],bsdf.inputs['Base Color']);bsdf.inputs['Roughness'].default_value=1;mesh.materials.append(ground)

for p in data['placements']:
    config=data['assets'][p['asset']];s=config['height']/config['bounds'][1]*p['scale'];sx=p.get('length',config['bounds'][0]*s)/config['bounds'][0];sz=p.get('depth',config['bounds'][2]*s)/config['bounds'][2]
    transform=Matrix.Translation((p['x'],-p['z'],p['rootY'])) @ Matrix.Rotation(p['yaw'],4,'Z') @ Matrix.Diagonal((sx,sz,s,1)) @ Matrix.Rotation(config.get('frontYawOffset',0),4,'Z')
    for i,mesh in enumerate(templates[p['asset']]):
        obj=bpy.data.objects.new(p['id']+'-'+str(i),mesh);scene.collection.objects.link(obj);obj.matrix_world=transform

# Same roof triangles and laboratory opening as the runtime source snapshot.
roof=data['roof'];pos=roof['positions'];ind=roof['indices'];vertices=[(pos[i],-pos[i+2],pos[i+1]) for i in range(0,len(pos),3)];faces=[ind[i:i+3] for i in range(0,len(ind),3)]
mesh=bpy.data.meshes.new('runtime-roof');mesh.from_pydata(vertices,[],faces);mesh.update();roof_obj=bpy.data.objects.new('runtime-roof',mesh);scene.collection.objects.link(roof_obj)
rock=bpy.data.materials.new('approximate-roof');rock.diffuse_color=(.22,.19,.18,1);rock.use_nodes=True;rock.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.22,.19,.18,1);mesh.materials.append(rock)

water=bpy.data.materials.new('approximate-water');water.diffuse_color=(.06,.14,.16,1)
for pool in data['pools']:
    vv=[(pool['x'],-pool['z'],pool['height'])];ff=[]
    for k in range(65):
        a=k/64*math.tau;r=.96+.035*math.sin(a*7)+.025*math.cos(a*11);vv.append((pool['x']+math.cos(a)*pool['rx']*r,-pool['z']-math.sin(a)*pool['rz']*r,pool['height']))
        if k:ff.append((0,k+1,k))
    mesh=bpy.data.meshes.new('water');mesh.from_pydata(vv,[],ff);mesh.materials.append(water);obj=bpy.data.objects.new('water',mesh);scene.collection.objects.link(obj)

light=bpy.data.lights.new('review-sun','SUN');light.energy=2;light.use_shadow=False;obj=bpy.data.objects.new('review-sun',light);scene.collection.objects.link(obj);obj.rotation_euler=(.45,-.4,-.5)
fill=bpy.data.lights.new('review-diffuse-fill','SUN');fill.energy=1.4;fill.use_shadow=False;obj=bpy.data.objects.new('review-diffuse-fill',fill);scene.collection.objects.link(obj);obj.rotation_euler=(2.69,.4,2.64)
camdata=bpy.data.cameras.new('review');cam=bpy.data.objects.new('review',camdata);scene.collection.objects.link(cam);scene.camera=cam
def render(name,position,target,ortho=None,hide_roof=False):
    roof_obj.hide_render=hide_roof;cam.location=position;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();camdata.type='ORTHO' if ortho else 'PERSP';camdata.ortho_scale=ortho or 35;camdata.lens=25
    scene.render.filepath=str(out/name);bpy.ops.render.render(write_still=True)
render('01-low-passage.png',(-35,-12,3.5),(-35,1,3.6))
render('02-laboratory.png',(-29,12,6.4),(-37,19,5.5))
render('03-central-rocks.png',(10,-22,8),(-2,-14,7))
render('04-overhead-roof-hidden.png',(0,0,120),(0,0,0),150,True)
render('05-laboratory-west.png',(-34,18,5.2),(-44,18,5.8))
render('06-laboratory-south.png',(-33,13,5.5),(-39,23,5.8))
print('RESULT '+json.dumps({'placements':len(data['placements']),'renderCount':6,'roofHiddenOnlyInOverhead':True,'lighting':'Blender approximation; not Babylon GPU','omissions':['runtime fog','dynamic painted shader','waterfalls']}),flush=True)
