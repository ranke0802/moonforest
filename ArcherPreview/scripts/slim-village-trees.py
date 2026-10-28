"""Reshape the existing reviewed trees without adding triangles or textures."""
import argparse,sys,json,math,importlib.util
from pathlib import Path
import bpy,numpy as np
from mathutils import Vector
spec=importlib.util.spec_from_file_location('tree_helpers',Path(__file__).with_name('refine-village-trees.py'))
helper=importlib.util.module_from_spec(spec);spec.loader.exec_module(helper)

def smooth(t):
    t=max(0,min(1,t));return t*t*(3-2*t)

def deform(p,pine):
    h=max(0,p.z)/15
    stops=[(0,.38 if pine else .24),(.09,.52 if pine else .32),(.22,.70 if pine else .51),(.36,.86 if pine else .66),(.58,1.)]
    scale=1.
    for (a,sa),(b,sb) in zip(stops,stops[1:]):
        if h<=b:scale=sa+(sb-sa)*smooth((h-a)/(b-a));break
    # One continuous deformation field for wood and attached foliage, shared by
    # every LOD. No detached branch junctions or new alpha-card draw passes.
    return Vector((p.x*scale,p.y*scale,max(0,p.z)*(1-.48*(1-smooth(h/.16)))))

def region_width(ob,low,high):
    points=[v.co for v in ob.data.vertices if low<=v.co.z<=high]
    return [max(v[i] for v in points)-min(v[i] for v in points) for i in range(2)]

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--source',required=True);ap.add_argument('--out',required=True)
    args=ap.parse_args(sys.argv[sys.argv.index('--')+1:]);source=Path(args.source);out=Path(args.out);out.mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(source/'refined-trees.blend'))
    previous=json.loads((source/'refinement-audit.json').read_text(encoding='utf-8'));records=[]
    for id in helper.IDS:
        pine='pine' in id;before=bpy.data.objects[id+'-refined-lod0'];before.name=id+'-before';tiers=[];counts=[]
        for level in range(3):
            old=before if level==0 else bpy.data.objects[id+'-refined-lod'+str(level)]
            ob=old.copy();ob.data=old.data.copy();bpy.context.scene.collection.objects.link(ob);ob.name=id+'-natural-lod'+str(level)
            ob.hide_render=False;ob.hide_set(False)
            for vertex in ob.data.vertices:vertex.co=deform(vertex.co,pine)
            ob.data.update();assert not ob.data.validate();tiers.append(ob)
            helper.export_geometry(ob,out/(id+'-lod'+str(level)+'.json'))
            record=dict(previous['assets'][helper.IDS.index(id)]['tiers'][level]);record['bounds']=[[min(v.co[a] for v in ob.data.vertices) for a in range(3)],[max(v.co[a] for v in ob.data.vertices) for a in range(3)]];counts.append(record)
        for view,yaw in [('front',-.5),('back',math.pi-.5)]:helper.review_pair(before,tiers[0],out/(id+'-trunk-before-after-'+view+'.png'),yaw)
        helper.review_pair(tiers[0],tiers[2],out/(id+'-natural-near-far.png'))
        records.append({'id':id,'tiers':counts,'proportions':{'sourceRevision':'286a9f5','rootWidthBefore':region_width(before,0,1.5),'rootWidthAfter':region_width(tiers[0],0,1.5),'trunkWidthBefore':region_width(before,3,4.5),'trunkWidthAfter':region_width(tiers[0],3,4.5)}})
    bpy.ops.wm.save_as_mainfile(filepath=str(out/'natural-trees.blend'))
    report={'assets':records,'textureFilesAdded':0,'method':'existing-canopy-refinement-with-natural-root-and-trunk-proportions','baseline':'286a9f5'}
    (out/'refinement-audit.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print('RESULT '+json.dumps(records))

if __name__=='__main__':main()
