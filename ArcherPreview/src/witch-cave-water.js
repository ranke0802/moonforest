import {caveFlowRows} from './witch-cave-layout.js';

// All sections share their edge vertices, including the lip and falling face.
// Opaque painted water: no particles, refraction, extra textures or sort pass.
export function caveFlowGeometry(fall){
  const rows=caveFlowRows(fall),positions=[],indices=[];
  const dx=Math.cos(fall.yaw),dz=-Math.sin(fall.yaw);
  for(const [i,[x,y,z,width]]of rows.entries()){
    positions.push(x-dx*width/2,y,z-dz*width/2,x+dx*width/2,y,z+dz*width/2);
    if(i){const a=(i-1)*2,b=i*2;indices.push(a,b,b+1,a,b+1,a+1);}
  }
  return {positions,indices};
}
