"""Headless Blender BVH audit; no generated asset or runtime cost."""
import sys,json,array
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
folder=Path(sys.argv[sys.argv.index('--')+1])
records=json.loads((folder/'geometry.json').read_text())['records']
trees={};bounds={};edges={r['id']:set() for r in records}
for r in records:
    raw=(folder/r['filename']).read_bytes();p=array.array('f');p.frombytes(raw[:r['vertices']*12]);ix=array.array('I');ix.frombytes(raw[r['vertices']*12:])
    vertices=[Vector(p[i:i+3]) for i in range(0,len(p),3)]
    bounds[r['id']]=[[min(v[a] for v in vertices) for a in range(3)],[max(v[a] for v in vertices) for a in range(3)]]
    trees[r['id']]=BVHTree.FromPolygons(vertices,[ix[i:i+3] for i in range(0,len(ix),3)],all_triangles=True,epsilon=.005)
contacts=[]
for ai,a in enumerate(records):
    an=a['id'];alo,ahi=bounds[an]
    for b in records[ai+1:]:
        bn=b['id'];blo,bhi=bounds[bn]
        if any(ahi[k]+.01<blo[k] or bhi[k]+.01<alo[k] for k in range(3)):continue
        pairs=trees[an].overlap(trees[bn])
        if pairs:
            edges[an].add(bn);edges[bn].add(an);contacts.append([an,bn,len(pairs)])
anchors={r['id'] for r in records if r.get('anchor') or r.get('terrainPenetrating',0)>0}
connected=set(anchors);pending=list(anchors)
while pending:
    for n in edges[pending.pop()]-connected:connected.add(n);pending.append(n)
floating=[dict(r,bounds=bounds[r['id']],contacts=sorted(edges[r['id']])) for r in records if r['id'] not in connected]
result={'method':'actual near-LOD world triangles, production laboratory clipping, BVH surface overlaps; terrain vertex penetration or roof are anchors','epsilon':.005,'count':len(records)-1,'groundedOrConnected':len(connected)-1,'floating':floating,'contacts':contacts,'anchors':sorted(anchors),'browserAutomation':False}
(folder/'audit.json').write_text(json.dumps(result,indent=2),encoding='utf8')
print('ATTACHMENT_RESULT '+json.dumps({'count':result['count'],'groundedOrConnected':result['groundedOrConnected'],'floating':[r['id'] for r in floating]}))
