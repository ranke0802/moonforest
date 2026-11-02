"""Offline same-camera comparison of actual runtime-deformed meshes; no browser."""
import bpy,json,math,sys
from pathlib import Path
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'reports/mourning-50k-2026-11-02'
REVIEW=Path('C:/Users/ryank/Documents/ChatGPT/MM Project/output/mourning-50k-review/2026-11-02')
REVIEW.mkdir(parents=True,exist_ok=True)
report=json.loads((OUT/'motion-validation.json').read_text(encoding='utf-8'))
data=(OUT/report['binary']).read_bytes()
def array(v,columns):
    return np.frombuffer(data,dtype='<u4' if v['type']=='uint32' else '<f4',count=v['count'],offset=v['byteOffset']).reshape(-1,columns)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene
scene.render.engine='BLENDER_EEVEE_NEXT' if bpy.app.version<(5,0,0) else 'BLENDER_EEVEE'
scene.render.resolution_x=1000;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.film_transparent=True
scene.render.threads_mode='FIXED';scene.render.threads=4
scene.view_settings.view_transform='Standard';scene.view_settings.look='None';scene.view_settings.exposure=0;scene.view_settings.gamma=1
scene.world=bpy.data.worlds.new('ReviewWorld');scene.world.color=(.12,.12,.12)
mat=bpy.data.materials.new('SamePaintForBoth');mat.use_nodes=True;nt=mat.node_tree;nt.nodes.clear()
tex=nt.nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(OUT/'source-texture.jpg'));tex.interpolation='Linear'
em=nt.nodes.new('ShaderNodeEmission');em.inputs['Strength'].default_value=1
output=nt.nodes.new('ShaderNodeOutputMaterial');nt.links.new(tex.outputs['Color'],em.inputs['Color']);nt.links.new(em.outputs['Emission'],output.inputs['Surface'])
mouth=bpy.data.materials.new('MouthInterior');mouth.use_nodes=True;bs=mouth.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(.018,.006,.01,1);bs.inputs['Roughness'].default_value=1
models={}
for model in report['models']:
    objects={};pose=model['poses'][0]
    for m,t in zip(pose['meshes'],model['meshes']):
        p=array(m['positions'],3);idx=array(t['indices'],3);uv=array(t['uv'],2)
        me=bpy.data.meshes.new(model['label']+'_'+m['name']);me.from_pydata(p.tolist(),[],idx.tolist());me.update()
        obj=bpy.data.objects.new(me.name,me);scene.collection.objects.link(obj);obj.hide_render=True
        me.materials.append(mouth if 'Mouth' in m['name'] else mat)
        layer=me.uv_layers.new(name='PreservedUV');li=np.empty(len(me.loops),dtype=np.int32);me.loops.foreach_get('vertex_index',li);ul=uv[li].copy();ul[:,1]=1-ul[:,1];layer.data.foreach_set('uv',ul.ravel())
        for face in me.polygons:face.use_smooth=True
        me.normals_split_custom_set_from_vertices(array(m['normals'],3).tolist());objects[m['name']]=obj
    models[model['label']]=objects
camdata=bpy.data.cameras.new('ComparisonCamera');cam=bpy.data.objects.new('ComparisonCamera',camdata);scene.collection.objects.link(cam);scene.camera=cam
camdata.type='ORTHO';camdata.clip_start=.05;camdata.clip_end=100
shots=[('idle-front','idle',-math.pi/2,(0,-.2,2.65),7.1,.10),('idle-quarter','idle',-math.pi/2+.52,(0,-.2,2.65),7.5,.15),('idle-side','idle',0,(0,-.2,2.65),7.5,.10),('idle-back','idle',math.pi/2,(0,-.2,2.65),7.5,.10),('cast','cast-72',-math.pi/2+.32,(0,-.2,2.65),7.6,.15),('slam','cast_slam-108',-math.pi/2+.32,(0,-.2,2.1),7.8,.35),('alternate','cast_alternate-108',-math.pi/2+.32,(0,-.2,2.65),7.6,.15),('death','death-312',-math.pi/2+.32,(0,-.2,1.5),7.8,.45)]
if '--detail' in sys.argv:
    shots=[('face-detail','idle',-math.pi/2,(.45,-1,3.95),1.8,.10)]
renders=[]
for name,pose_name,angle,focus,scale,elevation in shots:
    target=Vector(focus);camdata.ortho_scale=scale;cam.location=target+Vector((12*math.cos(angle),12*math.sin(angle),12*elevation));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
    for model in report['models']:
        for objects in models.values():
            for obj in objects.values():obj.hide_render=True
        pose=next(p for p in model['poses'] if p['name']==pose_name)
        for m in pose['meshes']:
            obj=models[model['label']][m['name']];obj.hide_render=not m['enabled'];me=obj.data
            me.vertices.foreach_set('co',array(m['positions'],3).ravel());me.update();me.normals_split_custom_set_from_vertices(array(m['normals'],3).tolist())
        bpy.context.view_layer.update();path=REVIEW/(name+'-'+model['label']+'.png');scene.render.filepath=str(path);bpy.ops.render.render(write_still=True)
        renders.append({'shot':name,'model':model['label'],'file':str(path)})
    print('REVIEW_SHOT '+name,flush=True)
if '--detail' in sys.argv:
    print('DETAIL_COMPLETE',flush=True)
    raise SystemExit(0)
# Assess surface interpolation as well as exact retained vertices. Deterministic
# bidirectional samples on every posed body; no claim of an exact Hausdorff bound.
original,candidate=report['models'];stats=[]
ot=next(t for t in original['meshes'] if t['name']=='Elina_Chimera_Skin');ct=next(t for t in candidate['meshes'] if t['name']=='Elina_Chimera_Skin')
oi=array(ot['indices'],3);ci=array(ct['indices'],3)
for op,cp in zip(original['poses'],candidate['poses']):
    ov=array(next(m for m in op['meshes'] if m['name']=='Elina_Chimera_Skin')['positions'],3);cv=array(next(m for m in cp['meshes'] if m['name']=='Elina_Chimera_Skin')['positions'],3)
    ob=BVHTree.FromPolygons(ov.tolist(),oi.tolist(),all_triangles=True);cb=BVHTree.FromPolygons(cv.tolist(),ci.tolist(),all_triangles=True)
    samples=[]
    for points,bvh in [(ov[::5],cb),(cv[ci[::3]].mean(axis=1),ob)]:
        for point in points:
            hit=bvh.find_nearest(Vector(point));samples.append(hit[3])
    a=np.array(samples);stats.append({'pose':op['name'],'samples':len(a),'meanMeters':float(a.mean()),'p95Meters':float(np.percentile(a,95)),'p99Meters':float(np.percentile(a,99)),'maxMeters':float(a.max())})
review={'blender':bpy.app.version_string,'renders':renders,'surface':stats,'scope':'Identical current runtime CPU animation, same original paint and camera. No browser automation. Offline source-paint comparison, not live WebGL toon/outline validation.','texture':'The existing shipped KTX2 is retained byte-for-byte in candidate; offline images use original paint to isolate geometry/UV changes.','productionChanged':False}
(REVIEW/'render-review.json').write_text(json.dumps(review,indent=2),encoding='utf-8')
bpy.ops.wm.save_as_mainfile(filepath=str(REVIEW/'comparison.blend'))
print('REVIEW_COMPLETE '+json.dumps({'renders':len(renders),'surfaceMax':max(s['maxMeters'] for s in stats),'surfaceP99Max':max(s['p99Meters'] for s in stats)}),flush=True)
