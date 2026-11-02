"""Offline candidate review using actual game-deformed meshes; originals read only."""
import bpy,json,math
from pathlib import Path
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'reports/saint-50k-2026-11-02'
REVIEW=Path('C:/Users/ryank/Documents/ChatGPT/MM Project/output/saint-50k-review/2026-11-02');REVIEW.mkdir(parents=True,exist_ok=True)
r=json.loads((OUT/'motion-validation.json').read_text(encoding='utf-8'));binary=(OUT/r['binary']).read_bytes()
def array(v,n):return np.frombuffer(binary,dtype='<u4' if v['type']=='uint32' else '<f4',count=v['count'],offset=v['byteOffset']).reshape(-1,n)
bpy.ops.wm.read_factory_settings(use_empty=True);scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE_NEXT';scene.render.resolution_x=1000;scene.render.resolution_y=1000;scene.render.resolution_percentage=100;scene.render.film_transparent=True;scene.render.image_settings.file_format='PNG'
scene.render.threads_mode='FIXED';scene.render.threads=4;scene.view_settings.view_transform='Standard';scene.view_settings.look='None'
scene.world=bpy.data.worlds.new('ReviewWorld');scene.world.color=(.12,.12,.12)
mat=bpy.data.materials.new('PreservedSourcePaint');mat.use_nodes=True;nt=mat.node_tree;nt.nodes.clear();tex=nt.nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(ROOT/'reports/elena-boss/elena-color.png'));tex.interpolation='Linear';em=nt.nodes.new('ShaderNodeEmission');em.inputs['Strength'].default_value=1;output=nt.nodes.new('ShaderNodeOutputMaterial');nt.links.new(tex.outputs['Color'],em.inputs['Color']);nt.links.new(em.outputs['Emission'],output.inputs['Surface'])
objects={}
for model in r['models']:
    t=model['meshes'][0];pose=model['poses'][0]['meshes'][0];p=array(pose['positions'],3);ids=array(t['indices'],3);uv=array(t['uv'],2)
    me=bpy.data.meshes.new(model['label']);me.from_pydata(p.tolist(),[],ids.tolist());me.update();obj=bpy.data.objects.new(model['label'],me);scene.collection.objects.link(obj);me.materials.append(mat);obj.hide_render=True
    layer=me.uv_layers.new(name='PreservedUV');li=np.empty(len(me.loops),dtype=np.int32);me.loops.foreach_get('vertex_index',li);ul=uv[li].copy();ul[:,1]=1-ul[:,1];layer.data.foreach_set('uv',ul.ravel())
    for face in me.polygons:face.use_smooth=True
    objects[model['label']]=obj
camdata=bpy.data.cameras.new('SameCamera');cam=bpy.data.objects.new('SameCamera',camdata);scene.collection.objects.link(cam);scene.camera=cam;camdata.type='ORTHO';camdata.clip_start=.02;camdata.clip_end=100
shots=[('front','Elena_Idle-55',-math.pi/2,.95,2.12),('quarter','Elena_Idle-55',-math.pi/2+.52,.95,2.12),('side','Elena_Idle-55',0,.95,2.12),('back','Elena_Idle-55',math.pi/2,.95,2.12),('face','Elena_Idle-55',-math.pi/2,1.48,.55),('walk','Walking-55',-math.pi/2+.3,.95,2.12),('cast2','mage_soell_cast_2-55',-math.pi/2+.3,.95,2.12),('cast4','mage_soell_cast_4-55',-math.pi/2+.3,.95,2.12),('cast6','mage_soell_cast_6-55',-math.pi/2+.3,.95,2.12),('death','Knock_Down-85',-math.pi/2+.3,.6,2.3)]
renders=[]
for name,pose_name,angle,z,scale in shots:
    source_pose=next(p for p in r['models'][0]['poses'] if p['name']==pose_name)
    positions=array(source_pose['meshes'][0]['positions'],3);center=(positions.min(axis=0)+positions.max(axis=0))*.5
    target=Vector((float(center[0]),float(center[1]),z));camdata.ortho_scale=scale;cam.location=target+Vector((6*math.cos(angle),6*math.sin(angle),.15));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
    for model in r['models']:
        for obj in objects.values():obj.hide_render=True
        obj=objects[model['label']];obj.hide_render=False;p=next(p for p in model['poses'] if p['name']==pose_name)['meshes'][0]
        obj.data.vertices.foreach_set('co',array(p['positions'],3).ravel());obj.data.update();obj.data.normals_split_custom_set_from_vertices(array(p['normals'],3).tolist());bpy.context.view_layer.update()
        path=REVIEW/(name+'-'+model['label']+'.png');scene.render.filepath=str(path);bpy.ops.render.render(write_still=True);renders.append({'shot':name,'model':model['label'],'file':str(path)})
    print('REVIEW_SHOT '+name,flush=True)
original,candidate=r['models'];oi=array(original['meshes'][0]['indices'],3);ci=array(candidate['meshes'][0]['indices'],3);stats=[]
for op,cp in zip(original['poses'],candidate['poses']):
    ov=array(op['meshes'][0]['positions'],3);cv=array(cp['meshes'][0]['positions'],3);ob=BVHTree.FromPolygons(ov.tolist(),oi.tolist(),all_triangles=True);cb=BVHTree.FromPolygons(cv.tolist(),ci.tolist(),all_triangles=True)
    samples=[]
    for points,bvh in [(ov[::12],cb),(cv[ci[::6]].mean(axis=1),ob)]:
        for point in points:samples.append(bvh.find_nearest(Vector(point))[3])
    a=np.array(samples);stats.append({'pose':op['name'],'p95Meters':float(np.percentile(a,95)),'p99Meters':float(np.percentile(a,99)),'maxMeters':float(a.max()),'samples':len(a)})
(REVIEW/'render-review.json').write_text(json.dumps({'blender':bpy.app.version_string,'renders':renders,'surface':stats,'productionChanged':False,'scope':'Original source paint, exact game animation and same camera. Not live WebGL toon/outline or mobile GPU verification.'},indent=2),encoding='utf-8');bpy.ops.wm.save_as_mainfile(filepath=str(REVIEW/'comparison.blend'))
print('REVIEW_COMPLETE '+json.dumps({'renders':len(renders),'surfaceP99Max':max(s['p99Meters'] for s in stats),'surfaceMax':max(s['maxMeters'] for s in stats)}),flush=True)
