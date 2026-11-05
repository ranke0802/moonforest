export function orderPoseNodes(nodes){
  const candidates=new Set(nodes),visited=new Set(),ordered=[];
  function visit(node){if(!candidates.has(node)||visited.has(node))return;visited.add(node);visit(node.parent);ordered.push(node);}
  for(const node of nodes)visit(node);
  return ordered;
}
// Root correction occurs within the same Babylon render ID. Invalidate each bone
// once in parent order; force=true recursively recomputes every ancestor per bone.
export function refreshPoseMatrices(nodes){for(const node of nodes){node.markAsDirty();node.computeWorldMatrix();}}

// Refresh a single imported branch after its external anchor was updated.
// Forcing the leaf recursively recomputes the same anchor and ancestors again.
export function refreshPoseBranch(node,anchor){
  const branch=[];
  for(let current=node;current&&current!==anchor;current=current.parent)branch.push(current);
  for(let i=branch.length-1;i>=0;i--){branch[i].markAsDirty();branch[i].computeWorldMatrix();}
}
