const clamp01=n=>Math.max(0,Math.min(1,n));
const smooth=n=>{const t=clamp01(n);return t*t*(3-2*t);};
// Broad, low rises leave the central sparring circle level. Outer hills frame
// the forest, while the playable area remains suitable for the authored clips.
const MOUNDS=[
  [-6.4,1.0,5.5,6.5,.42], [6.8,3.2,6,6.5,.50],
  [-5.7,-7.2,6.5,6,.42], [1,8.7,6.5,6,.46], [4.8,-8.8,6,5.8,.36],
  [-14,5,9,9,1.05], [14,10,10,9,.95], [-9,-16,10,10,.9], [8,-17,10,10,.8], [0,18,10,10,1.05],
];
function forestHeight(x,z){
  let height=0;
  for(const [cx,cz,rx,rz,rise] of MOUNDS){const r2=((x-cx)/rx)**2+((z-cz)/rz)**2;if(r2<1)height+=rise*(1-r2)**3;}
  return .6*height*smooth((Math.hypot(x,z)-4.4)/3.2);
}

export class TerrainHeightField {
  constructor({size=70,subdivisions=64,height=forestHeight}={}){
    this.size=size;this.subdivisions=subdivisions;this.step=size/subdivisions;this.half=size/2;
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
    return u>=v?a+u*(b-a)+v*(d-b):a+v*(c-a)+u*(d-c);
  }
  place(position){position.y=this.heightAt(position.x,position.z);return position;}
}
