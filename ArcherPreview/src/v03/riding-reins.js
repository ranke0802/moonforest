import {BoundingInfo, Matrix, Mesh, Vector3, VertexBuffer} from '@babylonjs/core';

// In the shipped head joint's bind coordinates, these points sit just outside
// the mouth corners (horse surface vertices 8168 and 8357).
const CHEEK_X=3.25, CHEEK_Y=18.3, CHEEK_Z=2.2;
const SPANS=7, RING_SIDES=10, CROSS_SECTION=4;
const STRAP_VERTICES=(SPANS+1)*CROSS_SECTION, SIDE_VERTICES=STRAP_VERTICES+RING_SIDES*2;
const SECTION=[[.004,0,1,0],[0,.010,0,1],[-.004,0,-1,0],[0,-.010,0,-1]];

export function createRidingReins(horse,rider,material){
  const head=horse.getDescendants(false,n=>n.name==='head')[0];
  const hands=['Left','Right'].map(side=>rider.getDescendants(false,n=>n.name==='mixamorig:'+side+'HandMiddle1')[0]);
  if(!head||!hands[0]||!hands[1])return null;
  const mesh=new Mesh('v03-riding-reins',horse.getScene());
  const positions=new Float32Array(SIDE_VERTICES*2*3),normals=[],colors=[],indices=[],ring=[];
  const inverse=new Matrix(),headLocal=new Matrix(),grip=new Vector3(),bit=new Vector3(),point=new Vector3();
  for(let i=0;i<RING_SIDES;i++){
    const a=i*2*Math.PI/RING_SIDES;
    ring.push([Math.cos(a),Math.sin(a)]);
  }
  for(let side=0;side<2;side++){
    const start=SIDE_VERTICES*side,sign=side===0?1:-1;
    for(let i=0;i<=SPANS;i++)for(let j=0;j<CROSS_SECTION;j++){
      normals.push(SECTION[j][2],SECTION[j][3],0);colors.push(.29,.16,.085,1);
      if(i===SPANS)continue;
      const a=start+i*CROSS_SECTION+j,b=start+i*CROSS_SECTION+(j+1)%CROSS_SECTION;
      indices.push(a,b,a+CROSS_SECTION,b,b+CROSS_SECTION,a+CROSS_SECTION);
    }
    for(let i=0;i<RING_SIDES;i++){
      normals.push(sign,0,0,sign,0,0);colors.push(.72,.55,.32,1,.72,.55,.32,1);
      const a=start+STRAP_VERTICES+2*i,b=start+STRAP_VERTICES+2*((i+1)%RING_SIDES);
      indices.push(a,a+1,b+1,a,b+1,b);
    }
  }
  mesh.setVerticesData(VertexBuffer.PositionKind,positions,true);
  mesh.setVerticesData(VertexBuffer.NormalKind,normals);
  mesh.setVerticesData(VertexBuffer.ColorKind,colors);mesh.setIndices(indices);
  mesh.parent=horse;mesh.material=material;mesh.receiveShadows=true;mesh.isPickable=false;mesh.setEnabled(false);
  mesh.setBoundingInfo(new BoundingInfo(new Vector3(-1,0,-.65),new Vector3(1,3.2,1.75)));
  let visible=false;
  return function update(){
    horse.computeWorldMatrix().invertToRef(inverse);
    head.computeWorldMatrix().multiplyToRef(inverse,headLocal);
    for(let side=0;side<2;side++){
      const sign=side===0?1:-1;
      // Refresh the hand after the seat correction moved its ancestor this frame.
      const hm=hands[side].computeWorldMatrix(true).m;
      Vector3.TransformCoordinatesFromFloatsToRef(hm[12],hm[13],hm[14],inverse,grip);
      Vector3.TransformCoordinatesFromFloatsToRef(sign*CHEEK_X,CHEEK_Y-.53,CHEEK_Z+.53,headLocal,bit);
      const sag=Math.min(.095,Vector3.Distance(grip,bit)*.10);
      let offset=side*SIDE_VERTICES*3;
      for(let i=0;i<=SPANS;i++){
        const t=i/SPANS,curve=4*t*(1-t);
        // The middle of the leather wraps around the neck and relaxes downward.
        const x=grip.x+(bit.x-grip.x)*t+sign*.125*curve;
        const y=grip.y+(bit.y-grip.y)*t-sag*curve;
        const z=grip.z+(bit.z-grip.z)*t;
        for(let j=0;j<CROSS_SECTION;j++){
          positions[offset++]=x+SECTION[j][0];positions[offset++]=y+SECTION[j][1];positions[offset++]=z;
        }
      }
      for(let i=0;i<RING_SIDES;i++)for(let j=0;j<2;j++){
        const radius=j===0?.95:.62;
        Vector3.TransformCoordinatesFromFloatsToRef(sign*CHEEK_X,CHEEK_Y+ring[i][0]*radius,CHEEK_Z+ring[i][1]*radius,headLocal,point);
        positions[offset++]=point.x;positions[offset++]=point.y;positions[offset++]=point.z;
      }
    }
    // The mount's post-animation callback reuses the same position buffer.
    mesh.updateVerticesData(VertexBuffer.PositionKind,positions,false);
    if(!visible){mesh.setEnabled(true);visible=true;}
  };
}
