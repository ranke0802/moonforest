import bpy, bmesh, json
from pathlib import Path
ROOT=Path('C:/dev/warrior');report=[]
for key,budget in [('verdant-tree',45000),('oak-tree',24000),('grass-tuft',2400),('grass-cluster',6000),('scarecrow',18000)]:
    # Oak's connected trunk must not undergo whole-mesh decimation.
    # Rebuild it with repair-oak-tree.py, which reduces detached foliage only.
    if key=='oak-tree':continue
    bpy.ops.wm.open_mainfile(filepath=str(ROOT/'blender/environment'/f'{key}.blend'))
    bpy.context.preferences.filepaths.save_version=0
    objects=[o for o in bpy.context.scene.objects if o.type=='MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:
        o.select_set(True);bpy.context.view_layer.objects.active=o
        if 'tree' in key:
            bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001);bm.to_mesh(o.data);bm.free()
            tris=sum(len(p.vertices)-2 for p in o.data.polygons)
            if tris>budget:
                mod=o.modifiers.new('Welded web budget','DECIMATE');mod.ratio=budget/tris;bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'blender/environment'/f'{key}.blend'))
    def export(name):
        path=ROOT/'assets/environment/models'/f'{name}.glb'
        bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_animations=False,export_image_format='JPEG',export_jpeg_quality=90)
        entry={'key':name,'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in objects),'bytes':path.stat().st_size}
        report.append(entry);print('OPTIMIZED',json.dumps(entry),flush=True)
    export(key)
    if 'tree' in key:
        for o in objects:
            bpy.context.view_layer.objects.active=o
            tris=sum(len(p.vertices)-2 for p in o.data.polygons)
            if tris>8000:
                mod=o.modifiers.new('Distant silhouette','DECIMATE');mod.ratio=8000/tris;bpy.ops.object.modifier_apply(modifier=mod.name)
        export(key+'-far')
(ROOT/'reports/environment-optimized.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
