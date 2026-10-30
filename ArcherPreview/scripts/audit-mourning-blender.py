"""Read-only Blender inspection; saves evidence, never saves over the source blend."""
import bpy, json
from pathlib import Path
OUT=Path(__file__).resolve().parents[1]/'reports/elena-two-phase'
SOURCE=Path(r'C:/Users/ryank/Documents/ChatGPT/MM Project/output/elina-three-model-review/2026-10-30-v1/rigging/tripo-1-move/exports/tripo1_move_rig.blend')
def main():
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE),load_ui=False)
    data={'version':list(bpy.app.version),'fps':bpy.context.scene.render.fps,'frameRange':[bpy.context.scene.frame_start,bpy.context.scene.frame_end],
      'objects':[{'name':o.name,'type':o.type,'hideRender':o.hide_render,'dimensions':list(o.dimensions),'action':o.animation_data.action.name if o.animation_data and o.animation_data.action else None,'tracks':[{'name':t.name,'mute':t.mute,'strips':[{'name':s.name,'action':s.action.name,'range':[s.frame_start,s.frame_end]}for s in t.strips]}for t in o.animation_data.nla_tracks]if o.animation_data else [],'shapeKeys':list(o.data.shape_keys.key_blocks.keys())if o.type=='MESH'and o.data.shape_keys else None}for o in bpy.data.objects],
      'actions':[{'name':a.name,'frameRange':list(a.frame_range),'slots':[{'identifier':s.identifier,'targetType':s.target_id_type}for s in a.slots]}for a in bpy.data.actions]}
    (OUT/'asset-blender-structure.json').write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
    print('RESULT '+json.dumps(data))
main()
