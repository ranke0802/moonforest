"""Existing assets with an offline approximation of the cave slope shader.

The CPU heightfield and placements are exact. This is not Babylon GPU output;
fog, local camera cutaway, FoW and engine shadow differences remain unmodelled.
"""
from pathlib import Path
root=Path(__file__).resolve().parents[1]
source=(root/'scripts/render-cave-review.py').read_text(encoding='utf-8')
source=source.replace('resolution_x=1440','resolution_x=1080').replace('resolution_y=1000','resolution_y=750')
source='\n'.join(line for line in source.splitlines()if not line.startswith("render('cave-spillway"))
source=source.replace("'renders':6","'renders':4")
# The old distant boss camera now sits behind the new enclosing wall. Inspect
# the arena from its actual southern opening; this is still a geometry review.
source=source.replace("render('cave-boss-render.png',(29,5,15),(29,33,8))","render('cave-boss-render.png',(29,18,12),(29,32,8))")
head,tail=source.split("render('cave-layout-render.png'",1)
scope={'__file__':str(root/'scripts/render-cave-review.py')}
exec(compile(head,str(root/'scripts/render-cave-review.py'),'exec'),scope)
ground=scope['ground'];mat=ground.data.materials[0];nodes=mat.node_tree.nodes;links=mat.node_tree.links
for poly in ground.data.polygons:poly.use_smooth=True
def mathnode(operation,a,b=None):
 node=nodes.new('ShaderNodeMath');node.operation=operation
 for index,value in enumerate([a,b]):
  if value is None:continue
  if isinstance(value,(int,float)):node.inputs[index].default_value=value
  else:links.new(value,node.inputs[index])
 return node.outputs[0]
def srgb(value):return value/12.92 if value<=.04045 else ((value+.055)/1.055)**2.4
geometry=nodes.new('ShaderNodeNewGeometry');xyz=nodes.new('ShaderNodeSeparateXYZ');links.new(geometry.outputs['Position'],xyz.inputs[0])
normal=nodes.new('ShaderNodeSeparateXYZ');links.new(geometry.outputs['Normal'],normal.inputs[0])
def wave(terms):
 result=0
 for axis,scale in terms:result=mathnode('ADD',result,mathnode('MULTIPLY',xyz.outputs[axis],scale))
 return result
strata_a=mathnode('SINE',mathnode('ADD',wave([('X',1.1),('Z',1.8)]),mathnode('SINE',wave([('Y',-.7)]))))
strata_b=mathnode('SINE',mathnode('ADD',wave([('Y',-1.3),('Z',-.9)]),mathnode('SINE',wave([('X',.5)]))))
strata=mathnode('ADD',.5,mathnode('MULTIPLY',.5,mathnode('MULTIPLY',strata_a,strata_b)))
grain=mathnode('ADD',.5,mathnode('MULTIPLY',.5,mathnode('MULTIPLY',mathnode('SINE',wave([('X',8.7),('Z',11.3)])),mathnode('SINE',wave([('Y',-9.9),('Z',-6.1)])))))
tone=mathnode('ADD',.58,mathnode('ADD',mathnode('MULTIPLY',strata,.16),mathnode('MULTIPLY',grain,.04)))
palette=nodes.new('ShaderNodeMixRGB');links.new(tone,palette.inputs[0]);palette.inputs[1].default_value=tuple(map(srgb,(.32,.28,.30)))+(1,);palette.inputs[2].default_value=tuple(map(srgb,(.49,.435,.405)))+(1,)
facing=nodes.new('ShaderNodeVectorMath');facing.operation='DOT_PRODUCT';links.new(geometry.outputs['Normal'],facing.inputs[0]);facing.inputs[1].default_value=(-.35,.52,.78)
band=mathnode('ADD',.82,mathnode('MULTIPLY',.18,mathnode('MAXIMUM',0,facing.outputs['Value'])))
rock=nodes.new('ShaderNodeMixRGB');rock.blend_type='MULTIPLY';rock.inputs[0].default_value=1;links.new(palette.outputs[0],rock.inputs[1]);links.new(band,rock.inputs[2])
mask=nodes.new('ShaderNodeMapRange');mask.interpolation_type='SMOOTHSTEP';links.new(mathnode('ABSOLUTE',normal.outputs['Z']),mask.inputs['Value']);mask.inputs['From Min'].default_value=.42;mask.inputs['From Max'].default_value=.86;mask.inputs['To Min'].default_value=.92;mask.inputs['To Max'].default_value=0
dark=nodes.new('ShaderNodeMapRange');dark.interpolation_type='SMOOTHSTEP'
grey=nodes.new('ShaderNodeRGBToBW');links.new(scope['tex'].outputs['Color'],grey.inputs[0]);links.new(grey.outputs[0],dark.inputs['Value'])
dark.inputs['From Min'].default_value=srgb(.14);dark.inputs['From Max'].default_value=srgb(.26);dark.inputs['To Min'].default_value=.92;dark.inputs['To Max'].default_value=0
em=next(node for node in nodes if node.type=='EMISSION');original=em.inputs[0].links[0].from_socket
blend=nodes.new('ShaderNodeMixRGB');links.new(mathnode('MAXIMUM',mask.outputs[0],dark.outputs[0]),blend.inputs[0]);links.new(original,blend.inputs[1]);links.new(rock.outputs[0],blend.inputs[2]);links.new(blend.outputs[0],em.inputs[0])
exec(compile("render('cave-layout-render.png'"+tail,str(root/'scripts/render-cave-review.py'),'exec'),scope)
