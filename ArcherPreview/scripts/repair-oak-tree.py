"""Restore the supplied oak's connected trunk; simplify detached foliage only."""
import bpy, bmesh, json
from pathlib import Path
from mathutils import Vector

P = Path('C:/dev/warrior')
bpy.ops.wm.open_mainfile(filepath=str(P/'blender/environment/oak-tree-source.blend'))
bpy.context.preferences.filepaths.save_version = 0
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
points = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
low = Vector([min(p[i] for p in points) for i in range(3)])
high = Vector([max(p[i] for p in points) for i in range(3)])
center = Vector(((low.x+high.x)/2, (low.y+high.y)/2, low.z)); scale = 6.2/(high.z-low.z)
for obj in meshes:
    matrix = obj.matrix_world.copy(); obj.parent = None; obj.matrix_world.identity()
    for vertex in obj.data.vertices: vertex.co = (matrix @ vertex.co-center)*scale
report = []
for obj in [o for o in bpy.context.scene.objects if o.type == 'MESH']:
    bm = bmesh.new(); bm.from_mesh(obj.data); bm.verts.ensure_lookup_table()
    unseen = set(bm.verts); components = []
    while unseen:
        seed = unseen.pop(); stack = [seed]; group = [seed]
        while stack:
            vertex = stack.pop()
            for edge in vertex.link_edges:
                neighbor = edge.other_vert(vertex)
                if neighbor in unseen:
                    unseen.remove(neighbor); stack.append(neighbor); group.append(neighbor)
        components.append(group)
    trunk = max(components, key=len)
    trunk_indices = {v.index for v in trunk}
    before = len(obj.data.polygons)
    bm.free()
    # Separate along original disconnected components: no cuts, UV edits or welds.
    foliage = obj.copy(); foliage.data = obj.data.copy(); bpy.context.collection.objects.link(foliage)
    for piece, keep_trunk in [(obj, True), (foliage, False)]:
        part = bmesh.new(); part.from_mesh(piece.data); part.verts.ensure_lookup_table()
        remove = [v for v in part.verts if (v.index in trunk_indices) != keep_trunk]
        bmesh.ops.delete(part, geom=remove, context='VERTS'); part.to_mesh(piece.data); part.free()
    foliage.name = 'Oak_Foliage'; obj.name = 'Oak_Trunk_Branches'
    bpy.context.view_layer.objects.active = foliage
    modifier = foliage.modifiers.new('Detached foliage reduction', 'DECIMATE'); modifier.ratio = .22
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    assert len(obj.data.polygons) > 10000, 'Connected trunk must be preserved'
    report.append({'sourceFaces':before,'preservedTrunkFaces':len(obj.data.polygons),'foliageFaces':len(foliage.data.polygons)})

image = bpy.data.images.load(str(P/'assets/environment/textures/oak-tree-painted.png'), check_existing=False)
image.colorspace_settings.name = 'sRGB'; image.pack()
for mat in bpy.data.materials:
    if not mat.use_nodes: continue
    shader = next((n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if not shader: continue
    for link in shader.inputs['Base Color'].links:
        if link.from_node.type == 'TEX_IMAGE': link.from_node.image = image
    for name, value in [('Metallic',0),('Roughness',.92),('Specular IOR Level',.15),('Emission Strength',0)]:
        socket = shader.inputs.get(name)
        if socket:
            for link in list(socket.links): mat.node_tree.links.remove(link)
            socket.default_value = value
    for link in list(shader.inputs['Normal'].links): mat.node_tree.links.remove(link)

bpy.ops.object.select_all(action='DESELECT')
for obj in bpy.context.scene.objects:
    if obj.type == 'MESH': obj.select_set(True)
bpy.ops.wm.save_as_mainfile(filepath=str(P/'blender/environment/oak-tree.blend'))
bpy.ops.export_scene.gltf(filepath=str(P/'assets/environment/models/oak-tree.glb'), export_format='GLB', use_selection=True, export_animations=False, export_image_format='JPEG', export_jpeg_quality=90)
(P/'reports/oak-repair.json').write_text(json.dumps(report,indent=2),encoding='utf-8')

scene=bpy.context.scene; scene.render.engine='CYCLES'; scene.cycles.samples=16; scene.cycles.use_denoising=True
scene.world=bpy.data.worlds.new('Preview sky');scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.32,.38,.45,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.7
for loc,power in [((8,-8,10),3000),((-7,2,7),1500)]:
    data=bpy.data.lights.new('Preview light','AREA');data.energy=power;data.size=7
    obj=bpy.data.objects.new('Preview light',data);scene.collection.objects.link(obj);obj.location=loc
    obj.rotation_euler=(Vector((0,0,3))-obj.location).to_track_quat('-Z','Y').to_euler()
data=bpy.data.cameras.new('Preview camera');cam=bpy.data.objects.new('Preview camera',data)
scene.collection.objects.link(cam);scene.camera=cam;data.type='ORTHO';data.ortho_scale=7.4
scene.render.resolution_x=800;scene.render.resolution_y=800;scene.render.resolution_percentage=100
for name,loc in [('front',(7,-10,6)),('side',(-10,-3,5))]:
    cam.location=loc;cam.rotation_euler=(Vector((0,0,3))-cam.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=str(P/f'reports/oak-repaired-{name}.png');bpy.ops.render.render(write_still=True)
print('REPAIRED',json.dumps(report),flush=True)
