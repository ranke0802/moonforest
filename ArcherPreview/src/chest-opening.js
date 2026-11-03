import {Mesh,TransformNode,VertexBuffer,VertexData,Vector3} from '@babylonjs/core';

export const CHEST_OPEN_ANGLE=-Math.PI*105/180;
export const CHEST_OPEN_SECONDS=.85;
const prepared=new WeakMap();

// The shipped chest is a single static mesh made from separate wooden/metal
// components. Move entire components, including the upper latch, so no triangle
// is cut and the closed shape retains its original normals and texture UVs.
export function prepareChestOpening(container){
  if(prepared.has(container))return prepared.get(container);
  const source=container.meshes.find(mesh=>mesh.getTotalVertices?.()>0);
  if(!source)throw new Error('Missing chest source');
  const positions=source.getVerticesData(VertexBuffer.PositionKind),normals=source.getVerticesData(VertexBuffer.NormalKind),uv=source.getVerticesData(VertexBuffer.UVKind),indices=source.getIndices(),count=positions.length/3,parent=Array.from({length:count},(_,i)=>i),canonical=new Map();
  const find=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;},join=(a,b)=>parent[find(a)]=find(b);
  let low=Infinity,high=-Infinity,back=Infinity;
  for(let i=0;i<count;i++){
    low=Math.min(low,positions[i*3+1]);high=Math.max(high,positions[i*3+1]);back=Math.min(back,positions[i*3+2]);
    const key=[0,1,2].map(a=>Math.round(positions[i*3+a]*1e5)).join(',');if(canonical.has(key))join(i,canonical.get(key));else canonical.set(key,i);
  }
  for(let i=0;i<indices.length;i+=3){join(indices[i],indices[i+1]);join(indices[i],indices[i+2]);}
  const height=high-low,seam=low+height*.69,components=new Map();
  for(let i=0;i<count;i++){const id=find(i),part=components.get(id)??{low:Infinity,high:-Infinity,minX:Infinity,maxX:-Infinity,minZ:Infinity,maxZ:-Infinity};part.low=Math.min(part.low,positions[i*3+1]);part.high=Math.max(part.high,positions[i*3+1]);part.minX=Math.min(part.minX,positions[i*3]);part.maxX=Math.max(part.maxX,positions[i*3]);part.minZ=Math.min(part.minZ,positions[i*3+2]);part.maxZ=Math.max(part.maxZ,positions[i*3+2]);components.set(id,part);}
  const isLid=new Map([...components].map(([id,p])=>[id,p.low>=seam-height*.005||(p.low>seam-height*.075&&(p.low+p.high)*.5>=seam)])),bodyIndices=[],lidIndices=[],capIndices=[];
  for(let i=0;i<indices.length;i+=3){
    const triangle=[indices[i],indices[i+1],indices[i+2]],part=components.get(find(triangle[0]));
    if(isLid.get(find(triangle[0]))){lidIndices.push(...triangle);continue;}
    const ys=triangle.map(id=>positions[id*3+1]),a=triangle[0]*3,b=triangle[1]*3,c=triangle[2]*3,ux=positions[b]-positions[a],uy=positions[b+1]-positions[a+1],uz=positions[b+2]-positions[a+2],vx=positions[c]-positions[a],vy=positions[c+1]-positions[a+1],vz=positions[c+2]-positions[a+2],nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;
    const cap=part.low<seam-height*.2&&part.maxX-part.minX>height*.6&&part.maxZ-part.minZ>height*.6&&Math.max(...ys)-Math.min(...ys)<height*.01&&Math.abs((ys[0]+ys[1]+ys[2])/3-seam)<height*.025&&ny>Math.hypot(nx,ny,nz)*.9;
    (cap?capIndices:bodyIndices).push(...triangle);
  }
  if(!bodyIndices.length||!lidIndices.length)throw new Error('Chest lid components could not be identified');
  const pivot=new Vector3(0,seam,back+height*.055),partition=(selected,offset)=>{
    const map=new Map(),p=[],n=[],t=[],faces=[];
    for(const original of selected){let next=map.get(original);if(next===undefined){next=map.size;map.set(original,next);for(let a=0;a<3;a++){p.push(positions[original*3+a]-offset[a]);n.push(normals[original*3+a]);}t.push(uv[original*2],uv[original*2+1]);}faces.push(next);}
    const data=new VertexData();data.positions=p;data.normals=n;data.uvs=t;data.indices=faces;return data;
  };
  const bodyData=partition(bodyIndices,[0,0,0]),lidData=partition(lidIndices,pivot.asArray()),scene=container.scene;
  // The original body has a solid top plate. Reuse its triangle budget for a
  // recessed wooden floor, and add only four inward walls (eight triangles).
  // The exterior stays byte-for-byte authored; all new UVs sample that plate.
  if(capIndices.length){
    const capVertices=[...new Set(capIndices)],xs=capVertices.map(id=>positions[id*3]),zs=capVertices.map(id=>positions[id*3+2]),minX=Math.min(...xs)*.94,maxX=Math.max(...xs)*.94,minZ=Math.min(...zs)*.94,maxZ=Math.max(...zs)*.94,floor=low+height*.24,corners=[[minX,minZ],[minX,maxZ],[maxX,maxZ],[maxX,minZ]],cornerUV=corners.map(([x,z])=>{let best=Infinity,chosen;for(const id of capVertices){const distance=(positions[id*3]-x)**2+(positions[id*3+2]-z)**2;if(distance<best){best=distance;chosen=id;}}return[uv[chosen*2],uv[chosen*2+1]];});
    bodyData.colors=Array.from({length:bodyData.positions.length/3},()=>[1,1,1,1]).flat();
    const add=(x,y,z,nx,ny,nz,u,v,tint)=>{const id=bodyData.positions.length/3;bodyData.positions.push(x,y,z);bodyData.normals.push(nx,ny,nz);bodyData.uvs.push(u,v);bodyData.colors.push(tint,tint,tint,1);return id;},center=add((minX+maxX)/2,floor,(minZ+maxZ)/2,0,1,0,cornerUV.reduce((s,v)=>s+v[0],0)/4,cornerUV.reduce((s,v)=>s+v[1],0)/4,.42),rim=[];
    const floorTriangles=capIndices.length/3;
    for(let side=0;side<4;side++){
      const steps=Math.floor(floorTriangles/4)+(side<floorTriangles%4?1:0),next=(side+1)%4;
      for(let step=0;step<steps;step++){const t=step/steps;rim.push(add(corners[side][0]*(1-t)+corners[next][0]*t,floor,corners[side][1]*(1-t)+corners[next][1]*t,0,1,0,cornerUV[side][0]*(1-t)+cornerUV[next][0]*t,cornerUV[side][1]*(1-t)+cornerUV[next][1]*t,.42));}
      const [x,z]=corners[side],[xx,zz]=corners[next],length=Math.hypot(xx-x,zz-z),nx=(zz-z)/length,nz=-(xx-x)/length,uv0=cornerUV[side],uv1=cornerUV[next],ids=[add(x,seam,z,nx,0,nz,...uv0,.65),add(xx,seam,zz,nx,0,nz,...uv1,.65),add(xx,floor,zz,nx,0,nz,...uv1,.5),add(x,floor,z,nx,0,nz,...uv0,.5)];bodyData.indices.push(ids[0],ids[1],ids[2],ids[0],ids[2],ids[3]);
    }
    for(let i=0;i<rim.length;i++)bodyData.indices.push(center,rim[i],rim[(i+1)%rim.length]);
  }
  // Keep the body/lid attribute layout identical. Babylon's shared ink
  // ShaderMaterial owns one draw wrapper: alternating VERTEXCOLOR on/off
  // otherwise re-requests cached effects and increments their refs every draw.
  // White leaves every authored lid texel and its opacity unchanged.
  if(bodyData.colors)lidData.colors=new Float32Array(lidData.positions.length/3*4).fill(1);
  const frame=new TransformNode('chest-lid-frame',scene);container.transformNodes.push(frame);scene.removeTransformNode(frame);frame.parent=source.parent;frame.position.copyFrom(source.position);frame.scaling.copyFrom(source.scaling);if(source.rotationQuaternion)frame.rotationQuaternion=source.rotationQuaternion.clone();else frame.rotation.copyFrom(source.rotation);
  const hinge=new TransformNode('chest-lid-hinge',scene);container.transformNodes.push(hinge);scene.removeTransformNode(hinge);hinge.parent=frame;hinge.position.copyFrom(pivot);hinge.metadata={chestLidHinge:true};
  const lid=new Mesh('chest-lid',scene);container.meshes.push(lid);scene.removeMesh(lid);lid.parent=hinge;lid.material=source.material;lid.isPickable=false;lid.metadata={chestLid:true};lidData.applyToMesh(lid);
  // Replace the original geometry only after both compact partitions exist.
  // Each original vertex belongs to one component; no shared full-mesh clone.
  const oldGeometry=source.geometry;oldGeometry?.releaseForMesh(source,true);bodyData.applyToMesh(source);source.metadata={...source.metadata,chestBody:true};
  container.geometries=container.geometries.filter(geometry=>geometry!==oldGeometry);container.geometries.push(source.geometry,lid.geometry);
  const result={bodyTriangles:bodyData.indices.length/3,lidTriangles:lidIndices.length/3,totalTriangles:(bodyData.indices.length+lidIndices.length)/3,originalTriangles:indices.length/3,recessedFloorTriangles:capIndices.length/3,addedTriangles:capIndices.length?8:0,vertices:source.getTotalVertices()+lid.getTotalVertices(),hinge:pivot.asArray()};prepared.set(container,result);return result;
}

export function createChestOpening(root,{opened=false}={}){
  const hinge=root.getChildTransformNodes().find(node=>node.metadata?.chestLidHinge);
  if(!hinge)throw new Error('Missing instanced chest hinge');
  const moving=[hinge,...hinge.getDescendants()],state={opened:false,active:false,progress:0,angle:0};
  const apply=(angle,freeze)=>{
    for(const node of moving)node.unfreezeWorldMatrix();hinge.rotation.x=angle;
    for(const node of moving){node.computeWorldMatrix(true);if(freeze)node.freezeWorldMatrix();}
    state.angle=angle;
  };
  const api={state,hinge,
    open({immediate=false}={}){if(state.opened)return false;state.opened=true;state.active=!immediate;state.progress=immediate?1:0;if(immediate)apply(CHEST_OPEN_ANGLE,true);return true;},
    advance(dt){if(!state.active)return false;state.progress=Math.min(1,state.progress+Math.max(0,Math.min(.05,dt))/CHEST_OPEN_SECONDS);state.active=state.progress<1;apply(CHEST_OPEN_ANGLE*(1-(1-state.progress)**3),!state.active);return state.active;}
  };
  if(opened)api.open({immediate:true});return api;
}
