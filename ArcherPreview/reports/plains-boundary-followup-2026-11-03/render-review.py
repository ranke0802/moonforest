"""Headless source/destination review. Not the native renderer or a GPU benchmark.
blender -b --factory-startup --python-exit-code 1 -P render-review.py -- scene.json outdir [--neutral] [--case=id]
"""
import sys,json,math
from pathlib import Path
import bpy
from mathutils import Matrix,Vector
from bpy_extras.object_utils import world_to_camera_view

def main():
    print('Blender',bpy.app.version_string,flush=True)
    args=sys.argv[sys.argv.index('--')+1:];data=json.loads(Path(args[0]).read_text());out=Path(args[1]);out.mkdir(parents=True,exist_ok=True)
    neutral='--neutral' in args;selected=next((x[7:] for x in args if x.startswith('--case=')),None)
    for obj in list(bpy.data.objects):bpy.data.objects.remove(obj,do_unlink=True)
    scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE_NEXT' if bpy.app.version<(5,0,0) else 'BLENDER_EEVEE'
    scene.render.image_settings.file_format='PNG';scene.render.resolution_percentage=100;scene.view_settings.view_transform='Standard';scene.world.color=(.45,.45,.45)
    if hasattr(scene,'eevee') and hasattr(scene.eevee,'taa_render_samples'):scene.eevee.taa_render_samples=32
    C=Matrix(((1,0,0,0),(0,0,-1,0),(0,1,0,0),(0,0,0,1)));Ci=C.inverted();templates={};clay=None
    if neutral:
        clay=bpy.data.materials.new('qa-neutral-clay');clay.diffuse_color=(.5,.5,.5,1)
        clay.use_nodes=True;clay.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=1
    for key,folder in data['folders'].items():
        if folder in templates:continue
        before=set(bpy.data.objects);assert bpy.ops.import_scene.gltf.poll();bpy.ops.import_scene.gltf(filepath=str(Path(folder)/'review.gltf'));bpy.context.view_layer.update();created=set(bpy.data.objects)-before;meshes=[]
        for obj in created:
            if obj.type=='MESH':
                mesh=obj.data.copy();mesh.transform(obj.matrix_world);meshes.append(mesh)
                if neutral:mesh.materials.clear();mesh.materials.append(clay)
        templates[folder]=meshes
        for obj in created:bpy.data.objects.remove(obj,do_unlink=True)
    light=bpy.data.lights.new('qa-sun','SUN');light.energy=2;light.use_shadow=False;sun=bpy.data.objects.new('qa-sun',light);scene.collection.objects.link(sun);sun.rotation_euler=(.4,-.5,-.6)
    camdata=bpy.data.cameras.new('qa-camera');cam=bpy.data.objects.new('qa-camera',camdata);scene.collection.objects.link(cam);scene.camera=cam
    camdata.type='PERSP';camdata.sensor_fit='VERTICAL';camdata.sensor_height=24
    def ground(mapid):
        t=data['terrains'][mapid];n=t['n'];size=t['size'];vertices=[];faces=[]
        # Native row0 is world z=+half => Blender y=-half. Preserve its a-d
        # triangle diagonal and world UV orientation; do not mirror the heightfield.
        if 'positions' in t:
            raw=t['positions'];vertices=[(raw[i],-raw[i+2],raw[i+1]) for i in range(0,len(raw),3)];raw=t['indices'];faces=[tuple(raw[i:i+3]) for i in range(0,len(raw),3)]
        else:
            for row in range(n+1):
                for col in range(n+1):vertices.append((col*size/n-size/2,row*size/n-size/2,t['heights'][row*(n+1)+col]))
            for row in range(n):
                for col in range(n):a=row*(n+1)+col;faces.extend([(a,a+1,a+n+2),(a,a+n+2,a+n+1)])
        mesh=bpy.data.meshes.new('qa-ground-'+mapid);mesh.from_pydata(vertices,[],faces);mesh.validate();mesh.update();uv=mesh.uv_layers.new();span=data['grounds'][mapid]['span']
        for poly in mesh.polygons:
            for loop in poly.loop_indices:
                index=mesh.loops[loop].vertex_index;co=mesh.vertices[index].co;uv.data[loop].uv=(t['uvs'][index*2],t['uvs'][index*2+1]) if 'uvs' in t else (.5+co.x/span,.5-co.y/span)
        if 'normals' in t:
            raw=t['normals'];normals=[(raw[i],-raw[i+2],raw[i+1]) for i in range(0,len(raw),3)]
            for poly in mesh.polygons:poly.use_smooth=True
            mesh.normals_split_custom_set_from_vertices(normals)
        material=clay
        if not neutral:
            material=bpy.data.materials.new('qa-ground-'+mapid);material.use_nodes=True;bsdf=material.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Roughness'].default_value=1;tex=material.node_tree.nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(data['grounds'][mapid]['path'],check_existing=True);material.node_tree.links.new(tex.outputs['Color'],bsdf.inputs['Base Color'])
        mesh.materials.append(material);obj=bpy.data.objects.new('qa-ground-'+mapid,mesh);scene.collection.objects.link(obj);return obj
    results=[]
    for entry in data['cases']:
        if selected and selected!=entry['id']:continue
        for state in ['before','after']:
            shot=entry[state];mapid=shot['map'];objects=[ground(mapid)]
            for p in data['placements'][mapid]:
                m=p['matrix'];native=Matrix(tuple(tuple(m[col*4+row] for col in range(4)) for row in range(4)));matrix=C@native@Ci
                for mesh in templates[data['folders'][p['key']]]:
                    obj=bpy.data.objects.new(p['id'],mesh);scene.collection.objects.link(obj);obj.matrix_world=matrix;objects.append(obj)
            camera=shot['camera'];cam.location=(C@Vector((*camera['position'],1))).to_3d();target=C@Vector((*camera['target'],1));cam.rotation_euler=(target.to_3d()-cam.location).to_track_quat('-Z','Y').to_euler();camdata.lens=camdata.sensor_height/(2*math.tan(camera['fov']/2));camdata.clip_start=camera['minZ'];camdata.clip_end=camera['maxZ'];scene.render.resolution_x=shot['viewport']['width'];scene.render.resolution_y=shot['viewport']['height'];bpy.context.view_layer.update()
            errors=[]
            for probe in shot['projectionProbes']:
                q=world_to_camera_view(scene,cam,(C@Vector((*probe['position'],1))).to_3d());expected=probe['screen'];actual=(q.x*scene.render.resolution_x,(1-q.y)*scene.render.resolution_y)
                if 0<expected[2]<1:errors.append(math.hypot(actual[0]-expected[0],actual[1]-expected[1]))
            error=max(errors,default=0);assert error<.1,('Native camera/Blender projection mismatch',entry['id'],state,error)
            name=data['stage']+'-'+data.get('profile','low-orbit')+'-'+entry['id']+'-'+state+('-neutral' if neutral else '-texture')+'.png';scene.render.filepath=str(out/name);bpy.ops.render.render(write_still=True)
            results.append({'file':name,'map':mapid,'placements':len(data['placements'][mapid]),'cameraProjectionMaxPixelError':error})
            for obj in objects:
                mesh=obj.data;bpy.data.objects.remove(obj,do_unlink=True)
                if mesh.name.startswith('qa-ground-') and mesh.users==0:bpy.data.meshes.remove(mesh)
    summary={'blender':bpy.app.version_string,'stage':data['stage'],'profile':data.get('profile','low-orbit'),'lod':data['lod'],'neutral':neutral,'renders':results,'nativeGameScreenshot':False,'gpuPerformanceMeasured':False,'limitations':data['limitations']}
    (out/(data['stage']+'-'+data.get('profile','low-orbit')+('-neutral' if neutral else '-texture')+'-render-validation.json')).write_text(json.dumps(summary,indent=2))
    print('RESULT '+json.dumps(summary),flush=True)
if __name__=='__main__':main()
