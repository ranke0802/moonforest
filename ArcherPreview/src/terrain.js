const clamp01=n=>Math.max(0,Math.min(1,n));
// Readable shoulders around a flat sparring circle. Broad hilltops retain
// smooth traversal while rising high enough to show in the default camera.
const MOUNDS=[
  [-6.6,1.0,6,6.5,1.35], [7,3.2,6.5,6.5,1.45],
  [-6.2,-7.2,6.5,6,1.25], [1,8.7,6.5,6,1.35], [5.6,-8.8,6,5.8,1.15],
  [-14,5,10,10,2], [14,10,11,10,1.8], [-9,-16,11,11,1.8], [8,-17,11,11,1.6], [0,18,11,11,2.1],
];
function forestHeight(x,z){
  let height=0;
  for(const [cx,cz,rx,rz,rise] of MOUNDS){const r2=((x-cx)/rx)**2+((z-cz)/rz)**2;if(r2<1)height+=rise*(1-r2)**2;}
  const distance=Math.max(0,Math.hypot(x,z)-4.4);
  const shoulder=.42*(distance-.5+.5*Math.exp(-2*distance));
  // Smooth minimum caps the climb out of the clearing without a sharp lip.
  return height>0&&shoulder>0?Math.pow(height**-6+shoulder**-6,-1/6):0;
}

export class TerrainHeightField {
  constructor({size=70,subdivisions=64,height=forestHeight}={}){
    this.size=size;this.subdivisions=subdivisions;this.step=size/subdivisions;this.half=size/2;
    this.surfaceHeight=null;
    const n=subdivisions+1;this.heights=new Float32Array(n*n);
    for(let row=0;row<n;row++)for(let col=0;col<n;col++)this.heights[row*n+col]=height(col*this.step-this.half,this.half-row*this.step);
  }
  heightAt(x,z){
    const n=this.subdivisions,stride=n+1;
    const gx=clamp01((x+this.half)/this.size)*n,gz=clamp01((this.half-z)/this.size)*n;
    const col=Math.min(n-1,Math.floor(gx)),row=Math.min(n-1,Math.floor(gz)),u=gx-col,v=gz-row,i=row*stride+col;
    const a=this.heights[i],b=this.heights[i+1],c=this.heights[i+stride],d=this.heights[i+stride+1];
    // The same a–d diagonal as Babylon's ground mesh, not bilinear height
    // interpolation (which could place feet above/below the visible triangle).
    const ground=u>=v?a+u*(b-a)+v*(d-b):a+v*(c-a)+u*(d-c);
    return this.surfaceHeight?.(x,z,ground)??ground;
  }
  place(position){position.y=this.heightAt(position.x,position.z);return position;}
}
