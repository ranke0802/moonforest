"""Render actual Babylon-deformed world vertices, without rerigging or animation reconstruction."""
import bpy, json, math
from pathlib import Path
import numpy as np
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'reports/elena-two-phase'
def main():
    report=json.loads((OUT/'runtime-review-poses.json').read_text(encoding='utf-8'));data=(OUT/report['binary']).read_bytes()
    def array(v,cols):return np.frombuffer(data,dtype='<u4'if v['type']=='uint32'else'<f4',count=v['count'],offset=v['byteOffset']).reshape(-1,cols)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE_NEXT';scene.render.resolution_x=640;scene.render.resolution_y=640;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False;scene.render.threads_mode='FIXED';scene.render.threads=4
    scene.view_settings.view_transform='Standard';scene.view_settings.look='None';scene.view_settings.exposure=0;scene.view_settings.gamma=1
    scene.world=bpy.data.worlds.new('RuntimeReviewWorld');scene.world.color=(.025,.035,.05)
    # Source paint rendered through diffuse-free emission; no metallic/roughness reflection.
    mat=bpy.data.materials.new('RuntimeReview_SourcePaint_135');mat.use_nodes=True;nt=mat.node_tree;nt.nodes.clear()
    texture=nt.nodes.new('ShaderNodeTexImage');texture.image=bpy.data.images.load(str(OUT/'asset-source-texture-0.png'));texture.interpolation='Linear'
    emit=nt.nodes.new('ShaderNodeEmission');emit.inputs['Strength'].default_value=1.35
    output=nt.nodes.new('ShaderNodeOutputMaterial');nt.links.new(texture.outputs['Color'],emit.inputs['Color']);nt.links.new(emit.outputs['Emission'],output.inputs['Surface'])
    meshes={};topology={m['name']:m for m in report['meshes']}
    first=report['poses'][0]
    for m in first['meshes']:
        t=topology[m['name']];p=array(m['positions'],3);indices=array(t['indices'],3);uv=array(t['uv'],2)
        me=bpy.data.meshes.new(m['name']);me.from_pydata(p.tolist(),[],indices.tolist());me.update();obj=bpy.data.objects.new(m['name'],me);scene.collection.objects.link(obj);obj.data.materials.append(mat)
        layer=me.uv_layers.new(name='SourceUV');li=np.empty(len(me.loops),dtype=np.int32);me.loops.foreach_get('vertex_index',li);uvloop=uv[li].copy();uvloop[:,1]=1-uvloop[:,1];layer.data.foreach_set('uv',uvloop.flatten())
        for poly in me.polygons:poly.use_smooth=True
        me.normals_split_custom_set_from_vertices(array(m['normals'],3).tolist());meshes[m['name']]=obj
    ground_mat=bpy.data.materials.new('RuntimeReviewGround');ground_mat.diffuse_color=(.07,.085,.10,1)
    bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.015));ground=bpy.context.object;ground.name='RuntimeReviewGround';ground.data.materials.append(ground_mat)
    lightdata=bpy.data.lights.new('RuntimeReviewGroundLight','AREA');lightdata.energy=500;lightdata.shape='DISK';lightdata.size=8;light=bpy.data.objects.new(lightdata.name,lightdata);scene.collection.objects.link(light);light.location=(-4,-6,9);light.rotation_euler=(-light.location).to_track_quat('-Z','Y').to_euler()
    camdata=bpy.data.cameras.new('RuntimeReviewGameCamera');cam=bpy.data.objects.new(camdata.name,camdata);scene.collection.objects.link(cam);scene.camera=cam;camdata.type='PERSP';camdata.angle=.65;camdata.clip_start=.05;camdata.clip_end=100
    target=Vector((0,0,1.8));radius=8.5;beta=1.25
    def camera(view):
        angle={'front':-math.pi/2,'side':0,'back':math.pi/2,'quarter':-math.pi/2+.5}[view]
        cam.location=target+Vector((radius*math.sin(beta)*math.cos(angle),radius*math.sin(beta)*math.sin(angle),radius*math.cos(beta)))
        cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
    renders=[]
    for pose in report['poses']:
        for m in pose['meshes']:
            me=meshes[m['name']].data;me.vertices.foreach_set('co',array(m['positions'],3).flatten());me.update();me.normals_split_custom_set_from_vertices(array(m['normals'],3).tolist())
        bpy.context.view_layer.update()
        views=['front','side','back']if pose['label']=='walk-0p5'else['quarter']
        for view in views:
            camera(view);path=OUT/f"runtime-review-{pose['label']}-{view}.png";scene.render.filepath=str(path);bpy.ops.render.render(write_still=True)
            renders.append({'pose':pose['label'],'view':view,'file':path.name,'cameraPositionBlender':list(cam.location),'targetBlender':list(target)})
    output={'status':'RENDERED','blender':bpy.app.version_string,'samplerSha256':report['samplerSha256'],'posesFrom':'runtime-review-poses.json','renders':renders,'camera':{'type':'perspective','fovRadians':.65,'radius':radius,'beta':beta,'targetHeight':1.8,'resolution':[640,640]},'renderMaterial':{'sourceTexture':'asset-source-texture-0.png','emissionStrength':1.35,'pbr':False,'uvConversion':'Babylon/glTF top-left v -> Blender bottom-left 1-v','normals':'CPU-deformed Babylon normals transformed to world, then x,-z,y'},'limitations':['Offline Blender rasterization of actual Babylon CPU-deformed mesh positions.','Does not validate Babylon GPU skin/morph shader execution or runtime outline/internal-line/tone-mapping pixels.','Original painted texture is used to isolate pose quality; ETC1S error is documented in asset-texture-comparison.json.'],'sourcePreserved':True,'triangles':sum(m['triangles']for m in report['meshes'])}
    (OUT/'runtime-review-render-report.json').write_text(json.dumps(output,indent=2)+'\n',encoding='utf-8');print('RESULT '+json.dumps({'renders':len(renders),'triangles':output['triangles'],'samplerSha256':report['samplerSha256']}))
main()
