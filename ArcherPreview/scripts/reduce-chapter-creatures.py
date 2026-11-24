"""Blender headless pass for supplied chapter enemies. Keep the source untouched."""
import json
from pathlib import Path
import sys

import bpy

args = sys.argv[sys.argv.index('--') + 1:]
source, output = map(Path, args[:2])
only = set(args[2:])
budgets = {'goblin-warrior':7600, 'goblin-archer':7200, 'goblin-shaman':8000,
           'hobgoblin-boss':10200, 'zombie':6800, 'ghoul-warrior':8800}
output.mkdir(parents=True, exist_ok=True)
for name, budget in budgets.items():
    if only and name not in only:
        continue
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source / (name + '.glb')))
    mesh, = (o for o in bpy.context.scene.objects if o.type == 'MESH')
    count = len(mesh.data.polygons)
    dec = mesh.modifiers.new('Reduce under mobile near budget', 'DECIMATE')
    dec.ratio = min(1, budget / count)
    dec.use_collapse_triangulate = True
    bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.modifier_apply(modifier=dec.name)
    bpy.ops.export_scene.gltf(filepath=str(output / (name+'.glb')), export_format='GLB',
                              export_animations=False, export_yup=True, export_image_format='AUTO')
    print(json.dumps({'species':name,'originalTriangles':count,'runtimeTriangles':len(mesh.data.polygons)}), flush=True)
