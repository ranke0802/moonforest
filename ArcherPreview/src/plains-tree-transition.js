// Existing islands graduate from a few young woodland trees in the meadow to
// mixed oak/pine groups near the forest. Native portal copies are appended
// later and never changed. Positions, roots and collision envelopes stay fixed.
const plan=[
 ['meadow-oak-6','forest-01-sickly-oak',6.4,'meadow'],
 ['meadow-oak-7','forest-01-sickly-oak',5.7,'meadow'],
 ['grove-meadow-east-tree-0','forest-01-sickly-oak',5.2,'meadow'],
 ['grove-caravan-east-tree-3','forest-01-sickly-oak',5.3,'meadow'],
 ['grove-forest-outer-tree-0','forest-01-sickly-oak',6.0,'fringe'],
 ['grove-forest-outer-tree-2','forest-01-sickly-oak',5.8,'fringe'],
 ['meadow-oak-8','forest-01-sickly-oak',6.8,'fringe'],
 ['grove-forest-middle-tree-0','forest-01-sickly-oak',4.6,'woodland'],
 ['grove-forest-middle-tree-4','forest-01-sickly-oak',4.6,'woodland'],
 ['grove-forest-west-tree-0','forest-01-sickly-oak',4.6,'woodland'],
 ['grove-forest-west-tree-1','forest-01-sickly-oak',7.3,'woodland'],
 ['grove-forest-west-tree-4','forest-02-dead-tree',5.6,'woodland'],
 ['forest-east-55','forest-01-sickly-oak',8.4,'woodland'],
 ['forest-east-56','tree-02-slender-pine',10.2,'woodland'],
 ['forest-east-58','forest-01-sickly-oak',7.0,'woodland'],
 ['forest-east-59','tree-01-round-oak',10.6,'fringe'],
 ['forest-east-60','forest-01-sickly-oak',6.4,'fringe'],
 ['forest-east-62','tree-02-slender-pine',10.5,'fringe'],
 ['forest-east-64','forest-01-sickly-oak',5.8,'meadow'],
 ['forest-east-70','forest-01-sickly-oak',8.1,'woodland'],
 ['forest-east-72','forest-01-sickly-oak',7.3,'fringe'],
 ['forest-east-74','forest-01-sickly-oak',6.4,'fringe'],
 ['forest-east-76','tree-02-slender-pine',9.2,'meadow'],
 ['forest-east-78','tree-01-round-oak',9.8,'meadow'],
];
export const PLAINS_TREE_TRANSITION_PLAN=Object.freeze(plan.map(([id,asset,height,band])=>Object.freeze({id,asset,height,band})));
const byId=new Map(PLAINS_TREE_TRANSITION_PLAN.map(p=>[p.id,p]));
// Heights/radii are the existing forest and village authoring contracts. The
// cap fits the selected native trunk within the previous solid envelope.
const species={
 'forest-01-sickly-oak':{height:5.999999963468905,radius:.62},
 'forest-02-dead-tree':{height:6.000222004135139,radius:.48},
 'tree-02-slender-pine':{height:12,radius:.48},
 'tree-01-round-oak':{height:9,radius:.4},
};
export function applyPlainsTreeTransition(placements){
 for(const p of placements){const entry=byId.get(p.id);if(!entry||p.kind!=='tree'||p.forestBoundary||p.villageBoundary)continue;const source=species[entry.asset];
  p.asset=entry.asset;p.scale=Math.min(entry.height/source.height,p.colliderRadius/source.radius*.95);p.forestTransition=entry.band;
 }
 return placements;
}
